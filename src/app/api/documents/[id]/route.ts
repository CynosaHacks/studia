import { db, parseJSON } from "@/lib/db";
import { handle, fail } from "@/lib/api";
import { analysisOf, indexDocumentChunks } from "@/lib/ingest/analyze";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(Number(id)) as Record<string, unknown> | undefined;
    if (!doc) return fail("Document not found", 404);
    const course = doc.course_id
      ? (db.prepare("SELECT id, name FROM courses WHERE id = ?").get(doc.course_id as number) as { id: number; name: string } | undefined)
      : null;
    const relatedAssessments = db
      .prepare("SELECT id, title, due_date, type FROM assessments WHERE source_document_id = ?")
      .all(Number(id));
    return {
      document: { ...doc, analysis: analysisOf(doc) },
      course,
      relatedAssessments,
    };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    db.prepare("DELETE FROM document_chunks_fts WHERE document_id = ?").run(Number(id));
    db.prepare("DELETE FROM documents WHERE id = ?").run(Number(id));
    return { ok: true };
  });
}

export async function PATCH(req: Request, { params }: P) {
  const { id } = await params;
  const docId = Number(id);
  return handle(async () => {
    const b = (await req.json()) as Record<string, unknown>;
    if (typeof b.title === "string" && b.title.trim()) {
      db.prepare("UPDATE documents SET title = ? WHERE id = ?").run(b.title.trim().slice(0, 160), docId);
    }
    if (typeof b.course_id === "number" || b.course_id === null) {
      const courseId = b.course_id as number | null;
      const doc = db.prepare("SELECT extracted_text FROM documents WHERE id = ?").get(docId) as { extracted_text: string | null } | undefined;
      db.prepare("UPDATE documents SET course_id = ?, status = CASE WHEN status = 'needs_course' THEN 'ready' ELSE status END, suggested_course = NULL WHERE id = ?").run(courseId, docId);
      if (doc?.extracted_text && courseId) {
        indexDocumentChunks(docId, courseId, doc.extracted_text);
      }
    }
    void parseJSON;
    return { ok: true };
  });
}
