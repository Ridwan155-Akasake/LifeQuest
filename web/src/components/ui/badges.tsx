import { relativeDue } from "@/lib/dates";
import { cn } from "@/lib/cn";

/** Token key → utility classes. Literal class names so Tailwind can see them. */
export const TONE: Record<string, string> = {
  accent: "bg-accent/15 text-accent",
  live: "bg-live/15 text-live",
  warn: "bg-warn/15 text-warn",
  stop: "bg-stop/15 text-stop",
  info: "bg-info/15 text-info",
};

const PRIORITY: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Urgent", cls: "text-stop" },
  high: { label: "High", cls: "text-warn" },
  medium: { label: "Med", cls: "text-fg-muted" },
  low: { label: "Low", cls: "text-fg-faint" },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITY[priority] ?? PRIORITY.medium!;
  return <span className={cn("font-mono text-[11px]", p.cls)}>{p.label}</span>;
}

export function DueLabel({ dueOn, today, closed }: { dueOn: string; today: string; closed?: boolean }) {
  const r = relativeDue(dueOn, today);
  return (
    <span className={cn("font-mono text-[11px]", closed ? "text-fg-faint" : r.tone === "stop" ? "text-stop" : r.tone === "warn" ? "text-warn" : "text-fg-faint")}>
      {r.label}
    </span>
  );
}

export function Chip({ tone = "accent", children }: { tone?: string; children: React.ReactNode }) {
  return <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px]", TONE[tone] ?? TONE.accent)}>{children}</span>;
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2" title={`${done} of ${total} steps`}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-fg-faint">
        {done}/{total}
      </span>
    </div>
  );
}
