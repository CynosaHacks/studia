"use client";

import { Brain, CheckCircle2, Clock, Flame, Layers, ListChecks, Target, TrendingUp } from "lucide-react";
import { useApi } from "@/lib/client";
import { MasteryBar, PageHeader, Ring, Spinner, fmtDate, courseColor } from "@/components/ui";

type ProgressData = {
  stats: {
    questions_attempted: number; attempts_total: number; first_try_correct: number; first_try_total: number;
    flashcards_total: number; flashcard_reviews: number; flashcards_mastered: number;
    study_minutes: number; sessions_done: number; documents: number; notes: number;
  };
  courses: Array<{ id: number; name: string; color: string; mastery: number; topics: Array<{ id: number; name: string; mastery: number; status: string }> }>;
  weeks: Array<{ date: string; avg: number }>;
  mistakes: Array<{ id: number; description: string; count: number; course_name: string | null; topic_name: string | null; tag: string | null }>;
  readiness: Array<{ id: number; title: string; course_name: string | null; due_date: string; readiness: number | null }>;
  topicsStudied: number;
};

export default function ProgressPage() {
  const { data, loading } = useApi<ProgressData>("/api/progress");

  if (loading && !data)
    return <div className="flex h-64 items-center justify-center"><Spinner className="h-6 w-6 text-indigo-500" /></div>;
  if (!data) return null;

  const acc = data.stats.first_try_total ? Math.round((data.stats.first_try_correct / data.stats.first_try_total) * 100) : null;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Progress"
        subtitle="How your studying is going — remember, mastery numbers are AI-estimated study signals, not grades."
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<ListChecks className="h-4 w-4" />} label="Questions attempted" value={String(data.stats.questions_attempted)} sub={`${data.stats.attempts_total} total answers`} />
        <Stat icon={<Target className="h-4 w-4" />} label="First-try accuracy" value={acc !== null ? `${acc}%` : "—"} sub={`${data.stats.first_try_correct}/${data.stats.first_try_total} correct`} />
        <Stat icon={<Layers className="h-4 w-4" />} label="Flashcard reviews" value={String(data.stats.flashcard_reviews)} sub={`${data.stats.flashcards_mastered} cards mastered`} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Study time (logged)" value={`${Math.round(data.stats.study_minutes / 6) / 10}h`} sub={`${data.stats.sessions_done} sessions completed`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Mastery over time */}
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><TrendingUp className="h-4 w-4 text-indigo-500" /> Estimated mastery over time</h2>
          {data.weeks.length < 2 ? (
            <p className="py-10 text-center text-[13px] text-zinc-500">Practice a bit more to unlock the trend line.</p>
          ) : (
            <LineChart data={data.weeks.map((w) => ({ x: w.date, y: w.avg }))} />
          )}
        </section>

        {/* Assessment readiness */}
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Assessment readiness</h2>
          {data.readiness.length === 0 ? (
            <p className="text-[13px] text-zinc-500">No upcoming assessments.</p>
          ) : (
            <div className="space-y-3">
              {data.readiness.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  {r.readiness !== null ? <Ring value={r.readiness} size={38} stroke={4} /> : <div className="text-xs text-zinc-400">—</div>}
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{r.title}</div>
                    <div className="text-[11.5px] text-zinc-400">{r.course_name} · {fmtDate(r.due_date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Course mastery */}
      <section className="card mt-4 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><Brain className="h-4 w-4 text-violet-500" /> Topic mastery by course</h2>
        {data.courses.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No courses yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {data.courses.map((c) => {
              const col = courseColor(c.color);
              return (
                <div key={c.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                      <span className={`h-2 w-2 rounded-full ${col.dot}`} /> {c.name}
                    </span>
                    <span className="text-[13px] font-semibold text-zinc-500">{c.mastery}%</span>
                  </div>
                  <div className="space-y-2">
                    {c.topics.slice(0, 8).map((t) => (
                      <div key={t.id}>
                        <div className="flex items-baseline justify-between text-[12px]">
                          <span className="truncate text-zinc-600 dark:text-zinc-300">{t.name}</span>
                          <span className="ml-2 shrink-0 text-zinc-400">{t.mastery}%</span>
                        </div>
                        <MasteryBar value={t.mastery} className="mt-1" />
                      </div>
                    ))}
                    {c.topics.length === 0 ? <p className="text-xs text-zinc-400">No topics yet.</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recurring mistakes */}
      <section className="card mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><Flame className="h-4 w-4 text-rose-500" /> Recurring mistakes</h2>
        {data.mistakes.length === 0 ? (
          <p className="text-[13px] text-zinc-500">Nothing recurring yet — mistakes you repeat will show up here so you can target them.</p>
        ) : (
          <div className="space-y-2">
            {data.mistakes.map((m) => (
              <div key={m.id} className="flex items-start gap-3 rounded-lg border border-zinc-100 px-3.5 py-2.5 dark:border-zinc-800">
                <span className={`badge shrink-0 ${m.count >= 4 ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>×{m.count}</span>
                <div className="min-w-0">
                  <span className="text-[13.5px] leading-snug">{m.description}</span>
                  <span className="block text-[11.5px] text-zinc-400">{[m.course_name, m.topic_name].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-zinc-400">
        {icon}
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-zinc-400">{sub}</div>
    </div>
  );
}

function LineChart({ data }: { data: Array<{ x: string; y: number }> }) {
  const w = 560;
  const h = 180;
  const padX = 30;
  const padY = 16;
  const xs = data.map((_, i) => padX + (i * (w - padX * 2)) / Math.max(1, data.length - 1));
  const ys = data.map((d) => h - padY - (d.y / 100) * (h - padY * 2));
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${path} L${xs[xs.length - 1]},${h - padY} L${xs[0]},${h - padY} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {[0, 25, 50, 75, 100].map((g) => {
        const y = h - padY - (g / 100) * (h - padY * 2);
        return (
          <g key={g}>
            <line x1={padX} x2={w - padX} y1={y} y2={y} stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" strokeWidth={1} />
            <text x={4} y={y + 3} className="fill-zinc-400 text-[9px]">{g}</text>
          </g>
        );
      })}
      <path d={area} fill="url(#grad)" opacity={0.25} />
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={3.5} fill="#6366f1" stroke="white" strokeWidth={1.5}>
          <title>{`${data[i].x}: ${data[i].y}%`}</title>
        </circle>
      ))}
      <text x={padX} y={h - 2} className="fill-zinc-400 text-[9px]">{data[0].x}</text>
      <text x={w - padX} y={h - 2} textAnchor="end" className="fill-zinc-400 text-[9px]">{data[data.length - 1].x}</text>
    </svg>
  );
}
