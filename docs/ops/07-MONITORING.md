# 07 — Health checks, metrics, error reporting, room lifecycle and alerting

Principle: the smallest set that tells one person at 2 a.m. whether players are hurting and why. No agent, dashboard stack or
cloud account is required for the first release; every piece below runs from this repository.

## What the server already exposes

- `GET /health` → `{"ok":true}`: **liveness only**. It answers even when the tick loop is wedged (F13), so it is necessary but not
  sufficient.
- `GET /metrics` (bearer token): per-process (`cpuPercentSinceLastRead`, `eventLoopDelayMs` mean / p50 / p99 / max, `memoryUsage`,
  uptime) and per-room (`phase`, `humans`, `connectedHumans`, `uptimeSec`, tick counts and **dropped ticks**, step / broadcast /
  timer-lateness distributions, bytes, keyframes, invalid / unknown / rejected messages, resyncs, **kicks**, reconnections,
  matches started / finished, per-client byte counters). Private room codes never appear (VALIDATED). The CPU and event-loop
  windows cover the time since the previous read, so **one poller** should own the endpoint (a second reader steals samples).
- Logs on stdout: `room XXXXXX created / disposed`, `kicked a client: …`, `tick failed: …`, `could not build the match: …`.

## Layers

| Layer | Tool (in this repo) | Catches | Status |
| --- | --- | --- | --- |
| 1 Container health | `HEALTHCHECK` in `ops/docker/Dockerfile`; compose restart policy | process down, port dead | VALIDATED (`healthy`) |
| 2 External uptime | any free uptime monitor on `https://play.<domain>/health` (Better Stack / UptimeRobot, see 05) | proxy, TLS, DNS, whole-host failure, certificate expiry | design; needs a real host |
| 3 Threshold watcher | `ops/monitoring/watch.mjs` | overload, slow ticks, abuse, stuck rooms, metrics unreadable, edge failure | VALIDATED against real overload + outage + recovery + webhook |
| 4 Error reporting | `ops/monitoring/error-reporter.mjs` (`node --import …`) | uncaught exceptions and unhandled rejections, scrubbed | VALIDATED (exit 1, webhook, scrub) |
| 5 Edge log | nginx access log (query strings removed, room codes masked) + `429` counts | floods, scans, per-IP abuse | VALIDATED locally |
| 6 Synthetic probe | `ops/probes/probe.mjs` run after every deploy and nightly | regressions in origin / auth / reconnect / limits | VALIDATED |

## Alert rules (`watch.mjs`; thresholds are in the `T` object and each comes from a measurement)

| Alert | Fires when | Level | Why this number | First action |
| --- | --- | --- | --- | --- |
| `down` | `/health` fails 3 polls in a row | critical | players cannot connect | `docker compose ps`, logs, restart |
| `edge-down` | the public health URL fails 2 polls (with `--public`) | critical | proxy / certificate / DNS | check certificate expiry, nginx, DNS |
| `metrics-unreadable` | `/metrics` fails while `/health` is fine | warning | wrong token or wedged | check `RUMBLE_METRICS_TOKEN` |
| `cpu-warn` / `cpu-crit` | ≥ 70 % / ≥ 90 % of one core | warning / critical | 3 bot-heavy rooms = 70 %; 4 = 94 % with dropped ticks (06) | stop admitting bot rooms; add a process |
| `loop-warn` / `loop-crit` | event-loop delay p99 ≥ 50 / ≥ 100 ms | warning / critical | measured 5 ms healthy, 44 ms at 4 rooms, 150 ms at 6 | same; every room is lagging |
| `ticks-dropped` | ≥ 1 tick dropped since last poll (≥ 60 → `…-crit`) | warning / critical | dropped ticks = slow motion for players | find the heavy room in `/metrics` |
| `step-slow` | a room's step p99 ≥ 8 ms (budget 16.7) | warning | healthy 2.8 ms | inspect that room |
| `rooms-capacity` | more matches running than `--max-rooms-per-process` (default 3) | warning | planned limit | scale out |
| `memory` | RSS ≥ 700 MB | warning | ~110 MB idle, ~65 MB / room | leak or flood of rooms |
| `abuse-kicks` | ≥ 3 clients kicked in a poll | warning | honest clients are never kicked (Architecture's fix) | look at nginx 429s and the source IPs |
| `abuse-invalid` | ≥ 100 invalid messages in a poll | warning | | same |
| `resyncs` | ≥ 20 keyframe requests in a poll | warning | network trouble or a replication bug | check hash mismatches in client reports |
| `stuck:<room>` | a room is in `playing` more than 12 min | warning | matches last 3 or 5 min | room is a zombie |
| `empty:<room>` | no connected human and alive after 30 min | warning | rooms should dispose | leak |

Each alert is raised once and cleared with a "recovered" message (no repeat spam). Delivery: JSON lines on stdout plus an optional
webhook in `ALERT_WEBHOOK_URL` (an environment secret). Use a chat webhook the founder will actually see on a phone (Slack, Discord,
Telegram bridge) or `ntfy.sh`. **Test the alert path before any tester arrives**: kill the server and see the message.

```bash
RUMBLE_METRICS_TOKEN=… ALERT_WEBHOOK_URL=… node ops/monitoring/watch.mjs \
  --base http://127.0.0.1:2567 --public https://play.<domain>/health --every 15
```

VALIDATED sequence (local, 3-second polling, mock webhook): 4 public bot rooms → `rooms-capacity` (warn), `cpu-crit` (94.5 %),
`step-slow`, `ticks-dropped`, `loop-crit` (110 ms) → recovered one by one; server killed → `down` after 3 failures; restart →
recovered. All 12 events reached the webhook.

## Room lifecycle monitoring

Lifecycle: `lobby → countdown (3 s) → playing → results (lingers 10 min for a rematch) → disposed`. Observable from `/metrics` per
room: phase, age, connected humans, matches started / finished, kicks, reconnections. What is watched: stuck matches, rooms
alive with no one connected, total rooms and matches running, and (via `probe.mjs --only roomflood`) the effect of creation floods.
**Gaps for Architecture (SRV-5):** no process-level counters (rooms created / disposed totals, matches abandoned), no connected-socket
count, no bot count per room, no match-duration histogram, no reconnect-failure counter; `/metrics` is JSON, not Prometheus format
(a small adapter or `json_exporter` would be needed to use Grafana later). None blocks the first release.

## Error reporting

`ops/monitoring/error-reporter.mjs` is loaded with `NODE_OPTIONS=--import=/app/error-reporter.mjs` (needs the file in the image) or
`node --import`. It reports uncaught exceptions and unhandled rejections as one JSON line and an optional webhook, **scrubs room
codes and token-like strings**, then exits 1 so the supervisor restarts the process (state after an uncaught exception is
unknown; this ends running matches, which is the cost). It contains no player data. A hosted tool (Sentry's free tier) can replace
it later by wiring its SDK in `server/src/main.ts` (Architecture's file); client-side errors are a separate, later concern.

## Logs

Docker `json-file` rotation (10 MB × 5) bounds disk (the oversized-frame stack trace flood, F6, cannot fill it). nginx logs drop
query strings and mask room codes, and may still hold client IP addresses: treat them as personal data (08, privacy).

## What to look at on a test day

1. `docker compose ps` all healthy; `watch.mjs` quiet (only `sample` lines).
2. During a match: rooms, humans, CPU %, event-loop p99 (the `sample` line every poll).
3. After: `probe.mjs --only health,metrics,origin,abuse,reconnect` still green.
4. Collect from testers: the latency page's JSON (05), device, network, whether any session dropped, and when.

## Not done / needs real hosting

External uptime monitor accounts, a real alert channel, certificate-expiry alerting, log shipping, a status page, per-region
synthetic probes from Nigeria (an uptime service with a Lagos location is not guaranteed; the phone test covers it manually).
