import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Single-owner auth — same scheme as the portfolio admin (Portfoli Web/lib/adminAuth.ts):
 * PBKDF2-SHA512 password check against OWNER_PASSWORD_HASH/SALT, then an HMAC-signed,
 * httpOnly session cookie. There is no users table: this app has exactly one user.
 */
const ITERATIONS = 100_000;
const KEYLEN = 64;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days — it's a daily-use app
export const SESSION_COOKIE = "pp_session";

export function verifyPassword(password: string): boolean {
  const salt = process.env.OWNER_PASSWORD_SALT;
  const expectedHex = process.env.OWNER_PASSWORD_HASH;
  if (!salt || !expectedHex || !password) return false;
  const actual = crypto.pbkdf2Sync(password, Buffer.from(salt, "hex"), ITERATIONS, KEYLEN, "sha512");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function secret(): string {
  const s = process.env.OWNER_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("OWNER_SESSION_SECRET is missing or too short (run npm run hash-password)");
  return s;
}

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("hex");

export function createSessionToken(): { token: string; expires: Date } {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `owner.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expires: new Date(exp) };
}

export function verifySessionToken(token?: string | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [who, expStr, sig] = parts as [string, string, string];
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(`${who}.${expStr}`), "hex");
  } catch {
    return false;
  }
  const got = Buffer.from(sig, "hex");
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;
  const exp = Number(expStr);
  return who === "owner" && Number.isFinite(exp) && Date.now() <= exp;
}

export async function isOwner(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** Gate for every page and server action. Pages redirect; actions get a thrown error. */
export async function requireOwner(): Promise<void> {
  if (!(await isOwner())) redirect("/login");
}
