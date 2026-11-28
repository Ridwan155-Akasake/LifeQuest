/**
 * Seed: the default boards + a few labels. Idempotent — safe to re-run.
 * Quests/campaigns come from the vault (npm run vault:import), not from here.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const BOARDS = [
  {
    slug: "quests",
    name: "Quests",
    kind: "quests",
    columns: [
      { title: "Backlog", category: "backlog" },
      { title: "Active", category: "todo" },
      { title: "In progress", category: "in-progress", wipLimit: 5 },
      { title: "Done", category: "done" },
    ],
  },
  {
    slug: "job-hunt",
    name: "Job hunt",
    kind: "jobs",
    columns: [
      { title: "Wishlist", category: "backlog" },
      { title: "Applied", category: "todo" },
      { title: "Interviewing", category: "in-progress" },
      { title: "Offer", category: "review" },
      { title: "Accepted", category: "done" },
      { title: "Rejected", category: "canceled" },
    ],
  },
] as const;

const LABELS = [
  { name: "quick-win", color: "live" },
  { name: "blocked", color: "stop" },
  { name: "needs-claude", color: "accent" },
  { name: "money", color: "warn" },
];

/** Same ids as the 20261128 migration backfill, so a fresh install and an upgraded one match. */
const SPACES = [
  { id: "space_personal", slug: "personal", name: "Personal", color: "mint", order: 0 },
  { id: "space_work", slug: "work", name: "Work", color: "sky", order: 1 },
];

async function main() {
  for (const s of SPACES) await db.space.upsert({ where: { slug: s.slug }, update: {}, create: s });
  for (const [order, b] of BOARDS.entries()) {
    const board = await db.board.upsert({
      where: { slug: b.slug },
      update: {},
      create: { slug: b.slug, name: b.name, kind: b.kind, order },
    });
    const existing = await db.column.count({ where: { boardId: board.id } });
    if (existing === 0) {
      await db.column.createMany({
        data: b.columns.map((c, i) => ({ boardId: board.id, title: c.title, category: c.category, order: i, wipLimit: "wipLimit" in c ? c.wipLimit : null })),
      });
    }
  }
  for (const l of LABELS) await db.label.upsert({ where: { name: l.name }, update: {}, create: l });
  console.log("Seeded boards:", BOARDS.map((b) => b.slug).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
