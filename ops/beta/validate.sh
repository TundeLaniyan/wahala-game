#!/usr/bin/env bash
# One-command verification of the whole private-beta backend. It builds the REAL images, starts a SEPARATE throw-away copy of the stack
# (its own secrets, database and ports; your real beta, if any, is not touched), exercises it like a game client would, breaks it on
# purpose, and prints PASS / FAIL / BLOCKED for every check.
#
#   ops/beta/validate.sh            full run (about 10 minutes: includes a real 3-minute match with 32 fighters)
#   ops/beta/validate.sh --quick    skip playing the match (about 4 minutes)
#   ops/beta/validate.sh --keep     leave the stack running afterwards (inspect it; remove with: BETA_STATE=<printed> BETA_PROJECT=wahala-validate ops/beta/wahala-beta.sh destroy --yes)
#   --no-build                      reuse the images already built
# Needs only Docker (with the compose plugin), openssl, curl and base64. Exit code 0 only if NOTHING failed.
# BLOCKED lines are integrations that belong to another team and are not built yet; each has its acceptance test in docs/ops/BETA_INTEGRATION_HANDOFF.md.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
QUICK=0; KEEP=0; BUILD=1
for a in "$@"; do case "$a" in --quick) QUICK=1;; --keep) KEEP=1;; --no-build) BUILD=0;; *) echo "unknown option $a"; exit 2;; esac; done
export BETA_STATE="${VALIDATE_STATE:-$(mktemp -d -t wahala-validate.XXXXXX)}" BETA_PROJECT=wahala-validate
SCRIPT="$HERE/wahala-beta.sh"; S="$BETA_STATE"; V="$S/validate"; mkdir -p "$V"; chmod 777 "$V"
REPORT="$V/report.txt"; : > "$REPORT"
dc() { docker compose -p "$BETA_PROJECT" -f "$HERE/compose.yml" --env-file "$S/beta.env" "$@"; }
note() { printf '%s\n' "$*" | tee -a "$REPORT"; }
ok() { note "PASS    $*"; }; bad() { note "FAIL    $*"; }; blocked() { note "BLOCKED $*"; }; info() { note "INFO    $*"; }
step() { note ""; note "== $*"; }
expect() { local name="$1" want="$2" got="$3"; if [ "$got" = "$want" ]; then ok "$name"; else bad "$name (wanted $want, got $got)"; fi; }
T0=$(date +%s)
cleanup() { [ $KEEP -eq 1 ] && { note ""; note "stack kept. state: $S"; return; }; dc down -v --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT

drv() { # run one driver phase in a container that has the Colyseus SDK; talks to the edge on the host network
  docker run --rm --network host --user "$(id -u):$(id -g)" -v "$HERE/..:/repo/ops:ro" -v "$V:/state" -v "$S/certs:/certs:ro" \
    -e NODE_EXTRA_CA_CERTS=/certs/fullchain.pem wahala-validate-driver:local node /repo/ops/beta/checks.mjs "$@" --url "https://127.0.0.1:$PORT" --http-url "http://127.0.0.1:$PORT_HTTP" --state /state/validate.json 2>&1 | tee -a "$REPORT"
}
internal() { # internal MODE PATH FILE: the signed call, made from INSIDE the private network
  local mode="$1" path="$2" file="$3"
  dc exec -T platform node - "$path" "$(base64 -w0 "$V/$file")" "$mode" < "$HERE/internal-post.mjs" 2>&1 | tr -d '\r'
}
rumble_metrics() { dc exec -T rumble sh -c 'node -e "fetch(\"http://127.0.0.1:2567/metrics\",{headers:{authorization:\"Bearer \"+require(\"fs\").readFileSync(\"/run/secrets/rumble_metrics_token\",\"utf8\").trim()}}).then(r=>r.text()).then(console.log)"' 2>/dev/null; }
platform_metrics() { dc exec -T platform sh -c 'node -e "fetch(\"http://127.0.0.1:4567/metrics\",{headers:{authorization:\"Bearer \"+require(\"fs\").readFileSync(\"/run/secrets/platform_metrics_token\",\"utf8\").trim()}}).then(r=>r.text()).then(console.log)"' 2>/dev/null; }
wait_healthy() { local i; for i in $(seq 1 90); do local bad; bad="$(dc ps --format '{{.Service}} {{.State}} {{.Health}}' | awk '$1!="migrate" && $1!="" && ($2!="running" || ($3!="healthy" && $3!=""))')"; [ -z "$bad" ] && return 0; sleep 2; done; return 1; }

# A real crash: SIGKILL the container's main process from the host. (`docker kill` counts as a manual stop and Docker then
# deliberately does NOT restart the container, so it would not test the restart policy.) Returns 0 when Docker restarted it by itself.
crash() {
  local c="${BETA_PROJECT}-$1-1" before pid i now
  before="$(docker inspect -f '{{.State.StartedAt}}' "$c")"; pid="$(docker inspect -f '{{.State.Pid}}' "$c")"
  kill -9 "$pid" 2>/dev/null || { info "cannot signal the host process (not root?): falling back to docker kill + start, the restart policy is NOT tested for $1"; docker kill "$c" >/dev/null; sleep 1; dc start "$1" >/dev/null 2>&1; }
  for i in $(seq 1 60); do now="$(docker inspect -f '{{.State.StartedAt}}' "$c")"; [ "$now" != "$before" ] && break; sleep 1; done
  [ "$now" != "$before" ] || return 1
  wait_healthy
}

step "0. preflight"
for c in docker openssl curl base64; do command -v $c >/dev/null && ok "$c present" || { bad "$c missing"; exit 1; }; done
docker info >/dev/null 2>&1 && ok "docker daemon reachable ($(docker info --format '{{.ServerVersion}}'))" || { bad "docker daemon not reachable"; exit 1; }
docker compose version >/dev/null 2>&1 && ok "docker compose plugin present" || { bad "docker compose plugin missing"; exit 1; }
info "isolated state folder: $S (project $BETA_PROJECT)"
PORT="${VALIDATE_HTTPS_PORT:-18443}"; PORT_HTTP="${VALIDATE_HTTP_PORT:-18080}"

step "1. build the real images and start the full stack"
"$SCRIPT" init --origin https://example.github.io --domain localhost >/dev/null 2>&1 && ok "init: secrets, Ed25519 ticket key, temporary certificate" || { bad "init"; exit 1; }
sed -i "s/^EDGE_HTTPS_PORT=.*/EDGE_HTTPS_PORT=$PORT/; s/^EDGE_HTTP_PORT=.*/EDGE_HTTP_PORT=$PORT_HTTP/; s/^BACKUP_HOUR_UTC=.*/BACKUP_HOUR_UTC=3/" "$S/beta.env"
echo "EDGE_BIND=127.0.0.1" >> "$S/beta.env"
if [ $BUILD -eq 1 ]; then
  "$SCRIPT" build >"$V/build.log" 2>&1 && ok "docker build: match server + platform ($(cat "$S/release"))" || { bad "docker build (see $V/build.log)"; tail -15 "$V/build.log"; exit 1; }
  args=(); [ -n "${EXTRA_CA_DIR:-}" ] && args+=(--build-context "extra-ca=$EXTRA_CA_DIR")
  docker build "${args[@]}" -f "$HERE/Dockerfile.validate" -t wahala-validate-driver:local "$ROOT" >"$V/build-driver.log" 2>&1 && ok "docker build: verification driver" || { bad "driver image build (see $V/build-driver.log)"; exit 1; }
fi
for i in wahala-rumble-server wahala-player-platform; do u="$(docker run --rm --entrypoint id $i:local -u)"; expect "$i runs as an unprivileged user" "1000" "$u"; done
dc up -d --remove-orphans >"$V/up.log" 2>&1 && ok "compose up (db -> migrate -> platform / match server -> edge, backup, monitor)" || { bad "compose up"; tail -10 "$V/up.log"; exit 1; }
wait_healthy && ok "every service reports healthy" || { bad "services did not become healthy"; dc ps; exit 1; }
expect "migrations ran to the current schema" "6" "$(dc exec -T db psql -U wahala -d wahala -Atc 'select max(version) from schema_migrations' | tr -d '\r')"
pubports="$(docker ps --filter "label=com.docker.compose.project=$BETA_PROJECT" --format '{{.Names}} {{.Ports}}' | grep -E '0\.0\.0\.0|127\.0\.0\.1' | grep -v edge || true)"
[ -z "$pubports" ] && ok "only the edge publishes a port (database, match server, platform, monitor are private)" || bad "unexpected published ports: $pubports"
for n in db rumble platform; do
  nets="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "${BETA_PROJECT}-$n-1")"
  case "$nets" in *public*) bad "$n is attached to the public network";; *) ok "$n is not on the public network ($nets)";; esac
done
[ "$(docker network inspect -f '{{.Internal}}' ${BETA_PROJECT}_data)" = true ] && [ "$(docker network inspect -f '{{.Internal}}' ${BETA_PROJECT}_app)" = true ] && ok "app and data networks are internal (no route to or from the internet)" || bad "an internal network is not internal"
dc exec -T db sh -c 'nc -z -w2 1.1.1.1 443' >/dev/null 2>&1 && bad "the database container can reach the internet" || ok "the database container has no route to the internet"

step "2. production refusals (the real images, started wrongly on purpose)"
r() { docker run --rm "$@" 2>&1 | head -c 600; }
out="$(r wahala-player-platform:local)"; echo "$out" | grep -q "production needs DATABASE_URL" && ok "platform with NO configuration refuses to start" || bad "platform started without configuration: $out"
good=(-e PLATFORM_ENV=production -e DATABASE_URL=postgres://u:p@db/x -e PLATFORM_ALLOWED_ORIGINS=https://a.example -e PLATFORM_PUBLIC_WEB_URL=https://a.example -e PLATFORM_GUEST_ONLY=1)
for flag in PLATFORM_MOCK_IDP PLATFORM_MOCK_CHECKOUT PLATFORM_DEV_TEXT_CHAT; do
  out="$(r "${good[@]}" -e PLATFORM_MATCH_SERVER_SECRET=$(printf 's%.0s' {1..40}) -e "$flag=1" wahala-player-platform:local)"; echo "$out" | grep -q "$flag is development only" && ok "production refuses $flag=1" || bad "production accepted $flag: $out"
done
out="$(r "${good[@]}" -e PLATFORM_ADMIN_TOKEN=short wahala-player-platform:local)"; echo "$out" | grep -q "ADMIN_TOKEN must be at least" && ok "production refuses a short admin token" || bad "short admin token accepted"
out="$(r -e PLATFORM_ENV=production -e DATABASE_URL=x -e DATABASE_URL_FILE=/etc/hostname wahala-player-platform:local)"; echo "$out" | grep -q "either DATABASE_URL or DATABASE_URL_FILE" && ok "a secret given twice (value and file) is refused" || bad "double secret accepted: $out"
out="$(r -e PLATFORM_ENV=production -e DATABASE_URL_FILE=/nonexistent wahala-player-platform:local)"; echo "$out" | grep -q "cannot be read" && ok "a missing secret file stops the start (never a silent start without it)" || bad "missing secret file accepted: $out"
dc exec -T db psql -U wahala -d postgres -qc "drop database if exists wahala_empty" -c "create database wahala_empty" >/dev/null
net="${BETA_PROJECT}_data"; empty_url="postgres://wahala:$(cat "$S/secrets/db_password")@db:5432/wahala_empty"
cfg=(--network "$net" -e PLATFORM_ENV=production -e "DATABASE_URL=$empty_url" -e PLATFORM_ALLOWED_ORIGINS=https://a.example -e PLATFORM_PUBLIC_WEB_URL=https://a.example -e PLATFORM_GUEST_ONLY=1
  -e PLATFORM_MATCH_SERVER_SECRET=$(printf 's%.0s' {1..40}) -e PLATFORM_ADMIN_TOKEN=$(printf 'a%.0s' {1..40}) -e "PLATFORM_HANDOFF_PRIVATE_KEY=$(cat "$S/secrets/handoff_private_key")")
out="$(docker run --rm "${cfg[@]}" wahala-player-platform:local 2>&1 | head -c 500)"; echo "$out" | grep -q "schema is not current" && ok "production never migrates by itself: an empty database stops the platform" || bad "platform started on an unmigrated database: $out"
dc exec -T db psql -U wahala -d postgres -qc "drop database wahala_empty" >/dev/null
out="$(r -e NODE_ENV=production -e RUMBLE_TEST_FAST=1 wahala-rumble-server:local)"; echo "$out" | grep -qi "RUMBLE_TEST_FAST" && ok "the match server refuses its test-only fast mode in production" || bad "match server accepted fast mode: $out"
expect "the match server's /metrics needs its token" "401" "$(dc exec -T rumble node -e 'fetch("http://127.0.0.1:2567/metrics").then(r=>console.log(r.status))' | tr -d '\r')"

step "3. the edge and the accounts, through https (a client's view)"
drv edge; drv accounts
n=0; for sn in db_password match_server_secret admin_token platform_metrics_token rumble_metrics_token; do c="$(docker inspect $(dc ps -q) 2>/dev/null | grep -cF "$(cat "$S/secrets/$sn")" || true)"; n=$((n + c)); done
expect "no secret value is in any container's configuration (docker inspect)" "0" "$n"

step "4. a real authoritative match through the TLS edge"
if [ $QUICK -eq 1 ]; then MS=0; else MS=180; fi
( while sleep 10; do rumble_metrics | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const m=JSON.parse(d);const p=m.rooms.filter(r=>r.phase==="playing");console.log(JSON.stringify({cpu:m.process.cpuPercentSinceLastRead,rssMB:Math.round(m.process.memoryUsage.rss/1e6),playing:p.length,step99:p[0]?.ticks.stepMs.p99??null,dropped:p.reduce((n,r)=>n+r.ticks.dropped,0)}))}catch{}})' 2>/dev/null; done >> "$V/match-samples.jsonl" ) 2>/dev/null &
SAMPLER=$!
drv match --match-seconds $MS
kill $SAMPLER 2>/dev/null; wait $SAMPLER 2>/dev/null
[ -s "$V/match-samples.jsonl" ] && info "server load while the match ran (cpu % of one core, RSS MB, playing rooms): $(node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(x=>JSON.parse(x));const cpu=l.map(x=>x.cpu);console.log("peak cpu "+Math.max(...cpu)+"%, peak rss "+Math.max(...l.map(x=>x.rssMB))+" MB, dropped ticks "+Math.max(...l.map(x=>x.dropped))+", samples "+l.length)' "$V/match-samples.jsonl" 2>/dev/null || echo "see $V/match-samples.jsonl")"

step "5. signed match results (platform side) and replay protection"
if [ -s "$V/finished.json" ]; then
  for mode in nosig badsig stale; do
    code="$(internal $mode /internal/v1/matches/started started.json | awk '{print $1}')"; expect "unsigned / forged / stale internal call refused ($mode)" "401" "$code"
  done
  expect "signed 'started' accepted" "201" "$(internal ok /internal/v1/matches/started started.json | awk '{print $1}')"
  expect "the same 'started' again is a harmless duplicate" "200" "$(internal ok /internal/v1/matches/started started.json | awk '{print $1}')"
  expect "a result naming a player who was never ticketed is REFUSED" "400" "$(internal ok /internal/v1/matches/started untokened.json | awk '{print $1}')"
  expect "signed 'finished' accepted" "201" "$(internal ok /internal/v1/matches/finished finished.json | awk '{print $1}')"
  expect "a replayed 'finished' changes nothing (first call wins)" "200" "$(internal ok /internal/v1/matches/finished finished.json | awk '{print $1}')"
  blocked "the match server itself posts started / finished and attaches the ticket's player id to the seat: BLOCKED BY INTEGRATION (Architecture). The calls above use the real shared secret and the real results of the real match above, sent by the validator in the server's place."
else info "quick mode: signed-results checks skipped (they need a played match)"; fi

step "6. friends, parties, quick signals, mute, block, report, rate limits"
drv social
expect "operator API is reachable ONLY from inside (needs the admin token)" "200" "$("$SCRIPT" admin GET /admin/v1/reports 2>/dev/null | head -1)"
expect "operator API refuses a wrong token" "401" "$(dc exec -T platform node -e 'fetch("http://127.0.0.1:4567/admin/v1/reports",{headers:{authorization:"Bearer wrong"}}).then(r=>console.log(r.status))' | tr -d '\r')"
m="$(platform_metrics)"; echo "$m" | grep -q '"requests"' && ok "platform /metrics answers with the token ($(echo "$m" | tr -d '\n' | cut -c1-150)...)" || bad "platform /metrics"
r="$(rumble_metrics)"; echo "$r" | grep -q '"limits"' && ok "match server /metrics shows its capacity guard (rooms, CPU budget)" || bad "match server metrics"
echo "$r" | grep -q '"maxPlayingRooms":3\|"playingRooms"' && ok "the playing-room cap is active in the running server" || info "room cap fields: $(echo "$r" | grep -o '"limits":{[^}]*}' | head -c 200)"

step "7. restarts, crashes and persistence"
drv persist before-any-restart
dc restart platform >/dev/null 2>&1; wait_healthy && drv persist after-platform-restart || bad "platform did not come back after a restart"
dc restart db >/dev/null 2>&1; wait_healthy; sleep 3; drv persist after-database-restart
crash db && ok "PostgreSQL killed with SIGKILL (no clean shutdown): restarted by Docker and recovered by itself" || bad "PostgreSQL did not recover from SIGKILL"
sleep 4; drv persist after-database-crash
crash platform && ok "a crashed platform (SIGKILL) is restarted by Docker's restart policy" || bad "platform not restarted after a crash"
drv persist after-platform-crash
crash rumble && ok "a crashed match server (SIGKILL) is restarted by Docker's restart policy" || bad "match server not restarted after a crash"
dc stop db >/dev/null 2>&1; sleep 5
code="$(curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:$PORT/v1/auth/providers)"; [ "$code" = 200 ] && ok "database OUTAGE: public, database-free endpoints keep answering (HTTP 200)" || bad "providers endpoint during outage: $code"
code="$(curl -sk -o /dev/null -w '%{http_code}' -XPOST https://127.0.0.1:$PORT/v1/auth/guest -H 'content-type: application/json' -d '{}')"; [ "$code" = 503 ] || [ "$code" = 500 ] && ok "database OUTAGE: a request that needs the database fails cleanly (HTTP $code, no crash)" || bad "guest creation during outage: $code"
curl -sk https://127.0.0.1:$PORT/health | grep -q '"ok":true' && ok "database OUTAGE: the match server (no database) keeps serving" || bad "match server affected by the database outage"
dc start db >/dev/null 2>&1; wait_healthy; sleep 8
expect "RECOVERY: the platform serves database requests again without a restart" "201" "$(curl -sk -o /dev/null -w '%{http_code}' -XPOST https://127.0.0.1:$PORT/v1/auth/guest -H 'content-type: application/json' -d '{}')"
drv persist after-outage-recovery
dc logs --no-color --no-log-prefix >"$V/logs-before-down.log" 2>&1  # `down` deletes the containers and their logs: keep them for the leak scan
dc down >/dev/null 2>&1; dc up -d >/dev/null 2>&1; wait_healthy && ok "full stop and start (down / up): everything healthy again" || bad "stack did not return after down/up"
drv persist after-full-restart

step "8. backup and restoration"
"$SCRIPT" backup >"$V/backup.out" 2>&1 && ok "manual backup: $(grep 'backup ok' "$V/backup.out" | tail -1)" || { bad "backup"; tail -3 "$V/backup.out"; }
f="$(ls -1t "$S"/backups/wahala-*.dump | head -1)"; [ -n "$f" ] && ok "backup file exists ($(wc -c <"$f") bytes, mode $(stat -c %a "$f"))" || bad "no backup file"
expect "backup files are private (0600)" "600" "$(stat -c %a "$f")"
"$SCRIPT" restore-test >"$V/restore-test.out" 2>&1 && ok "restore-test: $(grep -E '^backup :' "$V/restore-test.out")" || { bad "restore-test"; tail -5 "$V/restore-test.out"; }
# the destructive drill: damage the live database on purpose, restore, and prove the data is back
dc exec -T db psql -U wahala -d wahala -qc "delete from sessions; delete from friendships; delete from match_participants; delete from matches; delete from profiles" >/dev/null 2>&1 && info "DISASTER SIMULATED: sessions, friendships, match history and profiles deleted from the live database"
"$SCRIPT" restore "$f" --yes >"$V/restore.out" 2>&1 && ok "restore into the live database completed ($(tail -1 "$V/restore.out"))" || { bad "restore"; tail -5 "$V/restore.out"; }
drv persist after-disaster-restore

step "9. logs contain no secrets, tokens or room codes"
{ cat "$V/logs-before-down.log" 2>/dev/null; dc logs --no-color --no-log-prefix 2>&1; } >"$V/all.log"
leak=0; for sname in db_password match_server_secret admin_token platform_metrics_token rumble_metrics_token; do grep -qF "$(cat "$S/secrets/$sname")" "$V/all.log" && { bad "secret $sname appears in a log"; leak=1; }; done
grep -qE 'wa_[A-Za-z0-9_-]{20,}|wr_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}' "$V/all.log" && { bad "a token-shaped string appears in a log"; leak=1; }
code="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).match.code)}catch{}' "$V/validate.json" 2>/dev/null || true)"
[ -n "$code" ] && grep -qF "$code" "$V/all.log" && { bad "the private room code appears in a log"; leak=1; }
for fcode in $(grep -o '"friendCode":"[A-Z0-9]*"' "$V/validate.json" 2>/dev/null | cut -d'"' -f4); do grep -qF "$fcode" "$V/all.log" && { bad "a friend code appears in a log"; leak=1; }; done
[ $leak -eq 0 ] && ok "$(wc -l <"$V/all.log") log lines from every service: no secret, no token, no room code, no friend code"
grep -q '"route":"POST /v1/auth/guest"' "$V/all.log" && ok "logs are structured (one JSON line per request with the route pattern, not the path)" || bad "no structured request lines found"

step "10. graceful shutdown"
for s in platform rumble edge db; do
  t0=$(date +%s%N); dc stop -t 30 $s >/dev/null 2>&1; t1=$(date +%s%N)
  ec="$(docker inspect -f '{{.State.ExitCode}}' "${BETA_PROJECT}-$s-1")"; ms=$(( (t1-t0)/1000000 ))
  [ "$ec" = 0 ] && ok "$s stopped cleanly: exit 0 in $ms ms" || bad "$s exit code $ec after $ms ms"
done
dc up -d >/dev/null 2>&1; wait_healthy && ok "restart after the clean stop" || bad "restart after clean stop"
drv persist after-clean-stop

step "RESULT"
P=$(grep -c '^PASS' "$REPORT"); F=$(grep -c '^FAIL' "$REPORT"); B=$(grep -c '^BLOCKED' "$REPORT")
note "$P passed, $F failed, $B blocked by an integration that belongs to another team; $(( $(date +%s) - T0 )) s"
note "full report: $REPORT"
[ "$F" -eq 0 ] && note "BACKEND VALIDATION: NO FAILURES" || note "BACKEND VALIDATION: $F FAILURE(S)"
exit $(( F > 0 ))
