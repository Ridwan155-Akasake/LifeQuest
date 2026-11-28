import "server-only";

import { db } from "./db";
import { formatClock, localNow, zonedToUtc, addDays } from "./dates";
import { CLOSED, FOCUS_CHECKIN_EVERY, FOCUS_CHECKINS, MAX_NAGS, type Settings } from "./domain";
import { logFeed, notify } from "./push";
import { getSettings } from "./scope";
import { sendTelegram, telegramConfig } from "./telegram";

/**
 * R4 — reminders that don't let go. A reminder fires once at its time, then repeats every
 * few minutes until it's answered with Done, Start or Snooze (snoozes are limited). After a
 * few unanswered pings Telegram gets a copy. Quiet hours pause the repeats, not the first
 * ping. Focus timers that ran out get "done?" check-ins. Everything lands in the Feed.
 */

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Inside quiet hours? (window may cross midnight, e.g. 22:00–07:00) */
export function inQuiet(s: Settings, now = new Date()) {
  const m = localNow(undefined, now).minutes;
  const a = toMin(s.reminders.quietStart);
  const b = toMin(s.reminders.quietEnd);
  return a === b ? false : a < b ? m >= a && m < b : m >= a || m < b;
}

/** The instant quiet hours end (for postponing a nag). */
function quietEndsAt(s: Settings, now = new Date()) {
  const { date, minutes } = localNow(undefined, now);
  const day = minutes >= toMin(s.reminders.quietEnd) ? addDays(date, 1) : date;
  return zonedToUtc(day, s.reminders.quietEnd);
}

/** Done / Start answers a reminder: no more nagging. */
export async function answer(taskId: string) {
  await db.task.updateMany({ where: { id: taskId }, data: { nagCount: 0, nagNextAt: null } });
}

/** Snooze, limited. Throws when none are left (the nag keeps going). */
export async function snooze(taskId: string, minutes: number) {
  const s = await getSettings();
  const t = await db.task.findUnique({ where: { id: taskId }, select: { snoozeCount: true } });
  if (!t) throw new Error("Task not found");
  if (t.snoozeCount >= s.reminders.maxSnoozes) throw new Error(`No snoozes left (${s.reminders.maxSnoozes} used). Start it or mark it done.`);
  await db.task.update({
    where: { id: taskId },
    data: { remindAt: new Date(Date.now() + minutes * 60_000), remindedAt: null, nagCount: 0, nagNextAt: null, snoozeCount: { increment: 1 } },
  });
  return { left: s.reminders.maxSnoozes - t.snoozeCount - 1 };
}

const open = { archivedAt: null, status: { notIn: [...CLOSED] } };

/** One tick of the reminder engine. Called every minute by /api/cron/tick. */
export async function runReminders(now = new Date()) {
  const s = await getSettings();
  const quiet = inQuiet(s, now);
  const every = s.reminders.everyMin * 60_000;
  let reminders = 0;
  let nags = 0;

  // 1. First pings. Mark first, then send: a crash can at worst drop one ping, never spam.
  const due = await db.task.findMany({
    where: { ...open, remindAt: { lte: now }, remindedAt: null },
    orderBy: { remindAt: "asc" },
    take: 50,
    select: { id: true, title: true, dueTime: true, recurrence: true, snoozeCount: true, parent: { select: { title: true } }, space: { select: { name: true } } },
  });
  for (const t of due) {
    const nag = s.reminders.nag;
    await db.task.update({
      where: { id: t.id },
      data: { remindedAt: now, nagCount: nag ? 1 : 0, nagNextAt: nag ? (quiet ? quietEndsAt(s, now) : new Date(now.getTime() + every)) : null },
    });
    await notify(
      {
        title: t.title,
        body: [t.dueTime && formatClock(t.dueTime), t.space?.name, t.parent?.title, t.recurrence && "↻ repeats"].filter(Boolean).join(" · ") || undefined,
        url: `/task/${t.id}`,
        tag: `task-${t.id}`,
        taskId: t.id,
        snoozesLeft: Math.max(0, s.reminders.maxSnoozes - t.snoozeCount),
        sticky: nag,
      },
      { kind: "reminder" },
    );
    reminders++;
  }

  // 2. Nags: unanswered reminders, again and again.
  const pending = await db.task.findMany({
    where: { ...open, nagNextAt: { lte: now } },
    orderBy: { nagNextAt: "asc" },
    take: 50,
    select: { id: true, title: true, nagCount: true, snoozeCount: true, space: { select: { name: true } } },
  });
  for (const t of pending) {
    if (!s.reminders.nag || t.nagCount >= MAX_NAGS) {
      await db.task.update({ where: { id: t.id }, data: { nagNextAt: null } });
      continue;
    }
    if (quiet) {
      await db.task.update({ where: { id: t.id }, data: { nagNextAt: quietEndsAt(s, now) } });
      continue;
    }
    const n = t.nagCount + 1;
    await db.task.update({ where: { id: t.id }, data: { nagCount: n, nagNextAt: new Date(now.getTime() + every) } });
    const left = Math.max(0, s.reminders.maxSnoozes - t.snoozeCount);
    // Telegram joins in once the phone has been ignored for a while, then every 3rd ping.
    const tg = n > s.reminders.telegramAfter && (n - s.reminders.telegramAfter - 1) % 3 === 0;
    await notify(
      {
        title: t.title,
        body: `Reminder ${n} — still waiting. ${left ? `Start it, finish it, or snooze (${left} left).` : "No snoozes left: start it or finish it."}`,
        url: `/task/${t.id}`,
        tag: `task-${t.id}`,
        taskId: t.id,
        snoozesLeft: left,
        sticky: true,
      },
      { kind: "nag", alsoTelegram: tg, telegramPrefix: `🔔 (${n}× on your phone, unanswered)` },
    );
    nags++;
  }

  return { reminders, nags, quiet };
}

/** Focus timers that ran out without a Done: ask "done?" a few times, then let it go. */
export async function runFocusCheckins(now = new Date()) {
  const sessions = await db.focusSession.findMany({
    where: { endedAt: null },
    select: { id: true, startedAt: true, plannedMin: true, checkins: true, lastCheckinAt: true, task: { select: { id: true, title: true } } },
  });
  let sent = 0;
  for (const f of sessions) {
    const elapsed = Math.round((now.getTime() - f.startedAt.getTime()) / 60_000);
    if (elapsed > 240) {
      await db.focusSession.update({ where: { id: f.id }, data: { endedAt: now, outcome: "stopped" } });
      continue;
    }
    if (elapsed < f.plannedMin || f.checkins >= FOCUS_CHECKINS) continue;
    if (f.lastCheckinAt && now.getTime() - f.lastCheckinAt.getTime() < FOCUS_CHECKIN_EVERY * 60_000) continue;
    const what = f.task?.title ?? "your focus";
    await db.focusSession.update({ where: { id: f.id }, data: { checkins: { increment: 1 }, lastCheckinAt: now } });
    await notify(
      {
        title: f.checkins === 0 ? `Time’s up: ${what}` : `Still on “${what}”?`,
        body: `${elapsed} min since you pressed Start. Done, or 10 more minutes?`,
        url: "/",
        tag: `focus-${f.id}`,
        focusId: f.id,
        taskId: f.task?.id,
        sticky: true,
      },
      { kind: "checkin" },
    );
    sent++;
  }
  return sent;
}

/** ✅ receipt to Telegram for something finished (if turned on and Telegram is set up). */
export async function receipt(r: { title: string; xp: number; boss?: boolean; space?: string | null; habit?: boolean; taskId?: string }) {
  const s = await getSettings();
  if (!s.reminders.receipts) return;
  const cfg = await telegramConfig();
  if (!cfg) return;
  const line = [r.space, r.xp ? `+${r.xp} XP` : null, r.boss ? "boss defeated 🗡" : null].filter(Boolean).join(" · ");
  const text = `✅ ${r.habit ? "Habit done" : "Finished"}: ${r.title}${line ? `\n${line}` : ""}`;
  const ok = await sendTelegram(text, cfg);
  await logFeed({ kind: "receipt", title: `${r.habit ? "Habit done" : "Finished"}: ${r.title}`, body: line || null, channel: ok ? "telegram" : "none", taskId: r.taskId });
}
