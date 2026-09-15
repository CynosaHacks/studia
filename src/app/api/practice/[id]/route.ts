import { db, parseJSON } from "@/lib/db";
import { handle, fail } from "@/lib/api";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    const set = db
      .prepare(
        `SELECT p.*, c.name AS course_name, t.name AS topic_name FROM practice_sets p
         LEFT JOIN courses c ON c.id = p.course_id LEFT JOIN topics t ON t.id = p.topic_id WHERE p.id = ?`
      )
      .get(Number(id)) as Record<string, unknown> | undefined;
    if (!set) return fail("Set not found", 404);
    const questions = (
      db.prepare("SELECT * FROM questions WHERE set_id = ? ORDER BY id").all(Number(id)) as Array<Record<string, unknown>>
    ).map((q) => ({
      ...q,
      choices: parseJSON<string[] | null>(q.choices as string, null),
    }));
    const attempts = db
      .prepare(
        `SELECT a.* FROM attempts a JOIN questions q ON q.id = a.question_id WHERE q.set_id = ? ORDER BY a.created_at`
      )
      .all(Number(id));
    return { set, questions, attempts };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    db.prepare("DELETE FROM practice_sets WHERE id = ?").run(Number(id));
    return { ok: true };
  });
}
