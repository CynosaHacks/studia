"use client";

import Link from "next/link";
import {
  ArrowUpRight, BookOpen, CalendarClock, ChevronRight, CircleCheck, CircleDashed, FileText,
  Layers, PlayCircle, Plus, Sparkles, StickyNote, Target,
} from "lucide-react";
import { useApi } from "@/lib/client";
import { MasteryBar, PageHeader, Ring, Spinner, daysLabel, fmtDate, courseColor, DemoBadge, EmptyState } from "@/components/ui";

type DashboardData = {
  name: string;
  priorities: Array<{ severity: "red" | "amber" | "green"; course: string; text: string; href: string }>;
  continueStudying: { courseId: number; courseName: string; topicId: number; topicName: string; reason: string; minutes: number } | null;
  assessments: Array<{ id: number; title: string; type: string; due_date: string; days_until: number | null; readiness: number | null; course_name: string; color: string; topics: string[] }>;
  courses: Array<{ id: number; name: string; color: string; mastery: number; topic_count: number; is_demo: number; weakest: { name: string; mastery: number } | null }>;
  plan: { planned: number; done: number; minutes: number };
  stats: { questions_attempted: number; flashcards_due: number; documents: number; notes: number };
  aiReady: boolean;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late studying";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { data, loading } = useApi<DashboardData>("/api/dashboard");

  if (loading && !data)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-6 w-6 text-indigo-500" />
      </div>
    );
  if (!data) return null;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={
          <span>
            {greeting()}, {data.name} 👋
          </span>
        }
        subtitle={
          data.plan.planned > 0
            ? `${data.plan.done} of ${data.plan.done + data.plan.planned} study blocks done today · ${data.plan.minutes} min planned`
            : "Here's what matters today."
        }
        actions={
          <Link href="/documents?upload=1" className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> Add School Material
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Today's priorities */}
        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-500" />
            <h2 className="text-[15px] font-semibold">Today&apos;s priorities</h2>
          </div>
          <div className="space-y-2.5">
            {data.priorities.map((p, i) => (
              <Link
                key={i}
                href={p.href}
                className="group flex items-start gap-3 rounded-lg border border-zinc-100 p-3 transition-colors hover:border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/40"
              >
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${p.severity === "red" ? "bg-rose-500" : p.severity === "amber" ? "bg-amber-500" : "bg-emerald-500"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">{p.course}</div>
                  <div className="text-[14px] leading-snug">{p.text}</div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-600" />
              </Link>
            ))}
          </div>
        </section>

        {/* Continue studying */}
        {data.continueStudying ? (
          <section className="card flex flex-col bg-gradient-to-b from-indigo-50/70 to-white p-5 dark:from-indigo-500/10 dark:to-zinc-900">
            <div className="mb-3 flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-indigo-500" />
              <h2 className="text-[15px] font-semibold">Continue studying</h2>
            </div>
            <div className="text-[15px] font-semibold">{data.continueStudying.topicName}</div>
            <div className="mt-0.5 text-[13px] text-zinc-500">{data.continueStudying.courseName}</div>
            <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{data.continueStudying.reason}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">~{data.continueStudying.minutes} min estimated</span>
              <Link
                href={`/practice?course=${data.continueStudying.courseId}&topic=${data.continueStudying.topicId}`}
                className="btn-primary btn-sm"
              >
                Start <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        ) : (
          <section className="card p-5 lg:col-span-1">
            <div className="mb-3 flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-indigo-500" />
              <h2 className="text-[15px] font-semibold">Continue studying</h2>
            </div>
            <EmptyState
              title="Nothing in progress yet"
              body="Generate practice or notes for a topic and Studia will pick up right where you left off."
            />
          </section>
        )}
      </div>

      {/* Upcoming assessments */}
      <section className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" /> Upcoming assessments</h2>
          <Link href="/assessments" className="text-[13px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">View all</Link>
        </div>
        {data.assessments.length === 0 ? (
          <div className="card p-5 text-[13.5px] text-zinc-500">
            No upcoming assessments. Import a test notification or{" "}
            <Link href="/assessments" className="text-indigo-600 hover:underline dark:text-indigo-400">add one manually</Link>.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.assessments.map((a) => {
              const c = courseColor(a.color);
              const urgent = (a.days_until ?? 99) <= 3;
              return (
                <Link key={a.id} href={`/assessments?a=${a.id}`} className="card card-hover group p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
                        <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                        <span className="truncate text-zinc-500">{a.course_name}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[14.5px] font-semibold">{a.title}</div>
                    </div>
                    {a.readiness !== null ? <Ring value={a.readiness} size={40} /> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{fmtDate(a.due_date)}</span>
                    <span className={`font-semibold ${urgent ? "text-rose-600 dark:text-rose-400" : "text-zinc-400"}`}>
                      {daysLabel(a.days_until)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Course overview */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" /> Academic overview</h2>
          <Link href="/courses" className="text-[13px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">Manage courses</Link>
        </div>
        {data.courses.length === 0 ? (
          <div className="card p-5 text-[13.5px] text-zinc-500">No courses yet — add your subjects in <Link href="/settings" className="text-indigo-600">Settings</Link> or import a syllabus.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.courses.map((c) => {
              const col = courseColor(c.color);
              return (
                <Link key={c.id} href={`/courses/${c.id}`} className="card card-hover group p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                        <span className="truncate text-[15px] font-semibold">{c.name}</span>
                        {c.is_demo ? <DemoBadge /> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400">{c.topic_count} topic{c.topic_count === 1 ? "" : "s"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold leading-none">{c.mastery}%</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-400">AI-estimated</div>
                    </div>
                  </div>
                  <MasteryBar value={c.mastery} className="mt-3" />
                  {c.weakest ? (
                    <div className="mt-2.5 text-[12px] text-zinc-500">
                      Focus next: <span className="font-medium text-zinc-700 dark:text-zinc-300">{c.weakest.name}</span> ({c.weakest.mastery}%)
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-zinc-400">
          Mastery percentages are AI-estimated study signals based on your practice and review history — they are not precise measurements of your ability.
        </p>
      </section>

      {/* Quick stats */}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<FileText className="h-4 w-4" />} label="Documents" value={data.stats.documents} href="/documents" />
        <StatCard icon={<StickyNote className="h-4 w-4" />} label="Notes" value={data.stats.notes} href="/notes" />
        <StatCard icon={<Layers className="h-4 w-4" />} label="Cards due" value={data.stats.flashcards_due} href="/flashcards" />
        <StatCard icon={<CircleCheck className="h-4 w-4" />} label="Questions attempted" value={data.stats.questions_attempted} href="/practice" />
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card card-hover flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">{icon}</div>
      <div>
        <div className="text-lg font-semibold leading-none">{value}</div>
        <div className="mt-1 text-xs text-zinc-500">{label}</div>
      </div>
    </Link>
  );
}
