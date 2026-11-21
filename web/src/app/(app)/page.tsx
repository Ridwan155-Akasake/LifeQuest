import { CheckToggle } from "@/components/today/toggles";
import { AddHabit } from "@/components/today/add-habit";
import { TaskRow } from "@/components/today/task-row";
import { DueLabel } from "@/components/ui/badges";
import { recurrenceLabel } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { getToday, type TodayItem } from "@/lib/work";

export const metadata = { title: "Today" };

/**
 * Today — the one screen to check. Order matters for an ADHD brain: what's already late,
 * what's due now, what's been dumped in the inbox and needs a date, then a peek at the week.
 * Habits sit on the side; "done today" sits at the bottom as proof of progress.
 */
export default async function TodayPage() {
  const d = await getToday();
  const dateLabel = new Date(`${d.today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const habitsDue = d.habits.filter((h) => h.dueToday);
  const nowCount = d.overdue.length + d.dueToday.length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-faint">{dateLabel}</p>
        <h1 className="mt-1 text-3xl font-semibold">{nowCount === 0 ? "Nothing urgent. Breathe." : `${nowCount} thing${nowCount === 1 ? "" : "s"} need${nowCount === 1 ? "s" : ""} you today`}</h1>
        <p className="mt-1 font-mono text-[11px] text-fg-faint">
          {d.overdue.length} overdue · {d.dueToday.length} today · {d.inbox.length} in inbox · {d.done.length} done today
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {d.overdue.length > 0 && <Section title="Overdue" tone="stop" items={d.overdue} today={d.today} />}
          <Section title="Today" items={d.dueToday} today={d.today} empty="Nothing due today." />
          <Section title="Inbox" hint="No date yet. Give each one a day." items={d.inbox} today={d.today} schedule empty="Inbox zero. Anything new goes in the box above." />
          <Section title="Next 7 days" items={d.upcoming} today={d.today} empty="Clear week ahead." muted />
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <section>
            <h2 className="mb-3 flex items-baseline justify-between text-lg font-semibold">
              Habits <span className="font-mono text-[11px] font-normal text-fg-faint">{habitsDue.filter((h) => h.doneToday).length}/{habitsDue.length} today</span>
            </h2>
            {d.habits.length === 0 ? (
              <p className="text-sm text-fg-faint">No habits yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
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
                    <p className="mt-0.5 pl-8 font-mono text-[10px] text-fg-faint">{recurrenceLabel(h.recurrence ?? "daily")}</p>
                  </li>
                ))}
              </ul>
            )}
            <AddHabit />
          </section>

          {d.followUps.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Follow up with</h2>
              <ul className="flex flex-col gap-2">
                {d.followUps.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-btn border border-line bg-base-2 px-3 py-2">
                    <span className="min-w-0 truncate">
                      {c.name}
                      {c.company && <span className="text-fg-faint"> · {c.company}</span>}
                    </span>
                    <DueLabel dueOn={c.nextFollowUpOn} today={d.today} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {d.done.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-live">Done today ✓</h2>
              <ul className="flex flex-col gap-1">
                {d.done.map((t) => (
                  <li key={t.id} className="truncate text-sm text-fg-muted">
                    ✓ {t.title}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, hint, items, today, empty, tone, schedule, muted }: { title: string; hint?: string; items: TodayItem[]; today: string; empty?: string; tone?: "stop"; schedule?: boolean; muted?: boolean }) {
  return (
    <section className={cn(muted && "opacity-80")}>
      <h2 className={cn("mb-1 flex items-baseline gap-2 text-lg font-semibold", tone === "stop" && "text-stop")}>
        {title} <span className="font-mono text-[11px] font-normal text-fg-faint">{items.length}</span>
      </h2>
      {hint && items.length > 0 && <p className="mb-2 text-xs text-fg-faint">{hint}</p>}
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-fg-faint">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((t) => (
            <TaskRow key={t.id} item={t} today={today} showSchedule={schedule} />
          ))}
        </ul>
      )}
    </section>
  );
}
