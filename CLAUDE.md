# Personal Productivity System ("HQ") — project context

Single-owner **simple ADHD task tracker** (rescoped 2026-11-21 — NOT full LifeQuest; that's parked). Subdomain of ridwansharif.com, name TBD (NOT "LifeQuest" — reserve that for big vision; user leaning plain e.g. tasks./HQ). Full plan: `PLAN.md`.

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
- Repeating TASK (kind task + recurrence) never closes: complete → Activity task.completed + dueOn = nextDue() (steps past today; monthly keeps `meta.monthDay` anchor). Recurrence needs a due date (enforced). Inbox = kind task, no due, no board, no parent.

## Scope (2026-11-21, user chose "simple tracker first")
- IN: quick capture, Today (overdue/today/inbox/next7/done), repeating tasks, All tasks, habits, Quests board + vault import, Telegram reminders (next).
- PARKED (kept, hidden/unbuilt): XP/levels UI, job-hunt board (nav filters kind=jobs), CRM pages, daily-log pages, vault write-back, AI quests. Don't build unless user asks.

## Key files (web/)
- `prisma/schema.prisma`, `prisma/migrations/20261006000000_init/`, `prisma/seed.ts` (boards quests + job-hunt, labels)
- `src/lib/work.ts` service (only place status/XP change) · `src/lib/actions.ts` server actions · `src/lib/domain.ts` unions+Zod
- `src/components/board/task-board.tsx` (ARCNIR port) · `src/app/(app)/page.tsx` Today · `task/[id]` quest detail
- `scripts/vault-import.ts` (dry-run default, `--apply`) · `scripts/hash-password.mjs`
- `src/lib/capture.ts` parseCapture (pure, client+server) · `src/lib/dates.ts` nextDue/RECURRENCE_RE · `components/capture/capture-bar.tsx` (in shell, "/" focuses) · `components/today/task-row.tsx` · `app/(app)/tasks` All tasks · `task/[id]/task-edit.tsx`

## Status
- Built + verified on throwaway PGlite: Phase 0–2 (2026-10-06); Docker stack + git (2026-11-21); simple-tracker v1 (2026-11-21): capture parser 18/18 cases pass, browser E2E (capture 4 kinds, daily roll→tomorrow, inbox Tomorrow btn, weekly repeat edit, no-due guard, All tasks, vault copy import doesn't flood, mobile ok, 0 console errors). tsc/build ok, npm audit 0.
- NOT done: real DB, `docker compose up` on Kali (no Docker on Windows), push (no remote), real vault stamp, reminders.
- Git: repo at project root, branch main, LF forced. User pushes.
- Gotchas: PGlite test URL needs `&pgbouncer=true&connection_limit=1`. Bash heredocs mangle `\` and some quotes on this machine → write scripts to scratchpad file, run `python -I file`. Automation key "slash" ≠ "/" (capture hotkey works with real "/").

## Next steps
1. User: pick app name/subdomain → rename (title "Ridwan · HQ" in login + shell + metadata, package.json name, compose `name:`, docs) → create private GitHub repo → push.
2. Telegram reminders: morning list (overdue+today) + due pings. Reuse SecondBrain bot (token on Kali). Likely a `reminders` service in compose (cron loop like backup.sh) hitting an internal route or using Prisma directly. Confirm bot/token location with user first.
3. Kali deploy per README (guide-first; user runs). First real compose up → expect fixes. Seed → vault import dry → `--apply` only with user go.
4. Off-box backup sync of ./backups.
5. Tunnel + subdomain: needs ridwansharif.com DNS on Cloudflare — confirm first.
6. Parked items only on request.
