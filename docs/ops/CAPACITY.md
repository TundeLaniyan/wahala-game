# Capacity planning: 32-human rooms and bot-heavy rooms

Basis: measured numbers in `docs/CITY_RUMBLE_ONLINE.md` section 7 (4 vCPU Xeon 2.3 GHz, Node 22.23) plus my re-measurements on the same class of machine (`ops/scripts/abuse-probe.mjs start-flood`, bundle run outside the repo). All with **simulated clients**: they size the server, they say nothing about phones. One run per configuration; compare orders of magnitude.

## The constraint that shapes everything

The simulation loop is **single-threaded**: one Node process uses one core, and Colyseus matchmaking only sees rooms **inside its own process**. Running several processes on one VM needs the Colyseus Redis presence/driver, which is **not configured**. So at launch, **one hostname = one process = one core of capacity.** More capacity is either cheaper bots, a second hostname/region (client must choose), or the Redis path: later work, not the first release.

## Unit costs (one core, one process)

| Room type | CPU of one core | Evidence |
| --- | --- | --- |
| 32 humans (no bots) | **~9-10 %** (~0.3 % per player) | 1 room × 32 clients, 0 dropped ticks (`CITY_RUMBLE_ONLINE.md` 7.2) |
| 1 human + 31 bots | **~37 %** at p50 (max 45) in my run; ~25-30 % steady | `start-flood --rooms 1` |
| 3 rooms × (1-2 humans + 30 bots) | **~74-87 %** p50 (max 84-116 %), timer lateness p99 13-54 ms, 0-3 dropped ticks | my runs; docs: 73 %, 1 dropped |
| 4 rooms × (2 + 30) | ~94 %, **47 dropped ticks** | docs: the edge |
| 6-8 rooms × (2 + 30) | saturated, thousands of dropped ticks (slow motion), still consistent | docs |
| 8 rooms × 32 humans (256 clients) | ~40 % | docs; the client machines saturated first, so the real all-human ceiling is **not measured** |

Rule of thumb from the data: `CPU % ≈ 10 + 0.67 × bots` per room. Bots (server-side AI, ~0.67 % of a core each) are the cost driver, not networking.

**Planning limits per process (≤ 70 % CPU, with headroom for spikes up to 37 ms AI ticks):**
- **Bot-heavy rooms: 2 playing rooms** (3 is the warning level, 4 drops ticks).
- **All-human rooms: ~5-7** (extrapolated; confirm before claiming).
- Mixed: add the per-room formula until the sum reaches 70 %.

## Memory and bandwidth

| Resource | Measure | Plan |
| --- | --- | --- |
| Memory | Empty server heap ~28 MB; **RSS 187 MB with 1 playing room, 346-424 MB with 3**; ~20 MB external buffers per live room; V8 keeps a high-water mark | 150 MB per playing room + 150 MB base; container `mem_limit` 1 GB holds 4-5 rooms. Post-fix soak: heap stable (+0.11 ± 0.31 MB/min over 5 min); **run `npm run soak -- --duration 1800` before any public activation.** |
| Egress | ~10-11 KB/s per human at 30 Hz (~36-40 MB per player-hour, ~3.3 MB per 5-min match); a 32-human room ≈ 330 KB/s | 100 average CCU ≈ 1 MB/s ≈ 2.6 TB/month sustained; a 4-hour, 64-player test ≈ 9 GB |
| Ingress | ~0.1-0.5 KB/s per human | negligible |
| Connections | one WebSocket per human | trivial (nginx `worker_connections` 4 096; per-address 64) |

## What the first releases can honestly carry

| Stage | Humans online | Rooms | Process | VM |
| --- | --- | --- | --- | --- |
| Supervised private test | ≤ 32 (one room) or a few small rooms | ≤ 2 bot-heavy | 1 | 2 vCPU, 4 GB (second core for nginx, OS, monitor) |
| Guest soft launch (friends, one region) | roughly 4-12 people in 2 rooms, or ~100+ if they gather into full rooms | ≤ 2 bot-heavy or ~5-7 full | 1 | same VM |
| Anything beyond | needs a decision | | cheaper bots and/or Redis/second host | |

**Quick Play note:** a public room starts 30 s after the first human joins and fills ~31 seats with bots. Low population therefore means many bot-heavy rooms, which is the expensive case. With only one core, set expectations (or cap) accordingly; the **cap on playing rooms** (AUDIT F3) is what protects the existing players' match quality.

## Headroom alarms

`capacity` (> 2 playing rooms), `cpu` ≥ 70/90 %, `timer-lateness` p99 ≥ 20 ms, `dropped-ticks` (any): `MONITORING.md`. If `dropped-ticks` fires in a real test, the room count, not the network, is the first suspect.

## Levers, in order of value

1. Cap playing rooms per process and refuse the next one (`server_busy`): protects quality, bounds cost (Arch).
2. A cheaper filler-bot level / profile the bot brain for server use (Arch; the largest single saving).
3. Second hostname/region per core; Redis presence when it is worth the operations cost.
4. 20 Hz sends (−10 % bandwidth), interest management: bandwidth is not the constraint yet.
