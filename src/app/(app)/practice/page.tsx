"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, Check, ChevronLeft, Lightbulb, ListChecks, Plus, RefreshCw, Sparkles, X, CircleCheck, CircleX,
} from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, DemoBadge, ErrorNote, Field, Modal, PageHeader, Spinner, Toast } from "@/components/ui";
import { Markdown } from "@/components/Markdown";

type SetRow = {
  id: number; title: string; difficulty: string; course_name: string | null; topic_name: string | null;
  question_count: number; actual_count: number; first_attempts: number; first_correct: number; is_demo: number; created_at: string;
};
type Question = {
  id: number; type: string; difficulty: string; prompt: string; choices: string[] | null; hint: string | null;
};
type Feedback = {
  correct: boolean; score: number; brief: string;
  misconception: { tag: string; description: string } | null;
  hint: string | null; fullExplanation: string | null; workedSolution: string | null;
};

export default function PracticePage() {
  const router = useRouter();
  const search = useSearchParams();
  const { data, refresh } = useApi<{ sets: SetRow[] }>("/api/practice");
  const { data: coursesData } = useApi<{ courses: Array<{ id: number; name: string }> }>("/api/courses");
  const [openSet, setOpenSet] = useState<number | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  useEffect(() => {
    const set = search.get("set");
    if (set) setOpenSet(Number(set));
  }, [search]);

  const sets = data?.sets ?? [];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Practice"
        subtitle="Questions generated from your curriculum. Wrong answers get a hint first — not the solution."
        actions={
          <button className="btn-primary btn-sm" onClick={() => setGenOpen(true)}>
            <Sparkles className="h-4 w-4" /> Generate questions
          </button>
        }
      />

      {sets.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <ListChecks className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <h3 className="text-[15px] font-semibold">No practice sets yet</h3>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Choose a course or topic, a difficulty and a question style. Studia targets your weakest areas and recurring mistakes.
          </p>
          <button className="btn-primary mt-4" onClick={() => setGenOpen(true)}><Sparkles className="h-4 w-4" /> Generate your first set</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sets.map((s) => {
            const acc = s.first_attempts ? Math.round((s.first_correct / s.first_attempts) * 100) : null;
            return (
              <button key={s.id} onClick={() => setOpenSet(s.id)} className="card card-hover flex flex-col p-4 text-left">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={s.difficulty === "exam" || s.difficulty === "challenge" ? "rose" : s.difficulty === "hard" ? "amber" : "sky"}>{s.difficulty}</Badge>
                  {s.is_demo ? <DemoBadge /> : null}
                </div>
                <div className="mt-2 line-clamp-2 flex-1 text-[14.5px] font-semibold leading-snug">{s.title}</div>
                <div className="mt-1 text-xs text-zinc-400">{[s.course_name, s.topic_name].filter(Boolean).join(" · ")}</div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{s.actual_count} questions</span>
                  {acc !== null ? (
                    <span className={acc >= 70 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-amber-600 dark:text-amber-400"}>{acc}% first-try</span>
                  ) : (
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">Start →</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <GeneratePracticeModal
        open={genOpen}
        courses={coursesData?.courses ?? []}
        initialCourse={search.get("course") ?? ""}
        initialTopic={search.get("topic") ?? ""}
        mistakeId={search.get("mistake") ?? ""}
        onClose={() => setGenOpen(false)}
        onCreated={(id) => { setGenOpen(false); refresh(); setOpenSet(id); }}
      />

      {openSet ? (
        <SetRunner
          id={openSet}
          onClose={() => {
            setOpenSet(null);
            refresh();
            router.replace("/practice");
          }}
        />
      ) : null}
    </div>
  );
}

const DIFFICULTIES = ["easy", "medium", "hard", "exam", "challenge"];
const QTYPES = [
  { id: "mixed", label: "Mixed" },
  { id: "multiple_choice", label: "Multiple choice" },
  { id: "short_answer", label: "Short answer" },
  { id: "calculation", label: "Calculation" },
  { id: "problem_solving", label: "Problem solving" },
  { id: "extended_response", label: "Extended response" },
  { id: "true_false", label: "True / false" },
];

function GeneratePracticeModal({
  open, courses, initialCourse, initialTopic, mistakeId, onClose, onCreated,
}: {
  open: boolean; courses: Array<{ id: number; name: string }>; initialCourse: string; initialTopic: string; mistakeId: string;
  onClose: () => void; onCreated: (id: number) => void;
}) {
  const [courseId, setCourseId] = useState(initialCourse);
  const [topicId, setTopicId] = useState(initialTopic);
  const [difficulty, setDifficulty] = useState("medium");
  const [types, setTypes] = useState<string[]>(["mixed"]);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: topicsData } = useApi<{ topics: Array<{ id: number; name: string }> }>(courseId ? `/api/courses/${courseId}` : null);

  useEffect(() => {
    if (open) {
      setCourseId(initialCourse);
      setTopicId(initialTopic);
    }
  }, [open, initialCourse, initialTopic]);

  const { data: mistakeCourseData } = useApi<{ mistakes: Array<{ id: number; description: string }> }>(
    mistakeId && initialCourse ? `/api/courses/${initialCourse}` : null
  );
  const mistakeDesc = mistakeId
    ? mistakeCourseData?.mistakes.find((m) => String(m.id) === mistakeId)?.description ?? null
    : null;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ setId: number }>("/api/practice", {
        body: {
          course_id: courseId ? Number(courseId) : null,
          topic_id: topicId ? Number(topicId) : null,
          difficulty, types, count,
          mistake_id: mistakeId ? Number(mistakeId) : undefined,
        },
      });
      onCreated(res.setId);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={mistakeDesc ? "Targeted practice" : "Generate practice questions"}>
      <ErrorNote error={error} />
      {mistakeDesc ? (
        <div className="mb-4 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Focusing on your recurring mistake: <span className="font-semibold">{mistakeDesc}</span>
        </div>
      ) : null}
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
      <Field label="Difficulty">
        <div className="flex flex-wrap gap-1.5">
          {DIFFICULTIES.map((d) => (
            <button key={d} onClick={() => setDifficulty(d)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${difficulty === d ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"}`}>
              {d}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Question types">
        <div className="flex flex-wrap gap-1.5">
          {QTYPES.map((t) => (
            <button key={t.id}
              onClick={() => setTypes((ts) => (t.id === "mixed" ? ["mixed"] : ts.includes(t.id) ? ts.filter((x) => x !== t.id) : [...ts.filter((x) => x !== "mixed"), t.id]))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${types.includes(t.id) ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="How many questions?">
        <div className="flex gap-2">
          {[3, 5, 10, 15].map((n) => (
            <button key={n} onClick={() => setCount(n)}
              className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-medium transition ${count === n ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
              {n}
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

function SetRunner({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, refresh } = useApi<{ set: SetRow & { course_name: string | null }; questions: Question[] }>(`/api/practice/${id}`);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ qid: number; correct: boolean; attempts: number }>>([]);
  const [similarBusy, setSimilarBusy] = useState(false);
  const [similarQ, setSimilarQ] = useState<Question | null>(null);
  const [toast, setToast] = useState("");

  const q = data?.questions?.[idx];
  const total = data?.questions.length ?? 0;
  const finished = idx >= total;

  const submit = useCallback(async () => {
    if (!q) return;
    const ans = q.choices ? (choice !== null ? q.choices[choice] : "") : answer;
    if (!ans.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const fb = await api<Feedback>("/api/practice/answer", { body: { question_id: q.id, answer: ans, attempt_number: attempt } });
      setFeedback(fb);
      setResults((r) => [...r.filter((x) => x.qid !== q.id), { qid: q.id, correct: fb.correct, attempts: attempt }]);
    } catch (e) {
      setError((e as Error).message);
    }
    setChecking(false);
  }, [q, choice, answer, attempt]);

  async function generateSimilar() {
    if (!q) return;
    setSimilarBusy(true);
    try {
      await api("/api/practice/answer", { body: { similar_to: q.id } });
      setToast("Similar question added to the end of this set — reopen it to see it ✓");
      refresh();
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
    }
    setSimilarBusy(false);
  }

  function next() {
    setFeedback(null);
    setAnswer("");
    setChoice(null);
    setAttempt(1);
    setIdx((i) => i + 1);
  }

  if (!data) return <Modal open onClose={onClose} title="Practice"><div className="flex justify-center py-8"><Spinner className="text-indigo-500" /></div></Modal>;
  if (!data.set)
    return (
      <Modal open onClose={onClose} title="Practice">
        <div className="py-10 text-center">
          <p className="text-[14px] font-medium">This practice set no longer exists.</p>
          <button className="btn-primary btn-sm mt-4" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );

  const firstTryCorrect = results.filter((r) => r.correct && r.attempts === 1).length;
  const answered = results.length;

  return (
    <Modal open onClose={onClose} title={data.set.title} wide>
      {finished ? (
        <div className="py-10 text-center">
          <div className="text-4xl">{answered && firstTryCorrect === answered ? "🏆" : "💪"}</div>
          <h3 className="mt-2 text-[16px] font-semibold">Set complete</h3>
          <p className="mt-1 text-[13.5px] text-zinc-500">
            {answered ? `${firstTryCorrect} of ${answered} on the first try` : "No questions answered"} · mastery estimates updated
          </p>
          <div className="mx-auto mt-3 flex max-w-xs flex-wrap justify-center gap-1.5">
            {(data.questions ?? []).map((qq) => {
              const r = results.find((x) => x.qid === qq.id);
              return (
                <span key={qq.id} title={r ? (r.correct ? `Correct (attempt ${r.attempts})` : "Needs work") : "Skipped"}
                  className={`h-2.5 w-2.5 rounded-full ${r ? (r.correct ? "bg-emerald-500" : "bg-rose-400") : "bg-zinc-200 dark:bg-zinc-700"}`} />
              );
            })}
          </div>
          <button className="btn-primary btn-sm mt-5" onClick={onClose}>Done</button>
        </div>
      ) : q ? (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${(idx / Math.max(1, total)) * 100}%` }} />
            </div>
            <span className="text-xs text-zinc-400">{idx + 1} / {total}</span>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="indigo">{q.type.replace(/_/g, " ")}</Badge>
            <Badge tone="zinc">{q.difficulty}</Badge>
            {attempt > 1 ? <Badge tone="amber">attempt {attempt}</Badge> : null}
          </div>

          <div className="mb-4 text-[15.5px] font-medium leading-relaxed">
            <Markdown>{q.prompt}</Markdown>
          </div>

          {q.choices ? (
            <div className="space-y-2">
              {q.choices.map((c, i) => (
                <button
                  key={i}
                  disabled={!!feedback}
                  onClick={() => setChoice(i)}
                  className={`block w-full rounded-lg border px-4 py-2.5 text-left text-[14px] transition ${
                    choice === i
                      ? feedback && !feedback.correct
                        ? "border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                        : feedback
                          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                          : "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              className="input min-h-28"
              placeholder="Type your answer — show your reasoning if you can"
              value={answer}
              disabled={!!feedback}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}

          <ErrorNote error={error} />

          {feedback ? (
            <FeedbackPanel fb={feedback} question={q} onRetry={() => { setFeedback(null); setAttempt((a) => a + 1); setAnswer(""); setChoice(null); }} onNext={next} onSimilar={generateSimilar} similarBusy={similarBusy} isLast={idx + 1 >= total} />
          ) : (
            <div className="mt-4 flex justify-end">
              <button className="btn-primary" onClick={submit} disabled={checking || (q.choices ? choice === null : !answer.trim())}>
                {checking ? <Spinner /> : <ArrowRight className="h-4 w-4" />} Check answer
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="py-10 text-center text-[13.5px] text-zinc-500">This set has no questions.</div>
      )}

      <Toast message={toast} tone={toast.startsWith("⚠️") ? "error" : "success"} />
    </Modal>
  );
}

function FeedbackPanel({
  fb, question, onRetry, onNext, onSimilar, similarBusy, isLast,
}: {
  fb: Feedback; question: Question; onRetry: () => void; onNext: () => void; onSimilar: () => void; similarBusy: boolean; isLast: boolean;
}) {
  const [showHint, setShowHint] = useState(false);
  const wrongFirstTry = !fb.correct;

  return (
    <div className={`mt-4 rounded-xl border p-4 ${fb.correct ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5"}`}>
      <div className="flex items-start gap-2.5">
        {fb.correct ? <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />}
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-semibold ${fb.correct ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
            {fb.correct ? "Correct" : fb.score >= 50 ? "Partially there" : "Not quite"}
          </div>
          <div className="mt-1 text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-300"><Markdown>{fb.brief}</Markdown></div>

          {fb.misconception && !fb.correct ? (
            <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[12.5px] text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300">
              <span className="font-semibold">Likely misconception:</span> {fb.misconception.description}
            </div>
          ) : null}

          {wrongFirstTry && fb.hint ? (
            showHint ? (
              <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                <span><span className="font-semibold">Hint:</span> {fb.hint}</span>
              </div>
            ) : (
              <button className="btn-secondary btn-sm mt-2.5" onClick={() => setShowHint(true)}>
                <Lightbulb className="h-4 w-4" /> Show me a hint
              </button>
            )
          ) : null}

          {fb.fullExplanation ? (
            <div className="mt-3 rounded-lg bg-white/80 p-3.5 dark:bg-zinc-900/70">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Full explanation</div>
              <div className="text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-300"><Markdown>{fb.fullExplanation}</Markdown></div>
              {fb.workedSolution ? (
                <div className="mt-2 rounded-md bg-zinc-50 px-3 py-2 font-mono text-[13px] dark:bg-zinc-800/80">{fb.workedSolution}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {wrongFirstTry ? (
          <button className="btn-secondary" onClick={onRetry}><RefreshCw className="h-4 w-4" /> Try again</button>
        ) : null}
        {!fb.correct && fb.fullExplanation ? (
          <button className="btn-secondary" onClick={onSimilar} disabled={similarBusy}>
            {similarBusy ? <Spinner /> : <Sparkles className="h-4 w-4" />} Try a similar problem
          </button>
        ) : null}
        <button className="btn-primary" onClick={onNext}>{isLast ? "Finish" : "Next question"} <ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
