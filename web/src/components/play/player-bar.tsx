import type { Player } from "@/lib/play";

function Flame() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden className="fill-accent">
      <path d="M6 0c1 3 5 4.5 5 8.5A5 5 0 0 1 1 8.5C1 6 3 5 3 3c1.5 1 2 2 2 3 1-1.5 1-4 1-6z" />
    </svg>
  );
}

/** Level, XP bar, streak — one line, always in view on the home screen. */
export function PlayerBar({ p }: { p: Player }) {
  const pct = Math.round((p.intoLevel / p.levelSpan) * 100);
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] text-fg-muted" title={`${p.totalXp} XP total · ${p.toNext} XP to level ${p.level + 1}`}>
      <span className="font-semibold text-fg">LV {p.level}</span>
      <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="XP to next level">
        <div className="xp-fill h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className={p.aliveToday ? "flex items-center gap-1 text-accent" : "flex items-center gap-1 text-fg-faint"} title={p.aliveToday ? "Streak alive today" : "Do one thing today to keep the streak"}>
        <Flame />
        {p.streak}
      </span>
    </div>
  );
}

export { Flame };
