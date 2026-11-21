"use client";

import { useState, useTransition } from "react";

import { createTaskAction } from "@/lib/actions";

export function AddStep({ questId }: { questId: string }) {
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        start(async () => {
          const res = await createTaskAction({ title: t, kind: "step", parentId: questId });
          if (!res.ok) return alert(res.error);
          setTitle("");
        });
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Add a step…" aria-label="New step" className="h-9 flex-1 rounded-btn border border-line-strong bg-base-2 px-3 text-sm outline-none focus:border-accent" />
      <button disabled={pending} className="rounded-btn border border-line-strong px-3 text-sm hover:border-accent disabled:opacity-60">
        {pending ? "…" : "Add"}
      </button>
    </form>
  );
}
