import { db } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { generatePractice } from "@/lib/generate";

export async function GET() {
  return handle(() => {
    const sets = db
      .prepare(
        `SELECT p.id, p.title, p.difficulty, p.question_types, p.question_count, p.course_id, p.topic_id, p.is_demo, p.created_at,
                c.name AS course_name, t.name AS topic_name,
                (SELECT COUNT(*) FROM questions q WHERE q.set_id = p.id) AS actual_count,
                (SELECT COUNT(DISTINCT a.question_id) FROM attempts a JOIN questions q2 ON q2.id = a.question_id WHERE q2.set_id = p.id) AS attempted,
                (SELECT COUNT(*) FROM attempts a JOIN questions q3 ON q3.id = a.question_id WHERE q3.set_id = p.id AND a.attempt_number = 1) AS first_attempts,
                (SELECT COUNT(*) FROM attempts a JOIN questions q4 ON q4.id = a.question_id WHERE q4.set_id = p.id AND a.attempt_number = 1 AND a.is_correct = 1) AS first_correct
         FROM practice_sets p LEFT JOIN courses c ON c.id = p.course_id LEFT JOIN topics t ON t.id = p.topic_id
         ORDER BY p.created_at DESC LIMIT 50`
      )
      .all();
    return { sets };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const mistake = b.mistake_id
      ? (db.prepare("SELECT description FROM mistakes WHERE id = ?").get(b.mistake_id as number) as { description: string } | undefined)?.description ?? null
      : (b.mistake_focus as string) ?? null;
    const res = await generatePractice({
      courseId: (b.course_id as number) || null,
      topicId: (b.topic_id as number) || null,
      difficulty: String(b.difficulty ?? "medium"),
      types: Array.isArray(b.types) ? b.types.map(String) : ["mixed"],
      count: Number(b.count ?? 5),
      mistakeFocus: mistake,
    });
    return res;
  });
}
