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

drv() { docker run --rm --network "${P}_app" --user "$(id -u):$(id -g)" -v "$HERE/..:/repo/ops:ro" wahala-validate-driver:local node /repo/ops/beta/load.mjs "$@" 2>&1; }
metrics() { dc exec -T rumble sh -c 'node -e "fetch(\"http://127.0.0.1:2567/metrics\",{headers:{authorization:\"Bearer \"+require(\"fs\").readFileSync(\"/run/secrets/rumble_metrics_token\",\"utf8\").trim()}}).then(r=>r.text()).then(console.log).catch(()=>console.log(\"{}\"))"' 2>/dev/null | tr -d '\r' | head -1; }
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
      drv rooms --rooms 2 --humans 3 --seconds 40 | tee -a "$OUT/load.log" | grep -E "^RESULT|rooms started" | cut -c1-260
      drv churn --cycles 40 --conc 3 | tee -a "$OUT/load.log" | grep -E "^RESULT" | cut -c1-260
      drv api --workers 8 --seconds 10 --accounts 6 | tee -a "$OUT/load.log" | grep -E "^RESULT" | cut -c1-260
      echo "soak round $n done $(( (end - $(date +%s)) / 60 )) min left"
    done ;;
  *) drv "$scenario" "${args[@]}" | tee -a "$OUT/load.log" ;;
esac
sleep 6 # a quiet tail: does memory and CPU come back down?
kill $SP 2>/dev/null; wait $SP 2>/dev/null; trap - EXIT

node - "$OUT" <<'JS' | tee "$OUT/summary.txt"
const fs = require('fs'); const dir = process.argv[2];
const rows = fs.readFileSync(dir + '/samples.jsonl', 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const mb = (s) => { const m = /([\d.]+)\s*(MiB|GiB|KiB|B)/.exec(s); if (!m) return null; return Number(m[1]) * ({ GiB: 1024, MiB: 1, KiB: 1 / 1024, B: 1 / 1048576 })[m[2]]; };
const per = {};
for (const r of rows) for (const part of String(r.stats).split(';').filter(Boolean)) {
  const [name, cpu, mem] = part.split(' '); const svc = name.replace(/^.*-(rumble|platform|db|edge)-1$/, '$1');
  (per[svc] ??= []).push({ t: r.t, cpu: parseFloat(cpu), mem: mb(mem) });
}
const max = (a) => Math.max(...a), avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`samples: ${rows.length} over ${rows.length ? rows.at(-1).t - rows[0].t : 0} s   (CPU % are per container; 100 % = one core)`);
for (const [svc, a] of Object.entries(per)) {
  const cpu = a.map((x) => x.cpu).filter(Number.isFinite), mem = a.map((x) => x.mem).filter(Number.isFinite);
  console.log(`${svc.padEnd(9)} cpu avg ${avg(cpu).toFixed(0)}% max ${max(cpu).toFixed(0)}%   mem first ${mem[0]?.toFixed(0)} MB, max ${max(mem).toFixed(0)} MB, last ${mem.at(-1)?.toFixed(0)} MB`);
}
const rm = rows.map((r) => r.rumble).filter((m) => m && Object.keys(m).length);
if (rm.length) {
  const keys = new Set(rm.flatMap((m) => Object.keys(m)));
  console.log('match server /metrics fields seen: ' + [...keys].join(', '));
  const pick = (f) => rm.map((m) => m[f]).filter((v) => typeof v === 'number');
  for (const f of ['rooms', 'playingRooms', 'players', 'humans', 'cpuPct', 'timerLatenessP99Ms', 'droppedTicks', 'rssMb', 'heapUsedMb']) { const v = pick(f); if (v.length) console.log(`  ${f}: max ${max(v)}, last ${v.at(-1)}`); }
}
const dbc = rows.map((r) => Number(r.dbConnections)).filter(Number.isFinite);
if (dbc.length) console.log(`PostgreSQL connections (limit 40 in compose): max ${max(dbc)}, last ${dbc.at(-1)}`);
JS
echo "files: $OUT"
