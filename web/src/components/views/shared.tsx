"use client";

import { useEffect, useState, useTransition } from "react";

import { addStepsAction, setHabitCheckedAction, setStepDoneAction } from "@/lib/actions";
import { cn } from "@/lib/cn";
import type { Boss, Home, SpaceTag as Space } from "@/lib/play";
import { usePlay } from "@/components/play/play-provider";

export function SpaceTag({ space, className }: { space: Space; className?: string }) {
  if (!space) return null;
  return (
    <span data-space-color={space.color} className={cn("space-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}>
      {space.name}
    </span>
  );
}

type Step = { id: string; title: string; done: boolean };

/** Small steps under a task: tick them, add more. Used by "Too big? Split it" and boss hits. */
export function StepList({ taskId, steps, placeholder = "Add a tiny step (2–5 min)…", tone = "base", onAllDone }: { taskId: string; steps: Step[]; placeholder?: string; tone?: "base" | "quest"; onAllDone?: () => void }) {
  const [list, setList] = useState(steps);
  // Take the server's copy whenever it changes (new steps get real ids after a save).
  const sig = steps.map((x) => `${x.id}:${x.done}`).join(",");
  useEffect(() => setList(steps), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const q = tone === "quest";

  const toggle = (s: Step) => {
    const next = list.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x));
    setList(next);
    start(async () => {
      const res = await setStepDoneAction(s.id, !s.done);
      if (!res.ok) {
        setErr(res.error);
        setList(list);
      } else if (next.length > 0 && next.every((x) => x.done)) onAllDone?.();
    });
  };

  const add = () => {
    const titles = text.split(/\n|;/).map((t) => t.trim()).filter(Boolean);
    if (!titles.length) return;
    setText("");
    start(async () => {
      const res = await addStepsAction(taskId, titles);
      if (!res.ok) setErr(res.error);
      else setList((l) => [...l, ...titles.map((t, i) => ({ id: `new-${Date.now()}-${i}`, title: t, done: false }))]);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      {list.map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={s.id.startsWith("new-") || pending}
          onClick={() => toggle(s)}
          className={cn("flex items-center gap-3 rounded-btn px-3 py-2 text-left text-sm transition", q ? "bg-q-bg/60" : "bg-surface-2/60 hover:bg-surface-2")}
        >
          <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px]", s.done ? (q ? "border-q-gold bg-q-gold text-q-ink" : "border-live bg-live text-ink") : "border-line-strong")}>{s.done ? "✓" : ""}</span>
          <span className={s.done ? "text-fg-faint line-through" : ""}>{s.title}</span>
        </button>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor={`step-${taskId}`}>
          Add a step
        </label>
        <input
          id={`step-${taskId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={200}
          className={cn("h-9 min-w-0 flex-1 rounded-btn border bg-transparent px-3 text-sm outline-none placeholder:text-fg-faint", q ? "border-q-line focus:border-q-gold" : "border-line-strong focus:border-accent")}
        />
        <button disabled={pending || !text.trim()} className={cn("rounded-btn px-3 text-sm font-semibold disabled:opacity-40", q ? "bg-q-gold text-q-ink" : "bg-accent text-ink")}>
          Add
        </button>
      </form>
      {err && <p className="text-xs text-stop">{err}</p>}
    </div>
  );
}

/** Overdue task as a boss: its steps are the hits; finishing it gives bonus XP. */
export function BossCard({ boss, tone = "base", compact }: { boss: Boss; tone?: "base" | "quest"; compact?: boolean }) {
  const play = usePlay();
  const [open, setOpen] = useState(!compact);
  const total = boss.hits.length;
  const left = boss.hits.filter((h) => !h.done).length;
  const hp = total === 0 ? 100 : Math.round((left / total) * 100);
  const q = tone === "quest";
  return (
    <article className={cn("rounded-card border p-4", q ? "border-q-pink/70 bg-gradient-to-br from-q-pink/15 to-q-card" : "border-stop/30 bg-gradient-to-br from-stop/10 to-surface")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full flex-col gap-1 text-left" aria-expanded={open}>
        <span className={cn("text-[11px] tracking-wider", q ? "font-pixel text-q-pink" : "font-mono text-stop")}>
          BOSS · {boss.daysOverdue} DAY{boss.daysOverdue === 1 ? "" : "S"} OVERDUE
        </span>
        <span className={cn("font-bold leading-snug", q ? "text-base" : "font-display text-lg")}>{boss.title}</span>
        <span className="flex items-center gap-2">
          <SpaceTag space={boss.space} />
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-base/60" role="progressbar" aria-label="Boss health" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={100}>
            <span className={cn("block h-full rounded-full transition-[width] duration-500", q ? "bg-q-pink" : "bg-stop")} style={{ width: `${hp}%` }} />
          </span>
          <span className="font-mono text-[11px] text-fg-muted">{total ? `${left}/${total} HP` : "no hits yet"}</span>
        </span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3 animate-rise">
          <p className="text-xs text-fg-muted">{total ? "Each step is a hit. Land them one at a time." : "Too big to start? Break it into 2–3 hits."}</p>
          <StepList
            taskId={boss.id}
            steps={boss.hits}
            tone={tone}
            placeholder="Add a hit (a 5-minute step)…"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => play.start({ id: boss.id, title: boss.title, kind: "task", steps: boss.hits })} className={cn("flex-1 rounded-btn border py-2 text-sm font-semibold", q ? "border-q-gold text-q-gold" : "border-accent text-accent")}>
              ▶ Fight (focus)
            </button>
            <button type="button" onClick={() => play.complete({ id: boss.id, title: boss.title, kind: "task" })} className={cn("flex-1 rounded-btn py-2 text-sm font-bold", q ? "bg-q-pink text-white" : "bg-stop text-ink")}>
              Finish it ✓
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Today's habits as tappable chips. Tap = done (+XP). Tap a done one to undo. */
export function HabitStrip({ habits, tone = "base" }: { habits: Home["habits"]; tone?: "base" | "quest" }) {
  const play = usePlay();
  const [done, setDone] = useState(() => new Set(habits.filter((h) => h.doneToday).map((h) => h.id)));
  const [, start] = useTransition();
  const due = habits.filter((h) => h.dueToday);
  if (!due.length) return null;
  const q = tone === "quest";
  return (
    <section>
      <h2 className={cn("mb-2 flex items-baseline justify-between", q ? "font-pixel text-xs text-q-lilac" : "font-display text-lg font-bold")}>
        Habits <span className="font-mono text-[11px] font-normal text-fg-faint">{done.size}/{due.length} today</span>
      </h2>
      <ul className="flex flex-wrap gap-2">
        {due.map((h) => {
          const on = done.has(h.id);
          return (
            <li key={h.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setDone((d) => {
                    const n = new Set(d);
                    if (on) n.delete(h.id);
                    else n.add(h.id);
                    return n;
                  });
                  if (on) start(async () => void (await setHabitCheckedAction(h.id, false)));
                  else void play.complete({ id: h.id, title: h.title, kind: "habit" });
                }}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition active:scale-95",
                  on ? (q ? "border-q-gold bg-q-gold/15 text-q-gold" : "border-live/50 bg-live/10 text-live") : q ? "border-q-line text-fg" : "border-line-strong text-fg hover:border-accent",
                )}
              >
                <span aria-hidden>{on ? "✓" : "○"}</span>
                {h.title}
                <span className="flex gap-0.5" aria-hidden>
                  {h.last7.slice(0, 6).map((x) => (
                    <span key={x.day} className={cn("h-1.5 w-1.5 rounded-full", x.done ? "bg-live" : "bg-line-strong")} />
                  ))}
                  <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-live" : "bg-line-strong")} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
