import { db } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { gradeAnswer, generateSimilarQuestion, type Feedback } from "@/lib/generate";

// POST { question_id, answer, attempt_number } → feedback
// POST { similar_to } → generate a similar question
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    if (b.similar_to) return generateSimilarQuestion(Number(b.similar_to));
    const fb: Feedback = await gradeAnswer({
      questionId: Number(b.question_id),
      answer: String(b.answer ?? ""),
      attemptNumber: Number(b.attempt_number ?? 1),
    });
    const q = db.prepare("SELECT misconception FROM questions WHERE id = ?").get(Number(b.question_id)) as { misconception: string | null } | undefined;
    void q;
    return fb;
  });
}
