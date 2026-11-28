import Link from "next/link";

import { SpaceTag } from "@/components/views/shared";
import { addDays, todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { getFeed, type FeedEntry, type FeedGroup } from "@/lib/play";
import { getScope, inScope } from "@/lib/scope";

export const metadata = { title: "Feed" };

const FILTERS: { key: FeedGroup | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "done", label: "Done" },
  { key: "reminders", label: "Reminders" },
  { key: "telegram", label: "Telegram" },
  { key: "other", label: "Other" },
];

const DOT: Record<string, string> = {
  "boss.defeated": "bg-stop",
  "focus.ended": "bg-info",
  "task.created": "bg-fg-faint",
  reminder: "bg-accent",
  nag: "bg-ember",
  checkin: "bg-info",
  digest: "bg-warn",
  receipt: "bg-live",
  "telegram.in": "bg-sp-sky",
  "telegram.out": "bg-sp-violet",
  alert: "bg-stop",
};

const CHANNEL: Record<string, string> = { push: "phone", telegram: "Telegram", "push+telegram": "phone + Telegram", none: "not delivered", "in-app": "in app" };

/**
 * Everything that happened, newest first: what you did, and what HQ said or heard —
 * reminders and nudges (and where they reached you), check-ins, digests, Telegram.
 */
export default async function FeedPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const filter = FILTERS.some((x) => x.key === f) ? (f as FeedGroup | "all") : "all";
  const scope = await getScope();
  const feed = await getFeed(inScope(scope), 150, undefined, filter === "all" ? undefined : filter);
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const days = feed.reduce<[string, FeedEntry[]][]>((acc, e) => {
    const last = acc[acc.length - 1];
    if (last && last[0] === e.day) last[1].push(e);
    else acc.push([e.day, [e]]);
    return acc;
  }, []);
  const label = (d: string) => (d === today ? "Today" : d === yesterday ? "Yesterday" : new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }));

  return (
    <div className="mx-auto mt-4 flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-display text-4xl font-extrabold">Feed</h1>
        <p className="mt-1 text-sm text-fg-muted">What you did, and every reminder, nudge and Telegram message HQ sent or got.</p>
      </header>
      <nav className="no-scrollbar flex gap-1.5 overflow-x-auto" aria-label="Filter the feed">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/feed" : `/feed?f=${x.key}`}
            aria-current={filter === x.key ? "page" : undefined}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold", filter === x.key ? "border-fg bg-fg text-base-2" : "border-line-strong text-fg-muted hover:text-fg")}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {days.length === 0 && <p className="text-fg-faint">Nothing here yet.</p>}
      {days.map(([day, items]) => (
        <section key={day}>
          <h2 className="mb-2 font-mono text-[11px] tracking-widest text-fg-faint uppercase">{label(day)}</h2>
          <ul className="flex flex-col">
            {items.map((e) => (
              <li key={e.id} className={cn("flex gap-3 border-b border-line py-2.5", e.type === "telegram.in" && "pl-6")}>
                <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", DOT[e.type] ?? "bg-live")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="break-words">
                    {e.type === "telegram.in" && <span className="mr-1 font-mono text-[11px] text-sp-sky">you →</span>}
                    {e.type === "telegram.out" && <span className="mr-1 font-mono text-[11px] text-sp-violet">bot →</span>}
                    {e.taskId && e.group !== "telegram" ? (
                      <Link href={`/task/${e.taskId}`} className="hover:text-accent">
                        {e.text}
                      </Link>
                    ) : (
                      e.text
                    )}
                  </p>
                  {e.body && <p className="mt-0.5 text-sm whitespace-pre-line text-fg-muted">{e.body}</p>}
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-faint">
                    {e.time}
                    {e.xp > 0 && <span className="text-accent">+{e.xp} XP</span>}
                    {e.channel && <span className={e.channel === "none" ? "text-stop" : ""}>via {CHANNEL[e.channel] ?? e.channel}</span>}
                    <SpaceTag space={e.space} />
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
