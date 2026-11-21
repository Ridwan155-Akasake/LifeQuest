"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSessionToken, SESSION_COOKIE, verifyPassword } from "@/lib/auth";

// Tiny in-memory throttle: 5 wrong passwords per IP per 15 min (per server instance —
// enough for a single-owner app; the homelab tunnel/Cloudflare sits in front as well).
const attempts = new Map<string, { n: number; until: number }>();

export async function loginAction(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  // Behind Cloudflare Tunnel the real client IP is cf-connecting-ip; x-forwarded-for otherwise.
  const h = await headers();
  const ip = h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.n >= 5 && now < a.until) return { error: "Too many attempts. Try again in a few minutes." };

  const password = String(form.get("password") ?? "");
  if (!verifyPassword(password)) {
    const next = a && now < a.until ? { n: a.n + 1, until: a.until } : { n: 1, until: now + 15 * 60_000 };
    attempts.set(ip, next);
    return { error: "Wrong password." };
  }
  attempts.delete(ip);

  const { token, expires } = createSessionToken();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // COOKIE_SECURE=false only for testing over plain http on the LAN; the tunnel is https.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
