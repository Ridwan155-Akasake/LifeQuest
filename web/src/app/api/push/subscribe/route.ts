import { z } from "zod";

import { isOwner } from "@/lib/auth";
import { db } from "@/lib/db";

/** Register (POST) or forget (DELETE) this device for push notifications. Owner only. */
export const dynamic = "force-dynamic";

const subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function POST(req: Request) {
  if (!(await isOwner())) return new Response("Unauthorized", { status: 401 });
  const parsed = z.object({ subscription, device: z.string().max(80).optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid subscription" }, { status: 400 });
  const { subscription: s, device } = parsed.data;
  await db.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    update: { p256dh: s.keys.p256dh, auth: s.keys.auth, device, failCount: 0 },
    create: { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, device },
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await isOwner())) return new Response("Unauthorized", { status: 401 });
  const parsed = z.object({ endpoint: z.string().url().max(2000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  await db.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
  return Response.json({ ok: true });
}
