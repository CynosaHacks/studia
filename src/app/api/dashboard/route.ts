import { db, todayLocal, parseJSON, daysUntil, getProfile } from "@/lib/db";
import { handle } from "@/lib/api";
import { todayPriorities, continueStudying } from "@/lib/notifications";
import { courseMastery, courseTopics, effectiveMastery, listCourses } from "@/lib/ai/context";
import { dueCounts } from "@/lib/srs";
import { todayPlanStatus } from "@/lib/planner";
import { assessmentReadiness } from "@/lib/mastery";
import { hasAI } from "@/lib/ai/client";

export async function GET() {
  return handle(() => {
    const profile = getProfile();
    const priorities = todayPriorities();
    const cont = continueStudying();

    const assessments = (
      db.prepare("SELECT a.*, c.name AS course_name, c.color FROM assessments a LEFT JOIN courses c ON c.id = a.course_id WHERE a.due_date IS NOT NULL AND a.due_date >= ? ORDER BY a.due_date LIMIT 5").all(todayLocal()) as Array<Record<string, unknown>>
    ).map((a) => {
      const topics = parseJSON<string[]>(a.topics as string, []);
      const res = a.course_id ? assessmentReadiness(a.course_id as number, topics) : { score: 0, hasTopics: false, weakTopics: [] };
      return { ...a, days_until: daysUntil(a.due_date as string), readiness: res.hasTopics ? res.score : null, weak_topics: res.weakTopics };
    });

    const courses = listCourses().map((c) => {
      const topics = courseTopics(c.id as number);
      const weakest = [...topics].sort((a, b) => effectiveMastery(a) - effectiveMastery(b))[0];
      return {
        id: c.id, name: c.name, color: c.color, is_demo: c.is_demo,
        mastery: courseMastery(c.id as number),
        topic_count: topics.length,
        weakest: weakest ? { name: weakest.name, mastery: effectiveMastery(weakest) } : null,
      };
    });

    const plan = todayPlanStatus(todayLocal());
    const flash = dueCounts();
    const stats = {
      questions_attempted: (db.prepare("SELECT COUNT(DISTINCT question_id) AS n FROM attempts").get() as { n: number }).n,
      flashcards_due: flash.due,
      documents: (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n,
      notes: (db.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }).n,
    };

    return {
      name: profile?.name ?? "Student",
      onboarded: !!profile?.onboarded,
      priorities,
      continueStudying: cont,
      assessments,
      courses,
      plan,
      stats,
      aiReady: hasAI(),
    };
  });
}
