#!/bin/sh
# Nightly pg_dump for the HQ database. Runs inside the postgres:18 image.
# Writes ./backups/hq-YYYY-MM-DD_HHMM.dump (custom format, restore with pg_restore)
# and deletes dumps older than BACKUP_KEEP_DAYS. Sync ./backups off this machine (NAS/Syncthing).
set -u

dump() {
  f="/backups/hq-$(date +%F_%H%M).dump"
  if pg_dump -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "$(date -Is) backup ok: $f ($(du -h "$f" | cut -f1))"
  else
    rm -f "$f.tmp"
    echo "$(date -Is) BACKUP FAILED" >&2
  fi
  find /backups -name 'hq-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
}

mkdir -p /backups
dump   # one on startup, so a fresh deploy has a backup immediately
while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_HOUR}:00" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_HOUR}:00" +%s)
  sleep $((next - now))
  dump
done
