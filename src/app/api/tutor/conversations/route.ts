import { db, nowISO } from "@/lib/db";
import { handle, readBody } from "@/lib/api";

export async function GET() {
  return handle(() => {
    const conversations = db
      .prepare(
        `SELECT c.id, c.title, c.mode, c.created_at, c.updated_at,
                (SELECT content FROM ai_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message
         FROM ai_conversations c ORDER BY c.updated_at DESC LIMIT 50`
      )
      .all();
    return { conversations };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const id = db
      .prepare("INSERT INTO ai_conversations (title, mode, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(String(b.title ?? "New conversation").slice(0, 120), String(b.mode ?? "standard"), nowISO(), nowISO()).lastInsertRowid as number;
    return { id };
  });
}
