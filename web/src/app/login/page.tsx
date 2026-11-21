import { redirect } from "next/navigation";

import { isOwner } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await isOwner()) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">Ridwan · HQ</p>
        <h1 className="mt-2 text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-fg-muted">Your quests are waiting.</p>
        <LoginForm />
      </div>
    </main>
  );
}
