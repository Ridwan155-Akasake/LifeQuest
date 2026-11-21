import { TaskRow } from "@/components/today/task-row";
import { addDays } from "@/lib/dates";
import { getAllOpen, type TodayItem } from "@/lib/work";

export const metadata = { title: "All tasks" };

/** Everything open, grouped by when — so a task due in 3 weeks is never out of sight. */
export default async function AllTasksPage() {
  const { today, items } = await getAllOpen();
  const week = addDays(today, 7);
  const month = addDays(today, 30);

  const groups: [string, TodayItem[]][] = [
    ["Overdue", items.filter((t) => t.dueOn && t.dueOn < today)],
    ["Today", items.filter((t) => t.dueOn === today)],
    ["Next 7 days", items.filter((t) => t.dueOn && t.dueOn > today && t.dueOn <= week)],
    ["Next 30 days", items.filter((t) => t.dueOn && t.dueOn > week && t.dueOn <= month)],
    ["Later", items.filter((t) => t.dueOn && t.dueOn > month)],
    ["No date", items.filter((t) => !t.dueOn)],
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold">All tasks</h1>
        <p className="mt-1 font-mono text-[11px] text-fg-faint">{items.length} open · repeating tasks show their next date</p>
      </header>
      {items.length === 0 && <p className="text-fg-faint">Nothing open. Add something in the box above.</p>}
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([title, list]) => (
          <section key={title}>
            <h2 className={title === "Overdue" ? "mb-2 text-lg font-semibold text-stop" : "mb-2 text-lg font-semibold"}>
              {title} <span className="font-mono text-[11px] font-normal text-fg-faint">{list.length}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {list.map((t) => (
                <TaskRow key={t.id} item={t} today={today} showSchedule={!t.dueOn && !t.parent} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
