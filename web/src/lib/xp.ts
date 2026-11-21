/**
 * Levels + streaks — pure functions over the Activity ledger (no stored counters).
 *
 * Level curve: reaching level n costs 50·n·(n−1) total XP → L2 at 100, L3 at 300,
 * L4 at 600, L5 at 1000… early levels come fast, later ones need sustained effort.
 */
import { addDays } from "./dates";

export function levelFor(totalXp: number) {
  let level = 1;
  while (50 * (level + 1) * level <= totalXp) level++;
  const floor = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, intoLevel: totalXp - floor, levelSpan: next - floor, toNext: next - totalXp };
}

/**
 * Consecutive active days ending today — or yesterday, so the streak isn't shown as
 * broken in the morning before anything is done yet. `activeDays` = ISO days with ≥1
 * XP-earning event or a daily log.
 */
export function streakFor(activeDays: Set<string>, todayIso: string): { current: number; aliveToday: boolean } {
  const aliveToday = activeDays.has(todayIso);
  let cursor = aliveToday ? todayIso : addDays(todayIso, -1);
  let current = 0;
  while (activeDays.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, aliveToday };
}
