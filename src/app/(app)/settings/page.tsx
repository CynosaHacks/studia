"use client";

import { useEffect, useState } from "react";
import {
  Bot, Check, Database, Download, KeyRound, RefreshCcw, Save, ShieldAlert, Trash2, Wand2, User,
} from "lucide-react";
import { api, useApi } from "@/lib/client";
import { ErrorNote, Field, PageHeader, Spinner, Toast } from "@/components/ui";

type SettingsData = {
  ai: { baseUrl: string; model: string; apiKeyMasked: string | null; hasKey: boolean };
  demo: boolean;
  profile: { name: string; grade_level: string; school_year: string; explanation_detail: string; notes_style: string; prefer_examples: number; prefer_visual: number; difficult_subjects: string; goals: string; study_minutes_per_day: number } | null;
};

const DIFFICULT_OPTIONS = ["Mathematics", "Science", "English", "History", "Languages", "Essay writing", "Exams", "Time management"];

export default function SettingsPage() {
  const { data, refresh } = useApi<SettingsData>("/api/settings");
  const [ai, setAi] = useState({ baseUrl: "", model: "", apiKey: "" });
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [savingAi, setSavingAi] = useState(false);
  const [profile, setProfile] = useState<{ name: string; grade_level: string; school_year: string; goals: string } | null>(null);
  const [prefs, setPrefs] = useState<{ explanation_detail: string; notes_style: string; prefer_examples: boolean; prefer_visual: boolean; difficult_subjects: string[]; study_minutes_per_day: number } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(0);

  useEffect(() => {
    if (!data) return;
    setAi({ baseUrl: data.ai.baseUrl, model: data.ai.model, apiKey: "" });
    if (data.profile) {
      setProfile({ name: data.profile.name, grade_level: data.profile.grade_level, school_year: data.profile.school_year, goals: data.profile.goals ?? "" });
      let diff: string[] = [];
      try { diff = JSON.parse(data.profile.difficult_subjects || "[]"); } catch { /* ignore */ }
      setPrefs({
        explanation_detail: data.profile.explanation_detail,
        notes_style: data.profile.notes_style,
        prefer_examples: !!data.profile.prefer_examples,
        prefer_visual: !!data.profile.prefer_visual,
        difficult_subjects: diff,
        study_minutes_per_day: data.profile.study_minutes_per_day ?? 45,
      });
    }
  }, [data]);

  async function saveAI() {
    setSavingAi(true);
    try {
      await api("/api/settings", { method: "PUT", body: { ai } });
      setToast("AI settings saved ✓");
      refresh();
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
    }
    setSavingAi(false);
  }

  async function testAI() {
    setTestMsg(null);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/settings", {
        method: "POST",
        body: { action: "test", baseUrl: ai.baseUrl, apiKey: ai.apiKey || undefined, model: ai.model },
      });
      setTestMsg(res);
    } catch (e) {
      setTestMsg({ ok: false, message: (e as Error).message });
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await api("/api/settings", { method: "PUT", body: { profile, preferences: prefs } });
      setToast("Profile saved ✓");
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
    }
    setSavingProfile(false);
  }

  async function action(name: string) {
    try {
      const r = await api<{ message: string }>("/api/settings/action", { body: { action: name } });
      setToast(r.message ?? "Done ✓");
      if (name === "delete_all") {
        setTimeout(() => window.location.href = "/onboarding", 800);
      } else {
        refresh();
      }
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
    }
  }

  if (!data) return <div className="flex h-64 items-center justify-center"><Spinner className="h-6 w-6 text-indigo-500" /></div>;

  return (
    <div className="animate-fade-up max-w-3xl">
      <PageHeader title="Settings" subtitle="AI provider, profile, learning preferences, privacy and data." />

      {/* AI provider */}
      <section className="card mb-4 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><Bot className="h-4 w-4 text-indigo-500" /> AI provider</h2>
        <p className="mb-4 text-[13px] text-zinc-500">Any OpenAI-compatible endpoint. Your key is stored locally on this device and used only to call your chosen provider.</p>
        <Field label="Base URL" hint="e.g. https://api.openai.com/v1 · https://openrouter.ai/api/v1 · http://localhost:11434/v1 (Ollama)">
          <input className="input" value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="API key" hint={data.ai.hasKey ? `Saved: ${data.ai.apiKeyMasked} — leave blank to keep` : "e.g. sk-…"}>
            <input className="input" type="password" value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} placeholder={data.ai.hasKey ? "•••••••• (saved)" : "sk-…"} />
          </Field>
          <Field label="Model" hint="e.g. gpt-4o-mini · claude-sonnet-4 · gemini-2.0-flash · llama3">
            <input className="input" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="gpt-4o-mini" />
          </Field>
        </div>
        {testMsg ? (
          <div className={`mb-3 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed ${testMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"}`}>
            {testMsg.message}
          </div>
        ) : null}
        <div className="flex gap-2">
          <button className="btn-primary btn-sm" onClick={saveAI} disabled={savingAi}>{savingAi ? <Spinner /> : <Save className="h-4 w-4" />} Save</button>
          <button className="btn-secondary btn-sm" onClick={testAI}><KeyRound className="h-4 w-4" /> Test connection</button>
          {data.ai.hasKey ? (
            <button className="btn-ghost btn-sm text-rose-500" onClick={() => api("/api/settings", { method: "PUT", body: { ai: { clearKey: true } } }).then(refresh)}>Remove key</button>
          ) : null}
        </div>
      </section>

      {/* Profile */}
      {profile && prefs ? (
        <section className="card mb-4 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><User className="h-4 w-4 text-sky-500" /> About you</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Name"><input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
            <Field label="Grade / year"><input className="input" value={profile.grade_level} onChange={(e) => setProfile({ ...profile, grade_level: e.target.value })} /></Field>
            <Field label="School year"><input className="input" value={profile.school_year} onChange={(e) => setProfile({ ...profile, school_year: e.target.value })} /></Field>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Explanation detail">
              <select className="input" value={prefs.explanation_detail} onChange={(e) => setPrefs({ ...prefs, explanation_detail: e.target.value })}>
                <option value="simple">Simple</option><option value="standard">Standard</option><option value="detailed">Detailed</option>
              </select>
            </Field>
            <Field label="Notes style">
              <select className="input" value={prefs.notes_style} onChange={(e) => setPrefs({ ...prefs, notes_style: e.target.value })}>
                <option value="concise">Concise</option><option value="detailed">Detailed</option>
              </select>
            </Field>
            <Field label="Study minutes per day">
              <input className="input" type="number" min={10} max={240} value={prefs.study_minutes_per_day} onChange={(e) => setPrefs({ ...prefs, study_minutes_per_day: Number(e.target.value) || 45 })} />
            </Field>
          </div>
          <div className="mb-4 flex flex-wrap gap-4">
            <Toggle label="Prefer worked examples" checked={prefs.prefer_examples} onChange={(v) => setPrefs({ ...prefs, prefer_examples: v })} />
            <Toggle label="Prefer visual explanations" checked={prefs.prefer_visual} onChange={(v) => setPrefs({ ...prefs, prefer_visual: v })} />
          </div>
          <Field label="Subjects you find difficult">
            <div className="flex flex-wrap gap-1.5">
              {DIFFICULT_OPTIONS.map((d) => (
                <button key={d} onClick={() => setPrefs({ ...prefs, difficult_subjects: prefs.difficult_subjects.includes(d) ? prefs.difficult_subjects.filter((x) => x !== d) : [...prefs.difficult_subjects, d] })}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${prefs.difficult_subjects.includes(d) ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"}`}>
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Academic goals">
            <textarea className="input min-h-20" value={profile.goals} onChange={(e) => setProfile({ ...profile, goals: e.target.value })} />
          </Field>
          <button className="btn-primary btn-sm" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? <Spinner /> : <Save className="h-4 w-4" />} Save profile</button>
        </section>
      ) : null}

      {/* Demo mode */}
      <section className="card mb-4 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><Wand2 className="h-4 w-4 text-amber-500" /> Demo mode</h2>
        <p className="mb-3 text-[13px] text-zinc-500">
          {data.demo
            ? "Demo data is currently loaded — all sample content is clearly labelled and can be cleared anytime."
            : "Load a fully populated Year 10 student (Maths, Science, English) to explore Studia without connecting AI."}
        </p>
        <div className="flex flex-wrap gap-2">
          {data.demo ? (
            <button className="btn-secondary btn-sm" onClick={() => action("clear_demo")}><Trash2 className="h-4 w-4" /> Clear demo data</button>
          ) : (
            <button className="btn-secondary btn-sm" onClick={() => action("load_demo")}><Wand2 className="h-4 w-4" /> Load demo data</button>
          )}
        </div>
      </section>

      {/* Privacy & data */}
      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><Database className="h-4 w-4 text-emerald-500" /> Privacy &amp; data</h2>
        <p className="mb-4 text-[13px] text-zinc-500">Your data lives in a local database on this device. Nothing is sent anywhere except AI calls to your own configured provider.</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary btn-sm" href="/api/settings/action" download><Download className="h-4 w-4" /> Export all data (JSON)</a>
          <button className="btn-secondary btn-sm" onClick={() => action("reset_ai_memory")}><RefreshCcw className="h-4 w-4" /> Reset AI memory</button>
          {confirmWipe === 0 ? (
            <button className="btn-ghost btn-sm text-rose-500" onClick={() => setConfirmWipe(1)}><ShieldAlert className="h-4 w-4" /> Delete all data…</button>
          ) : confirmWipe === 1 ? (
            <button className="btn-danger btn-sm" onClick={() => setConfirmWipe(2)}>Really delete everything? Click again</button>
          ) : (
            <button className="btn-danger btn-sm" onClick={() => action("delete_all")}><Trash2 className="h-4 w-4" /> Final: wipe everything</button>
          )}
        </div>
        <p className="mt-3 text-[11.5px] text-zinc-400">Reset AI memory clears conversations, mastery estimates, mistakes and study history — keeping courses, documents and notes.</p>
      </section>

      <Toast message={toast} tone={toast.startsWith("⚠️") ? "error" : "success"} />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="flex items-center gap-2.5 text-[13.5px] font-medium" onClick={() => onChange(!checked)}>
      <span className={`relative h-6 w-10 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-zinc-200 dark:bg-zinc-700"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}
