import { db, nowISO } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { generateFlashcards } from "@/lib/generate";
import { dueCounts } from "@/lib/srs";

export async function GET() {
  return handle(() => {
    const decks = db
      .prepare(
        `SELECT d.id, d.title, d.course_id, d.topic_id, d.is_demo, d.created_at,
                c.name AS course_name, t.name AS topic_name,
                (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) AS card_count,
                (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id AND (f.due_at IS NULL OR f.due_at <= ?)) AS due_count,
                (SELECT MAX(f.last_reviewed_at) FROM flashcards f WHERE f.deck_id = d.id) AS last_reviewed_at
         FROM flashcard_decks d LEFT JOIN courses c ON c.id = d.course_id LEFT JOIN topics t ON t.id = d.topic_id
         ORDER BY d.created_at DESC`
      )
      .all(nowISO());
    return { decks, due: dueCounts() };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    if (b.action === "create_deck") {
      const title = String(b.title ?? "").trim().slice(0, 140);
      if (!title) throw new Error("Deck title is required");
      const id = db
        .prepare("INSERT INTO flashcard_decks (course_id, topic_id, title, created_at) VALUES (?, ?, ?, ?)")
        .run((b.course_id as number) || null, (b.topic_id as number) || null, title, nowISO()).lastInsertRowid as number;
      return { deckId: id };
    }
    if (b.action === "add_card") {
      const front = String(b.front ?? "").trim();
      const back = String(b.back ?? "").trim();
      if (!front || !back) throw new Error("Front and back are required");
      const id = db
        .prepare("INSERT INTO flashcards (deck_id, course_id, topic_id, front, back, card_type, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(b.deck_id as number, (b.course_id as number) || null, (b.topic_id as number) || null, front, back, String(b.card_type ?? "definition"), nowISO(), nowISO()).lastInsertRowid as number;
      return { id };
    }
    const res = await generateFlashcards({
      courseId: (b.course_id as number) || null,
      topicId: (b.topic_id as number) || null,
      documentId: (b.document_id as number) || null,
      count: Number(b.count ?? 10),
      types: Array.isArray(b.types) ? b.types.map(String) : ["mixed"],
    });
    return res;
  });
}
