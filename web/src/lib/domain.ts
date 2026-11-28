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
  spaceId: id.optional(),
  estimateMin: z.number().int().min(1).max(600).optional(),
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
  spaceId: id.nullable().optional(),
  estimateMin: z.number().int().min(1).max(600).nullable().optional(),
});
export type UpdateTaskInput = z.input<typeof updateTaskInput>;

export const columnInput = z.object({
  title: z.string().trim().min(1, "Name the column").max(120),
  category: z.enum(CATEGORIES),
});

// ── Spaces, views, settings (redesign R1) ───────────────────────────────────

/** Space colours are palette keys mapped to CSS tokens (--color-sp-<key>). */
export const SPACE_COLORS = ["mint", "sky", "amber", "rose", "violet", "lime"] as const;
export type SpaceColor = (typeof SPACE_COLORS)[number];

/** Home screen styles, switchable in Settings → View. */
export const VIEWS = ["hybrid", "quest", "cockpit"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_LABEL: Record<View, { name: string; blurb: string }> = {
  hybrid: { name: "Hybrid", blurb: "One thing now, a big Start button, and overdue tasks as bosses." },
  quest: { name: "Quest", blurb: "The full game: quest cards, XP, levels, badges and bosses." },
  cockpit: { name: "Cockpit", blurb: "Your day as a timeline with a live feed. Calm and informative." },
};

export const settingsInput = z.object({
  view: z.enum(VIEWS),
  sound: z.boolean(),
  workHours: z.object({
    start: clock,
    end: clock,
    /** 0 = Sunday … 6 = Saturday */
    days: z.array(z.number().int().min(0).max(6)).max(7),
  }),
  /** R4: how hard reminders push. */
  reminders: z.object({
    /** Repeat a reminder until Done / Snooze / Start. */
    nag: z.boolean(),
    everyMin: z.number().int().min(2).max(60),
    /** After this many unanswered pings, Telegram gets a copy too. */
    telegramAfter: z.number().int().min(1).max(20),
    maxSnoozes: z.number().int().min(0).max(10),
    /** No nagging in this window (reminders still arrive once). */
    quietStart: clock,
    quietEnd: clock,
    /** Send a ✅ to Telegram every time something is finished. */
    receipts: z.boolean(),
  }),
});
export type Settings = z.infer<typeof settingsInput>;
export const DEFAULT_SETTINGS: Settings = {
  view: "hybrid",
  sound: true,
  workHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
  reminders: { nag: true, everyMin: 5, telegramAfter: 3, maxSnoozes: 3, quietStart: "22:00", quietEnd: "07:00", receipts: true },
};

/** A reminder stops nagging after this many pings even if never answered (≈2h at 5 min). */
export const MAX_NAGS = 24;
/** Focus check-ins after the timer runs out: how many, and how far apart (minutes). */
export const FOCUS_CHECKINS = 3;
export const FOCUS_CHECKIN_EVERY = 10;

export const telegramInput = z.object({
  token: z.string().trim().regex(/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/, "That doesn't look like a bot token (it looks like 123456789:AA…)."),
  chatId: z.string().trim().regex(/^-?\d{3,20}$/, "Chat id is a number, like 123456789."),
});

export const spaceInput = z.object({
  name: z.string().trim().min(1, "Name the space").max(40),
  color: z.enum(SPACE_COLORS),
  workHoursOnly: z.boolean().default(false),
});

/** Focus timer lengths offered on the Start screen (minutes). */
export const FOCUS_LENGTHS = [5, 15, 25, 45] as const;
export const FOCUS_OUTCOMES = ["done", "stopped", "stuck"] as const;

/** Bonus for finishing a task after its due date passed (a "boss"). */
export const BOSS_BONUS_XP = 25;

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
