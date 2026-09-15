import { db, nowISO, parseJSON } from "@/lib/db";
import { handle } from "@/lib/api";
import { courseTopics, effectiveMastery, buildStudentContext } from "@/lib/ai/context";
import { hasAI, chatComplete } from "@/lib/ai/client";

type P = { params: Promise<{ id: string }> };

// AI insights for a course — generated on demand (POST), deterministic fallback without AI.
export async function POST(_req: Request, { params }: P) {
  const { id } = await params;
  const courseId = Number(id);
  return handle(async () => {
    const course = db.prepare("SELECT name FROM courses WHERE id = ?").get(courseId) as { name: string } | undefined;
    if (!course) throw new Error("Course not found");
    const topics = courseTopics(courseId).map((t) => ({ name: t.name, mastery: effectiveMastery(t), status: t.status, last_studied_at: t.last_studied_at }));
    const mistakes = db.prepare("SELECT description, count FROM mistakes WHERE course_id = ? ORDER BY count DESC LIMIT 6").all(courseId);
    const assessments = db.prepare("SELECT title, due_date FROM assessments WHERE course_id = ? AND due_date >= date('now','-1 day') ORDER BY due_date LIMIT 3").all(courseId);
    const docCount = (db.prepare("SELECT COUNT(*) AS n FROM documents WHERE course_id = ?").get(courseId) as { n: number }).n;

    if (!hasAI()) {
      if (!topics.length)
        return { insights: `No topics yet for ${course.name}. Import a syllabus or worksheet and Studia will build the topic list automatically.`, generated: false };
      const weakest = [...topics].sort((a, b) => a.mastery - b.mastery).slice(0, 2);
      const strongest = [...topics].sort((a, b) => b.mastery - a.mastery)[0];
      const lines = [
        `You look strongest in **${strongest.name}** (${strongest.mastery}%).`,
        weakest.length ? `Focus next on **${weakest.map((w) => `${w.name} (${w.mastery}%)`).join("** and **")}**.` : "",
        mistakes.length ? `Recurring mistakes to watch: ${mistakes.map((m) => `${m.description} (×${m.count})`).join("; ")}.` : "",
        assessments.length ? `Coming up: ${assessments.map((a) => a.title).join(", ")}.` : "",
      ].filter(Boolean);
      return { insights: lines.join("\n\n"), generated: false };
    }

    const context = buildStudentContext({ courseId, charBudget: 5000 });
    const text = await chatComplete(
      [
        {
          role: "system",
          content:
            "You are Studia, a study coach. Given a student's course data, write 2-4 short insight paragraphs (max 120 words total): what they're doing well at, what needs work, and one concrete suggestion. Reference their actual data (topics, mastery, mistakes, upcoming assessments). Use markdown bold sparingly. No preamble.",
        },
        { role: "user", content: `Course: ${course.name}\n\n${context}\n\nDocuments in course: ${docCount}` },
      ],
      { temperature: 0.5, maxTokens: 400 }
    );
    void parseJSON;
    void nowISO;
    return { insights: text.trim(), generated: true };
  });
}
