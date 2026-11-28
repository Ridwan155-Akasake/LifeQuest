"use client";

import { useState, useTransition } from "react";

import { archiveSpaceAction, createSpaceAction, saveSettingsAction, updateSpaceAction } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { SPACE_COLORS, VIEW_LABEL, VIEWS, type Settings, type View } from "@/lib/domain";

/** Settings → View: pick the home screen style. Saves on tap. */
export function ViewPicker({ current }: { current: View }) {
  const [view, setView] = useState(current);
  const [pending, start] = useTransition();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Home screen style">
      {VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          aria-label={`${VIEW_LABEL[v].name}: ${VIEW_LABEL[v].blurb}`}
          disabled={pending}
          onClick={() => {
            setView(v);
            start(async () => void (await saveSettingsAction({ view: v })));
          }}
          className={cn("flex flex-col gap-1 rounded-card border p-4 text-left transition", view === v ? "border-accent bg-accent/10" : "border-line hover:border-line-strong")}
        >
          <span className="flex items-center justify-between font-display text-lg font-bold">
            {VIEW_LABEL[v].name}
            {view === v && <span className="text-sm text-accent">✓</span>}
          </span>
          <span className="text-sm text-fg-muted">{VIEW_LABEL[v].blurb}</span>
        </button>
      ))}
    </div>
  );
}

type SpaceRow = { id: string; slug: string; name: string; color: string; workHoursOnly: boolean; count: number };

function ColorPick({ value, onChange, name }: { value: string; onChange: (c: string) => void; name: string }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label={`${name} colour`}>
      {SPACE_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} data-space-color={c} onClick={() => onChange(c)} className={cn("space-dot h-6 w-6 rounded-full ring-offset-2 ring-offset-base", value === c && "ring-2 ring-fg")} />
      ))}
    </div>
  );
}

/** Settings → Spaces: rename, recolour, "only during work hours", add, remove. */
export function SpacesEditor({ spaces }: { spaces: SpaceRow[] }) {
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState("amber");
  const [confirm, setConfirm] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setErr(r.ok ? "" : (r.error ?? "Something went wrong"));
    });

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      {spaces.map((s) => (
        <div key={s.id} data-space-color={s.color} className="flex flex-wrap items-center gap-3 rounded-btn border border-line bg-base-2 p-3">
          <span className="space-dot h-3 w-3 rounded-full" aria-hidden />
          <input
            defaultValue={s.name}
            aria-label={`Name of ${s.name}`}
            maxLength={40}
            onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(() => updateSpaceAction(s.id, { name: e.target.value.trim() }))}
            className="h-8 w-36 rounded-btn border border-transparent bg-transparent px-2 font-semibold outline-none hover:border-line focus:border-accent"
          />
          <span className="font-mono text-[11px] text-fg-faint">{s.count} tasks</span>
          <ColorPick name={s.name} value={s.color} onChange={(c) => run(() => updateSpaceAction(s.id, { color: c }))} />
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" defaultChecked={s.workHoursOnly} onChange={(e) => run(() => updateSpaceAction(s.id, { workHoursOnly: e.target.checked }))} className="h-4 w-4 accent-[var(--color-accent)]" />
            Only during work hours
          </label>
          {s.slug !== "personal" &&
            (confirm === s.id ? (
              <span className="ml-auto flex items-center gap-2 text-sm">
                Move its {s.count} tasks to Personal and remove it?
                <button type="button" onClick={() => run(() => archiveSpaceAction(s.id))} className="rounded-btn bg-stop px-2 py-1 font-semibold text-ink">
                  Remove
                </button>
                <button type="button" onClick={() => setConfirm(null)} className="text-fg-faint">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirm(s.id)} className="ml-auto text-sm text-stop hover:underline">
                Remove
              </button>
            ))}
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(async () => {
            const r = await createSpaceAction({ name, color, workHoursOnly: false });
            if (r.ok) setName("");
            return r;
          });
        }}
        className="flex flex-wrap items-center gap-3 rounded-btn border border-dashed border-line-strong p-3"
      >
        <label htmlFor="new-space" className="sr-only">
          New space name
        </label>
        <input id="new-space" value={name} onChange={(e) => setName(e.target.value)} placeholder="New space, e.g. Job hunt" maxLength={40} className="h-9 min-w-0 flex-1 rounded-btn border border-line-strong bg-transparent px-3 text-sm outline-none focus:border-accent" />
        <ColorPick name="New space" value={color} onChange={setColor} />
        <button disabled={!name.trim() || pending} className="h-9 rounded-btn bg-accent px-4 text-sm font-semibold text-ink disabled:opacity-40">
          Add space
        </button>
      </form>
      <p className="text-xs text-fg-faint">Tip: type “#work” (or any space name) in the add box to file a task there.</p>
      {err && <p className="text-sm text-stop">{err}</p>}
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Settings → Work hours + sound. */
export function WorkHoursEditor({ settings }: { settings: Settings }) {
  const [wh, setWh] = useState(settings.workHours);
  const [sound, setSound] = useState(settings.sound);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const save = (patch: Partial<Settings>) =>
    start(async () => {
      const r = await saveSettingsAction(patch);
      setMsg(r.ok ? "Saved" : r.error);
    });
  const field = "h-9 rounded-btn border border-line-strong bg-base-2 px-2.5 text-sm outline-none focus:border-accent";
  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-fg-faint uppercase">From</span>
          <input type="time" value={wh.start} onChange={(e) => setWh({ ...wh, start: e.target.value })} onBlur={() => save({ workHours: wh })} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-wider text-fg-faint uppercase">To</span>
          <input type="time" value={wh.end} onChange={(e) => setWh({ ...wh, end: e.target.value })} onBlur={() => save({ workHours: wh })} className={field} />
        </label>
        <div className="flex gap-1" role="group" aria-label="Work days">
          {DAYS.map((d, i) => {
            const on = wh.days.includes(i);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = { ...wh, days: on ? wh.days.filter((x) => x !== i) : [...wh.days, i].sort() };
                  setWh(next);
                  save({ workHours: next });
                }}
                className={cn("h-9 w-10 rounded-btn border text-xs font-semibold", on ? "border-accent bg-accent/15 text-accent" : "border-line-strong text-fg-faint")}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={sound}
          onChange={(e) => {
            setSound(e.target.checked);
            save({ sound: e.target.checked });
          }}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        Play a sound when I finish something or a focus timer ends
      </label>
      {msg && <p className={cn("font-mono text-[11px]", msg === "Saved" ? "text-live" : "text-stop")}>{msg}</p>}
    </div>
  );
}
