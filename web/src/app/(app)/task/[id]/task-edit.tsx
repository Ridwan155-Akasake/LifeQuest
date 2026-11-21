"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveTaskAction, updateTaskAction } from "@/lib/actions";
import { PRIORITIES } from "@/lib/domain";

const REPEATS = [
  { value: "", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

/** Due date, repeat, priority, delete — changes save as soon as you pick them. */
export function TaskEdit({ id, dueOn, dueTime, recurrence, priority, backHref }: { id: string; dueOn: string | null; dueTime: string | null; recurrence: string | null; priority: string; backHref: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = (input: Record<string, unknown>) =>
    start(async () => {
      const res = await updateTaskAction(id, input);
      setError(res.ok ? "" : res.error);
    });

  const field = "h-9 rounded-btn border border-line-strong bg-base-2 px-2.5 text-sm outline-none focus:border-accent";
  const repeats = recurrence && !REPEATS.some((r) => r.value === recurrence) ? [...REPEATS, { value: recurrence, label: recurrence.replace("weekly:", "Every ") }] : REPEATS;

  return (
    <div className="mt-5 rounded-card border border-line p-4" aria-busy={pending}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Due</span>
          <input type="date" defaultValue={dueOn ?? ""} onChange={(e) => save({ dueOn: e.target.value || null })} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Remind at</span>
          <input type="time" defaultValue={dueTime ?? ""} onChange={(e) => save({ dueTime: e.target.value || null })} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Repeats</span>
          <select defaultValue={recurrence ?? ""} onChange={(e) => save({ recurrence: e.target.value || null })} className={field}>
            {repeats.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Priority</span>
          <select defaultValue={priority} onChange={(e) => save({ priority: e.target.value })} className={field}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0]!.toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this task? It's archived, not erased, so it can be recovered from the database.")) return;
            start(async () => {
              const res = await archiveTaskAction(id);
              if (!res.ok) return setError(res.error);
              router.push(backHref);
            });
          }}
          className="ml-auto h-9 rounded-btn px-3 text-sm text-stop hover:bg-stop/10"
        >
          Delete
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-stop">
          {error}
        </p>
      )}
      {pending && <p className="mt-2 font-mono text-[11px] text-fg-faint">Saving…</p>}
    </div>
  );
}
