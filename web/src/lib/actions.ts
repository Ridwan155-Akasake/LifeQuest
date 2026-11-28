"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";

import { requireOwner } from "./auth";
import { db } from "./db";
import { todayISO, toDbDate } from "./dates";
import { CATEGORIES, columnInput, createTaskInput, FOCUS_OUTCOMES, id, settingsInput, spaceInput, telegramInput, updateTaskInput, type Result } from "./domain";
import { receipt } from "./nag";
import * as tg from "./telegram";
import * as play from "./play";
import { defaultSpaceId, getScope, saveSettings, SPACE_COOKIE } from "./scope";
import * as work from "./work";

/**
 * Server actions — the only write path. Every action: owner gate → Zod parse → service
 * call → revalidate. Errors come back as { ok: false, error } so the UI can roll back an
 * optimistic change and say why (ARCNIR pattern).
 */
async function run(fn: () => Promise<unknown>, paths: string[] = ["/"]): Promise<Result> {
  await requireOwner();
  try {
    await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function moveTaskAction(taskId: string, columnId: string, index?: number) {
  return run(() => work.moveTask(id.parse(taskId), id.parse(columnId), index === undefined ? undefined : z.number().int().min(0).parse(index)));
}

export async function createTaskAction(input: unknown) {
  return run(() => work.createTask(createTaskInput.parse(input)));
}

export async function updateTaskAction(taskId: string, input: unknown) {
  return run(() => work.updateTask(id.parse(taskId), updateTaskInput.parse(input)));
}

export async function archiveTaskAction(taskId: string) {
  return run(() => db.task.update({ where: { id: id.parse(taskId) }, data: { archivedAt: new Date() } }));
}

export async function setStepDoneAction(stepId: string, done: boolean) {
  return run(() => work.setTaskDone(id.parse(stepId), z.boolean().parse(done)));
}

/**
 * Complete / reopen any task. For a repeating task, `nextDue` says where it rolled to.
 * Also returns XP gained and the player's level afterwards, for the reward screen.
 */
export async function setTaskDoneAction(taskId: string, done: boolean): Promise<Result<work.DoneResult & { player: play.Player }>> {
  await requireOwner();
  try {
    const tid = id.parse(taskId);
    const before = await db.task.findUnique({ where: { id: tid }, select: { title: true, kind: true, status: true, space: { select: { name: true } } } });
    const res = await work.setTaskDone(tid, z.boolean().parse(done));
    const player = await play.getPlayer();
    // ✅ to Telegram after the response, so a slow Telegram never slows the tap. Steps don't send one.
    if (done && before && before.status !== "done" && before.kind !== "step") after(() => receipt({ title: before.title, xp: res.xp, boss: res.boss, space: before.space?.name, taskId: tid }));
    revalidatePath("/", "layout");
    return { ok: true, data: { ...res, player } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Quick capture box: one line of text → task (lib/capture.ts syntax). */
export async function quickCaptureAction(text: string) {
  return run(async () => {
    const scope = await getScope();
    return work.quickCapture(z.string().trim().min(1, "Type something first").max(300).parse(text), { spaceId: defaultSpaceId(scope), spaces: scope.spaces });
  });
}

export async function setHabitCheckedAction(habitId: string, checked: boolean): Promise<Result<{ xp: number; player: play.Player }>> {
  await requireOwner();
  try {
    const hid = id.parse(habitId);
    const wasDone = await db.habitCheck.findFirst({ where: { taskId: hid, on: toDbDate(todayISO()) }, select: { id: true } });
    await work.setHabitChecked(hid, z.boolean().parse(checked));
    const [habit, player] = await Promise.all([db.task.findUnique({ where: { id: hid }, select: { xp: true, title: true, space: { select: { name: true } } } }), play.getPlayer()]);
    if (checked && !wasDone && habit) after(() => receipt({ title: habit.title, xp: habit.xp, habit: true, space: habit.space?.name, taskId: hid }));
    revalidatePath("/", "layout");
    return { ok: true, data: { xp: checked ? (habit?.xp ?? 0) : 0, player } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function createColumnAction(boardId: string, input: unknown) {
  return run(() => {
    const { title, category } = columnInput.parse(input);
    return work.createColumn(id.parse(boardId), title, category);
  });
}

export async function updateColumnAction(columnId: string, input: unknown) {
  return run(() => work.updateColumn(id.parse(columnId), z.object({ title: z.string().trim().min(1).max(120).optional(), category: z.enum(CATEGORIES).optional() }).parse(input)));
}

export async function reorderColumnsAction(boardId: string, ids: string[]) {
  return run(() => work.reorderColumns(id.parse(boardId), z.array(id).max(50).parse(ids)));
}

export async function deleteColumnAction(columnId: string) {
  return run(() => work.deleteColumn(id.parse(columnId)));
}

// ── Redesign R1–R3: spaces, settings, focus, split-it ────────────────────────

/** Header space switcher. Per device (cookie), so the phone can sit on Work while the PC shows All. */
export async function setActiveSpaceAction(slug: string) {
  await requireOwner();
  const value = z.string().regex(/^[a-z0-9-]{1,40}$/).parse(slug);
  (await cookies()).set(SPACE_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.COOKIE_SECURE !== "false" });
  revalidatePath("/", "layout");
  return { ok: true } as Result;
}

export async function saveSettingsAction(patch: unknown) {
  return run(() => saveSettings(settingsInput.partial().parse(patch)));
}

export async function createSpaceAction(input: unknown) {
  return run(async () => {
    const s = spaceInput.parse(input);
    const base = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "space";
    let slug = base;
    for (let i = 2; await db.space.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    if (slug === "all") slug = "all-space";
    const last = await db.space.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
    await db.space.create({ data: { ...s, slug, order: (last?.order ?? -1) + 1 } });
  });
}

export async function updateSpaceAction(spaceId: string, input: unknown) {
  return run(() => db.space.update({ where: { id: id.parse(spaceId) }, data: spaceInput.partial().parse(input) }));
}

/** Remove a space. Its tasks move to Personal; nothing is deleted. */
export async function archiveSpaceAction(spaceId: string) {
  return run(async () => {
    const sid = id.parse(spaceId);
    const personal = await db.space.findUnique({ where: { slug: "personal" }, select: { id: true } });
    if (!personal || personal.id === sid) throw new Error("Personal is the home space and can't be removed.");
    await db.$transaction([
      db.task.updateMany({ where: { spaceId: sid }, data: { spaceId: personal.id } }),
      db.area.updateMany({ where: { spaceId: sid }, data: { spaceId: personal.id } }),
      db.space.update({ where: { id: sid }, data: { archivedAt: new Date() } }),
    ]);
  });
}

export async function startFocusAction(taskId: string | null, minutes: number): Promise<Result<{ id: string; startedAt: string; plannedMin: number }>> {
  await requireOwner();
  try {
    const data = await play.startFocus(taskId === null ? null : id.parse(taskId), z.number().int().min(1).max(180).parse(minutes));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't start the timer" };
  }
}

export async function endFocusAction(sessionId: string, outcome: string): Promise<Result<{ minutes: number; xp: number }>> {
  await requireOwner();
  try {
    const data = await play.endFocus(id.parse(sessionId), z.enum(FOCUS_OUTCOMES).parse(outcome));
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't stop the timer" };
  }
}

/** "Too big? Split it" / boss hits: add small steps under a task. */
export async function addStepsAction(taskId: string, titles: string[]) {
  return run(async () => {
    const parentId = id.parse(taskId);
    const list = z.array(z.string().trim().min(1).max(200)).min(1).max(10).parse(titles);
    for (const title of list) await work.createTask({ title, kind: "step", parentId, priority: "medium" });
  });
}

// ── R4: Telegram from Settings ───────────────────────────────────────────────

/** Check a bot token and say which bot it is. */
export async function checkBotAction(token: string): Promise<Result<{ username: string }>> {
  await requireOwner();
  const t = telegramInput.shape.token.safeParse(token);
  if (!t.success) return { ok: false, error: t.error.issues[0]?.message ?? "Invalid token" };
  const r = await tg.botName(t.data);
  return r.ok ? { ok: true, data: { username: r.username } } : { ok: false, error: r.error };
}

/** After the user pressed Start on their new bot: find their chat id. */
export async function findChatIdAction(token: string): Promise<Result<{ chatId: string; name: string }>> {
  await requireOwner();
  const t = telegramInput.shape.token.safeParse(token);
  if (!t.success) return { ok: false, error: t.error.issues[0]?.message ?? "Invalid token" };
  const r = await tg.findChatId(t.data);
  return r.ok ? { ok: true, data: { chatId: r.chatId, name: r.name } } : { ok: false, error: r.error };
}

/** Save the bot, then prove it works with a hello message. */
export async function saveTelegramAction(input: unknown) {
  return run(async () => {
    const { token, chatId } = telegramInput.parse(input);
    const ok = await tg.sendTelegram("👋 HQ is connected. Reminders you miss on your phone and ✅ receipts for finished tasks will arrive here.", { token, chatId, source: "settings" });
    if (!ok) throw new Error("Telegram didn't deliver the hello message. Check the token, and that you pressed Start on your bot.");
    await tg.saveTelegram(token, chatId);
  }, ["/settings"]);
}

export async function clearTelegramAction() {
  return run(() => tg.clearTelegram(), ["/settings"]);
}

export async function testTelegramAction() {
  return run(async () => {
    const ok = await tg.sendTelegram("🧪 HQ test message. Telegram is working.");
    if (!ok) throw new Error("Telegram isn't set up, or it refused the message.");
  }, ["/settings"]);
}

/** The app's local focus timer asks: still running, and for how long? (A notification button may have changed it.) */
export async function focusStatusAction(sessionId: string): Promise<Result<{ ended: boolean; plannedMin: number }>> {
  await requireOwner();
  const f = await db.focusSession.findUnique({ where: { id: id.parse(sessionId) }, select: { endedAt: true, plannedMin: true } });
  return f ? { ok: true, data: { ended: !!f.endedAt, plannedMin: f.plannedMin } } : { ok: true, data: { ended: true, plannedMin: 0 } };
}

/** Timer length changed on the focus screen (5 / 15 / 25 / 45 min, or +5). */
export async function setFocusLengthAction(sessionId: string, minutes: number) {
  return run(() => db.focusSession.update({ where: { id: id.parse(sessionId) }, data: { plannedMin: z.number().int().min(1).max(240).parse(minutes) } }), []);
}
