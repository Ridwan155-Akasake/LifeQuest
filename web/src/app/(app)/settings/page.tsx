import { PushSettings } from "@/components/notifications/push-settings";
import { db } from "@/lib/db";
import { vapidPublicKey } from "@/lib/push";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const devices = await db.pushSubscription.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, device: true, createdAt: true, lastOkAt: true, failCount: true } });
  const telegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const digest = process.env.DIGEST_TIME || "08:00";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <section className="rounded-card border border-line p-5">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">
          Tasks with a time (“call dentist at 3pm”, “in 20 min”) ping you at that time with Done and Snooze buttons. Every morning at {digest} you get a summary of the day.
        </p>
        <PushSettings vapidKey={vapidPublicKey()} />
      </section>

      <section className="rounded-card border border-line p-5">
        <h2 className="text-lg font-semibold">Devices receiving notifications</h2>
        {devices.length === 0 ? (
          <p className="mt-2 text-sm text-fg-faint">None yet. Open HQ on your phone and tap “Turn on notifications”.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-btn border border-line bg-base-2 px-3 py-2 text-sm">
                <span>{d.device ?? "Unknown device"}</span>
                <span className="font-mono text-[11px] text-fg-faint">
                  {d.failCount > 0 ? <span className="text-warn">{d.failCount} failed · </span> : null}
                  {d.lastOkAt ? `last ok ${d.lastOkAt.toISOString().slice(0, 10)}` : `added ${d.createdAt.toISOString().slice(0, 10)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-fg-muted">
          Telegram fallback:{" "}
          {telegram ? <span className="text-live">on</span> : <span className="text-fg-faint">off</span>}
          <span className="text-fg-faint"> (used only when no device receives a reminder)</span>
        </p>
      </section>

      <section className="rounded-card border border-line p-5">
        <h2 className="text-lg font-semibold">Install on your phone</h2>
        <ol className="mt-2 list-decimal pl-5 text-sm text-fg-muted">
          <li>Open hq.ridwansharif.com in Chrome on Android.</li>
          <li>Tap ⋮ → <b>Install app</b> (or “Add to Home screen”).</li>
          <li>Open HQ from the new icon and turn on notifications above.</li>
        </ol>
        <p className="mt-2 text-xs text-fg-faint">Long-press the HQ icon for “Add a task” and “All tasks” shortcuts. A home-screen widget comes with the Android app later.</p>
      </section>
    </div>
  );
}
