"use client";

import { useOptimistic, useTransition } from "react";

import { setHabitCheckedAction, setStepDoneAction } from "@/lib/actions";
import { cn } from "@/lib/cn";

/** Checkbox for a quest step or a habit — optimistic, rolls back if the server says no. */
export function CheckToggle({ id, checked, kind, label, xp }: { id: string; checked: boolean; kind: "step" | "habit"; label: string; xp: number }) {
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={optimistic}
      aria-label={label}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          const res = kind === "step" ? await setStepDoneAction(id, !optimistic) : await setHabitCheckedAction(id, !optimistic);
          if (!res.ok) alert(res.error);
        })
      }
      title={optimistic ? "Undo" : `+${xp} XP`}
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] transition",
        optimistic ? "border-accent bg-accent text-ink" : "border-line-strong hover:border-accent",
      )}
    >
      {optimistic ? "✓" : ""}
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  return (
    <button type="button" onClick={() => navigator.clipboard.writeText(text)} className="shrink-0 rounded px-2 py-0.5 font-mono text-[10px] text-accent hover:bg-accent/10">
      Copy
    </button>
  );
}
