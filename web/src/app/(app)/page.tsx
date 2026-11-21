import Link from "next/link";

import { CheckToggle } from "@/components/today/toggles";
import { AddHabit } from "@/components/today/add-habit";
import { DueLabel, Progress } from "@/components/ui/badges";
import { cn } from "@/lib/cn";
import { getToday } from "@/lib/work";

export const metadata = { title: "Today" };

const RECURRENCE_LABEL: Record<string, string> = { daily: "Every day", weekdays: "Weekdays" };

/** Today — the daily home screen: stats, the one thing, focus quests, due, habits, follow-ups. */
export default async function TodayPage() {
  const d = await getToday();
  const habitsDue = d.habits.filter((h) => h.dueToday);
  const habitsDone = habitsDue.filter((h) => h.doneToday).length;
  const dateLabel = new Date(`${d.today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-faint">{dateLabel}</p>
        <h1 className="mt-1 text-3xl font-semibold">{d.todayLog?.oneThing ? d.todayLog.oneThing : "What's the one thing today?"}</h1>
        {d.todayLog?.oneWord && <p className="mt-1 text-fg-muted">Word of the day: {d.todayLog.oneWord}</p>}
      </header>

      {/* Stats — level/XP/streak are recomputed from the Activity ledger on every load. */}
      <section aria-label="Progress" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Level" value={String(d.stats.level)}>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent" style={{ width: `${Math.round((d.stats.intoLevel / d.stats.levelSpan) * 100)}%` }} />
          </div>
          <p className="mt-1 font-mono text-[10px] text-fg-faint">{d.stats.toNext} XP to L{d.stats.level + 1}</p>
        </Stat>
        <Stat label="Total XP" value={d.stats.totalXp.toLocaleString()} sub={`+${d.stats.xpToday} today`} />
        <Stat label="Streak" value={`${d.stats.current}d`} sub={d.stats.aliveToday ? "🔥 alive today" : d.stats.current ? "Do one thing to keep it" : "Start one today"} />
        <Stat label="Habits" value={`${habitsDone}/${habitsDue.length}`} sub="due today" />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Panel title="Weekly focus" empty="No focus quests. Star a quest (weekly_focus: true in the vault) to pin it here.">
            {d.focus.map((q) => (
              <li key={q.id}>
                <Link href={`/task/${q.id}`} className="block rounded-btn border border-line bg-base-2 p-3 transition hover:border-line-strong">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{q.title}</span>
                    {q.areaName && <span className="shrink-0 font-mono text-[11px] text-fg-faint">{q.areaName}</span>}
                  </div>
                  {q.stepCount > 0 && (
                    <div className="mt-2">
                      <Progress done={q.stepDone} total={q.stepCount} />
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </Panel>

          <Panel title="Due & overdue" empty="Nothing due. Nice.">
            {d.due.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-btn border border-line bg-base-2 px-3 py-2">
                <Link href={`/task/${t.quest?.id ?? t.id}`} className="min-w-0 hover:text-accent">
                  <span className="block truncate">{t.title}</span>
                  {t.quest && <span className="block truncate font-mono text-[11px] text-fg-faint">{t.quest.title}</span>}
                </Link>
                <DueLabel dueOn={t.dueOn} today={d.today} />
              </li>
            ))}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <Panel title="Habits" empty="No habits yet — add one below." footer={<AddHabit />}>
            {d.habits.map((h) => (
              <li key={h.id} className={cn("rounded-btn border border-line bg-base-2 px-3 py-2", !h.dueToday && "opacity-50")}>
                <div className="flex items-center gap-3">
                  {h.dueToday ? <CheckToggle id={h.id} kind="habit" checked={h.doneToday} label={h.title} xp={h.xp} /> : <span className="h-5 w-5" />}
                  <span className="min-w-0 flex-1 truncate">{h.title}</span>
                  <span className="flex gap-0.5" aria-label="Last 7 days">
                    {h.last7.map((x) => (
                      <span key={x.day} title={x.day} className={cn("h-2.5 w-2.5 rounded-sm", x.done ? "bg-live" : x.due ? "bg-line-strong" : "bg-line")} />
                    ))}
                  </span>
                </div>
                <p className="mt-0.5 pl-8 font-mono text-[10px] text-fg-faint">
                  {RECURRENCE_LABEL[h.recurrence ?? "daily"] ?? h.recurrence?.replace("weekly:", "")} · +{h.xp} XP
                </p>
              </li>
            ))}
          </Panel>

          <Panel title="Follow up with" empty="No follow-ups due.">
            {d.followUps.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-btn border border-line bg-base-2 px-3 py-2">
                <span className="min-w-0 truncate">
                  {c.name}
                  {c.company && <span className="text-fg-faint"> · {c.company}</span>}
                </span>
                <DueLabel dueOn={c.nextFollowUpOn} today={d.today} />
              </li>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-base-2 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[10px] text-fg-faint">{sub}</p>}
      {children}
    </div>
  );
}

function Panel({ title, empty, children, footer }: { title: string; empty: string; children: React.ReactNode[]; footer?: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children.length ? <ul className="flex flex-col gap-2">{children}</ul> : <p className="text-sm text-fg-faint">{empty}</p>}
      {footer}
    </section>
  );
}
