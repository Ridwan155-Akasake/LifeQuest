import Link from "next/link";

import { logoutAction } from "@/app/login/actions";
import { db } from "@/lib/db";
import { addDays, todayISO, toDbDate } from "@/lib/dates";
import { getPlayer } from "@/lib/play";

export const metadata = { title: "Me" };

/** Your character sheet: level, streak, and what the last 7 days looked like. */
export default async function MePage() {
  const today = todayISO();
  const since = toDbDate(addDays(today, -6));
  const [p, finished7, habits7, focus7] = await Promise.all([
    getPlayer(),
    db.activity.count({ where: { type: "task.completed", on: { gte: since } } }),
    db.activity.count({ where: { type: "habit.checked", on: { gte: since } } }),
    db.focusSession.findMany({ where: { startedAt: { gte: since }, endedAt: { not: null } }, select: { startedAt: true, endedAt: true } }),
  ]);
  const focusMin = focus7.reduce((m, f) => m + Math.round((f.endedAt!.getTime() - f.startedAt.getTime()) / 60_000), 0);
  const pct = Math.round((p.intoLevel / p.levelSpan) * 100);

  return (
    <div className="mx-auto mt-4 flex max-w-2xl flex-col gap-8">
      <header className="flex items-center gap-4">
        <div className="start-orb grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-2xl font-extrabold" aria-hidden>
          {p.level}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold">{p.title}</h1>
          <p className="font-mono text-xs text-fg-muted">
            Level {p.level} · {p.totalXp} XP · {p.toNext} XP to level {p.level + 1}
          </p>
        </div>
      </header>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="XP to next level">
        <div className="xp-fill h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>

      <section>
        <h2 className="mb-3 font-mono text-[11px] tracking-widest text-fg-faint">ALL TIME</h2>
        <dl className="grid grid-cols-3 gap-3">
          {[
            [p.streak, "day streak"],
            [p.finished, "tasks finished"],
            [p.bossesDefeated, "bosses beaten"],
          ].map(([v, l]) => (
            <div key={String(l)} className="rounded-card border border-line bg-surface p-4">
              <dt className="text-xs text-fg-muted">{l}</dt>
              <dd className="font-display text-3xl font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="mb-3 font-mono text-[11px] tracking-widest text-fg-faint">LAST 7 DAYS</h2>
        <dl className="grid grid-cols-3 gap-3">
          {[
            [finished7, "finished"],
            [habits7, "habit check-ins"],
            [`${Math.floor(focusMin / 60)}h ${focusMin % 60}m`, "focused"],
          ].map(([v, l]) => (
            <div key={String(l)} className="rounded-card border border-line bg-surface p-4">
              <dt className="text-xs text-fg-muted">{l}</dt>
              <dd className="font-display text-2xl font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <Link href="/settings" className="rounded-btn border border-line px-4 py-3 hover:border-accent">
          Settings · view, spaces, work hours, notifications →
        </Link>
        <Link href="/board/quests" className="rounded-btn border border-line px-4 py-3 hover:border-accent">
          Quests board →
        </Link>
        <form action={logoutAction}>
          <button className="w-full rounded-btn border border-line px-4 py-3 text-left text-fg-muted hover:text-fg">Sign out</button>
        </form>
      </section>
    </div>
  );
}
