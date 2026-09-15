import { db, nowISO } from "./db";

// Mastery is an AI-estimated study signal (0-100), never a precise measurement.

export function bumpMastery(
  topicId: number,
  delta: number,
  reason: string,
  source: string,
  isDemo = false
) {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId) as
    | { id: number; mastery: number; course_id: number; last_studied_at: string | null }
    | undefined;
  if (!topic) return;
  const previous = topic.mastery ?? 0;
  const value = Math.max(0, Math.min(100, previous + delta));
  db.prepare("UPDATE topics SET mastery = ?, last_studied_at = ? WHERE id = ?").run(
    value,
    nowISO(),
    topicId
  );
  db.prepare(
    "INSERT INTO mastery_records (topic_id, course_id, value, previous, reason, source, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(topicId, topic.course_id, value, previous, reason, source, isDemo ? 1 : 0, nowISO());
}

// After a practice attempt: pull mastery toward the observed result.
export function masteryFromAttempt(
  topicId: number,
  correct: boolean,
  score: number, // 0-100
  difficulty: string,
  attemptNumber: number
) {
  const kBase = correct ? (difficulty === "hard" || difficulty === "exam" || difficulty === "challenge" ? 0.22 : 0.15) : 0.18;
  const k = attemptNumber > 1 ? kBase * 0.5 : kBase;
  const delta = k * (score - 50) * (difficulty === "easy" ? 0.7 : 1);
  const reason = correct
    ? `Correct answer (attempt ${attemptNumber}, ${difficulty})`
    : `Needs work (attempt ${attemptNumber}, ${difficulty})`;
  bumpMastery(topicId, Math.round(delta * 10) / 10, reason, "practice");
}

export function recordMistake(
  courseId: number | null,
  topicId: number | null,
  description: string,
  tag: string | null,
  isDemo = false
) {
  if (!description.trim()) return;
  const existing = db
    .prepare("SELECT id, count FROM mistakes WHERE description = ? AND (course_id IS ? OR course_id = ?)")
    .get(description, courseId, courseId) as { id: number; count: number } | undefined;
  if (existing) {
    db.prepare("UPDATE mistakes SET count = count + 1, last_seen_at = ? WHERE id = ?").run(nowISO(), existing.id);
  } else {
    db.prepare(
      "INSERT INTO mistakes (course_id, topic_id, description, tag, count, is_demo, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)"
    ).run(courseId, topicId, description, tag, isDemo ? 1 : 0, nowISO(), nowISO());
  }
}

export function assessmentReadiness(courseId: number, topics: string[]): {
  score: number; hasTopics: boolean; weakTopics: string[];
} {
  const topicRows = (
    db.prepare("SELECT * FROM topics WHERE course_id = ?").all(courseId) as Array<{
      id: number; name: string; mastery: number; last_studied_at: string | null;
    }>
  ).map((t) => ({
    ...t,
    eff: effectiveOf(t.mastery, t.last_studied_at),
  }));
  if (!topics.length || !topicRows.length)
    return {
      score: topicRows.length ? avg(topicRows.map((t) => t.eff)) * 0.6 : 0,
      hasTopics: false,
      weakTopics: [],
    };
  const matched: typeof topicRows = [];
  for (const name of topics) {
    const t = topicRows.find((r) => r.name.toLowerCase() === name.toLowerCase()) ??
      topicRows.find((r) => r.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(r.name.toLowerCase()));
    if (t) matched.push(t);
  }
  const weak = matched.filter((t) => t.eff < 60).map((t) => t.name);
  if (!matched.length)
    return { score: avg(topicRows.map((t) => t.eff)) * 0.6, hasTopics: false, weakTopics: topics };
  return { score: Math.round(avg(matched.map((t) => t.eff))), hasTopics: true, weakTopics: weak };
}

function effectiveOf(m: number, last: string | null): number {
  let v = m ?? 0;
  if (last) {
    const days = (Date.now() - new Date(last).getTime()) / 86400000;
    if (days > 10) v -= Math.min(15, (days - 10) * 0.7);
  }
  return Math.max(0, Math.min(100, v));
}

function avg(xs: number[]): number {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
}
