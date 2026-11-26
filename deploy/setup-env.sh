#!/usr/bin/env bash
# Creates HQ's .env on the server. Run it yourself, from the repo root:
#   bash deploy/setup-env.sh
#
# - Never overwrites an existing .env.
# - Generates the database password, ticker secret and Web Push (VAPID) keys locally.
# - Asks for your HQ login password with hidden input; only a salted PBKDF2 hash is stored.
# - Optionally copies the Telegram fallback values from the SecondBrain bot's .env.
# - Prints no secrets. Result is chmod 600.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV=.env
BOT_ENV="${BOT_ENV:-$HOME/SecondBrain/secondbrain-bot/.env}"

if [ -e "$ENV" ]; then
  echo "✋ $ENV already exists — not touching it. Delete it first if you really want a fresh one." >&2
  exit 1
fi
command -v node >/dev/null || { echo "node is required (it's used only to hash the password and make push keys)" >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

# ── Login password (hidden, typed twice) ─────────────────────────────────────
while true; do
  read -r -s -p "HQ login password (min 10 chars): " PW1; echo
  read -r -s -p "Same again: " PW2; echo
  if [ "$PW1" != "$PW2" ]; then echo "Didn't match, try again."; continue; fi
  if [ "${#PW1}" -lt 10 ]; then echo "Too short, use at least 10 characters."; continue; fi
  break
done

# Password goes to node via an environment variable (not argv, so it never shows in `ps`).
OWNER_LINES="$(HQ_PW="$PW1" node -e '
const c = require("crypto");
const salt = c.randomBytes(16);
const hash = c.pbkdf2Sync(process.env.HQ_PW, salt, 100000, 64, "sha512");
console.log("OWNER_PASSWORD_HASH=" + hash.toString("hex"));
console.log("OWNER_PASSWORD_SALT=" + salt.toString("hex"));
console.log("OWNER_SESSION_SECRET=" + c.randomBytes(32).toString("hex"));
')"
unset PW1 PW2

# ── Web Push keys (P-256, base64url — same format as `web-push generate-vapid-keys`) ──
VAPID_LINES="$(node -e '
const c = require("crypto");
const e = c.createECDH("prime256v1"); e.generateKeys();
console.log("VAPID_PUBLIC_KEY=" + e.getPublicKey().toString("base64url"));
// Private key must be exactly 32 bytes; Node can return 31 when it starts with a zero byte.
const priv = e.getPrivateKey();
console.log("VAPID_PRIVATE_KEY=" + Buffer.concat([Buffer.alloc(32 - priv.length), priv]).toString("base64url"));
')"

# ── Telegram fallback (optional) ─────────────────────────────────────────────
TG_TOKEN=""; TG_CHAT=""
if [ -r "$BOT_ENV" ]; then
  read -r -p "Copy the Telegram bot token + your user id from the SecondBrain bot for the fallback? [y/N] " yn
  if [[ "$yn" =~ ^[Yy]$ ]]; then
    TG_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$BOT_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
    TG_CHAT="$(grep -E '^TELEGRAM_ALLOWED_USER_ID=' "$BOT_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
    [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ] && echo "  ✓ copied" || echo "  ⚠ couldn't find both values; fallback stays off"
  fi
fi

# ── Write .env from the example, filling in the blanks ──────────────────────
umask 077
cp .env.example "$ENV"
set_kv() { # set_kv KEY VALUE  (replaces the KEY= line from the example)
  local k="$1" v="$2"
  if grep -qE "^$k=" "$ENV"; then
    # Use a delimiter that can't appear in hex/base64url values.
    sed -i "s|^$k=.*|$k=$v|" "$ENV"
  else
    echo "$k=$v" >> "$ENV"
  fi
}
set_kv POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_kv CRON_SECRET "$(openssl rand -hex 24)"
while IFS='=' read -r k v; do set_kv "$k" "$v"; done <<< "$OWNER_LINES"
while IFS='=' read -r k v; do set_kv "$k" "$v"; done <<< "$VAPID_LINES"
set_kv TELEGRAM_BOT_TOKEN "$TG_TOKEN"
set_kv TELEGRAM_CHAT_ID "$TG_CHAT"
set_kv LIFEQUEST_VAULT_HOST "$HOME/LifeQuest"
chmod 600 "$ENV"

echo
echo "✓ $ENV created (chmod 600). Filled: database password, ticker secret, login hash, push keys$( [ -n "$TG_TOKEN" ] && echo ", Telegram fallback")."
echo "  Nothing secret was printed. Keep the push keys forever: changing them breaks phone notifications."
