import { db, nowISO } from "./db";
import { bumpMastery } from "./mastery";

export type Rating = "again" | "hard" | "good" | "easy";

// SM-2 lite: simple, predictable spaced repetition.
export function scheduleNext(card: {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}, rating: Rating) {
  let { ease, interval_days, reps, lapses } = card;
  if (ease < 1.3) ease = 1.3;

  if (rating === "again") {
    lapses += 1;
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    interval_days = 0; // due again in ~10 minutes
    return { ease, interval_days, reps, lapses, dueAt: new Date(Date.now() + 10 * 60000) };
  }

  reps += 1;
  if (rating === "hard") {
    ease = Math.max(1.3, ease - 0.15);
    interval_days = Math.max(1, interval_days * 1.2);
  } else if (rating === "good") {
    interval_days = reps === 1 ? 1 : reps === 2 ? 3 : interval_days * ease;
  } else {
    ease = Math.min(3.2, ease + 0.15);
    interval_days = (interval_days || 1) * ease * 1.3;
  }
  interval_days = Math.min(365, Math.round(interval_days * 2) / 2);
  const dueAt = new Date(Date.now() + interval_days * 86400000);
  return { ease, interval_days, reps, lapses, dueAt };
}

export function reviewCard(flashcardId: number, rating: Rating) {
  const card = db.prepare("SELECT * FROM flashcards WHERE id = ?").get(flashcardId) as
    | { id: number; ease: number; interval_days: number; reps: number; lapses: number; course_id: number | null; topic_id: number | null }
    | undefined;
  if (!card) return null;

  const next = scheduleNext(card, rating);
  db.prepare(
    `UPDATE flashcards SET ease = ?, interval_days = ?, reps = ?, lapses = ?, due_at = ?, last_reviewed_at = ? WHERE id = ?`
  ).run(next.ease, next.interval_days, next.reps, next.lapses, next.dueAt.toISOString(), nowISO(), flashcardId);
  db.prepare("INSERT INTO flashcard_reviews (flashcard_id, rating, reviewed_at) VALUES (?, ?, ?)").run(
    flashcardId,
    rating,
    nowISO()
  );

  // Nudge topic mastery from flashcard performance
  if (card.topic_id) {
    const delta = rating === "again" ? -7 : rating === "hard" ? 0.5 : rating === "good" ? 2.5 : 4;
    bumpMastery(card.topic_id, delta, `Flashcard ${rating}`, "flashcard");
  }
  return next;
}

export function dueCounts(): { due: number; total: number } {
  const now = nowISO();
  const due = db.prepare("SELECT COUNT(*) AS n FROM flashcards WHERE due_at IS NULL OR due_at <= ?").get(now) as { n: number };
  const total = db.prepare("SELECT COUNT(*) AS n FROM flashcards").get() as { n: number };
  return { due: due.n, total: total.n };
}

export function dueCardsForDeck(deckId: number, limit = 40) {
  const now = nowISO();
  return db
    .prepare(
      "SELECT * FROM flashcards WHERE deck_id = ? AND (due_at IS NULL OR due_at <= ?) ORDER BY due_at IS NULL DESC, due_at LIMIT ?"
    )
    .all(deckId, now, limit) as Array<Record<string, unknown>>;
}
