#!/usr/bin/env bash
# WAHALA! private-beta operator tool. One script for everything an operator does. Run from anywhere:   ops/beta/wahala-beta.sh help
# It only calls `docker` and `docker compose`; it never edits the system outside this repository's ops/beta/state folder.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
export BETA_STATE="${BETA_STATE:-$HERE/state}"
export BETA_UID="${BETA_UID:-$(id -u)}" BETA_GID="${BETA_GID:-$(id -g)}"
PROJECT="${BETA_PROJECT:-wahala-beta}"
ENVFILE="$BETA_STATE/beta.env"
dc() {
  if [ -f "$ENVFILE" ]; then docker compose -p "$PROJECT" -f "$HERE/compose.yml" --env-file "$ENVFILE" "$@"
  else docker compose -p "$PROJECT" -f "$HERE/compose.yml" "$@"; fi
}
say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need_init() {
  [ -f "$ENVFILE" ] || die "not set up yet. Run:  ops/beta/wahala-beta.sh init --origin https://YOUR-GAME-PAGE-ORIGIN --web-url https://YOUR-GAME-PAGE"
  [ -s "$BETA_STATE/secrets/invite_codes" ] || { (umask 077; printf 'wb-%s\n' "$(openssl rand -hex 8)" > "$BETA_STATE/secrets/invite_codes"); chmod 644 "$BETA_STATE/secrets/invite_codes"; }
}
have() { command -v "$1" >/dev/null 2>&1; }

usage() { cat <<'U'
WAHALA! private beta: operator commands

  init     --origin URL [--web-url URL] [--domain NAME]   first-time set-up: creates secrets, a temporary certificate and the settings file
  build                                                   build the two service images from this repository
  up                                                      start everything (builds the images first if they do not exist)
  down                                                    stop everything; players' data stays
  status                                                  one-screen health report: services, memory, disk, database, backups, certificate, alerts
  logs [service] [--since 1h]                             show logs (services: edge rumble platform db backup monitor)
  backup                                                  take a database backup now
  backups                                                 list backups
  restore-test [file]                                     prove a backup restores: loads it into a throw-away database and checks it (touches nothing live)
  restore FILE --yes                                      REPLACE the live database with a backup (takes a safety backup first)
  update                                                  deploy the current repository version safely (backup, build, migrate, start, check, auto-rollback)
  rollback                                                go back to the previous images (see the handbook about database changes)
  cert --domain NAME --email ADDRESS [--staging]          get a real TLS certificate (needs the domain to point at this server)
  cert-renew                                              renew the certificate and reload the edge (run weekly)
  admin METHOD PATH [JSON]                                call the platform's operator API from inside the server (never exposed publicly)
  invite new|list|revoke CODE                             invite-only beta: make, show or withdraw the codes that allow creating an account
  rotate NAME                                             replace one secret with a fresh random one and restart what uses it (NAME: admin-token, platform-metrics-token, rumble-metrics-token, match-server-secret, db-password, ticket-key)
  psql                                                    open a database shell
  validate [--full]                                       run the complete automated backend verification (separate throw-away stack)
  destroy --yes                                           REMOVE the whole beta: containers, networks and ALL data (backups in state/backups are kept)
U
}

cmd_init() {
  local origin="" web="" domain="localhost" force=0
  while [ $# -gt 0 ]; do case "$1" in
    --origin) origin="$2"; shift 2;; --web-url) web="$2"; shift 2;; --domain) domain="$2"; shift 2;; --force) force=1; shift;;
    *) die "unknown option $1";; esac; done
  [ -n "$origin" ] || die "--origin is required: the web address players load the game from, e.g. https://yourname.github.io (no path, no trailing slash)"
  case "$origin" in https://*|http://localhost*|http://127.0.0.1*) ;; *) die "--origin must start with https:// (or http://localhost for local tests)";; esac
  [[ "$origin" =~ /$ ]] && die "--origin must not end with a slash"
  [ -n "$web" ] || web="$origin"
  have openssl || die "openssl is required"; have docker || die "docker is required"
  umask 077
  mkdir -p "$BETA_STATE"/{secrets,certs,backups,acme,letsencrypt}
  chmod 700 "$BETA_STATE" "$BETA_STATE/secrets"
  gen() { [ -f "$BETA_STATE/secrets/$1" ] && [ $force -eq 0 ] || { printf '%s' "$2" > "$BETA_STATE/secrets/$1"; say "created secret: $1"; }; }
  local dbpw; dbpw="$(openssl rand -hex 24)"
  [ -f "$BETA_STATE/secrets/db_password" ] && [ $force -eq 0 ] && dbpw="$(cat "$BETA_STATE/secrets/db_password")"
  gen db_password "$dbpw"
  gen database_url "postgres://wahala:${dbpw}@db:5432/wahala"
  gen match_server_secret "$(openssl rand -hex 32)"
  gen admin_token "$(openssl rand -hex 32)"
  gen platform_metrics_token "$(openssl rand -hex 32)"
  gen rumble_metrics_token "$(openssl rand -hex 32)"
  [ -s "$BETA_STATE/secrets/invite_codes" ] && [ $force -eq 0 ] || { printf 'wb-%s\n' "$(openssl rand -hex 8)" > "$BETA_STATE/secrets/invite_codes"; say "created secret: invite_codes (your first invite code is inside; show it with: wahala-beta.sh invite list)"; }
  [ -f "$BETA_STATE/secrets/handoff_private_key" ] && [ $force -eq 0 ] || { openssl genpkey -algorithm ed25519 -out "$BETA_STATE/secrets/handoff_private_key" 2>/dev/null; say "created secret: handoff_private_key (Ed25519)"; }
  # readable by the service users inside the containers; the folder (0700) is what keeps other people on this server out
  chmod 644 "$BETA_STATE"/secrets/*
  if [ ! -f "$BETA_STATE/certs/fullchain.pem" ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=$domain" -addext "subjectAltName=DNS:$domain,DNS:localhost,IP:127.0.0.1" \
      -keyout "$BETA_STATE/certs/privkey.pem" -out "$BETA_STATE/certs/fullchain.pem" 2>/dev/null
    chmod 644 "$BETA_STATE/certs/"*.pem
    say "created a TEMPORARY self-signed certificate (replace it: wahala-beta.sh cert --domain $domain --email you@example.com)"
  fi
  if [ ! -f "$ENVFILE" ] || [ $force -eq 1 ]; then
    cat > "$ENVFILE" <<E
# Non-secret settings (secrets live in state/secrets). Edit, then:  ops/beta/wahala-beta.sh up
GAME_ORIGINS=$origin
PUBLIC_WEB_URL=$web
PLATFORM_GUEST_ONLY=1
# 1 = an account can only be created with an invite code (wahala-beta.sh invite new). Leave at 1 for the beta.
INVITE_ONLY=1
# Ports on this server. 443 and 80 are the normal web ports (the certificate tool needs 80).
EDGE_HTTPS_PORT=443
EDGE_HTTP_PORT=80
# Capacity limits measured in docs/ops/BETA_LOAD_RESULTS.md (change only with new measurements)
RUMBLE_MAX_PLAYING_ROOMS=2
RUMBLE_CPU_BUDGET=70
BACKUP_HOUR_UTC=3
BACKUP_KEEP_DAYS=14
# Optional: a Slack/Discord-compatible webhook URL that receives alerts
BETA_ALERT_WEBHOOK=
E
  fi
  say ""; say "Set-up done. State folder: $BETA_STATE (back it up; it holds every secret). Next:  ops/beta/wahala-beta.sh up"
}

images_present() { docker image inspect wahala-rumble-server:local wahala-player-platform:local >/dev/null 2>&1; }

cmd_build() {
  local sha tag; sha="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  local args=(--build-arg "GIT_SHA=$sha"); [ -n "${EXTRA_CA_DIR:-}" ] && args+=(--build-context "extra-ca=$EXTRA_CA_DIR")
  # keep the previous images so `rollback` has something to return to
  for i in wahala-rumble-server wahala-player-platform; do
    docker image inspect "$i:local" >/dev/null 2>&1 && docker tag "$i:local" "$i:previous" || true
  done
  say "building the match server image (about 1-3 minutes)..."
  docker build "${args[@]}" -f "$ROOT/ops/docker/Dockerfile" -t wahala-rumble-server:local "$ROOT" >"$BETA_STATE/build-rumble.log" 2>&1 || { tail -20 "$BETA_STATE/build-rumble.log"; die "match server build failed (full log: $BETA_STATE/build-rumble.log)"; }
  say "building the player platform image..."
  docker build "${args[@]}" -f "$ROOT/player-platform/Dockerfile" -t wahala-player-platform:local "$ROOT" >"$BETA_STATE/build-platform.log" 2>&1 || { tail -20 "$BETA_STATE/build-platform.log"; die "platform build failed (full log: $BETA_STATE/build-platform.log)"; }
  echo "$sha" > "$BETA_STATE/release"; say "built release $sha"
}

wait_ready() {
  local i; for i in $(seq 1 60); do
    local bad; bad="$(dc ps --format '{{.Service}} {{.State}} {{.Health}}' | awk '$1!="migrate" && $1!="" && ($2!="running" || ($3!="healthy" && $3!=""))' || true)"
    [ -z "$bad" ] && return 0; sleep 2
  done; dc ps; return 1
}

cmd_up() {
  need_init
  images_present || cmd_build
  dc up -d --remove-orphans
  wait_ready || die "some services did not become healthy: run  wahala-beta.sh logs"
  say "the beta backend is running. Check it:  ops/beta/wahala-beta.sh status"
}

cmd_status() {
  need_init
  say "== services"; dc ps
  say ""; say "== memory / cpu"; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $(dc ps -q 2>/dev/null) 2>/dev/null || true
  say ""; say "== disk (this server)"; df -h "$BETA_STATE" | tail -1
  say ""; say "== database"; dc exec -T db psql -U wahala -d wahala -Atc "select 'size: '||pg_size_pretty(pg_database_size('wahala'))||'   players: '||(select count(*) from players)||'   sessions: '||(select count(*) from sessions where revoked_at is null)||'   schema: '||(select max(version) from schema_migrations)" 2>/dev/null || say "database not reachable"
  say ""; say "== backups"
  if [ -f "$BETA_STATE/backups/.last-ok" ]; then say "last good backup: $(cut -d' ' -f1 "$BETA_STATE/backups/.last-ok") ($(( ($(date +%s) - $(stat -c %Y "$BETA_STATE/backups/.last-ok")) / 3600 )) hours ago); files: $(ls "$BETA_STATE"/backups/wahala-*.dump 2>/dev/null | wc -l)"; else say "no backup yet"; fi
  say ""; say "== certificate"; openssl x509 -in "$BETA_STATE/certs/fullchain.pem" -noout -subject -enddate 2>/dev/null || say "no certificate"
  say ""; say "== release"; say "$(cat "$BETA_STATE/release" 2>/dev/null || echo unknown)"
  say ""; say "== recent alerts (monitor)"; dc logs --since 30m monitor 2>/dev/null | grep -v '"level":"ok"' | tail -8 || true; say "(no lines above = no alerts in the last 30 minutes)"
}

cmd_logs() { need_init; local svc=() since=(); while [ $# -gt 0 ]; do case "$1" in --since) since=(--since "$2"); shift 2;; *) svc+=("$1"); shift;; esac; done; dc logs "${since[@]}" --tail 200 "${svc[@]}"; }

cmd_backup() { need_init; dc run --rm backup once; }
cmd_backups() { need_init; ls -lh "$BETA_STATE"/backups/ 2>/dev/null; }

latest_backup() { ls -1t "$BETA_STATE"/backups/wahala-*.dump 2>/dev/null | head -1; }

cmd_restore_test() {
  need_init
  local f="${1:-$(latest_backup)}"; [ -n "$f" ] && [ -f "$f" ] || die "no backup file (take one: wahala-beta.sh backup)"
  local rel; rel="$(basename "$f")"
  say "restoring $rel into a throw-away database (the live database is not touched)..."
  dc exec -T db psql -U wahala -d postgres -qc "drop database if exists wahala_restore_test" -c "create database wahala_restore_test" >/dev/null
  # stream the file in through stdin: pg_restore needs no access to the host folder
  dc exec -T db pg_restore -U wahala -d wahala_restore_test --no-owner --exit-on-error < "$f" || { dc exec -T db psql -U wahala -d postgres -qc "drop database if exists wahala_restore_test" >/dev/null; die "RESTORE FAILED: $rel is not usable"; }
  local q="select (select count(*) from players)||' players, '||(select count(*) from profiles)||' profiles, '||(select count(*) from sessions)||' sessions, '||(select count(*) from audit_events)||' audit rows, schema '||(select max(version) from schema_migrations)"
  local restored live
  restored="$(dc exec -T db psql -U wahala -d wahala_restore_test -Atc "$q")"
  live="$(dc exec -T db psql -U wahala -d wahala -Atc "$q")"
  dc exec -T db psql -U wahala -d postgres -qc "drop database wahala_restore_test" >/dev/null
  say "backup : $restored"; say "live   : $live"
  say "RESTORE TEST PASSED for $rel (the numbers differ only by what happened after the backup)"
}

cmd_restore() {
  need_init
  local f="${1:-}" yes=0; [ -n "$f" ] && [ -f "$f" ] || die "usage: restore FILE --yes   (FILE from: wahala-beta.sh backups)"; [ "${2:-}" = "--yes" ] || die "this REPLACES the live database. Add --yes to confirm."
  say "safety backup of the current database first..."; cmd_backup
  dc stop platform edge >/dev/null
  dc exec -T db psql -U wahala -d postgres -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname='wahala' and pid<>pg_backend_pid()" -c "drop database wahala" -c "create database wahala" >/dev/null
  dc exec -T db pg_restore -U wahala -d wahala --no-owner --exit-on-error < "$f" || die "restore failed: the safety backup is in $BETA_STATE/backups"
  dc run --rm migrate >/dev/null
  dc up -d >/dev/null; wait_ready || die "services unhealthy after restore"
  say "restored $(basename "$f") and restarted the services."
}

cmd_update() {
  need_init
  local before; before="$(cat "$BETA_STATE/release" 2>/dev/null || echo unknown)"
  say "1/5 backup before the release"; cmd_backup
  say "2/5 build"; cmd_build
  say "3/5 migrate + restart"; dc up -d --remove-orphans
  say "4/5 wait for health"
  if wait_ready && quick_check; then say "5/5 release $(cat "$BETA_STATE/release") is live (was $before)"; return 0; fi
  say "the new release is NOT healthy: rolling the images back"
  cmd_rollback
  die "release rolled back to $before. Read the logs (wahala-beta.sh logs) before trying again."
}

cmd_rollback() {
  need_init
  docker image inspect wahala-rumble-server:previous wahala-player-platform:previous >/dev/null 2>&1 || die "no previous images are stored on this server"
  docker tag wahala-rumble-server:previous wahala-rumble-server:local
  docker tag wahala-player-platform:previous wahala-player-platform:local
  dc up -d --force-recreate rumble platform >/dev/null
  wait_ready || die "services unhealthy after the rollback: see the handbook, section 'A release failed'"
  say "rolled back to the previous images."
  say "If the failed release CHANGED THE DATABASE (a new migration), the old build refuses to start. Then restore the pre-release backup: wahala-beta.sh backups ; wahala-beta.sh restore FILE --yes"
}

quick_check() {
  local port; port="$(grep -E '^EDGE_HTTPS_PORT=' "$ENVFILE" | cut -d= -f2)"; port="${port:-443}"
  curl -sk --max-time 8 "https://127.0.0.1:$port/platform-health" | grep -q '"ok":true' && curl -sk --max-time 8 "https://127.0.0.1:$port/health" | grep -q '"ok":true'
}

cmd_cert() {
  need_init
  local domain="" email="" staging=""
  while [ $# -gt 0 ]; do case "$1" in --domain) domain="$2"; shift 2;; --email) email="$2"; shift 2;; --staging) staging="--staging"; shift;; *) die "unknown option $1";; esac; done
  [ -n "$domain" ] && [ -n "$email" ] || die "usage: cert --domain play.example.com --email you@example.com"
  say "asking Let's Encrypt for a certificate for $domain (the domain must already point at this server, port 80 open)..."
  docker run --rm -v "$BETA_STATE/letsencrypt:/etc/letsencrypt" -v "$BETA_STATE/acme:/var/www/acme" certbot/certbot certonly --webroot -w /var/www/acme \
    -d "$domain" --email "$email" --agree-tos --no-eff-email --non-interactive $staging || die "certificate request failed (DNS pointing here? port 80 reachable?)"
  install_cert "$domain"
}
install_cert() {
  local d="$1"; local live="$BETA_STATE/letsencrypt/live/$d"
  [ -f "$live/fullchain.pem" ] || die "no certificate found for $d"
  cp -L "$live/fullchain.pem" "$BETA_STATE/certs/fullchain.pem"; cp -L "$live/privkey.pem" "$BETA_STATE/certs/privkey.pem"; chmod 644 "$BETA_STATE"/certs/*.pem
  dc exec -T edge nginx -s reload >/dev/null && say "certificate installed and the edge reloaded."
}
cmd_cert_renew() {
  need_init
  docker run --rm -v "$BETA_STATE/letsencrypt:/etc/letsencrypt" -v "$BETA_STATE/acme:/var/www/acme" certbot/certbot renew --webroot -w /var/www/acme --non-interactive || die "renewal failed"
  local d; d="$(ls "$BETA_STATE/letsencrypt/live" 2>/dev/null | grep -v README | head -1)"; [ -n "$d" ] && install_cert "$d"
}

cmd_admin() {
  need_init; local method="${1:-}" path="${2:-}" body="${3:-}"; [ -n "$method" ] && [ -n "$path" ] || die "usage: admin GET /admin/v1/reports"
  dc exec -T platform node -e '
    const fs=require("fs");const [m,p,b]=process.argv.slice(1);
    fetch("http://127.0.0.1:4567"+p,{method:m,headers:{authorization:"Bearer "+fs.readFileSync("/run/secrets/admin_token","utf8").trim(),"content-type":"application/json"},body:b||undefined})
      .then(async r=>{console.log(r.status);console.log(await r.text())})' "$method" "$path" "$body"
}

cmd_invite() {
  need_init
  local f="$BETA_STATE/secrets/invite_codes" sub="${1:-}" code="${2:-}"
  case "$sub" in
    new) printf 'wb-%s\n' "$(openssl rand -hex 8)" >> "$f"; chmod 644 "$f"; code="$(tail -1 "$f")"
         dc up -d --force-recreate platform >/dev/null && wait_ready || die "platform did not restart: read the logs"
         say "new invite code (give it to ONE tester): $code";;
    list) say "valid invite codes (anyone holding one can create an account):"; sed 's/^/  /' "$f";;
    revoke) [ -n "$code" ] || die "usage: invite revoke CODE"
         grep -qxF "$code" "$f" || die "that code is not in the list"
         [ "$(grep -cv '^$' "$f")" -gt 1 ] || die "that is the last code: add a new one first (invite new), an invite-only beta must never be left without codes"
         grep -vxF "$code" "$f" > "$f.tmp" && mv "$f.tmp" "$f"; chmod 644 "$f"
         dc up -d --force-recreate platform >/dev/null && wait_ready || die "platform did not restart: read the logs"
         say "revoked. People who already have an account keep it; only NEW accounts need a valid code.";;
    *) die "usage: invite new | invite list | invite revoke CODE";;
  esac
}

# Secret rotation. The old value is kept in state/secrets-old (0700) so a bad rotation can be put back by hand; nothing else is touched.
cmd_rotate() {
  need_init
  local name="${1:-}" file users new
  case "$name" in
    admin-token)           file=admin_token;            users="platform";;
    platform-metrics-token) file=platform_metrics_token; users="platform monitor";;
    rumble-metrics-token)  file=rumble_metrics_token;   users="rumble monitor";;
    match-server-secret)   file=match_server_secret;    users="platform rumble";;
    ticket-key)            file=handoff_private_key;    users="platform";;
    db-password)           file=db_password;            users="platform backup";;
    *) die "usage: rotate NAME   (NAME: admin-token, platform-metrics-token, rumble-metrics-token, match-server-secret, db-password, ticket-key)";;
  esac
  have openssl || die "openssl is required"
  umask 077; mkdir -p "$BETA_STATE/secrets-old"; chmod 700 "$BETA_STATE/secrets-old"
  cp -p "$BETA_STATE/secrets/$file" "$BETA_STATE/secrets-old/$file.$(date -u +%Y%m%dT%H%M%SZ)"
  if [ "$name" = ticket-key ]; then
    openssl genpkey -algorithm ed25519 -out "$BETA_STATE/secrets/$file.new" 2>/dev/null
    mv "$BETA_STATE/secrets/$file.new" "$BETA_STATE/secrets/$file"
  elif [ "$name" = db-password ]; then
    new="$(openssl rand -hex 24)"
    # change it inside PostgreSQL first (over the container's own local socket), then in the files that carry it
    printf "ALTER USER wahala PASSWORD '%s';" "$new" | dc exec -T db psql -U wahala -d postgres -q >/dev/null || die "could not change the database password (nothing else was changed)"
    printf '%s' "$new" > "$BETA_STATE/secrets/db_password"; printf 'postgres://wahala:%s@db:5432/wahala' "$new" > "$BETA_STATE/secrets/database_url"
  else
    printf '%s' "$(openssl rand -hex 32)" > "$BETA_STATE/secrets/$file"
  fi
  chmod 644 "$BETA_STATE"/secrets/*
  say "new $name written (old copy kept in $BETA_STATE/secrets-old). Restarting: $users"
  dc up -d --force-recreate $users >/dev/null || die "restart failed: read the logs; the old secret is in $BETA_STATE/secrets-old"
  wait_ready || die "services unhealthy after the rotation: read the logs; the old secret is in $BETA_STATE/secrets-old"
  say "rotated $name."
  case "$name" in
    ticket-key) say "Match tickets are valid for 120 seconds: tickets signed with the old key stop working at once, players simply ask for a new one. The match server must re-read /.well-known/jwks.json (see docs/ops/BETA_INTEGRATION_HANDOFF.md).";;
    db-password) say "Backups use the new password from now on.";;
  esac
}

cmd_psql() { need_init; dc exec db psql -U wahala -d wahala; }
cmd_validate() { exec "$HERE/validate.sh" "$@"; }
cmd_destroy() {
  need_init; [ "${1:-}" = "--yes" ] || die "this REMOVES the containers, networks and the database volume. Backups in state/backups are kept. Add --yes to confirm."
  dc down -v --remove-orphans; say "the beta backend is gone. Your secrets, certificates and backups remain in $BETA_STATE (delete that folder to remove them too)."
}

c="${1:-help}"; shift || true
case "$c" in
  help|-h|--help) usage;; init) cmd_init "$@";; build) cmd_build;; up) cmd_up;; down) need_init; dc down;; status) cmd_status;; logs) cmd_logs "$@";;
  backup) cmd_backup;; backups) cmd_backups;; restore-test) cmd_restore_test "$@";; restore) cmd_restore "$@";; update) cmd_update;; rollback) cmd_rollback;;
  cert) cmd_cert "$@";; cert-renew) cmd_cert_renew;; admin) cmd_admin "$@";; rotate) cmd_rotate "$@";; invite) cmd_invite "$@";; psql) cmd_psql;; validate) cmd_validate "$@";; destroy) cmd_destroy "$@";;
  *) usage; exit 2;;
esac
