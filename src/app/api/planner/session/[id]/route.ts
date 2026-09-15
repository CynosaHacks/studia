import { db, nowISO } from "@/lib/db";
import { handle, readBody } from "@/lib/api";

type P = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: P) {
  const { id } = await params;
  return handle(async () => {
    const b = await readBody(req);
    const sets: Array<[string, string | number]> = [];
    if (typeof b.status === "string" && ["planned", "done", "skipped"].includes(b.status)) sets.push(["status", b.status]);
    if (typeof b.minutes === "number") sets.push(["minutes", Math.max(5, Math.min(180, b.minutes))]);
    if (typeof b.activity === "string") sets.push(["activity", b.activity.slice(0, 200)]);
    if (sets.length) {
      const frag = sets.map(([k]) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE study_sessions SET ${frag} WHERE id = ?`).run(...sets.map(([, v]) => v), Number(id));
    }
    return { ok: true };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    db.prepare("DELETE FROM study_sessions WHERE id = ?").run(Number(id));
    return { ok: true };
  });
}

// POST: manually add a session to a day
export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  void id;
  return handle(async () => {
    const b = await readBody(req);
    const sid = db
      .prepare("INSERT INTO study_sessions (course_id, topic_id, plan_date, activity, kind, minutes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)")
      .run(
        (b.course_id as number) || null,
        (b.topic_id as number) || null,
        String(b.date),
        String(b.activity ?? "Study session").slice(0, 200),
        String(b.kind ?? "review"),
        Math.max(5, Math.min(180, Number(b.minutes ?? 15))),
        nowISO()
      ).lastInsertRowid as number;
    return { id: sid };
  });
}
