import { db, nowISO, parseJSON } from "../db";
import { chatJSON, chatComplete, hasAI, AIError, markVisionFailed } from "../ai/client";
import { chunkText } from "./extract";

export type DocAnalysis = {
  docType:
    | "syllabus"
    | "assessment_notification"
    | "assignment"
    | "worksheet"
    | "class_notes"
    | "past_paper"
    | "textbook_excerpt"
    | "other";
  title: string;
  course: { name: string; confidence: number; isNew: boolean; teacher?: string };
  unit: string | null;
  topics: string[];
  subtopics: string[];
  summary: string;
  keyConcepts: string[];
  formulas: string[];
  definitions: Array<{ term: string; meaning: string }>;
  dates: Array<{ date: string; what: string }>;
  objectives: string[];
  tasks: string[];
  examTopics: string[];
  assessment: {
    name: string;
    type: "test" | "assignment" | "exam" | "quiz" | "project";
    date: string | null; // YYYY-MM-DD
    weighting: number | null;
    topics: string[];
    format: string;
    materials: string;
    confidence: number;
  } | null;
  curriculum: Array<{ unit: string; topics: string[] }> | null;
  uncertainty: string;
};

const ANALYSIS_PROMPT = `You are Studia's document analyst for a student's school material. Analyse the document and reply with ONLY valid JSON matching this schema:
{
 "docType": "syllabus|assessment_notification|assignment|worksheet|class_notes|past_paper|textbook_excerpt|other",
 "title": "short title of the document",
 "course": {"name": "best-matching course/subject name", "confidence": 0.0-1.0, "isNew": true-if-no-existing-course-likely-matches, "teacher": "if mentioned or empty"},
 "unit": "unit/chapter name if identifiable or null",
 "topics": ["main topics covered, matching school terminology"],
 "subtopics": ["finer-grained subtopics"],
 "summary": "2-3 sentence summary",
 "keyConcepts": ["key ideas"],
 "formulas": ["important formulas in plain text/LaTeX-like"],
 "definitions": [{"term": "", "meaning": ""}],
 "dates": [{"date": "YYYY-MM-DD or empty", "what": "event/deadline"}],
 "objectives": ["learning objectives if present"],
 "tasks": ["tasks the student is required to do, if any"],
 "examTopics": ["potential exam/assessment topics if identifiable"],
 "assessment": null OR {"name":"","type":"test|assignment|exam|quiz|project","date":"YYYY-MM-DD or null","weighting": number-percent-or-null,"topics":["topics to study"],"format":"exam format","materials":"required materials","confidence":0.0-1.0},
 "curriculum": null OR [{"unit":"Unit name","topics":["topic", "..."]}] (ONLY for syllabuses: the full extracted curriculum structure),
 "uncertainty": "what you are unsure about, or empty string"
}
Rules:
- Set "assessment" ONLY if the document announces/contains an actual assessment, test, assignment deadline or exam notification.
- Use null (not guesses) when information is absent. Never invent dates.
- Match the course to school subject naming (e.g. "Mathematics", "Science", "English").`;

export async function analyzeDocumentContent(
  content: string,
  imageDataUrl: string | null,
  existingCourses: string[],
  filename: string
): Promise<DocAnalysis> {
  const truncated =
    content.length > 14000 ? content.slice(0, 7000) + "\n…\n" + content.slice(-5000) : content;
  const userMsg = [
    `Existing courses for this student: ${existingCourses.join(", ") || "(none yet)"}`,
    `File name: ${filename}`,
    "",
    "DOCUMENT CONTENT:",
    truncated || "(no extractable text — an image/screenshot is attached)",
  ].join("\n");

  const messages: Parameters<typeof chatJSON>[0] = [
    { role: "system", content: ANALYSIS_PROMPT },
    { role: "user", content: userMsg },
  ];
  if (imageDataUrl) {
    messages[1] = {
      role: "user",
      content: [
        { type: "text", text: userMsg },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    };
  }
  return chatJSON<DocAnalysis>(messages, { temperature: 0.1, maxTokens: 3500 });
}

export async function transcribeImage(imageDataUrl: string, hint: string): Promise<string> {
  try {
    return await chatComplete(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Transcribe ALL text in this image of school material (handwriting included), preserving structure. ${hint}`,
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      { temperature: 0, maxTokens: 2500 }
    );
  } catch (e) {
    if (e instanceof AIError) markVisionFailed();
    throw e;
  }
}

// ---------- applying analysis to the database ----------

function findOrCreateCourse(
  name: string,
  teacher: string,
  confidence: number
): { courseId: number; needsConfirm: boolean; suggested: string | null } {
  const existing = db
    .prepare("SELECT id, name FROM courses WHERE archived = 0")
    .all() as Array<{ id: number; name: string }>;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = existing.find(
    (c) => norm(c.name) === norm(name) || norm(c.name).includes(norm(name)) || norm(name).includes(norm(c.name))
  );
  if (match) return { courseId: match.id, needsConfirm: false, suggested: null };
  const id = db
    .prepare("INSERT INTO courses (name, teacher, created_at) VALUES (?, ?, ?)")
    .run(name, teacher, nowISO()).lastInsertRowid as number;
  // Low confidence on a brand-new course → ask the student to confirm.
  return { courseId: id, needsConfirm: confidence < 0.55, suggested: name };
}

function findOrCreateUnit(courseId: number, name: string | null): number | null {
  if (!name) return null;
  const found = db
    .prepare("SELECT id FROM units WHERE course_id = ? AND name = ?")
    .get(courseId, name) as { id: number } | undefined;
  if (found) return found.id;
  const pos =
    (db.prepare("SELECT COUNT(*) AS n FROM units WHERE course_id = ?").get(courseId) as { n: number }).n ?? 0;
  return db
    .prepare("INSERT INTO units (course_id, name, position) VALUES (?, ?, ?)")
    .run(courseId, name, pos).lastInsertRowid as number;
}

function upsertTopics(
  courseId: number,
  unitId: number | null,
  names: string[],
  isDemo = false
): number[] {
  const ids: number[] = [];
  for (const raw of names) {
    const name = String(raw).trim().slice(0, 120);
    if (!name) continue;
    const found = db
      .prepare("SELECT id FROM topics WHERE course_id = ? AND name = ?")
      .get(courseId, name) as { id: number } | undefined;
    if (found) {
      ids.push(found.id);
    } else {
      ids.push(
        db
          .prepare(
            "INSERT INTO topics (course_id, unit_id, name, status, is_demo, created_at) VALUES (?, ?, ?, 'in_progress', ?, ?)"
          )
          .run(courseId, unitId, name, isDemo ? 1 : 0, nowISO()).lastInsertRowid as number
      );
    }
  }
  return ids;
}

export function indexDocumentChunks(documentId: number, courseId: number | null, text: string) {
  db.prepare("DELETE FROM document_chunks WHERE document_id = ?").run(documentId);
  db.prepare("DELETE FROM document_chunks_fts WHERE document_id = ?").run(documentId);
  const chunks = chunkText(text);
  const ins = db.prepare(
    "INSERT INTO document_chunks (document_id, course_id, chunk_index, content) VALUES (?, ?, ?, ?)"
  );
  const insFts = db.prepare(
    "INSERT INTO document_chunks_fts (content, document_id, course_id) VALUES (?, ?, ?)"
  );
  chunks.forEach((c, i) => {
    const r = ins.run(documentId, courseId, i, c).lastInsertRowid as number;
    insFts.run(c, documentId, courseId ? courseId : null);
    void r;
  });
}

export function applyAnalysis(
  docId: number,
  analysis: DocAnalysis,
  opts: { extractedText: string; isDemo?: boolean; forceCourseId?: number }
): { courseId: number | null; needsConfirm: boolean; assessmentId: number | null; createdTopics: number } {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(docId) as Record<string, unknown> | undefined;
  if (!doc) throw new Error("Document not found");

  let courseId: number | null = opts.forceCourseId ?? null;
  let needsConfirm = false;
  let createdTopics = 0;
  let unitId: number | null = null;

  if (!courseId && analysis.course?.name) {
    const res = findOrCreateCourse(
      analysis.course.name,
      analysis.course.teacher ?? "",
      analysis.course.confidence ?? 0.5
    );
    courseId = res.courseId;
    needsConfirm = res.needsConfirm;
  }

  if (courseId) {
    unitId = findOrCreateUnit(courseId, analysis.unit ?? null);
    const before = (db.prepare("SELECT COUNT(*) AS n FROM topics WHERE course_id = ?").get(courseId) as { n: number }).n;
    const ids = upsertTopics(courseId, unitId, analysis.topics ?? [], opts.isDemo);
    createdTopics = (db.prepare("SELECT COUNT(*) AS n FROM topics WHERE course_id = ?").get(courseId) as { n: number }).n - before;
    void ids;
  }

  let assessmentId: number | null = null;
  if (analysis.assessment && courseId && (analysis.assessment.confidence ?? 0) >= 0.5) {
    assessmentId = db
      .prepare(
        `INSERT INTO assessments (course_id, title, type, due_date, weighting, topics, format, required_materials, notes, source_document_id, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        courseId,
        analysis.assessment.name || analysis.title || "Assessment",
        analysis.assessment.type || "test",
        analysis.assessment.date || null,
        analysis.assessment.weighting ?? null,
        JSON.stringify(analysis.assessment.topics ?? []),
        analysis.assessment.format ?? "",
        analysis.assessment.materials ?? "",
        "Detected automatically from an uploaded document. Please verify the details.",
        docId,
        opts.isDemo ? 1 : 0,
        nowISO()
      ).lastInsertRowid as number;
  }

  db.prepare(
    `UPDATE documents SET course_id = ?, unit_id = ?, title = ?, doc_type = ?, status = ?, confidence = ?, suggested_course = ?, summary = ?, analysis = ? WHERE id = ?`
  ).run(
    courseId,
    unitId,
    analysis.title || (doc.title as string),
    analysis.docType || "other",
    needsConfirm ? "needs_course" : "ready",
    analysis.course?.confidence ?? null,
    needsConfirm ? analysis.course?.name ?? null : null,
    analysis.summary ?? "",
    JSON.stringify(analysis),
    docId
  );

  if (opts.extractedText) indexDocumentChunks(docId, courseId, opts.extractedText);

  // Syllabus → store curriculum proposal inside analysis (applied via explicit user confirmation)
  return { courseId, needsConfirm, assessmentId, createdTopics };
}

export async function ensureAnalysis(docId: number): Promise<{ ok: boolean; error?: string }> {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(docId) as Record<string, unknown> | undefined;
  if (!doc) return { ok: false, error: "not found" };
  if (doc.status === "ready" && doc.analysis) return { ok: true };
  if (!hasAI()) {
    // Without AI the document is still stored and searchable — just not analysed.
    if (doc.status === "processing") {
      db.prepare("UPDATE documents SET status = 'ready', summary = ? WHERE id = ?").run(
        "Saved and searchable. Connect AI in Settings to auto-extract topics, dates and assessments.",
        docId
      );
    }
    return { ok: false, error: "AI is not configured — connect a provider in Settings to analyze documents." };
  }

  const text = (doc.extracted_text as string) ?? "";
  const image = (doc.image_data as string) ?? null;
  const courses = (db.prepare("SELECT name FROM courses WHERE archived = 0").all() as Array<{ name: string }>).map((c) => c.name);
  try {
    const analysis = await analyzeDocumentContent(text, image, courses, (doc.title as string) ?? "document");
    applyAnalysis(docId, analysis, { extractedText: text });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.prepare("UPDATE documents SET status = 'failed', summary = ? WHERE id = ?").run(
      `Analysis failed: ${msg}`,
      docId
    );
    return { ok: false, error: msg };
  }
}

export function analysisOf(doc: Record<string, unknown>): DocAnalysis | null {
  return parseJSON<DocAnalysis | null>(doc.analysis as string, null);
}
