"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot, ChevronDown, MessageSquareText, Plus, Send, Sparkles, Trash2, User as UserIcon, FileText,
} from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Badge, PageHeader, Spinner, Toast, EmptyState } from "@/components/ui";
import { Markdown } from "@/components/Markdown";

type Conversation = { id: number; title: string; mode: string; updated_at: string; last_message: string | null };
type Message = { id: number; role: string; content: string; meta: string | null; created_at: string };
type ModeInfo = { id: string; label: string };

const MODES: Array<{ id: string; label: string; desc: string }> = [
  { id: "simple", label: "Explain Simply", desc: "Most accessible" },
  { id: "standard", label: "Standard", desc: "Classroom level" },
  { id: "detailed", label: "Detailed", desc: "Thorough + examples" },
  { id: "step_by_step", label: "Step-by-Step", desc: "Sequential steps" },
  { id: "exam", label: "Exam Mode", desc: "Assessment focused" },
  { id: "teach_me", label: "Teach Me", desc: "Asks you questions" },
];

const STARTERS = [
  "What should I study today?",
  "What am I weakest at?",
  "Am I ready for my test?",
  "Quiz me",
  "Explain this like I'm a beginner",
  "Give me an exam-level explanation",
];

export default function TutorPage() {
  const { data: convData, refresh: refreshConvs } = useApi<{ conversations: Conversation[] }>("/api/tutor/conversations");
  const { data: aiInfo } = useApi<{ modes: ModeInfo[]; aiReady: boolean }>("/api/tutor/chat");
  const [active, setActive] = useState<number | null>(null);
  const { data: msgData, refresh: refreshMsgs } = useApi<{ messages: Message[] }>(active ? `/api/tutor/conversations/${active}` : null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("standard");
  const [modeOpen, setModeOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = msgData?.messages ?? [];
  const conversations = convData?.conversations ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setSending(true);
    try {
      const res = await api<{ conversationId: number; reply: string }>("/api/tutor/chat", {
        body: { conversation_id: active, message, mode },
      });
      if (!active) setActive(res.conversationId);
      refreshMsgs();
      refreshConvs();
    } catch (e) {
      setToast(`⚠️ ${(e as Error).message}`);
    }
    setSending(false);
  }

  async function newConversation() {
    setActive(null);
    refreshMsgs();
  }

  async function removeConversation(id: number) {
    await api(`/api/tutor/conversations/${id}`, { method: "DELETE" });
    if (active === id) { setActive(null); refreshMsgs(); }
    refreshConvs();
  }

  const activeMode = MODES.find((m) => m.id === mode);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="AI Tutor"
        subtitle="Knows your courses, topics, mastery, mistakes and deadlines — no context needed."
        actions={
          <button className="btn-primary btn-sm" onClick={newConversation}><Plus className="h-4 w-4" /> New chat</button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        {/* Conversation list */}
        <aside className="card hidden max-h-[70vh] overflow-y-auto p-2 lg:block">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-zinc-400">No conversations yet — ask anything.</p>
          ) : (
            conversations.map((c) => (
              <div key={c.id} className={`group flex items-center gap-1 rounded-lg ${active === c.id ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"}`}>
                <button onClick={() => setActive(c.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
                  <div className={`truncate text-[13px] font-medium ${active === c.id ? "text-indigo-700 dark:text-indigo-300" : ""}`}>{c.title}</div>
                  <div className="truncate text-[11px] text-zinc-400">{c.last_message?.slice(0, 40) ?? ""}</div>
                </button>
                <button className="btn-ghost btn-sm opacity-0 group-hover:opacity-100" onClick={() => removeConversation(c.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))
          )}
        </aside>

        {/* Chat */}
        <section className="card flex min-h-[60vh] flex-col">
          {/* Mode selector */}
          <div className="relative border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
            <button className="flex items-center gap-2 text-[13px] font-medium" onClick={() => setModeOpen((o) => !o)}>
              <Sparkles className="h-4 w-4 text-indigo-500" />
              {activeMode?.label ?? "Standard"}
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            </button>
            {modeOpen ? (
              <div className="absolute left-3 top-11 z-20 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                {MODES.map((m) => (
                  <button key={m.id} onClick={() => { setMode(m.id); setModeOpen(false); }}
                    className={`flex w-full items-start justify-between px-3.5 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${mode === m.id ? "bg-indigo-50/60 dark:bg-indigo-500/10" : ""}`}>
                    <span>
                      <span className="block text-[13px] font-medium">{m.label}</span>
                      <span className="block text-[11.5px] text-zinc-400">{m.desc}</span>
                    </span>
                    {mode === m.id ? <Badge tone="indigo">on</Badge> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" style={{ maxHeight: "56vh" }}>
            {messages.length === 0 && !sending ? (
              <div className="flex h-full flex-col items-center justify-center py-6 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/10">
                  <Bot className="h-6 w-6 text-indigo-500" />
                </div>
                <h3 className="text-[15px] font-semibold">Ask me anything about your studies</h3>
                <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-zinc-500">
                  I know your courses, current units, mastery levels, recurring mistakes and what&apos;s coming up.
                </p>
                {aiInfo && !aiInfo.aiReady ? (
                  <div className="mt-4 max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    AI isn&apos;t connected yet. Add your API key in <a href="/settings" className="underline">Settings</a> to chat, or load demo data to see a sample conversation.
                  </div>
                ) : null}
                <div className="mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-zinc-200 px-3 py-1.5 text-[12.5px] text-zinc-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-[14px] leading-relaxed text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10">
                    <Bot className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="min-w-0 max-w-[88%]">
                    <div className="rounded-2xl rounded-tl-md bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60">
                      <Markdown>{m.content}</Markdown>
                    </div>
                    <SourceChips meta={m.meta} />
                  </div>
                </div>
              )
            )}
            {sending ? (
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10">
                  <Bot className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-zinc-50 px-4 py-3 text-[13px] text-zinc-400 dark:bg-zinc-800/60">
                  <Spinner /> Thinking with your academic context…
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
            <div className="flex items-end gap-2">
              <textarea
                className="input max-h-32 min-h-11 flex-1 resize-none py-2.5"
                placeholder="Ask, paste a question, or say “quiz me”…"
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button className="btn-primary h-11 w-11 !px-0" onClick={() => send()} disabled={sending || !input.trim()}>
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      <Toast message={toast} tone={toast.startsWith("⚠️") ? "error" : "success"} />
    </div>
  );
}

function SourceChips({ meta }: { meta: string | null }) {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { sources?: Array<{ id: number; title: string }> };
    if (!parsed.sources?.length) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {parsed.sources.slice(0, 3).map((s) => (
          <a key={s.id} href={`/documents?doc=${s.id}`} className="badge bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400">
            <FileText className="h-3 w-3" /> {s.title}
          </a>
        ))}
      </div>
    );
  } catch {
    return null;
  }
}
