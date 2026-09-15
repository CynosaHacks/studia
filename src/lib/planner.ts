import { db, nowISO, todayLocal, daysUntil, parseJSON } from "./db";
import { courseTopics, effectiveMastery, listCourses } from "./ai/context";
import { assessmentReadiness } from "./mastery";
import { hasAI, chatJSON } from "./ai/client";
import { dueCounts } from "./srs";

export type PlanItem = {
  courseId: number | null;
  courseName: string;
  topicId: number | null;
  topicName: string | null;
  activity: string;
  kind: "review" | "flashcards" | "practice" | "notes" | "drill";
  minutes: number;
};

type AssessRow = {
  id: number; course_id: number; title: string; type: string; due_date: string | null; topics: string;
};

// Deterministic plan builder — reliable without AI, AI only re-weights later.
export function buildPlanItems(date: string, totalMinutes: number): PlanItem[] {
  const items: PlanItem[] = [];
  const assessments = (
    db.prepare("SELECT * FROM assessments WHERE due_date IS NOT NULL AND due_date >= ? ORDER BY due_date").all(date) as unknown as AssessRow[]
  ).filter((a) => (daysUntil(a.due_date) ?? 99) <= 30);

  const courseById = (id: number) =>
    (db.prepare("SELECT name FROM courses WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "Course";

  // 1) Flashcards due first (short)
  const { due } = dueCounts();
  if (due > 0 && totalMinutes >= 20) {
    items.push({
      courseId: null, courseName: "Review", topicId: null, topicName: null,
      activity: `Clear due flashcards (${due} waiting)`, kind: "flashcards", minutes: 10,
    });
  }

  // 2) Assessments, most urgent first; split time by need
  const budget = totalMinutes - (items.reduce((s, i) => s + i.minutes, 0));
  const candidates = assessments.slice(0, 3);
  if (candidates.length) {
    const weighted = candidates.map((a) => {
      const topics = parseJSON<string[]>(a.topics, []);
      const r = assessmentReadiness(a.course_id, topics);
      const days = Math.max(1, daysUntil(a.due_date) ?? 7);
      const urgency = r.hasTopics ? (100 - r.score) / days + 1.2 : 1.6 / days + 1;
      return { a, topics, r, urgency };
    });
    const wsum = weighted.reduce((s, w) => s + w.urgency, 0);
    for (const w of weighted) {
      let mins = Math.round((budget * w.urgency) / wsum / 5) * 5;
      mins = Math.max(10, Math.min(45, mins));
      const weak = w.r.weakTopics[0] ?? w.topics[0];
      const weakTopicRow = weak
        ? courseTopics(w.a.course_id).find((t) => t.name.toLowerCase() === weak.toLowerCase()) ?? null
        : null;
      items.push({
        courseId: w.a.course_id,
        courseName: courseById(w.a.course_id),
        topicId: weakTopicRow?.id ?? null,
        topicName: weakTopicRow?.name ?? weak ?? null,
        activity: `${courseById(w.a.course_id)} — ${weak ? weak : "review upcoming assessment topics"}`,
        kind: "practice",
        minutes: mins,
      });
    }
  }

  // 3) Stale topic review if time remains
  const used = items.reduce((s, i) => s + i.minutes, 0);
  const remaining = totalMinutes - used;
  if (remaining >= 10) {
    const stale = (db.prepare(
      "SELECT * FROM topics WHERE last_studied_at IS NOT NULL ORDER BY last_studied_at ASC LIMIT 1"
    ).get() as Record<string, unknown>) ?? (db.prepare("SELECT * FROM topics ORDER BY mastery ASC LIMIT 1").get() as Record<string, unknown>);
    if (stale) {
      const staleCourseId = stale.course_id as number;
      const staleName = stale.name as string;
      items.push({
        courseId: staleCourseId,
        courseName: courseById(staleCourseId),
        topicId: stale.id as number,
        topicName: staleName,
        activity: `${courseById(staleCourseId)} — quick review: ${staleName}`,
        kind: "review",
        minutes: Math.min(15, remaining),
      });
    }
  }

  return items;
}

export async function generatePlan(date: string, minutes: number, useAI: boolean): Promise<PlanItem[]> {
  let items = buildPlanItems(date, minutes);

  if (useAI && hasAI() && items.length) {
    try {
      const courses = listCourses()
        .map((c) => {
          const t = courseTopics(c.id as number)
            .map((t) => `${t.name} (${effectiveMastery(t)}%)`)
            .join(", ");
          return `${c.name}: ${t || "no topics"}`;
        })
        .join("\n");
      const assessmentLines = (
        db.prepare("SELECT * FROM assessments WHERE due_date IS NOT NULL AND due_date >= ? ORDER BY due_date").all(date) as unknown as AssessRow[]
      )
        .slice(0, 5)
        .map((a) => `${a.title} (${courseById(a.course_id)}, ${a.due_date}, topics: ${a.topics})`)
        .join("\n");

      const res = await chatJSON<{ plan: Array<{ course: string; topic?: string; activity: string; kind?: string; minutes: number }> }>(
        [
          {
            role: "system",
            content:
              "You are a study coach. Build a realistic study plan. Reply ONLY JSON: {\"plan\":[{\"course\":\"\",\"topic\":\"\",\"activity\":\"\",\"kind\":\"review|flashcards|practice|notes|drill\",\"minutes\":15}]}. Keep total minutes <= the allowed budget. Use the student's weakest topics and upcoming assessments. Be specific about activities.",
          },
          {
            role: "user",
            content: `Date: ${date}\nTotal minutes available: ${minutes}\n\nCOURSES & TOPICS (mastery):\n${courses}\n\nUPCOMING ASSESSMENTS:\n${assessmentLines || "(none)"}\n\nProposed deterministic plan:\n${JSON.stringify(items)}`,
          },
        ],
        { temperature: 0.3, maxTokens: 1200 }
      );
      if (res?.plan?.length) {
        const allCourses = listCourses() as Array<{ id: number; name: string }>;
        const allTopics = db.prepare("SELECT * FROM topics").all() as Array<{ id: number; name: string; course_id: number }>;
        items = res.plan.slice(0, 8).map((p) => {
          const c = allCourses.find((x) => x.name.toLowerCase().includes(String(p.course).toLowerCase()) || String(p.course).toLowerCase().includes(x.name.toLowerCase()));
          const t = p.topic ? allTopics.find((x) => x.name.toLowerCase() === String(p.topic).toLowerCase() || String(p.topic).toLowerCase().includes(x.name.toLowerCase())) : undefined;
          const kind = ["review", "flashcards", "practice", "notes", "drill"].includes(String(p.kind)) ? (p.kind as PlanItem["kind"]) : "practice";
          return {
            courseId: c?.id ?? t?.course_id ?? null,
            courseName: c?.name ?? String(p.course),
            topicId: t?.id ?? null,
            topicName: t?.name ?? p.topic ?? null,
            activity: p.activity,
            kind,
            minutes: Math.max(5, Math.min(60, Math.round(p.minutes))),
          };
        });
      }
    } catch {
      // fall back to deterministic plan silently
    }
  }
  return items;
}

export function savePlan(date: string, items: PlanItem[]) {
  db.prepare("DELETE FROM study_sessions WHERE plan_date = ? AND status = 'planned' AND is_demo = 0").run(date);
  const ins = db.prepare(
    "INSERT INTO study_sessions (course_id, topic_id, plan_date, activity, kind, minutes, status, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, 'planned', 0, ?)"
  );
  for (const it of items) {
    ins.run(it.courseId, it.topicId, date, it.activity, it.kind, it.minutes, nowISO());
  }
}

function courseById(id: number): string {
  return (db.prepare("SELECT name FROM courses WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "Course";
}

export function todayPlanStatus(date: string): { planned: number; done: number; minutes: number } {
  const rows = db.prepare("SELECT status, minutes FROM study_sessions WHERE plan_date = ?").all(date) as Array<{ status: string; minutes: number }>;
  return {
    planned: rows.filter((r) => r.status !== "done").length,
    done: rows.filter((r) => r.status === "done").length,
    minutes: rows.reduce((s, r) => s + r.minutes, 0),
  };
}

export function recommendedForAssessment(a: AssessRow): Array<{ activity: string; minutes: number }> {
  const topics = parseJSON<string[]>(a.topics, []);
  const days = Math.max(1, daysUntil(a.due_date) ?? 7);
  const r = assessmentReadiness(a.course_id, topics);
  const weak = r.weakTopics.length ? r.weakTopics : topics.slice(0, 2);
  const out: Array<{ activity: string; minutes: number }> = [];
  const perDay = Math.min(40, Math.max(15, Math.round((100 - (r.hasTopics ? r.score : 50)) / 2)));
  for (const t of weak.slice(0, 3)) {
    out.push({ activity: `Practice: ${t} (targeted questions)`, minutes: perDay });
    out.push({ activity: `Review notes: ${t}`, minutes: Math.max(10, Math.round(perDay / 2)) });
  }
  if (days >= 3)
    out.push({ activity: `Final review of all ${a.title} topics (day before)`, minutes: 30 });
  return out.slice(0, 7);
}

export { courseById };
