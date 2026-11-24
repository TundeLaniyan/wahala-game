# Deployment instructions

Two parts: what is **validated now** (local, container, edge) and a **runbook for later** that has *not* been executed (it needs an approved host, a hostname and a certificate).

## 1. Build the image (validated)

```bash
docker build -f ops/docker/Dockerfile -t wahala-rumble-server:local --build-arg GIT_SHA=$(git rev-parse --short HEAD) .
```
Context is the repository root. The build runs the server's own `npm run bundle` with `npm ci` (lockfile) and esbuild pinned to the root lockfile version, then ships only the bundle on `node:22-slim` as user `node` (uid 1000) with a `HEALTHCHECK`. **Reproducible:** the container's bundle and a host-built bundle have the same sha256 (`6846af19e324b5e2...`). Image size 331 MB. Behind a TLS-inspecting proxy: `--build-context extra-ca=<dir with ca-bundle.crt>` (used only during the npm steps; nothing lands in a layer). Pin the base image by digest before a real release.

Run hardened (all verified): `--init --read-only --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 1`. A SIGTERM ends the server with exit code 0 in 164-242 ms.

## 2. Configuration (validated)

`ops/env/server.env.example` is the complete list. Production rules: `NODE_ENV=production` (turns off the implicit localhost origins), `RUMBLE_ALLOWED_ORIGINS` = exact origins only, `RUMBLE_METRICS_TOKEN` set, **never** `RUMBLE_TEST_FAST`. Product constants stay: grace 5 s, reconnection 30 s, drop policy `bot`, 32 seats, 30 s public wait.

## 3. The edge (validated locally with a self-signed certificate)

`ops/edge/nginx.conf` + `ops/compose/compose.edge.yml`: TLS 1.2/1.3 + HTTP/2, WebSocket upgrade proxy (read timeout 120 s; the server pings every 3 s), `/metrics` and `/debug` return 404, non-upgrade requests to the socket path get 426, 4 KB body cap, route-class-only logs (no room codes, no query strings, no user agents), and per-address limits:

| Path | Limit | Measured effect |
| --- | --- | --- |
| `/matchmake/create/` | 6 per minute, burst 4 | 500 rapid creates → **5 allowed, 495 × 429**; a legitimate host succeeds after ~10 s |
| `/matchmake/*` (join, quick play, reconnect) | 60 per minute, burst 30 | (not stressed separately) |
| WebSocket upgrades | 64 concurrent sockets and 10 req/s per address | 300 upgrades from one address → **255 refused** |
| `allow.conf` | optional IP allowlist | `deny all` → 403, allowed address → 200 |

Behind another proxy or CDN, the address nginx sees is the proxy's: set `real_ip_header` and `set_real_ip_from` for that proxy's published ranges **only**, or every client shares one limit.

## 4. Runbook for the first supervised remote test (NOT executed: needs approval)

Preconditions: founder approves provider, region and a budget cap; a hostname with a certificate exists; RELEASE_GATES section 2 items 1-8 are met.

1. Create **one** VM (2 vCPU, 4 GB, hourly billing), firewall: inbound 443 (and 80 for certificate issue), SSH only from the operator's address; disable SSH password login; enable provider backups off (stateless).
2. Install Docker. Copy `ops/` and the built image (`docker save | ssh ... docker load`, or build on the VM). No source checkout is needed to *run*.
3. Create `ops/env/server.local.env` **on the VM** (token generated there; never in git or chat). Origins = the page origin(s) testers will use.
4. Certificate: Let's Encrypt via `certbot` for `play.<domain>` (HTTP-01), mounted at `ops/edge/certs/{fullchain,privkey}.pem`; renewal timer; reload nginx on renew.
5. Map ports: host 443 → edge 8443, host 80 → edge 8080 (edit `EDGE_HTTPS_PORT/EDGE_HTTP_PORT`).
6. `docker compose -f ops/compose/compose.edge.yml --env-file ops/env/server.local.env up -d`.
7. From **outside**: `node ops/scripts/smoke.mjs --url https://play.<domain> --origin <page origin> --metrics hidden`.
8. Start `ops/monitoring/watch.mjs --url http://<container-network-or-localhost>:2567 --token ... --webhook <founder's chosen channel>` on the VM (the server port is not published; run the watcher in the compose network or `docker compose exec`).
9. Run the latency page and the supervised phone session. Record `/metrics` snapshots and the alert log.
10. **Tear down** when the test ends (`down -v`, delete the VM). A forgotten VM is the main avoidable cost.

Rollback = `docker compose up -d` with the previous image tag. There is no data to migrate.

## 5. What is deliberately not here

No Kubernetes, no Redis/multi-process matchmaking, no database, no autoscaling, no CI workflow for images (CI is Architecture's: propose a separate image-build job and a Trivy/`npm audit` step there, never a second Pages publisher).
