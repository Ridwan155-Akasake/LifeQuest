/**
 * Quick-capture parser: one line of text → a task. Pure function, shared by the capture
 * box's live preview (client) and the server action, so what you see is what gets saved.
 *
 *   "call mom tomorrow"              → due tomorrow
 *   "pay rent every month 12/1 !"    → due Dec 1, repeats monthly, high priority
 *   "take meds daily at 8am"         → repeats daily, reminder at 8:00
 *   "check oven in 20 min"           → reminder 20 minutes from now
 *   "call dentist at 3pm"            → today 15:00 (tomorrow if 3pm already passed)
 *   "gym every mon,wed,fri"          → repeats Mon/Wed/Fri, due on the next one
 *   "buy milk"                       → no date → lands in the Inbox
 *
 * Only whole words are matched. Date words are consumed wherever they appear, so
 * "Monday standup notes" becomes "standup notes" due Monday — the preview shows this
 * before saving. A bare hour without am/pm ("at 7") means 7:00–11:00 as written and
 * 1–6 as pm, because nobody sets a 3am reminder by accident.
 */
import { addDays, habitDueOn, weekdayOf } from "./dates";

export type Captured = {
  title: string;
  dueOn?: string;
  /** "HH:MM" local time — present means "remind me at this time". */
  dueTime?: string;
  recurrence?: string;
  priority: "medium" | "high" | "urgent";
};

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_RE = "(sun|mon|tue|wed|thu|fri|sat)(?:day|sday|nesday|urday|rsday)?";

function nextWeekday(day: string, todayIso: string): string {
  let d = todayIso;
  for (let i = 0; i < 7 && weekdayOf(d) !== day; i++) d = addDays(d, 1);
  return d;
}

const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function toMinutes(h: number, m: number, ampm: string | undefined): number | null {
  if (m > 59) return null;
  const ap = ampm?.toLowerCase().replace(/\./g, "");
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith("p") && h !== 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
  } else {
    if (h > 23) return null;
    if (h >= 1 && h <= 6) h += 12; // "at 5" → 5pm
  }
  return h * 60 + m;
}

/**
 * @param nowMinutes minutes since local midnight. Needed for "in 30 min" and for moving a
 *   time that has already passed today to tomorrow. Omit it and those rules are skipped.
 */
export function parseCapture(input: string, todayIso: string, nowMinutes?: number): Captured {
  let text = ` ${input.trim()} `;
  let dueOn: string | undefined;
  let dueTime: string | undefined;
  let recurrence: string | undefined;
  let priority: Captured["priority"] = "medium";
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(re, " ");
    }
  };

  // Priority: "!!" urgent, "!" high (as their own word).
  take(/\s!!(?=\s)/, () => (priority = "urgent"));
  take(/\s!(?=\s)/, () => (priority = "high"));

  // Repeats.
  take(new RegExp(String.raw`\s(?:every|each)\s+(${DAY_RE}(?:\s*,\s*${DAY_RE})*)(?=\s)`, "i"), (m) => {
    const days = m[1]!.toLowerCase().split(",").map((s) => s.trim().slice(0, 3));
    recurrence = `weekly:${DAYS.filter((d) => days.includes(d)).join(",")}`;
  });
  take(/\s(?:every\s*day|daily)(?=\s)/i, () => (recurrence = "daily"));
  take(/\s(?:every\s*weekday|weekdays)(?=\s)/i, () => (recurrence = "weekdays"));
  take(/\s(?:every\s*week|weekly)(?=\s)/i, () => (recurrence = "weekly"));
  take(/\s(?:every\s*month|monthly)(?=\s)/i, () => (recurrence = "monthly"));

  // Relative time: "in 20 min", "in 2 hours".
  if (nowMinutes !== undefined) {
    take(/\sin\s+(\d{1,3})\s*(m|mins?|minutes?|h|hrs?|hours?)(?=\s)/i, (m) => {
      const n = Number(m[1]);
      const total = nowMinutes + (m[2]!.toLowerCase().startsWith("h") ? n * 60 : n);
      dueOn = addDays(todayIso, Math.floor(total / 1440));
      dueTime = hhmm(total % 1440);
    });
  }

  // Clock time: "at 7pm", "at 7:30 am", "at 19:00", "7pm", "noon".
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s)/i, (m) => {
    const t = toMinutes(Number(m[1]), Number(m[2] ?? 0), m[3]);
    if (t !== null) dueTime = hhmm(t);
  });
  take(/\sat\s+(\d{1,2})(?::(\d{2}))?(?=\s)/i, (m) => {
    const t = toMinutes(Number(m[1]), Number(m[2] ?? 0), undefined);
    if (t !== null) dueTime = hhmm(t);
  });
  take(/\s(\d{1,2}):(\d{2})(?=\s)/, (m) => {
    const t = toMinutes(Number(m[1]), Number(m[2]), undefined);
    if (t !== null) dueTime = hhmm(t);
  });
  take(/\s(?:at\s+)?noon(?=\s)/i, () => (dueTime = "12:00"));

  // Dates.
  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => (dueOn = m[1]));
  take(/\s(\d{1,2})\/(\d{1,2})(?=\s)/, (m) => {
    const [y] = todayIso.split("-");
    const iso = `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
    dueOn = iso < todayIso ? `${Number(y) + 1}${iso.slice(4)}` : iso; // "1/5" in December means next year
  });
  take(/\s(?:today|tod)(?=\s)/i, () => (dueOn = todayIso));
  take(/\stonight(?=\s)/i, () => {
    dueOn = todayIso;
    dueTime ??= "20:00";
  });
  take(/\s(?:tomorrow|tmr|tmrw)(?=\s)/i, () => (dueOn = addDays(todayIso, 1)));
  take(/\snext\s+week(?=\s)/i, () => (dueOn = addDays(todayIso, 7)));
  take(new RegExp(String.raw`\s(?:on\s+)?${DAY_RE}(?=\s)`, "i"), (m) => (dueOn = nextWeekday(m[1]!.toLowerCase(), todayIso)));

  // A time with no date means the next time that clock time comes round.
  if (dueTime && !dueOn) {
    dueOn = nowMinutes !== undefined && minutesOf(dueTime) <= nowMinutes ? addDays(todayIso, 1) : todayIso;
  }

  // A repeating task needs a first due date, and for day-pattern repeats (weekdays,
  // mon/wed/fri) it must land on a matching day — "weekdays 9:30am" on Saturday → Monday.
  if (recurrence) {
    dueOn ??= todayIso;
    if (recurrence !== "daily" && recurrence !== "weekly" && recurrence !== "monthly") {
      for (let i = 0; i < 7 && !habitDueOn(recurrence, dueOn); i++) dueOn = addDays(dueOn, 1);
    }
  }

  const title = text.replace(/\s+/g, " ").trim();
  return { title: title || input.trim(), dueOn, dueTime, recurrence, priority };
}
