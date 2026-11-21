import "server-only";
import webpush from "web-push";

import { db } from "./db";

/**
 * Notification delivery. Web Push to every subscribed device first; Telegram (the old
 * SecondBrain bot's token) as the fallback when no device received it — so a reminder is
 * never silently lost while the phone app is being set up or a subscription has expired.
 *
 * Env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (npm run vapid),
 *      optional TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID for the fallback.
 */

export type PushPayload = {
  title: string;
  body?: string;
  /** In-app path opened on tap. */
  url?: string;
  /** Same tag replaces an older notification instead of stacking (one per task). */
  tag?: string;
  /** Adds Done / Snooze buttons that act on this task. */
  taskId?: string;
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

/** Plain-text Telegram message via the bot API. No-op when not configured. */
export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Push first; Telegram only if no device got it. Returns which channel delivered. */
export async function notify(payload: PushPayload): Promise<"push" | "telegram" | "none"> {
  const { sent } = await pushToAll(payload);
  if (sent > 0) return "push";
  const link = payload.url && process.env.APP_URL ? `\n${process.env.APP_URL.replace(/\/$/, "")}${payload.url}` : "";
  return (await sendTelegram(`⏰ ${payload.title}${payload.body ? `\n${payload.body}` : ""}${link}`)) ? "telegram" : "none";
}
