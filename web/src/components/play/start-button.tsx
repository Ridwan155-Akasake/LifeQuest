"use client";

import { usePlay, type PlayTask } from "./play-provider";

/** START + Done for any page (e.g. task detail). */
export function StartDone({ task }: { task: PlayTask }) {
  const play = usePlay();
  return (
    <div className="mt-5 flex gap-2">
      <button type="button" onClick={() => play.start(task)} className="start-orb rounded-full px-6 py-2.5 font-display font-extrabold">
        ▶ START
      </button>
      <button type="button" onClick={() => play.complete(task)} className="rounded-full border border-live/50 px-5 py-2.5 font-semibold text-live hover:bg-live/10">
        Done ✓
      </button>
    </div>
  );
}
