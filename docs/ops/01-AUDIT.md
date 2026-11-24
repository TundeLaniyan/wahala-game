# 01 — Audit of the standalone server bundle and its deployment requirements

Audited on `claude/wahala-city-rumble-online-30w0rm` at 9fd7f5e (the head of that branch on 2026-11-24). Source of truth for
design: `docs/CITY_RUMBLE_ONLINE.md` (Architecture's). This document does not repeat it; it records what an operator needs.

## What it is

- `server/` is a separate npm package (Colyseus 0.18: `@colyseus/core` 0.18.10 + `@colyseus/ws-transport` 0.18.5). It runs
  the real `src/sim` `tick()` and `src/ai` bots at 60 Hz, one `RumbleRoom` per lobby/match, 32 seats, humans first, bots filling.
- `npm run bundle` makes **one file**, `server/dist/rumble-server.mjs` (4.06 MB, ESM, `--target=node22`), that runs with plain
  `node` and needs no `node_modules`. This file is the deployable. It is git-ignored: it must be built.
- Plain `ws` on one port (default 2567, host `0.0.0.0`). **TLS is not terminated by the server**: put a proxy in front (04).
- No database, no disk writes, no outbound network calls. State lives in memory; a restart ends every running match.

## Runtime requirements

| Need | Value | Notes |
| --- | --- | --- |
| Node | 22 or newer | the bundle targets node22; `lan.mjs` refuses older |
| CPU | one busy thread per process | the tick loop and every room share one event loop: **one process per vCPU** |
| Memory | ~115–130 MB RSS with 32 humans in one room (MEASURED); ~360 MB with 4 bot-heavy matches (MEASURED, ~65 MB per room) | container limit 1 GB leaves room for ~10 rooms |
| Port | 2567 (`PORT`) | only the proxy should reach it |
| Disk | none | `read_only: true` works (VALIDATED) |
| Network out | none required | the compose file gives the server a network with no internet route |
| Clock | any | sim time is ticks, not wall time |

## Environment variables (complete list the code reads)

| Variable | Default | Production rule |
| --- | --- | --- |
| `PORT` | 2567 | |
| `NODE_ENV` | (Dockerfile sets `production`) | **must be `production`**: otherwise, with no origin list, `localhost` origins are allowed |
| `RUMBLE_ALLOWED_ORIGINS` | none in production | **required**: exact browser origins, e.g. `https://tundelaniyan.github.io`. `*` after a colon = any port, other `*` = host labels. Non-browser clients send no Origin and are allowed (Origin is browser hygiene, not authentication) |
| `RUMBLE_METRICS_TOKEN` | unset = **`/metrics` is open** | **required**: bearer token; without it the metrics (including public room codes and per-room load) are public |
| `RUMBLE_RECONNECT_SECONDS` | 30 | keep 30: it is the product requirement |
| `RUMBLE_TEST_FAST`, `RUMBLE_COUNTDOWN_MS`, `RUMBLE_AUTOSTART_SEC` | off | **never in production**: they shorten countdowns and accept odd match lengths |

## HTTP / WebSocket surface (what the proxy must expect)

| Path | Who | Notes |
| --- | --- | --- |
| `GET /health` | monitors | `{"ok":true}`; liveness only (does not test the tick loop) |
| `GET /metrics` | operator | JSON, bearer token; per-process and per-room numbers; private room codes are never listed (VALIDATED) |
| `POST /matchmake/<create|joinOrCreate|join|joinById|reconnect>/rumble` | players | seat reservation; CORS answers only for allowed origins (VALIDATED) |
| `GET /<processId>/<roomId>?sessionId=…` (WebSocket) | players | origin checked before the upgrade (VALIDATED: 403 for others) |
| `GET /` | anyone | returns `Colyseus 0.18.29`: version disclosure (hidden by the proxy allow-list) |

Colyseus dev tools (`/monitor`, `/playground`) are **not** mounted (VALIDATED 404).

## Behaviour that matters operationally (all VALIDATED against the bundle)

- Reconnect: 30 s window, same seat, single-use rotating token, autopilot while away, a bot takes the seat for good afterwards.
- Disconnect detection: transport pings every 3 s, two misses terminate: a dead phone is noticed in roughly 6–9 s, then the
  30 s window starts.
- Abuse: more than 20 invalid messages in 10 s, or more than 600 messages in 5 s, closes the client with 4400 and it
  **cannot** reconnect; a frame over 4 KB closes the socket (1009); a 32-fighter match cannot be given a forged result.
- Graceful stop: `SIGTERM` closes rooms and exits 0 in ~0.2 s. There is **no draining**: running matches end.

## Findings (the operator-relevant defects; none blocks a local test)

| ID | Finding | Severity for public release | Handled by |
| --- | --- | --- | --- |
| F1 | `autoStartSec` and `private` are client-controlled at room creation: one client starts instant 31-bot matches | **High** (DoS by amplification) | SRV-1..3 (08) |
| F2 | No limit on rooms per IP or per process | **High** | nginx now; SRV-1 later |
| F3 | `/metrics` open when `RUMBLE_METRICS_TOKEN` is unset | Medium | env template requires it; compose refuses to start without it |
| F4 | Names: `BOT …` and `Admin` accepted, look-alikes accepted, duplicates in a room accepted, no profanity filter | Medium | SRV-4 |
| F5 | `GET /` discloses the framework version | Low | proxy allow-list |
| F6 | Oversized frames log a full stack trace per frame (`RangeError: Max payload size exceeded`): log-volume vector | Low | log rotation in compose (10 MB × 5) |
| F7 | A rejected `create` still builds and disposes an empty room (logged as `room  disposed`, empty code) | Low | harmless; SRV-1 admission would avoid it |
| F8 | `server/Dockerfile` has no HEALTHCHECK and no init; comment says "NOT BUILT" (now stale: it builds) | Low | `ops/docker/Dockerfile` adds a healthcheck; compose adds `init: true` |
| F9 | No deploy drain: a restart ends running matches | Low–Medium | `ops/deploy/wait-idle.mjs` + procedure in 03 |
| F10 | Reconnect token held in memory only: a page reload loses the seat | Medium (mobile) | founder / Architecture decision (00) |
| F11 | `?server=` in the dev client lets a link point the client at any server | Medium for the integrated client | the shipped client must take the server URL from build config only (04) |
| F12 | `npm audit --omit=dev`: 8 advisories (5 low, 3 moderate, 0 high / critical), all transitive via `@colyseus/auth` (OAuth libs) | Low | MEASURED: the vulnerable packages (`elliptic`, `grant`, `jwk-to-pem`, `request-oauth`) do **not** appear in the shipped bundle (0 occurrences) |
| F13 | `/health` is liveness only: a wedged tick loop still answers it | Medium | watcher alerts on event-loop delay, dropped ticks and stuck rooms (07) |

## Tests that exist and pass

`server/test/*` (8 files, 67 tests): lobby, options, abuse, expiry, integration, leave, reconnect, tick loop. Architecture's
load harness (`server/bench`) replicated here: 32 humans, clean network, 0 dropped ticks, 0 mismatches (06). Architecture also
ran impairment profiles (London-like, mobile, bad-mobile) with an application-level proxy; those are emulation, not phones.

## What this audit did not do

No code review of the simulation, netcode or replication (Architecture's active work). No penetration test beyond the black-box
probe. No scan of the container image for OS-package CVEs (no scanner available here): run one (Trivy or the registry's
scanner) before any public release.
