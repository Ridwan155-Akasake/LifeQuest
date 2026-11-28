"use client";

import { useState, useTransition } from "react";

import { createTaskAction } from "@/lib/actions";

const OPTIONS = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly:mon,wed,fri", label: "Mon / Wed / Fri" },
  { value: "weekly:sat,sun", label: "Weekends" },
];

export function AddHabit() {
  const [title, setTitle] = useState("");
  const [recurrence, setRecurrence] = useState("daily");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        start(async () => {
          const res = await createTaskAction({ title: t, kind: "habit", recurrence });
          if (!res.ok) return alert(res.error);
          setTitle("");
        });
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="New habit, e.g. Read 10 min" aria-label="New habit" className="h-9 rounded-btn border border-line-strong bg-base-2 px-3 text-sm outline-none focus:border-accent" />
      <div className="flex gap-2">
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} aria-label="Repeats" className="h-9 flex-1 rounded-btn border border-line-strong bg-base-2 px-2 text-sm outline-none focus:border-accent">
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button disabled={pending} className="rounded-btn bg-accent px-3 text-sm font-semibold text-ink disabled:opacity-60">
          {pending ? "…" : "Add"}
        </button>
      </div>
    </form>
  );
}
