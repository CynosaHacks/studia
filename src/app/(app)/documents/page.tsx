"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpenCheck, CalendarClock, Check, ClipboardPaste, FileText, FileWarning, Image as ImageIcon,
  Presentation, Sparkles, Upload, X, Layers, ListChecks, RefreshCw, Wand2, CircleAlert,
} from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, DemoBadge, ErrorNote, Field, Modal, PageHeader, Spinner, Toast, fmtDate } from "@/components/ui";
import { Markdown } from "@/components/Markdown";

type DocSummary = {
  id: number; title: string; doc_type: string; status: string; summary: string | null;
  mime_type: string | null; file_ext: string | null; size: number | null; confidence: number | null;
  suggested_course: string | null; is_demo: number; created_at: string; course_id: number | null; course_name: string | null;
};

type DocAnalysis = {
  docType: string; title: string;
  course: { name: string; confidence: number; isNew: boolean; teacher?: string };
  unit: string | null; topics: string[]; subtopics: string[]; summary: string;
  keyConcepts: string[]; formulas: string[]; definitions: Array<{ term: string; meaning: string }>;
  dates: Array<{ date: string; what: string }>; objectives: string[]; tasks: string[]; examTopics: string[];
  assessment: { name: string; type: string; date: string | null; weighting: number | null; topics: string[]; format: string; materials: string; confidence: number } | null;
  curriculum: Array<{ unit: string; topics: string[] }> | null;
  uncertainty: string;
};

type DocDetail = {
  document: DocSummary & { analysis: DocAnalysis | null; extracted_text: string | null; image_data: string | null; notes: string | null };
  course: { id: number; name: string } | null;
  relatedAssessments: Array<{ id: number; title: string; due_date: string | null; type: string }>;
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  syllabus: <BookOpenCheck className="h-4 w-4" />,
  assessment_notification: <CalendarClock className="h-4 w-4" />,
  assignment: <CalendarClock className="h-4 w-4" />,
  worksheet: <ListChecks className="h-4 w-4" />,
  class_notes: <FileText className="h-4 w-4" />,
  past_paper: <FileText className="h-4 w-4" />,
  textbook_excerpt: <FileText className="h-4 w-4" />,
  other: <FileText className="h-4 w-4" />,
};

export default function DocumentsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { data, refresh } = useApi<{ documents: DocSummary[] }>("/api/documents");
  const { data: coursesData } = useApi<{ courses: Array<{ id: number; name: string }> }>("/api/courses");
  const [selected, setSelected] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    if (search.get("upload")) setUploadOpen(true);
    const doc = search.get("doc");
    if (doc) setSelected(Number(doc));
  }, [search]);

  function closeDetail() {
    setSelected(null);
    router.replace("/documents");
  }

  const docs = data?.documents ?? [];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Documents"
        subtitle="Import anything — syllabuses, worksheets, test notifications, notes, photos. Studia reads, analyses and connects them."
        actions={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste className="h-4 w-4" /> Paste text
            </button>
            <button className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" /> Upload
            </button>
          </>
        }
      />

      {docs.some((d) => d.status === "needs_course") ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Some documents need your confirmation — Studia wasn&apos;t sure which course they belong to.</span>
        </div>
      ) : null}

      {docs.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 rounded-2xl bg-zinc-100 p-4 text-zinc-400 dark:bg-zinc-800">
            <Upload className="h-8 w-8" />
          </div>
          <h3 className="text-[15px] font-semibold">Add your first school material</h3>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Upload a syllabus and Studia extracts the whole curriculum. Upload a test notification and it creates the assessment with a study plan. PDF, DOCX, PPTX, images, screenshots, handwritten notes — anything.
          </p>
          <div className="mt-5 flex gap-2">
            <button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload files</button>
            <button className="btn-secondary" onClick={() => setPasteOpen(true)}><ClipboardPaste className="h-4 w-4" /> Paste text</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <button key={d.id} onClick={() => setSelected(d.id)} className="card card-hover p-4 text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-zinc-400">
                  {TYPE_ICONS[d.doc_type] ?? TYPE_ICONS.other}
                  <span className="text-[11px] font-medium uppercase tracking-wide">{d.doc_type.replace(/_/g, " ")}</span>
                </div>
                {d.is_demo ? <DemoBadge /> : null}
              </div>
              <div className="mt-2 line-clamp-2 text-[14.5px] font-semibold leading-snug">{d.title}</div>
              <p className="mt-1 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {d.summary || "…"}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="truncate text-xs text-zinc-400">{d.course_name ?? "Unassigned"}</span>
                <StatusChip status={d.status} />
              </div>
            </button>
          ))}
        </div>
      )}

      {uploadOpen ? (
        <UploadModal
          courses={coursesData?.courses ?? []}
          onClose={() => {
            setUploadOpen(false);
            router.replace("/documents");
          }}
          onUploaded={(id) => {
            setUploadOpen(false);
            refresh();
            setSelected(id);
          }}
        />
      ) : null}

      {pasteOpen ? (
        <PasteModal
          courses={coursesData?.courses ?? []}
          onClose={() => setPasteOpen(false)}
          onSaved={(id) => {
            setPasteOpen(false);
            refresh();
            setSelected(id);
          }}
        />
      ) : null}

      {selected ? <DocDetailPanel id={selected} courses={coursesData?.courses ?? []} onClose={closeDetail} onChanged={refresh} /> : null}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === "ready") return <Badge tone="emerald"><Check className="h-3 w-3" /> ready</Badge>;
  if (status === "processing") return <Badge tone="sky"><Spinner className="h-3 w-3" /> analysing</Badge>;
  if (status === "needs_course") return <Badge tone="amber"><FileWarning className="h-3 w-3" /> confirm course</Badge>;
  if (status === "failed") return <Badge tone="rose">failed</Badge>;
  return <Badge>{status}</Badge>;
}

function UploadModal({ courses, onClose, onUploaded }: { courses: Array<{ id: number; name: string }>; onClose: () => void; onUploaded: (id: number) => void }) {
  const [drag, setDrag] = useState(false);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        setBusyDoc(file.name);
        setError(null);
        const fd = new FormData();
        fd.append("file", file);
        if (courseId) fd.append("course_id", courseId);
        try {
          const res = await api<{ id: number; status: string; analysisError: string | null }>("/api/documents", { formData: fd });
          if (res.analysisError) setError(res.analysisError);
          onUploaded(res.id);
        } catch (e) {
          setError(`${file.name}: ${(e as Error).message}`);
        }
      }
      setBusyDoc(null);
    },
    [courseId, onUploaded]
  );

  return (
    <Modal open onClose={onClose} title="Add School Material" wide>
      <ErrorNote error={error} />
      <Field label="Assign to course (optional — Studia will detect it otherwise)">
        <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Detect automatically</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${drag ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10" : "border-zinc-300 hover:border-indigo-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50"}`}
      >
        {busyDoc ? (
          <>
            <Spinner className="h-6 w-6 text-indigo-500" />
            <p className="mt-3 text-[13.5px] font-medium">Analysing “{busyDoc}”…</p>
            <p className="mt-1 text-xs text-zinc-400">Extracting text, detecting type, topics and assessments. This can take up to a minute.</p>
          </>
        ) : (
          <>
            <Upload className="h-7 w-7 text-zinc-400" />
            <p className="mt-3 text-[14px] font-medium">Drop files here or click to browse</p>
            <p className="mt-1 text-xs text-zinc-400">PDF · DOCX · PPTX · TXT · Markdown · images &amp; screenshots of handwritten work (max 25 MB)</p>
          </>
        )}
        <input ref={inputRef} type="file" multiple hidden accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.csv,image/*" onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-zinc-500 sm:grid-cols-4">
        <span className="flex items-center gap-1.5"><BookOpenCheck className="h-3.5 w-3.5 text-indigo-400" /> Syllabuses → curriculum</span>
        <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-rose-400" /> Test notices → assessments</span>
        <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-sky-400" /> Notes → searchable memory</span>
        <span className="flex items-center gap-1.5"><Presentation className="h-3.5 w-3.5 text-amber-400" /> Slides → topics</span>
      </div>
    </Modal>
  );
}

function PasteModal({ courses, onClose, onSaved }: { courses: Array<{ id: number; name: string }>; onClose: () => void; onSaved: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: number }>("/api/documents", {
        body: { title: title || "Pasted notes", text, course_id: courseId ? Number(courseId) : null },
      });
      onSaved(res.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Paste text">
      <ErrorNote error={error} />
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Teacher's message about the maths test" autoFocus />
      </Field>
      <Field label="Assign to course (optional)">
        <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Detect automatically</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Text">
        <textarea className="input min-h-48 font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste class notes, teacher instructions, assignment briefs…" />
      </Field>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={save} disabled={busy || !text.trim()}>{busy ? <Spinner /> : null} Save &amp; analyse</button>
      </div>
    </Modal>
  );
}

function DocDetailPanel({ id, courses, onClose, onChanged }: { id: number; courses: Array<{ id: number; name: string }>; onClose: () => void; onChanged: () => void }) {
  const { data, refresh } = useApi<DocDetail>(`/api/documents/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [confirmCourse, setConfirmCourse] = useState<number | "">("");
  const [showText, setShowText] = useState(false);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const res = await api<{ ok?: boolean; error?: string; unitsCreated?: number; topicsCreated?: number; analysis?: DocAnalysis }>(
        `/api/documents/${id}/action`,
        { body: { action, ...extra } }
      );
      if (res.error) setToast(`⚠️ ${res.error}`);
      else if (action === "apply_curriculum") setToast(`Curriculum applied: +${res.unitsCreated} units, +${res.topicsCreated} topics`);
      else if (action === "confirm_course") setToast("Course linked ✓");
      else setToast("Analysis complete ✓");
      refresh();
      onChanged();
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
    }
    setBusy(null);
  }

  async function generate(kind: "notes" | "flashcards" | "practice") {
    setBusy(kind);
    try {
      if (kind === "notes") {
        const r = await api<{ id: number }>("/api/notes", { body: { document_id: id, kind: "study_guide" } });
        window.location.href = `/notes?note=${r.id}`;
      } else if (kind === "flashcards") {
        const r = await api<{ deckId: number }>("/api/flashcards", { body: { document_id: id, count: 10, types: ["mixed"] } });
        window.location.href = `/flashcards?deck=${r.deckId}`;
      } else {
        const r = await api<{ setId: number }>("/api/practice", { body: { document_id: id, difficulty: "medium", types: ["mixed"], count: 5 } });
        window.location.href = `/practice?set=${r.setId}`;
      }
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
      setBusy(null);
    }
  }

  async function remove() {
    await api(`/api/documents/${id}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  if (!data) return <Modal open onClose={onClose} title="Document"><div className="flex justify-center py-8"><Spinner className="text-indigo-500" /></div></Modal>;

  const d = data.document;
  const a = d.analysis;

  return (
    <Modal open onClose={onClose} title={d.title} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusChip status={d.status} />
        {d.course_id && data.course ? <Badge tone="indigo">{data.course.name}</Badge> : <Badge tone="amber">unassigned</Badge>}
        {d.is_demo ? <DemoBadge /> : null}
        <span className="text-xs text-zinc-400">Added {new Date(d.created_at).toLocaleDateString()}</span>
      </div>

      {d.status === "needs_course" ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="text-[13.5px] font-semibold text-amber-800 dark:text-amber-300">Which course does this belong to?</div>
          <p className="mt-1 text-[12.5px] text-amber-700/80 dark:text-amber-300/80">
            Studia guessed “{d.suggested_course}” but wasn&apos;t confident. Linking it helps the AI use it in the right context.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select className="input max-w-52" value={confirmCourse} onChange={(e) => setConfirmCourse(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">Choose a course…</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn-primary btn-sm" disabled={!confirmCourse || busy === "confirm_course"} onClick={() => act("confirm_course", { course_id: confirmCourse })}>
              <Check className="h-4 w-4" /> Confirm
            </button>
          </div>
        </div>
      ) : null}

      {a ? (
        <div className="space-y-4">
          {a.summary ? <p className="text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-300">{a.summary}</p> : null}

          {a.assessment ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
              <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                <CalendarClock className="h-4 w-4" /> Assessment detected
              </div>
              <div className="mt-1.5 text-[15px] font-semibold">{a.assessment.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-600 dark:text-zinc-300">
                <span>Type: {a.assessment.type}</span>
                {a.assessment.date ? <span>Date: {fmtDate(a.assessment.date)}</span> : null}
                {a.assessment.weighting ? <span>Weighting: {a.assessment.weighting}%</span> : null}
                {a.assessment.format ? <span>Format: {a.assessment.format}</span> : null}
              </div>
              {a.assessment.topics?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {a.assessment.topics.map((t) => <Badge key={t} tone="rose">{t}</Badge>)}
                </div>
              ) : null}
              {data.relatedAssessments.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="text-zinc-500">Created:</span>
                  {data.relatedAssessments.map((r) => (
                    <a key={r.id} href={`/assessments?a=${r.id}`} className="font-medium text-rose-600 underline underline-offset-2 dark:text-rose-300">{r.title} →</a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {a.curriculum?.length ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
              <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                <BookOpenCheck className="h-4 w-4" /> Curriculum extracted
              </div>
              <div className="mt-2 space-y-1.5 text-[13px] text-zinc-600 dark:text-zinc-300">
                {a.curriculum.map((u, i) => (
                  <div key={i}>
                    <span className="font-semibold">{u.unit}</span>
                    <span className="text-zinc-500"> — {u.topics.join(", ")}</span>
                  </div>
                ))}
              </div>
              <button className="btn-primary btn-sm mt-3" disabled={busy === "apply_curriculum" || !d.course_id} onClick={() => act("apply_curriculum")}>
                <Wand2 className="h-4 w-4" /> Apply to curriculum
              </button>
              {!d.course_id ? <p className="mt-1.5 text-[11.5px] text-amber-600 dark:text-amber-400">Link this document to a course first.</p> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {a.topics?.length ? <ChipList title="Topics" items={a.topics} tone="indigo" /> : null}
            {a.keyConcepts?.length ? <ChipList title="Key concepts" items={a.keyConcepts} tone="sky" /> : null}
            {a.formulas?.length ? <ChipList title="Formulas" items={a.formulas} tone="violet" mono /> : null}
            {a.examTopics?.length ? <ChipList title="Potential exam topics" items={a.examTopics} tone="rose" /> : null}
            {a.dates?.filter((x) => x.date || x.what).length ? (
              <div>
                <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">Dates</h4>
                <div className="space-y-1 text-[13px]">
                  {a.dates.map((x, i) => (
                    <div key={i} className="flex gap-2"><span className="text-zinc-400">{x.date ? fmtDate(x.date) : "—"}</span><span>{x.what}</span></div>
                  ))}
                </div>
              </div>
            ) : null}
            {a.definitions?.length ? (
              <div>
                <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">Definitions</h4>
                <div className="space-y-1 text-[13px]">
                  {a.definitions.slice(0, 6).map((x, i) => (
                    <div key={i}><span className="font-medium">{x.term}</span> — <span className="text-zinc-500">{x.meaning}</span></div>
                  ))}
                </div>
              </div>
            ) : null}
            {a.tasks?.length ? <ChipList title="Required tasks" items={a.tasks} tone="amber" /> : null}
          </div>

          {a.uncertainty ? (
            <div className="rounded-lg bg-zinc-50 px-3.5 py-2.5 text-[12.5px] text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
              <span className="font-medium">Note:</span> {a.uncertainty}
            </div>
          ) : null}
        </div>
      ) : d.status === "processing" ? (
        <div className="flex flex-col items-center py-8">
          <Spinner className="h-6 w-6 text-indigo-500" />
          <p className="mt-3 text-[13.5px] text-zinc-500">Analysing this document…</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-[13px] text-zinc-500 dark:border-zinc-700">
          {d.summary || "No AI analysis yet. Run it now to extract topics, assessments and curriculum."}
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => act("analyze")}>
          {busy === "analyze" ? <Spinner /> : <RefreshCw className="h-4 w-4" />} {a ? "Re-analyse" : "Analyse with AI"}
        </button>
        <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => generate("notes")}><Sparkles className="h-4 w-4" /> Notes</button>
        <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => generate("flashcards")}><Layers className="h-4 w-4" /> Flashcards</button>
        <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => generate("practice")}><ListChecks className="h-4 w-4" /> Practice</button>
        <div className="flex-1" />
        {d.extracted_text ? (
          <button className="btn-ghost btn-sm" onClick={() => setShowText((s) => !s)}><FileText className="h-4 w-4" /> {showText ? "Hide" : "View"} extracted text</button>
        ) : null}
        <button className="btn-ghost btn-sm text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" disabled={!!busy} onClick={remove}>
          <X className="h-4 w-4" /> Delete
        </button>
      </div>

      {showText && d.extracted_text ? (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-lg bg-zinc-50 p-3 text-[12.5px] leading-relaxed text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
          <pre className="whitespace-pre-wrap font-sans">{d.extracted_text}</pre>
        </div>
      ) : null}

      <Toast message={toast} tone={toast.startsWith("⚠️") ? "error" : "success"} />
    </Modal>
  );
}

function ChipList({ title, items, tone, mono }: { title: string; items: string[]; tone: "indigo" | "sky" | "violet" | "rose" | "amber"; mono?: boolean }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 10).map((x, i) => (
          <Badge key={i} tone={tone}><span className={mono ? "font-mono" : ""}>{x}</span></Badge>
        ))}
      </div>
    </div>
  );
}
