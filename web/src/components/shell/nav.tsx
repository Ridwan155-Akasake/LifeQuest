"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Now", icon: "M12 3v4m0 10v4M3 12h4m10 0h4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" },
  { href: "/tasks", label: "Plan", icon: "M4 6h16M4 12h10M4 18h7" },
  { href: "/feed", label: "Feed", icon: "M5 5h14v10H9l-4 4z" },
  { href: "/me", label: "Me", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Phone: tab bar fixed to the bottom, thumb-reachable. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-base-2/95 px-2 pt-2 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md justify-around">
        {TABS.map((t) => {
          const on = isActive(path, t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 rounded-btn px-4 py-1 text-[11px] font-medium", on ? "text-accent" : "text-fg-faint")}>
                <Icon d={t.icon} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop: the same tabs as a sidebar, plus boards and settings. */
export function SideNav({ boards }: { boards: { slug: string; name: string }[] }) {
  const path = usePathname();
  const item = (href: string, label: string, icon?: string) => {
    const on = isActive(path, href);
    return (
      <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn("flex items-center gap-3 rounded-btn px-3 py-2 text-sm transition", on ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg")}>
        {icon ? <Icon d={icon} /> : <span className="w-[22px]" aria-hidden />}
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {TABS.map((t) => item(t.href, t.label, t.icon))}
      <p className="px-3 pt-5 pb-1 font-mono text-[10px] uppercase tracking-widest text-fg-faint">Boards</p>
      {boards.map((b) => item(`/board/${b.slug}`, b.name))}
      <div className="pt-4">{item("/settings", "Settings", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z")}</div>
    </nav>
  );
}
