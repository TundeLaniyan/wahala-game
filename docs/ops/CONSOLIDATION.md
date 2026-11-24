# Ops consolidation (FU2-D)

One canonical operations tree: `ops/` (tooling) and `docs/ops/` (instructions). Nothing here deploys, buys or exposes anything.

## Selected

| Source | Taken | Why |
|---|---|---|
| `ccr-2a4381d7-dr58ke` @ 871bdfb | All of `ops/` and `docs/ops/` | Based on the production line `f7cf2ae`; one multi-stage non-root `Dockerfile` with a health check; local and edge compose; one nginx; env examples; secrets scan; smoke and abuse probes; monitoring rules with 10 passing tests; phone latency page; the public-hosting go/no-go pack (`RELEASE_GATES.md`: public hosting is NO-GO today). |
| `ccr-c13ce439-rvwlkb` | `ops/deploy/wait-idle.mjs` only | The one piece the other branch lacks: drain a host before a restart by polling `/metrics` until no room is `countdown`/`playing`. Checked against the current `/metrics` schema. Use: `RUMBLE_METRICS_TOKEN=... node ops/deploy/wait-idle.mjs --base http://127.0.0.1:2567 [--timeout 900]` (exit 0 idle, 1 busy at timeout, 2 unreachable). Run it before `docker compose up -d` with a new image tag (`DEPLOYMENT.md` section 4). |

## Rejected

| Item | Reason |
|---|---|
| `ccr-c13ce439-rvwlkb`: its Dockerfile, nginx config, compose files and docs | Duplicate the selected set. That branch sits on an older server line and does not know the guard, limits or metrics-token changes. Two Dockerfiles or two nginx stacks would drift. |
| `server/Dockerfile` (in the repository) | Never built; needed a host-built `dist/`; no health check or `.dockerignore`; floating base image. Deleted (F7). `ops/docker/Dockerfile` replaces it and runs the server's own `npm run bundle`. |

## Changes made while consolidating

- `ops/compose/compose.edge.yml`: the `internal` network has a fixed subnet (172.29.0.0/24) so the server can name its proxy.
- `ops/env/server.env.example`: `RUMBLE_TRUSTED_PROXIES=172.29.0.0/24` (edge only; leave it empty for the local stack) and the capacity variables of `docs/ONLINE_LIMITS_AND_SECURITY.md` as commented defaults. Behind nginx the server's TCP peer is the proxy, so without that line every guest would share one per-address limit.
- `docs/CITY_RUMBLE_ONLINE.md` points to `ops/docker/Dockerfile`.

## Honest limits

Local TLS and container validation prove the files work on a laptop. They do not prove public deployment security (real DNS, certificates, firewall, provider network, volumetric floods). See `RELEASE_GATES.md`.
