import { handle, readBody } from "@/lib/api";
import { reviewCard, type Rating } from "@/lib/srs";

// POST { flashcard_id, rating } → schedule next review
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const rating = String(b.rating ?? "good") as Rating;
    if (!["again", "hard", "good", "easy"].includes(rating)) throw new Error("Invalid rating");
    const next = reviewCard(Number(b.flashcard_id), rating);
    if (!next) throw new Error("Flashcard not found");
    return { ok: true, next };
  });
}
