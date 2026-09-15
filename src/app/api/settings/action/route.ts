import { db, getSetting, setSetting } from "@/lib/db";
import { handle, readBody } from "@/lib/api";
import { loadDemoData, clearDemoData } from "@/lib/demo";
import { NextResponse } from "next/server";

// POST { action: "load_demo" | "clear_demo" | "reset_ai_memory" | "delete_all" }
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    switch (String(b.action)) {
      case "load_demo":
        loadDemoData();
        return { ok: true, message: "Demo data loaded." };
      case "clear_demo":
        clearDemoData();
        return { ok: true, message: "Demo data cleared." };
      case "reset_ai_memory":
        db.prepare("DELETE FROM ai_messages").run();
        db.prepare("DELETE FROM ai_conversations").run();
        db.prepare("DELETE FROM mastery_records").run();
        db.prepare("DELETE FROM mistakes").run();
        db.prepare("DELETE FROM study_sessions").run();
        db.prepare("UPDATE topics SET mastery = 0, last_studied_at = NULL").run();
        return { ok: true, message: "AI memory reset: conversations, mastery estimates, mistakes and study history cleared. Your courses, documents and notes were kept." };
      case "delete_all": {
        const tables = [
          "document_chunks_fts", "document_chunks", "documents", "attempts", "questions", "practice_sets",
          "flashcard_reviews", "flashcards", "flashcard_decks", "notes", "assessments", "study_sessions",
          "mastery_records", "mistakes", "ai_messages", "ai_conversations", "topics", "units", "courses",
        ];
        for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
        db.prepare("DELETE FROM student_profile").run();
        setSetting("demo.active", "0");
        return { ok: true, message: "All data deleted. Redirecting to onboarding…" };
      }
      default:
        throw new Error("Unknown action");
    }
  });
}

// GET → full data export as downloadable JSON
export async function GET() {
  const tables = [
    "student_profile", "courses", "units", "topics", "documents", "document_chunks",
    "assessments", "notes", "flashcard_decks", "flashcards", "flashcard_reviews",
    "practice_sets", "questions", "attempts", "mistakes", "study_sessions", "mastery_records",
    "ai_conversations", "ai_messages",
  ];
  const dump: Record<string, unknown> = { exported_at: new Date().toISOString(), app: "Studia" };
  for (const t of tables) dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="studia-export-${getSetting("demo.active") === "1" ? "demo-" : ""}${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
