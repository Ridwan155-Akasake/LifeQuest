import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { answer, receipt, snooze } from "@/lib/nag";
import { endFocus } from "@/lib/play";
import { setTaskDone } from "@/lib/work";

/**
 * Buttons on a notification (sent by the service worker, with the session cookie).
 *   done        → finish the task (a repeating one rolls on) + Telegram receipt
 *   snooze      → ping again in 15 min (limited; 409 when none are left)
 *   start       → stop nagging; the app opens on the focus timer
 *   focus-done  → end the focus session as done and finish its task
 *   focus-more  → 10 more minutes on the running focus timer
 */
export const dynamic = "force-dynamic";

const input = z.object({
  action: z.enum(["done", "snooze", "start", "focus-done", "focus-more"]),
  taskId: z.string().min(1).max(64).optional(),
  focusId: z.string().min(1).max(64).optional(),
});

async function finish(taskId: string) {
  const t = await db.task.findUnique({ where: { id: taskId }, select: { title: true, status: true, space: { select: { name: true } } } });
  const res = await setTaskDone(taskId, true);
  if (t && t.status !== "done") after(() => receipt({ title: t.title, xp: res.xp, boss: res.boss, space: t.space?.name, taskId }));
}

export async function POST(req: Request) {
  if (!(await isOwner())) return new Response("Unauthorized", { status: 401 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid action" }, { status: 400 });
  const { action, taskId, focusId } = parsed.data;
  try {
    if (action === "done" && taskId) await finish(taskId);
    else if (action === "snooze" && taskId) {
      try {
        await snooze(taskId, 15);
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "No snoozes left" }, { status: 409 });
      }
    } else if (action === "start" && taskId) await answer(taskId);
    else if (action === "focus-done" && focusId) {
      const f = await db.focusSession.findUnique({ where: { id: focusId }, select: { taskId: true } });
      await endFocus(focusId, "done");
      if (f?.taskId) await finish(f.taskId);
    } else if (action === "focus-more" && focusId) {
      await db.focusSession.update({ where: { id: focusId }, data: { plannedMin: { increment: 10 }, lastCheckinAt: new Date() } });
    } else return Response.json({ error: "Missing id" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
