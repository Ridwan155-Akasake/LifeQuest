"use client";

import { useState, useTransition } from "react";

import { saveSettingsAction } from "@/lib/actions";
import { cn } from "@/lib/cn";
import type { Settings } from "@/lib/domain";

/** Settings → Reminders: how hard HQ pushes. Saves on change. */
export function RemindersEditor({ value, telegram }: { value: Settings["reminders"]; telegram: boolean }) {
  const [r, setR] = useState(value);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const save = (next: Settings["reminders"]) => {
    setR(next);
    start(async () => {
      const res = await saveSettingsAction({ reminders: next });
      setMsg(res.ok ? "Saved" : res.error);
    });
  };
  const field = "h-9 rounded-btn border border-line-strong bg-base-2 px-2.5 text-sm outline-none focus:border-accent";
  const num = (k: "everyMin" | "telegramAfter" | "maxSnoozes", opts: number[], label: (n: number) => string) => (
    <select value={r[k]} onChange={(e) => save({ ...r, [k]: Number(e.target.value) })} className={field}>
      {opts.map((n) => (
        <option key={n} value={n}>
          {label(n)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-5" aria-busy={pending}>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={r.nag} onChange={(e) => save({ ...r, nag: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--color-accent)]" />
        <span>
          <span className="font-semibold">Keep reminding me until I answer</span>
          <span className="block text-sm text-fg-muted">A reminder repeats until you tap Done, Start or Snooze on it. It gives up after about 2 hours.</span>
        </span>
      </label>

      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", !r.nag && "pointer-events-none opacity-40")}>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-fg-faint uppercase">Repeat every</span>
          {num("everyMin", [2, 3, 5, 10, 15, 30], (n) => `${n} minutes`)}
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-fg-faint uppercase">Snoozes allowed</span>
          {num("maxSnoozes", [0, 1, 2, 3, 5], (n) => (n === 0 ? "None" : `${n} per reminder`))}
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-fg-faint uppercase">Telegram joins after</span>
          {num("telegramAfter", [1, 2, 3, 5, 8], (n) => `${n} ignored ping${n === 1 ? "" : "s"}`)}
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-fg-faint uppercase">Quiet from</span>
          <input type="time" value={r.quietStart} onChange={(e) => setR({ ...r, quietStart: e.target.value })} onBlur={() => save(r)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-fg-faint uppercase">Until</span>
          <input type="time" value={r.quietEnd} onChange={(e) => setR({ ...r, quietEnd: e.target.value })} onBlur={() => save(r)} className={field} />
        </label>
        <p className="pb-2 text-xs text-fg-faint">Reminders still arrive once in quiet hours; the repeats wait until morning.</p>
      </div>

      <label className="flex items-start gap-3">
        <input type="checkbox" checked={r.receipts} onChange={(e) => save({ ...r, receipts: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--color-accent)]" />
        <span>
          <span className="font-semibold">Send a ✅ to Telegram when I finish something</span>
          <span className="block text-sm text-fg-muted">{telegram ? "A running record in your Telegram chat of everything you get done." : "Set up Telegram below first."}</span>
        </span>
      </label>
      {msg && <p className={cn("font-mono text-[11px]", msg === "Saved" ? "text-live" : "text-stop")}>{msg}</p>}
    </div>
  );
}
