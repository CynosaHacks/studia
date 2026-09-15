import { db, nowISO } from "@/lib/db";
import { handle, readBody } from "@/lib/api";

export async function GET() {
  return handle(() => {
    const courses = db.prepare("SELECT * FROM courses WHERE archived = 0 ORDER BY created_at").all();
    return { courses };
  });
}

export async function POST(req: Request) {
  return handle(() => {
    return readBody(req).then((b) => {
      const name = String(b.name ?? "").trim().slice(0, 80);
      if (!name) throw new Error("Course name is required");
      const id = db
        .prepare("INSERT INTO courses (name, teacher, description, color, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(
          name,
          String(b.teacher ?? "").slice(0, 80),
          String(b.description ?? "").slice(0, 500),
          String(b.color ?? "indigo").slice(0, 20),
          nowISO()
        ).lastInsertRowid as number;
      return { id };
    });
  });
}
