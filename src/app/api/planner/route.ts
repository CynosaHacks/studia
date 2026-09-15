import { db, todayLocal } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { generatePlan, savePlan, todayPlanStatus } from "@/lib/planner";

export async function GET(req: Request) {
  return handle(() => {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? todayLocal();
    const sessions = db
      .prepare(
        `SELECT s.*, c.name AS course_name, t.name AS topic_name FROM study_sessions s
         LEFT JOIN courses c ON c.id = s.course_id LEFT JOIN topics t ON t.id = s.topic_id
         WHERE s.plan_date = ? ORDER BY s.id`
      )
      .all(date);
    return { date, sessions, status: todayPlanStatus(date) };
  });
}

// POST { date, minutes, useAI } → generate & save plan
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const date = String(b.date ?? todayLocal());
    const minutes = Math.max(10, Math.min(300, Number(b.minutes ?? 45)));
    const items = await generatePlan(date, minutes, b.useAI !== false);
    savePlan(date, items);
    return { ok: true, count: items.length };
  });
}
