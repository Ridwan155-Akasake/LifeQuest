# HQ (hq.ridwansharif.com) — project context

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

## Decisions 2026-11-21 (later)
- Name HQ, hq.ridwansharif.com, "early version of LifeQuest".
- Phone: Android + website now, iPhone later. Widgets need native wrapper (Android free/sideload; iOS = Mac + $99/yr → user's call later).
- SecondBrain bot (`L:\SecondBrain\secondbrain-bot`, Python on Kali): HQ takes over ALL jobs (Claude agent, Inbox capture, reminders, approvals); bot = thin backup. Migrate one job at a time, side by side. Mapping in PLAN §6b.
- Calendar: user wants HQ ⇄ calendar both ways (create events + import events). Accounts: BOTH Google (personal + ARCNIR); pull from both, write to one (which = confirm at build). PLAN §6c.
- Order: deploy + notifications first.

## Key files (web/)
- `prisma/schema.prisma`, `prisma/migrations/20261006000000_init/`, `prisma/seed.ts` (boards quests + job-hunt, labels)
- `src/lib/work.ts` service (only place status/XP change) · `src/lib/actions.ts` server actions · `src/lib/domain.ts` unions+Zod
- `src/components/board/task-board.tsx` (ARCNIR port) · `src/app/(app)/page.tsx` Today · `task/[id]` quest detail
- `scripts/vault-import.ts` (dry-run default, `--apply`) · `scripts/hash-password.mjs`
- Reminders: Task.dueTime/remindAt/remindedAt (migration 20261121000000), `reminderFor()` in work.ts keeps remindAt synced; `app/api/cron/tick` (CRON_SECRET, ticker container `deploy/ticker.mjs`); `lib/push.ts` web-push + Telegram fallback; `public/sw.js`; `app/manifest.ts`; `app/(app)/settings`; `api/push/{subscribe,action,test}`.
- `src/lib/capture.ts` parseCapture (pure, client+server) · `src/lib/dates.ts` nextDue/RECURRENCE_RE · `components/capture/capture-bar.tsx` (in shell, "/" focuses) · `components/today/task-row.tsx` · `app/(app)/tasks` All tasks · `task/[id]/task-edit.tsx`

## Status
- Built + verified on throwaway PGlite: Phase 0–2 (2026-10-06); Docker + git; simple tracker v1; HQ rename; timed tasks + push (2026-11-21).
- Push verified: 30/30 API E2E vs fake push service (encryption/VAPID/410 cleanup/no dup/digest once/Done/Snooze/auth 401/403) + REAL push in headless Edge (WNS endpoint → SW showed notification). Time parser 17/17 incl DST. NOT tested: Telegram fallback send (no token here), real Android phone.
- NOT done: real DB, compose up on Kali, push to GitHub (no remote), DNS→Cloudflare, real vault stamp, bot takeover, calendar.
- Embedded Claude browser pane blocks SW + notifications → test push in headless Edge via playwright-core (scratchpad).
- Gotchas: PGlite URL needs `&pgbouncer=true&connection_limit=1`. Bash heredocs mangle `\` → write scripts to scratchpad, `python -I file`. TaskStop leaves npx child node alive → kill by port (Get-NetTCPConnection) after tests.

## Next steps
1. User: create private GitHub repo `hq` → push.
2. Kali deploy (README "First deploy"; guide-first, user runs). Needs .env: POSTGRES_PASSWORD, OWNER_*, CRON_SECRET, VAPID (npm run vapid ONCE), optional TELEGRAM_BOT_TOKEN/CHAT_ID. First real compose up → expect fixes.
3. DNS ridwansharif.com → Cloudflare (re-add portfolio Vercel records) + tunnel hostname hq. → phone install + notifications. Confirm with user before DNS.
4. Calendar: both Google accounts; OAuth (free) both directions; ask which account receives new events.
5. Bot takeover per PLAN §6b, one job at a time (Claude page needs Cloudflare Access first).
6. Android wrapper + widget.
