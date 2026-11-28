import "server-only";

import { db } from "./db";

/**
 * Telegram, per HQ install. The bot can be set in Settings (stored in the DB, so a beta
 * user can bring their own bot without server access) or, as before, in .env
 * (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). Settings wins when both exist.
 *
 * HQ only SENDS with the bot. It never reads the bot's incoming messages, so it can share a
 * token with a bot program (like SecondBrain) that is already reading them.
 */

export type TelegramConfig = { token: string; chatId: string; source: "settings" | "env" };

export async function telegramConfig(): Promise<TelegramConfig | null> {
  const row = await db.setting.findUnique({ where: { key: "telegram" } });
  const v = (row?.value ?? {}) as { token?: string; chatId?: string };
  if (v.token && v.chatId) return { token: v.token, chatId: v.chatId, source: "settings" };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId, source: "env" } : null;
}

export async function saveTelegram(token: string, chatId: string) {
  const value = { token, chatId };
  await db.setting.upsert({ where: { key: "telegram" }, update: { value }, create: { key: "telegram", value } });
}

export async function clearTelegram() {
  await db.setting.deleteMany({ where: { key: "telegram" } });
}

async function call<T>(token: string, method: string, body?: object): Promise<{ ok: boolean; result?: T; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    return (await res.json()) as { ok: boolean; result?: T; description?: string };
  } catch {
    return { ok: false, description: "Couldn't reach Telegram" };
  }
}

/** Plain-text message. Returns false when not configured or Telegram refused. */
export async function sendTelegram(text: string, cfg?: TelegramConfig | null): Promise<boolean> {
  const c = cfg ?? (await telegramConfig());
  if (!c) return false;
  const r = await call(c.token, "sendMessage", { chat_id: c.chatId, text: text.slice(0, 4000), disable_web_page_preview: true });
  return r.ok;
}

/** Check a token and say which bot it is ("@MyHqBot"). */
export async function botName(token: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const r = await call<{ username: string }>(token, "getMe");
  return r.ok && r.result ? { ok: true, username: r.result.username } : { ok: false, error: r.description ?? "Telegram didn't accept that token." };
}

/**
 * Find the chat id of whoever last messaged the bot (the user just sent it /start).
 * Only for a NEW bot nothing else is reading: getUpdates would steal messages from
 * another program polling the same bot.
 */
export async function findChatId(token: string): Promise<{ ok: true; chatId: string; name: string } | { ok: false; error: string }> {
  const r = await call<{ message?: { chat: { id: number; first_name?: string; username?: string } } }[]>(token, "getUpdates", { limit: 20, timeout: 0 });
  if (!r.ok) {
    return { ok: false, error: r.description?.includes("Conflict") ? "Another program is already reading this bot. Use a new bot just for HQ, or type the chat id by hand." : (r.description ?? "Telegram refused.") };
  }
  const last = [...(r.result ?? [])].reverse().find((u) => u.message?.chat);
  if (!last?.message) return { ok: false, error: "No message found. Open your bot in Telegram, press Start (or send “hi”), then try again." };
  const c = last.message.chat;
  return { ok: true, chatId: String(c.id), name: c.first_name ?? c.username ?? "you" };
}
