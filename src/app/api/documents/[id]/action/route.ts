import { db, nowISO, parseJSON } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { ensureAnalysis, indexDocumentChunks, type DocAnalysis } from "@/lib/ingest/analyze";

type P = { params: Promise<{ id: string }> };

// Actions: analyze (run/re-run AI analysis), confirm_course, apply_curriculum
export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  const docId = Number(id);
  return handle(async () => {
    const b = await readBody(req);
    const action = String(b.action ?? "analyze");
    const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(docId) as Record<string, unknown> | undefined;
    if (!doc) throw new Error("Document not found");

    if (action === "analyze") {
      db.prepare("UPDATE documents SET status = 'processing' WHERE id = ?").run(docId);
      const res = await ensureAnalysis(docId);
      const updated = db.prepare("SELECT id, status, analysis FROM documents WHERE id = ?").get(docId) as { status: string; analysis: string | null };
      return { ok: res.ok, error: res.error, status: updated.status, analysis: parseJSON<DocAnalysis | null>(updated.analysis, null) };
    }

    if (action === "confirm_course") {
      const courseId = Number(b.course_id);
      const course = db.prepare("SELECT id, name FROM courses WHERE id = ?").get(courseId) as { id: number; name: string } | undefined;
      if (!course) throw new Error("Pick a course first");
      const text = (doc.extracted_text as string) ?? "";
      db.prepare(
        "UPDATE documents SET course_id = ?, status = 'ready', suggested_course = NULL, confidence = 1.0 WHERE id = ?"
      ).run(courseId, docId);
      if (text) indexDocumentChunks(docId, courseId, text);
      return { ok: true };
    }

    if (action === "apply_curriculum") {
      const courseId = Number(b.course_id ?? doc.course_id);
      if (!courseId) throw new Error("No course for this document");
      const analysis = parseJSON<DocAnalysis | null>(doc.analysis as string, null);
      if (!analysis?.curriculum?.length) throw new Error("No curriculum was extracted from this document");
      let unitPos = (db.prepare("SELECT COUNT(*) AS n FROM units WHERE course_id = ?").get(courseId) as { n: number }).n;
      let unitsCreated = 0;
      let topicsCreated = 0;
      for (const unit of analysis.curriculum) {
        const uname = String(unit.unit ?? "").trim().slice(0, 140);
        if (!uname) continue;
        let unitId = (db.prepare("SELECT id FROM units WHERE course_id = ? AND name = ?").get(courseId, uname) as { id: number } | undefined)?.id;
        if (!unitId) {
          unitId = db
            .prepare("INSERT INTO units (course_id, name, position, status) VALUES (?, ?, ?, 'upcoming')")
            .run(courseId, uname, unitPos++).lastInsertRowid as number;
          unitsCreated++;
        }
        for (const t of unit.topics ?? []) {
          const tname = String(t).trim().slice(0, 120);
          if (!tname) continue;
          const exists = db.prepare("SELECT id FROM topics WHERE course_id = ? AND name = ?").get(courseId, tname);
          if (!exists) {
            db.prepare("INSERT INTO topics (course_id, unit_id, name, status, created_at) VALUES (?, ?, ?, 'upcoming', ?)").run(
              courseId, unitId, tname, nowISO()
            );
            topicsCreated++;
          }
        }
      }
      return { ok: true, unitsCreated, topicsCreated };
    }

    throw new Error(`Unknown action: ${action}`);
  });
}
