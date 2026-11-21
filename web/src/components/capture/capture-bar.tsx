"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { quickCaptureAction } from "@/lib/actions";
import { parseCapture } from "@/lib/capture";
import { recurrenceLabel, relativeDue, todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * Quick capture — on every page. Type a line, press Enter, it's saved. Dates and repeats
 * are read from the text ("pay rent every month 12/1 !") and previewed before saving, so
 * the brain dump never has to stop for a form. Press "/" anywhere to jump here.
 */
export function CaptureBar() {
  const [text, setText] = useState("");
  const [flash, setFlash] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const today = todayISO();
  const preview = text.trim() ? parseCapture(text, today) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <form
      className="mb-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!preview) return;
        const where = preview.dueOn ? relativeDue(preview.dueOn, today).label : "Inbox";
        start(async () => {
          const res = await quickCaptureAction(text);
          if (!res.ok) return setFlash({ msg: res.error, tone: "err" });
          setText("");
          setFlash({ msg: `Added “${preview.title}” → ${where}`, tone: "ok" });
        });
      }}
    >
      <label htmlFor="capture" className="sr-only">
        Add a task
      </label>
      <div className="flex items-center gap-2 rounded-card border border-line-strong bg-base-2 px-3 focus-within:border-accent">
        <span aria-hidden className="font-mono text-accent">
          +
        </span>
        <input
          id="capture"
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (setText(""), ref.current?.blur())}
          maxLength={300}
          autoComplete="off"
          placeholder="Add a task…  e.g. “call dentist tomorrow” or “pay rent every month 12/1 !”"
          className="h-11 min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-faint"
        />
        <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10px] text-fg-faint md:inline">/</kbd>
        <button disabled={pending || !preview} className="rounded-btn bg-accent px-3 py-1 text-sm font-semibold text-base transition disabled:opacity-40">
          {pending ? "…" : "Add"}
        </button>
      </div>
      <p aria-live="polite" className={cn("mt-1.5 min-h-4 px-1 font-mono text-[11px]", flash?.tone === "err" ? "text-stop" : flash ? "text-live" : "text-fg-faint")}>
        {flash
          ? flash.msg
          : preview && (
              <>
                “{preview.title}” → {preview.dueOn ? `due ${relativeDue(preview.dueOn, today).label}` : "Inbox (no date)"}
                {preview.recurrence && ` · ↻ ${recurrenceLabel(preview.recurrence)}`}
                {preview.priority !== "medium" && ` · ${preview.priority}`}
              </>
            )}
      </p>
    </form>
  );
}
