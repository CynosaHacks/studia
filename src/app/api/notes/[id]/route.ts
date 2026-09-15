import { db, nowISO } from "@/lib/db";
import { handle, readBody, fail } from "@/lib/api";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(Number(id)) as Record<string, unknown> | undefined;
    if (!note) return fail("Note not found", 404);
    return { note };
  });
}

export async function PATCH(req: Request, { params }: P) {
  const { id } = await params;
  return handle(async () => {
    const b = await readBody(req);
    if (typeof b.title === "string") db.prepare("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?").run(b.title.slice(0, 160), nowISO(), Number(id));
    if (typeof b.content === "string") db.prepare("UPDATE notes SET content = ?, updated_at = ? WHERE id = ?").run(b.content, nowISO(), Number(id));
    return { ok: true };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    db.prepare("DELETE FROM notes WHERE id = ?").run(Number(id));
    return { ok: true };
  });
}
