"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createColumnAction,
  createTaskAction,
  deleteColumnAction,
  moveTaskAction,
  reorderColumnsAction,
  updateColumnAction,
} from "@/lib/actions";
import { cn } from "@/lib/cn";
import { CATEGORIES, CATEGORY_LABEL, isClosed, type Category, type TaskKind } from "@/lib/domain";
import type { BoardView, CardView, ColumnView } from "@/lib/work";
import { Chip, DueLabel, PriorityBadge, Progress } from "@/components/ui/badges";

/**
 * Kanban board — ported from ARCNIR components/dashboard/work/task-board.tsx.
 *
 * Cards: drag to move (status follows the column's MEANING, on the server); a "Move to"
 * select so moving also works by keyboard and on a phone; click to open the quest.
 * Columns: add, rename, change meaning, move left/right, delete (cards move to a column
 * with the same meaning — nothing is lost).
 *
 * Optimistic: cards move immediately; if the server refuses, the board snaps back and
 * says why.
 */
export function TaskBoard({ board, today }: { board: BoardView; today: string }) {
  const router = useRouter();
  const [columns, setColumns] = useState(board.columns);
  const [prev, setPrev] = useState(board.columns);
  if (prev !== board.columns) {
    // Server sent fresh data (after router.refresh) — adopt it.
    setPrev(board.columns);
    setColumns(board.columns);
  }
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const cardKind: TaskKind = board.kind === "quests" ? "quest" : board.kind === "jobs" ? "job" : "task";

  function move(taskId: string, toColumnId: string, index?: number) {
    const from = columns.find((c) => c.cards.some((t) => t.id === taskId));
    const card = from?.cards.find((t) => t.id === taskId);
    const target = columns.find((c) => c.id === toColumnId);
    if (!from || !card || !target) return;
    if (from.id === toColumnId && index === undefined) return;
    const snapshot = columns;

    setColumns((cols) =>
      cols.map((c) => {
        let cards = c.cards.filter((t) => t.id !== taskId);
        if (c.id === toColumnId) {
          const at = Math.min(index ?? cards.length, cards.length);
          cards = [...cards.slice(0, at), { ...card, status: target.category, columnId: toColumnId }, ...cards.slice(at)];
        }
        return { ...c, cards };
      }),
    );

    start(async () => {
      const res = await moveTaskAction(taskId, toColumnId, index);
      if (!res.ok) {
        setColumns(snapshot);
        setError(`Couldn't move it: ${res.error}`);
        return;
      }
      setError("");
      router.refresh();
    });
  }

  function dropIndex(e: React.DragEvent, col: ColumnView): number {
    const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-card-id]")).filter((el) => el.dataset.cardId !== dragId);
    const i = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    return i === -1 ? col.cards.filter((t) => t.id !== dragId).length : i;
  }

  return (
    <div aria-busy={busy}>
      {error && (
        <p role="alert" className="mb-3 rounded-btn border border-stop/30 bg-stop/10 px-3 py-2 text-sm text-stop">
          {error}
        </p>
      )}
      <div className="scroll-thin -mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        <div className="flex min-w-max items-start gap-4">
          {columns.map((col, idx) => {
            const over = col.wipLimit != null && col.cards.length > col.wipLimit;
            return (
              <section
                key={col.id}
                aria-label={`${col.title} — ${col.cards.length} cards`}
                className={cn("flex w-72 shrink-0 flex-col rounded-card border bg-base-2 transition-colors", overCol === col.id ? "border-accent" : "border-line")}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setOverCol(col.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverCol(null);
                  if (dragId) move(dragId, col.id, dropIndex(e, col));
                  setDragId(null);
                }}
              >
                <ColumnHeader col={col} boardId={board.id} columns={columns} isFirst={idx === 0} isLast={idx === columns.length - 1} overLimit={over} />
                <ol className="flex min-h-24 flex-col gap-2 p-2">
                  {col.cards.map((t) => (
                    <li key={t.id}>
                      <Card
                        card={t}
                        today={today}
                        columns={columns}
                        dragging={dragId === t.id}
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                        onMove={(cid) => move(t.id, cid)}
                      />
                    </li>
                  ))}
                  {col.cards.length === 0 && <li className="rounded-btn border border-dashed border-line px-3 py-6 text-center text-xs text-fg-faint">Empty</li>}
                </ol>
                <QuickAdd columnId={col.id} kind={cardKind} />
              </section>
            );
          })}
          <AddColumn boardId={board.id} />
        </div>
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function Card({
  card,
  today,
  columns,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: CardView;
  today: string;
  columns: ColumnView[];
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (columnId: string) => void;
}) {
  const closed = isClosed(card.status);
  return (
    <article
      data-card-id={card.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn("group rounded-btn border border-line bg-base p-3 transition hover:border-line-strong active:cursor-grabbing", dragging && "opacity-40")}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/task/${card.id}`} className="text-sm font-medium text-fg hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
          <span className={cn(closed && "text-fg-muted line-through decoration-fg-faint")}>{card.title}</span>
        </Link>
        {card.weeklyFocus && (
          <span title="Weekly focus" className="text-warn">
            ★
          </span>
        )}
      </div>
      {(card.areaName || card.company) && <p className="mt-1 truncate font-mono text-[11px] text-fg-faint">{card.company ?? card.areaName}</p>}
      {card.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <Chip key={l.id} tone={l.color}>
              {l.name}
            </Chip>
          ))}
        </div>
      )}
      {card.stepCount > 0 && (
        <div className="mt-2.5">
          <Progress done={card.stepDone} total={card.stepCount} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-3">
        <PriorityBadge priority={card.priority} />
        {card.dueOn && <DueLabel dueOn={card.dueOn} today={today} closed={closed} />}
      </div>
      <label className="mt-2 block">
        <span className="sr-only">Move “{card.title}” to</span>
        <select
          value={card.columnId ?? ""}
          onChange={(e) => onMove(e.target.value)}
          className="w-full rounded-btn border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] text-fg-faint opacity-60 transition hover:border-line focus:border-accent focus:opacity-100 group-hover:opacity-100"
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id === card.columnId ? `In ${c.title}` : `Move to ${c.title}`}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

// ── Column header + management ───────────────────────────────────────────────

function ColumnHeader({ col, boardId, columns, isFirst, isLast, overLimit }: { col: ColumnView; boardId: string; columns: ColumnView[]; isFirst: boolean; isLast: boolean; overLimit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(col.title);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) alert(res.error);
      setOpen(false);
      router.refresh();
    });

  const reorder = (dir: -1 | 1) => {
    const ids = columns.map((c) => c.id);
    const i = ids.indexOf(col.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    run(() => reorderColumnsAction(boardId, ids));
  };

  return (
    <header className="relative flex items-center justify-between gap-2 border-b border-line px-3 py-2">
      {renaming ? (
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setRenaming(false);
            const t = title.trim();
            if (t && t !== col.title) run(() => updateColumnAction(col.id, { title: t }));
          }}
        >
          <input
            aria-label="Column name"
            autoFocus
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
            className="w-full rounded-btn border border-line-strong bg-base px-2 py-1 text-sm outline-none focus:border-accent"
          />
        </form>
      ) : (
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{col.title}</h2>
          {col.title.toLowerCase() !== CATEGORY_LABEL[col.category].toLowerCase() && <p className="font-mono text-[10px] text-fg-faint">means {CATEGORY_LABEL[col.category]}</p>}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <span className={cn("font-mono text-[11px]", overLimit ? "text-stop" : "text-fg-faint")} title={col.wipLimit ? `WIP limit ${col.wipLimit}` : undefined}>
          {pending ? "…" : col.cards.length}
          {col.wipLimit ? `/${col.wipLimit}` : ""}
        </span>
        <button type="button" aria-label={`Column ${col.title} options`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded px-1.5 text-fg-faint hover:bg-surface hover:text-fg">
          ⋯
        </button>
      </div>
      {open && (
        <div role="menu" className="absolute right-2 top-10 z-20 w-52 rounded-btn border border-line-strong bg-surface p-1 text-sm shadow-xl">
          <MenuItem onClick={() => { setOpen(false); setTitle(col.title); setRenaming(true); }}>Rename</MenuItem>
          <p className="px-2 pt-2 pb-1 font-mono text-[10px] uppercase tracking-wider text-fg-faint">This column means</p>
          {CATEGORIES.map((c) => (
            <MenuItem key={c} onClick={() => c !== col.category && run(() => updateColumnAction(col.id, { category: c }))}>
              {c === col.category ? "✓ " : ""}
              {CATEGORY_LABEL[c]}
            </MenuItem>
          ))}
          <hr className="my-1 border-line" />
          <MenuItem disabled={isFirst} onClick={() => reorder(-1)}>Move left</MenuItem>
          <MenuItem disabled={isLast} onClick={() => reorder(1)}>Move right</MenuItem>
          <hr className="my-1 border-line" />
          <MenuItem
            danger
            disabled={columns.length <= 1}
            onClick={() => {
              const msg = col.cards.length ? `Delete “${col.title}”? Its ${col.cards.length} card(s) move to another column with the same meaning.` : `Delete “${col.title}”?`;
              if (confirm(msg)) run(() => deleteColumnAction(col.id));
            }}
          >
            Delete column…
          </MenuItem>
        </div>
      )}
    </header>
  );
}

function MenuItem({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={cn("block w-full rounded px-2 py-1.5 text-left transition hover:bg-base disabled:opacity-40", danger ? "text-stop" : "text-fg")}>
      {children}
    </button>
  );
}

// ── Adding ───────────────────────────────────────────────────────────────────

function QuickAdd({ columnId, kind }: { columnId: string; kind: TaskKind }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="m-2 mt-0 rounded-btn px-3 py-2 text-left text-sm text-fg-faint transition hover:bg-surface hover:text-fg">
        + Add {kind}
      </button>
    );
  }
  return (
    <form
      className="m-2 mt-0 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        start(async () => {
          const res = await createTaskAction({ title: t, kind, columnId });
          if (!res.ok) return alert(res.error);
          setTitle("");
          router.refresh();
        });
      }}
    >
      <input
        aria-label="Title"
        autoFocus
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder={kind === "quest" ? "Quest title…" : kind === "job" ? "Role @ Company…" : "Task title…"}
        className="h-9 rounded-btn border border-line-strong bg-base px-2.5 text-sm outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-btn bg-accent px-3 py-1 text-sm font-semibold text-ink disabled:opacity-60">
          {pending ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-fg-muted hover:text-fg">
          Done
        </button>
      </div>
    </form>
  );
}

function AddColumn({ boardId }: { boardId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("in-progress");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-60 shrink-0 items-center justify-center rounded-card border border-dashed border-line-strong px-4 py-6 text-sm text-fg-muted transition hover:border-accent hover:text-fg">
        + Add column
      </button>
    );
  }
  return (
    <form
      className="flex w-72 shrink-0 flex-col gap-3 rounded-card border border-line bg-base-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createColumnAction(boardId, { title, category });
          if (!res.ok) return alert(res.error);
          setTitle("");
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Column name</span>
        <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Waiting on someone" className="h-9 rounded-btn border border-line-strong bg-base px-2.5 text-sm outline-none focus:border-accent" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Cards here are</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="h-9 rounded-btn border border-line-strong bg-base px-2.5 text-sm outline-none focus:border-accent">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-btn bg-accent px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60">
          {pending ? "Adding…" : "Add column"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-fg-muted hover:text-fg">
          Cancel
        </button>
      </div>
    </form>
  );
}
