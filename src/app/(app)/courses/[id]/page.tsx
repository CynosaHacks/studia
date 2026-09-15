"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  Bot, CalendarClock, FileText, Layers, ListChecks, Plus, Sparkles, StickyNote, X,
} from "lucide-react";
import { api, useApi } from "@/lib/client";
import { MasteryBar, PageHeader, Ring, Spinner, daysLabel, fmtDate, courseColor, DemoBadge, Modal, Field, EmptyState, Badge } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
type CourseData = {
  course: { id: number; name: string; teacher: string; description: string; color: string; is_demo: number };
  units: Array<{ id: number; name: string; status: string }>;
  topics: Array<{ id: number; name: string; mastery: number; effective_mastery: number; status: string; unit_id: number | null; last_studied_at: string | null }>;
  documents: Array<{ id: number; title: string; doc_type: string; is_demo: number }>;
  notes: Array<{ id: number; title: string; kind: string; is_demo: number }>;
  decks: Array<{ id: number; title: string; card_count: number }>;
  sets: Array<{ id: number; title: string; difficulty: string; question_count: number; created_at: string }>;
  assessments: Array<{ id: number; title: string; type: string; due_date: string; days_until: number | null; readiness: number | null; weak_topics: string[] }>;
  mistakes: Array<{ id: number; description: string; count: number; tag: string | null }>;
};

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useApi<CourseData>(`/api/courses/${id}`);
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading && !data)
    return <div className="flex h-64 items-center justify-center"><Spinner className="h-6 w-6 text-indigo-500" /></div>;
  if (error || !data)
    return (
      <EmptyState
        title="Course not found"
        body={error ?? "This course may have been deleted."}
        action={<Link href="/courses" className="btn-primary btn-sm">Back to My Courses</Link>}
      />
    );

  const c = data.course;
  const col = courseColor(c.color);
  const avg = data.topics.length ? Math.round(data.topics.reduce((s, t) => s + t.effective_mastery, 0) / data.topics.length) : 0;

  async function loadInsights() {
    setInsightsBusy(true);
    try {
      const r = await api<{ insights: string }>(`/api/courses/${id}/insights`, { body: {} });
      setInsights(r.insights);
    } catch (e) {
      setInsights(`⚠️ ${(e as Error).message}`);
    }
    setInsightsBusy(false);
  }

  async function addTopic() {
    if (!topicName.trim()) return;
    setBusy(true);
    try {
      await api(`/api/courses/${id}`, { body: { name: topicName.trim() } });
      setTopicName("");
      setAddingTopic(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${col.soft} ${col.text}`}>
            <span className="text-lg font-bold">{c.name.charAt(0)}</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
              {c.is_demo ? <DemoBadge /> : null}
            </div>
            {c.teacher ? <p className="mt-0.5 text-[13px] text-zinc-500">{c.teacher}</p> : null}
            {c.description ? <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{c.description}</p> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/practice?course=${c.id}`} className="btn-secondary btn-sm"><ListChecks className="h-4 w-4" /> Practice</Link>
          <Link href={`/notes?course=${c.id}`} className="btn-secondary btn-sm"><StickyNote className="h-4 w-4" /> Notes</Link>
          <Link href={`/flashcards?course=${c.id}`} className="btn-secondary btn-sm"><Layers className="h-4 w-4" /> Flashcards</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Topics */}
        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Topics</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">avg {avg}%</span>
              <button className="btn-ghost btn-sm" onClick={() => setAddingTopic(true)}><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
          </div>
          {data.topics.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-zinc-500">
              No topics yet. Import a syllabus or worksheet in <Link href="/documents" className="text-indigo-600 dark:text-indigo-400">Documents</Link> and Studia will extract them automatically.
            </p>
          ) : (
            <div className="space-y-3">
              {data.units.map((u) => {
                const unitTopics = data.topics.filter((t) => t.unit_id === u.id);
                const orphans = data.topics.filter((t) => !t.unit_id || !data.units.some((x) => x.id === t.unit_id));
                return (
                  <div key={u.id}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">{u.name}</span>
                      {u.status !== "current" ? <Badge tone="zinc">{u.status}</Badge> : null}
                    </div>
                    <div className="space-y-2">
                      {unitTopics.map((t) => (
                        <TopicRow key={t.id} t={t} onPracticed={refresh} />
                      ))}
                      {u.id === data.units[0]?.id ? orphans.map((t) => <TopicRow key={t.id} t={t} onPracticed={refresh} />) : null}
                    </div>
                  </div>
                );
              })}
              {data.units.length === 0
                ? data.topics.map((t) => <TopicRow key={t.id} t={t} onPracticed={refresh} />)
                : null}
            </div>
          )}
        </section>

        {/* Right column */}
        <div className="space-y-4">
          {/* AI insights */}
          <section className="card p-5">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <h2 className="text-[15px] font-semibold">AI insights</h2>
            </div>
            {insights ? (
              <Markdown>{insights}</Markdown>
            ) : (
              <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Get a quick read on strengths, weak spots and what to do next — based on your practice history and upcoming work.
              </p>
            )}
            <button className="btn-secondary btn-sm mt-3 w-full" onClick={loadInsights} disabled={insightsBusy}>
              {insightsBusy ? <Spinner /> : <Bot className="h-4 w-4" />} {insights ? "Refresh insights" : "Generate insights"}
            </button>
          </section>

          {/* Assessments */}
          <section className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-rose-500" />
              <h2 className="text-[15px] font-semibold">Upcoming</h2>
            </div>
            {data.assessments.length === 0 ? (
              <p className="text-[13px] text-zinc-500">No assessments for this course.</p>
            ) : (
              <div className="space-y-2.5">
                {data.assessments.map((a) => (
                  <Link key={a.id} href={`/assessments?a=${a.id}`} className="flex items-center gap-3 rounded-lg border border-zinc-100 p-2.5 transition hover:border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
                    {a.readiness !== null ? <Ring value={a.readiness} size={36} stroke={4} /> : <div className="h-9 w-1" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium">{a.title}</div>
                      <div className="text-xs text-zinc-500">{fmtDate(a.due_date)} · {daysLabel(a.days_until)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Mistakes */}
          {data.mistakes.length ? (
            <section className="card p-5">
              <h2 className="mb-2.5 text-[15px] font-semibold">Recurring mistakes</h2>
              <div className="space-y-1.5">
                {data.mistakes.slice(0, 5).map((m) => (
                  <div key={m.id} className="flex items-start gap-2 text-[13px]">
                    <span className="badge bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">×{m.count}</span>
                    <span className="leading-snug text-zinc-600 dark:text-zinc-300">{m.description}</span>
                  </div>
                ))}
              </div>
              <Link href={`/practice?course=${c.id}`} className="btn-secondary btn-sm mt-3 w-full">Practice weak spots</Link>
            </section>
          ) : null}
        </div>
      </div>

      {/* Documents + Notes + Decks */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-sky-500" /><h2 className="text-[15px] font-semibold">Documents</h2></div>
          {data.documents.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Nothing imported yet.</p>
          ) : (
            <div className="space-y-1">
              {data.documents.slice(0, 6).map((d) => (
                <Link key={d.id} href={`/documents?doc=${d.id}`} className="block truncate rounded-md px-2 py-1.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  {d.title}
                </Link>
              ))}
            </div>
          )}
          <Link href={`/documents?course=${c.id}`} className="btn-ghost btn-sm mt-2 w-full">View all documents</Link>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2"><StickyNote className="h-4 w-4 text-amber-500" /><h2 className="text-[15px] font-semibold">Notes</h2></div>
          {data.notes.length === 0 ? (
            <p className="text-[13px] text-zinc-500">No notes yet — generate some from your material.</p>
          ) : (
            <div className="space-y-1">
              {data.notes.slice(0, 6).map((n) => (
                <Link key={n.id} href={`/notes?note=${n.id}`} className="block truncate rounded-md px-2 py-1.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  {n.title}
                </Link>
              ))}
            </div>
          )}
          <Link href={`/notes?course=${c.id}`} className="btn-ghost btn-sm mt-2 w-full">View all notes</Link>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2"><Layers className="h-4 w-4 text-violet-500" /><h2 className="text-[15px] font-semibold">Flashcard decks</h2></div>
          {data.decks.length === 0 ? (
            <p className="text-[13px] text-zinc-500">No decks yet.</p>
          ) : (
            <div className="space-y-1">
              {data.decks.slice(0, 6).map((d) => (
                <Link key={d.id} href={`/flashcards?deck=${d.id}`} className="flex justify-between rounded-md px-2 py-1.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  <span className="truncate">{d.title}</span>
                  <span className="ml-2 shrink-0 text-zinc-400">{d.card_count}</span>
                </Link>
              ))}
            </div>
          )}
          <Link href={`/flashcards?course=${c.id}`} className="btn-ghost btn-sm mt-2 w-full">Manage flashcards</Link>
        </section>
      </div>

      {/* Recent practice */}
      {data.sets.length ? (
        <section className="mt-4">
          <h2 className="section-title mb-3">Recent practice sets</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.sets.slice(0, 6).map((s) => (
              <Link key={s.id} href={`/practice?set=${s.id}`} className="card card-hover p-4">
                <div className="truncate text-[14px] font-medium">{s.title}</div>
                <div className="mt-1 text-xs text-zinc-400">{s.question_count} questions · {s.difficulty}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <Modal open={addingTopic} onClose={() => setAddingTopic(false)} title="Add a topic">
        <Field label="Topic name">
          <input className="input" value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="e.g. Completing the square" autoFocus
            onKeyDown={(e) => e.key === "Enter" && addTopic()} />
        </Field>
        <div className="flex justify-end"><button className="btn-primary" onClick={addTopic} disabled={busy || !topicName.trim()}>Add topic</button></div>
      </Modal>
    </div>
  );
}

function TopicRow({ t, onPracticed }: { t: CourseData["topics"][number]; onPracticed: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group rounded-lg border border-zinc-100 px-3 py-2.5 transition hover:border-zinc-200 dark:border-zinc-800 dark:hover:border-zinc-700">
      <div className="flex items-center gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-medium">{t.name}</span>
            <span className="shrink-0 text-[13px] font-semibold text-zinc-500">{t.effective_mastery}%</span>
          </div>
          <MasteryBar value={t.effective_mastery} className="mt-1.5" />
        </button>
        <Link
          href={`/practice?topic=${t.id}`}
          onClick={onPracticed}
          className="btn-ghost btn-sm opacity-0 transition group-hover:opacity-100"
          title="Practice this topic"
        >
          <ListChecks className="h-3.5 w-3.5" />
        </Link>
      </div>
      {open ? (
        <div className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
          Stored mastery: {Math.round(t.mastery)}% · Status: {t.status}
          {t.last_studied_at ? ` · Last studied ${new Date(t.last_studied_at).toLocaleDateString()}` : " · Not studied yet"}
          <div className="mt-1 text-[11px] text-zinc-400">Mastery is an AI-estimated signal — recency and difficulty adjust it over time.</div>
        </div>
      ) : null}
    </div>
  );
}
