import { PushSettings } from "@/components/notifications/push-settings";
import { SpacesEditor, ViewPicker, WorkHoursEditor } from "@/components/settings/app-settings";
import { RemindersEditor } from "@/components/settings/reminders";
import { TelegramSetup } from "@/components/settings/telegram-setup";
import { db } from "@/lib/db";
import { vapidPublicKey } from "@/lib/push";
import { getSettings } from "@/lib/scope";
import { telegramConfig } from "@/lib/telegram";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [devices, settings, spaces, tg] = await Promise.all([
    db.pushSubscription.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, device: true, createdAt: true, lastOkAt: true, failCount: true } }),
    getSettings(),
    db.space.findMany({ where: { archivedAt: null }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { _count: { select: { tasks: { where: { archivedAt: null } } } } } }),
    telegramConfig(),
  ]);
  const digest = process.env.DIGEST_TIME || "08:00";

  return (
    <div className="mx-auto mt-4 flex max-w-3xl flex-col gap-8">
      <h1 className="font-display text-4xl font-extrabold">Settings</h1>

      <section className="rounded-card border border-line p-5">
        <h2 className="text-lg font-semibold">Home screen</h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">Same tasks, different look. Switch any time.</p>
        <ViewPicker current={settings.view} />
      </section>

      <section className="rounded-card border border-line p-5">
        <h2 className="text-lg font-semibold">Spaces</h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">Keep personal and work apart. Pick one at the top of any screen, or “All”.</p>
        <SpacesEditor spaces={spaces.map((s) => ({ id: s.id, slug: s.slug, name: s.name, color: s.color, workHoursOnly: s.workHoursOnly, count: s._count.tasks }))} />
      </section>

      <section className="rounded-card border border-line p-5">
        <h2 className="text-lg font-semibold">Work hours</h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">Spaces marked “only during work hours” hide from “All” outside these times, so evenings and weekends stay yours.</p>
        <WorkHoursEditor settings={settings} />
      </section>

      <section className="rounded-card border border-line p-5">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">
          Tasks with a time (“call dentist at 3pm”, “in 20 min”) ping you at that time with Done, Start and Snooze buttons. Every morning at {digest} you get a summary of the day.
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
      </section>

      <section className="rounded-card border border-line p-5">
        <h2 className="text-lg font-semibold">Reminders</h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">How hard HQ pushes when you don’t answer.</p>
        <RemindersEditor value={settings.reminders} telegram={!!tg} />
      </section>

      <section id="telegram" className="rounded-card border border-line p-5">
        <h2 className="mb-3 text-lg font-semibold">Telegram</h2>
        <TelegramSetup status={{ source: tg?.source ?? null, chatId: tg?.chatId ?? null }} />
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
