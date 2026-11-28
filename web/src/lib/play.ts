import "server-only";
import type { Prisma } from "@prisma/client";

import { db } from "./db";
import { addDays, formatClock, fromDbDate, localNow, recurrenceLabel, relativeDue, todayISO, toDbDate } from "./dates";
import { CLOSED } from "./domain";
import { getToday, type TodayItem } from "./work";
import { levelFor, streakFor } from "./xp";

/**
 * The game + focus layer (redesign R1/R3): player level/streak, bosses, focus sessions,
 * the "one thing now" queue, the day timeline and the activity feed. Read models only,
 * plus focus start/end — task status still changes only in work.ts.
 */

export type SpaceTag = { slug: string; name: string; color: string } | null;

// ── Player ───────────────────────────────────────────────────────────────────

const TITLES = ["Rookie", "Starter", "Task Knight", "Finisher", "Momentum Mage", "Deadline Slayer", "Quest Captain", "Legend of Done"];

export type Player = {
  totalXp: number;
  level: number;
  intoLevel: number;
  levelSpan: number;
  toNext: number;
  title: string;
  streak: number;
  aliveToday: boolean;
  bossesDefeated: number;
  finished: number;
};

export async function getPlayer(): Promise<Player> {
  const today = todayISO();
  const [sum, days, bosses, finished] = await Promise.all([
    db.activity.aggregate({ _sum: { xp: true } }),
    db.activity.groupBy({ by: ["on"], where: { xp: { gt: 0 }, on: { gte: toDbDate(addDays(today, -400)) } } }),
    db.activity.count({ where: { type: "boss.defeated" } }),
    db.activity.count({ where: { type: "task.completed" } }),
  ]);
  const totalXp = Math.max(0, sum._sum.xp ?? 0);
  const lv = levelFor(totalXp);
  const st = streakFor(new Set(days.map((d) => fromDbDate(d.on))), today);
  return { totalXp, ...lv, title: TITLES[Math.min(lv.level, TITLES.length) - 1]!, streak: st.current, aliveToday: st.aliveToday, bossesDefeated: bosses, finished };
}

// ── Focus sessions ───────────────────────────────────────────────────────────

/** Start a focus timer. Any timer still running is closed as "stopped" first. */
export async function startFocus(taskId: string | null, minutes: number) {
  await db.focusSession.updateMany({ where: { endedAt: null }, data: { endedAt: new Date(), outcome: "stopped" } });
  const s = await db.focusSession.create({ data: { taskId, plannedMin: minutes }, select: { id: true, startedAt: true, plannedMin: true } });
  return { id: s.id, startedAt: s.startedAt.toISOString(), plannedMin: s.plannedMin };
}

/** End a focus timer. Real focus earns a little XP (1 per 5 min, max 12) even when you got stuck. */
export async function endFocus(id: string, outcome: "done" | "stopped" | "stuck") {
  const s = await db.focusSession.findUnique({ where: { id } });
  if (!s) throw new Error("That focus session is gone");
  if (s.endedAt) return { minutes: 0, xp: 0 };
  const endedAt = new Date();
  const minutes = Math.max(0, Math.round((endedAt.getTime() - s.startedAt.getTime()) / 60_000));
  const xp = outcome === "stopped" ? 0 : Math.min(12, Math.floor(minutes / 5));
  await db.$transaction([
    db.focusSession.update({ where: { id }, data: { endedAt, outcome } }),
    db.activity.create({ data: { taskId: s.taskId, type: "focus.ended", xp, on: toDbDate(todayISO()), data: { minutes, outcome, planned: s.plannedMin } } }),
  ]);
  return { minutes, xp };
}

// ── Bosses (overdue tasks) ───────────────────────────────────────────────────

export type Boss = { id: string; title: string; daysOverdue: number; priority: string; space: SpaceTag; hits: { id: string; title: string; done: boolean }[] };

export async function getBosses(scope: Prisma.TaskWhereInput, take = 6): Promise<Boss[]> {
  const today = todayISO();
  const rows = await db.task.findMany({
    where: { AND: [scope], archivedAt: null, kind: { in: ["task", "quest", "job"] }, status: { notIn: [...CLOSED] }, dueOn: { lt: toDbDate(today) } },
    orderBy: { dueOn: "asc" },
    take,
    select: {
      id: true,
      title: true,
      priority: true,
      dueOn: true,
      space: { select: { slug: true, name: true, color: true } },
      steps: { where: { archivedAt: null }, orderBy: { order: "asc" }, select: { id: true, title: true, status: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    space: t.space,
    daysOverdue: Math.round((toDbDate(today).getTime() - t.dueOn!.getTime()) / 86_400_000),
    hits: t.steps.map((s) => ({ id: s.id, title: s.title, done: s.status === "done" })),
  }));
}

// ── "One thing now" queue ────────────────────────────────────────────────────

export type NowItem = {
  id: string;
  title: string;
  kind: "task" | "habit";
  reason: string;
  tone: "stop" | "warn" | "muted";
  context: string | null;
  priority: string;
  estimateMin: number | null;
  space: SpaceTag;
  steps: { id: string; title: string; done: boolean }[];
};

const RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// ── Feed ─────────────────────────────────────────────────────────────────────

export type FeedEntry = { id: string; at: string; day: string; time: string; type: string; text: string; xp: number; taskId: string | null; space: SpaceTag };

// vault.imported is left out: one import writes a row per quest, which would flood the feed.
const FEED_TYPES = ["task.completed", "task.reopened", "task.created", "habit.checked", "boss.defeated", "focus.ended", "digest.sent"];

export async function getFeed(scope: Prisma.TaskWhereInput, take = 60, before?: Date): Promise<FeedEntry[]> {
  const rows = await db.activity.findMany({
    where: {
      type: { in: FEED_TYPES },
      ...(before ? { createdAt: { lt: before } } : {}),
      ...(Object.keys(scope).length ? { OR: [{ taskId: null }, { task: { AND: [scope] } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, type: true, xp: true, on: true, createdAt: true, data: true, taskId: true, task: { select: { title: true, space: { select: { slug: true, name: true, color: true } } } } },
  });
  return rows.map((a) => {
    const d = (a.data ?? {}) as Record<string, unknown>;
    const title = a.task?.title ?? "a task";
    const text =
      a.type === "task.completed"
        ? d.repeat
          ? `Finished “${title}” — repeats, next ${typeof d.next === "string" ? relativeDue(d.next, fromDbDate(a.on)).label.toLowerCase() : "soon"}`
          : `Finished “${title}”`
        : a.type === "task.reopened"
          ? `Reopened “${title}”`
          : a.type === "task.created"
            ? `Added “${title}”`
            : a.type === "habit.checked"
              ? `Habit done: ${title}`
              : a.type === "boss.defeated"
                ? `Boss defeated: “${title}”`
                : a.type === "focus.ended"
                  ? d.outcome === "stuck"
                    ? `Focused ${d.minutes} min on “${title}”, then got stuck`
                    : Number(d.minutes) < 1
                      ? `Started a focus on “${title}”`
                      : `Focused ${d.minutes} min on “${title}”`
                  : a.type === "digest.sent"
                    ? "Morning digest sent"
                    : "Imported from the LifeQuest vault";
    return { id: a.id, at: a.createdAt.toISOString(), day: fromDbDate(a.on), time: formatClock(clockOf(a.createdAt)), type: a.type, text, xp: a.xp, taskId: a.taskId, space: a.task?.space ?? null };
  });
}

// ── Day timeline (Cockpit) ───────────────────────────────────────────────────

export type TimelineEntry = { key: string; time: string | null; title: string; note: string; state: "done" | "open" | "focus"; taskId: string | null; space: SpaceTag };

const clockOf = (d: Date) => {
  const m = localNow(undefined, d).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// ── Everything the home screens need, in one call ────────────────────────────

export async function getHome(scope: Prisma.TaskWhereInput) {
  const today = todayISO();
  const now = localNow();
  const todayDb = toDbDate(today);
  const [d, player, bosses, focus, feed, checks, doneActs] = await Promise.all([
    getToday(scope),
    getPlayer(),
    getBosses(scope),
    db.focusSession.findMany({
      where: { startedAt: { gte: new Date(Date.now() - 36 * 3_600_000) }, endedAt: { not: null }, task: { AND: [scope] } },
      orderBy: { startedAt: "asc" },
      select: { id: true, startedAt: true, endedAt: true, outcome: true, task: { select: { id: true, title: true, space: { select: { slug: true, name: true, color: true } } } } },
    }),
    getFeed(scope, 8),
    db.habitCheck.findMany({ where: { on: todayDb, task: { AND: [scope] } }, select: { taskId: true, createdAt: true } }),
    db.activity.findMany({ where: { on: todayDb, type: "task.completed", task: { AND: [scope] } }, select: { taskId: true, createdAt: true, task: { select: { title: true, space: { select: { slug: true, name: true, color: true } } } } } }),
  ]);

  // Queue: what to do now, in ADHD order — one decision at a time.
  const fromItem = (t: TodayItem, reason: string, tone: NowItem["tone"]): NowItem => ({
    id: t.id,
    title: t.title,
    kind: "task",
    reason,
    tone,
    context: t.parent?.title ?? t.areaName,
    priority: t.priority,
    estimateMin: t.estimateMin,
    space: t.space,
    steps: [],
  });
  const timeLabel = (t: TodayItem) => (t.dueTime ? `${toMin(t.dueTime) <= now.minutes ? "Was due" : "Due"} ${formatClock(t.dueTime)}` : "Due today");
  const soon = d.dueToday.filter((t) => t.dueTime && toMin(t.dueTime) <= now.minutes + 60);
  const restToday = d.dueToday.filter((t) => !soon.includes(t));
  const hot = d.overdue.filter((t) => RANK[t.priority]! <= 1);
  const cold = d.overdue.filter((t) => !hot.includes(t));
  const queue: NowItem[] = [
    ...soon.map((t) => fromItem(t, timeLabel(t), "warn")),
    ...hot.map((t) => fromItem(t, relativeDue(t.dueOn!, today).label, "stop")),
    ...restToday.map((t) => fromItem(t, timeLabel(t), "warn")),
    ...d.habits
      .filter((h) => h.dueToday && !h.doneToday)
      .map((h): NowItem => ({ id: h.id, title: h.title, kind: "habit", reason: `Habit · ${recurrenceLabel(h.recurrence ?? "daily").toLowerCase()}`, tone: "muted", context: null, priority: "medium", estimateMin: null, space: h.space, steps: [] })),
    ...cold.map((t) => fromItem(t, relativeDue(t.dueOn!, today).label, "stop")),
    ...d.upcoming.map((t) => fromItem(t, `Due ${relativeDue(t.dueOn!, today).label.toLowerCase()}`, "muted")),
    ...d.inbox.map((t) => fromItem(t, "Inbox · no date yet", "muted")),
  ].filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i);

  // Steps for "Too big? Split it" on the first few.
  const head = queue.filter((q) => q.kind === "task").slice(0, 12).map((q) => q.id);
  if (head.length) {
    const steps = await db.task.findMany({ where: { parentId: { in: head }, archivedAt: null }, orderBy: { order: "asc" }, select: { id: true, title: true, status: true, parentId: true } });
    for (const q of queue) q.steps = steps.filter((s) => s.parentId === q.id).map((s) => ({ id: s.id, title: s.title, done: s.status === "done" }));
  }

  // Timeline for today.
  const habitById = new Map(d.habits.map((h) => [h.id, h]));
  const focusToday = focus.filter((f) => localNow(undefined, f.startedAt).date === today);
  const timeline: TimelineEntry[] = [
    ...d.dueToday.map((t): TimelineEntry => ({ key: `t${t.id}`, time: t.dueTime, title: t.title, note: t.parent?.title ?? t.areaName ?? (t.dueTime ? "reminder" : "due today"), state: "open", taskId: t.id, space: t.space })),
    ...doneActs.map((a): TimelineEntry => ({ key: `d${a.taskId}${a.createdAt.getTime()}`, time: clockOf(a.createdAt), title: a.task?.title ?? "Task", note: "done", state: "done", taskId: a.taskId, space: a.task?.space ?? null })),
    ...checks.map((c): TimelineEntry => ({ key: `h${c.taskId}`, time: clockOf(c.createdAt), title: habitById.get(c.taskId)?.title ?? "Habit", note: "habit · done", state: "done", taskId: c.taskId, space: habitById.get(c.taskId)?.space ?? null })),
    ...focusToday.map((f): TimelineEntry => ({
      key: `f${f.id}`,
      time: clockOf(f.startedAt),
      title: `Focus: ${f.task?.title ?? "free focus"}`,
      note: `${Math.max(1, Math.round((f.endedAt!.getTime() - f.startedAt.getTime()) / 60_000))} min${f.outcome === "stuck" ? " · got stuck" : ""}`,
      state: "focus",
      taskId: f.task?.id ?? null,
      space: f.task?.space ?? null,
    })),
    ...d.habits.filter((h) => h.dueToday && !h.doneToday).map((h): TimelineEntry => ({ key: `ho${h.id}`, time: null, title: h.title, note: "habit", state: "open", taskId: h.id, space: h.space })),
  ].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));

  const nowClock = `${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`;
  return {
    today,
    nowClock,
    player,
    queue,
    bosses,
    habits: d.habits,
    done: d.done,
    counts: { overdue: d.overdue.length, today: d.dueToday.length, inbox: d.inbox.length, upcoming: d.upcoming.length, done: d.done.length },
    timeline,
    feed,
  };
}

export type Home = Awaited<ReturnType<typeof getHome>>;
