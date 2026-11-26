#!/usr/bin/env bash
# Load / soak measurements against a RUNNING beta stack (start one first: ops/beta/wahala-beta.sh up, or ops/beta/validate.sh --keep).
# It measures; it never decides "pass". Results go to $BETA_STATE/load/<label>/ : load.log (the driver's output), samples.jsonl
# (CPU % and memory of every container plus the match server's own /metrics, every 3 s) and summary.txt (the numbers to read).
#
#   ops/beta/load.sh rooms --rooms 2 --humans 2 --seconds 60 [--label two-rooms]
#   ops/beta/load.sh churn --cycles 200
#   ops/beta/load.sh reconnect
#   ops/beta/load.sh api --workers 30 --seconds 30
#   ops/beta/load.sh probe --rooms 5 --seconds 40
#   ops/beta/load.sh soak --minutes 30            (a steady trickle of matches and joins; memory growth is the result)
# Simulated clients are NOT phones. A sandbox is NOT your server. Read docs/ops/BETA_LOAD_RESULTS.md before quoting any number.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BETA_STATE="${BETA_STATE:-$HERE/state}" BETA_PROJECT="${BETA_PROJECT:-wahala-beta}"
export BETA_UID="${BETA_UID:-$(id -u)}" BETA_GID="${BETA_GID:-$(id -g)}"
P="$BETA_PROJECT"
dc() { docker compose -p "$P" -f "$HERE/compose.yml" --env-file "$BETA_STATE/beta.env" "$@"; }
scenario="${1:-}"; shift || true
[ -n "$scenario" ] || { sed -n 2,13p "$0"; exit 2; }
label="$scenario"; minutes=10; args=()
while [ $# -gt 0 ]; do case "$1" in --label) label="$2"; shift 2;; --minutes) minutes="$2"; shift 2;; *) args+=("$1"); shift;; esac; done
OUT="$BETA_STATE/load/$label"; rm -rf "$OUT"; mkdir -p "$OUT"
docker image inspect wahala-validate-driver:local >/dev/null 2>&1 || { echo "the driver image is missing: run ops/beta/validate.sh once first (it builds wahala-validate-driver:local)"; exit 1; }
[ "$(docker inspect -f '{{.State.Health.Status}}' "$P-rumble-1" 2>/dev/null)" = healthy ] || { echo "the stack is not running and healthy ($P): start it first"; exit 1; }

drv() { docker run --rm --network "${P}_app" --user "$(id -u):$(id -g)" -v "$HERE/..:/repo/ops:ro" wahala-validate-driver:local node /repo/ops/beta/load.mjs "$@" --invite "$(head -1 "$BETA_STATE/secrets/invite_codes" 2>/dev/null)" 2>&1; }
metrics() { # read from the HOST over the private network: nothing runs inside the game server's container (it would eat its CPU limit)
  local ip; ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$P-rumble-1" 2>/dev/null | awk '{print $1}')"
  curl -s --max-time 3 -H "Authorization: Bearer $(cat "$BETA_STATE/secrets/rumble_metrics_token")" "http://$ip:2567/metrics" 2>/dev/null | tr -d '\r\n'
}
pgconn() { dc exec -T db psql -U wahala -d wahala -Atc "select count(*) from pg_stat_activity where datname='wahala'" 2>/dev/null | tr -d '\r'; }

sampler() { # one JSON line per sample: every container's CPU % / memory and the match server's own metrics
  while :; do
    t=$(date +%s)
    stats="$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' "$P-rumble-1" "$P-platform-1" "$P-db-1" "$P-edge-1" 2>/dev/null | tr '\n' ';')"
    m="$(metrics)"; [ -n "$m" ] || m='{}'
    printf '{"t":%s,"stats":"%s","dbConnections":"%s","rumble":%s}\n' "$t" "$stats" "$(pgconn)" "$m" >>"$OUT/samples.jsonl"
    sleep 2
  done
}

echo "== $scenario ($label): $(date -u +%FT%TZ)" | tee "$OUT/load.log"
sampler & SP=$!
trap 'kill $SP 2>/dev/null; wait $SP 2>/dev/null' EXIT
sleep 4 # a quiet baseline first
case "$scenario" in
  soak)
    end=$(( $(date +%s) + minutes * 60 )); n=0
    while [ "$(date +%s)" -lt "$end" ]; do
      n=$((n + 1))
      drv rooms --rooms 2 --humans 3 --seconds 180 >>"$OUT/load.log" & RP=$!
      for k in 1 2 3; do
        drv churn --cycles 40 --conc 3 | tee -a "$OUT/load.log" | grep -E "^RESULT" | cut -c1-260
        drv api --workers 8 --seconds 15 --accounts 6 | tee -a "$OUT/load.log" | grep -E "^RESULT" | cut -c1-260
      done
      wait $RP
      echo "soak round $n done, $(( (end - $(date +%s)) / 60 )) min left"
    done ;;
  *) drv "$scenario" "${args[@]}" | tee -a "$OUT/load.log" ;;
esac
sleep 6 # a quiet tail: does memory and CPU come back down?
kill $SP 2>/dev/null; wait $SP 2>/dev/null; trap - EXIT

node "$HERE/load-summary.cjs" "$OUT" | tee "$OUT/summary.txt"
echo "files: $OUT"
