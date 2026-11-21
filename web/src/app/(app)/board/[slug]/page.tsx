import { notFound } from "next/navigation";

import { TaskBoard } from "@/components/board/task-board";
import { todayISO } from "@/lib/dates";
import { getBoard } from "@/lib/work";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

export default async function BoardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; area?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const board = await getBoard(slug, { q: sp.q, areaId: sp.area });
  if (!board) notFound();
  const total = board.columns.reduce((n, c) => n + c.cards.length, 0);
  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg-faint">Board · {total} cards</p>
          <h1 className="text-2xl font-semibold">{board.name}</h1>
        </div>
        <form className="flex gap-2" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Filter by title…" aria-label="Filter cards" className="h-9 w-56 rounded-btn border border-line-strong bg-base-2 px-3 text-sm outline-none focus:border-accent" />
        </form>
      </header>
      <TaskBoard board={board} today={todayISO()} />
    </div>
  );
}
