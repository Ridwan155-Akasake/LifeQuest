/**
 * Domain vocabulary — the string unions the schema stores as plain String columns.
 * Validated here (Zod) at every write boundary, so adding a value never needs a migration.
 */
import { z } from "zod";

import { RECURRENCE_RE } from "./dates";

/** What a column MEANS (ARCNIR WorkflowNode.category). Sets the status of tasks inside it. */
export const CATEGORIES = ["backlog", "todo", "in-progress", "review", "done", "canceled"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  backlog: "Backlog",
  todo: "To do",
  "in-progress": "In progress",
  review: "Review",
  done: "Done",
  canceled: "Canceled",
};
export const CLOSED: readonly string[] = ["done", "canceled"];
export const isClosed = (status: string) => CLOSED.includes(status);

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_KINDS = ["quest", "step", "task", "habit", "job"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** Default XP per kind — overridable per task. */
export const DEFAULT_XP: Record<TaskKind, number> = { quest: 50, step: 10, task: 10, habit: 5, job: 20 };

/** Theme token keys — never literal colours (ARCNIR rule). */
export const TONES = ["accent", "live", "warn", "stop", "info"] as const;
export type Tone = (typeof TONES)[number];

export const id = z.string().min(1).max(64);
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const recurrence = z.string().regex(RECURRENCE_RE, "Unknown repeat rule");
export const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");

export const createTaskInput = z.object({
  title: z.string().trim().min(1, "Give it a title").max(200),
  kind: z.enum(TASK_KINDS).default("task"),
  boardId: id.optional(),
  columnId: id.optional(),
  parentId: id.optional(),
  areaId: id.optional(),
  priority: z.enum(PRIORITIES).default("medium"),
  dueOn: day.optional(),
  dueTime: clock.optional(),
  recurrence: recurrence.optional(),
});
export type CreateTaskInput = z.input<typeof createTaskInput>;

export const updateTaskInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20_000).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  areaId: id.nullable().optional(),
  dueOn: day.nullable().optional(),
  dueTime: clock.nullable().optional(),
  recurrence: recurrence.nullable().optional(),
  weeklyFocus: z.boolean().optional(),
  claudePrompt: z.string().max(4000).nullable().optional(),
  xp: z.number().int().min(0).max(1000).optional(),
});
export type UpdateTaskInput = z.input<typeof updateTaskInput>;

export const columnInput = z.object({
  title: z.string().trim().min(1, "Name the column").max(120),
  category: z.enum(CATEGORIES),
});

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
