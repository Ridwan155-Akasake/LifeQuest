"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import type { Home, NowItem } from "@/lib/play";
import { usePlay } from "@/components/play/play-provider";
import { PlayerBar } from "@/components/play/player-bar";
import { BossCard, HabitStrip, SpaceTag, StepList } from "./shared";

const SKIP_KEY = "hq_skipped";

/** Skipped ("Not now") ids for today, so a reload doesn't bring them straight back. */
function useSkipped(today: string) {
  const [skipped, setSkipped] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(SKIP_KEY) ?? "{}") as { day?: string; ids?: string[] };
      if (raw.day === today && Array.isArray(raw.ids)) setSkipped(raw.ids);
    } catch {
      /* storage blocked */
    }
  }, [today]);
  const save = (ids: string[]) => {
    setSkipped(ids);
    try {
      sessionStorage.setItem(SKIP_KEY, JSON.stringify({ day: today, ids }));
    } catch {
      /* storage blocked */
    }
  };
  return [skipped, save] as const;
}

/**
 * Hybrid home: ONE thing, huge, with a START button. Everything else waits. Overdue tasks
 * show underneath as bosses; habits are one-tap chips.
 */
export function HybridView({ home }: { home: Home }) {
  const play = usePlay();
  const [skipped, setSkipped] = useSkipped(home.today);
  const [split, setSplit] = useState(false);

  // Skipped items go to the back of the line instead of disappearing.
  const queue = useMemo(() => [...home.queue.filter((q) => !skipped.includes(q.id)), ...home.queue.filter((q) => skipped.includes(q.id))], [home.queue, skipped]);
  const now = queue[0];
  const next = queue.slice(1, 3);

  useEffect(() => setSplit(false), [now?.id]);
  useEffect(() => {
    const onSplit = (e: Event) => (e as CustomEvent<string>).detail === now?.id && setSplit(true);
    window.addEventListener("hq:split", onSplit);
    return () => window.removeEventListener("hq:split", onSplit);
  }, [now?.id]);

  const skip = (it: NowItem) => setSkipped([...skipped.filter((x) => x !== it.id), it.id]);
  const jump = (it: NowItem) => setSkipped([...skipped, ...queue.slice(0, queue.indexOf(it)).map((q) => q.id)].filter((x, i, a) => a.indexOf(x) === i && x !== it.id));

  return (
    <div className="mx-auto mt-4 grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <PlayerBar p={home.player} />

        {now ? (
          <section aria-labelledby="now-title" className="flex flex-col">
            <p className={cn("font-mono text-[11px] tracking-[0.2em]", now.tone === "stop" ? "text-stop" : now.tone === "warn" ? "text-accent" : "text-fg-faint")}>
              NOW · {now.reason.toUpperCase()}
            </p>
            <h1 id="now-title" className="mt-3 font-display text-[clamp(2rem,7vw,3.4rem)] leading-[1.05] font-extrabold tracking-tight">
              {now.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <SpaceTag space={now.space} />
              {now.context && <span className="truncate">{now.context}</span>}
              {now.estimateMin && <span className="font-mono text-xs">~{now.estimateMin} min</span>}
              {now.steps.length > 0 && (
                <span className="font-mono text-xs">
                  {now.steps.filter((s) => s.done).length}/{now.steps.length} steps
                </span>
              )}
              {now.kind === "task" && (
                <Link href={`/task/${now.id}`} className="text-xs text-fg-faint underline underline-offset-4 hover:text-fg">
                  details
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={() => play.start({ id: now.id, title: now.title, kind: now.kind, estimateMin: now.estimateMin, steps: now.steps })}
              className="start-orb animate-pulse-ring mx-auto mt-10 grid h-36 w-36 place-items-center rounded-full font-display text-2xl font-extrabold transition active:scale-95 md:mx-0"
            >
              START
            </button>

            <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-fg-muted md:justify-start">
              <button type="button" onClick={() => skip(now)} className="underline underline-offset-4 hover:text-fg">
                Not now
              </button>
              {now.kind === "task" && (
                <button type="button" onClick={() => setSplit((s) => !s)} aria-expanded={split} className="underline underline-offset-4 hover:text-fg">
                  Too big? Split it
                </button>
              )}
              <button type="button" onClick={() => play.complete({ id: now.id, title: now.title, kind: now.kind })} className="underline underline-offset-4 hover:text-live">
                Already done ✓
              </button>
            </div>

            {split && now.kind === "task" && (
              <div className="mt-5 animate-rise rounded-card border border-line bg-surface p-4">
                <p className="mb-3 text-sm text-fg-muted">Break it into steps small enough to start right now. Then hit START.</p>
                <StepList key={now.id} taskId={now.id} steps={now.steps} />
              </div>
            )}

            {next.length > 0 && (
              <p className="mt-8 border-t border-line pt-3 text-sm text-fg-faint">
                Then:{" "}
                {next.map((n, i) => (
                  <span key={n.id}>
                    {i > 0 && " · "}
                    <button type="button" onClick={() => jump(n)} className="text-fg-muted hover:text-fg">
                      {n.title}
                    </button>
                  </span>
                ))}
                {queue.length > 3 && (
                  <Link href="/tasks" className="ml-2 text-fg-faint underline underline-offset-4 hover:text-fg">
                    +{queue.length - 3} more
                  </Link>
                )}
              </p>
            )}
          </section>
        ) : (
          <section className="rounded-card border border-live/30 bg-live/5 p-6">
            <p className="font-mono text-[11px] tracking-[0.2em] text-live">ALL CLEAR</p>
            <h1 className="mt-2 font-display text-4xl font-extrabold">Nothing waiting. Breathe.</h1>
            <p className="mt-2 text-fg-muted">Add something in the box above, or look ahead in Plan.</p>
          </section>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-6">
        {home.bosses.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="flex items-baseline justify-between font-display text-lg font-bold">
              Bosses <span className="font-mono text-[11px] font-normal text-fg-faint">overdue · +25 XP bonus each</span>
            </h2>
            {home.bosses.slice(0, 3).map((b) => (
              <BossCard key={b.id} boss={b} compact />
            ))}
            {home.bosses.length > 3 && (
              <Link href="/tasks" className="text-xs text-fg-faint underline underline-offset-4">
                {home.bosses.length - 3} more bosses in Plan
              </Link>
            )}
          </section>
        )}
        <HabitStrip habits={home.habits} />
        {home.done.length > 0 && (
          <section>
            <h2 className="mb-2 font-display text-lg font-bold text-live">Done today · {home.done.length}</h2>
            <ul className="flex flex-col gap-1 text-sm text-fg-muted">
              {home.done.slice(0, 6).map((t) => (
                <li key={t.id} className="truncate">
                  ✓ {t.title}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
