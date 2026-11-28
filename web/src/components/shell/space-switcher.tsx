"use client";

import { useOptimistic, useTransition } from "react";

import { setActiveSpaceAction } from "@/lib/actions";
import { cn } from "@/lib/cn";

type S = { slug: string; name: string; color: string };

/** All / Personal / Work / … — filters the whole app. Remembered per device. */
export function SpaceSwitcher({ active, spaces, resting, workStart }: { active: string; spaces: S[]; resting: S[]; workStart: string }) {
  const [current, setCurrent] = useOptimistic(active);
  const [, start] = useTransition();
  const pick = (slug: string) =>
    start(async () => {
      setCurrent(slug);
      await setActiveSpaceAction(slug);
    });
  const chip = "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="Space">
        <button type="button" onClick={() => pick("all")} aria-pressed={current === "all"} className={cn(chip, current === "all" ? "border-fg bg-fg text-base-2" : "border-line-strong text-fg-muted hover:text-fg")}>
          All
        </button>
        {spaces.map((s) => (
          <button
            key={s.slug}
            type="button"
            data-space-color={s.color}
            onClick={() => pick(s.slug)}
            aria-pressed={current === s.slug}
            className={cn(chip, current === s.slug ? "space-chip border-transparent" : "border-line-strong text-fg-muted hover:text-fg")}
          >
            <span className="space-dot h-2 w-2 rounded-full" aria-hidden />
            {s.name}
          </button>
        ))}
      </div>
      {current === "all" && resting.length > 0 && (
        <p className="font-mono text-[10.5px] text-fg-faint">
          {resting.map((s) => s.name).join(", ")} resting until {workStart} · tap it to peek
        </p>
      )}
    </div>
  );
}
