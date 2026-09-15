import { db, getProfile, parseJSON, daysUntil } from "../db";

// Structured academic memory: every AI call retrieves only the slices it needs.
// Never send the whole database.

export type TopicRow = {
  id: number;
  course_id: number;
  unit_id: number | null;
  name: string;
  mastery: number;
  status: string;
  last_studied_at: string | null;
};

export function listCourses() {
  return db
    .prepare("SELECT * FROM courses WHERE archived = 0 ORDER BY created_at")
    .all() as Array<Record<string, unknown>>;
}

export function courseTopics(courseId: number): TopicRow[] {
  return db
    .prepare("SELECT * FROM topics WHERE course_id = ? ORDER BY id")
    .all(courseId) as unknown as TopicRow[];
}

// Effective mastery = stored mastery with a recency decay, used as a study signal only.
export function effectiveMastery(t: TopicRow): number {
  let m = t.mastery ?? 0;
  if (t.last_studied_at) {
    const days = (Date.now() - new Date(t.last_studied_at).getTime()) / 86400000;
    if (days > 10) m -= Math.min(15, (days - 10) * 0.7);
  }
  return Math.max(0, Math.min(100, Math.round(m)));
}

export function courseMastery(courseId: number): number {
  const topics = courseTopics(courseId);
  if (!topics.length) return 0;
  return Math.round(
    topics.reduce((a, t) => a + effectiveMastery(t), 0) / topics.length
  );
}

// ---------- RAG: document chunk retrieval (FTS5 with LIKE fallback) ----------

function ftsSanitize(q: string): string {
  return q
    .replace(/["'()*:^{}[\]\\]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => `"${w}"`)
    .join(" OR ");
}

export function retrieveChunks(
  query: string,
  courseId: number | null,
  k = 6
): Array<{ documentId: number; content: string }> {
  if (!query.trim()) return [];
  const courseFilter = courseId ? "AND course_id = ?" : "";
  const params = courseId ? [courseId] : [];
  try {
    const match = ftsSanitize(query);
    if (match) {
      const rows = db
        .prepare(
          `SELECT document_id AS documentId, content FROM document_chunks_fts
           WHERE document_chunks_fts MATCH ? ${courseFilter}
           ORDER BY rank LIMIT ?`
        )
        .all(match, ...params, k) as Array<{ documentId: number; content: string }>;
      if (rows.length) return rows;
    }
  } catch {
    /* fall through to LIKE */
  }
  const words = query
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4);
  if (!words.length) return [];
  const like = words.map(() => "content LIKE ?").join(" AND ");
  const likeParams = words.map((w) => `%${w}%`);
  const rows = db
    .prepare(
      `SELECT document_id AS documentId, content FROM document_chunks
       WHERE ${like} ${courseFilter ? "AND course_id = ?" : ""} LIMIT ?`
    )
    .all(...likeParams, ...params, k) as Array<{ documentId: number; content: string }>;
  return rows;
}

export function docTitle(docId: number): string {
  const row = db.prepare("SELECT title FROM documents WHERE id = ?").get(docId) as
    | { title: string }
    | undefined;
  return row?.title ?? `Document #${docId}`;
}

// ---------- context blocks ----------

function fmtDate(d: string): string {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function upcomingAssessments(limitDays = 60) {
  const rows = db
    .prepare("SELECT * FROM assessments ORDER BY due_date IS NULL, due_date")
    .all() as Array<Record<string, unknown>>;
  return rows.filter((a) => {
    const d = daysUntil(a.due_date as string);
    return d !== null && d >= -3 && d <= limitDays;
  });
}

export function buildStudentContext(opts: {
  courseId?: number | null;
  topicNames?: string[];
  includeAssessments?: boolean;
  includeMistakes?: boolean;
  includeDocs?: boolean;
  charBudget?: number;
}): string {
  const p = getProfile();
  const parts: string[] = [];
  const budget = opts.charBudget ?? 9000;

  if (p) {
    const diff = parseJSON<string[]>(p.difficult_subjects as string, []);
    parts.push(
      [
        "STUDENT PROFILE",
        `- Name: ${p.name || "Student"}`,
        `- Grade/year level: ${p.grade_level || "unknown"}`,
        `- School year: ${p.school_year || "unknown"}`,
        `- Preferred explanation detail: ${p.explanation_detail}`,
        `- Prefers worked examples: ${p.prefer_examples ? "yes" : "no"}`,
        `- Prefers visual explanations: ${p.prefer_visual ? "yes" : "no"}`,
        `- Notes style: ${p.notes_style}`,
        `- Finds difficult: ${diff.join(", ") || "(none listed)"}`,
        `- Academic goals: ${p.goals || "(none listed)"}`,
        `- Daily study time: ${p.study_minutes_per_day} min`,
      ].join("\n")
    );
  }

  const courses = listCourses();
  const relevant = opts.courseId
    ? courses.filter((c) => c.id === opts.courseId)
    : courses;
  if (relevant.length) {
    const lines = ["COURSES & TOPICS (AI-estimated mastery %)"];
    for (const c of relevant) {
      const topics = courseTopics(c.id as number);
      const tstr = topics
        .slice(0, 14)
        .map(
          (t) =>
            `    - ${t.name}: ${effectiveMastery(t)}% (${t.status})${
              opts.topicNames?.some((n) => n.toLowerCase() === t.name.toLowerCase())
                ? "  ← currently relevant"
                : ""
            }`
        )
        .join("\n");
      lines.push(
        `- ${c.name}${c.teacher ? ` (teacher: ${c.teacher})` : ""}${tstr ? "\n" + tstr : "  (no topics yet)"}`
      );
    }
    parts.push(lines.join("\n"));
  }

  if (opts.includeAssessments !== false) {
    const ups = upcomingAssessments(90).slice(0, 8);
    if (ups.length) {
      parts.push(
        [
          "UPCOMING ASSESSMENTS",
          ...ups.map((a) => {
            const d = daysUntil(a.due_date as string);
            const topics = parseJSON<string[]>(a.topics as string, []);
            return `- ${a.title} (${a.type}) — ${
              d !== null ? (d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`) : "no date"
            } [${fmtDate(a.due_date as string)}], topics: ${topics.join(", ") || "unspecified"}`;
          }),
        ].join("\n")
      );
    }
  }

  if (opts.includeMistakes !== false) {
    const mistakeRows = (
      opts.courseId
        ? db.prepare("SELECT * FROM mistakes WHERE course_id = ? ORDER BY count DESC, last_seen_at DESC LIMIT 10").all(opts.courseId)
        : db.prepare("SELECT * FROM mistakes ORDER BY count DESC, last_seen_at DESC LIMIT 10").all()
    ) as Array<Record<string, unknown>>;
    if (mistakeRows.length) {
      const courseName = (id: unknown) =>
        (courses.find((c) => c.id === id) as { name?: string } | undefined)?.name ?? "?";
      parts.push(
        [
          "RECURRING MISTAKES (from practice history)",
          ...mistakeRows.map(
            (m) =>
              `- [${courseName(m.course_id)}] ${m.description} (seen ${m.count}×${m.tag ? `, tag: ${m.tag}` : ""})`
          ),
        ].join("\n")
      );
    }
  }

  let out = parts.join("\n\n");
  if (out.length > budget) out = out.slice(0, budget) + "\n…(truncated)";
  return out;
}

export function buildSourceBlock(
  chunks: Array<{ documentId: number; content: string }>,
  maxChars = 3500
): string {
  if (!chunks.length) return "";
  const seen = new Set<number>();
  const lines: string[] = ["RETRIEVED MATERIAL FROM THE STUDENT'S DOCUMENTS:"];
  let used = 0;
  for (const ch of chunks) {
    if (seen.has(ch.documentId)) continue;
    seen.add(ch.documentId);
    const piece = `"${docTitle(ch.documentId)}" → ${ch.content.slice(0, 700)}`;
    if (used + piece.length > maxChars) break;
    used += piece.length;
    lines.push(`[${ch.documentId}] ${piece}`);
    if (lines.length > 8) break;
  }
  return lines.join("\n");
}
