"use client";

import Link from "next/link";

import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/dates";
import type { Home, TimelineEntry } from "@/lib/play";
import { usePlay } from "@/components/play/play-provider";
import { PlayerBar } from "@/components/play/player-bar";
import { SpaceTag } from "./shared";

/** Cockpit home: today as a timeline with a "now" line, plus the live feed. Calm, informative. */
export function CockpitView({ home }: { home: Home }) {
  const play = usePlay();
  const dateLabel = new Date(`${home.today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const timed = home.timeline.filter((e) => e.time);
  const anytime = home.timeline.filter((e) => !e.time);
  const nowAt = timed.findIndex((e) => e.time! > home.nowClock);
  const cut = nowAt === -1 ? timed.length : nowAt;
  const habitIds = new Set(home.habits.map((h) => h.id));

  const row = (e: TimelineEntry) => {
    const isHabit = !!e.taskId && habitIds.has(e.taskId);
    return (
      <li key={e.key} className="grid grid-cols-[3.75rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-line py-2.5">
        <span className="pt-0.5 font-mono text-xs text-fg-faint tabular-nums">{e.time ? formatClock(e.time).replace(" ", "") : "—"}</span>
        <div className="min-w-0">
          <p className={cn("truncate", e.state === "done" && "text-fg-faint line-through", e.state === "focus" && "text-info")}>
            {e.space && <span data-space-color={e.space.color} className="space-dot mr-2 inline-block h-2 w-2 rounded-full align-middle" aria-hidden />}
            {e.taskId && e.state === "open" && !isHabit ? (
              <Link href={`/task/${e.taskId}`} className="hover:text-accent">
                {e.title}
              </Link>
            ) : (
              e.title
            )}
          </p>
          <p className="text-[11px] text-fg-faint">{e.note}</p>
        </div>
        {e.state === "open" && e.taskId ? (
          <span className="flex gap-1">
            <button type="button" title="Start focus" aria-label={`Start ${e.title}`} onClick={() => play.start({ id: e.taskId!, title: e.title, kind: isHabit ? "habit" : "task" })} className="grid h-8 w-8 place-items-center rounded-btn border border-line-strong text-accent hover:border-accent">
              ▶
            </button>
            <button type="button" title="Done" aria-label={`Done: ${e.title}`} onClick={() => play.complete({ id: e.taskId!, title: e.title, kind: isHabit ? "habit" : "task" })} className="grid h-8 w-8 place-items-center rounded-btn border border-line-strong text-live hover:border-live">
              ✓
            </button>
          </span>
        ) : (
          <span className={cn("font-mono text-[11px]", e.state === "done" ? "text-live" : "text-info")}>{e.state === "done" ? "done" : "focus"}</span>
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto mt-4 grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-3xl font-extrabold">{dateLabel}</h1>
          <span className="font-mono text-xs text-fg-faint">now {formatClock(home.nowClock)}</span>
        </header>
        <PlayerBar p={home.player} />
        <p className="font-mono text-[11px] text-fg-faint">
          {home.counts.overdue} overdue · {home.counts.today} due today · {home.counts.inbox} in inbox · {home.counts.done} done
        </p>

        <section aria-label="Today's timeline">
          <ul>
            {timed.slice(0, cut).map(row)}
            <li className="relative my-1 h-0.5 rounded bg-info" aria-label={`Now, ${formatClock(home.nowClock)}`}>
              <span className="absolute top-1/2 left-0 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-info" />
            </li>
            {timed.slice(cut).map(row)}
          </ul>
          {timed.length === 0 && <p className="py-3 text-sm text-fg-faint">Nothing timed today. Add “at 3pm” to a task to put it on the line.</p>}
          {anytime.length > 0 && (
            <>
              <h2 className="mt-6 mb-1 font-mono text-[11px] tracking-widest text-fg-faint">ANYTIME TODAY</h2>
              <ul>{anytime.map(row)}</ul>
            </>
          )}
        </section>

        {home.bosses.length > 0 && (
          <section>
            <h2 className="mb-2 font-mono text-[11px] tracking-widest text-stop">OVERDUE · {home.bosses.length}</h2>
            <ul>
              {home.bosses.map((b) => (
                <li key={b.id} className="flex items-center gap-3 border-b border-line py-2">
                  <span className="w-[3.75rem] font-mono text-xs text-stop">{b.daysOverdue}d</span>
                  <Link href={`/task/${b.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                    {b.title}
                  </Link>
                  <SpaceTag space={b.space} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-6">
        {home.queue[0] && (
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="font-mono text-[11px] tracking-widest text-fg-faint">UP NEXT</h2>
            <p className="mt-2 font-display text-xl font-bold leading-snug">{home.queue[0].title}</p>
            <p className="mt-1 text-xs text-fg-muted">{home.queue[0].reason}</p>
            <button
              type="button"
              onClick={() => play.start({ id: home.queue[0]!.id, title: home.queue[0]!.title, kind: home.queue[0]!.kind, estimateMin: home.queue[0]!.estimateMin, steps: home.queue[0]!.steps })}
              className="mt-3 w-full rounded-btn bg-accent py-2 font-semibold text-ink"
            >
              ▶ Start
            </button>
          </section>
        )}
        <section className="rounded-card border border-line bg-base-2 p-4">
          <h2 className="mb-3 flex justify-between font-mono text-[11px] tracking-widest text-fg-faint">
            FEED
            <Link href="/feed" className="hover:text-fg">
              all →
            </Link>
          </h2>
          {home.feed.length === 0 ? (
            <p className="text-sm text-fg-faint">Nothing yet today.</p>
          ) : (
            <ul className="flex flex-col gap-2.5 text-sm">
              {home.feed.map((f) => (
                <li key={f.id} className="flex gap-2">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", f.type === "boss.defeated" ? "bg-stop" : f.type === "focus.ended" ? "bg-info" : "bg-live")} aria-hidden />
                  <span className="min-w-0">
                    {f.text}
                    <span className="block font-mono text-[10.5px] text-fg-faint">
                      {f.time}
                      {f.xp > 0 && ` · +${f.xp} XP`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
