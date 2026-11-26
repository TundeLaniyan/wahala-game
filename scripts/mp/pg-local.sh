#!/usr/bin/env bash
# A throw-away REAL PostgreSQL for the private multiplayer test (docs/PLATFORM_LOCAL_TEST.md). Development machines only.
#   scripts/mp/pg-local.sh start   -> prints DATABASE_URL on stdout (last line); data in $PG_DIR (default /var/tmp/wahala-pg)
#   scripts/mp/pg-local.sh stop
#   scripts/mp/pg-local.sh reset   -> stop and delete the data
# Needs the PostgreSQL server binaries (Debian/Ubuntu: `apt install postgresql`); they are found under /usr/lib/postgresql/*/bin.
# Runs as the `postgres` OS user when started as root (initdb refuses root), otherwise as you.
set -euo pipefail
PG_DIR="${PG_DIR:-/var/tmp/wahala-pg}"
PG_PORT="${PG_PORT:-54329}"
PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -x "${PG_BIN:-/nonexistent}/pg_ctl" ] || { echo "PostgreSQL server binaries not found (apt install postgresql)" >&2; exit 2; }
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
url() { echo "postgres://postgres@127.0.0.1:${PG_PORT}/wahala_platform"; }
case "${1:-}" in
  start)
    if [ ! -f "$PG_DIR/PG_VERSION" ]; then
      mkdir -p "$PG_DIR"; [ "$(id -u)" = 0 ] && chown postgres:postgres "$PG_DIR"
      as_pg "$PG_BIN/initdb -D '$PG_DIR' -U postgres --auth=trust -E UTF8 >/dev/null"
    fi
    if ! as_pg "$PG_BIN/pg_ctl -D '$PG_DIR' status >/dev/null 2>&1"; then
      as_pg "$PG_BIN/pg_ctl -D '$PG_DIR' -o '-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1' -l '$PG_DIR/server.log' -w start >/dev/null"
    fi
    as_pg "$PG_BIN/psql -h 127.0.0.1 -p $PG_PORT -U postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='wahala_platform'\" | grep -q 1 || $PG_BIN/createdb -h 127.0.0.1 -p $PG_PORT -U postgres wahala_platform"
    url ;;
  stop) as_pg "$PG_BIN/pg_ctl -D '$PG_DIR' -m fast -w stop >/dev/null 2>&1 || true" ;;
  reset) "$0" stop; rm -rf "$PG_DIR" ;;
  *) echo "usage: $0 start|stop|reset" >&2; exit 1 ;;
esac
