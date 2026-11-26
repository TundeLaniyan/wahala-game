#!/bin/sh
# Nightly PostgreSQL backup (runs inside the `backup` service; also `docker compose run --rm backup once` for a manual one).
#   - custom-format dump (compressed, restorable table by table), written as .part and renamed only when COMPLETE and READABLE
#   - files are 0600; BACKUP_KEEP_DAYS days are kept; /backups/.last-ok is the heartbeat the monitor reads
#   - a backup on the same disk is a convenience, not a backup: copy state/backups off the server (docs/ops/BETA_HANDBOOK.md)
set -eu
umask 077
: "${BACKUP_HOUR_UTC:=3}" "${BACKUP_KEEP_DAYS:=14}"
printf 'db:5432:%s:%s:%s\n' "$PGDATABASE" "$PGUSER" "$(cat /run/secrets/db_password)" > "$PGPASSFILE"
chmod 600 "$PGPASSFILE"

backup() {
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  f="/backups/wahala-$ts.dump"
  if pg_dump --format=custom --no-owner --file="$f.part" && pg_restore --list "$f.part" >/dev/null; then
    mv "$f.part" "$f"
    echo "$ts $(wc -c <"$f")" > /backups/.last-ok
    echo "backup ok: wahala-$ts.dump $(wc -c <"$f") bytes"
  else
    rm -f "$f.part"
    echo "backup FAILED" >&2
    return 1
  fi
  find /backups -maxdepth 1 -name 'wahala-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
}

if [ "${1:-}" = once ]; then backup; exit $?; fi

# a restart must not leave a day without a backup: take one now unless the last is under 20 hours old
if [ ! -f /backups/.last-ok ] || [ -n "$(find /backups/.last-ok -mmin +1200)" ]; then backup || true; fi
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%F) $(printf '%02d' "$BACKUP_HOUR_UTC"):00:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  backup || true
done
