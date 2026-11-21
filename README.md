# HQ

**hq.ridwansharif.com** — an early version of LifeQuest.

Self-hosted personal task tracker built for an ADHD brain: quick capture, a Today list, repeating
tasks and habits, plus the LifeQuest quests board. Single owner. Runs entirely on the homelab:
the app and its own Postgres database, with nothing shared with ARCNIR.

- Plan, data model, phases: [`PLAN.md`](PLAN.md)
- App code: [`web/`](web/) (Next.js 16, Prisma, Postgres 18, Tailwind 4)

## Stack

```mermaid
flowchart LR
  U[Browser / phone] -->|HTTPS| CF[Cloudflare Tunnel]
  CF --> W[web<br/>Next.js]
  L[LAN testing<br/>:3100] -.-> W
  W --> DB[(db<br/>postgres:18)]
  M[migrate<br/>runs on every start] --> DB
  B[backup<br/>nightly pg_dump] --> DB
  T[tools<br/>seed / vault import] --> DB
  DB --- D[./data/postgres]
  B --- K[./backups]
```

| Service | What it does |
|---|---|
| `db` | Postgres 18. Data in `./data/postgres`. No published port; only other containers can reach it. |
| `migrate` | Applies database migrations, then exits. `web` waits for it. |
| `web` | The app on port 3000 inside Docker, published as `3100` on the host. |
| `ticker` | Pokes HQ every minute so due reminders and the morning digest get sent. |
| `backup` | One `pg_dump` at startup, then nightly at `BACKUP_HOUR`, into `./backups`, kept `BACKUP_KEEP_DAYS` days. |
| `tools` | One-off jobs (`docker compose run --rm tools …`). Not started by `up`. |
| `cloudflared` | Public HTTPS via Cloudflare Tunnel. Only with `--profile tunnel`. |

## First deploy (Kali server)

1. **Clone** the repo (GitHub: `LifeQuest`) into `~/hq`, **not** `~/LifeQuest` — that folder is the
   Obsidian vault the Telegram bot mounts:
   ```bash
   git clone https://github.com/Ridwan155-Akasake/LifeQuest.git ~/hq && cd ~/hq
   ```

2. **Create `.env`** from the example:
   ```bash
   cp .env.example .env
   ```
   - `POSTGRES_PASSWORD`: generate one with `openssl rand -hex 24`.
   - `OWNER_PASSWORD_*` / `OWNER_SESSION_SECRET`: generate on any machine with Node, from `web/`:
     `npm run hash-password -- "your password"`, then paste the 3 lines into `.env`.
   - `LIFEQUEST_VAULT_HOST`: absolute path to the Syncthing copy of the LifeQuest vault on the server.
   - `CRON_SECRET`: `openssl rand -hex 24`.
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: from `web/`, run `npm run vapid` **once**. Regenerating
     them later silently breaks every phone's notifications.
   - Optional Telegram fallback: `TELEGRAM_BOT_TOKEN` (the SecondBrain bot's token) and
     `TELEGRAM_CHAT_ID` (your Telegram user id). Only used when no device receives a reminder.
   - To test from another device on your LAN before the tunnel exists, set `WEB_BIND=0.0.0.0` and
     `COOKIE_SECURE=false`.

3. **Create the folders** as your normal user, so the containers can write to them:
   ```bash
   mkdir -p data backups vault-backups
   ```

4. **Start it:**
   ```bash
   docker compose up -d --build
   docker compose ps
   ```
   `migrate` should show `Exited (0)`, and `web` and `db` should be `healthy`.

5. **Seed the boards:**
   ```bash
   docker compose run --rm tools npm run db:seed
   ```

6. **Import LifeQuest:** do the dry run first and read the output.
   ```bash
   docker compose run --rm tools npm run vault:import
   docker compose run --rm tools npm run vault:import -- --apply
   ```
   `--apply` writes `lq_id:` into each quest file and backs up the originals to `./vault-backups/` first.

7. **Open it:** `http://<server-ip>:3100` (LAN) or `http://localhost:3100` on the server.

## Notifications (needs the public HTTPS URL)

Push notifications only work over HTTPS, so do this after the tunnel is live:
1. On your Android phone open `https://hq.ridwansharif.com` in Chrome, sign in.
2. Chrome menu ⋮ → **Install app**. Open HQ from the new icon.
3. **Settings → Turn on notifications**, then **Send test notification**.

Tasks with a time ("call dentist at 3pm", "check oven in 20 min") ping at that time with
**Done** and **Snooze 1h** buttons. The morning summary arrives at `DIGEST_TIME`.
Check delivery with `docker compose logs ticker`.

## Backups and restore

Dumps land in `./backups/hq-YYYY-MM-DD_HHMM.dump`. **Sync that folder off the laptop**
(NAS or Syncthing). A backup that lives only on the same disk dies with that disk.

Check the backup log with `docker compose logs backup`. To test a restore (do this once after the first deploy):

```bash
docker compose exec -T db pg_restore -U hq -d hq --clean --if-exists < backups/<file>.dump
```

## Public access (Cloudflare Tunnel)

1. Cloudflare Zero Trust → Networks → Tunnels → create a tunnel and copy its token into `CF_TUNNEL_TOKEN`.
2. Add a public hostname, `hq.ridwansharif.com`, pointing to service `http://web:3000`.
   This requires the `ridwansharif.com` DNS zone to be on Cloudflare.
3. Start it with `docker compose --profile tunnel up -d`.
4. Set `APP_URL=https://<sub>.ridwansharif.com`, `WEB_BIND=127.0.0.1` and `COOKIE_SECURE=true`,
   then run `docker compose up -d`.
5. Optional: put Cloudflare Access in front of the hostname as a second lock.

## Updating

```bash
git pull
docker compose up -d --build   # migrate runs automatically before web starts
```

## Local development (Windows)

From `web/`: copy `.env.example` → `.env`, point `DATABASE_URL` at a Postgres, then run
`npm install`, `npm run db:deploy`, `npm run db:seed`, `npm run dev`.
