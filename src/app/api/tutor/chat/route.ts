import { db, nowISO, getProfile, parseJSON } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { chatComplete, hasAI } from "@/lib/ai/client";
import { buildStudentContext, buildSourceBlock, retrieveChunks, upcomingAssessments } from "@/lib/ai/context";

export const TUTOR_MODES: Record<string, { label: string; instruction: string }> = {
  simple: { label: "Explain Simply", instruction: "Explain in the simplest possible terms, with everyday analogies and minimal jargon. Short sentences." },
  standard: { label: "Standard", instruction: "Explain at a normal classroom level for the student's grade — clear, structured, with one worked example if useful." },
  detailed: { label: "Detailed", instruction: "Give a thorough explanation with multiple examples, edge cases, and the reasoning behind each step." },
  step_by_step: { label: "Step-by-Step", instruction: "Break the explanation into clearly numbered sequential steps, checking understanding as you go." },
  exam: { label: "Exam Mode", instruction: "Focus on what the student needs for their assessment: expected answer formats, mark-earning steps, common traps, and timing tips." },
  teach_me: { label: "Teach Me", instruction: "Act as a Socratic tutor: ask the student guiding questions instead of lecturing. Start by probing what they already know, then build up with small questions. Only explain directly if they ask or after 2-3 failed attempts." },
};

// POST { conversation_id, message, mode, course_id? } → assistant reply (persisted)
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const message = String(b.message ?? "").trim();
    if (!message) throw new Error("Message is empty");
    const mode = TUTOR_MODES[String(b.mode ?? "standard")] ? String(b.mode) : "standard";
    const courseId = (b.course_id as number) || null;
    const conversationId = (b.conversation_id as number) || null;

    if (!hasAI())
      throw new Error(
        "AI is not configured. Add your API key, base URL and model in Settings → AI Provider — or load the demo data to see a sample conversation."
      );

    let convId = conversationId;
    if (!convId) {
      convId = db
        .prepare("INSERT INTO ai_conversations (title, mode, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(message.slice(0, 80), mode, nowISO(), nowISO()).lastInsertRowid as number;
    } else {
      db.prepare("UPDATE ai_conversations SET mode = ?, updated_at = ? WHERE id = ?").run(mode, nowISO(), convId);
    }

    // history (last 12 messages)
    const history = db
      .prepare("SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 12")
      .all(convId)
      .reverse() as Array<{ role: string; content: string }>;

    db.prepare("INSERT INTO ai_messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)").run(convId, message, nowISO());

    // Context selection: explicit course → else keyword match across course/topic names
    const lower = message.toLowerCase();
    let contextCourseId = courseId;
    if (!contextCourseId) {
      const courses = db.prepare("SELECT id, name FROM courses WHERE archived = 0").all() as Array<{ id: number; name: string }>;
      contextCourseId = courses.find((c) => lower.includes(c.name.toLowerCase()))?.id ?? null;
    }
    const topics = db.prepare("SELECT id, name, course_id FROM topics").all() as Array<{ id: number; name: string; course_id: number }>;
    const matchedTopic = topics.find((t) => lower.includes(t.name.toLowerCase()));
    if (!contextCourseId && matchedTopic) contextCourseId = matchedTopic.course_id;

    const chunks = retrieveChunks(message, contextCourseId, 6);
    const sources = buildSourceBlock(chunks, 3000);
    const assessments = upcomingAssessments(30);
    const focusAssessment = assessments.length
      ? `Next up: ${assessments[0].title} (${assessments[0].due_date ?? "no date"})`
      : "";

    const modeInfo = TUTOR_MODES[mode];
    const system = [
      "You are Studia, the student's personal AI tutor with full knowledge of their academic context. You are a combination of tutor, study coach, academic organizer and knowledge manager — NOT a generic chatbot.",
      "Behaviors:",
      "- Use the student's actual data (courses, topics, mastery, mistakes, upcoming assessments) to personalize every answer.",
      "- For math and science: teach the reasoning, not just final answers. Show method.",
      "- When answering from their uploaded material, say which document you used. Never invent teacher instructions, dates, or syllabus content. If unsure, say so.",
      "- Be encouraging but honest. Keep answers focused; use Markdown ($...$ for math).",
      modeInfo ? `- CURRENT EXPLANATION MODE — ${modeInfo.label}: ${modeInfo.instruction}` : "",
      "",
      "=== STUDENT'S ACADEMIC CONTEXT ===",
      buildStudentContext({ courseId: contextCourseId, topicNames: matchedTopic ? [matchedTopic.name] : [], charBudget: 7000 }),
      focusAssessment,
      sources ? `\n${sources}` : "",
      "=== END CONTEXT ===",
    ]
      .filter(Boolean)
      .join("\n");

    const reply = await chatComplete(
      [
        { role: "system", content: system },
        ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: message },
      ],
      { temperature: 0.5, maxTokens: 2200 }
    );

    const meta = JSON.stringify({
      mode,
      sources: [...new Set(chunks.map((c) => c.documentId))].map((id) => ({
        id,
        title: (db.prepare("SELECT title FROM documents WHERE id = ?").get(id) as { title: string } | undefined)?.title ?? `Document ${id}`,
      })),
    });
    db.prepare("INSERT INTO ai_messages (conversation_id, role, content, meta, created_at) VALUES (?, 'assistant', ?, ?, ?)").run(convId, reply, meta, nowISO());
    db.prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?").run(nowISO(), convId);

    let sourceTitles: Array<{ id: number; title: string }> = [];
    try {
      sourceTitles = parseJSON<{ sources: Array<{ id: number; title: string }> }>(meta, { sources: [] }).sources ?? [];
    } catch { /* ignore */ }
    return { conversationId: convId, reply, sources: sourceTitles };
  });
}

export async function GET() {
  // exposed so the client can check AI availability + modes
  return handle(() => ({
    modes: Object.entries(TUTOR_MODES).map(([id, m]) => ({ id, label: m.label })),
    aiReady: hasAI(),
    profile: getProfile()?.name ?? null,
  }));
}
