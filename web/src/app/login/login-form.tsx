"use client";

import { useActionState } from "react";

import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Password</span>
        <input
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="h-10 rounded-btn border border-line-strong bg-base px-3 text-fg outline-none focus:border-accent"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-stop">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="h-10 rounded-btn bg-accent font-semibold text-ink transition hover:opacity-90 disabled:opacity-60">
        {pending ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
