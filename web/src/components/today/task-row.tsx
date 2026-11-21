"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { setTaskDoneAction, updateTaskAction } from "@/lib/actions";
import { addDays, formatClock, recurrenceLabel, relativeDue } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { TodayItem } from "@/lib/work";

const PRIORITY_DOT: Record<string, string> = { urgent: "bg-stop", high: "bg-warn", medium: "", low: "" };

/**
 * One task on the Today page. Tick it and it disappears (or, if it repeats, it jumps to
 * its next date and says when). Inbox rows get one-tap date buttons so sorting the inbox
 * takes seconds, not a form.
 */
export function TaskRow({ item, today, showSchedule }: { item: TodayItem; today: string; showSchedule?: boolean }) {
  const [gone, setGone] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const complete = () =>
    start(async () => {
      setGone(true);
      const res = await setTaskDoneAction(item.id, true);
      if (!res.ok) {
        setGone(false);
        return setNote(res.error);
      }
      if (res.data?.nextDue) setNote(`↻ next: ${relativeDue(res.data.nextDue, today).label}`);
    });

  const schedule = (dueOn: string) =>
    start(async () => {
      setGone(true);
      const res = await updateTaskAction(item.id, { dueOn });
      if (!res.ok) {
        setGone(false);
        setNote(res.error);
      }
    });

  if (gone && !note) {
    return (
      <li className="rounded-btn border border-dashed border-line px-3 py-2 text-sm text-fg-faint line-through" aria-live="polite">
        {item.title}
      </li>
    );
  }

  const due = item.dueOn ? relativeDue(item.dueOn, today) : null;
  return (
    <li className={cn("rounded-btn border border-line bg-base-2 px-3 py-2", pending && "opacity-60")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          aria-label={`Done: ${item.title}`}
          disabled={pending}
          onClick={complete}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-line-strong transition hover:border-accent hover:bg-accent/10"
        />
        {PRIORITY_DOT[item.priority] && <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[item.priority])} title={`${item.priority} priority`} />}
        <Link href={`/task/${item.id}`} className="min-w-0 flex-1 hover:text-accent">
          <span className="block truncate">{item.title}</span>
          {(item.parent || item.areaName) && <span className="block truncate font-mono text-[11px] text-fg-faint">{item.parent?.title ?? item.areaName}</span>}
        </Link>
        <span className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
          {item.recurrence && (
            <span className="text-info" title={recurrenceLabel(item.recurrence)}>
              ↻
            </span>
          )}
          {due && (
            <span className={due.tone === "stop" ? "text-stop" : due.tone === "warn" ? "text-warn" : "text-fg-faint"}>
              {due.label}
              {item.dueTime && ` ${formatClock(item.dueTime)}`}
            </span>
          )}
        </span>
      </div>
      {showSchedule && !note && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
          {[
            ["Today", today],
            ["Tomorrow", addDays(today, 1)],
            ["Next week", addDays(today, 7)],
          ].map(([label, d]) => (
            <button key={label} type="button" disabled={pending} onClick={() => schedule(d!)} className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-fg-muted transition hover:border-accent hover:text-fg">
              {label}
            </button>
          ))}
        </div>
      )}
      {note && <p className="mt-1 pl-8 font-mono text-[11px] text-info">{note}</p>}
    </li>
  );
}
