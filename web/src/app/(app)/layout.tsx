import Link from "next/link";

import { logoutAction } from "@/app/login/actions";
import { requireOwner } from "@/lib/auth";
import { formatClock } from "@/lib/dates";
import { getPlayer } from "@/lib/play";
import { getScope } from "@/lib/scope";
import { listBoards } from "@/lib/work";
import { CaptureBar } from "@/components/capture/capture-bar";
import { PlayProvider } from "@/components/play/play-provider";
import { SideNav, TabBar } from "@/components/shell/nav";
import { SpaceSwitcher } from "@/components/shell/space-switcher";

export const dynamic = "force-dynamic";

/**
 * Owner-only shell. Phone: space switcher on top, tab bar (Now / Plan / Feed / Me) at the
 * bottom. Desktop: sidebar. The PlayProvider (focus timer + rewards) wraps every page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  const [boards, scope, player] = await Promise.all([listBoards(), getScope(), getPlayer()]);
  const spaces = scope.spaces.map(({ slug, name, color }) => ({ slug, name, color }));
  const resting = scope.resting.map(({ slug, name, color }) => ({ slug, name, color }));

  return (
    <PlayProvider sound={scope.settings.sound} level={player.level}>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <aside className="hidden border-r border-line bg-base-2 md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:px-3 md:py-5">
          <Link href="/" className="px-3 pb-6 font-display text-xl font-extrabold tracking-tight">
            HQ<span className="text-accent">.</span>
          </Link>
          {/* Simple-tracker scope: the job-hunt board is parked (data kept, just not in the menu). */}
          <SideNav boards={boards.filter((b) => b.kind !== "jobs")} />
          <form action={logoutAction} className="mt-auto px-3">
            <button className="text-xs text-fg-faint hover:text-fg">Sign out</button>
          </form>
        </aside>
        <main className="min-w-0 flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28 md:px-8 md:pt-6 md:pb-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-3">
            <div className="flex items-center gap-3">
              <Link href="/" className="font-display text-lg font-extrabold md:hidden" aria-label="HQ home">
                HQ<span className="text-accent">.</span>
              </Link>
              <SpaceSwitcher active={scope.active} spaces={spaces} resting={resting} workStart={formatClock(scope.settings.workHours.start)} />
            </div>
            <CaptureBar spaces={spaces} activeSpace={scope.active} />
          </div>
          {children}
        </main>
        <TabBar />
      </div>
    </PlayProvider>
  );
}
