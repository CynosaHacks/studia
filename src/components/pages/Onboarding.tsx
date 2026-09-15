"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap, Plus, Trash2, ArrowRight, ArrowLeft, Sparkles, Check,
  Bot, PlayCircle, Wand2, Eye, ListOrdered,
} from "lucide-react";
import { api } from "@/lib/client";
import { Field, ErrorNote, Toast, Spinner } from "@/components/ui";

const GRADES = ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "College / University", "Other"];
const YEARS = ["2025", "2026", "2027"];
const COMMON_SUBJECTS = ["Mathematics", "Science", "English", "History", "Geography", "Physics", "Chemistry", "Biology", "Spanish", "French", "Art", "Music", "PE", "Economics", "Computer Science"];
const DIFFICULT_OPTIONS = ["Mathematics", "Science", "English", "History", "Languages", "Essay writing", "Exams", "Time management"];

type CourseDraft = { name: string; teacher: string; current_unit: string; topics: string };

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const [name, setName] = useState("");
  const [grade, setGrade] = useState("Year 10");
  const [schoolYear, setSchoolYear] = useState("2026");

  const [courses, setCourses] = useState<CourseDraft[]>([{ name: "", teacher: "", current_unit: "", topics: "" }]);

  const [explanation, setExplanation] = useState<"simple" | "standard" | "detailed">("standard");
  const [notesStyle, setNotesStyle] = useState<"concise" | "detailed">("concise");
  const [preferExamples, setPreferExamples] = useState(true);
  const [preferVisual, setPreferVisual] = useState(true);
  const [difficult, setDifficult] = useState<string[]>([]);
  const [goals, setGoals] = useState("");
  const [minutes, setMinutes] = useState(45);

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);

  async function loadDemo() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/settings/action", { body: { action: "load_demo" } });
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      if (baseUrl.trim() && model.trim()) {
        await api("/api/settings", { method: "PUT", body: { ai: { baseUrl, apiKey, model } } });
      }
      await api("/api/profile", {
        body: {
          name: name.trim() || "Student",
          grade_level: grade,
          school_year: schoolYear,
          courses: courses.filter((c) => c.name.trim()).map((c, i) => ({ ...c, color: ["indigo", "emerald", "rose", "amber", "sky", "violet"][i % 6] })),
          preferences: {
            explanation_detail: explanation,
            notes_style: notesStyle,
            prefer_examples: preferExamples,
            prefer_visual: preferVisual,
            difficult_subjects: difficult,
            goals,
            study_minutes_per_day: minutes,
          },
        },
      });
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function testConnection() {
    setTestMsg(null);
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/settings", {
        method: "POST",
        body: { action: "test", baseUrl, apiKey, model },
      });
      setTestMsg(res);
    } catch (e) {
      setTestMsg({ ok: false, message: (e as Error).message });
    }
    setBusy(false);
  }

  const steps = ["About you", "Your subjects", "How you learn", "Connect AI (optional)"];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-md shadow-indigo-600/30">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">Welcome to Studia</div>
            <div className="text-[13px] text-zinc-500">Your AI study companion — it remembers your whole academic journey.</div>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-1.5">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col gap-1.5">
              <div className={`h-1 rounded-full transition-colors ${i <= step ? "bg-indigo-500" : "bg-zinc-200 dark:bg-zinc-800"}`} />
              <span className={`hidden text-[11px] font-medium sm:block ${i === step ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400"}`}>{s}</span>
            </div>
          ))}
        </div>

        <div className="card flex-1 p-6 sm:p-8 animate-fade-up" key={step}>
          <ErrorNote error={error} />

          {step === 0 ? (
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Let&apos;s set up your academic profile</h2>
              <p className="mt-1.5 text-[13.5px] text-zinc-500">Studia uses this to personalize every explanation, plan and practice set.</p>
              <div className="mt-6">
                <Field label="What should Studia call you?">
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" autoFocus />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="What grade / year are you in?">
                    <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
                      {GRADES.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </Field>
                  <Field label="Current school year">
                    <select className="input" value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)}>
                      {YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
              <div className="mt-6 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/5">
                <div className="flex items-start gap-3">
                  <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
                  <div className="flex-1">
                    <div className="text-[13.5px] font-semibold">Just exploring?</div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Load a demo Year 10 student (Maths, Science, English) with sample documents, notes, flashcards and an upcoming test — no setup needed.
                    </p>
                    <button className="btn-secondary btn-sm mt-2.5" onClick={loadDemo} disabled={busy}>
                      {busy ? <Spinner /> : <Wand2 className="h-4 w-4" />} Load demo data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <h2 className="text-xl font-semibold tracking-tight">What subjects are you taking?</h2>
              <p className="mt-1.5 text-[13.5px] text-zinc-500">Add your current unit — it helps the AI tutor know what you&apos;re working on right now.</p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {COMMON_SUBJECTS.filter((s) => !courses.some((c) => c.name === s)).map((s) => (
                  <button
                    key={s}
                    className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
                    onClick={() => setCourses((cs) => (cs.some((c) => !c.name.trim()) ? cs.map((c, i) => (i === cs.findIndex((x) => !x.name.trim()) ? { ...c, name: s } : c)) : [...cs, { name: s, teacher: "", current_unit: "", topics: "" }]))}
                  >
                    + {s}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                {courses.map((c, i) => (
                  <div key={i} className="card p-3.5">
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1 font-medium"
                        placeholder="Course name (e.g. Mathematics)"
                        value={c.name}
                        onChange={(e) => setCourses((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      />
                      {courses.length > 1 ? (
                        <button className="btn-ghost btn-sm text-rose-500" onClick={() => setCourses((cs) => cs.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input className="input" placeholder="Teacher (optional)" value={c.teacher} onChange={(e) => setCourses((cs) => cs.map((x, j) => (j === i ? { ...x, teacher: e.target.value } : x)))} />
                      <input className="input" placeholder="Current unit / topic (optional)" value={c.current_unit} onChange={(e) => setCourses((cs) => cs.map((x, j) => (j === i ? { ...x, current_unit: e.target.value } : x)))} />
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-ghost btn-sm mt-3" onClick={() => setCourses((cs) => [...cs, { name: "", teacher: "", current_unit: "", topics: "" }])}>
                <Plus className="h-4 w-4" /> Add another course
              </button>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h2 className="text-xl font-semibold tracking-tight">How do you like to learn?</h2>
              <p className="mt-1.5 text-[13.5px] text-zinc-500">You can change all of this later in Settings.</p>

              <div className="mt-5 space-y-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {[
                    { id: "simple", label: "Explain simply", desc: "Plain language, minimal jargon", icon: Sparkles },
                    { id: "standard", label: "Standard", desc: "Normal classroom level", icon: GraduationCap },
                    { id: "detailed", label: "Detailed", desc: "Thorough, with examples", icon: ListOrdered },
                  ].map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setExplanation(o.id as typeof explanation)}
                      className={`card card-hover p-3.5 text-left ${explanation === o.id ? "ring-2 ring-indigo-500 border-transparent" : ""}`}
                    >
                      <o.icon className={`h-4.5 w-4.5 h-5 w-5 ${explanation === o.id ? "text-indigo-500" : "text-zinc-400"}`} />
                      <div className="mt-2 text-[13.5px] font-semibold">{o.label}</div>
                      <div className="text-xs text-zinc-500">{o.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="card divide-y divide-zinc-100 dark:divide-zinc-800">
                  <ToggleRow icon={<Eye className="h-4 w-4 text-zinc-400" />} label="Prefer worked examples" desc="Show example problems when explaining" checked={preferExamples} onChange={setPreferExamples} />
                  <ToggleRow icon={<Sparkles className="h-4 w-4 text-zinc-400" />} label="Prefer visual explanations" desc="Diagrams and tables where helpful" checked={preferVisual} onChange={setPreferVisual} />
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium">Notes style</div>
                      <div className="text-xs text-zinc-500">Concise summaries or detailed write-ups</div>
                    </div>
                    <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                      {(["concise", "detailed"] as const).map((s) => (
                        <button key={s} onClick={() => setNotesStyle(s)} className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${notesStyle === s ? "bg-indigo-600 text-white" : "text-zinc-500"}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium">Study time per day</div>
                      <div className="text-xs text-zinc-500">Used by the study planner</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={10} max={240} step={5} className="input w-20 text-center" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 45)} />
                      <span className="text-xs text-zinc-400">min</span>
                    </div>
                  </div>
                </div>

                <Field label="Which subjects do you find difficult?">
                  <div className="flex flex-wrap gap-1.5">
                    {DIFFICULT_OPTIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDifficult((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${difficult.includes(d) ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Academic goals (optional)">
                  <textarea className="input min-h-20" placeholder="e.g. Get an A in end-of-year Maths; stay on top of Science assessments" value={goals} onChange={(e) => setGoals(e.target.value)} />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                <Bot className="h-5 w-5 text-indigo-500" /> Connect your AI
              </h2>
              <p className="mt-1.5 text-[13.5px] text-zinc-500">
                Studia works with any OpenAI-compatible API (OpenAI, Azure, OpenRouter, local models…). Your key is stored on this device only and never leaves your machine except to call your chosen provider. You can skip this and add it later in Settings.
              </p>
              <div className="mt-5">
                <Field label="Base URL" hint="e.g. https://api.openai.com/v1">
                  <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
                </Field>
                <Field label="API key">
                  <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
                </Field>
                <Field label="Model" hint="e.g. gpt-4o-mini, claude-sonnet-4-20250514, gemini-2.0-flash">
                  <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
                </Field>
                {testMsg ? (
                  <div className={`mb-3 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed ${testMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"}`}>
                    {testMsg.message}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button className="btn-secondary btn-sm" onClick={testConnection} disabled={busy || !baseUrl || !model}>
                    <Check className="h-4 w-4" /> Test connection
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button className="btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < 3 ? (
            <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button className="btn-primary" onClick={finish} disabled={busy}>
              {busy ? <Spinner /> : <Check className="h-4 w-4" />} Finish setup
            </button>
          )}
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}

function ToggleRow({ icon, label, desc, checked, onChange }: { icon: React.ReactNode; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium">{label}</div>
          <div className="text-xs text-zinc-500">{desc}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-zinc-200 dark:bg-zinc-700"}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
