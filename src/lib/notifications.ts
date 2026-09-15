import { db, daysUntil, todayLocal } from "./db";
import { courseTopics, effectiveMastery } from "./ai/context";
import { assessmentReadiness } from "./mastery";
import { dueCounts } from "./srs";
import { parseJSON } from "./db";

export type AppNotification = {
  id: string;
  severity: "red" | "amber" | "blue" | "green";
  title: string;
  body: string;
  href: string;
  actionLabel?: string;
};

// Notifications are computed from state, never stored → nothing accumulates, no spam.
export function computeNotifications(): AppNotification[] {
  const out: AppNotification[] = [];
  const assessments = db
    .prepare("SELECT * FROM assessments ORDER BY due_date IS NULL, due_date")
    .all() as Array<Record<string, unknown>>;
  const courseName = (id: unknown) =>
    (db.prepare("SELECT name FROM courses WHERE id = ?").get(id as number) as { name: string } | undefined)?.name ?? "Course";

  // 1) Assessments approaching
  for (const a of assessments) {
    const d = daysUntil(a.due_date as string);
    if (d === null || d < -1 || d > 14) continue;
    const topics = parseJSON<string[]>(a.topics as string, []);
    const readiness = a.course_id ? assessmentReadiness(a.course_id as number, topics) : null;
    const sev = d <= 2 ? "red" : d <= 7 ? "amber" : "blue";
    out.push({
      id: `assess-${a.id}`,
      severity: sev as AppNotification["severity"],
      title: `${courseName(a.course_id)}: ${a.title} ${d === 0 ? "is today" : d === 1 ? "is tomorrow" : `is in ${d} days`}`,
      body: readiness?.hasTopics
        ? `Estimated readiness: ${readiness.score}%. Focus topics: ${readiness.weakTopics.slice(0, 3).join(", ") || topics.slice(0, 3).join(", ")}`
        : "Review the assessment details and linked documents.",
      href: `/assessments?a=${a.id}`,
      actionLabel: "View assessment",
    });
  }

  // 2) Stale topics for soonest assessment
  const nextWithTopics = assessments
    .map((a) => ({ a, d: daysUntil(a.due_date as string) }))
    .filter((x) => x.d !== null && x.d > 0 && x.d <= 21 && parseJSON<string[]>(x.a.topics as string, []).length > 0)
    .sort((x, y) => (x.d as number) - (y.d as number))[0];
  if (nextWithTopics) {
    const topics = parseJSON<string[]>(nextWithTopics.a.topics as string, []);
    for (const tName of topics.slice(0, 20)) {
      const t = (db.prepare("SELECT * FROM topics WHERE name = ? COLLATE NOCASE").get(tName) as Record<string, unknown>) ?? null;
      if (t && t.last_studied_at) {
        const days = Math.floor((Date.now() - new Date(t.last_studied_at as string).getTime()) / 86400000);
        if (days >= 6) {
          out.push({
            id: `stale-${t.id}`,
            severity: "amber",
            title: `You haven't reviewed ${t.name} in ${days} days`,
            body: `It's on the ${String(nextWithTopics.a.title)} in ${nextWithTopics.d} days. A short refresher would help.`,
            href: `/courses/${t.course_id}`,
            actionLabel: "Open course",
          });
          break; // only one stale reminder at a time
        }
      }
    }
  }

  // 3) Recurring mistakes → targeted practice offer
  const topMistake = db
    .prepare("SELECT * FROM mistakes WHERE count >= 3 ORDER BY count DESC, last_seen_at DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  if (topMistake) {
    out.push({
      id: `mistake-${topMistake.id}`,
      severity: "amber",
      title: `Recurring: ${topMistake.description}`,
      body: `Seen ${topMistake.count} times recently. Want a short practice session targeting this?`,
      href: `/practice?mistake=${topMistake.id}`,
      actionLabel: "Practice this",
    });
  }

  // 4) Due flashcards
  const { due } = dueCounts();
  if (due > 0) {
    out.push({
      id: "flashcards-due",
      severity: "blue",
      title: `${due} flashcard${due === 1 ? "" : "s"} due for review`,
      body: "Keep your streak of retention going — a quick review session keeps forgetting at bay.",
      href: "/flashcards",
      actionLabel: "Review now",
    });
  }

  // 5) Docs awaiting confirmation
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM documents WHERE status = 'needs_course'")
    .get() as { n: number };
  if (pending.n > 0) {
    out.push({
      id: "docs-pending",
      severity: "amber",
      title: `${pending.n} document${pending.n === 1 ? "" : "s"} need${pending.n === 1 ? "s" : ""} your confirmation`,
      body: "Studia wasn't sure which course some imported material belongs to.",
      href: "/documents",
      actionLabel: "Review",
    });
  }

  return out.slice(0, 12);
}

// Rule-based "today's priorities" for the dashboard — works without AI configured.
export function todayPriorities(): Array<{
  severity: "red" | "amber" | "green";
  course: string;
  text: string;
  href: string;
}> {
  const out: Array<{ severity: "red" | "amber" | "green"; course: string; text: string; href: string }> = [];
  const assessments = db
    .prepare("SELECT * FROM assessments ORDER BY due_date IS NULL, due_date")
    .all() as Array<Record<string, unknown>>;

  for (const a of assessments) {
    const d = daysUntil(a.due_date as string);
    if (d === null || d < -1 || d > 21) continue;
    const cname = courseName(a.course_id);
    const topics = parseJSON<string[]>(a.topics as string, []);
    const readiness = a.course_id ? assessmentReadiness(a.course_id as number, topics) : null;
    if (readiness?.hasTopics && readiness.score < 70 && readiness.weakTopics.length) {
      out.push({
        severity: d <= 7 ? "red" : "amber",
        course: cname,
        text: `${a.title} in ${d} day${d === 1 ? "" : "s"} — ${readiness.weakTopics[0]} is your weakest tested topic.`,
        href: `/assessments?a=${a.id}`,
      });
    } else {
      out.push({
        severity: d <= 2 ? "red" : d <= 7 ? "amber" : "green",
        course: cname,
        text: `${a.title} — ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}${readiness?.hasTopics ? ` (readiness ${readiness.score}%)` : ""}.`,
        href: `/assessments?a=${a.id}`,
      });
    }
    if (out.length >= 4) break;
  }

  // Assignments without topics / with approaching dates
  if (out.length < 3) {
    const { due } = dueCounts();
    if (due > 0)
      out.push({ severity: "amber", course: "Flashcards", text: `${due} card${due === 1 ? "" : "s"} due for review.`, href: "/flashcards" });
  }
  if (!out.length)
    out.push({ severity: "green", course: "All clear", text: "No urgent work today. Review something you learned this week to keep it fresh.", href: "/planner" });
  return out;
}

export function continueStudying(): {
  courseId: number | null; courseName: string; topicId: number | null; topicName: string; reason: string; minutes: number;
} | null {
  // Most recently touched topic with lowest mastery, or weakest topic of the next assessment.
  const lastTopic = db
    .prepare("SELECT * FROM topics WHERE last_studied_at IS NOT NULL ORDER BY last_studied_at DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  const assessments = db
    .prepare("SELECT * FROM assessments WHERE due_date >= ? ORDER BY due_date LIMIT 1")
    .all(todayLocal()) as Array<Record<string, unknown>>;

  if (assessments.length) {
    const a = assessments[0];
    const topics = parseJSON<string[]>(a.topics as string, []);
    const rows = courseTopics(a.course_id as number);
    const matched = rows.filter((t) => topics.some((n) => n.toLowerCase() === t.name.toLowerCase()));
    const pool = matched.length ? matched : rows;
    const weakest = pool.sort((x, y) => effectiveMastery(x) - effectiveMastery(y))[0];
    if (weakest)
      return {
        courseId: a.course_id as number,
        courseName: courseName(a.course_id),
        topicId: weakest.id,
        topicName: weakest.name,
        reason: `Comes up in ${String(a.title)} — your lowest estimated mastery among its topics.`,
        minutes: 15,
      };
  }
  if (lastTopic) {
    return {
      courseId: lastTopic.course_id as number,
      courseName: courseName(lastTopic.course_id),
      topicId: lastTopic.id as number,
      topicName: lastTopic.name as string,
      reason: "You were working on this recently — keep the momentum.",
      minutes: 12,
    };
  }
  return null;
}

function courseName(id: unknown): string {
  return (db.prepare("SELECT name FROM courses WHERE id = ?").get(id as number) as { name: string } | undefined)?.name ?? "Course";
}
