import { db } from "@/lib/db";
import { handle } from "@/lib/api";

export async function GET(req: Request) {
  return handle(() => {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (!q) return { results: [], query: q };
    const like = `%${q}%`;

    const courses = db.prepare("SELECT id, name, color FROM courses WHERE archived = 0 AND (name LIKE ? OR description LIKE ? OR teacher LIKE ?) LIMIT 5").all(like, like, like);
    const topics = db.prepare("SELECT id, name, course_id, mastery FROM topics WHERE name LIKE ? LIMIT 8").all(like);
    const documents = db.prepare("SELECT id, title, doc_type, course_id FROM documents WHERE title LIKE ? OR extracted_text LIKE ? LIMIT 8").all(like, like);
    const notes = db.prepare("SELECT id, title, kind, course_id FROM notes WHERE title LIKE ? OR content LIKE ? LIMIT 8").all(like, like);
    const assessments = db.prepare("SELECT id, title, type, due_date, course_id FROM assessments WHERE title LIKE ? OR topics LIKE ? LIMIT 8").all(like, like);
    const flashcards = db.prepare("SELECT id, front, deck_id FROM flashcards WHERE front LIKE ? OR back LIKE ? LIMIT 8").all(like, like);
    const questions = db.prepare("SELECT id, prompt, set_id FROM questions WHERE prompt LIKE ? LIMIT 6").all(like);

    // FTS across document text for a "semantic-ish" fallback listing matching snippets
    let snippets: Array<{ documentId: number; snippet: string }> = [];
    try {
      const ftsQ = q.split(/\s+/).filter((w) => w.length > 2).map((w) => `"${w}"`).join(" OR ");
      if (ftsQ) {
        snippets = db
          .prepare(`SELECT document_id AS documentId, snippet(document_chunks_fts, 0, '›', '‹', '…', 24) AS snippet
                    FROM document_chunks_fts WHERE document_chunks_fts MATCH ? LIMIT 6`)
          .all(ftsQ) as Array<{ documentId: number; snippet: string }>;
      }
    } catch { /* FTS unavailable */ }

    const courseName = (id: unknown) =>
      (db.prepare("SELECT name FROM courses WHERE id = ?").get(id as number) as { name: string } | undefined)?.name ?? null;

    return {
      query: q,
      results: {
        courses: courses.map((c) => ({ ...c, href: `/courses/${c.id}` })),
        topics: topics.map((t) => ({ ...t, course_name: courseName(t.course_id), href: `/courses/${t.course_id}` })),
        documents: documents.map((d) => ({ ...d, course_name: courseName(d.course_id), href: `/documents?doc=${d.id}` })),
        notes: notes.map((n) => ({ ...n, course_name: courseName(n.course_id), href: `/notes?note=${n.id}` })),
        assessments: assessments.map((a) => ({ ...a, course_name: courseName(a.course_id), href: `/assessments?a=${a.id}` })),
        flashcards: flashcards.map((f) => ({ ...f, href: "/flashcards" })),
        questions: questions.map((x) => ({ ...x, href: `/practice?set=${x.set_id}` })),
        snippets: snippets.map((s) => ({ ...s, document_title: (db.prepare("SELECT title FROM documents WHERE id = ?").get(s.documentId) as { title: string } | undefined)?.title ?? "", href: `/documents?doc=${s.documentId}` })),
      },
    };
  });
}
