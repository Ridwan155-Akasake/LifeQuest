"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-btn px-3 py-1.5 text-sm transition",
        active ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
