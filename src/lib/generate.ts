import { db, getProfile, parseJSON, nowISO } from "./db";
import { chatJSON, hasAI, AIError } from "./ai/client";
import { buildStudentContext, buildSourceBlock, retrieveChunks, courseTopics, effectiveMastery } from "./ai/context";
import { recordMistake, masteryFromAttempt } from "./mastery";

// ---------- shared grounding helpers ----------

function scopeText(opts: { courseId?: number | null; topicId?: number | null; documentId?: number | null; keywords?: string }): {
  context: string; sources: string; sourceList: Array<{ id: number; title: string }>;
} {
  const topicName = opts.topicId
    ? (db.prepare("SELECT name FROM topics WHERE id = ?").get(opts.topicId) as { name: string } | undefined)?.name
    : null;
  const context = buildStudentContext({
    courseId: opts.courseId ?? undefined,
    topicNames: topicName ? [topicName] : [],
    includeAssessments: false,
    includeMistakes: true,
    charBudget: 6000,
  });

  let chunks: Array<{ documentId: number; content: string }> = [];
  if (opts.documentId) {
    const rows = db
      .prepare("SELECT document_id AS documentId, content FROM document_chunks WHERE document_id = ? ORDER BY chunk_index LIMIT 8")
      .all(opts.documentId) as Array<{ documentId: number; content: string }>;
    chunks = rows;
  } else if (opts.keywords) {
    chunks = retrieveChunks(opts.keywords, opts.courseId ?? null, 8);
  } else if (opts.keywords) {
    chunks = retrieveChunks(opts.keywords, opts.courseId ?? null, 6);
  }

  const sourceList = [...new Set(chunks.map((c) => c.documentId))].map((id) => ({
    id,
    title: (db.prepare("SELECT title FROM documents WHERE id = ?").get(id) as { title: string } | undefined)?.title ?? `Document ${id}`,
  }));
  const sources = buildSourceBlock(chunks, 4000);
  return { context, sources, sourceList };
}

export function requireAI(): void {
  if (!hasAI())
    throw new AIError(
      "AI is not configured. Add your API key, base URL and model in Settings → AI Provider — or load the demo data to explore without AI."
    );
}

// ---------- notes ----------

export const NOTE_KINDS = [
  { id: "summary", label: "Quick summary" },
  { id: "detailed", label: "Detailed notes" },
  { id: "exam", label: "Exam notes" },
  { id: "study_guide", label: "Study guide" },
  { id: "cheat_sheet", label: "Cheat sheet" },
  { id: "definitions", label: "Key definitions" },
  { id: "formulas", label: "Important formulas" },
  { id: "common_mistakes", label: "Common mistakes" },
  { id: "examples", label: "Worked examples" },
  { id: "step_by_step", label: "Step-by-step explanations" },
] as const;

export async function generateNotes(opts: {
  courseId?: number | null;
  topicId?: number | null;
  documentId?: number | null;
  kind: string;
}): Promise<{ id: number; title: string }> {
  requireAI();
  const p = getProfile();
  const kindLabel = NOTE_KINDS.find((k) => k.id === opts.kind)?.label ?? "Summary";
  const topicName = opts.topicId
    ? (db.prepare("SELECT name FROM topics WHERE id = ?").get(opts.topicId) as { name: string } | undefined)?.name
    : null;
  const docTitle = opts.documentId
    ? (db.prepare("SELECT title FROM documents WHERE id = ?").get(opts.documentId) as { title: string } | undefined)?.title
    : null;
  const courseName = opts.courseId
    ? (db.prepare("SELECT name FROM courses WHERE id = ?").get(opts.courseId) as { name: string } | undefined)?.name
    : null;

  const subject = docTitle ?? topicName ?? courseName ?? "my current studies";
  const { context, sources, sourceList } = scopeText({
    courseId: opts.courseId,
    topicId: opts.topicId,
    documentId: opts.documentId,
    keywords: topicName ?? undefined,
  });

  const styleHint = p
    ? `The student is in ${p.grade_level || "school"}. Preferred note style: ${p.notes_style}. Preferred detail: ${p.explanation_detail}. ${p.prefer_examples ? "Include worked examples." : ""} ${p.prefer_visual ? "Suggest simple text-based diagrams/tables where helpful." : ""}`
    : "";

  const content = await chatJSON<{ title: string; markdown: string }>(
    [
      {
        role: "system",
        content: `You are Studia, an expert study-notes generator for school students. Produce notes in clean Markdown (headings, bullet lists, tables, $...$ for inline math). When you use facts that come from the student's own material, open that section with the marker "> [From your material]" and when you add outside explanation use "> [Additional explanation]". Never claim teacher instructions or dates that are not in the material. Reply ONLY JSON: {"title": "...", "markdown": "..."}`,
      },
      {
        role: "user",
        content: `Create "${kindLabel}" notes about: ${subject}.\n${styleHint}\n\n${context}\n\n${sources || "(no uploaded material matched — rely on the topic list and note that these are general notes)"}\n\nKeep it genuinely useful for revision. If kind is cheat_sheet, make it dense and scannable.`,
      },
    ],
    { temperature: 0.4, maxTokens: 3500 }
  );

  const title = (content.title || `${kindLabel}: ${subject}`).slice(0, 160);
  const id = db
    .prepare(
      "INSERT INTO notes (course_id, topic_id, document_id, title, kind, content, grounding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      opts.courseId ?? null,
      opts.topicId ?? null,
      opts.documentId ?? null,
      title,
      opts.kind,
      content.markdown ?? content.title ?? "",
      JSON.stringify(sourceList),
      nowISO(),
      nowISO()
    ).lastInsertRowid as number;
  return { id, title };
}

// ---------- flashcards ----------

export async function generateFlashcards(opts: {
  courseId?: number | null;
  topicId?: number | null;
  documentId?: number | null;
  count: number;
  types: string[]; // definition, question_answer, formula, fill_blank, application, exam_style, mixed
}): Promise<{ deckId: number; created: number }> {
  requireAI();
  const count = Math.max(3, Math.min(80, opts.count));
  const topicName = opts.topicId
    ? (db.prepare("SELECT name FROM topics WHERE id = ?").get(opts.topicId) as { name: string } | undefined)?.name
    : null;
  const courseName = opts.courseId
    ? (db.prepare("SELECT name FROM courses WHERE id = ?").get(opts.courseId) as { name: string } | undefined)?.name
    : null;
  const { context, sources } = scopeText({ courseId: opts.courseId, topicId: opts.topicId, documentId: opts.documentId, keywords: topicName ?? undefined });

  const res = await chatJSON<{ cards: Array<{ front: string; back: string; type: string }> }>(
    [
      {
        role: "system",
        content:
          'You generate study flashcards. Reply ONLY JSON: {"cards":[{"front":"...","back":"...","type":"definition|question_answer|formula|fill_blank|application|exam_style"}]}. Fronts must be self-contained questions/prompts. Backs concise but complete. Ground in the student\'s material when provided. Do not repeat near-identical cards.',
      },
      {
        role: "user",
        content: `Make ${count} flashcards for ${topicName ?? courseName ?? "the student's current topic"}. Requested types: ${opts.types.join(", ") || "mixed"}.\n\n${context}\n\n${sources || ""}`,
      },
    ],
    { temperature: 0.5, maxTokens: 4000 }
  );

  const cards = (res.cards ?? []).slice(0, count).filter((c) => c.front && c.back);
  if (!cards.length) throw new AIError("The AI didn't return any usable cards. Try again.");

  const deckTitle = `${topicName ?? courseName ?? "Study"} — generated deck`;
  const deckId = db
    .prepare("INSERT INTO flashcard_decks (course_id, topic_id, title, created_at) VALUES (?, ?, ?, ?)")
    .run(opts.courseId ?? null, opts.topicId ?? null, deckTitle.slice(0, 140), nowISO()).lastInsertRowid as number;
  const ins = db.prepare(
    "INSERT INTO flashcards (deck_id, course_id, topic_id, front, back, card_type, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const now = nowISO();
  for (const c of cards) ins.run(deckId, opts.courseId ?? null, opts.topicId ?? null, c.front, c.back, c.type ?? "definition", now, now);
  return { deckId, created: cards.length };
}

// ---------- practice ----------

export async function generatePractice(opts: {
  courseId?: number | null;
  topicId?: number | null;
  difficulty: string; // easy|medium|hard|exam|challenge
  types: string[];    // multiple_choice|short_answer|extended_response|calculation|problem_solving|true_false|mixed
  count: number;
  mistakeFocus?: string | null;
}): Promise<{ setId: number; created: number }> {
  requireAI();
  const count = Math.max(1, Math.min(30, opts.count));
  const topicName = opts.topicId
    ? (db.prepare("SELECT name FROM topics WHERE id = ?").get(opts.topicId) as { name: string } | undefined)?.name
    : null;
  const courseName = opts.courseId
    ? (db.prepare("SELECT name FROM courses WHERE id = ?").get(opts.courseId) as { name: string } | undefined)?.name
    : null;
  const { context, sources } = scopeText({ courseId: opts.courseId, topicId: opts.topicId, keywords: opts.mistakeFocus ?? topicName ?? undefined });

  const grade = getProfile()?.grade_level ?? "high school";
  const res = await chatJSON<{
    title: string;
    questions: Array<{
      type: string; difficulty: string; prompt: string;
      choices: string[] | null; answer: string; explanation: string;
      hint: string; misconception: string;
    }>;
  }>(
    [
      {
        role: "system",
        content: `You generate practice questions for a ${grade} student. Reply ONLY JSON:
{"title":"...","questions":[{"type":"multiple_choice|short_answer|extended_response|calculation|problem_solving|true_false","difficulty":"easy|medium|hard|exam|challenge","prompt":"...","choices":["A) ...","B) ..."] or null,"answer":"exact correct answer (for multiple_choice use the full choice text)","explanation":"clear worked explanation","hint":"a nudge that does NOT give the answer away","misconception":"the likely mistake/misconception this question targets"}]}
Rules: questions must be solvable from the prompt alone; math should use plain text or $...$ LaTeX; multiple_choice has exactly 4 choices; never make the answer guessable from the prompt; explanation must TEACH the method.`,
      },
      {
        role: "user",
        content: `Create ${count} ${opts.difficulty} questions (${opts.types.join(", ") || "mixed"}) on ${topicName ?? courseName ?? "their current topics"}.${opts.mistakeFocus ? ` The student repeatedly struggles with: "${opts.mistakeFocus}" — target this specific weakness.` : ""}\n\n${context}\n\n${sources || ""}`,
      },
    ],
    { temperature: 0.6, maxTokens: 4000 }
  );

  const qs = (res.questions ?? []).slice(0, count).filter((q) => q.prompt && q.answer !== undefined);
  if (!qs.length) throw new AIError("The AI didn't return any usable questions. Try again.");

  const title = (res.title || `${topicName ?? courseName ?? "Practice"} — ${opts.difficulty}`).slice(0, 160);
  const setId = db
    .prepare("INSERT INTO practice_sets (course_id, topic_id, title, difficulty, question_types, question_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(opts.courseId ?? null, opts.topicId ?? null, title, opts.difficulty, opts.types.join(",") || "mixed", qs.length, nowISO()).lastInsertRowid as number;
  const ins = db.prepare(
    "INSERT INTO questions (set_id, course_id, topic_id, type, difficulty, prompt, choices, answer, explanation, hint, misconception, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const q of qs) {
    ins.run(setId, opts.courseId ?? null, opts.topicId ?? null, q.type, q.difficulty ?? opts.difficulty, q.prompt, q.choices ? JSON.stringify(q.choices) : null, String(q.answer), q.explanation ?? "", q.hint ?? "", q.misconception ?? "", nowISO());
  }
  return { setId, created: qs.length };
}

export type Feedback = {
  correct: boolean;
  score: number; // 0-100
  brief: string;           // shown immediately
  misconception: { tag: string; description: string } | null;
  hint: string | null;     // shown on attempt 1 when wrong
  fullExplanation: string | null; // attempt >= 2 or when correct
  workedSolution: string | null;
};

export async function gradeAnswer(opts: {
  questionId: number;
  answer: string;
  attemptNumber: number;
}): Promise<Feedback> {
  const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(opts.questionId) as Record<string, unknown> | undefined;
  if (!q) throw new Error("Question not found");

  // Objective fast-path for multiple choice / true-false
  const choices = parseJSON<string[] | null>(q.choices as string, null);
  const objective = q.type === "multiple_choice" || q.type === "true_false";
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const locallyCorrect = norm(String(q.answer)) === norm(opts.answer);

  const p = getProfile();
  const grade = p?.grade_level ?? "high school";
  const attempt = Math.max(1, opts.attemptNumber);

  let fb: Feedback;
  if (hasAI()) {
    const context = buildStudentContext({ courseId: (q.course_id as number) ?? null, charBudget: 3000 });
    fb = await chatJSON<Feedback>(
      [
        {
          role: "system",
          content: `You grade a ${grade} student's answer and coach them. Reply ONLY JSON:
{"correct":bool,"score":0-100,"brief":"1-2 sentences","misconception":{"tag":"short-slug","description":"what went wrong conceptually"} or null,"hint":"if wrong and attempt 1: a nudge, never the answer","fullExplanation":"if wrong and attempt >= 2, OR if correct: teach the full reasoning","workedSolution":"step-by-step correct solution"}
If attempt 1 and wrong: brief identifies WHERE reasoning went wrong + misconception; hint must NOT reveal the answer; fullExplanation can be null (student gets another try). If attempt >= 2 and wrong: fullExplanation must teach the concept properly. If correct: brief confirms why it's right, fullExplanation reinforces the key idea.`,
        },
        {
          role: "user",
          content: `QUESTION (${q.type}, ${q.difficulty}):\n${q.prompt}\n${choices ? `\nChoices: ${JSON.stringify(choices)}` : ""}\nCORRECT ANSWER: ${q.answer}\nSTUDENT'S ANSWER (attempt ${attempt}): ${opts.answer}\n\nStudent context:\n${context}`,
        },
      ],
      { temperature: 0.3, maxTokens: 1500 }
    );
  } else {
    // No AI: deterministic feedback from stored explanation
    fb = {
      correct: locallyCorrect,
      score: locallyCorrect ? 100 : objective ? 0 : 50,
      brief: locallyCorrect
        ? "Correct! " + String(q.explanation ?? "").slice(0, 200)
        : "Not quite — compare your answer with the expected one and check the explanation.",
      misconception: locallyCorrect ? null : q.misconception ? { tag: String(q.misconception), description: String(q.misconception) } : null,
      hint: locallyCorrect ? null : (q.hint as string) ?? null,
      fullExplanation: locallyCorrect || attempt >= 2 ? (q.explanation as string) ?? null : null,
      workedSolution: locallyCorrect || attempt >= 2 ? String(q.answer) : null,
    };
  }

  // Trust local grading for strictly objective types
  if (objective && fb.correct !== locallyCorrect) {
    fb.correct = locallyCorrect;
    fb.score = locallyCorrect ? Math.max(fb.score, 80) : Math.min(fb.score, 30);
  }

  // Persist attempt + update mastery/mistakes
  const attemptNumber = attempt;
  db.prepare(
    "INSERT INTO attempts (question_id, course_id, topic_id, student_answer, is_correct, score, feedback, attempt_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    opts.questionId,
    (q.course_id as number) ?? null,
    (q.topic_id as number) ?? null,
    opts.answer,
    fb.correct ? 1 : 0,
    fb.score,
    JSON.stringify(fb),
    attemptNumber,
    nowISO()
  );
  if (q.topic_id) masteryFromAttempt(q.topic_id as number, fb.correct, fb.score, String(q.difficulty ?? "medium"), attemptNumber);
  if (!fb.correct && fb.misconception?.description) {
    recordMistake((q.course_id as number) ?? null, (q.topic_id as number) ?? null, fb.misconception.description, fb.misconception.tag);
  } else if (!fb.correct && !hasAI() && q.misconception) {
    recordMistake((q.course_id as number) ?? null, (q.topic_id as number) ?? null, String(q.misconception), null);
  }
  return fb;
}

export async function generateSimilarQuestion(questionId: number): Promise<{ id: number }> {
  requireAI();
  const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId) as
    | { id: number; set_id: number; course_id: number | null; topic_id: number | null; type: string; difficulty: string; prompt: string; answer: string; misconception: string | null }
    | undefined;
  if (!q) throw new Error("Question not found");
  const grade = getProfile()?.grade_level ?? "high school";
  const res = await chatJSON<{ prompt: string; choices: string[] | null; answer: string; explanation: string; hint: string; misconception: string }>(
    [
      {
        role: "system",
        content: `Generate ONE similar practice question for a ${grade} student targeting the SAME misconception as the original. Reply ONLY JSON: {"prompt":"...","choices":null or [...],"answer":"...","explanation":"...","hint":"...","misconception":"..."}`,
      },
      {
        role: "user",
        content: `Original question:\n${q.prompt}\nAnswer: ${q.answer}\nMisconception targeted: ${q.misconception ?? "(general)"}\nDifficulty: ${q.difficulty}. Same difficulty, different numbers/context.`,
      },
    ],
    { temperature: 0.7, maxTokens: 1200 }
  );
  const id = db
    .prepare(
      "INSERT INTO questions (set_id, course_id, topic_id, type, difficulty, prompt, choices, answer, explanation, hint, misconception, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(q.set_id, q.course_id, q.topic_id, q.type, q.difficulty, res.prompt, res.choices ? JSON.stringify(res.choices) : null, res.answer, res.explanation ?? "", res.hint ?? "", res.misconception ?? q.misconception ?? "", nowISO()).lastInsertRowid as number;
  return { id };
}

// ---------- AI course/topic suggestion helpers for the tutor ----------

export function weakestTopics(limit = 3) {
  return courseTopics(0).length
    ? []
    : db
        .prepare("SELECT * FROM topics ORDER BY mastery ASC LIMIT ?")
        .all(limit) as Array<{ id: number; name: string; course_id: number; mastery: number }>;
}

export function effectiveMasteryExport() {
  return effectiveMastery;
}
