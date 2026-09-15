"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, ChevronLeft, Pencil, Plus, Sparkles, StickyNote, Check, X } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, DemoBadge, ErrorNote, Field, Modal, PageHeader, Spinner, Toast } from "@/components/ui";
import { Markdown } from "@/components/Markdown";

const KINDS = [
  { id: "summary", label: "Quick summary" },
  { id: "detailed", label: "Detailed notes" },
  { id: "exam", label: "Exam notes" },
  { id: "study_guide", label: "Study guide" },
  { id: "cheat_sheet", label: "Cheat sheet" },
  { id: "definitions", label: "Key definitions" },
  { id: "formulas", label: "Important formulas" },
  { id: "common_mistakes", label: "Common mistakes" },
  { id: "examples", label: "Worked examples" },
  { id: "step_by_step", label: "Step-by-step" },
];

type NoteRow = { id: number; title: string; kind: string; course_name: string | null; topic_name: string | null; updated_at: string; is_demo: number };
type NoteFull = { id: number; title: string; kind: string; content: string; grounding: string; course_id: number | null; topic_id: number | null; document_id: number | null; updated_at: string };

export default function NotesPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { data, refresh } = useApi<{ notes: NoteRow[] }>("/api/notes");
  const { data: coursesData } = useApi<{ courses: Array<{ id: number; name: string }> }>("/api/courses");
  const [selected, setSelected] = useState<number | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  useEffect(() => {
    const note = search.get("note");
    if (note) setSelected(Number(note));
  }, [search]);

  const notes = data?.notes ?? [];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Notes"
        subtitle="AI-generated, grounded in your material — and always editable."
        actions={
          <button className="btn-primary btn-sm" onClick={() => setGenOpen(true)}>
            <Sparkles className="h-4 w-4" /> Generate notes
          </button>
        }
      />

      {notes.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <StickyNote className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <h3 className="text-[15px] font-semibold">No notes yet</h3>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Pick a course, topic or document and let Studia write summaries, exam notes, cheat sheets and more — grounded in your own material.
          </p>
          <button className="btn-primary mt-4" onClick={() => setGenOpen(true)}><Sparkles className="h-4 w-4" /> Generate your first note</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <button key={n.id} onClick={() => setSelected(n.id)} className="card card-hover flex flex-col p-4 text-left">
              <div className="flex items-center justify-between">
                <Badge tone="indigo">{KINDS.find((k) => k.id === n.kind)?.label ?? n.kind}</Badge>
                {n.is_demo ? <DemoBadge /> : null}
              </div>
              <div className="mt-2 line-clamp-2 flex-1 text-[14.5px] font-semibold leading-snug">{n.title}</div>
              <div className="mt-2 text-xs text-zinc-400">
                {[n.course_name, n.topic_name].filter(Boolean).join(" · ") || "General"} · {new Date(n.updated_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      )}

      <GenerateNoteModal
        open={genOpen}
        courses={coursesData?.courses ?? []}
        onClose={() => setGenOpen(false)}
        onCreated={(id) => {
          setGenOpen(false);
          refresh();
          setSelected(id);
        }}
      />

      {selected ? (
        <NoteView
          id={selected}
          onClose={() => {
            setSelected(null);
            refresh();
            router.replace("/notes");
          }}
        />
      ) : null}
    </div>
  );
}

function GenerateNoteModal({ open, courses, onClose, onCreated }: { open: boolean; courses: Array<{ id: number; name: string }>; onClose: () => void; onCreated: (id: number) => void }) {
  const [courseId, setCourseId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [kind, setKind] = useState("summary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: topicsData } = useApi<{ topics: Array<{ id: number; name: string }> }>(
    courseId ? `/api/courses/${courseId}` : null
  );

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: number }>("/api/notes", {
        body: {
          course_id: courseId ? Number(courseId) : null,
          topic_id: topicId ? Number(topicId) : null,
          kind,
        },
      });
      onCreated(res.id);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate notes">
      <ErrorNote error={error} />
      <Field label="Course (optional)">
        <select className="input" value={courseId} onChange={(e) => { setCourseId(e.target.value); setTopicId(""); }}>
          <option value="">Any / general</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {courseId ? (
        <Field label="Topic (optional)">
          <select className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">Whole course</option>
            {(topicsData?.topics ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="Type of notes">
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition ${kind === k.id ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={generate} disabled={busy}>
          {busy ? <Spinner /> : <Bot className="h-4 w-4" />} Generate
        </button>
      </div>
    </Modal>
  );
}

function NoteView({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, refresh } = useApi<{ note: NoteFull }>(`/api/notes/${id}`);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (data?.note) {
      setTitle(data.note.title);
      setContent(data.note.content);
      setEditing(false);
    }
  }, [data]);

  if (!data) return <Modal open onClose={onClose} title="Note"><div className="flex justify-center py-8"><Spinner className="text-indigo-500" /></div></Modal>;
  if (!data.note)
    return (
      <Modal open onClose={onClose} title="Note">
        <div className="py-10 text-center">
          <p className="text-[14px] font-medium">This note no longer exists.</p>
          <button className="btn-primary btn-sm mt-4" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  const note = data.note;
  const grounding = safeParse(note.grounding) as Array<{ id: number; title: string }>;

  async function save() {
    setSaving(true);
    try {
      await api(`/api/notes/${id}`, { method: "PATCH", body: { title, content } });
      setToast("Saved ✓");
      setEditing(false);
      refresh();
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
    }
    setSaving(false);
  }

  async function remove() {
    await api(`/api/notes/${id}`, { method: "DELETE" });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={title || "Note"} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="indigo">{KINDS.find((k) => k.id === note.kind)?.label ?? note.kind}</Badge>
        <span className="text-xs text-zinc-400">Updated {new Date(note.updated_at).toLocaleString()}</span>
        <div className="flex-1" />
        {!editing ? (
          <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
        ) : (
          <>
            <button className="btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? <Spinner /> : <Check className="h-3.5 w-3.5" />} Save</button>
            <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /> Cancel</button>
          </>
        )}
        <button className="btn-ghost btn-sm text-rose-500" onClick={remove}>Delete</button>
      </div>

      {editing ? (
        <div>
          <input className="input mb-3 font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="input min-h-[50vh] font-mono text-[13px] leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
      ) : (
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <Markdown>{content}</Markdown>
        </div>
      )}

      {grounding.length ? (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            <ChevronLeft className="h-3 w-3 rotate-180" /> Grounded in your material
          </div>
          <div className="flex flex-wrap gap-1.5">
            {grounding.map((g) => (
              <a key={g.id} href={`/documents?doc=${g.id}`} className="badge bg-zinc-100 text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300">
                📄 {g.title}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <Toast message={toast} tone={toast.startsWith("⚠️") ? "error" : "success"} />
    </Modal>
  );
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}
