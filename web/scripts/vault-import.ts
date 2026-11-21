/**
 * LifeQuest vault → DB import.  (DB is the source of truth; the vault is a mirror.)
 *
 *   npm run vault:import                 # DRY RUN: parse + print the plan, touches nothing
 *   npm run vault:import -- --apply      # write to DB + stamp `lq_id` into quest frontmatter
 *
 * What maps to what:
 *   Campaigns/<C>/<C>.md            → Area (kind campaign)      vaultId "area:Campaigns/<C>"
 *   Campaigns/<C>/<quest>.md        → Task kind quest           vaultId = frontmatter lq_id
 *   Dev Projects/<P>/<P>.md         → Area (kind dev-project)
 *   Dev Projects/<P>/<phase>.md     → Task kind quest (type: dev-phase)
 *   top-level "- [ ]" lines         → Task kind step            vaultId "<lq_id>#<hash of title>"
 *   "> 💬 Ask Claude: …" under step  → step.claudePrompt
 *   "- [ ] … 🔁 every day"           → Task kind habit (deduped by title)
 *
 * Re-runs are idempotent: a quest whose file hash is unchanged is skipped. A changed file
 * updates title/priority/focus/steps from the vault, but the board COLUMN stays where the
 * DB has it (DB is primary) — except a quest the vault marks done is moved to Done.
 * Nothing is ever deleted, in the DB or the vault. Files are backed up before stamping.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

const APPLY = process.argv.includes("--apply");
const VAULT = process.env.LIFEQUEST_VAULT || "C:/Users/Ridwan Sharif/Documents/MyCampign/LifeQuest";
const NOTE_TYPES = new Set(["dev-notes", "dev-log", "quest-log", "voice-note"]);

// ── Parsing ──────────────────────────────────────────────────────────────────

type ParsedStep = { vaultId: string; title: string; done: boolean; completedOn?: string; dueOn?: string; claudePrompt?: string };
type ParsedHabit = { title: string; recurrence: string };
type ParsedQuest = {
  rel: string;
  lqId: string;
  needsStamp: boolean;
  hash: string;
  title: string;
  status: string; // vault status
  priority: string;
  weeklyFocus: boolean;
  created?: string;
  winCondition?: string;
  steps: ParsedStep[];
  habits: ParsedHabit[];
};
type ParsedArea = { vaultId: string; slug: string; name: string; kind: "campaign" | "dev-project"; winCondition?: string; rel: string; quests: ParsedQuest[] };

const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isoOf = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);

/** Strip Tasks-plugin emoji metadata + markdown bold, returning the clean title and dates. */
function cleanStepText(raw: string) {
  const due = raw.match(/📅\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const doneOn = raw.match(/✅\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const recur = raw.match(/🔁\s*([^➕✅📅⏳🛫]+)/u)?.[1]?.trim();
  const title = raw
    .replace(/[🔁➕✅📅⏳🛫].*$/u, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { title, due, doneOn, recur };
}

function recurrenceOf(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("weekday")) return "weekdays";
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].filter((d) => t.includes(d));
  if (t.includes("week") && days.length) return `weekly:${days.join(",")}`;
  return "daily";
}

function firstBlockquote(body: string): string | undefined {
  const line = body.split(/\r?\n/).find((l) => /^>\s*[^💬\s]/u.test(l) && !l.includes("Ask Claude"));
  return line?.replace(/^>\s*/, "").replace(/\*\*/g, "").trim() || undefined;
}

function parseQuest(abs: string, rel: string): ParsedQuest | null {
  const raw = fs.readFileSync(abs, "utf8");
  if (!raw.startsWith("---")) return null; // no frontmatter → loose note, not a quest
  const fm = matter(raw);
  const d = fm.data as Record<string, unknown>;
  if (!d.status || NOTE_TYPES.has(String(d.type ?? ""))) return null;

  const existingId = typeof d.lq_id === "string" ? d.lq_id : undefined;
  const lqId = existingId ?? `lq_${crypto.randomBytes(6).toString("hex")}`;
  const lines = fm.content.split(/\r?\n/);
  const steps: ParsedStep[] = [];
  const habits: ParsedHabit[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^- \[( |x|X)\] (.+)$/); // top level only; indented sub-items are details
    if (!m) continue;
    const { title, due, doneOn, recur } = cleanStepText(m[2]!);
    if (!title) continue;
    if (recur) {
      if (!habits.some((h) => h.title === title)) habits.push({ title, recurrence: recurrenceOf(recur) });
      continue;
    }
    // Ask Claude prompt: the next few non-checkbox lines.
    let claudePrompt: string | undefined;
    for (let j = i + 1; j < Math.min(i + 4, lines.length) && !/^- \[/.test(lines[j]!); j++) {
      const p = lines[j]!.match(/Ask Claude:\s*\*?"?(.+?)"?\*?\s*$/);
      if (p) claudePrompt = p[1]!.replace(/^\*?"|"\*?$/g, "").trim();
    }
    const key = sha(title.toLowerCase()).slice(0, 10);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    steps.push({ vaultId: `${lqId}#${key}${n > 1 ? `-${n}` : ""}`, title, done: m[1] !== " ", completedOn: doneOn, dueOn: due, claudePrompt });
  }

  return {
    rel,
    lqId,
    needsStamp: !existingId,
    hash: sha(raw.replace(/^lq_id:.*\r?\n/m, "")),
    title: String(d.title ?? path.basename(abs, ".md")),
    status: String(d.status),
    priority: ["low", "medium", "high", "urgent"].includes(String(d.priority)) ? String(d.priority) : "medium",
    weeklyFocus: d.weekly_focus === true,
    created: isoOf(d.created),
    winCondition: firstBlockquote(fm.content),
    steps,
    habits,
  };
}

function scan(): ParsedArea[] {
  const areas: ParsedArea[] = [];
  for (const [root, kind] of [["Campaigns", "campaign"], ["Dev Projects", "dev-project"]] as const) {
    const rootAbs = path.join(VAULT, root);
    if (!fs.existsSync(rootAbs)) continue;
    for (const dir of fs.readdirSync(rootAbs, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dirRel = `${root}/${dir.name}`;
      const files = fs.readdirSync(path.join(rootAbs, dir.name)).filter((f) => f.endsWith(".md") && !f.startsWith("~syncthing~"));
      const indexFile = files.find((f) => f === `${dir.name}.md`);
      const area: ParsedArea = {
        vaultId: `area:${dirRel}`,
        slug: slugify(dir.name),
        name: dir.name,
        kind,
        rel: dirRel,
        quests: [],
        winCondition: indexFile ? firstBlockquote(matter(fs.readFileSync(path.join(rootAbs, dir.name, indexFile), "utf8")).content) : undefined,
      };
      for (const f of files) {
        if (f === indexFile) continue; // the campaign/project page itself, not a quest
        const q = parseQuest(path.join(rootAbs, dir.name, f), `${dirRel}/${f}`);
        if (q) area.quests.push(q);
      }
      areas.push(area);
    }
  }
  return areas;
}

/** vault status (+ step progress) → board column category for a NEW quest. */
function categoryFor(q: ParsedQuest): string {
  if (q.status === "done" || q.status === "complete" || q.status === "completed") return "done";
  if (q.status === "active") return q.steps.some((s) => s.done) ? "in-progress" : "todo";
  return "backlog"; // planned | someday | moved | paused
}

// ── Plan / apply ─────────────────────────────────────────────────────────────

async function main() {
  const areas = scan();
  const quests = areas.flatMap((a) => a.quests);
  const habits = quests.flatMap((q) => q.habits.map((h) => ({ ...h, quest: q })));
  console.log(`Vault: ${VAULT}`);
  console.log(`${areas.length} areas · ${quests.length} quests · ${quests.reduce((n, q) => n + q.steps.length, 0)} steps · ${habits.length} habits · ${quests.filter((q) => q.needsStamp).length} files need an lq_id stamp\n`);
  for (const a of areas) {
    console.log(`▸ ${a.kind === "campaign" ? "Campaign" : "Dev project"}: ${a.name} (${a.quests.length} quests)`);
    for (const q of a.quests) console.log(`    ${categoryFor(q).padEnd(11)} ${q.weeklyFocus ? "★" : " "} ${q.title}  [${q.steps.filter((s) => s.done).length}/${q.steps.length}]${q.habits.length ? `  +${q.habits.length} habit(s)` : ""}`);
  }
  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to import (needs DATABASE_URL).");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const toDate = (iso?: string) => (iso ? new Date(`${iso}T00:00:00.000Z`) : undefined);
  const stats = { created: 0, updated: 0, skipped: 0, steps: 0, habits: 0, stamped: 0 };

  try {
    const board = await db.board.findUnique({ where: { slug: "quests" }, include: { columns: { orderBy: { order: "asc" } } } });
    if (!board) throw new Error('Board "quests" not found — run `npm run db:seed` first.');
    const columnFor = (cat: string) => board.columns.find((c) => c.category === cat) ?? board.columns[0]!;
    const doneCol = columnFor("done");

    for (const [order, a] of areas.entries()) {
      const area = await db.area.upsert({
        where: { vaultId: a.vaultId },
        update: { name: a.name, winCondition: a.winCondition },
        create: { vaultId: a.vaultId, vaultPath: a.rel, slug: a.slug, name: a.name, kind: a.kind, winCondition: a.winCondition, order },
      });

      for (const q of a.quests) {
        const existing = await db.task.findUnique({ where: { vaultId: q.lqId }, select: { id: true, vaultHash: true, status: true } });
        if (existing && existing.vaultHash === q.hash) {
          stats.skipped++;
          continue;
        }
        const cat = categoryFor(q);
        const base = { title: q.title, priority: q.priority, weeklyFocus: q.weeklyFocus, areaId: area.id, vaultPath: q.rel, vaultHash: q.hash, description: q.winCondition };
        const quest = existing
          ? await db.task.update({
              where: { id: existing.id },
              data: { ...base, ...(cat === "done" && existing.status !== "done" ? { columnId: doneCol.id, status: "done", completedAt: new Date() } : {}) },
            })
          : await db.task.create({
              data: {
                ...base,
                kind: "quest",
                vaultId: q.lqId,
                boardId: board.id,
                columnId: columnFor(cat).id,
                status: cat,
                xp: 50,
                completedAt: cat === "done" ? new Date() : null,
                createdAt: q.created ? new Date(`${q.created}T12:00:00.000Z`) : undefined,
              },
            });
        existing ? stats.updated++ : stats.created++;

        for (const [i, s] of q.steps.entries()) {
          const data = {
            title: s.title,
            order: i,
            status: s.done ? "done" : "todo",
            completedAt: s.done ? (toDate(s.completedOn) ?? new Date()) : null,
            dueOn: toDate(s.dueOn) ?? null,
            claudePrompt: s.claudePrompt ?? null,
          };
          await db.task.upsert({
            where: { vaultId: s.vaultId },
            update: data,
            create: { ...data, vaultId: s.vaultId, kind: "step", parentId: quest.id, areaId: area.id, xp: 10, vaultPath: q.rel },
          });
          stats.steps++;
        }

        for (const h of q.habits) {
          const hid = `habit:${sha(h.title.toLowerCase()).slice(0, 12)}`;
          await db.task.upsert({
            where: { vaultId: hid },
            update: { title: h.title, recurrence: h.recurrence },
            create: { vaultId: hid, vaultPath: q.rel, kind: "habit", title: h.title, recurrence: h.recurrence, areaId: area.id, xp: 5 },
          });
          stats.habits++;
        }
        await db.activity.create({ data: { taskId: quest.id, type: "vault.imported", on: today, data: { path: q.rel, created: !existing } } });

        if (q.needsStamp) {
          stampLqId(q);
          stats.stamped++;
        }
      }
    }
  } finally {
    await db.$disconnect();
  }
  console.log("\nApplied:", stats);
}

// ── Stamping (the only write to the vault) ───────────────────────────────────

const BACKUP_DIR = path.join(process.cwd(), "vault-backups", new Date().toISOString().replace(/[:.]/g, "-"));

/** Insert `lq_id:` as the first frontmatter line — a text insert, so the rest of the YAML keeps its exact formatting. */
function stampLqId(q: ParsedQuest) {
  const abs = path.join(VAULT, q.rel);
  const raw = fs.readFileSync(abs, "utf8");
  if (/^lq_id:/m.test(raw.split(/\r?\n---/)[0] ?? "")) return;
  const backup = path.join(BACKUP_DIR, q.rel);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(abs, backup);
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(abs, raw.replace(/^---\r?\n/, `---${eol}lq_id: ${q.lqId}${eol}`), "utf8");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
