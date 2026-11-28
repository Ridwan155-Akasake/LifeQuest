import "server-only";
import type { Prisma } from "@prisma/client";

import { db } from "./db";
import { addDays, fromDbDate, habitDueOn, localNow, nextDue, todayISO, toDbDate, zonedToUtc } from "./dates";
import { parseCapture } from "./capture";
import { BOSS_BONUS_XP, CLOSED, DEFAULT_XP, isClosed, type Category, type TaskKind } from "./domain";

/**
 * Work service — the one place that changes tasks, so status, completedAt and the XP
 * ledger can never disagree. Ported from ARCNIR apps/api/src/modules/work/work.service.ts
 * minus RBAC/assignees/delegation (single owner).
 */

type Tx = Prisma.TransactionClient;

/**
 * The reminder moment for a task: its due date at its due time, in APP_TIMEZONE. No time →
 * no reminder. Always clears `remindedAt`, so moving a reminder re-arms it.
 */
function reminderFor(dueOn: string | null | undefined, dueTime: string | null | undefined) {
  // A new reminder time starts fresh: no pings sent, no snoozes used.
  return { remindAt: dueOn && dueTime ? zonedToUtc(dueOn, dueTime) : null, remindedAt: null, nagCount: 0, nagNextAt: null, snoozeCount: 0 };
}

// ── Read models (what the UI receives — plain, serialisable) ─────────────────

export type CardView = {
  id: string;
  title: string;
  kind: string;
  status: string;
  priority: string;
  columnId: string | null;
  dueOn: string | null;
  weeklyFocus: boolean;
  areaName: string | null;
  areaColor: string | null;
  stepCount: number;
  stepDone: number;
  labels: { id: string; name: string; color: string }[];
  company: string | null;
};

export type ColumnView = { id: string; title: string; category: Category; wipLimit: number | null; cards: CardView[] };
export type BoardView = { id: string; slug: string; name: string; kind: string; columns: ColumnView[] };

const cardSelect = {
  id: true,
  title: true,
  kind: true,
  status: true,
  priority: true,
  columnId: true,
  dueOn: true,
  weeklyFocus: true,
  meta: true,
  area: { select: { name: true, color: true } },
  steps: { where: { archivedAt: null }, select: { status: true } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.TaskSelect;

type CardRow = Prisma.TaskGetPayload<{ select: typeof cardSelect }>;

function toCard(t: CardRow): CardView {
  const meta = (t.meta ?? {}) as Record<string, unknown>;
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    status: t.status,
    priority: t.priority,
    columnId: t.columnId,
    dueOn: t.dueOn ? fromDbDate(t.dueOn) : null,
    weeklyFocus: t.weeklyFocus,
    areaName: t.area?.name ?? null,
    areaColor: t.area?.color ?? null,
    stepCount: t.steps.length,
    stepDone: t.steps.filter((s) => s.status === "done").length,
    labels: t.labels.map((l) => l.label),
    company: typeof meta.company === "string" ? meta.company : null,
  };
}

export async function listBoards() {
  return db.board.findMany({ orderBy: { order: "asc" }, select: { slug: true, name: true, kind: true } });
}

export async function getBoard(slug: string, f: { areaId?: string; q?: string } = {}): Promise<BoardView | null> {
  const board = await db.board.findUnique({
    where: { slug },
    include: { columns: { orderBy: { order: "asc" } } },
  });
  if (!board) return null;
  const tasks = await db.task.findMany({
    where: {
      boardId: board.id,
      archivedAt: null,
      parentId: null,
      ...(f.areaId ? { areaId: f.areaId } : {}),
      ...(f.q ? { title: { contains: f.q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: cardSelect,
  });
  const byCol = new Map<string, CardView[]>();
  for (const t of tasks) {
    const key = t.columnId ?? board.columns[0]?.id ?? "";
    byCol.set(key, [...(byCol.get(key) ?? []), toCard(t)]);
  }
  return {
    id: board.id,
    slug: board.slug,
    name: board.name,
    kind: board.kind,
    columns: board.columns.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category as Category,
      wipLimit: c.wipLimit,
      cards: byCol.get(c.id) ?? [],
    })),
  };
}

// ── Status + XP (single source of truth) ─────────────────────────────────────

/**
 * Apply a status change and write the matching Activity row. Entering a closed status
 * from an open one completes the task (+xp); leaving it reopens (−xp), so the ledger
 * always nets out and a drag back-and-forth can't farm XP.
 */
async function applyStatus(tx: Tx, task: { id: string; status: string; xp: number; kind: string }, next: string, extra: Prisma.TaskUncheckedUpdateInput = {}) {
  const wasDone = task.status === "done";
  const nowDone = next === "done";
  const today = toDbDate(todayISO());
  await tx.task.update({
    where: { id: task.id },
    data: {
      ...extra,
      status: next,
      ...(nowDone && !wasDone ? { completedAt: new Date() } : {}),
      ...(!CLOSED.includes(next) ? { completedAt: null } : {}),
    },
  });
  if (nowDone && !wasDone) {
    await tx.activity.create({ data: { taskId: task.id, type: "task.completed", xp: task.xp, on: today, data: { kind: task.kind } } });
  } else if (wasDone && !nowDone) {
    await tx.activity.create({ data: { taskId: task.id, type: "task.reopened", xp: -task.xp, on: today, data: { kind: task.kind, to: next } } });
  } else if (task.status !== next) {
    await tx.activity.create({ data: { taskId: task.id, type: "task.moved", on: today, data: { from: task.status, to: next } } });
  }
}

/** Move a card to a column (and position). Status follows the column's category. */
export async function moveTask(id: string, columnId: string, index?: number) {
  return db.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id }, select: { id: true, status: true, xp: true, kind: true, boardId: true } });
    const column = await tx.column.findUnique({ where: { id: columnId }, select: { id: true, boardId: true, category: true } });
    if (!task || !column) throw new Error("Task or column not found");
    if (task.boardId !== column.boardId) throw new Error("That column is on another board");

    // Re-sequence the target column with the card spliced in at `index`.
    const siblings = await tx.task.findMany({
      where: { columnId, parentId: null, archivedAt: null, NOT: { id } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const at = Math.max(0, Math.min(index ?? siblings.length, siblings.length));
    const ids = siblings.map((s) => s.id);
    ids.splice(at, 0, id);
    await Promise.all(ids.filter((x) => x !== id).map((x, i) => tx.task.update({ where: { id: x }, data: { order: i < at ? i : i + 1 } })));

    await applyStatus(tx, task, column.category, { columnId, order: at });
  });
}

/**
 * Tick / untick any task or quest step. A REPEATING task never closes: completing it logs
 * the completion (+xp) and moves its due date to the next occurrence, so "pay rent
 * monthly" is always waiting for next month. Returns the new due date when it rolled.
 */
export type DoneResult = { nextDue?: string; xp: number; boss: boolean };

export async function setTaskDone(id: string, done: boolean): Promise<DoneResult> {
  return db.$transaction(async (tx) => {
    const t = await tx.task.findUnique({ where: { id }, select: { id: true, status: true, xp: true, kind: true, recurrence: true, dueOn: true, dueTime: true, meta: true } });
    if (!t) throw new Error("Task not found");
    const today = todayISO();
    // Finishing something after its due date beats a "boss": bonus XP on top.
    const boss = done && t.status !== "done" && t.kind !== "step" && t.kind !== "habit" && !!t.dueOn && fromDbDate(t.dueOn) < today;
    const bonus = async () => {
      if (boss) await tx.activity.create({ data: { taskId: id, type: "boss.defeated", xp: BOSS_BONUS_XP, on: toDbDate(today), data: { due: fromDbDate(t.dueOn!) } } });
    };
    if (done && t.recurrence && t.kind !== "habit") {
      const from = t.dueOn ? fromDbDate(t.dueOn) : today;
      const monthDay = (t.meta as { monthDay?: unknown } | null)?.monthDay;
      const next = nextDue(t.recurrence, from, today, typeof monthDay === "number" ? monthDay : undefined);
      await tx.task.update({ where: { id }, data: { dueOn: toDbDate(next), status: "todo", completedAt: null, ...reminderFor(next, t.dueTime) } });
      await tx.activity.create({ data: { taskId: id, type: "task.completed", xp: t.xp, on: toDbDate(today), data: { kind: t.kind, repeat: true, was: from, next } } });
      await bonus();
      return { nextDue: next, xp: t.xp + (boss ? BOSS_BONUS_XP : 0), boss };
    }
    const gained = done && t.status !== "done" ? t.xp : 0;
    await applyStatus(tx, t, done ? "done" : "todo");
    await bonus();
    return { xp: gained + (boss ? BOSS_BONUS_XP : 0), boss };
  });
}

/** Kept for callers from the quest page. */
export const setStepDone = setTaskDone;

/** Quick capture: one line of text -> a task (see lib/capture.ts for the syntax). */
export async function quickCapture(text: string, ctx: { spaceId?: string; spaces: { id: string; slug: string }[] }) {
  const now = localNow();
  const c = parseCapture(text, now.date, now.minutes);
  // "#work" picks a space; an unknown tag goes back into the title untouched.
  const tagged = c.space ? ctx.spaces.find((s) => s.slug === c.space) : undefined;
  const title = c.space && !tagged ? `${c.title} #${c.space}` : c.title;
  if (!title) throw new Error("Type something first");
  return createTask({ title: title.slice(0, 200), kind: "task", priority: c.priority, dueOn: c.dueOn, dueTime: c.dueTime, recurrence: c.recurrence, spaceId: tagged?.id ?? ctx.spaceId });
}

/** Edit a task's basics. Setting a monthly repeat remembers the day of month (see nextDue). */
export async function updateTask(
  id: string,
  data: { title?: string; description?: string | null; priority?: string; dueOn?: string | null; dueTime?: string | null; recurrence?: string | null; weeklyFocus?: boolean; claudePrompt?: string | null; areaId?: string | null; xp?: number; spaceId?: string | null; estimateMin?: number | null },
) {
  // A task's steps always live in the same space as the task.
  if (data.spaceId !== undefined) await db.task.updateMany({ where: { parentId: id }, data: { spaceId: data.spaceId } });
  const current = await db.task.findUnique({ where: { id }, select: { dueOn: true, dueTime: true, recurrence: true, meta: true } });
  if (!current) throw new Error("Task not found");
  const due = data.dueOn === undefined ? (current.dueOn ? fromDbDate(current.dueOn) : null) : data.dueOn;
  const recurrence = data.recurrence === undefined ? current.recurrence : data.recurrence;
  if (recurrence && !due) throw new Error("A repeating task needs a due date. Set one first.");
  // Clearing the date clears the reminder time with it; setting a time needs a date.
  if (data.dueOn === null) data = { ...data, dueTime: null };
  const time = data.dueTime === undefined ? current.dueTime : data.dueTime;
  if (time && !due) throw new Error("Set a date before a reminder time.");
  const timing = data.dueOn !== undefined || data.dueTime !== undefined ? reminderFor(due, time) : {};
  const meta: Record<string, unknown> = { ...((current.meta as Prisma.JsonObject | null) ?? {}) };
  if (recurrence === "monthly" && due && (data.recurrence !== undefined || data.dueOn !== undefined)) meta.monthDay = Number(due.slice(8, 10));
  return db.task.update({
    where: { id },
    data: { ...data, ...timing, dueOn: data.dueOn === undefined ? undefined : data.dueOn === null ? null : toDbDate(data.dueOn), meta: meta as Prisma.InputJsonObject },
  });
}

/** Check / uncheck a habit for a day (default today). Idempotent both ways. */
export async function setHabitChecked(id: string, checked: boolean, dayIso = todayISO()) {
  return db.$transaction(async (tx) => {
    const habit = await tx.task.findUnique({ where: { id }, select: { id: true, xp: true, kind: true } });
    if (!habit || habit.kind !== "habit") throw new Error("Habit not found");
    const on = toDbDate(dayIso);
    const existing = await tx.habitCheck.findUnique({ where: { taskId_on: { taskId: id, on } } });
    if (checked && !existing) {
      await tx.habitCheck.create({ data: { taskId: id, on } });
      await tx.activity.create({ data: { taskId: id, type: "habit.checked", xp: habit.xp, on } });
    } else if (!checked && existing) {
      await tx.habitCheck.delete({ where: { id: existing.id } });
      await tx.activity.create({ data: { taskId: id, type: "habit.unchecked", xp: -habit.xp, on } });
    }
  });
}

export async function createTask(input: {
  title: string;
  kind: TaskKind;
  boardId?: string;
  columnId?: string;
  parentId?: string;
  areaId?: string;
  priority: string;
  dueOn?: string;
  dueTime?: string;
  recurrence?: string;
  spaceId?: string;
  estimateMin?: number;
}) {
  return db.$transaction(async (tx) => {
    let status = "todo";
    let boardId = input.boardId;
    if (input.columnId) {
      const col = await tx.column.findUnique({ where: { id: input.columnId }, select: { category: true, boardId: true } });
      if (!col) throw new Error("Column not found");
      status = col.category;
      boardId = col.boardId;
    }
    if (input.parentId) {
      const parent = await tx.task.findUnique({ where: { id: input.parentId }, select: { parentId: true, areaId: true, spaceId: true } });
      if (!parent) throw new Error("Quest not found");
      if (parent.parentId) throw new Error("Steps can't have their own steps (one level only)");
      input.areaId ??= parent.areaId ?? undefined;
      if (parent.spaceId) input.spaceId = parent.spaceId;
    }
    if (!input.spaceId && input.areaId) {
      input.spaceId = (await tx.area.findUnique({ where: { id: input.areaId }, select: { spaceId: true } }))?.spaceId ?? undefined;
    }
    const last = await tx.task.findFirst({
      where: input.parentId ? { parentId: input.parentId } : { columnId: input.columnId ?? null, parentId: null },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const task = await tx.task.create({
      data: {
        title: input.title,
        kind: input.kind,
        boardId: input.parentId ? null : boardId,
        columnId: input.parentId ? null : input.columnId,
        parentId: input.parentId,
        areaId: input.areaId,
        spaceId: input.spaceId,
        estimateMin: input.estimateMin,
        priority: input.priority,
        dueOn: input.dueOn ? toDbDate(input.dueOn) : undefined,
        dueTime: input.dueOn ? input.dueTime : undefined,
        ...reminderFor(input.dueOn, input.dueTime),
        recurrence: input.kind === "habit" ? input.recurrence ?? "daily" : input.recurrence ?? null,
        meta: input.recurrence === "monthly" && input.dueOn ? { monthDay: Number(input.dueOn.slice(8, 10)) } : {},
        status,
        order: (last?.order ?? -1) + 1,
        xp: DEFAULT_XP[input.kind],
      },
    });
    await tx.activity.create({ data: { taskId: task.id, type: "task.created", on: toDbDate(todayISO()), data: { kind: input.kind } } });
    return task;
  });
}

// ── Column management (ARCNIR workflow actions) ──────────────────────────────

export async function createColumn(boardId: string, title: string, category: Category) {
  const last = await db.column.findFirst({ where: { boardId }, orderBy: { order: "desc" }, select: { order: true } });
  return db.column.create({ data: { boardId, title, category, order: (last?.order ?? -1) + 1 } });
}

export async function updateColumn(id: string, data: { title?: string; category?: Category }) {
  return db.$transaction(async (tx) => {
    const col = await tx.column.update({ where: { id }, data });
    // Changing what a column MEANS re-derives the status of every card in it.
    if (data.category) {
      const tasks = await tx.task.findMany({ where: { columnId: id, archivedAt: null }, select: { id: true, status: true, xp: true, kind: true } });
      for (const t of tasks) await applyStatus(tx, t, data.category);
    }
    return col;
  });
}

export async function reorderColumns(boardId: string, ids: string[]) {
  await db.$transaction(ids.map((id, order) => db.column.update({ where: { id, boardId }, data: { order } })));
}

/** Delete a column; its cards move to a column with the same meaning (or the first). Nothing else is lost. */
export async function deleteColumn(id: string) {
  return db.$transaction(async (tx) => {
    const col = await tx.column.findUnique({ where: { id } });
    if (!col) throw new Error("Column not found");
    const others = await tx.column.findMany({ where: { boardId: col.boardId, NOT: { id } }, orderBy: { order: "asc" } });
    if (others.length === 0) throw new Error("A board needs at least one column");
    const target = others.find((c) => c.category === col.category) ?? others[0]!;
    const tasks = await tx.task.findMany({ where: { columnId: id }, select: { id: true, status: true, xp: true, kind: true } });
    for (const t of tasks) await applyStatus(tx, t, target.category, { columnId: target.id });
    await tx.column.delete({ where: { id } });
  });
}

// ── Today (simple tracker) ───────────────────────────────────────────────────

const itemSelect = {
  id: true,
  title: true,
  kind: true,
  priority: true,
  dueOn: true,
  dueTime: true,
  recurrence: true,
  estimateMin: true,
  parent: { select: { id: true, title: true } },
  area: { select: { name: true } },
  space: { select: { slug: true, name: true, color: true } },
} satisfies Prisma.TaskSelect;

export type TodayItem = {
  id: string;
  title: string;
  kind: string;
  priority: string;
  dueOn: string | null;
  dueTime: string | null;
  recurrence: string | null;
  parent: { id: string; title: string } | null;
  areaName: string | null;
  estimateMin: number | null;
  space: { slug: string; name: string; color: string } | null;
};

const toItem = (t: Prisma.TaskGetPayload<{ select: typeof itemSelect }>): TodayItem => ({
  id: t.id,
  title: t.title,
  kind: t.kind,
  priority: t.priority,
  dueOn: t.dueOn ? fromDbDate(t.dueOn) : null,
  dueTime: t.dueTime,
  recurrence: t.recurrence,
  parent: t.parent,
  areaName: t.area?.name ?? null,
  estimateMin: t.estimateMin,
  space: t.space,
});

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const byPriority = (a: TodayItem, b: TodayItem) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
/** Timed items first, in clock order; untimed after, by priority. */
const byTimeThenPriority = (a: TodayItem, b: TodayItem) =>
  a.dueTime && b.dueTime ? a.dueTime.localeCompare(b.dueTime) : a.dueTime ? -1 : b.dueTime ? 1 : byPriority(a, b);

/**
 * Today = everything that needs attention, in the order an ADHD brain needs it:
 * overdue → due today → inbox (captured, no date yet) → next 7 days, plus daily habits
 * and what's already been done today (proof of progress).
 */
export async function getToday(scope: Prisma.TaskWhereInput = {}) {
  const today = todayISO();
  const todayDb = toDbDate(today);
  const weekDb = toDbDate(addDays(today, 7));
  const open = { AND: [scope], archivedAt: null, kind: { not: "habit" }, status: { notIn: [...CLOSED] } } satisfies Prisma.TaskWhereInput;

  const [overdue, dueToday, upcoming, inbox, habits, doneActs, followUps] = await Promise.all([
    db.task.findMany({ where: { ...open, dueOn: { lt: todayDb } }, orderBy: { dueOn: "asc" }, select: itemSelect, take: 50 }),
    db.task.findMany({ where: { ...open, dueOn: todayDb }, select: itemSelect, take: 50 }),
    db.task.findMany({ where: { ...open, dueOn: { gt: todayDb, lte: weekDb } }, orderBy: { dueOn: "asc" }, select: itemSelect, take: 50 }),
    db.task.findMany({ where: { ...open, kind: "task", dueOn: null, parentId: null, boardId: null }, orderBy: { createdAt: "desc" }, select: itemSelect, take: 50 }),
    db.task.findMany({
      where: { AND: [scope], kind: "habit", archivedAt: null },
      orderBy: { order: "asc" },
      select: { id: true, title: true, recurrence: true, xp: true, space: { select: { slug: true, name: true, color: true } }, habitChecks: { where: { on: { gte: toDbDate(addDays(today, -6)) } }, select: { on: true } } },
    }),
    db.activity.findMany({
      where: { on: todayDb, type: "task.completed", task: { AND: [scope] } },
      orderBy: { createdAt: "desc" },
      select: { taskId: true, task: { select: { title: true, status: true, recurrence: true } } },
      take: 100,
    }),
    db.contact.findMany({
      where: { archivedAt: null, nextFollowUpOn: { lte: todayDb } },
      orderBy: { nextFollowUpOn: "asc" },
      select: { id: true, name: true, company: true, nextFollowUpOn: true },
      take: 10,
    }),
  ]);

  // Done today: completions that still stand (a reopened one-off task doesn't count).
  const seen = new Set<string>();
  const done = doneActs.flatMap((a) => {
    if (!a.taskId || !a.task || seen.has(a.taskId)) return [];
    seen.add(a.taskId);
    return a.task.status === "done" || a.task.recurrence ? [{ id: a.taskId, title: a.task.title }] : [];
  });

  return {
    today,
    overdue: overdue.map(toItem),
    dueToday: dueToday.map(toItem).sort(byTimeThenPriority),
    upcoming: upcoming.map(toItem),
    inbox: inbox.map(toItem),
    done,
    habits: habits.map((h) => {
      const checked = new Set(h.habitChecks.map((c) => fromDbDate(c.on)));
      return {
        id: h.id,
        title: h.title,
        recurrence: h.recurrence,
        xp: h.xp,
        space: h.space,
        dueToday: habitDueOn(h.recurrence, today),
        doneToday: checked.has(today),
        last7: Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({ day: d, done: checked.has(d), due: habitDueOn(h.recurrence, d) })),
      };
    }),
    followUps: followUps.map((c) => ({ ...c, nextFollowUpOn: fromDbDate(c.nextFollowUpOn!) })),
  };
}

// ── Task detail ──────────────────────────────────────────────────────────────

export async function getTask(id: string) {
  const t = await db.task.findUnique({
    where: { id },
    include: {
      area: { select: { id: true, name: true } },
      board: { select: { slug: true, name: true } },
      column: { select: { title: true } },
      parent: { select: { id: true, title: true } },
      steps: { where: { archivedAt: null }, orderBy: { order: "asc" } },
      labels: { include: { label: true } },
      activity: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  return t;
}

export { isClosed };

// ── All tasks (nothing is ever out of sight) ─────────────────────────────────

/** Every open task and quest step, soonest first; undated ones last. */
export async function getAllOpen(scope: Prisma.TaskWhereInput = {}) {
  const rows = await db.task.findMany({
    // Quest steps only when dated — the undated ones live on their quest page, not here.
    where: { AND: [scope], archivedAt: null, kind: { notIn: ["habit", "quest"] }, status: { notIn: [...CLOSED] }, OR: [{ kind: { not: "step" } }, { dueOn: { not: null } }] },
    orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    select: itemSelect,
    take: 500,
  });
  return { today: todayISO(), items: rows.map(toItem) };
}

// ── Reminders (used by the worker and notification actions) ─────────────────

/** Push a reminder later (notification "Snooze" button). Re-arms it. */
export async function snoozeTask(id: string, minutes: number) {
  return db.task.update({ where: { id }, data: { remindAt: new Date(Date.now() + minutes * 60_000), remindedAt: null } });
}

/** Reminders that are due and not yet sent, for open tasks only. */
export async function dueReminders(now = new Date()) {
  return db.task.findMany({
    where: { remindAt: { lte: now }, remindedAt: null, archivedAt: null, status: { notIn: [...CLOSED] } },
    orderBy: { remindAt: "asc" },
    select: { id: true, title: true, priority: true, recurrence: true, dueTime: true, parent: { select: { title: true } } },
    take: 50,
  });
}

export async function markReminded(ids: string[], at = new Date()) {
  if (ids.length) await db.task.updateMany({ where: { id: { in: ids } }, data: { remindedAt: at } });
}
