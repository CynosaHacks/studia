import { db, nowISO, daysUntil, parseJSON } from "@/lib/db";
import { handle, readBody, fail } from "@/lib/api";
import { assessmentReadiness } from "@/lib/mastery";
import { recommendedForAssessment } from "@/lib/planner";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    const a = db
      .prepare("SELECT a.*, c.name AS course_name, c.color FROM assessments a LEFT JOIN courses c ON c.id = a.course_id WHERE a.id = ?")
      .get(Number(id)) as Record<string, unknown> | undefined;
    if (!a) return fail("Assessment not found", 404);
    const topics = parseJSON<string[]>(a.topics as string, []);
    const r = a.course_id ? assessmentReadiness(a.course_id as number, topics) : { score: 0, hasTopics: false, weakTopics: [] };
    const documents = db
      .prepare("SELECT id, title, doc_type, status FROM documents WHERE course_id = ? ORDER BY created_at DESC LIMIT 20")
      .all(a.course_id as number);
    const topicRows = a.course_id
      ? (db.prepare("SELECT id, name, mastery, last_studied_at FROM topics WHERE course_id = ?").all(a.course_id as number) as Array<{ id: number; name: string; mastery: number; last_studied_at: string | null }>)
      : [];
    const topicDetail = (topics.length ? topics : topicRows.map((t) => t.name)).map((name) => {
      const t = topicRows.find((x) => x.name.toLowerCase() === name.toLowerCase());
      return { name, mastery: t?.mastery ?? 0, topicId: t?.id ?? null };
    });
    const plan = recommendedForAssessment({ id: a.id as number, course_id: a.course_id as number, title: a.title as string, type: a.type as string, due_date: a.due_date as string, topics: a.topics as string });
    return {
      assessment: { ...a, days_until: daysUntil(a.due_date as string), readiness: r.hasTopics ? r.score : null, weak_topics: r.weakTopics, has_topics: r.hasTopics },
      topicDetail,
      documents,
      plan,
    };
  });
}

export async function PATCH(req: Request, { params }: P) {
  const { id } = await params;
  return handle(async () => {
    const b = await readBody(req);
    const sets: Array<[string, string | number | null]> = [];
    if (typeof b.title === "string") sets.push(["title", b.title.slice(0, 160)]);
    if (typeof b.type === "string") sets.push(["type", b.type]);
    if (b.due_date !== undefined) sets.push(["due_date", (b.due_date as string) || null]);
    if (b.weighting !== undefined) sets.push(["weighting", typeof b.weighting === "number" ? b.weighting : null]);
    if (b.topics !== undefined)
      sets.push(["topics", JSON.stringify(Array.isArray(b.topics) ? b.topics : String(b.topics).split(",").map((s: string) => s.trim()).filter(Boolean))]);
    if (typeof b.format === "string") sets.push(["format", b.format]);
    if (typeof b.required_materials === "string") sets.push(["required_materials", b.required_materials]);
    if (typeof b.notes === "string") sets.push(["notes", b.notes]);
    if (sets.length) {
      const frag = sets.map(([k]) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE assessments SET ${frag} WHERE id = ?`).run(...sets.map(([, v]) => v), Number(id));
    }
    return { ok: true };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    db.prepare("DELETE FROM assessments WHERE id = ?").run(Number(id));
    return { ok: true };
  });
}
