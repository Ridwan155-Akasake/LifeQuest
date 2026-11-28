import { SpaceTag } from "@/components/views/shared";
import { relativeDue, todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { getFeed, type FeedEntry } from "@/lib/play";
import { getScope, inScope } from "@/lib/scope";

export const metadata = { title: "Feed" };

const DOT: Record<string, string> = { "boss.defeated": "bg-stop", "focus.ended": "bg-info", "task.created": "bg-fg-faint", "digest.sent": "bg-warn", "vault.imported": "bg-fg-faint" };

/**
 * Everything that happened, newest first. Today: what you finished, focused on, added.
 * Telegram chats (both ways), reminders and alerts join this list in phase R5.
 */
export default async function FeedPage() {
  const scope = await getScope();
  const feed = await getFeed(inScope(scope), 150);
  const today = todayISO();
  const days = feed.reduce<[string, FeedEntry[]][]>((acc, f) => {
    const last = acc[acc.length - 1];
    if (last && last[0] === f.day) last[1].push(f);
    else acc.push([f.day, [f]]);
    return acc;
  }, []);
  const label = (d: string) => (d === today ? "Today" : relativeDue(d, today).label === "1d overdue" ? "Yesterday" : new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }));

  return (
    <div className="mx-auto mt-4 flex max-w-2xl flex-col gap-8">
      <header>
        <h1 className="font-display text-4xl font-extrabold">Feed</h1>
        <p className="mt-1 text-sm text-fg-muted">What you finished, focused on and added. Telegram messages, reminders and alerts will show here too.</p>
      </header>
      {days.length === 0 && <p className="text-fg-faint">Nothing yet. Finish something and it lands here.</p>}
      {days.map(([day, items]) => (
        <section key={day}>
          <h2 className="mb-2 font-mono text-[11px] tracking-widest text-fg-faint uppercase">{label(day)}</h2>
          <ul className="flex flex-col">
            {items.map((f) => (
              <li key={f.id} className="flex gap-3 border-b border-line py-2.5">
                <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", DOT[f.type] ?? "bg-live")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p>{f.text}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-faint">
                    {f.time}
                    {f.xp > 0 && <span className="text-accent">+{f.xp} XP</span>}
                    <SpaceTag space={f.space} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
