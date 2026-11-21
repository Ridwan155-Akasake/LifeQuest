import Link from "next/link";

import { logoutAction } from "@/app/login/actions";
import { requireOwner } from "@/lib/auth";
import { listBoards } from "@/lib/work";
import { NavLink } from "@/components/ui/nav-link";

export const dynamic = "force-dynamic";

/** Owner-only shell: sidebar on desktop, top bar on phones. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  const boards = await listBoards();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-line bg-base-2 md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Link href="/" className="font-mono text-xs uppercase tracking-widest text-accent">
            Ridwan · HQ
          </Link>
          <form action={logoutAction} className="md:hidden">
            <button className="text-xs text-fg-faint hover:text-fg">Sign out</button>
          </form>
        </div>
        <nav className="scroll-thin flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:pb-0" aria-label="Main">
          <NavLink href="/">Today</NavLink>
          <p className="hidden px-3 pt-4 pb-1 font-mono text-[10px] uppercase tracking-widest text-fg-faint md:block">Boards</p>
          {boards.map((b) => (
            <NavLink key={b.slug} href={`/board/${b.slug}`}>
              {b.name}
            </NavLink>
          ))}
          <p className="hidden px-3 pt-4 pb-1 font-mono text-[10px] uppercase tracking-widest text-fg-faint md:block">Coming next</p>
          <span className="hidden px-3 py-1.5 text-sm text-fg-faint md:block">Daily logs</span>
          <span className="hidden px-3 py-1.5 text-sm text-fg-faint md:block">People (CRM)</span>
        </nav>
        <form action={logoutAction} className="absolute bottom-4 left-4 hidden md:block">
          <button className="text-xs text-fg-faint hover:text-fg">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
