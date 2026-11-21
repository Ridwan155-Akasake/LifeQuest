"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwner } from "./auth";
import { db } from "./db";
import { CATEGORIES, columnInput, createTaskInput, id, updateTaskInput, type Result } from "./domain";
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

/** Complete / reopen any task. For a repeating task, `nextDue` says where it rolled to. */
export async function setTaskDoneAction(taskId: string, done: boolean): Promise<Result<{ nextDue?: string }>> {
  await requireOwner();
  try {
    const res = await work.setTaskDone(id.parse(taskId), z.boolean().parse(done));
    revalidatePath("/", "layout");
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Quick capture box: one line of text → task (lib/capture.ts syntax). */
export async function quickCaptureAction(text: string) {
  return run(() => work.quickCapture(z.string().trim().min(1, "Type something first").max(300).parse(text)));
}

export async function setHabitCheckedAction(habitId: string, checked: boolean) {
  return run(() => work.setHabitChecked(id.parse(habitId), z.boolean().parse(checked)));
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
