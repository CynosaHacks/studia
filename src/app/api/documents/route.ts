import { db, nowISO } from "@/lib/db";
import { handle, readBody, fail } from "@/lib/api";
import { extractFromFile } from "@/lib/ingest/extract";
import { ensureAnalysis, indexDocumentChunks } from "@/lib/ingest/analyze";

export async function GET() {
  return handle(() => {
    const docs = db
      .prepare(
        `SELECT d.id, d.title, d.doc_type, d.status, d.summary, d.mime_type, d.file_ext, d.size, d.confidence,
                d.suggested_course, d.is_demo, d.created_at, d.course_id, c.name AS course_name
         FROM documents d LEFT JOIN courses c ON c.id = d.course_id
         ORDER BY d.created_at DESC`
      )
      .all();
    return { documents: docs };
  });
}

// Multipart upload (files) or JSON paste (text)
export async function POST(req: Request) {
  return handle(async () => {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const b = await readBody(req);
      const title = String(b.title ?? "Pasted notes").slice(0, 160);
      const text = String(b.text ?? "").slice(0, 500_000);
      if (!text.trim()) throw new Error("Paste some text first");
      const courseId = typeof b.course_id === "number" ? b.course_id : null;
      const id = db
        .prepare(
          `INSERT INTO documents (course_id, title, doc_type, mime_type, file_ext, size, source, status, extracted_text, is_demo, created_at)
           VALUES (?, ?, 'notes', 'text/plain', 'txt', ?, 'paste', 'processing', ?, 0, ?)`
        )
        .run(courseId, title, text.length, text, nowISO()).lastInsertRowid as number;
      indexDocumentChunks(id, courseId, text);
      // Try AI analysis; if unavailable, settle the document as ready (still searchable).
      const res = await ensureAnalysis(id);
      if (!res.ok) {
        db.prepare("UPDATE documents SET status = 'ready', summary = ? WHERE id = ?").run(
          "Saved and searchable. Connect AI in Settings to auto-extract topics, dates and assessments.",
          id
        );
      }
      const doc = db.prepare("SELECT id, status FROM documents WHERE id = ?").get(id) as { id: number; status: string };
      return { id: doc.id, status: doc.status, analysisError: res.ok ? null : res.error ?? null };
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file received", 400);
    if (file.size > 25 * 1024 * 1024) return fail("File too large (max 25 MB)", 400);

    const courseId = form.get("course_id") ? Number(form.get("course_id")) : null;
    const forcedType = (form.get("doc_type") as string) || null;
    const extracted = await extractFromFile(file);
    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 160) || "Untitled";
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();

    const id = db
      .prepare(
        `INSERT INTO documents (course_id, title, doc_type, mime_type, file_ext, size, source, status, extracted_text, image_data, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'upload', 'processing', ?, ?, 0, ?)`
      )
      .run(
        courseId,
        title,
        forcedType ?? guessType(file.name, file.type),
        file.type || null,
        ext || null,
        file.size,
        extracted.text,
        extracted.imageDataUrl,
        nowISO()
      ).lastInsertRowid as number;

    if (extracted.text) indexDocumentChunks(id, courseId, extracted.text);

    // Try analysis right away (only if AI configured). Errors are surfaced via status=failed.
    let analysisError: string | null = null;
    if (extracted.text || extracted.imageDataUrl) {
      const res = await ensureAnalysis(id);
      if (!res.ok) analysisError = res.error ?? "Analysis failed";
    } else {
      db.prepare("UPDATE documents SET status = 'ready', summary = ? WHERE id = ?").run(
        extracted.note ?? "No text could be extracted.",
        id
      );
    }

    const doc = db.prepare("SELECT id, status, title FROM documents WHERE id = ?").get(id);
    return { id, status: (doc as { status: string }).status, analysisError };
  });
}

function guessType(name: string, mime: string): string {
  const n = name.toLowerCase();
  if (/syllabus|outline|course.?handbook/.test(n)) return "syllabus";
  if (/assessment|notification|test.?notice|exam.?notice/.test(n)) return "assessment_notification";
  if (/worksheet|exercise/.test(n)) return "worksheet";
  if (/assignment|task|project/.test(n)) return "assignment";
  if (/notes|lecture/.test(n)) return "class_notes";
  if (/past.?paper|exam.?paper/.test(n)) return "past_paper";
  if (mime === "application/pdf" && /test|exam|quiz/.test(n)) return "past_paper";
  return "other";
}
