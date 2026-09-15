"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { MasteryBar, Modal, PageHeader, Field, DemoBadge, courseColor } from "@/components/ui";

type Course = { id: number; name: string; teacher: string; description: string; color: string; is_demo: number };

export default function CoursesPage() {
  const { data, refresh } = useApi<{ courses: Course[] }>("/api/courses");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", teacher: "", description: "", color: "indigo" });
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api("/api/courses", { body: form });
      setAdding(false);
      setForm({ name: "", teacher: "", description: "", color: "indigo" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="My Courses"
        subtitle="Your subjects, current units and AI-estimated mastery."
        actions={
          <button className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add course
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.courses ?? []).map((c) => {
          const col = courseColor(c.color);
          return (
            <Link key={c.id} href={`/courses/${c.id}`} className="card card-hover group flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${col.soft} ${col.text}`}>
                  <BookOpen className="h-5 w-5" />
                </div>
                {c.is_demo ? <DemoBadge /> : null}
              </div>
              <div className="mt-3 text-[15.5px] font-semibold leading-snug">{c.name}</div>
              {c.teacher ? <div className="text-[13px] text-zinc-500">{c.teacher}</div> : null}
              {c.description ? <p className="mt-1.5 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{c.description}</p> : <div className="flex-1" />}
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-zinc-400">
                <span>Open course</span>
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
              <MasteryBar value={0} className="mt-2 opacity-0" />
            </Link>
          );
        })}
      </div>

      {data && data.courses.length === 0 ? (
        <div className="card mt-2 p-8 text-center">
          <p className="text-[14px] font-medium">No courses yet</p>
          <p className="mt-1 text-[13px] text-zinc-500">Add your subjects here, or just import a syllabus in Documents and Studia will create them for you.</p>
          <button className="btn-primary btn-sm mt-4" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add your first course</button>
        </div>
      ) : null}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a course">
        <Field label="Course name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mathematics" autoFocus />
        </Field>
        <Field label="Teacher (optional)">
          <input className="input" value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} placeholder="e.g. Mr. Okafor" />
        </Field>
        <Field label="Description (optional)">
          <textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this course about?" />
        </Field>
        <Field label="Colour">
          <div className="flex gap-2">
            {["indigo", "emerald", "rose", "amber", "sky", "violet"].map((c) => (
              <button
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                className={`h-7 w-7 rounded-full ${courseColor(c).dot} ${form.color === c ? "ring-2 ring-offset-2 ring-zinc-400 dark:ring-offset-zinc-900" : ""}`}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={create} disabled={busy || !form.name.trim()}>Create course</button>
        </div>
      </Modal>
    </div>
  );
}
