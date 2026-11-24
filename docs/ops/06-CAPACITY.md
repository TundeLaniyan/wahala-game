# 06 — Capacity planning: 32-human rooms and bot-heavy rooms

Machine for every measurement: this sandbox, 4 vCPU Intel Xeon @ 2.3 GHz, Node 22.23. One server process = one busy thread.
**MEASURED** = produced here by me (2026-11-24) against the shipped bundle; **ARCH** = Architecture's published figure
(`docs/CITY_RUMBLE_ONLINE.md` §7). Single runs: compare orders of magnitude, not decimals. A production CPU will differ: re-measure
on the chosen host (the probe and load harness are the tools).

## Per-room cost (server CPU as % of one core)

| Room | CPU | Memory | Egress | Source |
| --- | --- | --- | --- | --- |
| 32 humans, clean network | **10.6 %** mean (p95 15.2, max 17.7), 0 dropped ticks, step p99 2.8 ms | 115–129 MB RSS | 329 KB/s total, 10.3 KB/s per client | MEASURED (`bench/load.ts --clients 32`); ARCH 9.3 % |
| 1 human + 31 bots | **24.4 %** | ~65 MB per room | ~10 KB/s | MEASURED (probe `botstorm`) |
| 3 such rooms | 70.4 %, 0 dropped | ~250 MB | | MEASURED; ARCH 73 % |
| 4 such rooms | 93.6 %, event-loop p99 44 ms, **28 dropped ticks** | ~360 MB | | MEASURED; ARCH 94 %, 47 dropped |
| 6 such rooms | 103.9 % (saturated), event-loop p99 **150 ms**, **370 dropped ticks** | | | MEASURED |

Two independent measurements agree within a few points, which is the strongest evidence in this document.

**Model** (single room, fitted to the two end points): `CPU% ≈ 10.6 + 0.445 × bots`. Bots dominate: a human costs about a
quarter of a bot's CPU and a bot costs about 0.45 % of a core.

## Rooms per process (target ≤ 70 % of one core, which leaves room for spikes)

| Room type | Rooms per vCPU | Humans per vCPU |
| --- | --- | --- |
| all 32 seats human | 6 (10.6 % each) | ~190 |
| 16 humans + 16 bots (17.7 %) | 3 | ~48 |
| 8 humans + 24 bots (21.3 %) | 3 | ~24 |
| 1–4 humans + 28–31 bots (~23–24 %) | **2 with margin, 3 at the edge** | **~3–12** |

So the cost per human varies 20×: about 0.33 % of a core per human in a full room, about 6 % in a 4-human, bot-filled room.
**Public matchmaking that fills rooms with people is the cheapest thing you can do; a long tail of near-empty bot rooms is the
most expensive.** Reducing bot AI cost (Architecture's own conclusion; the bot brain is the dominant server cost) or starting
matches with fewer bots would change this table more than any hosting choice.

## Network

`≈ 10.3 KB/s down + ~0.13 KB/s up per human` (MEASURED, 30 Hz) = 37 MB per player-hour, ~3.3 MB per 5-minute match.
Monthly egress at a constant average concurrency: **100 players → 2.7 TB; 1,000 → 27 TB** (arithmetic from the measured rate).
A 32-human room is 329 KB/s ≈ 2.6 Mbit/s: bandwidth is never the constraint of one process; it is the monthly bill on
hyperscalers (05). Upstream from phones is tiny, which suits Nigerian uplinks.

## Scenarios (arithmetic from the model; NOT load-tested at these sizes)

| Scenario | Rooms | Cores of server processes at 70 % | Box | Egress / month |
| --- | --- | --- | --- | --- |
| **Private internet test**: ≤ 20 humans, 2 rooms (10 humans + 22 bots each) | 2 × 20.4 % = 41 % | 1 process | 2 dedicated vCPU (one for the process, one for nginx, OS, watcher) | ~45 GB at 2 h/day |
| **Soft launch**: 50 average concurrent, ~4 humans per room (bot-heavy) | ~12 × 23.1 % = 277 % | 4 processes | ≥ 6 vCPU, or two 4 vCPU boxes; needs multi-process wiring | ~1.3 TB |
| Same 50 players if rooms were full | 1.6 × 10.6 % = 17 % | 1 process | 2 vCPU | ~1.3 TB |
| **100 average concurrent**, bot-heavy (4 per room) | 25 × 23.1 % = 578 % | 9 processes | ~10 vCPU | ~2.7 TB |
| 100 average concurrent, full rooms | 3.1 × 10.6 % = 33 % | 1 process | 2 vCPU | ~2.7 TB |
| 1,000 average concurrent, full rooms | 31 × 10.6 % = 330 % | 5 processes | ~6 vCPU | ~27 TB |

Reading: until public matchmaking reliably fills rooms, capacity is bought for bots, and the first public release (soft launch)
already needs the multi-process work. A private test does not.

## Limits that are not CPU

- Memory ~65 MB per active room plus ~110 MB base: 1 GB comfortably holds ~10 rooms.
- Event loop: with more than ~3 bot-heavy rooms per process, p99 loop delay goes from 5 ms to 44–150 ms and ticks drop:
  everyone in every room feels it. A noisy room hurts all rooms on its process (hence the per-process cap in the watcher,
  `--max-rooms-per-process`).
- Dedicated vs shared vCPU: a shared vCPU can be throttled by neighbours; a 60 Hz loop shows that as dropped ticks.
  NOT TESTED on any real provider: rehearse on the actual VM before trusting it (`probe.mjs --only botstorm --storm 3`
  should show ~70 % and 0 dropped ticks; anything worse means the box is slower than this sandbox).
- Not tested here: Windows / macOS host CPUs, ARM, a 256-client run (ARCH ran 8 rooms × 32 humans: ~40 % of a core, all consistent).

## Reconnection under load

ARCH: with 32 clients on the mobile profile, 4 simultaneous drops reconnected in 0.45–0.67 s with a keyframe applied in about
0.6–0.8 s. MEASURED (through TLS + nginx, 3 humans): reconnect at 26 s succeeds and keeps the seat; at 33 s is refused.
Note the seat is on autopilot while away, and events during the gap (3–4 s of effects) are not replayed.
