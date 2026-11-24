# Server soak: soak-30min

Run 2026-11-24T17:34:17.856Z on Node v22.23.4; 3 room slots (one long match of 1 human + 31 bots plus short cycles), 1824.1 s of wall clock, `--duration 1800 --rooms 3 --label soak-30min --out ../docs/measurements/rumble-online/soak-30min.json`.

**Verdict: STABLE** (post-GC heap over the steady window, 116 samples over 1744 s): slope 0.027 +/- 0.024 MB/min (t = 1.15, r2 = 0.501), projects 1.6 MB/h; first third 40.54 MB, last third 38.39 MB; empty server 28.33 MB, after teardown 34.42 MB.

| Series over the steady window | first | last | slope / min | t | verdict |
| --- | --- | --- | --- | --- | --- |
| rssMB | 383.83 | 412.73 | 0.8774 | 8.49 | **growing** |
| externalMB | 71.43 | 21.76 | -0.8353 | -7.45 | flat |
| timers | 12 | 5 | -0.1556 | -12.44 | flat |
| sockets | 7 | 3 | -0.055 | -1.83 | flat |
| processListeners | 13 | 13 | 0 | 0 | flat |
| roomTypeListeners | 2 | 2 | 0 | 0 | flat |
| liveRoomsAtSamples | 3 | 1 | -0.0515 | -12.7 | flat |

- Event loop delay p99: median of samples 19.66 ms, worst 118.71 ms, single worst delay 343.37 ms.
- CPU of the server process: mean 48.3 %, max 88.2 % of one core.
- Simulation ticks over the whole run: 199531 run, 895 dropped (0.447 %).
- Rooms: 233 created, 233 disposed, 233 finalized by GC, 0 live at the end, **0 retained after a full GC**.
- Cycles: {"cyclesStarted":233,"cyclesFinished":233,"roomsCreated":233,"forcedEnds":78,"rematches":22,"drops":230,"reconnects":174,"goneForGood":56,"abandoned":152,"clientErrors":0,"cycleFailures":0}.
- Machine load average (1 min) while it ran: mean 6.27, max 9.73 on 4 CPUs. **The machine was loaded by other work: CPU, event-loop and dropped-tick figures are pessimistic.**
- Active handles: baseline {"PipeWrap":3,"TCPServerWrap":1,"Timeout":2} -> end {"PipeWrap":3,"TCPServerWrap":1,"Timeout":2}.

Memory figures are not affected by CPU contention; the dropped-tick, event-loop and CPU figures are.

## Reading (written by hand after the run; the numbers above are generated)

- **Command and time.** `cd server && npx tsx bench/soak.ts --duration 1800 --rooms 3 --label soak-30min --out ../docs/measurements/rumble-online/soak-30min.json` (the same as `npm run soak -- --duration 1800 --rooms 3 ...`), started 2026-11-24 17:34 UTC, 30.4 minutes of wall clock.
- **The machine was NOT quiet.** Other workers ran browsers and test suites on the same 4 vCPUs the whole time: sampled 1-minute load average 8.7 at the start, mean 6.3, max 9.7. The server and its clients also shared those CPUs. So the CPU (mean 48 %, max 88 % of one core), event-loop (p99 median 20 ms, worst 119 ms, one 343 ms delay) and dropped-tick (895 of 200 426, 0.45 %) figures are pessimistic and noisy. They are not a capacity measurement; the memory and retention figures are not affected by CPU contention.
- **Stable:** the heap that survives a full GC is flat (slope 0.027 +/- 0.024 MB/min, not significant; 40.5 MB in the first third, 38.4 MB in the last; 28.3 MB empty, 34.4 MB after teardown). All 233 rooms created were disposed and finalised by the GC, **0 retained**; timers, sockets, process listeners and room-type listeners did not grow (handles after the run equal the baseline: 2 timers, 3 pipes, 1 server socket); 0 client errors and 0 failed cycles over 230 drops (174 reconnected in time, 56 never returned and were taken by a bot), 78 forced match ends and 22 rematches.
- **Growing, honestly:** the **resident set size** creeps up while the heap does not: first third 402 MB, middle 416 MB, last third 423 MB (+14 MB, then +7 MB: slowing), a fitted slope of 0.88 MB/min over the steady window and 0.34 MB/min after the first 5 minutes (about 20 MB/hour). Nothing the harness can see explains it: the post-GC heap, external memory (it fell from 71 to 22 MB), retained rooms, timers, sockets and listeners are all flat. The most likely cause is allocator and V8 reservation behaviour (fragmentation after hundreds of 32-fighter rooms were built and torn down), not a retained object, but that is **not proven**: 30 minutes cannot tell a plateau from a slow leak at 20 MB/hour. To decide it: a 2-hour run of the same command and a `--heap-snapshots` comparison; meanwhile a host process should have a memory limit and a scheduled restart.
