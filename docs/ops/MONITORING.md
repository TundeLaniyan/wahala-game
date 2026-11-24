# Monitoring, health checks, error reporting and alerting

Implemented and tested: `ops/monitoring/` (rules, poller with optional webhook, Prometheus text). Run against a live loaded server: it raised `crit cpu 93.7 %`, `warn capacity (3 rooms, limit 2)`, `warn timer-lateness 44-53 ms`, `warn tick-step 13.6 ms` and exited 1; a wrong token produced `crit down (last: metrics 401)`.

## 1. Signals available today

| Source | What it gives |
| --- | --- |
| `GET /health` | `{"ok":true}` if HTTP answers. **Liveness only** (AUDIT F6): it stays green while ticks are being dropped. Used by the container `HEALTHCHECK` and external uptime pings. |
| `GET /metrics` (Bearer token; hidden at the edge) | Process: uptime, CPU % since last read, RSS/heap, event-loop delay (mean/p50/p99/max). Per room (id is a hash, **never the private code**): phase, humans, connected humans, uptime, ticks run/**dropped**, sim step and broadcast p99, **timer lateness**, bytes sent, keyframes, invalid messages, rejected actions, resyncs, **kicks**, **drops**, **reconnections**, **bot takeovers**, matches started/finished, inputs accepted/stale/over-rate. |
| Container/host | Docker health state, restarts, CPU/RAM from `docker stats`; the provider's graphs. |
| Server log | `room X created/disposed`, kicks, shutdown. **Contains private codes**: sensitive. |
| nginx log | route class, status, timing, no paths/queries/user agents: counts of 429/403 = abuse pressure. |

## 2. Alert rules (`ops/monitoring/rules.mjs`, thresholds are **starting values**, not proven SLOs)

| Rule | Level | Condition | Why / first response |
| --- | --- | --- | --- |
| `down` | crit | 2 consecutive failed polls | Process or network gone. Check `docker ps`, restart, read the last logs. |
| `restart` | warn | uptime went backwards | Matches in flight were lost. Find the cause (OOM? deploy?). |
| `cpu` | warn ≥ 70 %, crit ≥ 90 % | of one core | One process = one core. Look at `capacity`. |
| `event-loop` | warn ≥ 40 ms, crit ≥ 100 ms | p99 delay | Everyone's input lag; same causes as CPU. |
| `tick-step` | warn ≥ 12 ms, crit ≥ 16 ms | per playing room, sim step p99 (budget 16.7 ms) | Too many bots/rooms for the core. |
| `timer-lateness` | warn ≥ 20 ms | per playing room | The loop starts ticks late: noisy VM neighbour or overload. |
| `dropped-ticks` | warn ≥ 1, crit ≥ 60 per poll | players see slow motion | Overload; end/refuse rooms. |
| `capacity` | warn | > 2 playing rooms per process | Stop admitting new rooms; investigate abuse (F3). |
| `room-creation-burst` | warn | ≥ 100 new rooms between polls | Create flood past the edge limits. Tighten `mmcreate`, allowlist. |
| `kicks`, `invalid-messages` | warn | ≥ 5 / ≥ 50 per poll | Flooding or malformed traffic. Compare with nginx 429s. |
| `memory` | warn ≥ 800 MB, crit ≥ 1 000 MB RSS | set to ~80 %/100 % of `mem_limit` | Leak (long-run soak) or too many rooms. |
| `stuck-room` | warn | playing > 15 min (a match is ≤ 5 min + Sudden Death) | Room lifecycle bug; restart at a quiet moment. |
| `idle-lobby` / `lobby-flood` | info / warn | lobby > 60 min / ≥ 200 lobbies | Forgotten rooms / flood. |

## 3. Room lifecycle monitoring

Lifecycle: `lobby → countdown (3 s) → playing → results → (rematch) lobby`, disposed when empty. Watch: rooms by phase (`rumble_rooms_by_phase`), playing-room age, rooms created/disposed (the poller's delta), `matches.started` vs `matches.finished` per room, `drops` vs `reconnections` vs `botTakeovers` (a high takeover-to-drop ratio means the 30 s window is not saving players: a network-quality signal worth segmenting by carrier once real phones play). **Gap:** per-room counters disappear when the room is disposed, so totals over time are lost and rules only compare rooms present in both polls. *Arch:* add process-level monotonic counters (rooms created/disposed, matches finished, kicks, rejected joins). Prometheus text can then be graphed with `rate()`.

## 4. Error reporting

- **Server:** crashes surface as container restarts (`restart` rule + `docker inspect` exit code) and stderr. Add `uncaughtException`/`unhandledRejection` logging with a sanitised message (*Arch*). Keep logs local (rotated); do not ship room codes to a third party.
- **Client:** none exists. For supervised tests, testers report by message with the in-game RTT chip value, time, carrier and what they saw; `/metrics` snapshots around that time are the server side of the story. For public play, add a client error reporter (e.g. a hosted error tracker with its free tier) only after a privacy decision (no names, no room codes in reports); not set up.

## 5. Where alerts go

Nothing is sent anywhere by default. The founder chooses a channel (a private Discord/Slack/Telegram webhook, an email relay or the provider's alerting) and puts the URL in the monitor's environment: it is a secret (`SECRETS.md`). The poller de-duplicates a rule for 5 minutes. Also use **one external uptime check** (any free HTTP monitor) on `https://play.<domain>/health` so an outage of the VM itself is noticed; the in-VM watcher cannot report its own death.

Prometheus option: `node ops/monitoring/watch.mjs --prom-port 9464 ...` serves the latest snapshot as text on `127.0.0.1:9464/metrics`; a free hosted Prometheus/Grafana agent can scrape it. The converter is unit-tested; no scraper or dashboard was set up or validated.

## 6. Dashboard (when someone looks)

One screen: humans connected, rooms by phase, process CPU and event-loop p99, dropped ticks (rate), per-room step p99, RSS, kicks/429s, drops vs reconnections vs bot takeovers, restart count.
