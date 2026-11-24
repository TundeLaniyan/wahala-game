# WAHALA! City Rumble: multiplayer operations pack

Operations, infrastructure and security work for the existing authoritative City Rumble server (Node 22 + Colyseus, 32 fighters, bot filling, 30 s reconnection). **It does not change the simulation, netcode, server gameplay, the Pages workflow, or any file under `src/` or `server/`.** Everything added is under `ops/` and `docs/ops/`. Nothing was bought, provisioned, deployed, merged or made public.

Based on `claude/wahala-stitch-uiux-v1` @ `f7cf2ae` (the newest server line: LAN support, identity rules, soak harness, shutdown check). The older `claude/wahala-city-rumble-online-30w0rm` line diverged; it is not merged here.

## Read in this order

| Doc | Answers |
| --- | --- |
| [RELEASE_GATES.md](RELEASE_GATES.md) | **Go / no-go** for public backend hosting; essential vs later |
| [VALIDATION_STATUS.md](VALIDATION_STATUS.md) | What was proven here, what was not, what needs hosting and real phones |
| [AUDIT.md](AUDIT.md) | Findings F1-F12 on the server bundle, with evidence and who owns each fix |
| [LOCAL_LAPTOP.md](LOCAL_LAPTOP.md) | Laptop + same-Wi-Fi phones, and the container option (validated) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Container, edge, environment, and the later runbook (not executed) |
| [SECRETS.md](SECRETS.md) | What is secret, where it lives, rules |
| [HOSTING_ARCHITECTURE.md](HOSTING_ARCHITECTURE.md) | HTTPS/WSS model with GitHub Pages as the frontend |
| [HOSTING_COSTS.md](HOSTING_COSTS.md) | Regions, Nigerian latency evidence, sourced costs (with what could not be verified) |
| [CAPACITY.md](CAPACITY.md) | 32-human and bot-heavy rooms per core / per VM |
| [MONITORING.md](MONITORING.md) | Health, metrics, lifecycle, error reporting, alerts |
| [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) | Guest names, room flooding, DoS, reconnection |

## Tooling (all under `ops/`)

| Path | What it is |
| --- | --- |
| `ops/scripts/validate-local.sh` | **One command** that re-proves the local setup (image build, reproducible bundle, hardened container, TLS edge, smoke, flood limits, secrets tripwire) |
| `ops/docker/Dockerfile` (+ `.dockerignore`) | Reproducible build of the single-file bundle inside the build; non-root; health check |
| `ops/compose/compose.local.yml`, `compose.edge.yml` | Laptop backend only / production-shaped nginx + server |
| `ops/edge/nginx.conf`, `allow.conf` | TLS, WebSocket proxy, per-IP limits, `/metrics` hidden, optional IP allowlist |
| `ops/env/*.example` | Configuration templates (filled copies are git-ignored) |
| `ops/scripts/smoke.mjs` | Functional checks of any server/edge you run |
| `ops/scripts/abuse-probe.mjs` | create / connection / started-room flood measurements (local targets only by default) |
| `ops/scripts/check-secrets.sh`, `gen-dev-cert.sh` | Secrets tripwire; self-signed cert for local TLS |
| `ops/monitoring/` | Alert rules (unit-tested), poller/webhook, Prometheus text converter |
| `ops/latency/index.html` | Phone page that measures RTT to candidate regions: **the cheapest way to get real Nigerian evidence** |

## The honest summary

- The local setup works and is repeatable. The server image builds, is bit-identical to the host bundle, runs hardened, stops gracefully; the TLS edge carries the real protocol over `wss://`; the edge cuts a single-address room-creation flood from 1 500 successes to 4-31.
- **Public backend hosting is a NO-GO today**, for reasons the edge cannot fix: no global cap on running bot-filled rooms (one guest can saturate a core with 3-4 started rooms, F3), `/metrics` open unless a token is set (F1, mitigated at the edge), and no real-phone or real-Nigerian-network evidence. A **supervised private test** on one small VM is a GO once the founder approves the cost and the gates in RELEASE_GATES.md section 2 are met.
- Simulated clients, emulated networks and software-rendered browsers prove protocol and capacity behaviour. They do not prove phone performance, radio behaviour or battery.
