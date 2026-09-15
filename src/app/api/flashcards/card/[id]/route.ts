import { db } from "@/lib/db";
import { handle, readBody } from "@/lib/api";

type P = { params: Promise<{ id: string }> };

// Edit / bookmark / delete a single flashcard
export async function PATCH(req: Request, { params }: P) {
  const { id } = await params;
  return handle(async () => {
    const b = await readBody(req);
    const sets: Array<[string, string | number]> = [];
    if (typeof b.front === "string") sets.push(["front", b.front.slice(0, 500)]);
    if (typeof b.back === "string") sets.push(["back", b.back.slice(0, 2000)]);
    if (typeof b.bookmarked === "boolean") sets.push(["bookmarked", b.bookmarked ? 1 : 0]);
    if (sets.length) {
      const frag = sets.map(([k]) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE flashcards SET ${frag} WHERE id = ?`).run(...sets.map(([, v]) => v), Number(id));
    }
    return { ok: true };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    db.prepare("DELETE FROM flashcards WHERE id = ?").run(Number(id));
    return { ok: true };
  });
}
