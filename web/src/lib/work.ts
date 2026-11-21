import "server-only";
import type { Prisma } from "@prisma/client";

import { db } from "./db";
import { addDays, fromDbDate, habitDueOn, todayISO, toDbDate } from "./dates";
import { CLOSED, DEFAULT_XP, isClosed, type Category, type TaskKind } from "./domain";
import { levelFor, streakFor } from "./xp";

/**
 * Work service — the one place that changes tasks, so status, completedAt and the XP
 * ledger can never disagree. Ported from ARCNIR apps/api/src/modules/work/work.service.ts
 * minus RBAC/assignees/delegation (single owner).
 */

type Tx = Prisma.TransactionClient;

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

/** Tick / untick a quest step (steps live outside columns). */
export async function setStepDone(id: string, done: boolean) {
  return db.$transaction(async (tx) => {
    const step = await tx.task.findUnique({ where: { id }, select: { id: true, status: true, xp: true, kind: true } });
    if (!step) throw new Error("Step not found");
    await applyStatus(tx, step, done ? "done" : "todo");
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
  recurrence?: string;
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
      const parent = await tx.task.findUnique({ where: { id: input.parentId }, select: { parentId: true, areaId: true } });
      if (!parent) throw new Error("Quest not found");
      if (parent.parentId) throw new Error("Steps can't have their own steps (one level only)");
      input.areaId ??= parent.areaId ?? undefined;
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
        priority: input.priority,
        dueOn: input.dueOn ? toDbDate(input.dueOn) : undefined,
        recurrence: input.kind === "habit" ? input.recurrence ?? "daily" : null,
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

// ── Today ────────────────────────────────────────────────────────────────────

export async function getToday() {
  const today = todayISO();
  const todayDb = toDbDate(today);
  const since = toDbDate(addDays(today, -400));

  const [focus, due, habits, xpAgg, xpDays, logDays, doneToday, followUps, todayLog] = await Promise.all([
    db.task.findMany({
      where: { weeklyFocus: true, parentId: null, archivedAt: null, status: { notIn: [...CLOSED] } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      select: cardSelect,
      take: 12,
    }),
    db.task.findMany({
      where: { dueOn: { lte: todayDb }, archivedAt: null, kind: { not: "habit" }, status: { notIn: [...CLOSED] } },
      orderBy: { dueOn: "asc" },
      select: { id: true, title: true, kind: true, dueOn: true, parentId: true, parent: { select: { id: true, title: true } } },
      take: 30,
    }),
    db.task.findMany({
      where: { kind: "habit", archivedAt: null },
      orderBy: { order: "asc" },
      select: { id: true, title: true, recurrence: true, xp: true, area: { select: { name: true } }, habitChecks: { where: { on: { gte: toDbDate(addDays(today, -6)) } }, select: { on: true } } },
    }),
    db.activity.aggregate({ _sum: { xp: true } }),
    db.activity.groupBy({ by: ["on"], where: { on: { gte: since } }, _sum: { xp: true } }),
    db.dailyLog.findMany({ where: { on: { gte: since } }, select: { on: true } }),
    db.activity.aggregate({ where: { on: todayDb }, _sum: { xp: true }, _count: { _all: true } }),
    db.contact.findMany({
      where: { archivedAt: null, nextFollowUpOn: { lte: todayDb } },
      orderBy: { nextFollowUpOn: "asc" },
      select: { id: true, name: true, company: true, nextFollowUpOn: true },
      take: 10,
    }),
    db.dailyLog.findUnique({ where: { on: todayDb }, select: { oneThing: true, oneWord: true } }),
  ]);

  const activeDays = new Set<string>([
    ...xpDays.filter((d) => (d._sum.xp ?? 0) > 0).map((d) => fromDbDate(d.on)),
    ...logDays.map((d) => fromDbDate(d.on)),
  ]);
  const totalXp = Math.max(0, xpAgg._sum.xp ?? 0);

  return {
    today,
    stats: {
      totalXp,
      ...levelFor(totalXp),
      ...streakFor(activeDays, today),
      xpToday: doneToday._sum.xp ?? 0,
    },
    todayLog,
    focus: focus.map(toCard),
    due: due.map((t) => ({ id: t.id, title: t.title, kind: t.kind, dueOn: fromDbDate(t.dueOn!), quest: t.parent })),
    habits: habits.map((h) => {
      const checked = new Set(h.habitChecks.map((c) => fromDbDate(c.on)));
      return {
        id: h.id,
        title: h.title,
        recurrence: h.recurrence,
        xp: h.xp,
        area: h.area?.name ?? null,
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
