# Personal Productivity System ("HQ") — project context

Single-owner productivity app. Subdomain of ridwansharif.com (name TBD: hq./quest./os.). Full plan + diagrams: `PLAN.md`.

## Overview
- Kanban + quests from LifeQuest vault, habits, daily logs, streaks/XP, personal CRM, job-hunt board.
- Cherry-picked from ARCNIR site zip (`arcnir-site-main.zip` here) → work module (task-board, WorkflowNode.category, subtasks, labels, TaskActivity) + Leads/Clients → CRM. Dropped RBAC/delegation/invoices/signatures/etc.
- Stakeholder: Ridwan only. User pushes; Claude never pushes. No git repo yet → will be its own new repo (not ARCNIR/portfolio).

## Decisions (2026-10-06)
- (2026-11-21, supersedes earlier) Own git repo + fully self-hosted on Kali homelab: Compose stack web+postgres:18+backup+cloudflared+vault-sync. Own Postgres, NOT ARCNIR's DB platform/hosting. No Vercel, no Neon. Prisma unchanged.
- DB = source of truth; LifeQuest vault = mirror. Import stamps `lq_id:` into quest frontmatter (backup first, `web/vault-backups/`).
- Separate Next.js app (`web/`), NOT inside portfolio repo (portfolio = Tailwind3 + Redis; ARCNIR pieces = TW4 + Prisma).
- Auth = portfolio pattern (PBKDF2 + HMAC cookie), env `OWNER_PASSWORD_HASH/SALT`, `OWNER_SESSION_SECRET`.
- One `Task` table, `kind` = quest|step|task|habit|job. Step = child (parentId, 1 level). Column.category sets status.
- XP/streak derived from `Activity` ledger (±xp on complete/reopen, habit check/uncheck). Level: 50·n·(n−1) XP.
- Habit "done today" = `HabitCheck` row for day; no midnight reset. TZ = APP_TIMEZONE (default America/Chicago).

## Key files (web/)
- `prisma/schema.prisma`, `prisma/migrations/20261006000000_init/`, `prisma/seed.ts` (boards quests + job-hunt, labels)
- `src/lib/work.ts` service (only place status/XP change) · `src/lib/actions.ts` server actions · `src/lib/domain.ts` unions+Zod
- `src/components/board/task-board.tsx` (ARCNIR port) · `src/app/(app)/page.tsx` Today · `task/[id]` quest detail
- `scripts/vault-import.ts` (dry-run default, `--apply`) · `scripts/hash-password.mjs`

## Status
- Phase 0–2 built 2026-10-06: login, shell, Quests/Job boards (drag, Move-to, column CRUD, WIP), quest detail (steps, Ask-Claude copy), Today (focus, due, habits 7-day dots, level/XP/streak, follow-ups).
- Verified: tsc + next build clean; E2E on throwaway PGlite DB w/ vault COPY — import 15 areas/73 quests/323 steps/12 habits, re-run skipped 73 (idempotent), move/step/habit XP sums correct, mobile no overflow.
- Real vault NOT stamped yet. No DB created. Nothing deployed. No changes 2026-10-06 → 2026-11-21 (folder moved to 07_Coding/Personal_Projects in Docs reorg).
- PGlite testing gotcha: needs `&pgbouncer=true&connection_limit=1` in URL (prepared stmt clash). Real Postgres doesn't.

## Next steps
1. Docker-ize: `output: "standalone"`, `web/Dockerfile`, root `docker-compose.yml` + `.env.example` (PLAN §7). Test locally if Docker available, else on Kali (guide-first).
1b. git init at project root (.gitignore: node_modules/.next/.env/backups/vault-backups; zip stays out) → user creates remote + pushes.
1c. Kali: clone → `.env` → `docker compose up -d` → seed → vault import dry → `--apply`.
2. Phase 3 daily logs page (form from `_Templates/Daily Log.md`, writes DailyLog → counts for streak).
3. Phase 4 CRM pages (contacts list/detail, interactions, followUpEveryDays auto-schedule).
4. Phase 5 job-hunt card fields (meta: company/url/salary, contact link).
5. Phase 6 vault export (DB → checkbox/status write-back) + Cloudflare Tunnel hostname. Needs ridwansharif.com DNS moved Namecheap→Cloudflare (portfolio Vercel records re-added).
6. Later: PWA (ARCNIR sw.js), calendar, Telegram reminders, AI quest gen, portfolio "now" widget, nested vault sub-checkboxes (currently skipped).
