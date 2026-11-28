import Link from "next/link";
import { notFound } from "next/navigation";

import { StartDone } from "@/components/play/start-button";
import { CheckToggle, CopyButton } from "@/components/today/toggles";
import { Chip, DueLabel, PriorityBadge, Progress } from "@/components/ui/badges";
import { fromDbDate, recurrenceLabel, todayISO } from "@/lib/dates";
import { CATEGORY_LABEL, isClosed, type Category } from "@/lib/domain";
import { listSpaces } from "@/lib/scope";
import { getTask } from "@/lib/work";
import { AddStep } from "./add-step";
import { TaskEdit } from "./task-edit";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTask((await params).id);
  return { title: t?.title ?? "Not found" };
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, spaces] = await Promise.all([getTask(id), listSpaces()]);
  if (!t) notFound();
  const today = todayISO();
  const done = t.steps.filter((s) => s.status === "done").length;
  const closed = isClosed(t.status);

  const back = t.board
    ? { href: `/board/${t.board.slug}`, label: t.board.name }
    : t.parent
      ? { href: `/task/${t.parent.id}`, label: t.parent.title }
      : { href: "/", label: "Today" };

  return (
    <article className="mx-auto mt-4 max-w-3xl">
      <nav className="mb-4 font-mono text-[11px] text-fg-faint">
        <Link href={back.href} className="hover:text-fg">
          ← {back.label}
        </Link>
      </nav>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="info">{t.kind}</Chip>
          {t.area && <Chip>{t.area.name}</Chip>}
          {t.weeklyFocus && <Chip tone="warn">★ weekly focus</Chip>}
          <span className="font-mono text-[11px] text-fg-faint">{t.column?.title ?? CATEGORY_LABEL[t.status as Category] ?? t.status}</span>
        </div>
        <h1 className={closed ? "mt-3 font-display text-4xl font-extrabold text-fg-muted line-through" : "mt-3 font-display text-4xl font-extrabold"}>{t.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <PriorityBadge priority={t.priority} />
          {t.dueOn && <DueLabel dueOn={fromDbDate(t.dueOn)} today={today} closed={closed} />}
          {t.recurrence && <span className="font-mono text-[11px] text-info">↻ {recurrenceLabel(t.recurrence)}</span>}
          {t.vaultPath && (
            <span className="truncate font-mono text-[11px] text-fg-faint" title="LifeQuest vault source">
              ⇄ {t.vaultPath}
            </span>
          )}
        </div>
        {!closed && t.kind !== "quest" && (
          <StartDone task={{ id: t.id, title: t.title, kind: t.kind === "habit" ? "habit" : t.kind === "step" ? "step" : "task", estimateMin: t.estimateMin, steps: t.steps.map((x) => ({ id: x.id, title: x.title, done: x.status === "done" })) }} />
        )}
        {t.description && <p className="mt-4 whitespace-pre-wrap text-fg-muted">{t.description}</p>}
        {t.kind !== "habit" && <TaskEdit id={t.id} dueOn={t.dueOn ? fromDbDate(t.dueOn) : null} dueTime={t.dueTime} recurrence={t.recurrence} priority={t.priority} backHref={back.href} spaceId={t.spaceId} estimateMin={t.estimateMin} spaces={spaces} />}
      </header>

      {(t.kind === "quest" || t.steps.length > 0) && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Steps</h2>
            <div className="w-40">
              <Progress done={done} total={t.steps.length} />
            </div>
          </div>
          <ol className="flex flex-col gap-2">
            {t.steps.map((s) => (
              <li key={s.id} className="rounded-btn border border-line bg-base-2 p-3">
                <div className="flex items-start gap-3">
                  <CheckToggle id={s.id} kind="step" checked={s.status === "done"} label={s.title} xp={s.xp} />
                  <span className={s.status === "done" ? "text-fg-muted line-through decoration-fg-faint" : ""}>{s.title}</span>
                </div>
                {s.claudePrompt && (
                  <div className="mt-2 ml-8 flex items-start gap-2 rounded-btn border border-accent/20 bg-accent/5 px-3 py-2">
                    <p className="flex-1 text-sm text-fg-muted">
                      <span aria-hidden>💬 </span>
                      <span className="sr-only">Ask Claude: </span>
                      {s.claudePrompt}
                    </p>
                    <CopyButton text={s.claudePrompt} />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <AddStep questId={t.id} />
        </section>
      )}

      {t.activity.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fg-faint">History</h2>
          <ul className="flex flex-col gap-1 font-mono text-[11px] text-fg-faint">
            {t.activity.map((a) => (
              <li key={a.id}>
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {a.type}
                {a.xp ? ` (${a.xp > 0 ? "+" : ""}${a.xp} XP)` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
