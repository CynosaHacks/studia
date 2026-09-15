"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, FileText, Plus, Target } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, ErrorNote, Field, Modal, PageHeader, Ring, Spinner, daysLabel, fmtDate, courseColor, DemoBadge, Toast } from "@/components/ui";
import { Markdown } from "@/components/Markdown";

type Assess = {
  id: number; title: string; type: string; due_date: string | null; weighting: number | null; topics: string[];
  format: string; required_materials: string; notes: string | null; course_name: string | null; color: string | null;
  days_until: number | null; readiness: number | null; weak_topics: string[]; is_demo?: number;
};
type AssessDetail = {
  assessment: Assess & { has_topics: boolean };
  topicDetail: Array<{ name: string; mastery: number; topicId: number | null }>;
  documents: Array<{ id: number; title: string; doc_type: string; status: string }>;
  plan: Array<{ activity: string; minutes: number }>;
};

export default function AssessmentsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { data, refresh } = useApi<{ assessments: Assess[] }>("/api/assessments");
  const { data: coursesData } = useApi<{ courses: Array<{ id: number; name: string }> }>("/api/courses");
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [view, setView] = useState<"list" | "calendar">("list");

  useEffect(() => {
    const a = search.get("a");
    if (a) setSelected(Number(a));
  }, [search]);

  const items = data?.assessments ?? [];
  const upcoming = items.filter((a) => (a.days_until ?? -99) >= 0);
  const past = items.filter((a) => (a.days_until ?? -99) < 0);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Tests & Assignments"
        subtitle="Deadlines, readiness estimates and study plans — detected from your documents or added manually."
        actions={
          <>
            <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
              <button className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === "list" ? "bg-zinc-100 dark:bg-zinc-800" : "text-zinc-500"}`} onClick={() => setView("list")}>List</button>
              <button className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === "calendar" ? "bg-zinc-100 dark:bg-zinc-800" : "text-zinc-500"}`} onClick={() => setView("calendar")}><CalendarDays className="h-3.5 w-3.5" /></button>
            </div>
            <button className="btn-primary btn-sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add assessment</button>
          </>
        }
      />

      {view === "calendar" ? (
        <CalendarView month={calMonth} onPrev={() => shiftMonth(calMonth, -1)} onNext={() => shiftMonth(calMonth, 1)} onOpen={(id) => setSelected(id)} />
      ) : (
        <>
          {upcoming.length === 0 ? (
            <div className="card p-6 text-center text-[13.5px] text-zinc-500">
              Nothing upcoming. Import a test notification in <a href="/documents?upload=1" className="text-indigo-600 dark:text-indigo-400">Documents</a> and Studia will detect assessments automatically.
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((a) => <AssessCard key={a.id} a={a} onOpen={() => setSelected(a.id)} />)}
            </div>
          )}
          {past.length ? (
            <div className="mt-6">
              <h2 className="section-title mb-2.5">Past</h2>
              <div className="space-y-2 opacity-70">
                {past.slice(0, 8).map((a) => <AssessCard key={a.id} a={a} onOpen={() => setSelected(a.id)} compact />)}
              </div>
            </div>
          ) : null}
        </>
      )}

      {adding ? (
        <AddAssessmentModal
          courses={coursesData?.courses ?? []}
          onClose={() => setAdding(false)}
          onCreated={(id) => { setAdding(false); refresh(); setSelected(id); }}
        />
      ) : null}

      {selected ? (
        <AssessmentDetail
          id={selected}
          onClose={() => { setSelected(null); refresh(); router.replace("/assessments"); }}
        />
      ) : null}
    </div>
  );
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function AssessCard({ a, onOpen, compact }: { a: Assess; onOpen: () => void; compact?: boolean }) {
  const col = courseColor(a.color);
  const urgent = (a.days_until ?? 99) <= 3;
  return (
    <button onClick={onOpen} className={`card card-hover flex w-full items-center gap-4 p-4 text-left ${compact ? "py-3" : ""}`}>
      {a.readiness !== null ? <Ring value={a.readiness} size={compact ? 38 : 46} /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${col.dot}`} />
          <span className="text-[12.5px] font-medium text-zinc-500">{a.course_name ?? "No course"}</span>
          <Badge tone={a.type === "test" || a.type === "exam" ? "rose" : "sky"}>{a.type}</Badge>
          {a.weighting ? <Badge tone="zinc">{a.weighting}%</Badge> : null}
          {a.is_demo ? <DemoBadge /> : null}
        </div>
        <div className={`mt-0.5 truncate font-semibold ${compact ? "text-[14px]" : "text-[15.5px]"}`}>{a.title}</div>
        {a.weak_topics?.length && !compact ? (
          <div className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">Focus: {a.weak_topics.slice(0, 3).join(", ")}</div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[13px] text-zinc-500">{fmtDate(a.due_date)}</div>
        <div className={`text-xs font-semibold ${urgent ? "text-rose-600 dark:text-rose-400" : "text-zinc-400"}`}>{daysLabel(a.days_until)}</div>
      </div>
    </button>
  );
}

function CalendarView({ month, onPrev, onNext, onOpen }: { month: string; onPrev: () => void; onNext: () => void; onOpen: (id: number) => void }) {
  const { data, loading } = useApi<{ assessments: Array<{ id: number; title: string; type: string; due_date: string; course_name: string; color: string }>; sessions: Array<{ id: number; plan_date: string; activity: string; status: string; minutes: number }> }>(`/api/calendar?month=${month}`);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startPad = (first.getDay() + 6) % 7; // Monday start
  const cells: Array<number | null> = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay: Record<string, { title: string; type: string; color: string; id: number }[]> = {};
  for (const a of data?.assessments ?? []) {
    const d = a.due_date.slice(8, 10);
    (byDay[d] ??= []).push({ title: a.title, type: a.type, color: a.color, id: a.id });
  }
  const sessByDay: Record<string, { activity: string; status: string; minutes: number }[]> = {};
  for (const s of data?.sessions ?? []) {
    (sessByDay[s.plan_date.slice(8, 10)] ??= []).push(s);
  }
  const today = new Date();
  const isThisMonth = today.getFullYear() === y && today.getMonth() + 1 === m;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button className="btn-ghost btn-sm" onClick={onPrev}><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-[15px] font-semibold">{first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button className="btn-ghost btn-sm" onClick={onNext}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-zinc-400">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          const key = String(day ?? "").padStart(2, "0");
          const items = day ? byDay[key] ?? [] : [];
          const sessions = day ? sessByDay[key] ?? [] : [];
          const isToday = isThisMonth && day === today.getDate();
          return (
            <div key={i} className={`min-h-20 rounded-lg border p-1.5 text-left text-[11px] ${day ? "border-zinc-100 dark:border-zinc-800" : "border-transparent"} ${isToday ? "ring-2 ring-indigo-400" : ""}`}>
              {day ? <div className={`mb-1 text-[11px] font-semibold ${isToday ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400"}`}>{day}</div> : null}
              <div className="space-y-0.5">
                {items.map((it) => (
                  <button key={it.id} onClick={() => onOpen(it.id)} className="block w-full truncate rounded bg-rose-100 px-1.5 py-0.5 text-left font-medium text-rose-700 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-300" title={`${it.title} (${it.type})`}>
                    {it.type === "assignment" ? "📝" : "🔴"} {it.title}
                  </button>
                ))}
                {sessions.length ? (
                  <div className="truncate rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" title={sessions.map((s) => s.activity).join("\n")}>
                    📚 {sessions.reduce((n, s) => n + s.minutes, 0)} min plan
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {loading ? <div className="mt-2 text-center"><Spinner className="text-zinc-400" /></div> : null}
    </div>
  );
}

function AddAssessmentModal({ courses, onClose, onCreated }: { courses: Array<{ id: number; name: string }>; onClose: () => void; onCreated: (id: number) => void }) {
  const [form, setForm] = useState({ course_id: "", title: "", type: "test", due_date: "", weighting: "", topics: "", format: "", required_materials: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: number }>("/api/assessments", {
        body: { ...form, course_id: form.course_id ? Number(form.course_id) : null, weighting: form.weighting ? Number(form.weighting) : null },
      });
      onCreated(res.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add assessment">
      <ErrorNote error={error} />
      <Field label="Course">
        <select className="input" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
          <option value="">No course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Quadratics Topic Test" autoFocus /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Type">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {["test", "assignment", "exam", "quiz", "project"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Due date"><input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        <Field label="Weighting %"><input className="input" type="number" min={0} max={100} value={form.weighting} onChange={(e) => setForm({ ...form, weighting: e.target.value })} /></Field>
      </div>
      <Field label="Topics covered" hint="Comma-separated — Studia matches these to your topic list for readiness.">
        <input className="input" value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} placeholder="Factorising, Completing the square…" />
      </Field>
      <div className="flex justify-end"><button className="btn-primary" onClick={save} disabled={busy || !form.title.trim()}>Add</button></div>
    </Modal>
  );
}

function AssessmentDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, refresh } = useApi<AssessDetail>(`/api/assessments/${id}`);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  async function addToPlan() {
    if (!data) return;
    setBusy(true);
    try {
      const today = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const date = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
      for (const item of data.plan.slice(0, 4)) {
        await api("/api/planner/session/new", { method: "POST", body: { date, activity: item.activity, minutes: item.minutes, kind: "practice" } });
      }
      setToast("Study blocks added to today's plan ✓");
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
    }
    setBusy(false);
  }

  async function remove() {
    await api(`/api/assessments/${id}`, { method: "DELETE" });
    onClose();
  }

  if (!data) return <Modal open onClose={onClose} title="Assessment"><div className="flex justify-center py-8"><Spinner className="text-indigo-500" /></div></Modal>;
  const a = data.assessment;

  return (
    <Modal open onClose={onClose} title={a.title} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={a.type === "test" || a.type === "exam" ? "rose" : "sky"}>{a.type}</Badge>
        <span className="text-[13px] text-zinc-500">{a.course_name ?? "No course"}</span>
        {a.weighting ? <Badge tone="zinc">{a.weighting}% of grade</Badge> : null}
        {a.is_demo ? <DemoBadge /> : null}
        <div className="flex-1" />
        {a.readiness !== null ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">AI-estimated readiness</span>
            <Ring value={a.readiness} size={40} />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-3 text-[13.5px]">
          <div><span className="text-zinc-400">Due:</span> <span className="font-medium">{fmtDate(a.due_date)} ({daysLabel(a.days_until)})</span></div>
          {a.format ? <div><span className="text-zinc-400">Format:</span> {a.format}</div> : null}
          {a.required_materials ? <div><span className="text-zinc-400">Materials:</span> {a.required_materials}</div> : null}
          {a.notes ? <div className="rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">{a.notes}</div> : null}
        </div>
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-400"><Target className="h-3.5 w-3.5" /> Topics & readiness</h4>
          <div className="space-y-2">
            {data.topicDetail.length === 0 ? (
              <p className="text-[13px] text-zinc-500">No topics listed for this assessment.</p>
            ) : (
              data.topicDetail.map((t) => (
                <div key={t.name}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-zinc-500">{t.mastery}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className={`h-full rounded-full ${t.mastery >= 70 ? "bg-emerald-500" : t.mastery >= 45 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.max(2, t.mastery)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {data.plan.length ? (
        <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300"><CalendarClock className="h-3.5 w-3.5" /> Recommended study plan</h4>
            <button className="btn-primary btn-sm" onClick={addToPlan} disabled={busy}>{busy ? <Spinner /> : <Plus className="h-3.5 w-3.5" />} Add to planner</button>
          </div>
          <div className="space-y-1 text-[13px] text-zinc-600 dark:text-zinc-300">
            {data.plan.map((p, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span>{p.activity}</span>
                <span className="shrink-0 text-zinc-400">{p.minutes} min</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data.documents.length ? (
        <div className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-400"><FileText className="h-3.5 w-3.5" /> Related documents</h4>
          <div className="flex flex-wrap gap-1.5">
            {data.documents.slice(0, 8).map((d) => (
              <a key={d.id} href={`/documents?doc=${d.id}`} className="badge bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300">📄 {d.title}</a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button className="btn-ghost btn-sm text-rose-500" onClick={remove}>Delete assessment</button>
        <button className="btn-secondary btn-sm" onClick={() => refresh()}>Refresh readiness</button>
      </div>

      <Toast message={toast} tone={toast.startsWith("⚠️") ? "error" : "success"} />
    </Modal>
  );
}
