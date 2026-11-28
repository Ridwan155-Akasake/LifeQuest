import "server-only";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";

import { db } from "./db";
import { localNow, weekdayOf } from "./dates";
import { DEFAULT_SETTINGS, settingsInput, type Settings } from "./domain";

/**
 * "Where am I looking?" — the active space (per device, a cookie) and the owner's settings
 * (view mode, work hours, sound; stored in the DB so phone and PC agree).
 */

export const SPACE_COOKIE = "hq_space";

export type SpaceView = { id: string; slug: string; name: string; color: string; workHoursOnly: boolean };

export async function getSettings(): Promise<Settings> {
  const row = await db.setting.findUnique({ where: { key: "app" } });
  const parsed = settingsInput.safeParse({ ...DEFAULT_SETTINGS, ...((row?.value as object | null) ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>) {
  const next = settingsInput.parse({ ...(await getSettings()), ...patch });
  await db.setting.upsert({ where: { key: "app" }, update: { value: next }, create: { key: "app", value: next } });
  return next;
}

export async function listSpaces(): Promise<SpaceView[]> {
  return db.space.findMany({
    where: { archivedAt: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, name: true, color: true, workHoursOnly: true },
  });
}

/** True inside the configured work hours (APP_TIMEZONE). */
export function inWorkHours(s: Settings, now = new Date()) {
  const { date, minutes } = localNow(undefined, now);
  const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekdayOf(date));
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return s.workHours.days.includes(dow) && minutes >= toMin(s.workHours.start) && minutes < toMin(s.workHours.end);
}

export type Scope = {
  /** Slug of the chosen space, or "all". */
  active: string;
  spaces: SpaceView[];
  /** Spaces whose tasks are shown right now. */
  visible: SpaceView[];
  /** Spaces hidden because it's outside work hours ("All" only). */
  resting: SpaceView[];
  settings: Settings;
};

export async function getScope(): Promise<Scope> {
  const [spaces, settings, jar] = await Promise.all([listSpaces(), getSettings(), cookies()]);
  const wanted = jar.get(SPACE_COOKIE)?.value ?? "all";
  const chosen = spaces.find((s) => s.slug === wanted);
  if (chosen) return { active: chosen.slug, spaces, visible: [chosen], resting: [], settings };
  const working = inWorkHours(settings);
  const resting = working ? [] : spaces.filter((s) => s.workHoursOnly);
  return { active: "all", spaces, visible: spaces.filter((s) => !resting.includes(s)), resting, settings };
}

/** Prisma filter for "tasks in the visible spaces". Rows without a space count as Personal. */
export function inScope(scope: Scope): Prisma.TaskWhereInput {
  if (scope.active === "all" && scope.resting.length === 0) return {};
  const ids = scope.visible.map((s) => s.id);
  const personal = scope.visible.some((s) => s.slug === "personal");
  return { OR: [{ spaceId: { in: ids } }, ...(personal ? [{ spaceId: null }] : [])] };
}

/** Space new tasks land in: the chosen one, else Personal. */
export function defaultSpaceId(scope: Scope) {
  if (scope.active !== "all") return scope.visible[0]?.id;
  return scope.spaces.find((s) => s.slug === "personal")?.id ?? scope.spaces[0]?.id;
}
