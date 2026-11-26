# Private beta: load, soak and capacity evidence

**Read this first.** Every number here comes from **simulated clients** (headless copies of the game's own network client sending a stick direction about ten times a second) running on **the same single machine** as the server, in a Linux sandbox with nested Docker. It is not a phone, not a mobile network, and not your server: its CPU speed is unknown and probably slower than a modern cloud core. Each configuration was run **once** (some twice, noted): compare orders of magnitude, do not quote a decimal. The sampler also costs a little CPU. Do not claim from this page that the service "supports N players". It says what happened in these runs and what limit was chosen because of it.

Raw output of every run: `docs/measurements/beta-backend/*/run.txt`. How to repeat them on your own server: `ops/beta/load.sh` (needs a running stack and one prior `validate.sh` for the driver image). Older, deeper evidence about the match server alone (network impairment, 32 humans over bad mobile links, 30-minute heap-snapshot soak): `docs/measurements/rumble-online/`, `docs/ops/CAPACITY.md`.

## 1. Test set-up

| | |
| --- | --- |
| Stack | the real beta stack from `ops/beta/compose.yml`, built from this branch: edge, match server (`cpus: 1.0`, 1 GB), platform (0.5 CPU, 384 MB), PostgreSQL 16 (1 CPU, 768 MB) |
| Match | the production lengths only (180 s or 300 s; the server refuses others), 32 fighters per match, empty seats filled by server bots, a **real** authoritative match to the end |
| Clients | one random guest id per simulated player (as the real client sends: the server's join limits are per guest id), joining over the private network (the edge's per-address limiters would measure the limiter, not the server; they are tested separately in `validate.sh`) |
| Server limits during the runs | `RUMBLE_MAX_PLAYING_ROOMS=3` (changed afterwards, see section 4), `RUMBLE_CPU_BUDGET=70`, per-guest join 20 burst / 30 per minute, per-guest create 4 burst / 6 per minute |

## 2. Results

CPU % is of **one core** (the match server is single-threaded: 100 % is its ceiling). "Tick step" is the time to simulate one 60 Hz tick (budget 16.7 ms). "Timer lateness" is how late a tick fired. A **dropped tick** means the server fell behind and ran a tick late: the players' game briefly slows.

| # | Run | Match server CPU (avg / max) | Match server memory (RSS max) | Tick step p99 (max) | Timer lateness p99 (max) | Dropped ticks | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **1 room, 2 humans + 30 bots** | 30 % / 50 % | 164 MB | 21.9 ms | 8.2 ms | 0 | both humans received results |
| 2 | 1 room, 8 humans + 24 bots | 24 % / 42 % | 165 MB | 10.3 ms | 1.8 ms | 0 | all 8 results |
| 3 | **1 room, 32 humans, no bots** | 9 % / 20 % | 120 MB | 2.2 ms | 1.9 ms | 0 | all 32 results |
| 4 | **2 rooms, each 2 humans + 30 bots, at once** | 59 % / 98 % | 204 MB | 26.6 ms | **58.3 ms** | 1 | all 4 results; the server runs at its ceiling |
| 5 | 3 rooms asked to start at once | 60 % / 95 % | 206 MB | 31.6 ms | 41.1 ms | 0 | **2 played, the 3rd was held back** (section 3); its 2 humans were told "servers busy" and, after the 120 s wait, the room was closed (close code 4401) |
| 6 | Guard probe: 5 rooms created and started | 12 % / 44 % | 206 MB | 7.8 ms | 1.1 ms | 0 | all 5 rooms created; 3 hosts received "server busy, your match starts as soon as a slot is free" |

What this says about **cost**: a room filled with 30 server bots costs about **three times** as much CPU as a room of 32 humans (about 25-30 % of a core against 9 %). The bots are the expense. Two bot-filled rooms already use most of one core and push timer lateness well above one tick (rows 4-5).

| # | Run | Result |
| --- | --- | --- |
| 7 | **Repeated join / leave**: 150 joins at 5 at a time, then 30 private rooms created and abandoned | 150 / 150 joined (p50 4 ms, p99 22 ms); 30 / 30 created; the server went back to 0 rooms and 0 connections; match-server memory flat. The same test with ONE shared guest id was refused by the per-guest limiter (130 / 150 joins and 29 / 30 creates refused): the protection works and the test client had to behave like real clients |
| 8 | **Hostile load on the platform**: 30 workers for 30 s from one address (167,000 requests, 5,500 a second) against an authenticated database read | 488 served, **166,497 refused with 429**; p99 43 ms; platform CPU 33 % avg (52 % max), memory at most 33 MB; database connections peaked at **11** of 40 (pool 10); the database CPU never passed 6 %. A flood from one address cannot reach the database in volume |
| 9 | **Network drop mid-match** (both connections cut abruptly, close code 1006): one player's client retries by itself, the other's network never returns | the returning player was back after **214 ms** and received the results; the other seat was taken by a **bot** after the 5 s grace and the match finished normally; no kicks, 3 dropped ticks |
| 10 | **Backend outage during a match**: database and platform both stopped for 25 s | the match was unaffected (both humans received results); the platform answered 1 s after it was started again |
| 10b | **Match server killed (SIGKILL) mid-match** | Docker restarted it, healthy again after **6 s**; the next joins (5 / 5) and room creations (5 / 5) worked at once. **The match that was running is lost** (its two humans were disconnected, close 4003): a match lives in memory, a server crash ends it. That is a known limit of the design, not a bug of this stack |
| 11 | **Soak, 18 minutes**: 5 rounds, each with 2 bot-filled rooms of 3 humans playing real 180 s matches while join / leave churn and API traffic ran next to them | no crash, no kick, no invalid message, no dropped connection recorded by the server (the per-match results of the soak rounds were **not** captured, only the server's own counters; the other rows show full results). Match server memory at idle points 151 -> 179 -> 182 -> 184 MB (flattening); platform 28 -> 31 MB; database 21 MB; PostgreSQL connections peaked at 9. CPU averaged 55 % and **touched 100 %** (the container limit), with **11 dropped ticks** in the 18 minutes: this is more than the recommended working point (section 4) and it shows what overload looks like: brief slow-downs, not failures |

## 3. How the server protects itself (observed, not assumed)

- The capacity guard counts a **cost** per match (about 23 units for a bot-filled room, about 10 for an all-human one) against `RUMBLE_CPU_BUDGET=70`. Two bot rooms cost 47; a third would be 70.5 and **was refused** ("start_cpu_budget" 13 times in run 5). The refused room is not dropped at once: it waits up to 120 s ("your match starts as soon as a slot is free"), then is closed with a polite "try again in a little while".
- Per-guest and per-address limits on joins, failed joins and room creation held in every run (rows 7-8). The edge adds per-address zones (`validate.sh` floods them: 57 of 60 account creations refused with `Retry-After`).
- A single address cannot exhaust the database: pool of 10 connections, PostgreSQL `max_connections` 40, statement and idle-in-transaction timeouts (`validate.sh` and `player-platform/test/ops.test.ts`).

## 4. The initial concurrency cap, and why

**Recommended cap for the first invite-only sessions: 2 matches playing at the same time** (`RUMBLE_MAX_PLAYING_ROOMS=2`, now the default in `ops/beta/compose.yml` and in the `init` template; `RUMBLE_CPU_BUDGET=70` unchanged). Players beyond that wait in a queue for up to two minutes.

Why 2, from the measurements:

1. Two bot-filled matches ran correctly to the end every time (rows 4, 5, 11) but already used 59 % of the core on average and touched 95-100 % at peaks, with timer lateness of 40-58 ms (more than three ticks) and a few dropped ticks. That is the edge of comfortable on this machine, and a real server core may be faster or slower.
2. The CPU-budget guard already refuses a third bot-filled match, so 3 would only ever apply to all-human rooms, which were **not** measured in numbers above one room (row 3).
3. The 3-room and soak runs show the failure mode is graceful: slow-downs and a clear "server busy" notice, never a crash or a lost database.

What the cap means in people: any mix of up to two matches, up to 32 players in each. The cases actually measured are: 1 bot-filled room, 2 bot-filled rooms, and 1 room of 32 humans. **Two rooms of 32 humans, and three all-human rooms, were not measured**; the cost model says they are cheap, but treat that as unproven. Raise the cap only after repeating `ops/beta/load.sh` on the real server and with real phones.

Other resources, all far inside their limits in every run: match server memory at most 240 MB of 1 GB; platform at most 40 MB of 384 MB; PostgreSQL at most 55 MB of 768 MB; edge at most 14 MB and 3 % CPU. **CPU of the match server is the one resource that binds.** A 2-vCPU server gives it one full core and leaves the other for everything else. More than two bot-filled matches needs a second core **and a second match-server process**, which this design does not do (one process uses one core): that is a later project, not a setting.

## 5. What was not tested

- Real phones, real mobile networks, real packet loss and latency over the edge (see `docs/measurements/rumble-online/` for impairment runs of the match server alone).
- More than one client address: every simulated player shares one source address. Per-address limits therefore behave more strictly here than for a crowd of different people, and the database was not loaded by many honest users at once.
- Three or more all-human rooms; two rooms of 32 humans.
- A soak longer than 18 minutes on this stack (the match server alone has a 30-minute heap-snapshot soak: heap stable, resident memory flattening, `docs/measurements/rumble-online/soak-30min.md`).
- Running on a rented server. The first thing to do there is `ops/beta/wahala-beta.sh validate --quick` and then `ops/beta/load.sh rooms --rooms 2 --humans 2 --seconds 180`, and compare with rows 1 and 4.

## 6. Defects the load work found (all fixed or recorded)

- The database container could not be stopped cleanly (its init process had no permission to signal PostgreSQL, so every stop was a crash): fixed (`init: false` for the database).
- After a container was replaced the edge kept proxying to the old address and answered 502: fixed (the edge resolves service names on every request).
- Limits that came from the harness, not the server: shared guest id, polite-close instead of a network cut, manual reconnect without the guest id. Recorded so nobody repeats them: **a load test must behave like the real client** (one guest id per player, SDK automatic reconnection).
