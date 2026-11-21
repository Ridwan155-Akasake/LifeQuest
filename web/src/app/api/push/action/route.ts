import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isOwner } from "@/lib/auth";
import { setTaskDone, snoozeTask } from "@/lib/work";

/**
 * Buttons on a reminder notification (sent by the service worker, with the session cookie).
 * done → complete the task (a repeating one rolls to its next date); snooze → ping again in 1h.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isOwner())) return new Response("Unauthorized", { status: 401 });
  const parsed = z.object({ taskId: z.string().min(1).max(64), action: z.enum(["done", "snooze"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid action" }, { status: 400 });
  const { taskId, action } = parsed.data;
  try {
    if (action === "done") await setTaskDone(taskId, true);
    else await snoozeTask(taskId, 60);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
