import { db } from "@/lib/db";
import { handle, readBody, fail } from "@/lib/api";
import { reviewCard, type Rating } from "@/lib/srs";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    const deck = db
      .prepare(
        `SELECT d.*, c.name AS course_name, t.name AS topic_name FROM flashcard_decks d
         LEFT JOIN courses c ON c.id = d.course_id LEFT JOIN topics t ON t.id = d.topic_id WHERE d.id = ?`
      )
      .get(Number(id)) as Record<string, unknown> | undefined;
    if (!deck) return fail("Deck not found", 404);
    const cards = db
      .prepare(
        `SELECT * FROM flashcards WHERE deck_id = ?
         ORDER BY CASE WHEN due_at IS NULL THEN 1 WHEN due_at <= ? THEN 0 ELSE 1 END, due_at`
      )
      .all(Number(id), new Date().toISOString()) as Array<Record<string, unknown>>;
    return { deck, cards };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    db.prepare("DELETE FROM flashcard_decks WHERE id = ?").run(Number(id));
    return { ok: true };
  });
}

// Review a card: POST /api/flashcards/decks/[id] { flashcard_id, rating }
export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  void id;
  return handle(async () => {
    const b = await readBody(req);
    const rating = String(b.rating ?? "good") as Rating;
    if (!["again", "hard", "good", "easy"].includes(rating)) throw new Error("Invalid rating");
    const next = reviewCard(Number(b.flashcard_id), rating);
    return { ok: true, next };
  });
}
