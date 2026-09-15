"use client";

import { useState } from "react";
import { CalendarCheck, Check, ChevronLeft, ChevronRight, CircleDashed, Clock, Compass, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, ErrorNote, Field, Modal, PageHeader, Spinner, Toast } from "@/components/ui";

type Session = { id: number; plan_date: string; activity: string; kind: string; minutes: number; status: string; course_name: string | null; topic_name: string | null; is_demo?: number };

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const nd = new Date(y, m - 1, d + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${nd.getFullYear()}-${p(nd.getMonth() + 1)}-${p(nd.getDate())}`;
}

export default function PlannerPage() {
  const [date, setDate] = useState(todayStr());
  const { data, refresh } = useApi<{ sessions: Session[]; status: { planned: number; done: number; minutes: number } }>(`/api/planner?date=${date}`);
  const [minutes, setMinutes] = useState(45);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState("");

  const sessions = data?.sessions ?? [];
  const totalMin = sessions.reduce((s, x) => s + x.minutes, 0);
  const doneMin = sessions.filter((s) => s.status === "done").reduce((s, x) => s + x.minutes, 0);

  async function generate(useAI: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ count: number }>("/api/planner", { body: { date, minutes, useAI } });
      setToast(`${r.count} study blocks planned for ${date} ${useAI ? "(AI-assisted)" : ""}✓`);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function setStatus(id: number, status: string) {
    await api(`/api/planner/session/${id}`, { method: "PATCH", body: { status } });
    refresh();
  }
  async function removeSession(id: number) {
    await api(`/api/planner/session/${id}`, { method: "DELETE" });
    refresh();
  }

  const kindIcon: Record<string, string> = { review: "📖", flashcards: "🃏", practice: "✏️", notes: "📝", drill: "🎯" };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Study Planner"
        subtitle="Balanced around your deadlines, weak topics, spaced repetition and available time."
        actions={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add block</button>
            <button className="btn-primary btn-sm" onClick={() => generate(true)} disabled={busy}>
              {busy ? <Spinner /> : <Wand2 className="h-4 w-4" />} Generate plan
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft className="h-4 w-4" /></button>
          <input type="date" className="input w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight className="h-4 w-4" /></button>
        </div>
        {date !== todayStr() ? <button className="btn-ghost btn-sm" onClick={() => setDate(todayStr())}>Today</button> : null}
        <div className="flex items-center gap-2 text-[13px] text-zinc-500">
          <Clock className="h-4 w-4" />
          {doneMin} / {totalMin} min planned
          {sessions.length ? (
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${totalMin ? (doneMin / totalMin) * 100 : 0}%` }} />
            </div>
          ) : null}
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[13px] text-zinc-500">
          Time available
          <input type="number" min={10} max={300} step={5} className="input w-20 text-center" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 45)} /> min
        </label>
      </div>

      <ErrorNote error={error} />

      {sessions.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <Compass className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <h3 className="text-[15px] font-semibold">No plan for this day yet</h3>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Generate a plan and Studia will split your available time across urgent assessments, due flashcards and neglected topics.
          </p>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={() => generate(true)} disabled={busy}>{busy ? <Spinner /> : <Wand2 className="h-4 w-4" />} Generate with AI</button>
            <button className="btn-secondary" onClick={() => generate(false)} disabled={busy}><Sparkles className="h-4 w-4" /> Quick plan (no AI)</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sessions.map((s) => (
            <div key={s.id} className={`card flex items-center gap-3.5 p-4 ${s.status === "done" ? "opacity-60" : ""}`}>
              <button
                onClick={() => setStatus(s.id, s.status === "done" ? "planned" : "done")}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${s.status === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 text-zinc-300 hover:border-indigo-400 hover:text-indigo-400 dark:border-zinc-600"}`}
                title={s.status === "done" ? "Mark as not done" : "Mark done"}
              >
                {s.status === "done" ? <Check className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-[14.5px] font-medium leading-snug ${s.status === "done" ? "line-through" : ""}`}>{s.activity}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                  <span>{kindIcon[s.kind] ?? "📌"} {s.kind}</span>
                  {s.topic_name ? <span>· {s.topic_name}</span> : null}
                </div>
              </div>
              <Badge tone="zinc">{s.minutes} min</Badge>
              <button className="btn-ghost btn-sm text-zinc-300 hover:text-rose-500 dark:text-zinc-600" onClick={() => removeSession(s.id)}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <p className="px-1 text-[11.5px] text-zinc-400">
            Plans adapt as you go — regenerate anytime. Completing blocks feeds your study history and progress stats.
          </p>
        </div>
      )}

      <AddBlockModal
        open={adding}
        date={date}
        onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); refresh(); }}
      />

      <Toast message={toast} tone={toast.startsWith("⚠️") ? "error" : "success"} />
    </div>
  );
}

function AddBlockModal({ open, date, onClose, onSaved }: { open: boolean; date: string; onClose: () => void; onSaved: () => void }) {
  const { data: coursesData } = useApi<{ courses: Array<{ id: number; name: string }> }>(open ? "/api/courses" : null);
  const [courseId, setCourseId] = useState("");
  const [activity, setActivity] = useState("");
  const [kind, setKind] = useState("review");
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/api/planner/session/new", {
        method: "POST",
        body: { date, activity: activity || `${coursesData?.courses.find((c) => String(c.id) === courseId)?.name ?? "Study"} session`, kind, minutes, course_id: courseId ? Number(courseId) : null },
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add study block">
      <Field label="Activity"><input className="input" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="e.g. Review class notes" autoFocus /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Course">
          <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">None</option>
            {(coursesData?.courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Kind">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {["review", "practice", "flashcards", "notes", "drill"].map((k) => <option key={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Minutes">
          <input className="input" type="number" min={5} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 15)} />
        </Field>
      </div>
      <div className="flex justify-end"><button className="btn-primary" onClick={save} disabled={busy}>Add block</button></div>
    </Modal>
  );
}
