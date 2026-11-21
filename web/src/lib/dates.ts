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
