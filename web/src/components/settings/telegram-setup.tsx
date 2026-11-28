"use client";

import { useState, useTransition } from "react";

import { checkBotAction, clearTelegramAction, findChatIdAction, saveTelegramAction, testTelegramAction } from "@/lib/actions";
import { cn } from "@/lib/cn";

type Status = { source: "settings" | "env" | null; chatId: string | null };

/**
 * Settings → Telegram. Shows what's connected; otherwise walks through making your own
 * bot with @BotFather, finding your chat id, and saving. Works for any HQ user — no server
 * access needed.
 */
export function TelegramSetup({ status }: { status: Status }) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [bot, setBot] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!status.source);
  const say = (text: string, ok: boolean) => setMsg({ text, ok });

  const field = "h-10 w-full rounded-btn border border-line-strong bg-base-2 px-3 font-mono text-sm outline-none focus:border-accent";

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <span className="text-live">● Connected</span>
          <span className="text-fg-muted">
            {" "}
            · {status.source === "env" ? "using the SecondBrain bot (from the server's settings file)" : "using your own bot"} · chat {status.chatId}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await testTelegramAction();
                say(r.ok ? "Sent. Check Telegram." : r.error, r.ok);
              })
            }
            className="rounded-btn border border-line-strong px-3 py-1.5 text-sm hover:border-accent"
          >
            Send a test message
          </button>
          <button type="button" onClick={() => setEditing(true)} className="rounded-btn border border-line-strong px-3 py-1.5 text-sm hover:border-accent">
            Use a different bot
          </button>
          {status.source === "settings" && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await clearTelegramAction();
                  say(r.ok ? "Disconnected." : r.error, r.ok);
                })
              }
              className="rounded-btn px-3 py-1.5 text-sm text-stop hover:bg-stop/10"
            >
              Disconnect
            </button>
          )}
        </div>
        {msg && <p className={cn("text-sm", msg.ok ? "text-live" : "text-stop")}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" aria-busy={pending}>
      <p className="text-sm text-fg-muted">
        Telegram is the backup when you miss a reminder on your phone, and gets a ✅ for everything you finish. Use a bot of your own; it takes about two minutes and is free.
      </p>

      <ol className="flex flex-col gap-5">
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs">1</span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Create the bot</p>
            <p className="mt-1 text-fg-muted">
              In Telegram, open <b className="text-fg">@BotFather</b> (the official one, with the blue tick) and send <code className="rounded bg-surface-2 px-1">/newbot</code>. Give it any name, then a username ending in “bot”, e.g. <i>ridwan_hq_bot</i>. BotFather replies with a token like <code className="rounded bg-surface-2 px-1">123456789:AAH…</code>.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs">2</span>
          <div className="min-w-0 flex-1 text-sm">
            <label htmlFor="tg-token" className="font-semibold">
              Paste the token
            </label>
            <p className="mt-1 mb-2 text-fg-muted">Keep it private: anyone with it can send messages as your bot.</p>
            <div className="flex gap-2">
              <input id="tg-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="123456789:AA…" className={field} />
              <button
                type="button"
                disabled={pending || !token}
                onClick={() =>
                  start(async () => {
                    const r = await checkBotAction(token);
                    if (r.ok) {
                      setBot(r.data!.username);
                      say(`Found @${r.data!.username}.`, true);
                    } else say(r.error, false);
                  })
                }
                className="shrink-0 rounded-btn border border-line-strong px-3 text-sm hover:border-accent disabled:opacity-40"
              >
                Check
              </button>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs">3</span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Say hi to your bot</p>
            <p className="mt-1 mb-2 text-fg-muted">
              Open {bot ? <b className="text-fg">@{bot}</b> : "your new bot"} in Telegram and press <b className="text-fg">Start</b>. Then tap Find me, and HQ looks up your chat id.
            </p>
            <div className="flex gap-2">
              <input id="tg-chat" aria-label="Chat id" inputMode="numeric" value={chatId} onChange={(e) => setChatId(e.target.value.trim())} placeholder="Chat id, e.g. 123456789" className={field} />
              <button
                type="button"
                disabled={pending || !token}
                onClick={() =>
                  start(async () => {
                    const r = await findChatIdAction(token);
                    if (r.ok) {
                      setChatId(r.data!.chatId);
                      say(`Found your chat, ${r.data!.name}.`, true);
                    } else say(r.error, false);
                  })
                }
                className="shrink-0 rounded-btn border border-line-strong px-3 text-sm hover:border-accent disabled:opacity-40"
              >
                Find me
              </button>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-xs">4</span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Connect</p>
            <p className="mt-1 mb-2 text-fg-muted">HQ sends a hello message to prove it works, then saves.</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !token || !chatId}
                onClick={() =>
                  start(async () => {
                    const r = await saveTelegramAction({ token, chatId });
                    if (r.ok) {
                      say("Connected. Check Telegram for the hello.", true);
                      setToken("");
                    } else say(r.error, false);
                  })
                }
                className="rounded-btn bg-accent px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
              >
                Connect Telegram
              </button>
              {status.source && (
                <button type="button" onClick={() => setEditing(false)} className="px-3 text-sm text-fg-faint hover:text-fg">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </li>
      </ol>
      {msg && (
        <p role="status" className={cn("text-sm", msg.ok ? "text-live" : "text-stop")}>
          {msg.text}
        </p>
      )}
      <p className="text-xs text-fg-faint">
        Already have a bot that another program reads (like SecondBrain)? You can still use its token here: HQ only sends with it. “Find me” won’t work for it though, so type your chat id by hand.
      </p>
    </div>
  );
}
