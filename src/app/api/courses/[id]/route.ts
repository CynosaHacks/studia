import { db, nowISO, parseJSON, daysUntil } from "@/lib/db";
import { handle, readBody, fail } from "@/lib/api";
import { courseTopics, effectiveMastery } from "@/lib/ai/context";
import { assessmentReadiness } from "@/lib/mastery";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  const courseId = Number(id);
  return handle(() => {
    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId) as Record<string, unknown> | undefined;
    if (!course) throw new Error("Course not found");
    const units = db.prepare("SELECT * FROM units WHERE course_id = ? ORDER BY position, id").all(courseId);
    const topics = courseTopics(courseId).map((t) => ({ ...t, effective_mastery: effectiveMastery(t) }));
    const documents = db
      .prepare("SELECT id, title, doc_type, status, summary, size, file_ext, is_demo, created_at FROM documents WHERE course_id = ? ORDER BY created_at DESC")
      .all(courseId);
    const notes = db
      .prepare("SELECT id, title, kind, updated_at, is_demo FROM notes WHERE course_id = ? ORDER BY updated_at DESC")
      .all(courseId);
    const decks = db
      .prepare("SELECT id, title, (SELECT COUNT(*) FROM flashcards WHERE deck_id = flashcard_decks.id) AS card_count FROM flashcard_decks WHERE course_id = ? ORDER BY created_at DESC")
      .all(courseId);
    const sets = db
      .prepare("SELECT id, title, difficulty, question_count, created_at, (SELECT COUNT(*) FROM questions WHERE set_id = practice_sets.id) AS n FROM practice_sets WHERE course_id = ? ORDER BY created_at DESC LIMIT 10")
      .all(courseId);
    const assessments = (
      db.prepare("SELECT * FROM assessments WHERE course_id = ? ORDER BY due_date IS NULL, due_date").all(courseId) as Array<Record<string, unknown>>
    ).map((a) => {
      const topicsA = parseJSON<string[]>(a.topics as string, []);
      const r = assessmentReadiness(courseId, topicsA);
      return { ...a, days_until: daysUntil(a.due_date as string), readiness: r.hasTopics ? r.score : null, weak_topics: r.weakTopics };
    });
    const mistakes = db
      .prepare("SELECT * FROM mistakes WHERE course_id = ? ORDER BY count DESC, last_seen_at DESC LIMIT 8")
      .all(courseId);
    return { course, units, topics, documents, notes, decks, sets, assessments, mistakes };
  });
}

export async function PATCH(req: Request, { params }: P) {
  const { id } = await params;
  const courseId = Number(id);
  return handle(async () => {
    const b = await readBody(req);
    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
    if (!course) return fail("Course not found", 404);
    const fields: Array<[string, string]> = [];
    if (typeof b.name === "string" && b.name.trim()) fields.push(["name", b.name.trim().slice(0, 80)]);
    if (typeof b.teacher === "string") fields.push(["teacher", b.teacher.slice(0, 80)]);
    if (typeof b.description === "string") fields.push(["description", b.description.slice(0, 500)]);
    if (typeof b.color === "string") fields.push(["color", b.color.slice(0, 20)]);
    if (fields.length) {
      const frag = fields.map(([k]) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE courses SET ${frag} WHERE id = ?`).run(...fields.map(([, v]) => v), courseId);
    }
    return { ok: true };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  const courseId = Number(id);
  return handle(() => {
    db.prepare("DELETE FROM document_chunks_fts WHERE course_id = ?").run(courseId);
    db.prepare("DELETE FROM courses WHERE id = ?").run(courseId);
    return { ok: true };
  });
}

// Add a topic to the course
export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  const courseId = Number(id);
  return handle(async () => {
    const b = await readBody(req);
    const name = String(b.name ?? "").trim().slice(0, 120);
    if (!name) throw new Error("Topic name is required");
    const unitId =
      (typeof b.unit_id === "number" ? b.unit_id : null) ??
      (db.prepare("SELECT id FROM units WHERE course_id = ? AND status = 'current' ORDER BY position LIMIT 1").get(courseId) as { id: number } | undefined)?.id ??
      null;
    const existing = db.prepare("SELECT id FROM topics WHERE course_id = ? AND name = ?").get(courseId, name);
    if (existing) return { ok: true, duplicate: true };
    const topicId = db
      .prepare("INSERT INTO topics (course_id, unit_id, name, status, created_at) VALUES (?, ?, ?, 'in_progress', ?)")
      .run(courseId, unitId, name, nowISO()).lastInsertRowid as number;
    return { id: topicId };
  });
}
