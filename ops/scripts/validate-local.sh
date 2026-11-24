#!/usr/bin/env bash
# One command that proves the local operations setup on a machine with Docker + Node 22. No cloud, nothing public, nothing paid.
#   ops/scripts/validate-local.sh
# Optional environment:
#   NODE_IMAGE / EDGE_IMAGE   base images (defaults node:22-slim, nginx:1.28-alpine; use a registry mirror if Docker Hub rate-limits)
#   EXTRA_CA_DIR              directory holding ca-bundle.crt, for builds behind a TLS-inspecting proxy
#   BUILD_NETWORK=host        pass --network host to `docker build` (some sandboxes need it)
# Steps: unit tests of the monitor -> image build -> bundle reproducibility -> hardened container health + graceful stop
#        -> nginx edge (TLS, wss) -> smoke through the edge -> flood limits -> secrets tripwire -> teardown.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
NODE_IMAGE="${NODE_IMAGE:-node:22-slim}"; EDGE_IMAGE="${EDGE_IMAGE:-nginx:1.28-alpine}"; export EDGE_IMAGE
C="docker compose -f ops/compose/compose.edge.yml --env-file ops/env/server.local.env"
fails=0; step() { printf '\n== %s\n' "$*"; }; ok() { echo "PASS $*"; }; bad() { echo "FAIL $*"; fails=$((fails+1)); }
cleanup() { $C down -v >/dev/null 2>&1; docker rm -f rumble-validate >/dev/null 2>&1; }
trap cleanup EXIT

step "monitor rules (unit tests)"
node --test ops/monitoring/rules.test.mjs >/dev/null 2>&1 && ok "rules.test.mjs" || bad "rules.test.mjs"

step "image build (ops/docker/Dockerfile)"
args=(--build-arg "NODE_IMAGE=$NODE_IMAGE" --build-arg "GIT_SHA=$(git rev-parse --short HEAD)")
[ -n "${EXTRA_CA_DIR:-}" ] && args+=(--build-context "extra-ca=$EXTRA_CA_DIR")
[ "${BUILD_NETWORK:-}" = host ] && args+=(--network host)
docker build "${args[@]}" -f ops/docker/Dockerfile -t wahala-rumble-server:local . >/tmp/validate-build.log 2>&1 && ok "docker build" || { bad "docker build (see /tmp/validate-build.log)"; exit 1; }

step "reproducible bundle: container build == host build"
(cd server && npm run bundle >/dev/null 2>&1)
h=$(sha256sum server/dist/rumble-server.mjs | cut -d' ' -f1)
c=$(docker run --rm --entrypoint sh wahala-rumble-server:local -c 'sha256sum /app/rumble-server.mjs' | cut -d' ' -f1)
[ "$h" = "$c" ] && ok "identical sha256 ${h:0:16}" || bad "bundle differs: host ${h:0:16} container ${c:0:16}"

step "hardened container: non-root, read-only rootfs, no capabilities, healthy, graceful stop"
docker run -d --name rumble-validate --init --read-only --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 1 \
  -e RUMBLE_ALLOWED_ORIGINS=https://example.invalid wahala-rumble-server:local >/dev/null
for i in $(seq 1 20); do [ "$(docker inspect -f '{{.State.Health.Status}}' rumble-validate)" = healthy ] && break; sleep 2; done
[ "$(docker inspect -f '{{.State.Health.Status}}' rumble-validate)" = healthy ] && ok "healthcheck healthy" || bad "not healthy"
[ "$(docker exec rumble-validate id -u)" = 1000 ] && ok "runs as uid 1000" || bad "runs as root"
s=$(date +%s%N); docker stop -t 10 rumble-validate >/dev/null; e=$(date +%s%N)
[ "$(docker inspect -f '{{.State.ExitCode}}' rumble-validate)" = 0 ] && [ $(( (e-s)/1000000 )) -lt 5000 ] && ok "SIGTERM -> exit 0 in $(( (e-s)/1000000 )) ms" || bad "ungraceful stop"
docker rm rumble-validate >/dev/null

step "edge stack (nginx TLS + server), self-signed certificate"
[ -f ops/env/server.local.env ] || { cp ops/env/server.env.example ops/env/server.local.env; sed -i "s/^RUMBLE_METRICS_TOKEN=.*/RUMBLE_METRICS_TOKEN=$(openssl rand -hex 32)/" ops/env/server.local.env; }
ops/scripts/gen-dev-cert.sh >/dev/null
$C up -d --no-build >/dev/null 2>&1
for i in $(seq 1 20); do curl -sk https://localhost:8443/health 2>/dev/null | grep -q '"ok":true' && break; sleep 2; done
export NODE_EXTRA_CA_CERTS="$PWD/ops/edge/certs/fullchain.pem"
node ops/scripts/smoke.mjs --url https://localhost:8443 --metrics hidden && ok "smoke through https/wss edge" || bad "smoke through edge"

step "edge abuse limits (create flood from one address)"
out=$(node ops/scripts/abuse-probe.mjs create-flood --url https://localhost:8443 --n 300 --conc 20)
echo "$out"; echo "$out" | grep -q '"429"' && ok "create flood is throttled (429)" || bad "create flood NOT throttled"

step "secrets tripwire"
ops/scripts/check-secrets.sh && ok "no secrets" || bad "secret-like content"

printf '\n%s\n' "$([ $fails -eq 0 ] && echo 'ALL LOCAL CHECKS PASSED (this proves wiring, not capacity, not phones)' || echo "$fails CHECK(S) FAILED")"
exit $fails
