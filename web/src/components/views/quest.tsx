"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/cn";
import type { Home, NowItem } from "@/lib/play";
import { usePlay } from "@/components/play/play-provider";
import { BossCard, HabitStrip, SpaceTag } from "./shared";

/** Quest home: the whole LifeQuest game board. Tasks are quests, overdue ones are bosses. */
export function QuestView({ home }: { home: Home }) {
  const p = home.player;
  const pct = Math.round((p.intoLevel / p.levelSpan) * 100);
  const habitsDue = home.habits.filter((h) => h.dueToday);
  const quests = home.queue.slice(0, 8);
  return (
    <div className="mx-auto mt-4 max-w-5xl rounded-card bg-q-bg p-4 font-game text-fg md:p-6">
      <header className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-btn bg-gradient-to-br from-q-gold to-q-pink font-pixel text-xl text-q-ink" aria-hidden>
          R
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-bold">Ridwan</p>
          <p className="text-xs text-q-lilac">
            Lv {p.level} · {p.title}
          </p>
        </div>
        <p className={cn("font-pixel text-sm", p.aliveToday ? "text-q-gold" : "text-fg-faint")} title="Day streak">
          🔥{p.streak}
        </p>
      </header>

      <div className="mt-4">
        <div className="h-3 overflow-hidden rounded border border-q-line bg-q-card" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="XP to next level">
          <div className="q-xp-fill h-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 flex justify-between font-pixel text-[11px] text-q-lilac">
          <span>{p.totalXp} XP</span>
          <span>
            {p.toNext} → LV {p.level + 1}
          </span>
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {home.bosses.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-pixel text-xs text-q-pink">BOSS FIGHTS · +25 XP BONUS</h2>
              {home.bosses.slice(0, 2).map((b, i) => (
                <BossCard key={b.id} boss={b} tone="quest" compact={i > 0} />
              ))}
            </section>
          )}

          <section>
            <h2 className="mb-3 font-pixel text-xs text-q-lilac">TODAY’S QUESTS</h2>
            {quests.length === 0 ? (
              <p className="rounded-card border border-q-line p-6 text-center text-q-lilac">Board cleared. Add a quest in the box above.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {quests.map((q) => (
                  <QuestCard key={q.id} q={q} />
                ))}
              </ul>
            )}
            {home.queue.length > quests.length && (
              <Link href="/tasks" className="mt-3 inline-block text-xs text-q-lilac underline underline-offset-4">
                {home.queue.length - quests.length} more quests in Plan
              </Link>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="grid grid-cols-2 gap-2" aria-label="Badges">
            {[
              [p.streak, "day streak"],
              [`${habitsDue.filter((h) => h.doneToday).length}/${habitsDue.length}`, "habits today"],
              [p.bossesDefeated, "bosses beaten"],
              [p.finished, "quests cleared"],
            ].map(([v, l]) => (
              <div key={String(l)} className="rounded-btn bg-q-card p-3 text-center">
                <p className="font-pixel text-lg text-q-gold">{v}</p>
                <p className="text-[11px] text-q-lilac">{l}</p>
              </div>
            ))}
          </section>
          <HabitStrip habits={home.habits} tone="quest" />
        </aside>
      </div>
    </div>
  );
}

function QuestCard({ q }: { q: NowItem }) {
  const play = usePlay();
  const [open, setOpen] = useState(false);
  const xp = q.kind === "habit" ? 5 : q.tone === "stop" ? 35 : 10;
  return (
    <li>
      <div className={cn("flex h-full flex-col gap-2 rounded-card border p-3 transition", open ? "border-q-gold bg-q-card" : "border-q-line bg-q-card/70")}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex flex-1 flex-col items-start gap-1.5 text-left">
          <SpaceTag space={q.space} />
          <span className="text-sm leading-snug font-bold">{q.title}</span>
          <span className={cn("text-[11px]", q.tone === "stop" ? "text-q-pink" : "text-fg-faint")}>{q.reason}</span>
          <span className="mt-auto font-pixel text-[10px] text-q-gold">+{xp} XP</span>
        </button>
        {open && (
          <div className="flex gap-1.5 animate-rise">
            <button type="button" onClick={() => play.start({ id: q.id, title: q.title, kind: q.kind, estimateMin: q.estimateMin, steps: q.steps })} className="flex-1 rounded-btn border border-q-gold py-1.5 text-xs font-bold text-q-gold">
              ▶ Start
            </button>
            <button type="button" onClick={() => play.complete({ id: q.id, title: q.title, kind: q.kind })} className="flex-1 rounded-btn bg-q-gold py-1.5 text-xs font-bold text-q-ink">
              Clear ✓
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
