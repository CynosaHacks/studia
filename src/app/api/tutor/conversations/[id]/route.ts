import { db } from "@/lib/db";
import { handle, fail } from "@/lib/api";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    const conversation = db.prepare("SELECT * FROM ai_conversations WHERE id = ?").get(Number(id)) as Record<string, unknown> | undefined;
    if (!conversation) return fail("Conversation not found", 404);
    const messages = db.prepare("SELECT id, role, content, meta, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY id").all(Number(id));
    return { conversation, messages };
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(() => {
    db.prepare("DELETE FROM ai_messages WHERE conversation_id = ?").run(Number(id));
    db.prepare("DELETE FROM ai_conversations WHERE id = ?").run(Number(id));
    return { ok: true };
  });
}
