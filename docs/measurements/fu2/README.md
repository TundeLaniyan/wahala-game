# FU2 measurements (public offline UX, release checkpoint 1)

Branch `claude/wahala-fu2-ux`, from production `f7cf2ae`. Decisions FU2-1 to FU2-9 in `docs/DECISIONS.md`. Everything here was run in
this container: Chromium 1243 (`/opt/pw-browsers/chromium`), **software WebGL (SwiftShader)**, a shared 4-core machine whose load
average was 9-12 while these ran (other workers). Absolute times are therefore NOT a phone's; the comparisons are interleaved A/B
inside one process so drift hits both sides alike. No physical Android device was available (docs/MOBILE_PERFORMANCE.md section 9 still stands).

## A4. First playable frame, and the early arena prefetch (FU2-7)

Harness: `scripts/arena-load-measure.mjs`. It loads the menu unthrottled (the menu is not what is measured), THEN applies CDP network
throttling and 4x CPU slowdown, walks the real menu to a Start, waits `--dwell` ms on the arena / review screens (what a player spends
choosing), taps Start and times tap -> "HUD up and loading screen gone" (the loader removes its screen after two drawn frames of the new
match). Fresh browser context (cold cache) per run, builds served by `scripts/perf/pages-server.mjs` (GitHub Pages' `max-age=600`, gzip
only). Profiles: Chrome DevTools "Fast 3G" (1.6 Mbit/s x 0.9, 562.5 ms) and a 4G of 9 Mbit/s, 170 ms (WebPageTest's). "before" is production
`f7cf2ae` (the Ready screen already prefetched); "after" is this branch. Medians, with [min-max]; runs interleaved, order alternating.

| Journey (arena: Oshodi unless noted) | n | Waiting for models after the tap | Build + first frames | **Tap -> first playable frame** | Model MB fetched before / after the tap |
| --- | --- | --- | --- | --- | --- |
| City Rumble, 4G, 6 s dwell, before | 5 | 4.7 s [4.1-6.3] | 41.9 s [28.8-47.0] | 46.4 s [33.5-53.6] | 3.9 / 4.0 |
| City Rumble, 4G, 6 s dwell, **after** | 5 | **0.2 s [0.0-1.0]** | 34.7 s [29.5-42.8] | 35.9 s [29.5-43.2] | 7.9 / 0.0 |
| City Rumble, 4G, tapped straight through, before | 4 | 7.9 s [7.8-9.4] | 34.3 s [26.7-47.3] | 42.5 s [34.8-57.1] | 1.1 / 6.8 |
| City Rumble, 4G, tapped straight through, **after** | 4 | **4.8 s [4.4-7.5]** | 36.2 s [32.6-41.3] | 42.0 s [37.3-47.7] | 4.1 / 3.8 |
| City Rumble, Fast 3G, 6 s dwell, before | 4 | 36.3 s [36.3-36.9] | 38.4 s [30.4-45.5] | 75.3 s [66.9-82.0] | 1.1 / 6.8 |
| City Rumble, Fast 3G, 6 s dwell, **after** | 4 | **32.9 s [32.2-34.1]** | 38.7 s [29.1-49.0] | 72.0 s [62.5-81.9] | 1.2 / 6.7 |
| Story Campaign (Oshodi Terminal Approach), 4G, 3 s dwell on the brief, before | 3 | 13.2 s [13.1-16.9] | 26.2 s [24.0-26.5] | 39.8 s [37.5-43.7] | 1.1 / 13.0 |
| Story Campaign, same, **after** | 3 | 13.7 s [13.4-13.9] | 24.4 s [23.2-24.6] | 38.5 s [37.3-38.6] | 1.1 / 13.0 |
| Quick Start (Ojuelegba), 4G, 4 s dwell on Choose How to Play, shipped behaviour | 5 | 8.0 s [7.7-8.3] | 30.2 s [28.3-34.9] | 38.4 s [36.2-43.1] | 1.1 / 6.8 |
| Quick Start, same, with `?prefetchplay` (NOT shipped, FU2-7) | 5 | 4.3 s [3.8-4.9] | 29.2 s [28.7-30.5] | 34.5 s [32.9-35.4] | 5.1 / 2.8 |

Reading it honestly:

- **What the prefetch changes is the wait for models after the tap, and nothing else**: it only moves bytes earlier (nothing is decoded early), so the
  arena build, shader compilation and first frames cost what they did. On 4G with a normal dwell the wait is gone (5 of 5 pairs, 4.7 s -> 0.2 s);
  tapped straight through it roughly halves (7.9 -> 4.8 s); on Fast 3G it removes only the 3-4 s the link could move during the dwell
  (about 1.1 MB of 7 MB at 190 KB/s), so on a slow link the wait is still 33 s and the real fix is fewer bytes, not earlier bytes.
- The tap -> first-frame medians differ by more than the model wait (46 s vs 36 s on 4G) but the ranges overlap: "build + first frames" is the
  synchronous arena build under software WebGL and swings by +/- 8 s here. Only the model-wait difference is claimed. A phone's GPU builds the arena
  much faster, which makes the model wait a larger share of the total there.
- **No regression**: the dwell-0 row (a player who taps straight through) is equal or better; the campaign row is unchanged (the campaign loads every
  model, 13 MB, at the tap in both builds: that is the real first-entry cost of the campaign, about 13 s on 4G and about 70 s on Fast 3G. Recording
  per-district model sets, as was done for the arenas, is the follow-up; it is not part of this checkpoint).
- Data Saver / Save-Data: no prefetch (`tests/app/arenaPrefetch.test.ts`, `e2e/model-loading.spec.ts`); music Data Saver files, the on-demand model loader, the service worker's
  caching (the warmed arena is in the worker's cache and Start fetches none of it again: `e2e/offline-cache.spec.ts`) and the campaign loading all pass their specs.
- Honest progress: the loading screen still shows the real model count ("Loading fighters and vehicles n / m") and nothing invented; a warmed arena simply starts at a higher n.

Raw data: `rumble-4g-dwell6s.json`, `rumble-4g-dwell0.json`, `rumble-fast3g-dwell6s.json`, `campaign-4g.json`, `quick-4g-dwell4s.json` (every run's phases, bytes and timings).
Reproduce: `node scripts/perf/pages-server.mjs dist-before --port 4180 & node scripts/perf/pages-server.mjs dist --port 4181 &` then
`node scripts/arena-load-measure.mjs --targets before=http://localhost:4180/wahala-game/,after=http://localhost:4181/wahala-game/ --journey rumble --net 4g --cpu 4 --runs 5 --dwell 6000`.

## A1. Choosing the Quick Start stage (FU2-2)

`quickstart-arena-sim.txt`: `scripts/simulate.ts --arena <id> --game deathmatch --minutes 3 --players 16 --difficulty rookie --matches 4 --seed 11` for the seven Rumble stages.

## A5. Reported lag with Music Data Saver in a 32-fighter match (FU2-8): not reproduced

Harness: `scripts/data-saver-lag-compare.mjs`. Same build, seed 7 and saved configuration in every run (32-fighter City Rumble Free-for-All on Oshodi, Rookie bots, graphics FIXED at
`low` so Auto cannot react differently), three conditions in a fresh browser each, interleaved with the order rotating by round: **ON** (Data Saver On: the `lite/` stream), **OFF** (the
full stream) and **Muted**. Per run: 8 s warm-up, then 45 s of frame intervals (requestAnimationFrame), long tasks, CDP main-thread time, the game's own `timings()` and media
`waiting` / `stalled` events. Pass 1: 6 rounds (`data-saver-lag.json`); pass 2: 4 rounds with a CPU profile (`data-saver-lag-profile.json`, `--profile`). Median [min-max] over runs:

| Pass, condition | Frame p50 (ms) | Frame p95 (ms) | Frames / run | Long tasks / run | Sim ms / bots ms per frame | Main-thread script s / 45 s | Load s | Media stalls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 ON | 1883 [1667-3200] | 3966 [3650-6600] | 25 [16-27] | 14 [13-17] | 14.3 / 2.9 | 7.8 [2.2-12.8] | 24 [22-35] | 0 |
| 1 OFF | 2100 [2000-3017] | 4725 [4266-6283] | 22 [16-24] | 10 [9-14] | 12.7 / 2.8 | 3.0 [2.1-4.6] | 23 [21-36] | 0 |
| 1 Muted | 2200 [1917-3017] | 4958 [4000-6916] | 22 [16-25] | 12 [10-16] | 15.8 / 3.6 | 3.8 [2.4-11.3] | 23 [22-32] | 0 |
| 2 ON | 2008 [1150-2383] | 4008 [2633-4766] | 24 [19-36] | 14 [11-17] | 13.3 / 2.0 | 3.6 [2.4-5.6] | 24 [19-28] | 0 |
| 2 OFF | 2292 [2050-2416] | 4883 [4783-4933] | 20 [18-20] | 12 [8-14] | 13.0 / 0.7 | 2.7 [2.3-4.9] | 26 [24-26] | 0 |
| 2 Muted | 1483 [1050-2200] | 3275 [2533-4450] | 28 [21-40] | 16 [15-16] | 14.6 / 2.5 | 9.2 [5.7-9.8] | 23 [18-31] | 0 |

- **No consistent difference between the conditions**: the order of the three flips between passes and every range overlaps. Frames take about 2 s here because the renderer is software WebGL
  (the game's own `render` ms is 3.3-8 s of the frame; sim + bots are 13-18 ms), so music cannot show up in frame time in this container; what could show up (main-thread contention,
  stalls, loading) does not differ either.
- The main-thread script time that does vary is the **synchronous shader compile** (`getProgramInfoLog`, `getShaderInfoLog`: 0 to 6.3 s per window in the profile, `profileTop`),
  hit when a new effect first appears: it was highest in ON in pass 1 and in Muted in pass 2, i.e. it follows the match's progress, not the setting. (An existing source of first-use hitches
  on weak devices; not touched here.)
- ON fetched `lite/pixabay_601035.mp3`, OFF and Muted the full `pixabay_601035.mp3` (`musicRequests` in the JSON). Muted still streams the music (silently): observed, not changed.
- Limits: ~25 frames per run, a shared machine (load average 9-12), no physical phone. This cannot prove a phone has no such cost; it shows no cost here and no code path that could cause one.

## Public build: no online request (FU2-9)

`e2e/six-screen-ui.spec.ts` "the public build is offline": Home -> Play -> Quick Start -> first playable frame on the default `vite build`: no Online entry on Home, no `WebSocket` /
`EventSource` / `RTCPeerConnection` / `WebTransport` constructed or `sendBeacon` called in the page, no Playwright `websocket` event, and no request (page or worker) to any origin other than the
page's own. Passed.
