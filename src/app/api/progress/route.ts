import { db, todayLocal, parseJSON } from "@/lib/db";
import { handle } from "@/lib/api";
import { courseMastery, courseTopics, effectiveMastery, listCourses } from "@/lib/ai/context";

export async function GET() {
  return handle(() => {
    const stats = {
      questions_attempted: (db.prepare("SELECT COUNT(DISTINCT question_id) AS n FROM attempts").get() as { n: number }).n,
      attempts_total: (db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as { n: number }).n,
      first_try_correct: (db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE attempt_number = 1 AND is_correct = 1").get() as { n: number }).n,
      first_try_total: (db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE attempt_number = 1").get() as { n: number }).n,
      flashcards_total: (db.prepare("SELECT COUNT(*) AS n FROM flashcards").get() as { n: number }).n,
      flashcard_reviews: (db.prepare("SELECT COUNT(*) AS n FROM flashcard_reviews").get() as { n: number }).n,
      flashcards_mastered: (db.prepare("SELECT COUNT(*) AS n FROM flashcards WHERE reps >= 2 AND lapses = 0").get() as { n: number }).n,
      study_minutes: (db.prepare("SELECT COALESCE(SUM(minutes), 0) AS n FROM study_sessions WHERE status = 'done'").get() as { n: number }).n,
      sessions_done: (db.prepare("SELECT COUNT(*) AS n FROM study_sessions WHERE status = 'done'").get() as { n: number }).n,
      documents: (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n,
      notes: (db.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }).n,
    };

    const courses = listCourses().map((c) => {
      const topics = courseTopics(c.id as number);
      return {
        id: c.id, name: c.name, color: c.color,
        mastery: courseMastery(c.id as number),
        topics: topics.map((t) => ({ id: t.id, name: t.name, mastery: effectiveMastery(t), status: t.status })),
      };
    });

    // mastery over time (weekly buckets from records)
    const records = db
      .prepare("SELECT course_id, value, created_at FROM mastery_records ORDER BY created_at")
      .all() as Array<{ course_id: number | null; value: number; created_at: string }>;
    const series: Record<string, number[]> = {};
    for (const r of records) {
      const week = r.created_at.slice(0, 10);
      (series[week] ??= []).push(r.value);
    }
    const weeks = Object.entries(series)
      .slice(-12)
      .map(([date, vals]) => ({
        date,
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      }));

    const mistakes = db
      .prepare(
        `SELECT m.*, c.name AS course_name, t.name AS topic_name FROM mistakes m
         LEFT JOIN courses c ON c.id = m.course_id LEFT JOIN topics t ON t.id = m.topic_id
         ORDER BY m.count DESC, m.last_seen_at DESC LIMIT 12`
      )
      .all();

    const upcoming = db
      .prepare("SELECT a.id, a.title, a.due_date, a.topics, a.course_id, c.name AS course_name FROM assessments a LEFT JOIN courses c ON c.id = a.course_id WHERE a.due_date >= ? ORDER BY a.due_date LIMIT 6")
      .all(todayLocal()) as Array<Record<string, unknown>>;
    const readiness = upcoming.map((a) => {
      const topics = parseJSON<string[]>(a.topics as string, []);
      const r = a.course_id
        ? (db.prepare("SELECT * FROM topics WHERE course_id = ?").all(a.course_id as number) as Array<{ name: string; mastery: number; last_studied_at: string | null }>)
        : [];
      void r;
      const matched = topics.length
        ? topics.map((t) => {
            const row = (db.prepare("SELECT mastery, last_studied_at FROM topics WHERE course_id = ? AND name = ? COLLATE NOCASE").get(a.course_id as number, t) as { mastery: number; last_studied_at: string | null } | undefined);
            if (!row) return null;
            let v = row.mastery;
            if (row.last_studied_at) {
              const days = (Date.now() - new Date(row.last_studied_at).getTime()) / 86400000;
              if (days > 10) v -= Math.min(15, (days - 10) * 0.7);
            }
            return Math.max(0, v);
          }).filter((x): x is number => x !== null)
        : [];
      return {
        id: a.id, title: a.title, course_name: a.course_name, due_date: a.due_date,
        readiness: matched.length ? Math.round(matched.reduce((s, v) => s + v, 0) / matched.length) : null,
      };
    });

    const topicsStudied = (db.prepare("SELECT COUNT(*) AS n FROM topics WHERE last_studied_at IS NOT NULL").get() as { n: number }).n;
    return { stats, courses, weeks, mistakes, readiness, topicsStudied };
  });
}
