# WAHALA! implementation status

_Last updated at the end of the autonomous Phase 1 build session. Everything below was verified by the commands listed under "Verification". Nothing is claimed that was not run._

## Summary

A complete, browser-only, single-player-versus-AI WAHALA! prototype: one human against 1-3 bots in a 3D Danfo Bus Park (plus an optional trap arena), with all approved Phase 1 mechanics. No backend, accounts or database. It deploys as static files to GitHub Pages under `/wahala-game/`.

## Checkpoints

| # | Checkpoint | Status | Notes |
| --- | --- | --- | --- |
| 1 | Setup, config, CI, Pages workflow | **Done** | Vite + strict TS + React/Zustand/Three, ESLint layering rules, `ci.yml` (typecheck, lint, tests, build, Playwright) and `deploy.yml` (Pages, `/wahala-game/` base). The workflows have not been executed on GitHub yet (they run once the PR exists / after merge). |
| 2 | Deterministic simulation | **Done** | `src/sim`: movement, generators, chains, concrete/soft blocks, simultaneous eliminations, draws, two-minute timer. Seeded, fixed-step, replay-identical (tested). |
| 3 | 3D arena, controls, HUD, menus | **Done** | Three.js Danfo Bus Park, keyboard + touch + gamepad, React title/HUD/pause/results, spectator camera + skip to results, rematch. |
| 4 | Basic AI, complete matches | **Done** | See "AI" below. |
| 5 | Power-ups, upgrades, curses, drops | **Done** | Petrol, Diesel, Socket, Skates, Boots (kick), Gloves (punch/throw), Grip, Remote, Kill Switch, Okada, Voucher, Bad Fuel (3 curses), Jump Sneakers, Hot Fuel; limited death drops. |
| 6 | Carry, Remote, Kill Switch, Okada | **Done** | Carry +1 s exactly once; remote genuine mechanic with failsafe; disarmed generators still explode from flame/vehicles; Okada one-hit shield. |
| 7 | Characters, vehicles, entry selection, cumulative damage | **Done** | Three fixed character/vehicle pairs, push/shove/daze, selectable border entries (any legal border tile) by keyboard/D-pad/tap/click, Keke two-stage turn selection, 8 s window, warnings, cumulative blast damage with slow-down. |
| 8 | Medium and Hard AI | **Done** | See "AI" below. |
| 9 | Presentation, audio, mobile optimisation | **Done (audio unverified by ear)** | Procedural low-poly art, particles, comic eliminations, Pidgin captions, WebAudio music/SFX, quality presets with auto-scaling, merged static meshes, contextual touch UI, fullscreen/landscape request. |
| 10 | Wahala Crush, spectator hazards, remaining features | **Done** | Wahala Crush, crowd throws (bottle / firecracker), floor traps (Lekki Roadworks), Jump Sneakers, Hot Fuel. All optional and off by default. |

## AI

`src/ai` (`createBot({ difficulty, seed, playerId }) -> { decide(obs) -> Intent }`) sees only `observe()` output, uses the same `Intent`s, speeds and rules as a human, and is deterministic per seed.

- **Easy:** slow plans (~every 15-25 ticks), places generators without always verifying an escape, only reacts to imminent flames, ignores chains.
- **Medium:** full danger map (flames, ticking/remote/disabled generators, chain reactions, vehicle lanes, Crush and crowd landings), time-expanded path search, verifies an escape before placing, collects pickups, uses kick/punch/carry/remote/Kill Switch, push/shove/daze, and spends its Vehicle Voucher on a legal entry that cuts a rival off.
- **Hard:** everything Medium does plus checks that its escape survives a rival sealing it, looks for placements that trap a rival even without a direct hit, and times vouchers/remote detonations.

Measured with `npm run simulate -- --matches 200 --players 4` (mixed difficulties, seats rotated, seeds 1-200):

| | Easy | Medium | Hard |
| --- | --- | --- | --- |
| seat win % | 3.7 | 28.2 | 42.1 |
| eliminated by own generator % (usually a rival sealed the exit) | 36 | 23 | 25 |
| average survival | 21 s | 28 s | 32 s |
| decision cost per tick | 5 us | 9 us | 77 us |

Fixed-seed duels (in the test suite): Hard beats Medium 70 %, Medium beats Easy 91 %, Hard beats Easy 84 %. Average match 36 s, 1 of 200 timed out. Crush + crowd throws batch (60 matches) runs without problems. **Known weaknesses:** Hard over Medium is a moderate edge (about 63 % over other seeds), partly achieved by slower Medium reactions; Easy suicides a lot by design; bots can be trapped by well-timed generators and cannot escape a one-tile corridor sealed twice; Crush / crowd / hazard behaviour is unit-tested but not tuned; difficulty ordering was measured on Danfo Bus Park only.

## Verification (what was actually run)

All commands were run in this environment (Node 22, headless Chromium with a software GL renderer):

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean (includes the layering rules: sim/ai purity) |
| `npx vitest run` | **18 files, 215 tests passed** (simulation scenarios incl. vehicles/okada/carry/remote/kill switch/crush/crowd/hazards, 80-match random-play fuzz with invariants and determinism, AI behaviour and ordering, audio with a fake AudioContext, app controller and vehicle-entry controller with fake ports, gamepad mapping, architecture layering) |
| `npm run build` | succeeds; `dist/` ~430 kB app + 552 kB three.js chunk (gzip ~137 kB each) |
| `npx playwright test` (desktop 1280x720 + landscape phone 844x390 with touch) | **30 passed, 4 skipped by design** (project-specific). Covers: title and settings, start/countdown, pause/resume/quit, keyboard movement (one tile per step), generator placement / exit / blocked re-entry / blast, own-generator elimination, spectator banner, skip to results, rematch, draw by simultaneous blast, pickup + Okada ride and loss, all three vehicles (voucher, border entry selection by keyboard, Keke turn stage, warning, driving), entry cancel/timeout, click-to-select, touch D-pad and contextual buttons, device switching, no page scroll on a phone, a full 4-player match against real Hard bots with real audio without console errors, Crush + trap arena + crowd throws together |
| `npm run simulate -- --matches 200 --players 4` | see the AI section |

Screenshots from the browser runs were inspected for layout and rendering problems (`e2e-shots/`, not committed); issues found and fixed that way include the camera never being fitted on load, overlapping touch buttons, tall pillars/walls hiding tiles, tiny characters, a Start button below the fold on phones, and unreadable flame lanes.

## Not implemented / known limitations

- **Audio has not been listened to.** The synthesised music, SFX and mix levels were verified only structurally (fake `AudioContext` tests) and by running the real engine without errors in headless Chromium. Levels, groove and the comic stings need human ears and tuning. iOS Safari audio unlock is untested.
- **Pidgin captions** are original lines written for this project; a native-speaker review is recommended.
- **Real-device performance is untested.** Headless Chromium used a software renderer (about 40-50 fps at 1280x720 on "low"). The draw-call count (~130 at Low, ~310 at High including the shadow pass), triangle count (~30-70k) and the dynamic quality scaler are designed for mid-range phones, but this must be measured on real hardware (use `?fps`).
- **Art is procedural** (primitives, canvas textures). It follows the reference direction (elevated camera, concrete pillars, crates, tyre stacks, hazard stripes, parked danfos, crowd) but is not at the fidelity of the Gemini reference. The renderer builds all models through `render/assets/*`, so glTF models can replace them without touching gameplay.
- **Characters are small on small phones** because the whole grid must fit; a zoom/accessibility option is a candidate follow-up.
- **No online multiplayer, accounts, chat, leaderboards, further arenas, City Rumble** (all LATER in the Bible).
- Exact balance numbers (fuse, range, vehicle thresholds, spawn weights, Crush schedule) are initial values awaiting playtests; see `docs/DECISIONS.md`.
- Vehicles vanish when they leave the arena at the far border (no exit animation).
- The CI/Pages workflows could not be executed from this environment.

## Playtesting focus list

1. Do the 3 s fuse, 2-tile range and 10-tick step feel right on phone and keyboard? Is dodging your own generator reliable?
2. Vehicle entry on touch: is "tap to preview, tap again / LAUNCH to confirm" clear? Is 8 s enough, and the 1.2 s warning fair?
3. Vehicle damage thresholds (Keke 4 / taxi 6 / Danfo 9): does the cumulative-blast rule read as understandable on screen (floating `-5`, slow-down)?
4. Are Easy / Medium / Hard distinct enough? Do bots ever stall, camp or suicide in a way that looks silly?
5. Pickup spawn weights and the usefulness of each pickup; are curses brief and fair?
6. Okada: is the one-hit shield obvious (HUD badge, bike model, break animation)?
7. Readability at phone size: flame lanes, generator numbers, danger previews, entry arrows.
8. Audio: mix, warnings cutting through music, the comic stings, Pidgin captions.
9. Frame rate and battery on real mid-range phones; does Auto quality settle sensibly?
10. Wahala Crush pacing (now starts at 0:45 remaining and is paced to finish exactly at 0:00; see "Gameplay corrections" in DECISIONS.md) and crowd-throw frequency.

## Backlog (from the Bible, not started)

Online multiplayer and spectators, 2v2, larger "City Rumble" mode, 5-10 arenas incl. Power Yard, ambient road traffic, best-of-N and tournament modes, more characters, glTF art pass, voice lines, real-device tuning, copyright/trademark review.

## Continuation prompt

> Continue WAHALA! from `docs/GAME_DESIGN_BIBLE.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md` and `CLAUDE.md`. First run `npm run check` and `npm run test:e2e` and read the playtest feedback in `docs/PLAYTEST_NOTES.md` (create it if missing). Prioritise fixing issues found in human playtests (controls feel, bot behaviour, vehicle readability, mobile performance, audio mix), then art quality and real-device optimisation. Keep `src/sim` pure and deterministic, keep all balance numbers in `src/sim/config.ts`, add a regression test for every bug, log every tuning decision in `docs/DECISIONS.md`, and do not add a backend or multiplayer.


## Presentation overhaul (branch `claude/presentation-overhaul`)

Gameplay rules, the simulation and the AI are unchanged (all 165 prior unit tests still pass).

- **Characters:** three rigged glTF characters (22 bones, 16 clips: idle/run/carry/ride/place/kick/throw/push/stumble/daze/cheer/win/lose/two deaths) replace the primitive figures; clip choice follows sim state and `SimEvent`s.
- **Arena:** textured modelled pillars (3 variants) and 8 soft-block variants, concrete-slab PBR floor, modelled perimeter wall (4 variants) + corner posts + spectator platforms, instanced modelled Danfos (parked and driving), taxi, Keke, Okada, generator; Lagos buildings (4), kiosks, lamps, poles, tyre stacks and barrels.
- **Crowd:** 12 posed, clothed spectator models instanced around the lot (on bleacher platforms and behind), bobbing/cheering with match excitement.
- **UI:** new typography (Anton / Barlow Condensed), title screen with a live bots-only attract match behind it, loading bar, 3D-rendered portraits for the HUD and character cards, warm vignette.
- **Audio:** music removed; synthesised SFX bank (81 sounds), engine/generator loops, crowd ambience and event-driven crowd reactions; recorded-sample override slots.
- **Verification:** see the overhaul report in the PR / final message; `npm run check` and the Playwright suite were run.

## Visual pass v3 (branch `claude/wahala-visual-v3`, based on `claude/presentation-overhaul`)

Presentation only: `src/sim`, `src/ai`, `src/input`, `src/audio`, `src/app` are untouched. Decisions V1-V9 in `docs/DECISIONS.md`.

- **Camera:** elevated three-quarter view (51 deg pitch, 44 deg FOV, re-centred fit). Unit test: every tile stays inside the HUD-free band and pointer picking round-trips every tile on desktop, landscape phone and portrait.
- **Arena:** tall pale precast pillars with blue/yellow foot bands, 1.05 m perimeter walls with pilasters (low on the camera side), smooth light concrete slabs, instanced contact shadows under every pillar/prop (grounding even with shadows off), light-pine crates, weighted destructible variety, more kiosks, shop signs and tyre stacks around the lot.
- **Characters:** stylised proportions (thicker limbs, 1.2x heads, chunkier trainers), fuller faces with lid lines, livelier idle, 8% larger, warm rim light, slot-coloured silhouettes when hidden behind scenery.
- **Okada:** 1.55x red bike with visible wheels and front end, rider seated, golden shield bubble + badge, mount pop, dismount hop, speed dust.
- **Lighting/effects:** warmer, stronger sun; tone-mapping colour grade; flames with orange body + hot core; pooled flame point lights (0/1/3 by quality); vehicle speed streaks.
- **Crowd:** 70 / 170 / 320 people (low/medium/high), watchers, conversation pairs and walkers with calm/react pose flipbooks; ankara, wrappers, kaftans, basins.
- **Tools:** `tools/viewer/gameshot.mjs` (real-game screenshots for art review).

## Gameplay corrections (branch `claude/wahala-controls-crush`)

- **Movement precision (done):** edge-triggered, buffered-once input for keyboard, touch and gamepad (`src/input/moveGate.ts`); `tests/input-movement.test.ts` (45 scenario tests across all three devices) + real-browser tap / hold checks in `e2e/`.
- **Wahala Crush rebalance (done):** starts at 0:45 remaining, final tile closes at exactly 0:00 (`tests/crush-schedule.test.ts`). The start threshold is `config.crush.startRemainingTicks`.

## Lagos audio (branch `claude/wahala-lagos-audio`)

Details and honest limits: `docs/AUDIO.md`. No simulation, AI, input or render code changed.

- **Music:** original Afrobeats-inspired loops (`match_loop` 32 bars at 108 BPM, `menu_loop`, `match_tension` stem) and win/lose/draw stings, generated by `tools/audiogen/` and loaded by `src/audio/music.ts` (menu music after the first gesture, crossfade to the match loop, tension stem for the last 30 s, sting on the result). **Not listened to.**
- **Ambience:** three generated Lagos beds (market babble, bus park, livelier chatter) via the sample slots, plus scheduled street conversations and shouted calls; stadium roars removed.
- **Spoken Pidgin:** 134 lines (reactions + conversations + conductor/hawker calls), 20 synthetic voices. **Synthetic placeholders, not Nigerian speakers, not authentic, not assessed by a human.** Slots for real recordings and a recording script are in place.
- **Settings:** master / music / Lagos ambience and voices / effects sliders, voices switch, reset; persistent; on the title screen and the pause menu (`src/ui/AudioSettings.tsx`, minimal edits to `TitleScreen.tsx`, `Overlays.tsx`, `session.ts`).
- **Not verified:** how any of it sounds; Safari/iOS (Ogg Vorbis is not decoded there, so the MP3 fallback is used; its gapless looping relies on the manifest loop points); real-device memory use (about 45 MB of decoded speech plus music buffers).
- **Verification run:** `npm run check` (typecheck, lint, 388 unit tests including 223 audio tests, production build) passes; `npx playwright test` 36 passed, 4 skipped by design (desktop + landscape phone), including the new audio spec (no AudioContext before the first gesture, menu music after it, match music at match start, four sliders with 80/45/65/85 defaults persisted across reload, mute remembered, panel on the pause menu). A real-Chromium recording of a four-bot match through the real engine and the shipped files ran without audio errors (`tools/audio/browserSmoke.mjs`).


## Unified pre-Gemini baseline (branch `claude/wahala-unified-pre-gemini`)

One branch combining the approved work; decisions U1-U5 in `docs/DECISIONS.md`.

- **Graphics:** everything from visual v3 (above) unchanged: 3/4 camera, arena materials and structures, characters, Okada, lighting/grade, flames, crowd, phone layout, GLB models and `tools/assets/` generators.
- **Controls and Crush:** everything from `claude/wahala-controls-crush` (above) unchanged.
- **Audio:** infrastructure from `claude/wahala-lagos-audio` (four persistent volumes and settings panel, music player, voice/reaction director with cooldowns and variation, manifests, licensed-recording slots, lifecycle). **No music, voice or ambience file ships**; all audible sound is the runtime-synthesised effects and crowd from before the audio branch. See `docs/AUDIO.md`.
- **Not included:** `claude/wahala-vehicles-arenas-v4` (see U5).
- **Deferred:** a 10-track music rotation (the player has one track per slot today); real voice recordings (drop-in via `recorded.json`).
- **Verification run:** `npm run check` passes (typecheck, lint, 447 unit tests in 35 files, production build); `npx playwright test` 39 passed, 5 skipped by design (device-specific specs on the other project), including real-browser 6-tick tap = 1 tile on keyboard and touch, Crush mode, all three vehicles, a full bot match, and an audio spec that no audio file is ever fetched; headless full-match check: Crush first warning at 0:45.0, first landing 0:43.8, one tile left at 0:02, final tile lands at 0:00 with a simultaneous draw and no crush events after the end (both arenas); `npm run simulate` 100 classic + 60 crush/hazard/crowd matches decided normally; desktop and phone gameplay screenshots render without console errors.

### Gemini handoff map (visual presentation of gameplay)

Rendering only reads `GameState` and consumes `SimEvent`s; no rules live there. Entry point `src/render/GameRenderer.ts`; camera `render/cameraRig.ts` (tests in `tests/render/camera.test.ts`, which also round-trip pointer picking); lighting/grade `render/lighting.ts`, `render/grading.ts`; quality tiers `render/quality.ts`; per-entity views in `render/views/` (`ArenaView`, `PlayerViews` incl. animation choice, `VehicleViews`, `GeneratorViews`, `FlameViews`, `PickupViews`, `OverlayViews`, `okadaShield`); model loading through `render/assets/library.ts` with procedural fallbacks (`characters.ts`, `vehicles.ts`, `generator.ts`, `props.ts`), crowd `render/assets/crowd.ts`, backdrop `render/assets/backdrop.ts`; effects in `render/fx/`. GLB/JPG assets are generated by `tools/assets/build_*.py` (see `docs/ASSET_PIPELINE.md`); `tools/viewer/gameshot.mjs` takes real-game screenshots.

## Cinematic camera overhaul (branch `claude/wahala-camera-overhaul`, from Gemini WIP `3c4c4b4`)

Presentation only; full report with before/after screenshots in `docs/CAMERA_OVERHAUL.md`, decisions C1-C7 in `DECISIONS.md`.

- **Camera:** default low action camera (41 deg, 38 deg FOV, ~11 units from the focus, ~7 m high - was a fixed whole-board fit at ~18.5 units/12.6 m) following the local player with damping; widens for generators/vehicles that can reach the player and for the player's own vehicle; overview establishing shot in the countdown, overview while choosing a vehicle entrance, survivors when spectating, winner close-up. Whole-arena overview on `O` / HUD map button (persisted as `cameraView`). Files: `render/cameraRig.ts`, `render/cameraDirector.ts`.
- **Gameplay config restored:** `pickups.hiddenChance` 0.4 and `arena.softDensity` 0.62 (the WIP had 0.58/0.38). `src/sim` is identical to `9db37bd`.
- **Scene:** squat pillars/soft blocks, characters 1.86 tiles, per-arena light/fog/tints (`render/arenaLook.ts`), floor markings, Ankara-wrapped market pillars, chevron-banded roadworks pillars, per-arena breakable families, Lekki construction site + crane + excavator + floodlights + skyline, market bunting + canopies, south kerbs; smaller, darker crowd set back from the walls; split-tone grade; lower flame sprites; turn dust.
- **Tools:** `scripts/gameplay-shots.mjs` captures desktop + phone gameplay frames for every arena from a running dev/preview server.
- **Verification:** `npm run check` green (457 Vitest tests, lint, typecheck, build). Playwright desktop + phone, one worker: 41/41 runnable tests pass, 0 failures; 39 needed the automatic retry because the container's single-process Chromium closes on a new context before any test code runs (same on the untouched baseline). `src/sim`, `src/ai`, `src/input`, `src/audio`, `public/` identical to `9db37bd`.

## Gritty gameplay v1 (branch `claude/wahala-gritty-gameplay-v1`, from `a734ef8`)

Report with before/after screenshots: `docs/GRITTY_GAMEPLAY_V1.md`; decisions G1-G11 in `DECISIONS.md`; audio in `AUDIO.md`.

- **Camera:** standard matches keep the whole arena on one shared screen for the entire match (fixed 46-degree three-quarter view, HUD- and touch-control-safe); the close follow camera survives as the `stadium` mode (`?cam=stadium`), unused until the 32-player stadium exists.
- **Visuals:** world-space weathering on every lit material (`render/grit.ts`), hard cinematic grade, per-arena moods and lamps, procedural per-arena floors, de-toyed pillars, heavier smoke/debris/scorch, adult head proportions; per-arena surroundings in `render/arenas/` (bus terminal, dense market, night construction site); real animated background people (`render/life/StreetLife.ts`) and atmosphere (`render/fx/Ambient.ts`); all parked vehicles are the detailed GLBs at gameplay scale; the painted cartoon-Danfo wall is retired.
- **Mandatory endgame floor traps:** waves live at 0:30 and 0:15 in every standard match, telegraphed 1.5 s ahead, only on open floor, never on the final Crush tile or its neighbours; "Early traps" option on every arena. Crush timing unchanged.
- **Music:** nine of the ten approved Pixabay tracks installed (`public/audio/music/pixabay_<id>.mp3`; #7 `pixabay_496406` not supplied, slot ready), arena playlists with starting tracks, no immediate repeat, loudness-levelled, pitch-preserved endgame tempo 1.00 -> 1.09 with a brightness lift.
- **Verification run (2026-10-23):** `npm run check` passes (typecheck, ESLint, 513 Vitest tests in 38 files, production build). `npx playwright test --workers=1` (desktop + phone): 47 of 47 runnable tests pass, 0 failures, 5 skipped by design for the other device; 45 needed the automatic retry because their first attempt died in ~0.2 s with "browserContext.newPage: Target page, context or browser has been closed" before any test code ran (the container's single-process software Chromium; same pattern recorded on the camera-overhaul baseline). Real-browser music checks: all nine tracks fetch and decode; a match plays its arena's starting track with the stream advancing and pitch preservation on; rate ~1.045 at 0:15; pause/resume; per-arena start tracks and rotation. `npm run simulate`: 60 classic matches decided (avg 36.8 s, no timeouts); 40 crush+hazard matches decided (avg 42.5 s). Desktop and phone gameplay captures of all three arenas plus trap telegraph/live frames are in `docs/screenshots/gritty-v1/`.
- **Not verified:** how the music sounds (no audio output in the container), 60 fps behaviour on a real phone, Safari/iOS.

## Nine arenas / City Rumble - visual workstream E (branch `claude/wahala-nine-arenas-city-rumble`)

Presentation only (decisions E1-E10 in `DECISIONS.md`); `src/sim`, `src/ai`, `src/app`, `src/audio`, `src/render/arenas`, `arenaLook.ts` and `TitleScreen.tsx` untouched.

- **Camera:** fixed whole-arena view re-composed at 42 degrees through a 31-degree lens (desktop distance 23.8); still frames every tile on desktop, landscape phone and portrait.
- **Obstacles:** character-height pillars (1.42-1.78 m) and ~0.75-1.08 m breakables from a per-arena style registry covering all ten arena ids (`render/assets/obstacleStyles.ts`), 8 new pillar and 3 new breakable GLBs, heavier 1.5 m x 0.4 m walls with 1.85 m piers and a low 0.42 m camera-side barrier; obstacles in front of players/generators/pickups dissolve with a dither.
- **Fire and destruction:** fully instanced flames (7 draw calls whatever burns), lane ignition, soot streaks, cracks, 3D debris with physics; broadcast-style match clock.
- **Verification (2026-10-23, heavily loaded shared container, load average 15-40 on 4 cores):** typecheck, ESLint and the production build pass. `npm run check`'s Vitest step had 9 failures, all timeouts in untouched AI/audio tests; re-run on their own they pass (`tests/audio` 249/249 with `--testTimeout=120000`, `tests/ai/behaviour.test.ts` 9/9 with `--testTimeout=600000`, `tests/ai/ordering-hard-medium.test.ts` 1/1 unchanged). All render tests pass (camera, obstacle styles, fx instancing, props). Real-Chromium gameplay frames before/after (desktop 1280x720 and landscape phone 844x390, all three arenas, running + blast) in `docs/screenshots/nine-arenas/visual-e/`, plus model lineups and a bus-park close-up in `detail/`.
- **Not verified:** Playwright e2e suite (not run in this pass), frame rate on a real phone, the seven future arenas' obstacles in their own scenes (only seen in the model viewer), a mid-blast close-up (the close-up frame caught the aftermath: settled debris and smoke).

## City Rumble, Workstream D (branch `claude/wahala-nine-arenas-city-rumble`): 8-32 competitors

- **Match:** 3:00 clock, the city closes from 2:00 left, only the 11 x 9 core is left from 0:30 (traps at 0:30/0:15). Headless batches end on their own after about a minute at every size, so a 5:00 clock never reached the closing city.
- **AI (`src/ai/scale.ts`, `zone.ts`):** on boards over 400 tiles each bot reasons about a local window (danger-map rebuilds only for changes within 11 tiles, rival simulations for the 5 nearest within 12, search capped at 18 step slots), a deterministic work budget per re-plan (easy 8 / medium 14 / hard 26 units), at most 4 routine re-plans per tick across all bots (urgent ones never deferred), a public safe-zone field that pulls bots inwards ahead of the ring, hunting paced 0.3x -> 3x over the match, and full escape checks in the final few. Standard boards are bit-identical (`scripts/ai-fingerprint.ts`).
- **Numbers** (`npm run simulate -- --arena cityRumble --players N --matches 10 --difficulty D`, CPU time per tick for all bots + sim, shared 4-CPU container): medium 8/16/24/32 avg 0.21/0.33/0.39/0.43 ms, p99 2.4/3.0/3.1/3.3 ms, match 64/62/65/77 s, 0 draws, 0 timeouts; 32 hard avg 1.29 ms, p99 6.1 ms, 0 draws; 32 easy avg 0.33 ms, 1/10 draws (simultaneous). Before this work one 32-bot tick averaged 14 ms with 1.9 s spikes.
- **Presentation:** follow camera on the local player (spectator: on a survivor, cycle with Q/E, A/D, arrows or buttons), minimap (`ui/Minimap.tsx`, model `ui/minimapModel.ts`), rumble HUD and results (`ui/RumbleHud.tsx`), sliced skip-to-results, off-screen player LOD, far effects/sounds culled, listener-relative panning, floor canvas capped at 2560 px, district floor and surroundings (`render/arenas/rumble.ts`, `rumbleSet.ts`).
- **Tests:** `tests/rumble-ai.test.ts`, `tests/rumble-app.test.ts`, `tests/rumble-camera.test.ts`, `e2e/rumble.spec.ts`; screenshots in `docs/screenshots/nine-arenas/rumble/` (`scripts/rumble-shots.mjs`).
- **Not measured:** frame rate on a real phone or GPU; software WebGL in this overloaded container cannot give a meaningful fps.

## How to Play: in-engine demonstrations + safe practice (nine-arenas branch, workstream F)

- **What:** the title's *How to play* button (`data-testid="help-button"`) opens a tutorial beside the live game view: 15 chapters (moving; generators and the plus blast; Extra Socket and chains; Petrol / Diesel range; Kick; Punch; Carry; Generator Pass; Remote Starter; Push / Daze / Shove; the vehicle attack in six steps with the Keke turn; stage hazards; the mandatory final-30-second traps; the Surulere Power Yard rule; City Rumble and its minimap). Each chapter has a scripted demonstration played by the REAL engine (createGame + programmatic setup + a deterministic script of ordinary `Intent`s and vehicle-selector commands), with captions, part progress, pause, replay, previous / next and a chapter list, a "Remember" fact list and a controls legend for keyboard / gamepad / touch (keys and buttons read from the real binding tables; a picture of the real on-screen buttons). 13 chapters have a practice: the human plays player 0 against passive training dummies (no bots), goals tick off from simulation events, a failed attempt restarts with a message.
- **Code:** `src/tutorial/` (pure, imports only `src/sim`: chapter data, `ScriptRunner`, `PracticeTracker`, scenario setup), `src/app/TutorialController.ts`, `MatchController.startScenario(state, director)` (+ `ScenarioDirector`; a scenario has no bots, no results screen, no rematch / skip, no crowd banter, and ignores human gameplay input while a demo plays), `commands.openTutorial / tutorial* / exitTutorial` in `session.ts`, `ui/HowToPlay.tsx` + `HowToPlay.css`, `ui/howToPlayControls.ts`. Isolation: the tutorial never writes `settings` (practice character choice is tutorial-only; the City Rumble `O` toggle is not saved).
- **Tools:** `scripts/tutorial-shots.mjs` captures the tutorial (desktop + phone) from a running dev / preview server.
- **Phones:** on short landscape screens a practice starts with the lesson panel folded to a slim strip (goal ticks, show, exit) so the arena gets the width; during demos the HUD entry panel and inventory row are hidden (the demo's subtitle and step label carry that information) and the subtitle sits on the bottom edge.
- **Verification (2026-10-23):** `npm run check` passes (typecheck, ESLint, 686 Vitest tests in 45 files, of which 62 in `tests/tutorial/`, production build). Every chapter's demo is played headlessly through the real MatchController + simulation and asserted to show its mechanic (vehicle: voucher, entry mode, browse -> preview the chosen entrance -> turn stage -> chosen turn -> launch, Keke route bends, it drives and exits; Power Yard: crates broken along the whole row and column, the dummy behind a pillar caught; endgame: both waves warn and go live with stage hazards off; etc.); every practice has a scripted correct attempt through the real input port, and idle / failure / restart / settings-isolation tests. Playwright `e2e/tutorial.spec.ts` (`WAHALA_MULTIPROCESS=1 WAHALA_E2E_PORT=4391`, one worker): 4 passed, 2 skipped by design (device-specific), 0 retries: demo + pause + replay + next chapter + legend + exit with saved settings unchanged (desktop and phone), the Keke launch practice by keyboard (desktop) and by D-pad + on-screen buttons with the folded panel (phone), no console errors. The default `--single-process` launch crashed outright in this container under load, hence the opt-out. Screenshots: `docs/screenshots/nine-arenas/tutorial/` (desktop + phone, 10 each).
- **Not covered:** Kill Switch and Okada have no chapter of their own (Okada is mentioned where hazards and vehicles can be absorbed); the City Rumble lesson describes the minimap from the design (`src/ui/Minimap.tsx` was being built in parallel and is not shown in the captures); the stage-hazard and endgame lessons are watch-only.
