# City Rumble online: load and network-impairment results

Measured 2026-11-23 on branch `claude/wahala-city-rumble-online-30w0rm`. Harness: `server/bench/` (`load.ts`, `loadClient.ts`, `loadWorker.ts`, `impairProxy.ts`, `loadSuite.ts`, `loadReport.ts`). Raw data: one JSON per run in this folder (the tables below are generated from them with `npm run load:report`).

## 1. Machine and what was (and was not) simulated

| | |
|---|---|
| CPU | Intel Xeon (unnamed) @ 2.30 GHz, **4 vCPU** |
| RAM | 16 GB (no swap) |
| OS / Node | Linux 6.18, Node v22.23.5 |
| Server | `server/src/main.ts` (via `server/bench/rumbleServerProc.ts`, a one-line wrapper that imports it) as a separate process, `RUMBLE_TEST_FAST=1`, `RUMBLE_RECONNECT_SECONDS=30` (10 in the reconnect run), default 30 Hz frames, hash every 120 ticks |
| Clients | headless Node processes (1-4 of them, up to 64 clients each) running the real `@colyseus/sdk` over real WebSockets, the real `NetReplica` and a 60 Hz `setInterval` playout |
| Network | loopback, with an **application-level impairment proxy** per client (below) |

**This is not real browsers and not physical phones.** There is no browser rendering, no touch input, no radio, no mobile CPU. A real phone adds render cost and slower JS; numbers here say nothing about client frame rate. The "players" are `standard`-difficulty bots (`createBot(...).decide(observe(replica.state, seat))`) running on the client's replica, so what they decide is what a human would see (delayed), but their behaviour is a bot's, not a person's.

### Impairment proxy (`impairProxy.ts`)
`tc netem` is not installed in this container and there is no kernel shaping, so impairment is emulated in user space. Each client dials a TCP proxy (node:net) that forwards both the SDK's HTTP matchmaking and the WebSocket. Per direction and per connection a chunk is delivered at `max(previous delivery, now + oneWay + U(-jitter, +jitter))` (order preserved like TCP). With probability p per chunk, the chunk is held an extra retransmission stall (200 ms + U(0,1) x RTT) and order preservation makes every later chunk wait behind it (head-of-line blocking). A new connection pays one RTT before its first byte (handshake). Seeded PRNG (mulberry32), no `Math.random`.

| profile | one-way | jitter | loss (per chunk) |
|---|---|---|---|
| clean | 0 | 0 | 0 |
| europe (Lagos to London) | 57 ms (RTT ~114) | +-10 ms | 0 |
| mobile | 75 ms (RTT ~150) | +-30 ms | 1 % |
| bad-mobile | 125 ms (RTT ~250) | +-60 ms | 3 % |

It models fixed latency, jitter, TCP-style loss as stall plus head-of-line blocking, handshake cost and abrupt connection kill. It does **not** model bandwidth limits or queueing, congestion-window collapse after loss, TLS handshakes, radio state changes, NAT rebinding, or reordering. A "chunk" is what node reads from loopback (normally one WebSocket message), not an MTU packet, so "1 % loss" means 1 % of socket reads. Real mobile networks will behave worse in the tails.

### Method
One private room per match: `{ private: true, game: 'deathmatch', durationSec: 60, arenaId: 'rumbleOshodi' }`, the host starts, 32 fighters total (humans fill seats, server bots the rest). A deathmatch tie at time-up goes to sudden death, so matches run 60 s up to ~91 s of match time. The orchestrator polls `GET /metrics` every second. Server CPU is `process.cpuUsage` deltas as % of one core (it can exceed 100 % because GC and other runtime threads add to the main thread). Server step / lateness p99 are the median of the per-second 10 s-window p99s (`p99`) and the worst window (`worst`); `max` is the exact maximum. Client input rate: each decision is sent at most every 80 ms (see section 4, "input rate" for why). RTT is from `ping`/`pong` every second. Input-to-visible latency: from sending a NEW direction (different from the previous one, player idle on the replica) to the replica showing a one-tile step in that direction. Tick lag: the server tick estimated at pong time (pong `t` + RTT/2 x 60) minus the replica tick. KB = 1024 bytes; "proxy" bytes are TCP payload including WebSocket framing, not IP/TCP headers.

Every run records whole-machine CPU from `/proc/stat`. Another process (a Chromium browser test from a parallel workstream) shares this machine and used up to ~300 % CPU at times, so a run is retried when "foreign" CPU (machine minus server minus client processes) averages above 60 % of a core; every run in the tables below has foreign CPU under ~25 % except where marked. Runs from before this check, with foreign CPU of 230-260 %, were discarded and redone.

## 2. Results

Columns: server CPU is % of one core during the match. `lateness` is how late the 60 Hz timer callback ran. `ticks dropped` is ticks the loop gave up catching up (the match runs slower than real time for that long). "missed / dup eliminations" is unexplained misses / duplicates versus the union over clients (explosions likewise); misses inside a client's own keyframe gap are listed separately as `gap`. "kills a/b" is the kills sum in the server's results message versus credited `playerEliminated` events seen by clients.


### 2.1 Scenarios a and b: one room, 2 to 32 clients clean, then 32 clients on europe / mobile / bad-mobile (server side and bandwidth)

| run | clients | server CPU % mean / p95 / max | RSS MB mean / max | step ms mean / p99 / p99 worst / max | lateness ms p99 / worst / max | ticks dropped | KB/s down, up per client (proxy) | frames KB/s per client (server count) | egress KB/s |
|---|---|---|---|---|---|---|---|---|---|
| basic-bad-mobile-c32-r1 | 32/32 | 9.2 / 12.7 / 15.2 | 150.1 / 152.6 | 0.6 / 1.49 / 2.61 / 8.66 | 1.85 / 3.04 / 6.43 | 0 | 6.12, 0.16 | 5.84 | 195.8 |
| basic-clean-c02-r1 | 2/2 | 28.7 / 45.1 / 50.2 | 189 / 202 | 3.17 / 9.32 / 22.63 / 65.43 | 1.63 / 8.54 / 51 | 0 | 10.3, 0.11 | 10.03 | 20.6 |
| basic-clean-c04-r1 | 4/4 | 29.7 / 44.8 / 48.8 | 183.1 / 218.6 | 3.22 / 10.14 / 20.05 / 53.49 | 1.69 / 5.71 / 39.53 | 0 | 10.44, 0.12 | 10.16 | 41.7 |
| basic-clean-c08-r1 | 8/8 | 23.8 / 32 / 39.3 | 193.4 / 215.2 | 2.51 / 7.54 / 14.07 / 35.82 | 1.63 / 3.26 / 21.2 | 0 | 10.55, 0.1 | 10.26 | 84.4 |
| basic-clean-c16-r1 | 16/16 | 20.1 / 27.9 / 34.9 | 159.8 / 165.3 | 2.02 / 5.96 / 8.56 / 30.47 | 1.84 / 3.65 / 14.52 | 0 | 10.2, 0.11 | 9.91 | 163.2 |
| basic-clean-c32-r1 | 32/32 | 9.3 / 13.6 / 15.8 | 143 / 146.4 | 0.63 / 1.83 / 2.63 / 7.59 | 1.76 / 3.14 / 10.19 | 0 | 10.18, 0.12 | 9.88 | 325.9 |
| basic-europe-c32-r1 | 32/32 | 10.4 / 14.7 / 15.9 | 151.9 / 155.4 | 0.7 / 1.99 / 3.25 / 13.58 | 1.85 / 5 / 7.06 | 0 | 7.62, 0.15 | 7.33 | 243.8 |
| basic-mobile-c32-r1 | 32/32 | 10.9 / 14.9 / 17.6 | 147.4 / 149.3 | 0.7 / 1.64 / 2 / 4.57 | 1.79 / 2.29 / 5.38 | 0 | 7.55, 0.18 | 7.25 | 241.6 |

### 2.2 Same runs: client experience and consistency

| run | RTT ms p50 / p95 | input to visible ms p50 / p95 (n) | tick lag ms p50 / p95 | buffer ticks p50 / p95 / max | hash checks / mismatches | resyncs | skippedAhead | missed / dup eliminations; explosions | consistent (results kills / credited elims) | client procs CPU % / loop max ms |
|---|---|---|---|---|---|---|---|---|---|---|
| basic-bad-mobile-c32-r1 | 294.1 / 615.1 | 447.8 / 678.4 (215) | 382 / 562 | 11 / 23 / 31 | 1216 / 0 | 0 | 0 | 0 / 0 of 145; expl 0 / 0 of 323 | yes (kills 89/89) | 17.9 / 9.88; 17.2 / 94.48; 15.1 / 122.73 |
| basic-clean-c02-r1 | 0.6 / 3.9 | 79.8 / 96.7 (23) | 67 / 84 | 4 / 5 / 5 | 62 / 0 | 0 | 0 | 0 / 0 of 88; expl 0 / 0 of 736 | yes (kills 85/85) | 6.3 / 12.47 |
| basic-clean-c04-r1 | 0.5 / 1.8 | 64.8 / 81.3 (63) | 67 / 68 | 3 / 4 / 5 | 124 / 0 | 0 | 0 | 0 / 0 of 79; expl 0 / 0 of 761 | yes (kills 76/76) | 9.5 / 22.84 |
| basic-clean-c08-r1 | 0.4 / 3.6 | 64.2 / 98.4 (78) | 50 / 68 | 3 / 4 / 4 | 248 / 0 | 0 | 0 | 0 / 0 of 88; expl 0 / 0 of 734 | yes (kills 86/86) | 12.9 / 19.05 |
| basic-clean-c16-r1 | 0.4 / 2.1 | 64.8 / 93 (180) | 52 / 69 | 3 / 4 / 6 | 496 / 0 | 0 | 0 | 0 / 0 of 82; expl 0 / 0 of 726 | yes (kills 81/81) | 14.2 / 36.42; 13.7 / 19.74 |
| basic-clean-c32-r1 | 0.4 / 1.6 | 81.5 / 130.3 (384) | 67 / 117 | 4 / 6 / 7 | 992 / 0 | 0 | 0 | 0 / 0 of 92; expl 0 / 0 of 685 | yes (kills 90/90) | 18.4 / 48.9; 18.9 / 70.69; 17 / 50.54 |
| basic-europe-c32-r1 | 116.2 / 129.4 | 191.4 / 210.6 (253) | 123 / 142 | 3 / 5 / 6 | 1184 / 0 | 0 | 0 | 0 / 0 of 171; expl 0 / 0 of 590 | yes (kills 128/128) | 19.6 / 42.02; 19.3 / 42.61; 17.9 / 36.09 |
| basic-mobile-c32-r1 | 161.8 / 353.7 | 261 / 457 (236) | 183 / 370 | 6 / 16 / 24 | 992 / 0 | 0 | 0 | 0 / 0 of 145; expl 0 / 0 of 409 | yes (kills 120/120) | 21.4 / 24.52; 20.4 / 20.26; 18.1 / 14.5 |

### 2.3 Scenario e: capacity, K rooms of 2 humans + 30 server bots (K=1 is basic-clean-c02-r1 above)

| run | rooms x humans | server CPU % (busy seconds) median / p95 / max | RSS MB max | step ms mean / p99 / worst / max | lateness ms p99 / worst / max | ticks dropped | loop delay p99 worst ms | client p95: RTT / input / lag ms | rooms finished | consistent | foreign CPU % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| basic-clean-c02-r2 | 2 x 2 | 48.5 / 60.3 / 65.3 | 293.4 | 2.85 / 7.99 / 17.05 / 49.78 | 7.49 / 18.11 / 76.62 | 0 | 44.95 | 4 / 127.4 / 101 | 2/2 | yes | -2.6 |
| basic-clean-c02-r3 | 3 x 2 | 72.9 / 90.9 / 99 | 474.8 | 2.92 / 8.54 / 19.91 / 45.43 | 16.26 / 45.36 / 104.1 | 1 | 45.25 | 5.5 / 190.5 / 102 | 3/3 | yes | -3.5 |
| basic-clean-c02-r4 | 4 x 2 | 94.4 / 114.2 / 125 | 545.4 | 2.59 / 8.11 / 19.3 / 42.28 | 37.5 / 102.69 / 142.06 | 47 | 127.89 | 42.4 / 143.4 / 117 | 4/4 | yes | -0.4 |
| basic-clean-c02-r6 | 6 x 2 | 109.3 / 127.5 / 134 | 724.8 | 3 / 8.81 / 20.66 / 40.99 | 152.57 / 169.12 / 254.96 | 2282 | 171.67 | 119.5 / 259.2 / 130 | 6/6 | yes | -7.3 |
| basic-clean-c02-r8 | 8 x 2 | 109.1 / 129.8 / 135.2 | 871.4 | 3.09 / 9.09 / 22.58 / 52.25 | 204.43 / 217.5 / 322.23 | 10799 | 284.65 | 143 / 338.9 / 141 | 8/8 | yes | -3.1 |

### 2.4 Scenario e: capacity, K rooms of 32 humans (no bots); K=1 is basic-clean-c32-r1 above

| run | rooms x humans | server CPU % (busy seconds) median / p95 / max | RSS MB max | step ms mean / p99 / worst / max | lateness ms p99 / worst / max | ticks dropped | loop delay p99 worst ms | client p95: RTT / input / lag ms | rooms finished | consistent | foreign CPU % | client procs CPU % / loop max ms | KB/s down each |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| basic-clean-c32-r2 | 2 x 32 | 14.9 / 21.6 / 43.4 | 160 | 0.61 / 2.37 / 3.98 / 39.08 | 2.93 / 121.64 / 121.64 | 2 | 10.79 | 3.3 / 194.1 / 117 | 2/2 | yes | 24.7 | 31.8/101.04; 31.3/61.06; 31.2/66.37 | 9.8 |
| basic-clean-c32-r3 | 3 x 32 | 19.4 / 27.4 / 42.5 | 165.1 | 0.55 / 2.07 / 3.88 / 10.81 | 4.05 / 85.48 / 85.48 | 0 | 80.77 | 4.8 / 152.8 / 117 | 3/3 | yes | 2.3 | 42.8/73.91; 43.1/55.78; 43.6/77.05 | 9.94 |
| basic-clean-c32-r4 | 4 x 32 | 25.2 / 32.4 / 54.7 | 164.7 | 0.57 / 2.08 / 5.69 / 18.56 | 5.08 / 158.78 / 158.78 | 4 | 112.42 | 7.9 / 198.6 / 118 | 4/4 | yes | 2 | 54.2/111.2; 54.5/143.77; 54.4/136.16 | 9.96 |
| basic-clean-c32-r6 | 6 x 32 | 32.1 / 43.6 / 70.6 | 163.2 | 0.53 / 2.27 / 9.16 / 18.95 | 7.07 / 288.06 / 288.06 | 35 | 287.8 | 113.4 / 353.5 / 203 | 6/6 | yes | 2.7 | 44.3/235.39; 43.8/218.08; 43.8/185.19 | 8.64 |
| basic-clean-c32-r8 | 8 x 32 | 42.3 / 50.9 / 97.5 | 166 | 0.57 / 3.72 / 12.54 / 15.9 | 12.64 / 749.29 / 749.29 | 162 | 750.74 | 235.2 / 666.8 / 365 | 8/8 | yes | 4.3 | 50.8/320.32; 50.5/351.52; 49.8/278.38; 50.8/322.68 | 8.11 |

### 2.5 Scenario c: reconnection (32 clients, mobile profile)

| run | [client, returned, reconnect() ms, keyframe ms, first hash-checked ms, final hash ok] |
|---|---|
| reconnect-mobile-c32-r1 | [[3,true,668,810,906,true],[6,true,456,624,1212,true],[9,true,447,599,1020,true],[12,true,451,602,840,true],[15,false,0,0,null,false]] |

### 2.6 Scenario d: app switching (10 s without playout)

| run | [client, peak buffer, buffer at resume, catch-up ms, skippedAhead, hash mismatches, final hash ok] |
|---|---|
| background-clean-c04-r1 | [[1,604,604,0,599,0,true],[2,604,604,0,599,0,true],[3,604,604,0,599,0,true]] |
| background-mobile-c32-r1 | [[1,604,604,0,599,0,true],[2,608,608,0,603,0,true],[3,604,604,0,599,0,true],[4,606,606,0,601,0,true]] |


Scenario c details (`reconnect-mobile-c32-r1.json`, server `RUMBLE_RECONNECT_SECONDS=10`): at match tick 1200 (20 s) clients 3, 6, 9, 12 were cut abruptly (the proxy destroys both sockets; the server sees close 1006), and `client.reconnect(reconnectionToken)` was called 3 s later. All four were back with the same seat: `reconnect()` resolved 447-668 ms after the call, the keyframe was loaded 599-810 ms after the call, and the first hash-checked, mismatch-free state came 840-1212 ms after the call (the hash only rides every 120 ticks = every 2 s, so this is a wait for the next check, not recovery work). Each reconnecting client skipped 206-220 ticks (3.4-3.7 s) of play that a keyframe replaced; the events inside that gap are not replayed, so those four clients missed 5 eliminations and 35 explosions in total (counted as `gap`, not as errors; state and final hash are correct and equal to the server's). Client 15 was cut and never returned: its seat was autopilot-played during the 10 s window and then by a bot; the 31 other clients watched seat 14 make 139 position changes between tick 1980 (20 s + 10 s + 3 s) and the end, and the server's results list it with 5 kills, 3 deaths, placement 7. The lobby view no longer lists that member at the end (its row is removed when the window expires), so the `connected` flag could not be read at the end. Server `reconnections` = 4, `kicks` = 0.

Scenario d details: four clients stopped calling `advance()` for 10 s while their socket stayed open. The replica queue grew to 604-608 ticks (all 10 s of frames). On the first frame after the pause `advance()` fast-applied 599-603 ticks (`skippedAhead`) and was back to the normal buffer (at most 7 ticks) within that same frame (catch-up 0 ms); the events of the skipped ticks were still delivered (0 missed, 0 duplicated); 0 hash mismatches, 0 resyncs, final hashes equal the server's. Consequence for the real client: after a 10 s background pause the picture jumps 10 s forward in one frame. A client that sends a neutral input when it hides (this harness does) avoids the avatar walking on the last held direction; by reading `RumbleMatch.input`/`intentsForTick` the server keeps the last held input until a new one arrives (there is no input timeout), but that case was not run.

## 3. Interpretation

**Correctness under every condition tested.** In every run whose match ended inside the cap, every compared client had the same final hash as every other and as the `stateHash` of the server's results message, identical results messages, identical final tick, identical elimination and explosion lists (0 missed, 0 duplicated outside reconnect gaps), and the server's kill count equals the number of credited `playerEliminated` events (results `deaths` = elimination events minus the sudden-death stand-downs, which the sim emits as events without counting a death, e.g. 167 events, 24 sudden-death, 143 deaths). Hash checks: 0 mismatches and 0 resyncs in every run (about 1000 checks per 32-client run).

**Server cost.** The cost is dominated by the server-side bots, not by connections. A room with 2 humans + 30 bots costs 24-29 % of a core (step mean ~3 ms/tick, p99 8-10 ms, worst-window p99 up to 25 ms, max 50-70 ms); the same room with 32 humans costs 9-10 % (step mean 0.6 ms, p99 ~2 ms, max 8-14 ms) because the AI then runs in the clients. Egress is ~10 KB/s per client at 30 Hz (proxy count 10.2 KB/s, server's own count 9.9 KB/s, matching the 9.9-11 KB/s of `bandwidth.ts`), upstream 0.1-0.2 KB/s; 32 clients = ~326 KB/s. Varying match content moves it: the impaired 32-client runs measured 5.8-7.3 KB/s by the server's own count (different seeds and play), so treat 10 KB/s as the budget. RSS is 143-218 MB for one room; with bots it grows by ~100 MB per room (871 MB at 8 bot rooms), with humans only it stays 160-166 MB from 1 to 8 rooms.

**Latency (what a player would feel in the best case).** Input-to-visible p50/p95: clean 64-82 / 81-130 ms (the 3-5 tick jitter buffer + frame batching + one tick), europe 191 / 211 ms, mobile 261 / 457 ms, bad-mobile 448 / 678 ms. Tick lag p50: 50-67 (clean), 123, 183, 382 ms. The adaptive buffer grew from 3-4 ticks (clean) to 5 / 16 / 23 ticks (p95: europe / mobile / bad-mobile; max 31) and never reached the 45-tick catch-up threshold, so there were no resyncs. Loss as modelled costs mostly through head-of-line stalls: the bad-mobile run had 2821 stalls over 32 clients (108 on the worst one); RTT p95 615 ms vs 294 p50. These are emulated numbers on a bot-driven client; real devices add input sampling, render and radio delay.

**Bottleneck.** With bots, the single Node main thread: K bot-rooms of 2 humans + 30 bots on one server process reach 73 % of a core at K=3 (1 dropped tick in the whole match, lateness p99 16 ms, worst 45 ms), degrade at K=4 (47 dropped ticks, lateness p99 38 ms, worst 103 ms), and fail at K=6 (2282 dropped ticks, lateness p99 153 ms: the match runs slower than real time; all matches still ended consistent) and K=8 (10799 dropped, about a quarter of the ticks the 8 rooms were due; lateness p99 204 ms). So the capacity of one server process is about **3 mostly-bot rooms per vCPU** (use 2 for margin), measured on this CPU; reaching more needs more server processes (Colyseus multi-process, not tested here). With humans only the server was never the limit: 8 rooms x 32 humans = **256 concurrent clients on one server process** at a median 42 % CPU (p95 51 %, 6 % of a core per room at K=4), step p99 3.7 ms. At 6 and 8 rooms the boxed limits were reached first: four client processes plus the server share 4 vCPUs, client event-loop stalls reach 185-350 ms and the clients' own RTT p95 on loopback is 113-235 ms, so latency figures at K >= 6 are partly harness artefacts and say nothing about the server. By CPU alone one core would hold on the order of 10+ all-human rooms (5-6 % each); that is an extrapolation, not a measurement, and the match-start stall below caps it in practice.

**Max successfully tested concurrent connected clients: 256** (8 rooms x 32), 100 % of the matches ended with consistent state, 0 mismatches, 0 resyncs, 0 kicks, but with the start-up stall described below.

## 4. Anomalies, defects and caveats (all measured, nothing hidden)

1. **Input rate limit turns a lagging or jittery client into a kicked client (server behaviour, evidence in `unthrottled-inputs/`).** My first version of the client sent every change of the bot's decision at once. On the clean network that peaked at 22-26 messages/s (limit: 30/s token bucket) and nothing happened; on the impaired networks it peaked at 61-67/s, and the server counted 552 rate-limited inputs (bad-mobile), 48 (europe) and 22 (mobile). Rate-limited inputs are counted as invalid messages and more than 20 in 10 s disconnects the client with close code 4400, which is not reconnectable: 9 of 32 clients were kicked in the bad-mobile run and 2 in the europe run (those clients stopped receiving frames and never finished). I did not isolate why the client's peak rate was higher on slow networks (the replica plays catch-up bursts on 15 % speed-up and each applied tick re-decides); the practical point stands: a client that sends bursts (a touch stick flickering across a direction boundary, or a burst after a stall) can be kicked. The final tables use a client that sends at most one input every 80 ms (peak 11-13/s, which is what a real `InputManager` should stay under); with that, `rateLimited` = 0 and `kicks` = 0 in every run. Recommendation: cap the real client's send rate (about 20/s) and/or do not count rate-limited messages towards the kick.
2. **Match-start stall (server).** `RumbleRoom.beginMatch` deflates and sends a keyframe separately to every client (`sendKeyframe` per peer, ~2.9 ms each by my estimate, 256 keyframes ~ 750 ms). When 8 rooms started together the server's event loop stalled 749 ms at second 4 (162 dropped ticks, all of them at that moment; nothing dropped afterwards) and 288 ms with 6 rooms; the large lateness maxima in the K=6 and K=8 rows of table 2.4 come from this single event. A single 32-client room costs about 90 ms at its start, which rooms that are already playing on the same process will feel as ~5 late ticks. The keyframe is identical for every client in the same tick, so building it once per tick would remove it (not changed here; `server/src` is out of scope). I inferred the cause from the code and the timing; I did not profile it. The same applies to a mass reconnect.
3. **One match did not end within the 150 s cap**: the first `background-clean-c04` run (4 humans, 9034 ticks = 150 s into a sudden-death phase; `anomalies/background-clean-c04-r1-match-still-running-at-150s-cap.json`). The same scenario re-run with a 400 s cap ended after 66 s and is the one in the tables. Match length otherwise varied from 3750 ticks (60 s, no tie) to 5454 ticks (91 s). Cause of the long one not established (sudden death with nobody finishing, or this seed's play); the simulation was not changed.
4. **An early run lost its server.** In a first attempt, a 4-client run's server process disappeared at about 49 s without an error in its log while another workstream was running tests on the same machine; the results of that run were discarded. I could not establish who stopped it (an external `pkill` of `main.ts` is the likely candidate; the harness now starts the server through `server/bench/rumbleServerProc.ts` so its command line no longer contains `main.ts`, and records the exit code if the server ever exits during a run). No server crash has been seen since in ~30 runs.
5. **`/metrics` does not expose an elimination counter.** The "eliminations counted by the server" check therefore uses the server's own results message (`kills` and `deaths` per seat) against the events the clients saw.
6. **Contended machine.** Runs from before the foreign-CPU check showed 230-260 % of other CPU use; they were deleted and re-run in quiet periods. The reported runs have foreign CPU below ~25 % (`foreignCpuPercent` in each JSON; the 2 x 32 humans run shows 24.7 %, which is why its lateness worst-window of 122 ms should be read with that in mind).
7. Server CPU in the tables is main thread plus GC and other runtime threads, so it can exceed 100 %. p99 values are aggregates of the server's rolling 10 s windows, not a single exact p99 over the whole match; `max` is exact.
8. The match each run plays is random (server seed), so tick counts, elimination counts and bandwidth differ run to run; compare orders of magnitude, not decimals. Each configuration was run once (the suite retries only disturbed runs).
9. A bot-driven client is not a human: it presses buttons far more regularly and never pauses. The input-to-visible numbers include the server's press latch and the sim's own step cadence.

## 5. Reproduce

```
cd server
npm run load -- --clients 32 --profile mobile                     # one run, writes docs/measurements/rumble-online/<label>.json
npm run load -- --clients 32 --profile mobile --scenario reconnect  # 4 drop + return after 3 s, 1 never returns (reconnect window 10 s)
npm run load -- --clients 4 --scenario background                 # 3-4 clients stop playout for 10 s at 15 s
npm run load -- --clients 2 --rooms 4                             # 4 rooms x (2 humans + 30 bots)
npm run load -- --clients 32 --rooms 8 --procs 4                  # 8 rooms of 32 humans
npm run load -- --clients 32 --profile bad-mobile --input-gap 0   # unthrottled input stress (finding 1)
npm run load:suite [-- --only clean,profiles,reconnect,background,capacity,humans]
npm run load:report                                               # prints the tables above from the JSONs
```
Flags: `--clients` (humans per room), `--rooms`, `--profile clean|europe|mobile|bad-mobile`, `--scenario basic|reconnect|background`, `--procs` (client processes, 1-4), `--duration`, `--reconnect-seconds`, `--cap`, `--input-gap`, `--label`, `--out`, `--seed`, `--arena`. A run exits with code 3 if other work on the machine used more than 60 % of a core during it.
