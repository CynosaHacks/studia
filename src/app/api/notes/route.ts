import { db } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { generateNotes } from "@/lib/generate";

export async function GET() {
  return handle(() => {
    const notes = db
      .prepare(
        `SELECT n.id, n.title, n.kind, n.course_id, n.topic_id, n.document_id, n.is_demo, n.created_at, n.updated_at,
                c.name AS course_name, t.name AS topic_name
         FROM notes n LEFT JOIN courses c ON c.id = n.course_id LEFT JOIN topics t ON t.id = n.topic_id
         ORDER BY n.updated_at DESC`
      )
      .all();
    return { notes };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const res = await generateNotes({
      courseId: (b.course_id as number) || null,
      topicId: (b.topic_id as number) || null,
      documentId: (b.document_id as number) || null,
      kind: String(b.kind ?? "summary"),
    });
    return res;
  });
}
