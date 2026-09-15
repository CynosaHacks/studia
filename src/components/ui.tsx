"use client";

import { ReactNode, useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} />;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-zinc-300 dark:text-zinc-600">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h3>
      {body ? <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card max-h-[90vh] w-full overflow-y-auto rounded-b-none rounded-t-2xl shadow-2xl animate-pop sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-5 py-3.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm !px-1.5" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function MasteryBar({ value, className = "" }: { value: number; className?: string }) {
  const color =
    value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-lime-500" : value >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 ${className}`}>
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(2, value)}%` }} />
    </div>
  );
}

export function Ring({ value, size = 44, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? "#10b981" : value >= 60 ? "#84cc16" : value >= 40 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, Math.max(0, value))) / 100} strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-[11px] font-semibold">{value}</span>
    </div>
  );
}

export function Badge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet" }) {
  const tones: Record<string, string> = {
    zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function DemoBadge() {
  return (
    <span className="badge border border-dashed border-amber-400/70 bg-amber-50/60 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300" title="This item is sample data">
      demo
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      {error}
    </div>
  );
}

export function Toast({ message, tone = "success" }: { message: string; tone?: "success" | "error" }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [message]);
  if (!visible || !message) return null;
  return (
    <div className={`fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-[13px] font-medium shadow-lg animate-pop sm:bottom-6 ${tone === "success" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-rose-600 text-white"}`}>
      {message}
    </div>
  );
}

export function ConfirmButton({
  onConfirm,
  children,
  className = "btn-ghost btn-sm",
  confirmLabel = "Confirm delete",
}: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
  confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={armed ? "btn-danger btn-sm" : className}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) onConfirm();
        else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export function daysLabel(days: number | null): string {
  if (days === null) return "No date";
  if (days < -1) return `${-days} days ago`;
  if (days === -1) return "Yesterday";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export const COURSE_COLORS: Record<string, { dot: string; soft: string; text: string }> = {
  indigo: { dot: "bg-indigo-500", soft: "bg-indigo-50 dark:bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-300" },
  emerald: { dot: "bg-emerald-500", soft: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-300" },
  rose: { dot: "bg-rose-500", soft: "bg-rose-50 dark:bg-rose-500/10", text: "text-rose-600 dark:text-rose-300" },
  amber: { dot: "bg-amber-500", soft: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-300" },
  sky: { dot: "bg-sky-500", soft: "bg-sky-50 dark:bg-sky-500/10", text: "text-sky-600 dark:text-sky-300" },
  violet: { dot: "bg-violet-500", soft: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-600 dark:text-violet-300" },
};

export function courseColor(color: string | null | undefined) {
  return COURSE_COLORS[color ?? "indigo"] ?? COURSE_COLORS.indigo;
}
