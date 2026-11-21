import crypto from "node:crypto";

import { db } from "@/lib/db";
import { formatClock, localNow, toDbDate } from "@/lib/dates";
import { notify } from "@/lib/push";
import { dueReminders, getToday, markReminded } from "@/lib/work";

/**
 * POST /api/cron/tick — called every minute by the `ticker` container (docker-compose.yml).
 * Sends due task reminders, then the morning digest once a day. Protected by CRON_SECRET;
 * the ticker reaches it over the internal Docker network only.
 */
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });

  // 1. Task reminders. Mark first, then send: a crash mid-send can at worst drop one
  //    ping, never spam the same reminder every minute.
  const due = await dueReminders();
  await markReminded(due.map((t) => t.id));
  const channels: Record<string, number> = {};
  for (const t of due) {
    const via = await notify({
      title: t.title,
      body: [t.dueTime && formatClock(t.dueTime), t.parent?.title, t.recurrence && "↻ repeats"].filter(Boolean).join(" · ") || undefined,
      url: `/task/${t.id}`,
      tag: `task-${t.id}`,
      taskId: t.id,
    });
    channels[via] = (channels[via] ?? 0) + 1;
  }

  // 2. Morning digest, once per day at DIGEST_TIME (default 08:00) or the first tick after.
  const now = localNow();
  const [h, m] = (process.env.DIGEST_TIME || "08:00").split(":").map(Number);
  let digest = "skipped";
  if (now.minutes >= (h ?? 8) * 60 + (m ?? 0)) {
    const on = toDbDate(now.date);
    const already = await db.activity.findFirst({ where: { type: "digest.sent", on }, select: { id: true } });
    if (!already) {
      await db.activity.create({ data: { type: "digest.sent", on } });
      const d = await getToday();
      const timed = d.dueToday.filter((t) => t.dueTime).map((t) => `${formatClock(t.dueTime!)} ${t.title}`);
      const untimed = d.dueToday.filter((t) => !t.dueTime).map((t) => t.title);
      const lines = [
        d.overdue.length ? `⚠️ ${d.overdue.length} overdue: ${d.overdue.slice(0, 3).map((t) => t.title).join(", ")}${d.overdue.length > 3 ? "…" : ""}` : "",
        ...timed.slice(0, 5),
        untimed.length ? `Also today: ${untimed.slice(0, 4).join(", ")}${untimed.length > 4 ? "…" : ""}` : "",
        d.inbox.length ? `📥 ${d.inbox.length} in inbox need a date` : "",
      ].filter(Boolean);
      const total = d.overdue.length + d.dueToday.length;
      digest = await notify({
        title: total ? `Good morning, ${total} thing${total === 1 ? "" : "s"} today` : "Good morning, nothing due today",
        body: lines.join("\n") || "Clear day. Capture anything new in HQ.",
        url: "/",
        tag: "digest",
      });
    }
  }

  return Response.json({ reminders: due.length, channels, digest });
}
