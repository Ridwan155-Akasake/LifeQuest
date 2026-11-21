/**
 * Calendar-day helpers. Days are stored as @db.Date (UTC midnight) and handled as
 * "YYYY-MM-DD" strings everywhere else, so a due date never shifts with timezones.
 * "Today" is computed in the owner's zone (APP_TIMEZONE, default America/Chicago).
 */
export const APP_TZ = process.env.APP_TIMEZONE || "America/Chicago";

export function todayISO(tz = APP_TZ, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "YYYY-MM-DD" → Date at UTC midnight (what Prisma writes to a @db.Date column). */
export const toDbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Date from a @db.Date column → "YYYY-MM-DD". */
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = toDbDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDbDate(d);
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const weekdayOf = (iso: string) => WEEKDAYS[toDbDate(iso).getUTCDay()]!;

/** Is a habit with this recurrence due on `iso`? daily | weekdays | weekly:mon,wed,fri */
export function habitDueOn(recurrence: string | null | undefined, iso: string): boolean {
  if (!recurrence || recurrence === "daily") return true;
  const wd = weekdayOf(iso);
  if (recurrence === "weekdays") return wd !== "sat" && wd !== "sun";
  if (recurrence.startsWith("weekly:")) return recurrence.slice(7).split(",").map((s) => s.trim()).includes(wd);
  return true;
}

export function relativeDue(dueISO: string, todayIso: string): { label: string; tone: "stop" | "warn" | "muted" } {
  const diff = Math.round((toDbDate(dueISO).getTime() - toDbDate(todayIso).getTime()) / 86_400_000);
  if (diff < 0) return { label: `${-diff}d overdue`, tone: "stop" };
  if (diff === 0) return { label: "Today", tone: "warn" };
  if (diff === 1) return { label: "Tomorrow", tone: "warn" };
  if (diff < 7) return { label: `In ${diff}d`, tone: "muted" };
  return { label: dueISO.slice(5).replace("-", "/"), tone: "muted" };
}

/** Valid repeat rules for tasks and habits. */
export const RECURRENCE_RE = /^(daily|weekdays|weekly|monthly|weekly:(sun|mon|tue|wed|thu|fri|sat)(,(sun|mon|tue|wed|thu|fri|sat))*)$/;

/** One step forward from `iso` by a repeat rule. Monthly keeps the day, clamped to month end (Jan 31 → Feb 28). */
function stepOnce(recurrence: string, iso: string): string {
  if (recurrence === "daily") return addDays(iso, 1);
  if (recurrence === "weekly") return addDays(iso, 7);
  if (recurrence === "monthly") {
    const d = toDbDate(iso);
    const day = d.getUTCDate();
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return fromDbDate(target);
  }
  // weekdays / weekly:mon,wed — next matching day after iso
  let next = addDays(iso, 1);
  for (let i = 0; i < 7 && !habitDueOn(recurrence, next); i++) next = addDays(next, 1);
  return next;
}

/**
 * Next due date after completing a repeating task. Steps forward from the old due date
 * until it lands after today, so an overdue "pay rent monthly" (due Dec 1) moves to Jan 1,
 * and an overdue daily task moves to tomorrow instead of piling up missed days.
 */
export function nextDue(recurrence: string, dueIso: string, todayIso: string, monthDay?: number): string {
  if (recurrence === "monthly") {
    // Keep the ORIGINAL day of month (`monthDay`, stored in task.meta) so a short month
    // doesn't shift it for good: Jan 31 → Feb 28 → Mar 31, not Mar 28.
    const d = toDbDate(dueIso);
    const day = monthDay ?? d.getUTCDate();
    for (let k = 1; k < 1200; k++) {
      const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k + 1, 0)).getUTCDate();
      const iso = fromDbDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, Math.min(day, lastDay))));
      if (iso > todayIso) return iso;
    }
  }
  let next = stepOnce(recurrence, dueIso);
  for (let i = 0; i < 1000 && next <= todayIso; i++) next = stepOnce(recurrence, next);
  return next;
}

export const RECURRENCE_LABEL: Record<string, string> = { daily: "Every day", weekdays: "Weekdays", weekly: "Every week", monthly: "Every month" };
export const recurrenceLabel = (r: string) => RECURRENCE_LABEL[r] ?? `Every ${r.replace("weekly:", "").split(",").join(", ")}`;

/** Current local date + minutes since local midnight in `tz` (for capture + reminders). */
export function localNow(tz = APP_TZ, now = new Date()): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Offset of `tz` from UTC at `instant`, in minutes (Chicago in winter → -360). */
function tzOffsetMinutes(instant: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Local date + "HH:MM" in `tz` → the real instant. Handles daylight saving: the offset is
 * re-checked at the resulting instant, so 7:00 PM stays 7:00 PM across the DST switch.
 */
export function zonedToUtc(dateIso: string, time: string, tz = APP_TZ): Date {
  const naive = Date.UTC(Number(dateIso.slice(0, 4)), Number(dateIso.slice(5, 7)) - 1, Number(dateIso.slice(8, 10)), Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  let guess = naive - tzOffsetMinutes(new Date(naive), tz) * 60_000;
  guess = naive - tzOffsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

/** "19:05" → "7:05 PM". */
export function formatClock(time: string): string {
  const h = Number(time.slice(0, 2));
  return `${((h + 11) % 12) + 1}:${time.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}
