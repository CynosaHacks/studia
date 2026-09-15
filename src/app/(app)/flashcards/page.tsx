"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bookmark, Brain, Check, Layers, Pencil, Plus, RotateCcw, Sparkles, Trash2, X,
} from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, DemoBadge, ErrorNote, Field, Modal, PageHeader, Ring, Spinner, Toast } from "@/components/ui";

type DeckRow = {
  id: number; title: string; course_name: string | null; topic_name: string | null;
  card_count: number; due_count: number; is_demo: number; last_reviewed_at: string | null;
};
type CardRow = {
  id: number; front: string; back: string; card_type: string; bookmarked: number;
  reps: number; lapses: number; due_at: string | null; interval_days: number; ease: number;
};

const CARD_TYPES = [
  { id: "mixed", label: "Mixed" },
  { id: "definition", label: "Definitions" },
  { id: "question_answer", label: "Q&A" },
  { id: "formula", label: "Formulas" },
  { id: "fill_blank", label: "Fill-in-the-blank" },
  { id: "application", label: "Application" },
  { id: "exam_style", label: "Exam-style" },
];

export default function FlashcardsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { data, refresh } = useApi<{ decks: DeckRow[]; due: { due: number; total: number } }>("/api/flashcards");
  const { data: coursesData } = useApi<{ courses: Array<{ id: number; name: string }> }>("/api/courses");
  const [openDeck, setOpenDeck] = useState<number | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  useEffect(() => {
    const deck = search.get("deck");
    if (deck) setOpenDeck(Number(deck));
  }, [search]);

  const decks = data?.decks ?? [];
  const totalDue = data?.due.due ?? 0;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Flashcards"
        subtitle={
          totalDue > 0
            ? `${totalDue} card${totalDue === 1 ? "" : "s"} due for review — spaced repetition keeps them coming back at the right time.`
            : "Nothing due right now. Generate a deck or review early."
        }
        actions={
          <button className="btn-primary btn-sm" onClick={() => setGenOpen(true)}>
            <Sparkles className="h-4 w-4" /> Generate flashcards
          </button>
        }
      />

      {decks.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <Layers className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <h3 className="text-[15px] font-semibold">No flashcard decks yet</h3>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Generate decks from any course, topic or document. Studia schedules reviews with spaced repetition so you remember long-term.
          </p>
          <button className="btn-primary mt-4" onClick={() => setGenOpen(true)}><Sparkles className="h-4 w-4" /> Generate flashcards</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => (
            <button key={d.id} onClick={() => setOpenDeck(d.id)} className="card card-hover flex flex-col p-4 text-left">
              <div className="flex items-start justify-between">
                <Badge tone="violet">{d.card_count} cards</Badge>
                {d.is_demo ? <DemoBadge /> : null}
              </div>
              <div className="mt-2 line-clamp-1 flex-1 text-[14.5px] font-semibold">{d.title}</div>
              <div className="mt-1 text-xs text-zinc-400">{[d.course_name, d.topic_name].filter(Boolean).join(" · ")}</div>
              <div className="mt-3 flex items-center justify-between">
                {d.due_count > 0 ? <Badge tone="amber">{d.due_count} due</Badge> : <Badge tone="emerald"><Check className="h-3 w-3" /> up to date</Badge>}
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Review →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <GenerateDeckModal open={genOpen} courses={coursesData?.courses ?? []} onClose={() => setGenOpen(false)} onCreated={(id) => { setGenOpen(false); refresh(); setOpenDeck(id); }} />

      {openDeck ? (
        <DeckView
          id={openDeck}
          onClose={() => {
            setOpenDeck(null);
            refresh();
            router.replace("/flashcards");
          }}
        />
      ) : null}
    </div>
  );
}

function GenerateDeckModal({ open, courses, onClose, onCreated }: { open: boolean; courses: Array<{ id: number; name: string }>; onClose: () => void; onCreated: (id: number) => void }) {
  const [courseId, setCourseId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [count, setCount] = useState(10);
  const [custom, setCustom] = useState(false);
  const [types, setTypes] = useState<string[]>(["mixed"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: topicsData } = useApi<{ topics: Array<{ id: number; name: string }> }>(courseId ? `/api/courses/${courseId}` : null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ deckId: number }>("/api/flashcards", {
        body: { course_id: courseId ? Number(courseId) : null, topic_id: topicId ? Number(topicId) : null, count, types },
      });
      onCreated(res.deckId);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate flashcards">
      <ErrorNote error={error} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Course">
          <select className="input" value={courseId} onChange={(e) => { setCourseId(e.target.value); setTopicId(""); }}>
            <option value="">Any</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Topic">
          <select className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!courseId}>
            <option value="">Whole course</option>
            {(topicsData?.topics ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="How many cards?">
        <div className="flex flex-wrap items-center gap-2">
          {[10, 25, 50].map((n) => (
            <button key={n} onClick={() => { setCount(n); setCustom(false); }}
              className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-medium transition ${!custom && count === n ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
              {n}
            </button>
          ))}
          <input
            className="input w-24 text-center"
            type="number" min={3} max={80} placeholder="Custom"
            value={custom ? count : ""} onFocus={() => setCustom(true)}
            onChange={(e) => { setCustom(true); setCount(Number(e.target.value) || 10); }}
          />
        </div>
      </Field>
      <Field label="Card types">
        <div className="flex flex-wrap gap-1.5">
          {CARD_TYPES.map((t) => (
            <button key={t.id}
              onClick={() => setTypes((ts) => (t.id === "mixed" ? ["mixed"] : ts.includes(t.id) ? ts.filter((x) => x !== t.id) : [...ts.filter((x) => x !== "mixed"), t.id]))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${types.includes(t.id) ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={generate} disabled={busy}>{busy ? <Spinner /> : <Sparkles className="h-4 w-4" />} Generate</button>
      </div>
    </Modal>
  );
}

function DeckView({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, refresh } = useApi<{ deck: DeckRow & { course_id: number | null }; cards: CardRow[] }>(`/api/flashcards/decks/${id}`);
  const [mode, setMode] = useState<"list" | "review">("list");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState("");

  if (!data) return <Modal open onClose={onClose} title="Deck"><div className="flex justify-center py-8"><Spinner className="text-indigo-500" /></div></Modal>;
  if (!data.deck)
    return (
      <Modal open onClose={onClose} title="Deck">
        <div className="py-10 text-center">
          <p className="text-[14px] font-medium">This deck no longer exists.</p>
          <button className="btn-primary btn-sm mt-4" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );

  const { deck, cards } = data;
  const due = cards.filter((c) => !c.due_at || new Date(c.due_at) <= new Date());

  async function remove() {
    await api(`/api/flashcards/decks/${id}`, { method: "DELETE" });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={deck.title} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="violet">{cards.length} cards</Badge>
        {due.length > 0 ? <Badge tone="amber">{due.length} due</Badge> : <Badge tone="emerald">up to date</Badge>}
        {deck.is_demo ? <DemoBadge /> : null}
        <div className="flex-1" />
        {mode === "list" ? (
          <>
            <button className="btn-secondary btn-sm" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add card</button>
            <button className="btn-primary btn-sm" disabled={due.length === 0} onClick={() => setMode("review")}>
              <Brain className="h-4 w-4" /> Review {due.length > 0 ? `(${due.length})` : ""}
            </button>
            <button className="btn-ghost btn-sm text-rose-500" onClick={remove}><Trash2 className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <button className="btn-ghost btn-sm" onClick={() => { setMode("list"); refresh(); }}><X className="h-3.5 w-3.5" /> Exit review</button>
        )}
      </div>

      {mode === "list" ? (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {cards.map((c) => (
            <CardRowView key={c.id} card={c} onChanged={refresh} />
          ))}
        </div>
      ) : (
        <ReviewSession cards={due} onFinished={() => { setMode("list"); refresh(); }} />
      )}

      <AddCardModal open={adding} deckId={id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />
      <Toast message={toast} tone={toast.startsWith("⚠️") ? "error" : "success"} />
    </Modal>
  );
}

function CardRowView({ card, onChanged }: { card: CardRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);

  async function toggleBookmark() {
    await api(`/api/flashcards/card/${card.id}`, { method: "PATCH", body: { bookmarked: !card.bookmarked } });
    onChanged();
  }
  async function save() {
    await api(`/api/flashcards/card/${card.id}`, { method: "PATCH", body: { front, back } });
    setEditing(false);
    onChanged();
  }
  async function remove() {
    await api(`/api/flashcards/card/${card.id}`, { method: "DELETE" });
    onChanged();
  }

  const dueSoon = !card.due_at || new Date(card.due_at) <= new Date();

  if (editing)
    return (
      <div className="card p-3">
        <input className="input mb-2 text-[13.5px] font-medium" value={front} onChange={(e) => setFront(e.target.value)} />
        <textarea className="input min-h-16 text-[13px]" value={back} onChange={(e) => setBack(e.target.value)} />
        <div className="mt-2 flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /> Cancel</button>
          <button className="btn-primary btn-sm" onClick={save}><Check className="h-3.5 w-3.5" /> Save</button>
        </div>
      </div>
    );

  return (
    <div className="card card-hover group p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium leading-snug">{card.front}</div>
          <div className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">{card.back}</div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button className="btn-ghost btn-sm" onClick={toggleBookmark} title="Bookmark">
            <Bookmark className={`h-3.5 w-3.5 ${card.bookmarked ? "fill-amber-400 text-amber-400" : ""}`} />
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></button>
          <button className="btn-ghost btn-sm text-rose-500" onClick={remove}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="badge bg-zinc-100 dark:bg-zinc-800">{card.card_type.replace(/_/g, " ")}</span>
        {card.reps > 0 ? <span>reps {card.reps} · interval {card.interval_days}d</span> : <span>new</span>}
        {dueSoon ? <span className="text-amber-500">due</span> : card.due_at ? <span>next {new Date(card.due_at).toLocaleDateString()}</span> : null}
      </div>
    </div>
  );
}

function ReviewSession({ cards, onFinished }: { cards: CardRow[]; onFinished: () => void }) {
  const [queue, setQueue] = useState<CardRow[]>(cards);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [done, setDone] = useState(false);
  const busyRef = useRef(false);

  const current = queue[idx];

  async function rate(rating: "again" | "hard" | "good" | "easy") {
    if (!current || busyRef.current) return;
    busyRef.current = true;
    setStats((s) => ({ ...s, [rating]: s[rating] + 1 }));
    try {
      await api(`/api/flashcards/review`, { method: "POST", body: { flashcard_id: current.id, rating } });
    } catch { /* keep going */ }
    if (rating === "again") {
      // requeue near the end
      setQueue((q) => [...q, current]);
    }
    setFlipped(false);
    if (idx + 1 >= queue.length) setDone(true);
    else setIdx((i) => i + 1);
    setTimeout(() => (busyRef.current = false), 250);
  }

  if (done || !current) {
    const total = stats.again + stats.hard + stats.good + stats.easy;
    const acc = total ? Math.round(((stats.good + stats.easy) / total) * 100) : 0;
    return (
      <div className="py-10 text-center">
        <div className="text-4xl">🎉</div>
        <h3 className="mt-2 text-[16px] font-semibold">Session complete</h3>
        <p className="mt-1 text-[13.5px] text-zinc-500">{total} cards reviewed · {acc}% recalled</p>
        <div className="mt-3 flex justify-center gap-2">
          <Badge tone="rose">{stats.again} again</Badge>
          <Badge tone="amber">{stats.hard} hard</Badge>
          <Badge tone="emerald">{stats.good} knew it</Badge>
          <Badge tone="sky">{stats.easy} easy</Badge>
        </div>
        <button className="btn-primary btn-sm mt-5" onClick={onFinished}>Back to deck</button>
      </div>
    );
  }

  const progress = Math.round((idx / Math.max(1, queue.length)) * 100);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-zinc-400">{idx + 1} / {queue.length}</span>
      </div>
      <div className="flip-scene" onClick={() => setFlipped((f) => !f)}>
        <div className={`flip-inner ${flipped ? "flipped" : ""}`} style={{ minHeight: 220 }}>
          <div className="flip-face card flex min-h-[220px] cursor-pointer flex-col items-center justify-center p-6 text-center">
            <Badge tone="zinc">{current.card_type.replace(/_/g, " ")}</Badge>
            <div className="mt-3 max-w-lg whitespace-pre-wrap text-[16px] font-medium leading-relaxed">{current.front}</div>
            <span className="mt-4 text-[11px] text-zinc-400">click to flip</span>
          </div>
          <div className="flip-face flip-face-back card absolute inset-0 flex min-h-[220px] cursor-pointer flex-col items-center justify-center bg-indigo-50/60 p-6 text-center dark:bg-indigo-500/5">
            <div className="max-w-lg whitespace-pre-wrap text-[15px] leading-relaxed">{current.back}</div>
          </div>
        </div>
      </div>
      {flipped ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button className="btn-secondary !border-rose-200 text-rose-600 dark:!border-rose-500/40 dark:text-rose-300" onClick={() => rate("again")}>Didn&apos;t know</button>
          <button className="btn-secondary !border-amber-200 text-amber-600 dark:!border-amber-500/40 dark:text-amber-300" onClick={() => rate("hard")}>Hard</button>
          <button className="btn-secondary !border-emerald-200 text-emerald-600 dark:!border-emerald-500/40 dark:text-emerald-300" onClick={() => rate("good")}>Know it</button>
          <button className="btn-secondary !border-sky-200 text-sky-600 dark:!border-sky-500/40 dark:text-sky-300" onClick={() => rate("easy")}>Easy</button>
        </div>
      ) : null}
    </div>
  );
}

function AddCardModal({ open, deckId, onClose, onSaved }: { open: boolean; deckId: number; onClose: () => void; onSaved: () => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await api("/api/flashcards", { body: { action: "add_card", deck_id: deckId, front, back } });
    setFront(""); setBack("");
    setBusy(false);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a card">
      <Field label="Front (prompt)"><input className="input" value={front} onChange={(e) => setFront(e.target.value)} autoFocus /></Field>
      <Field label="Back (answer)"><textarea className="input min-h-20" value={back} onChange={(e) => setBack(e.target.value)} /></Field>
      <div className="flex justify-end"><button className="btn-primary" onClick={save} disabled={busy || !front.trim() || !back.trim()}>Add card</button></div>
    </Modal>
  );
}
