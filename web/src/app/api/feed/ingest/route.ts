import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logFeed } from "@/lib/push";
import { getScope, defaultSpaceId } from "@/lib/scope";
import { quickCapture } from "@/lib/work";

/**
 * POST /api/feed/ingest — other programs tell HQ what they said or heard, so the Feed has
 * the whole story. Used by the SecondBrain Telegram bot (see deploy/secondbrain-bot-feed.md)
 * and anything on the homelab that wants to raise an alert.
 *
 *   header  x-feed-secret: <FEED_SECRET from .env>
 *   body    { kind: "telegram.in" | "telegram.out" | "alert", text, at?, capture? }
 *
 * `capture: true` (only with telegram.in) also files the text as a task in HQ, using the
 * same quick-capture rules as the app ("call mom tomorrow 3pm #personal !").
 */
export const dynamic = "force-dynamic";

const input = z.object({
  kind: z.enum(["telegram.in", "telegram.out", "alert"]),
  text: z.string().trim().min(1).max(4000),
  at: z.string().datetime({ offset: true }).optional(),
  capture: z.boolean().optional(),
});

function authorized(req: Request) {
  const secret = process.env.FEED_SECRET;
  const got = req.headers.get("x-feed-secret") ?? "";
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!process.env.FEED_SECRET) return Response.json({ error: "Feed ingest is off (no FEED_SECRET)" }, { status: 503 });
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const { kind, text, at, capture } = parsed.data;

  let task: { id: string; title: string } | null = null;
  if (capture && kind === "telegram.in") {
    const scope = await getScope();
    const t = await quickCapture(text, { spaceId: defaultSpaceId(scope), spaces: scope.spaces });
    task = { id: t.id, title: t.title };
  }
  const firstLine = text.split("\n")[0]!;
  await logFeed({
    kind,
    title: firstLine.slice(0, 300),
    body: text.length > firstLine.length ? text.slice(firstLine.length).trim() : null,
    channel: kind === "alert" ? "in-app" : "telegram",
    taskId: task?.id,
    at: at ? new Date(at) : undefined,
    meta: task ? { captured: true } : {},
  });
  revalidatePath("/feed");
  return Response.json({ ok: true, task });
}
