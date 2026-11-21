/**
 * Quick-capture parser: one line of text → a task. Pure function, shared by the capture
 * box's live preview (client) and the server action, so what you see is what gets saved.
 *
 *   "call mom tomorrow"              → due tomorrow
 *   "pay rent every month 12/1 !"    → due Dec 1, repeats monthly, high priority
 *   "take meds daily"                → due today, repeats daily
 *   "gym every mon,wed,fri"          → repeats Mon/Wed/Fri, due on the next one
 *   "buy milk"                       → no date → lands in the Inbox
 *
 * Only whole words are matched. Date words are consumed wherever they appear, so
 * "Monday standup notes" becomes "standup notes" due Monday — the preview shows this
 * before saving.
 */
import { addDays, habitDueOn, weekdayOf } from "./dates";

export type Captured = { title: string; dueOn?: string; recurrence?: string; priority: "medium" | "high" | "urgent" };

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_RE = "(sun|mon|tue|wed|thu|fri|sat)(?:day|sday|nesday|urday|rsday)?";

function nextWeekday(day: string, todayIso: string): string {
  let d = todayIso;
  for (let i = 0; i < 7 && weekdayOf(d) !== day; i++) d = addDays(d, 1);
  return d;
}

export function parseCapture(input: string, todayIso: string): Captured {
  let text = ` ${input.trim()} `;
  let dueOn: string | undefined;
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

  // Dates.
  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => (dueOn = m[1]));
  take(/\s(\d{1,2})\/(\d{1,2})(?=\s)/, (m) => {
    const [y] = todayIso.split("-");
    const iso = `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
    dueOn = iso < todayIso ? `${Number(y) + 1}${iso.slice(4)}` : iso; // "1/5" in December means next year
  });
  take(/\s(?:today|tod|tonight)(?=\s)/i, () => (dueOn = todayIso));
  take(/\s(?:tomorrow|tmr|tmrw)(?=\s)/i, () => (dueOn = addDays(todayIso, 1)));
  take(/\snext\s+week(?=\s)/i, () => (dueOn = addDays(todayIso, 7)));
  take(new RegExp(String.raw`\s(?:on\s+)?${DAY_RE}(?=\s)`, "i"), (m) => (dueOn = nextWeekday(m[1]!.toLowerCase(), todayIso)));

  // A repeating task needs a first due date: the first matching day from today.
  if (recurrence && !dueOn) {
    dueOn = todayIso;
    if (recurrence !== "daily" && recurrence !== "weekly" && recurrence !== "monthly") {
      for (let i = 0; i < 7 && !habitDueOn(recurrence, dueOn); i++) dueOn = addDays(dueOn, 1);
    }
  }

  const title = text.replace(/\s+/g, " ").trim();
  return { title: title || input.trim(), dueOn, recurrence, priority };
}
