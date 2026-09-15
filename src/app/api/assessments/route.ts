import { db, nowISO, daysUntil, parseJSON, todayLocal } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { assessmentReadiness } from "@/lib/mastery";
import { recommendedForAssessment, courseById } from "@/lib/planner";

export async function GET() {
  return handle(() => {
    const rows = db
      .prepare(
        `SELECT a.*, c.name AS course_name FROM assessments a LEFT JOIN courses c ON c.id = a.course_id
         ORDER BY a.due_date IS NULL, a.due_date`
      )
      .all() as Array<Record<string, unknown>>;
    const withMeta = rows.map((a) => {
      const topics = parseJSON<string[]>(a.topics as string, []);
      const r = a.course_id ? assessmentReadiness(a.course_id as number, topics) : { score: 0, hasTopics: false, weakTopics: [] };
      return {
        ...a,
        days_until: daysUntil(a.due_date as string),
        readiness: r.hasTopics ? r.score : null,
        weak_topics: r.weakTopics,
      };
    });
    return { assessments: withMeta };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const title = String(b.title ?? "").trim().slice(0, 160);
    if (!title) throw new Error("Title is required");
    const id = db
      .prepare(
        "INSERT INTO assessments (course_id, title, type, due_date, weighting, topics, format, required_materials, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        (b.course_id as number) || null,
        title,
        String(b.type ?? "test"),
        (b.due_date as string) || null,
        typeof b.weighting === "number" ? b.weighting : null,
        JSON.stringify(Array.isArray(b.topics) ? b.topics : String(b.topics ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)),
        String(b.format ?? ""),
        String(b.required_materials ?? ""),
        String(b.notes ?? ""),
        nowISO()
      ).lastInsertRowid as number;
    return { id };
  });
}
