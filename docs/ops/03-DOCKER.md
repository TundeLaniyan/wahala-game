# 03 — Container build, hardened profile and deploy routine

All commands here were run in the sandbox against Docker 29.9.3 with no cloud service.

## The existing image (`server/Dockerfile`): VALIDATED unchanged

```bash
cd server && npm run bundle && docker build -t wahala-rumble-server .
docker run -p 2567:2567 -e RUMBLE_ALLOWED_ORIGINS=https://tundelaniyan.github.io \
  -e RUMBLE_METRICS_TOKEN=$(openssl rand -hex 24) wahala-rumble-server
```

| Check | Result |
| --- | --- |
| Build | 3 s, 331 MB (`node:22-slim` + a 4 MB file) |
| Starts | `[rumble] listening on :2567 (origins: …; reconnect 30s)` |
| `/health` | 200 `{"ok":true}` |
| `/metrics` | 401 without the token, JSON with it |
| User | `node` (uid 1000), not root |
| Idle memory | ~109 MB RSS |
| `docker stop` | exits 0 in 0.2 s, logs `shut down` (it handles SIGTERM as PID 1) |
| Missing | no HEALTHCHECK, no OCI labels; the file's header still says "NOT BUILT" |

Docker Hub rate-limited this sandbox's shared address (HTTP 429), so the *same* `node:22-slim` image was pulled from
`mirror.gcr.io/library/node:22-slim` (identical digest from `public.ecr.aws`) and tagged locally. **Digest validated on
2026-11-24: `node:22-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb`.** For releases, pin it:
`--build-arg NODE_IMAGE=node:22-slim@sha256:…` and refresh deliberately (security updates).

## The ops image and stack (`ops/docker/`): VALIDATED

`ops/docker/Dockerfile` is the same bundle with a HEALTHCHECK, labels and a pinnable base. `ops/docker/compose.yml` adds the
hardening and the TLS edge:

| Control | Setting | Validated |
| --- | --- | --- |
| Not reachable directly | `expose` only; the server sits on an `internal: true` network with no internet route | yes (outbound fetch from the server container fails; proxy still reaches it) |
| Read-only root filesystem | `read_only: true` | yes, server healthy |
| No capabilities, no privilege gain | `cap_drop: [ALL]`, `no-new-privileges` | yes |
| Real init | `init: true` | yes |
| Resource caps | 1 core, 1 GB, 256 pids (env-tunable) | set; not stress-tested |
| Log rotation | json-file 10 MB × 5 per container | set |
| Start order | proxy waits for the server's health | yes |
| Secrets required | compose refuses to start without `RUMBLE_ALLOWED_ORIGINS` and `RUMBLE_METRICS_TOKEN` | yes (error names the variable) |

```bash
ops/proxy/make-selfsigned.sh localhost ops/proxy/certs
(cd server && npm run bundle)
docker compose --env-file ops/env/compose.local.env -f ops/docker/compose.yml up -d --build
NODE_EXTRA_CA_CERTS=$PWD/ops/proxy/certs/fullchain.pem \
  node ops/probes/probe.mjs --http https://localhost:18443 --origin https://localhost:18443 --only health,origin,roomflood
docker compose --env-file ops/env/compose.local.env -f ops/docker/compose.yml down
```

Scaling on one machine: one `rumble` container **per vCPU**. With the current server, several processes cannot share rooms
or matchmaking (04, "Scaling"), so run one until Architecture wires the Redis presence / driver.

## Deploy and rollback routine (for the first real host)

The server keeps nothing on disk, so deploying = replacing the container; every running match ends.

1. Build the bundle from a tagged commit; build the image with `--build-arg GIT_SHA=$(git rev-parse --short HEAD)`; keep the
   previous image tagged `:previous`.
2. Wait for a quiet moment: `RUMBLE_METRICS_TOKEN=… node ops/deploy/wait-idle.mjs --base http://127.0.0.1:2567`
   (VALIDATED: exit 0 idle, 1 busy at timeout, 2 unreachable).
3. `docker compose up -d --build rumble`; check health and run `probe.mjs --only health,metrics,origin`.
4. Roll back: retag `:previous` as `:ops` and `docker compose up -d rumble`. No data migration exists to undo.
5. Announce planned restarts to testers; a restart returns everyone to the menu.

## Not done here

An image CVE scan (no scanner available in the sandbox), multi-arch builds (the bundle is pure JavaScript and
`node:22-slim` is multi-arch, so ARM hosts should work, but I did not run one), a registry push (that would be an external
resource).
