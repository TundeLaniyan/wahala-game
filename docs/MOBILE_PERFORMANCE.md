# Mobile data, loading speed and low-end Android

Branch `claude/wahala-mobile-optimization`, from the production commit `00eff0a` (when this work started, the live site's
`build.json` and the `gh-pages` head `d0625b5` both named it). **Production has since moved to `66f3e3d`** (deployed
2026-11-23 19:32 UTC: Sudden Death timer, player marker, Team Rumble blast warnings). That release changes no model, audio,
image, font or package file (code and docs screenshots only), so every asset-transfer number below holds for it; a trial merge
of this branch with `66f3e3d` is conflict-free (`src/app/session.ts` is the one file both touch), and the merged tree
type-checks, lints, builds and passes 626 related unit tests. The branch is deliberately left on `00eff0a` for the release owner to merge. Presentation / delivery only: no file under `src/sim`, `src/ai`, `src/input`,
City Rumble combat or the gameplay release's files was changed, and nothing here is deployed or merged.

## 0. How to read the numbers

- **Network bytes** are real: Chromium driven through the real menu journey, `Network.loadingFinished.encodedDataLength`
  (compressed body + headers actually on the wire), against the **live** GitHub Pages site for the baseline, and against a
  local server that reproduces GitHub Pages' delivery (`scripts/perf/pages-server.mjs`: `max-age=600`, gzip only, same
  types compressed) for builds that are not deployed. The emulator matches the live site to **0.07 %** on the cold load
  (15.02 MB live vs 15.01 MB emulated) and to 0.3-0.7 % per file.
- **Emulated phone, not a phone.** Profile: 844x390 @2x touch, Chromium 153, **software** WebGL (SwiftShader) on a 4-core
  container. Frame times from it are 0.2-2.4 fps and only meaningful as ratios; draw calls, triangles, texture counts,
  JS heap and process memory are device independent or relative. **No physical Android device was available**: see
  section 9 for what still has to be measured on one.
- The music track of a match is a clock-seeded random pick, so music is reported per file (full vs Data Saver) and as the
  14-track average (4.23 MB full, 1.85 MB lite), not as a single run.

## 1. Result

| Measure (emulated phone, real wire bytes) | Production `00eff0a` | Optimised | Change |
| --- | --- | --- | --- |
| Cold main menu, empty cache | **15.02 MB** (live) | **2.48 MB** | **-12.5 MB, -83.5 %** |
| Repeat visit within 10 min | 0.00 MB | 0.00 MB | same |
| Repeat visit after 10 min (HTTP cache only) | 64 conditional requests, 10.8 KB | **1 request** (worker) | -63 requests |
| Open the game with the network off | fails | **menu opens** (worker) | new |
| Play > City Rumble > all 7 district cards | +0.43 MB | +0.43 MB | same |
| Start a 32-fighter City Rumble (models + voices), excl. music | +0.64 MB (models already paid at boot) | +7.8 MB (that arena's models, loaded now) | see first-session line |
| **First session, menu + one 32-fighter match, excl. music** | **16.09 MB** | **10.70 MB** | **-5.4 MB, -33.5 %** |
| + one average music track (4.23 MB) | 20.3 MB | 14.9 MB | -26.5 % |
| + Data Saver music (1.85 MB average) | - | 12.5 MB | **-38.4 % vs production** |
| Menu-only visitor | 15.02 MB | 2.48 MB | -83.5 % |
| Process memory at the menu (Chromium tree RSS) | 1,277 MB | 943 MB | **-334 MB (-26 %)** |
| Process memory in a 16-fighter Rumble | 2,203 MB | 2,055 MB | -148 MB (-7 %) |
| JS heap in a 16-fighter Rumble | 235 MB | 171 MB | -27 % |
| Decoded textures held (RGBA8 + mips, estimate) | ~426 MB at boot | ~23 MB at the menu, 200-325 MB in an arena | see 4.1 |
| Draw calls / triangles / textures per frame at a given preset | unchanged | unchanged | rendering code untouched |
| Rendered frames vs production (5 scenes) | - | mean abs diff 0.02-0.4 / 255, board identical | see 6 |

What the 15.02 MB cold load was made of (live capture): 45 glTF models 13.59 MB (91 %), JavaScript 0.88 MB, menu art 0.44 MB,
fonts 0.08 MB, CSS 0.04 MB. The largest single files: `crowd.glb` 1.19 MB, `veh_danfo/taxi/keke/okada.glb` 0.77 / 0.71 / 0.71 /
0.65 MB, the four `env_building_*.glb` 0.49-0.54 MB each, the three hero characters 0.41-0.47 MB each, `Frame-*.js` 0.44 MB.
Per match, the one music stream is 1.6-7.7 MB (live: 5.58 MB) and is the single largest object of a session.

## 2. Baseline findings (stage 1)

1. **Initial download, cache disabled**: 15.02 MB, 241 requests (69 reached the wire; the rest are `blob:` textures decoded
   from the models). Every model was fetched at boot, for every arena, before the menu was used.
2. **Repeat visit**: within GitHub's 10-minute window 0 bytes. After it, every one of the ~64 hashed files is revalidated
   (a 304 each, ~11 KB, but 64 round trips on a mobile radio). Bodies are not re-downloaded while the HTTP cache keeps them;
   a phone's cache may evict the big models at any time, which this environment cannot show.
3. **Menu vs districts**: entering City Rumble and browsing all seven district cards costs +0.43 MB of preview art; no
   district-specific model is fetched because everything was already loaded at boot.
4. **32-fighter start**: +0.64 MB (25 voice clips 0.50 MB, hero art 0.12 MB), then the music stream (5.58 MB live).
5. **Transfers during play**: nothing besides the music stream (`el.loop`, one request, 206). See section 5.3 for the 15-minute run.
6. **By type**: JS 0.88 MB (5 chunks; `Frame` 1.27 MB raw / 0.44 MB gzip is the renderer), CSS 0.04, models 13.59, menu art
   0.44, fonts 0.08, voices 0.50 per match, music 1.6-7.7 per match.
7. **Delivery** (live headers): `cache-control: max-age=600` on **everything**, no `immutable`; gzip for html/js/css/json/
   webmanifest/**glb** (a 1.06 MB character -> 0.39 MB); none for mp3/woff2/webp/jpg (already compressed); **no Brotli**;
   weak ETags (compressed) / strong (not); hashed asset names (content hashes, stable); `accept-ranges: bytes` (206 works for
   the music element). **There was no service worker.**
8. **Frames, memory, simulation** (section 5.1, 5.2): below.
9. **Graphics presets and loading**: the ladder (`render/quality.ts`, 8 rungs) changes pixel ratio, shadows, particles, crowd
   share, lights, street life and animation stride. It does **not** change which files load: every preset downloaded the same
   13.6 MB, so Very Low saved GPU/CPU but no data. There is no texture-size knob.
10. **Deployments**: `gh-pages` history shows each release changes only the JS chunks (~2.4 MB raw, ~0.8 MB gzip: `index`,
    `Frame`, `RaidViews`, `OnlineScreen`, `testlab`, CSS); models and audio keep their names, so returning players do not
    re-download them. One release in the history added 24 MB of new assets, the only large repeat cost. Content hashing works
    as intended; the weakness is the fixed 10-minute `max-age` (point 2).

## 3. What changed (stage 2), each with its measured effect

| Change | Files | Measured effect | Risk and guard |
| --- | --- | --- | --- |
| **On-demand 3D models**: boot loads only the 4 hero models; a match loads its arena's set; the Ready screen prefetches it; unknown arenas (campaign, raids) load everything as before | `src/render/assets/modelNeeds*.ts`, `library.ts`, `app/session.ts` | cold menu 15.02 -> 2.48 MB; 28-40 models per arena instead of 51; menu memory -334 MB | The arena sets were **recorded in a real browser** for all 16 arenas; lazy and fully-preloaded builds give the same geometry/texture counts and **zero missed models** in every arena; a missed model starts loading (safety net) instead of failing. `?preloadall` restores the old boot |
| **Lossless model compression at build**: meshopt vertex/index codecs, no quantisation | `scripts/vite/glbOptimize.ts`, `optimizeModels.ts`, three's `MeshoptDecoder` | model set on the wire 19.97 -> 16.05 MB (-19.6 %): characters -33 %, crowd -55 %, others 1-11 % | Verified per file: vertices **bit-identical** (error 0), animations <= 4.9e-4, same nodes/materials/skins; anything else keeps the original. Source `.glb` never edited |
| **Textures shared by several models served once**: the four vehicles embed the same 395 KB + 55 KB + 22 KB (+ two more) JPEGs | same | the four vehicles 2.63 MB -> 1.03 MB + 0.53 MB shared, i.e. **-1.1 MB per match** | Byte-identical image files, content-hashed names; 0 pixel difference |
| **Offline cache worker** | `src/platform/sw/sw.template.js`, `scripts/vite/offlineCache.ts`, `platform/serviceWorker.ts` | revisit after 10 min: 64 -> 1 request; offline launch works; survives HTTP-cache eviction | Cache-first only for content-hashed files (cannot go stale); app shell network-first; no precache; skipped under automation unless `?sw`; `?nosw` removes it |
| **Data Saver** (Settings > Audio: Auto / On / Off) | `app/settings.ts`, `audio/music.ts`, `public/audio/music/lite/*` | music 4.23 -> 1.85 MB average per track (-56 %; per track -37 % to -62 %) | Same codec (MP3) at 96 kbps; any lite file that fails plays the full file; defaults to Auto (only with the browser's own Data Saver on) |
| Loader waits up to 90 s (was 20 s) for the match's models | `app/matchLoader.ts` | a slow connection no longer starts a match with drawn fallbacks | the loading screen still shows real progress; a failed model still has its fallback |

### What was tried and rejected

- **Quantised meshopt** (14-bit positions): -46 % on characters instead of -33 %, but game code (`AssetLibrary.parts()`) bakes node matrices into raw
  vertex arrays, so quantised models drew with a different board layout (41 % of pixels changed). The A/B render caught it; my first
  verifier checked glTF space only. The shipped optimiser is lossless and the verifier is strict.
- **Re-encoding the JPEG textures**: only -11 % at q85 (-18 % at q80) across the 190 textures: not worth a visible-quality change.
- **WebP / KTX2 textures**: needs a second texture path and the fallback for unsupported devices for roughly -1.4 MB per match: left as a follow-up.

## 4. Per-arena delivery and memory

| Arena | Models loaded (of 51, incl. 4 heroes) | Arena models on the wire (MB, gzip, shared textures once) |
| --- | --- | --- |
| Third Mainland / Surulere Power Yard / Yaba After Dark | 28 | 4.6-4.7 |
| Lagoon Jetty, Lekki Roadworks | 29 | 4.7-4.9 |
| Ajegunle, Oshodi Interchange, Rumble Lekki | 30-31 | 5.1-5.3 |
| Balogun Market | 34 | 6.9 |
| City Rumble stages (Ebute Metta, Fadeyi, Lagos Island, Mushin, Ojuelegba, Oshodi) | 34-36 | 7.0-7.3 |
| Danfo Bus Park | 40 | 7.9 |

The four hero models (1.05 MB) are loaded at boot in addition. The old boot sent 13.6 MB (everything) whatever the arena.

### 4.1 Memory on low-end phones

The old boot kept every decoded texture alive: ~426 MB (RGBA8 + mips estimate) of which a given arena used 200-325 MB. A 2-3 GB
Android tab can be killed above that. Now only the arena's textures are loaded; measured process memory dropped 334 MB at
the menu and 148-155 MB in a Rumble match. Simulation cost per tick (`scripts/simulate.ts`, this machine, Rookie bots):
16 fighters avg 0.55 ms, p99 3.5 ms, worst 57 ms; **32 fighters avg 0.94 ms, p99 4.9 ms, worst 84 ms**. A phone 4-6x slower
has a 20-30 ms worst-case tick spike at 32 fighters. That is unchanged by this work and is the remaining low-end risk; reducing
bot think rate would change gameplay (docs/PERFORMANCE.md, "Where the frame goes") so it needs a founder decision.

## 5. Frames, memory and offline play

### 5.1 Frame time and render workload (software GL: ratios only)

| Preset / fighters | Draw calls | Triangles | Frame p50 / p95 (software) |
| --- | --- | --- | --- |
| Very Low, 16 | 246-266 | 1.2-1.6 M | 333-467 / 700-967 ms |
| Very Low, 32 | 290-436 | 1.4-1.7 M | 400-1033 / 1283-2317 ms |
| Medium, 16 | 986 | 5.3 M | 4.9-6.2 / 5.1-6.6 s |
| Medium, 32 | 1,401 | 6.2 M | 5.1-5.4 / 5.3-5.5 s |

Baseline and optimised builds agree on every device-independent workload number (Medium: 986 / 986 calls, 5,283 / 5,282 k
triangles; 32 fighters 1,401 / 1,401 and 6,213 / 6,213 k). The Very Low rows differ by timing noise of the camera and crowd
(the 4x CPU-throttle rows give 20 ms of JS per frame for sim + AI at 16 fighters and 33 ms at 32, in this environment's units).
Rendering code was not changed, so no frame-time improvement is claimed; section 9 lists what a phone must confirm.

### 5.2 Memory

See section 1 and 4.1 (`scripts/perf/memory-probe.mjs`).

### 5.3 Fifteen minutes of play

`scripts/perf/net-measure.mjs --size 8 --idle 900`, 8-fighter City Rumble, 15 minutes after the match is up:

| Build | Transferred in the 15 minutes | Requests |
| --- | --- | --- |
| Production `00eff0a` (online, emulated GitHub Pages) | **4.50 MB, all of it the one music stream** (a single request); nothing else | 2 |
| Optimised, worker active, **network cut after 60 s** | 4.57 MB in the first 60 s (the music stream, one request); **0 bytes for the remaining 14 minutes** | 1 (answered from cache) |

The match played to its end with the network off (24,402 ticks, about 6.8 minutes of play) and the results screen stayed up with no
request. Music loops from a single download (`el.loop`), so play never needs the network again: the 15 minutes cost one track, and only
a new match picks (and downloads) another. A **rematch or a second match is a new 1.6-7.7 MB track** (1.0-2.9 MB with Data Saver).
Caveat: the worker's own fetches are not visible to the page's network log, so the optimised "first session" bytes in section 1 come from
runs without the worker (browsers under automation skip it), which is also what a first visit costs before it takes control.

## 6. Visual verification

`scripts/perf/visual-capture.mjs` takes the same scene (same seed, 180 ticks, frozen, 960x540, High) on two builds and
`visual-diff.py` compares them. The noise floor (production vs production) is 0.000-0.007 / 255, except a moving vehicle (0.36).

- With every other change on and **only the model optimiser off**, the board is **pixel-identical to production (0.000 / 255)**:
  lazy loading, the worker and Data Saver change no pixel.
- The quantised optimiser (rejected) gave 18 / 255 and 41 % of pixels different.
- The shipped lossless optimiser: Classic 0.37, Rumble 0.02, Taxi 0.02, Danfo 0.03, Keke 0.41 (/255, 0.003-0.73 % of pixels > 24).
  The residual is the animated background crowd (rotation filter, <= 0.06 deg). Side-by-sides (production | optimised | difference x4)
  are in `docs/mobile-optimization/ab-*.jpg`.

Visuals did not change, so there are no "after" screenshots beyond these identity checks.

## 7. Tests

- Unit: `tests/render/model-needs.test.ts` (manifest invariants, loader dedupe/progress/failure/safety net),
  `tests/build/glb-optimize.test.ts` (lossless, fail-safe, shared textures), `tests/audio/music-lite.test.ts`,
  `tests/audio/assets.test.ts` (lite files belong to approved tracks and are smaller).
- Browser: `e2e/model-loading.spec.ts`, `e2e/offline-cache.spec.ts`, `e2e/data-saver.spec.ts`.
- Real-browser recordings kept in `tools/perf/model-access.eager.json`.

Results (this container, software WebGL; the repo's multi-process launch `WAHALA_MULTIPROCESS=1`):

| Suite | Result |
| --- | --- |
| `tsc --noEmit`, `eslint .` | clean |
| Vitest, whole repository | **321 files, 4,965 tests passed**, 7 skipped (as before) |
| New browser specs (model loading, offline cache, Data Saver; desktop + phone projects) | **all pass** (8 + 6; the 4 skips are by design) |
| Existing browser specs most affected (match loading, quality, audio, menu, tutorial, voices, six-screen UI, mobile touch): 138 tests | **98 passed, 37 skipped (project-specific), 3 failed** |
| The 3 failures | all in `voices.spec.ts` (urgent voice line interrupting a lesser one; subtitle text vs last spoken clip). **The same tests fail on a pristine build of `00eff0a`** (3 of 4 variants fail there, run in isolation with the same command), so they are pre-existing and timing-dependent here, not caused by this branch |
| Not run here | the remaining ~45 existing browser specs (campaign, raids, arenas, 32-fighter Rumble ...): CI's parallel shards run them; they exercise the paths below through `?debug` and are the first thing to watch on the integration run |

The single-process Chromium launch the repo uses by default for this container crashed on the new specs that open a second browser
context; the multi-process launch (documented in `playwright.config.ts`) is stable.

## 8. Data Saver evaluation (stage 3)

Question: does a Data Saver / Battery Saver setting give something the graphics presets do not?

- **Battery / GPU / CPU: no.** The eight-rung ladder and Auto already cover pixels, shadows, particles, crowd and animation rate,
  and they are the right tool for it. A second battery switch would duplicate Graphics quality, so none was added.
- **Network: yes, one thing.** Presets never changed a byte on the wire (point 9). The only large optional object is the match
  music, so Data Saver plays 96 kbps copies: **-56 % on average, 2.4 MB per match**, and it is the only control added. It sits
  in Settings > Audio where its effect is, defaults to Auto (follows `navigator.connection.saveData`), and says plainly what it does.
- **Evaluated, not shipped**: halving 1024-px model textures would save ~2.7-2.9 MB per arena (and 75 % of those textures'
  GPU memory) but softens facades; it needs the founder's visual approval. Skipping voice clips (0.5 MB) or menu art (0.4 MB) is not
  worth a control. A cheaper default would be re-encoding the music to 160 kbps for everyone (the founder already did that for five
  tracks), -37 % on those 256 kbps tracks; that is a sound-quality decision, so it is a recommendation, not a change.
- **Promises not made**: the setting says "about 60 % fewer bytes per match" for music only; it does not claim a total.

## 9. Trade-offs, risks and what is not verified

- **Match start downloads more than before** (the arena's ~7-8 MB now arrives at Start instead of at boot). Prefetch on the Ready
  screen hides it on normal connections; on 3G the loading screen shows real progress for up to 90 s. Total bytes are lower.
- **First visit after release re-downloads models once** (their file names change with the optimised content). Content hashes
  keep them stable afterwards.
- **Compressed models need WebAssembly** (every Android Chrome >= 57 and Samsung Internet >= 7). Without it a model fails to
  load and the existing procedural fallbacks draw, as for any failed model; there is no uncompressed second copy.
- **Rotation filter**: animation rotations are 16-bit (<= 4.9e-4 error); not visible in the A/B but not pixel-exact for animated crowd.
- **Deployment is bigger** by 8.5 MB (112 MB vs 104 MB: 25.8 MB of Data Saver music minus 17 MB of model savings); nobody downloads it.
- **Worker**: new moving part. It never precaches and caches only hashed files; `?nosw` is the escape hatch.
- **Not verified, needs a physical Android phone** (Chrome on a Mali / Adreno mid-range, 2-3 GB RAM, a real 3G/4G link):
  real frame times and p95 per preset at 16 and 32 fighters; whether Auto picks the right rung; peak tab memory in a 32-fighter
  Rumble (low-memory kill); the 90-second wait on a throttled link; service-worker install under Data Saver / low storage;
  sound quality of the 96 kbps files on a phone speaker and on headphones; `?fps` readings (`sim`, `ai`, `render` ms) of the 32-fighter tick spikes.

## 10. Hosting: GitHub Pages limits and a possible migration

Facts measured on the live site: `max-age=600` fixed, no custom headers, gzip only, `Accept-Ranges` works, weak ETags.
GitHub's published Pages limits (from their documentation; re-check before relying): published site <= 1 GB, **soft 100 GB per month
of bandwidth**, soft 10 builds per hour, 10-minute deploy timeout, not for commercial transactions.

| | Before | After | After + Data Saver |
| --- | --- | --- | --- |
| First session with a 32-fighter match (avg music) | 20.3 MB | 14.9 MB | 12.5 MB |
| First sessions per 100 GB | ~4,900 | ~6,700 | ~8,000 |
| Menu-only visits per 100 GB | ~6,700 | ~40,000 | ~40,000 |
| Returning player after 10 min, same release | 64 requests, 11 KB | 1 request, <1 KB | same |

Brotli would only save 0.17 MB on the JS (0.92 -> 0.75 MB gzip -> brotli) and 3.8 % on models, so compression is **not** a reason to move.
The reasons would be: (1) **bandwidth**: a launch that sends ~7,000 new players a month already reaches the soft cap, and a campaign can
do that in a weekend; (2) **cache headers** (`immutable` on hashed files and the music, which also removes the worker's
reason to exist); (3) per-path control for the 86 MB of audio. Suggested path when monthly transfer passes about 60 % of the cap: put `audio/`
and the hashed `assets/` behind a CDN host with unlimited bandwidth (Cloudflare Pages / R2, Netlify, Vercel), keep `index.html` where it is,
and set `Cache-Control: public, max-age=31536000, immutable` on hashed files (`pages-server.mjs --mode custom` emulates it).
The repo is public (Pages Free requires it) so the source, Game Bible and `reference/` video are public too.

## 11. Integration notes for the release owner

- Merge after the gameplay release: no gameplay file is touched, but `src/app/session.ts`, `app/settings.ts`, `audio/*`, `ui/menu/SettingsScreen.tsx` and
  `render/assets/library.ts` are shared files; expect small textual conflicts only. `package.json` gains four **dev** dependencies
  (`@gltf-transform/*`, `meshoptimizer`; WebAssembly, no native build).
- **Re-recording the model sets** is required if a model is added or an arena starts using different models:
  `node scripts/perf/asset-access.mjs --url <build served with ?preloadall> --extra "&preloadall" --q high --out rec.json`, merge it into
  `tools/perf/model-access.eager.json`, `node scripts/perf/gen-model-needs.mjs tools/perf/model-access.eager.json > src/render/assets/modelNeeds.generated.ts`,
  then `e2e/model-loading.spec.ts`. A missing arena entry is safe (it loads everything).
- **Rollback levers**: `?preloadall` (old boot), `?nosw` (remove the worker), `WAHALA_NO_GLB_OPT=1` at build (original models),
  Settings > Audio > Data Saver Off. Reverting the branch restores production exactly.
- Run the full CI shards before publishing; the browser specs above are new in the shard list.
- Tools: `scripts/perf/net-measure.mjs` (journeys, per-file wire bytes), `revisit.mjs`, `frame-bench.mjs`, `memory-probe.mjs`,
  `visual-capture.mjs` + `visual-diff.py`, `asset-access.mjs`, `pages-server.mjs`.
