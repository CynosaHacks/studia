import { db, parseJSON } from "@/lib/db";
import { handle } from "@/lib/api";

export async function GET(req: Request) {
  return handle(() => {
    const month = new URL(req.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const from = `${month}-01`;
    const to = monthEnd(month);

    const assessments = db
      .prepare(
        `SELECT a.id, a.title, a.type, a.due_date, a.topics, a.course_id, c.name AS course_name, c.color
         FROM assessments a LEFT JOIN courses c ON c.id = a.course_id
         WHERE a.due_date >= ? AND a.due_date <= ? ORDER BY a.due_date`
      )
      .all(from, to) as Array<Record<string, unknown>>;

    const sessions = db
      .prepare(
        `SELECT s.id, s.plan_date, s.activity, s.status, s.kind, s.minutes, s.course_id, c.name AS course_name, c.color
         FROM study_sessions s LEFT JOIN courses c ON c.id = s.course_id
         WHERE s.plan_date >= ? AND s.plan_date <= ? ORDER BY s.plan_date`
      )
      .all(from, to) as Array<Record<string, unknown>>;

    return {
      month,
      assessments: assessments.map((a) => ({ ...a, topics: parseJSON<string[]>(a.topics as string, []) })),
      sessions,
    };
  });
}

function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d.getDate())}`;
}
