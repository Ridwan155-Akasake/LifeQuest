"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";

import { endFocusAction, setHabitCheckedAction, setStepDoneAction, setTaskDoneAction, startFocusAction } from "@/lib/actions";
import { cn } from "@/lib/cn";
import { FOCUS_LENGTHS } from "@/lib/domain";
import type { Player } from "@/lib/play";

/**
 * The game loop every view shares: START opens a full-screen focus timer, Done shows a
 * reward (XP, level bar, boss bonus, sound, buzz). Lives in the app shell so a timer keeps
 * running while you move between pages, and survives a reload (localStorage).
 */

export type PlayTask = { id: string; title: string; kind: "task" | "habit" | "step"; estimateMin?: number | null; steps?: { id: string; title: string; done: boolean }[] };

type Focus = { sessionId: string; task: PlayTask; plannedMin: number; startedAt: number; endsAt: number };
type Reward = { title: string; xp: number; boss: boolean; nextDue?: string; focusMin?: number; player: Player | null; levelUp: boolean };

type Ctx = {
  start: (task: PlayTask) => void;
  complete: (task: PlayTask) => Promise<boolean>;
  focusing: string | null;
  error: string;
};

const PlayCtx = createContext<Ctx | null>(null);
export const usePlay = () => {
  const c = useContext(PlayCtx);
  if (!c) throw new Error("usePlay outside PlayProvider");
  return c;
};

const STORE = "hq_focus";

// ── Sound + buzz ─────────────────────────────────────────────────────────────
let audio: AudioContext | null = null;
function chime(kind: "done" | "level" | "time") {
  try {
    audio ??= new AudioContext();
    const notes = kind === "level" ? [523, 659, 784, 1047] : kind === "done" ? [659, 988] : [880, 660, 880];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      const t = audio!.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(audio!.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {
    /* no audio — fine */
  }
}
const buzz = (p: number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* not supported */
  }
};

export function PlayProvider({ children, sound, level }: { children: React.ReactNode; sound: boolean; level: number }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [busy, start] = useTransition();
  const levelRef = useRef(level);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  const rang = useRef(false);

  useEffect(() => {
    levelRef.current = Math.max(levelRef.current, level);
  }, [level]);

  // Restore a running timer after reload / reopening the app.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const f = JSON.parse(raw) as Focus;
      if (f.endsAt > Date.now() - 2 * 3_600_000) setFocus(f);
      else localStorage.removeItem(STORE);
    } catch {
      /* storage blocked */
    }
  }, []);

  useEffect(() => {
    if (!focus) return;
    rang.current = false;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [focus]);

  useEffect(() => {
    if (focus && now >= focus.endsAt && !rang.current) {
      rang.current = true;
      if (sound) chime("time");
      buzz([300, 120, 300, 120, 600]);
    }
  }, [now, focus, sound]);

  const persist = (f: Focus | null) => {
    try {
      if (f) localStorage.setItem(STORE, JSON.stringify(f));
      else localStorage.removeItem(STORE);
    } catch {
      /* storage blocked */
    }
  };

  const enterFocusMode = async () => {
    try {
      lock.current = (await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
    } catch {
      /* wake lock refused */
    }
  };
  const leaveFocusMode = () => {
    lock.current?.release().catch(() => {});
    lock.current = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  const showReward = useCallback(
    (r: Omit<Reward, "levelUp">) => {
      const levelUp = !!r.player && r.player.level > levelRef.current;
      if (r.player) levelRef.current = r.player.level;
      setReward({ ...r, levelUp });
      if (sound) chime(levelUp ? "level" : "done");
      buzz(levelUp ? [80, 60, 80, 60, 200] : [60, 40, 120]);
    },
    [sound],
  );

  const complete = useCallback(
    async (task: PlayTask, focusMin?: number) => {
      setError("");
      const res = task.kind === "habit" ? await setHabitCheckedAction(task.id, true) : await setTaskDoneAction(task.id, true);
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      const d = res.data as { xp: number; boss?: boolean; nextDue?: string; player: Player };
      showReward({ title: task.title, xp: d.xp, boss: !!d.boss, nextDue: d.nextDue, focusMin, player: d.player });
      return true;
    },
    [showReward],
  );

  const begin = useCallback((task: PlayTask) => {
    setError("");
    const minutes = task.estimateMin && task.estimateMin <= 180 ? task.estimateMin : 25;
    // Full screen must be requested inside the tap itself.
    document.documentElement.requestFullscreen?.().catch(() => {});
    start(async () => {
      const res = await startFocusAction(task.kind === "habit" ? null : task.id, minutes);
      if (!res.ok) return setError(res.error);
      const startedAt = new Date(res.data!.startedAt).getTime();
      const f = { sessionId: res.data!.id, task, plannedMin: minutes, startedAt, endsAt: startedAt + minutes * 60_000 };
      setFocus(f);
      persist(f);
      setNow(Date.now());
      void enterFocusMode();
    });
  }, []);

  const stop = (outcome: "done" | "stopped" | "stuck") => {
    if (!focus) return;
    const f = focus;
    setFocus(null);
    persist(null);
    leaveFocusMode();
    start(async () => {
      const ended = await endFocusAction(f.sessionId, outcome);
      if (outcome === "done") await complete(f.task, ended.ok ? ended.data?.minutes : undefined);
      if (outcome === "stuck") window.dispatchEvent(new CustomEvent("hq:split", { detail: f.task.id }));
    });
  };

  const setLength = (min: number) => {
    if (!focus) return;
    const f = { ...focus, plannedMin: min, endsAt: focus.startedAt + min * 60_000 };
    setFocus(f);
    persist(f);
  };

  const left = focus ? Math.max(0, Math.round((focus.endsAt - now) / 1000)) : 0;
  const frac = focus ? Math.min(1, Math.max(0, (now - focus.startedAt) / (focus.endsAt - focus.startedAt))) : 0;
  const R = 92;
  const C = 2 * Math.PI * R;

  return (
    <PlayCtx.Provider value={{ start: begin, complete, focusing: focus?.task.id ?? null, error }}>
      {children}

      {error && !focus && (
        <div role="alert" className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-btn border border-stop/40 bg-surface px-4 py-3 text-sm text-stop md:bottom-6">
          {error}
        </div>
      )}

      {focus && (
        <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-base px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-safe" role="dialog" aria-modal="true" aria-label={`Focus on ${focus.task.title}`}>
          <p className="rounded-full bg-surface-2 px-3 py-1 font-mono text-[11px] tracking-wider text-fg-muted">FOCUS · phone down, one thing</p>
          <div className="relative mt-6 h-[220px] w-[220px] shrink-0">
            <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-90" aria-hidden>
              <circle cx="110" cy="110" r={R} fill="none" className="stroke-surface-2" strokeWidth="12" />
              <circle cx="110" cy="110" r={R} fill="none" className={left === 0 ? "stroke-live" : "stroke-accent"} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * frac} style={{ transition: "stroke-dashoffset 1s linear" }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className="font-mono text-5xl tabular-nums" aria-live="off">
                {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
              </span>
            </div>
          </div>
          <h2 className="mt-6 max-w-md text-center font-display text-2xl font-extrabold leading-tight">{focus.task.title}</h2>
          {left === 0 && <p className="mt-2 text-center text-live">Time’s up. Done, or five more minutes?</p>}
          <div className="mt-4 flex gap-2" role="group" aria-label="Timer length">
            {FOCUS_LENGTHS.map((m) => (
              <button key={m} type="button" onClick={() => setLength(m)} className={cn("rounded-full border px-3 py-1 font-mono text-xs", focus.plannedMin === m ? "border-accent text-accent" : "border-line-strong text-fg-faint hover:text-fg")}>
                {m}m
              </button>
            ))}
            {left === 0 && (
              <button type="button" onClick={() => setLength(Math.round((now - focus.startedAt) / 60_000) + 5)} className="rounded-full border border-live px-3 py-1 font-mono text-xs text-live">
                +5m
              </button>
            )}
          </div>
          {focus.task.steps && focus.task.steps.length > 0 && <FocusSteps steps={focus.task.steps} />}
          <div className="mt-auto flex w-full max-w-md flex-col gap-2 pt-8">
            <button type="button" disabled={busy} onClick={() => stop("done")} className="rounded-card bg-live py-4 font-display text-xl font-extrabold text-ink transition active:scale-[.98]">
              Done ✓
            </button>
            <button type="button" disabled={busy} onClick={() => stop("stuck")} className="rounded-card border border-line-strong py-3 text-sm text-fg-muted">
              I’m stuck — break it into smaller steps
            </button>
            <button type="button" disabled={busy} onClick={() => stop("stopped")} className="py-2 text-xs text-fg-faint underline underline-offset-4">
              Stop without finishing
            </button>
          </div>
        </div>
      )}

      {reward && <RewardScreen r={reward} onClose={() => setReward(null)} />}
    </PlayCtx.Provider>
  );
}

function FocusSteps({ steps }: { steps: { id: string; title: string; done: boolean }[] }) {
  const [done, setDone] = useState(() => new Set(steps.filter((s) => s.done).map((s) => s.id)));
  return (
    <ul className="mt-6 flex w-full max-w-md flex-col gap-1.5">
      {steps.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => {
              const on = !done.has(s.id);
              setDone((d) => {
                const n = new Set(d);
                if (on) n.add(s.id);
                else n.delete(s.id);
                return n;
              });
              void setStepDoneAction(s.id, on);
            }}
            className="flex w-full items-center gap-3 rounded-btn bg-surface px-3 py-2 text-left text-sm"
          >
            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px]", done.has(s.id) ? "border-live bg-live text-ink" : "border-line-strong")}>{done.has(s.id) ? "✓" : ""}</span>
            <span className={done.has(s.id) ? "text-fg-faint line-through" : ""}>{s.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const SPARKS = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * 360, d: 70 + ((i * 37) % 60) }));

function RewardScreen({ r, onClose }: { r: Reward; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const p = r.player;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-base/95 px-6 text-center backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Reward" onClick={onClose}>
      <div className="relative">
        {SPARKS.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute top-1/2 left-1/2 h-2 w-2 rounded-full bg-accent"
            style={{ "--a": `${s.a}deg`, "--d": `${s.d}px`, opacity: 0, animation: `spark 0.9s ${i * 0.02}s ease-out forwards` } as React.CSSProperties}
          />
        ))}
        <p className="animate-pop font-display text-7xl font-extrabold text-accent">+{r.xp} XP</p>
      </div>
      {r.levelUp && p && <p className="mt-3 animate-rise font-pixel text-lg text-live">LEVEL UP · LV {p.level} · {p.title}</p>}
      {r.boss && <p className="mt-3 animate-rise rounded-full bg-stop/15 px-3 py-1 font-mono text-xs text-stop">Boss defeated · overdue bonus included</p>}
      <h2 className="mt-4 max-w-md font-display text-2xl font-extrabold">{r.levelUp ? "You levelled up." : "Nice. That’s one."}</h2>
      <p className="mt-1 max-w-md truncate text-sm text-fg-muted">
        {r.title}
        {r.focusMin ? ` · ${r.focusMin} min focused` : ""}
        {r.nextDue ? ` · repeats, next ${r.nextDue}` : ""}
      </p>
      {p && (
        <div className="mt-6 w-full max-w-xs">
          <div className="flex justify-between font-mono text-[11px] text-fg-muted">
            <span>LV {p.level}</span>
            <span>{p.toNext} XP to LV {p.level + 1}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="xp-fill h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.round((p.intoLevel / p.levelSpan) * 100)}%` }} />
          </div>
          <p className="mt-2 font-mono text-[11px] text-accent">🔥 {p.streak}-day streak</p>
        </div>
      )}
      <button type="button" autoFocus onClick={onClose} className="mt-8 w-full max-w-xs rounded-card bg-accent py-3.5 font-display text-lg font-extrabold text-ink">
        Next thing →
      </button>
    </div>
  );
}
