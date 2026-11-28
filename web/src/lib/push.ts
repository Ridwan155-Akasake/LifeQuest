import "server-only";
import type { Prisma } from "@prisma/client";
import webpush from "web-push";

import { db } from "./db";
import { sendTelegram } from "./telegram";

/**
 * Notification delivery. Web Push to every subscribed device first; Telegram as the
 * backup when no device received it (or when asked to copy it there, e.g. a nag nobody
 * answered). Every notification is also written to the Feed.
 *
 * Env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (npm run vapid). Telegram is
 * configured in Settings or .env (see lib/telegram.ts).
 */

export type PushPayload = {
  title: string;
  body?: string;
  /** In-app path opened on tap. */
  url?: string;
  /** Same tag replaces an older notification instead of stacking (one per task). */
  tag?: string;
  /** Adds task buttons (Done / Start / Snooze) that act on this task. */
  taskId?: string;
  /** Snooze button only while snoozes are left. */
  snoozesLeft?: number;
  /** Focus check-in: buttons act on this focus session (Done / +10 min). */
  focusId?: string;
  /** Keep the notification on screen until tapped (nags, check-ins). */
  sticky?: boolean;
};

let configured: boolean | undefined;
function vapidReady(): boolean {
  if (configured !== undefined) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@ridwansharif.com", pub!, priv!);
  return configured;
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

/** Send to every device. Returns how many accepted it. Dead subscriptions are removed. */
export async function pushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!vapidReady()) return { sent: 0, failed: 0 };
  const subs = await db.pushSubscription.findMany();
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: "high" });
        sent++;
        await db.pushSubscription.update({ where: { id: s.id }, data: { lastOkAt: new Date(), failCount: 0 } });
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410 = the browser unsubscribed or the app was uninstalled: forget the device.
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else await db.pushSubscription.update({ where: { id: s.id }, data: { failCount: { increment: 1 } } }).catch(() => {});
      }
    }),
  );
  return { sent, failed };
}

export type FeedKind = "reminder" | "nag" | "checkin" | "digest" | "receipt" | "telegram.in" | "telegram.out" | "alert" | "test";

export async function logFeed(item: { kind: FeedKind; title: string; body?: string | null; channel?: string; taskId?: string | null; meta?: Prisma.InputJsonObject; at?: Date }) {
  await db.feedItem.create({ data: { kind: item.kind, title: item.title.slice(0, 500), body: item.body?.slice(0, 4000) ?? null, channel: item.channel, taskId: item.taskId ?? null, meta: item.meta ?? {}, ...(item.at ? { at: item.at } : {}) } }).catch(() => {});
}

const appLink = (url?: string) => (url && process.env.APP_URL ? `\n${process.env.APP_URL.replace(/\/$/, "")}${url}` : "");

/**
 * Push first; Telegram if no device got it, or always when `alsoTelegram`. Logged to the
 * Feed as `kind`. Returns which channel(s) delivered.
 */
export async function notify(payload: PushPayload, opts: { kind?: FeedKind; alsoTelegram?: boolean; telegramPrefix?: string } = {}): Promise<string> {
  const { sent } = await pushToAll(payload);
  let tg = false;
  if (sent === 0 || opts.alsoTelegram) {
    tg = await sendTelegram(`${opts.telegramPrefix ?? "⏰"} ${payload.title}${payload.body ? `\n${payload.body}` : ""}${appLink(payload.url)}`);
  }
  const channel = sent > 0 && tg ? "push+telegram" : sent > 0 ? "push" : tg ? "telegram" : "none";
  await logFeed({ kind: opts.kind ?? "reminder", title: payload.title, body: payload.body, channel, taskId: payload.taskId });
  return channel;
}
