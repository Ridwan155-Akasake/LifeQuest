# Personal Productivity System ("HQ") — project context

Single-owner productivity app. Subdomain of ridwansharif.com (name TBD: hq./quest./os.). Full plan + diagrams: `PLAN.md`.

## Overview
- Kanban + quests from LifeQuest vault, habits, daily logs, streaks/XP, personal CRM, job-hunt board.
- Cherry-picked from ARCNIR site zip (`arcnir-site-main.zip` here) → work module (task-board, WorkflowNode.category, subtasks, labels, TaskActivity) + Leads/Clients → CRM. Dropped RBAC/delegation/invoices/signatures/etc.
- Stakeholder: Ridwan only. User pushes; Claude never pushes. Git repo at project root (branch main, init 2026-11-21, no remote yet). `.gitattributes` forces LF (deploys to Linux). Zip + data/ + backups/ + .env gitignored.

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
- 2026-11-21: Docker stack done — root `docker-compose.yml` (db postgres:18 → ./data/postgres, migrate, web :3100, backup → ./backups nightly, tools profile, cloudflared profile tunnel), `deploy/backup.sh`, `web/Dockerfile` (targets runner/tools), root `.env.example`, `README.md` deploy guide. Verified: build ok, standalone server + healthcheck ok, npm audit 0 (next 16.4.6, zod 4.6.7, overrides deepmerge-ts/effect). NOT verified: actual `docker compose up` (no Docker on Windows PC).
- Added COOKIE_SECURE env (false for LAN http testing) + cf-connecting-ip for login throttle.
- PGlite testing gotcha: needs `&pgbouncer=true&connection_limit=1` in URL (prepared stmt clash). Real Postgres doesn't.

## Next steps
1. User: create remote repo (GitHub, private) → `git remote add origin … && git push -u origin main`.
2. Kali deploy per README "First deploy" (guide-first; user runs). First real `docker compose up` = first true test of Dockerfile/compose → expect possible fixes. Then seed → vault import dry → `--apply`. Test a restore.
3. Off-box backups: sync ./backups to NAS/Syncthing.
4. Phase 3 daily logs page · Phase 4 CRM pages · Phase 5 job-hunt card fields.
5. Phase 6 vault export + tunnel hostname (needs ridwansharif.com DNS on Cloudflare — confirm with user first). vault-sync on a schedule (cron calling `docker compose run --rm tools npm run vault:import -- --apply`).
6. Later: PWA, calendar, Telegram reminders, AI quest gen, portfolio "now" widget, nested vault sub-checkboxes.
