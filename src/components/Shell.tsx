"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Library, FileText, StickyNote, Layers, ListChecks, CalendarClock,
  Compass, MessageSquareText, TrendingUp, Settings, Search, Bell, Sun, Moon, Menu, X,
  GraduationCap, Plus, CornerDownLeft, Trash2,
} from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Spinner, daysLabel, fmtDate } from "@/components/ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "My Courses", icon: Library },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/practice", label: "Practice", icon: ListChecks },
  { href: "/assessments", label: "Tests & Assignments", icon: CalendarClock },
  { href: "/planner", label: "Study Planner", icon: Compass },
  { href: "/tutor", label: "AI Tutor", icon: MessageSquareText },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: Library },
  { href: "/tutor", label: "Tutor", icon: MessageSquareText },
  { href: "/planner", label: "Plan", icon: Compass },
];

type Notification = { id: string; severity: string; title: string; body: string; href: string; actionLabel?: string };

export function Shell({ children, demoActive }: { children: ReactNode; demoActive: boolean }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const { data: notifData, refresh: refreshNotifs } = useApi<{ notifications: Notification[] }>("/api/notifications");
  const notifs = notifData?.notifications ?? [];

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    const t = setInterval(refreshNotifs, 60_000);
    return () => clearInterval(t);
  }, [refreshNotifs]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-zinc-200/80 bg-white px-3 py-4 dark:border-zinc-800 dark:bg-zinc-900 lg:flex">
        <Logo />
        <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-item ${isActive(item.href) ? "nav-item-active" : ""}`}>
              <item.icon className="h-[17px] w-[17px]" strokeWidth={2} />
              {item.label}
            </Link>
          ))}
        </nav>
        <SidebarFooter demoActive={demoActive} />
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white px-3 py-4 shadow-2xl dark:bg-zinc-900 animate-pop">
            <div className="flex items-center justify-between">
              <Logo />
              <button className="btn-ghost btn-sm" onClick={() => setDrawer(false)}><X className="h-4 w-4" /></button>
            </div>
            <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className={`nav-item ${isActive(item.href) ? "nav-item-active" : ""}`}>
                  <item.icon className="h-[17px] w-[17px]" strokeWidth={2} />
                  {item.label}
                </Link>
              ))}
            </nav>
            <SidebarFooter demoActive={demoActive} />
          </aside>
        </div>
      ) : null}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-zinc-200/80 bg-zinc-50/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <button className="btn-ghost btn-sm lg:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden"><LogoMini /></div>
          <SearchButton />
          <div className="flex-1" />
          <Link href="/documents?upload=1" className="btn-primary btn-sm hidden sm:inline-flex">
            <Plus className="h-4 w-4" /> Add School Material
          </Link>
          <NotificationsButton notifications={notifs} />
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 lg:hidden">
        {MOBILE_TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium ${isActive(t.href) ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-500 dark:text-zinc-400"}`}>
            <t.icon className="h-5 w-5" />
            {t.label}
          </Link>
        ))}
        <button onClick={() => setDrawer(true)} className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400">
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>
    </div>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-sm shadow-indigo-600/30">
        <GraduationCap className="h-[18px] w-[18px] text-white" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">Studia</div>
        <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-400">study companion</div>
      </div>
    </Link>
  );
}
function LogoMini() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600">
        <GraduationCap className="h-4 w-4 text-white" />
      </div>
      <span className="text-[15px] font-semibold tracking-tight">Studia</span>
    </Link>
  );
}

function SidebarFooter({ demoActive }: { demoActive: boolean }) {
  return (
    <div className="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      {demoActive ? (
        <Link href="/settings" className="block rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          <span className="font-semibold">Demo mode.</span> You&apos;re exploring sample data —{" "}
          <span className="underline">clear it in Settings</span>.
        </Link>
      ) : null}
      <div className="flex items-center justify-between px-2">
        <ThemeToggle />
        <span className="text-[11px] text-zinc-400">Your data stays on this device</span>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("studia-theme", next ? "dark" : "light");
    } catch { /* ignore */ }
  };
  return (
    <button className="btn-ghost btn-sm" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
    </button>
  );
}

function NotificationsButton({ notifications }: { notifications: Notification[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const tone: Record<string, string> = {
    red: "bg-rose-500", amber: "bg-amber-500", blue: "bg-sky-500", green: "bg-emerald-500",
  };
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost btn-sm relative" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Bell className="h-[17px] w-[17px]" />
        {notifications.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {notifications.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="card absolute right-0 top-11 z-40 w-80 overflow-hidden shadow-xl animate-pop sm:w-96">
          <div className="border-b border-zinc-100 px-4 py-2.5 text-[13px] font-semibold dark:border-zinc-800">Notifications</div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-zinc-400">You&apos;re all caught up 🎉</div>
            ) : (
              notifications.map((n) => (
                <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="flex gap-3 border-b border-zinc-50 px-4 py-3 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone[n.severity] ?? "bg-zinc-400"}`} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium leading-snug">{n.title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{n.body}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 sm:h-9 sm:w-64 sm:justify-start sm:gap-2 sm:border sm:border-zinc-200 sm:bg-white sm:px-3 sm:text-[13px] sm:text-zinc-400 dark:sm:border-zinc-700 dark:sm:bg-zinc-900"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Search everything…</span>
        <span className="ml-auto hidden sm:inline"><kbd className="kbd">⌘K</kbd></span>
      </button>
      {open ? <SearchModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type SearchResults = {
  query: string;
  results: {
    courses: Array<{ id: number; name: string }>;
    topics: Array<{ id: number; name: string; course_name: string | null; href: string }>;
    documents: Array<{ id: number; title: string; doc_type: string; course_name: string | null; href: string }>;
    notes: Array<{ id: number; title: string; kind: string; href: string }>;
    assessments: Array<{ id: number; title: string; type: string; due_date: string | null; href: string }>;
    flashcards: Array<{ id: number; front: string; href: string }>;
    questions: Array<{ id: number; prompt: string; href: string }>;
    snippets: Array<{ documentId: number; snippet: string; document_title: string; href: string }>;
  };
};

function SearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!q.trim()) {
      setData(null);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      api<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`)
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  const r = data?.results;
  const empty =
    r && !r.courses.length && !r.topics.length && !r.documents.length && !r.notes.length && !r.assessments.length && !r.flashcards.length && !r.questions.length && !r.snippets.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px] animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card w-full max-w-xl overflow-hidden shadow-2xl animate-pop">
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 dark:border-zinc-800">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses, topics, documents, notes…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-400"
          />
          {loading ? <Spinner className="text-zinc-400" /> : <button onClick={onClose} className="kbd">esc</button>}
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {!q.trim() ? (
            <div className="px-3 py-8 text-center text-[13px] text-zinc-400">
              Try &ldquo;that worksheet about quadratic graphs&rdquo; or just &ldquo;respiration&rdquo;
            </div>
          ) : empty ? (
            <div className="px-3 py-8 text-center text-[13px] text-zinc-400">Nothing found for &ldquo;{q}&rdquo;</div>
          ) : r ? (
            <div className="space-y-1">
              <Group label="Courses">
                {r.courses.map((c) => (
                  <Row key={`c${c.id}`} onClick={() => go(`/courses/${c.id}`)} title={c.name} icon={<Library className="h-4 w-4 text-indigo-500" />} />
                ))}
              </Group>
              <Group label="Topics">
                {r.topics.map((t) => (
                  <Row key={`t${t.id}`} onClick={() => go(t.href)} title={t.name} subtitle={t.course_name ?? undefined} icon={<Layers className="h-4 w-4 text-emerald-500" />} />
                ))}
              </Group>
              <Group label="Documents">
                {r.documents.map((d) => (
                  <Row key={`d${d.id}`} onClick={() => go(d.href)} title={d.title} subtitle={d.course_name ?? d.doc_type} icon={<FileText className="h-4 w-4 text-sky-500" />} />
                ))}
              </Group>
              {r.snippets.length ? (
                <Group label="Matching text">
                  {r.snippets.map((s, i) => (
                    <Row key={`s${i}`} onClick={() => go(s.href)} title={s.document_title} subtitle={s.snippet.replace(/›|‹/g, "")} icon={<Search className="h-4 w-4 text-zinc-400" />} />
                  ))}
                </Group>
              ) : null}
              <Group label="Notes">
                {r.notes.map((n) => (
                  <Row key={`n${n.id}`} onClick={() => go(n.href)} title={n.title} icon={<StickyNote className="h-4 w-4 text-amber-500" />} />
                ))}
              </Group>
              <Group label="Assessments">
                {r.assessments.map((a) => (
                  <Row key={`a${a.id}`} onClick={() => go(a.href)} title={a.title} subtitle={fmtDate(a.due_date) + " · " + daysLabel(dateDays(a.due_date))} icon={<CalendarClock className="h-4 w-4 text-rose-500" />} />
                ))}
              </Group>
              <Group label="Flashcards">
                {r.flashcards.map((f) => (
                  <Row key={`f${f.id}`} onClick={() => go(f.href)} title={f.front} icon={<Layers className="h-4 w-4 text-violet-500" />} />
                ))}
              </Group>
              <Group label="Questions">
                {r.questions.map((x) => (
                  <Row key={`q${x.id}`} onClick={() => go(x.href)} title={x.prompt} icon={<ListChecks className="h-4 w-4 text-emerald-500" />} />
                ))}
              </Group>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-400 dark:border-zinc-800">
          <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> click a result to open</span>
          <span>Studia search</span>
        </div>
      </div>
    </div>
  );
}

function dateDays(d: string | null): number | null {
  if (!d) return null;
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return null;
  const due = new Date(y, m - 1, day);
  const now = new Date();
  return Math.round((due.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  if (!arr.flat().some(Boolean)) return null;
  return (
    <div>
      <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
      {children}
    </div>
  );
}

function Row({ onClick, title, subtitle, icon }: { onClick: () => void; title: string; subtitle?: string; icon: ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium">{title}</span>
        {subtitle ? <span className="block truncate text-xs text-zinc-400">{subtitle}</span> : null}
      </span>
    </button>
  );
}

export function DeleteButton({ onDelete, label = "Delete" }: { onDelete: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={armed ? "btn-danger btn-sm" : "btn-ghost btn-sm text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) onDelete();
        else setArmed(true);
      }}
      title={label}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {armed ? <span className="hidden sm:inline">Confirm?</span> : null}
    </button>
  );
}
