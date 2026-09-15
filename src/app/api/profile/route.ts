import { db, nowISO, getProfile, parseJSON } from "@/lib/db";
import { handle, readBody } from "@/lib/api";

export async function GET() {
  return handle(() => ({ profile: getProfile() ?? null }));
}

// POST = onboarding save (creates profile + initial courses) or preference update.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const prefs = (b.preferences ?? {}) as Record<string, unknown>;

    // If name/grade present → treat as full onboarding save.
    if (b.name !== undefined || b.grade_level !== undefined) {
      const name = String(b.name ?? "").slice(0, 80);
      const grade = String(b.grade_level ?? "").slice(0, 40);
      const schoolYear = String(b.school_year ?? "").slice(0, 20);
      const existing = getProfile();
      if (!existing) {
        db.prepare(
          `INSERT INTO student_profile (id, name, grade_level, school_year, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)`
        ).run(name, grade, schoolYear, nowISO(), nowISO());
      } else {
        db.prepare(
          `UPDATE student_profile SET name = ?, grade_level = ?, school_year = ?, updated_at = ? WHERE id = 1`
        ).run(name, grade, schoolYear, nowISO());
      }

      const courses = Array.isArray(b.courses) ? b.courses : [];
      const courseIds: number[] = [];
      for (const raw of courses) {
        const c = raw as Record<string, unknown>;
        const cname = String(c.name ?? "").trim().slice(0, 80);
        if (!cname) continue;
        const id = db
          .prepare("INSERT INTO courses (name, teacher, description, color, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(
            cname,
            String(c.teacher ?? "").slice(0, 80),
            String(c.description ?? "").slice(0, 500),
            String(c.color ?? pickColor(courseIds.length)).slice(0, 20),
            nowISO()
          ).lastInsertRowid as number;
        courseIds.push(id);
        const unitName = String(c.current_unit ?? "").trim().slice(0, 120);
        if (unitName) {
          const unitId = db
            .prepare("INSERT INTO units (course_id, name, position, status) VALUES (?, ?, 0, 'current')")
            .run(id, unitName).lastInsertRowid as number;
          const topics = String(c.topics ?? "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 20);
          for (const t of topics) {
            db.prepare(
              "INSERT INTO topics (course_id, unit_id, name, status, created_at) VALUES (?, ?, ?, 'in_progress', ?)"
            ).run(id, unitId, t.slice(0, 120), nowISO());
          }
        }
      }
      applyPreferences(prefs);
      db.prepare("UPDATE student_profile SET onboarded = 1 WHERE id = 1").run();
      return { ok: true, courseIds };
    }

    // Preferences-only update
    applyPreferences(prefs);
    return { ok: true };
  });
}

export function applyPreferences(p: Record<string, unknown>) {
  const colSets: Array<[string, string | number]> = [];
  if (typeof p.explanation_detail === "string" && ["simple", "standard", "detailed"].includes(p.explanation_detail))
    colSets.push(["explanation_detail", p.explanation_detail]);
  if (typeof p.notes_style === "string" && ["concise", "detailed"].includes(p.notes_style))
    colSets.push(["notes_style", p.notes_style]);
  if (typeof p.prefer_examples === "boolean") colSets.push(["prefer_examples", p.prefer_examples ? 1 : 0]);
  if (typeof p.prefer_visual === "boolean") colSets.push(["prefer_visual", p.prefer_visual ? 1 : 0]);
  if (typeof p.goals === "string") colSets.push(["goals", p.goals.slice(0, 500)]);
  if (Array.isArray(p.difficult_subjects))
    colSets.push(["difficult_subjects", JSON.stringify(p.difficult_subjects.slice(0, 10).map(String))]);
  if (typeof p.study_minutes_per_day === "number")
    colSets.push(["study_minutes_per_day", Math.max(10, Math.min(240, Math.round(p.study_minutes_per_day)))]);

  if (colSets.length) {
    const frag = colSets.map(([k]) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE student_profile SET ${frag}, updated_at = ? WHERE id = 1`).run(
      ...colSets.map(([, v]) => v),
      nowISO()
    );
  }
}

export function preferencesOf(profile: Record<string, unknown> | undefined) {
  if (!profile) return null;
  return {
    explanation_detail: profile.explanation_detail,
    notes_style: profile.notes_style,
    prefer_examples: !!profile.prefer_examples,
    prefer_visual: !!profile.prefer_visual,
    difficult_subjects: parseJSON<string[]>(profile.difficult_subjects as string, []),
    goals: profile.goals,
    study_minutes_per_day: profile.study_minutes_per_day,
  };
}

function pickColor(i: number): string {
  const palette = ["indigo", "emerald", "rose", "amber", "sky", "violet"];
  return palette[i % palette.length];
}
