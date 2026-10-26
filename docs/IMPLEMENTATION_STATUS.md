# WAHALA! implementation status

_Last updated at the end of the autonomous Phase 1 build session. Everything below was verified by the commands listed under "Verification". Nothing is claimed that was not run._

## City Rumble Evolution V1 (branch `claude/wahala-rumble-evolution-v1`, from `408fb4d`)

Founder brief of 2026-10-26 plus the late research pack (report and contracts: `RUMBLE_EVOLUTION.md`; research
verdicts: `RUMBLE_RESEARCH_DIGEST.md`; roadmap: `RUMBLE_ROADMAP.md`; decisions: `DECISIONS.md` section RE). One lead
plus five parallel workstreams in separate worktrees, all merged. Classic Battle is unchanged. Not published to Pages.

| Area | Delivered | Main tests |
| --- | --- | --- |
| Radial blast (Rumble) | One shared footprint (`sim/systems/blastShape.ts`): grid disc `dx^2+dy^2 <= R^2+R`, wave + line-of-sight cover, Hot Fuel, Square Blast successor; flames, `previewBlast`, voice warning and bots all use it; Rumble-only switch radial (default) / cross | `tests/radial-blast.test.ts`, `tests/ai/radial*.test.ts`, `e2e/rumble-evolution.spec.ts` |
| Generators and rewards | Two starting generators in Rumble; radius cap 5, square cap 6 (no dead ladder rungs); eight marked `$` supply crates per stage (finite, public marking); measurement harness `scripts/rumble-metrics.ts` | `tests/rumble-economy-evolution.test.ts`, `tests/economy*.test.ts` |
| Assisted movement | Input-layer only: early turns (2 tiles), sidestep, diagonal-thumb wish, switch settling, danger-safe substitutions; `moveAssist` auto / on / off in Settings | `tests/input-assist*.test.ts`, `e2e/mobile.spec.ts` |
| Bots | Radial-aware danger maps, cover, worst-chain placement, two-generator cut-offs, supply interest; Classic decisions byte-identical | `tests/ai/*`, `tests/modes-bots.test.ts`, `tests/economy-ai.test.ts` |
| Ojuelegba | Five districts (45 x 33, non-mirrored) on the research link graph, breach partition, merged-object cover, deck cutaway, attack lanes, Danfo pull-out | `tests/rumble-ojuelegba.test.ts`, `tests/rumble-stages.test.ts`, `tests/render/ojuelegba-cover.test.ts` |
| Living environment | `StageEnvironment` contract, ambient traffic off the board, protected crowd zones with reactions, budgets per tier, departure hazard with escape guard | `tests/living-env.test.ts`, `tests/render/env-plan.test.ts`, `tests/stage-hazards.test.ts` |

Verification (container: 4 cores, software WebGL):
- `npx tsc --noEmit`, `npx eslint .`: clean. `npx vitest run`: 98 files, 1469 passed, 5 skipped, 0 failed. `npm run build`: ok.
- Playwright, every spec on the release build, desktop + phone: 113 passed, 27 skipped (project-specific), 0 failed.
- Final legacy vs evolution bot measurement: `docs/measurements/rumble-evolution-final.md` (summary in
  `RUMBLE_EVOLUTION.md` L.2).
- Not measured: physical phones (frame rate, touch feel), human playtests, recognition review. Limits: L.4.

## Stitch menu and navigation (branch `claude/wahala-stitch-uiux-v1`, from `cd502b8`)

Founder brief of 2026-10-25: the approved Google Stitch design implemented as the real game interface (report:
`STITCH_UI.md`; decisions: `DECISIONS.md` UI1-UI11). Presentation only; the simulation is untouched.

| Area | Delivered | Main tests |
| --- | --- | --- |
| Menu flow | Home -> Game mode -> Match setup -> Fighter -> Ready -> play; Arena detour; Edit-from-Ready returns to Ready; Quick play / Review for the saved setup; pure state machine `app/menu.ts` | `tests/app/menu.test.ts`, `e2e/menu.spec.ts` |
| Real settings | Every screen writes `GameSettings` / audio prefs through `commands`; mode-specific options only; `sanitizeSettings` repairs broken saves before every start | `tests/app/settingsSanitize.test.ts`, `tests/ui/menuScreens.test.ts` |
| Screens | Home, Mode, Setup (Rumble / Classic), Arena (registry-driven, previews, hazards, rules), Fighter (registry-driven, concept art, real melee + vehicle), Ready, Settings (Audio / Graphics / Controls / Accessibility, Restore defaults), Training Academy menu, Pause (Settings keeps the match paused), Results (real outcome, standings, Rematch / Change setup / Main menu) | `tests/ui/menuScreens.test.ts`, all e2e specs |
| Input | Keyboard and gamepad focus navigation (D-pad / arrows, A / Enter, B / Esc), touch | `tests/ui/focusNav.test.ts`, `e2e/menu.spec.ts` |
| Responsive | Desktop, laptop, phone portrait and landscape compositions; >= 44 px targets; safe areas; pause menu above the rotate notice | `e2e/menu.spec.ts` (six sizes) |
| Art | Key art + three fighter portraits as local WebP (`tools/ui/build_menu_art.py`: mock HUD cropped, brand marks removed); Bebas Neue + Space Grotesk bundled | `scripts/menu-shots.mjs` review |

Verification (container: 4 cores, software WebGL, Chromium 1243):
- `npx tsc --noEmit`, `npx eslint .`: clean. `npx vitest run`: 85 files, 1189 tests pass. `npm run build`: ok.
- Playwright, every spec on the release build in both projects (desktop 1280x720, phone 844x390): 96 passed in the
  two-worker run; the failures were two spec bugs (fixed), an entrance-animation measurement (fixed: `settled`) and
  load-starved HUD refreshes, and every one of them passes in a one-worker rerun. The voices test now looks up the
  reaction it checks instead of the last line (ambient street talk can follow it); the interrupt is still asserted.
- Screenshots of every screen at 1440x900, 1280x720, 390x844, 844x390 and 667x375 reviewed (`scripts/menu-shots.mjs`;
  a selection in `docs/screenshots/stitch-ui/`).
- GitHub CI run 100 on `e3dfac8` (2026-10-26): typecheck, lint, unit tests, build and the full Playwright suite (128
  tests, desktop + phone) passed; `deploy-preview` then published `gh-pages` commit `be5ec5a`, whose `build.json` names
  `e3dfac8` on `claude/wahala-stitch-uiux-v1`. (Run 99 on `f6376af` passed every test it reached but hit the old
  120-minute e2e step limit, so it published nothing; the limit is now 170 minutes.)
- Not measured: frame rates on physical phones.

## V2 gameplay revolution and City Rumble V2 (branch `claude/wahala-gameplay-rumble-v2`, from `184837d`)

Founder brief of 2026-10-25, built by one lead plus six parallel workstreams in separate worktrees (contracts:
`V2_CONTRACTS.md`; rules: `GAMEPLAY_V2.md`; stages: `RUMBLE_STAGES_V2.md`; decisions: `DECISIONS.md` section W).
All six streams are merged. Verified on the integrated branch (commands below); nothing here is claimed untested.

| Stream | Delivered | Main tests |
| --- | --- | --- |
| A two-button combat | A = generator, B tap = context special (melee, else one-press vehicle), B hold (400 ms) = Remote; no third button on any device; contact abilities (kick / punch / disarm / pass) by walking into a generator, mutually exclusive; Carry out of normal play; auto vehicle route chooser (reaction-aware, all three vehicles, Keke turn); one-tile corner-turn buffer; bounded camera shake (off on touch / reduced motion, crush adds none, touch targets use the un-shaken camera) | `v2-contact`, `v2-special`, `v2-auto-vehicle`, `input-two-buttons`, `render/shake`, `e2e/mobile.spec.ts` |
| B AI and Classic | Seven distinct bot levels (Rookie default, mercy rule so Rookie never traps); per-bot levels in Classic, preset + mixed roster in Rumble; mandatory Wahala Crush (final tile at 0:00, ties, stage hazards cannot disable it); Mobile Test Arena 13x9 and 15x9 (experimental section); sideline spectators throwing generators (cooldown, telegraphed landing, never credited) | `ai/ordering-*`, `ai/rookie`, `crush-mandatory`, `spectators`, `ui/difficultyPicker` |
| C economy and blast | Rumble power from credited eliminations only (crates empty), reward ladder per life streak with raised Rumble caps; deterministic credit (flame, chain starter, vehicle, melee-into-hazard within 3 s, never spectators/teammates, one credit per death); Square Blast 3x3 / 5x5 / 7x7 (union with the plus, never through concrete) in sim, AI and visuals; Armour + Okada layers (one layer per tick); progression badge | `economy`, `economy-ai`, `square-blast`, `protection` |
| D modes and menu | City Rumble-first main menu with Classic Battle; Survival, Deathmatch (5 / 10 min, respawns, spawn protection, K/D/A ranking + tie-breaks), Team Rumble (Green v White up to 16 v 16, team sides, friendly-fire setting, team leaderboard); one simulation with rulesets; results screens | `modes`, `modes-bots`, `app/modes-app`, `e2e/rumble.spec.ts` |
| E Training Academy | 20 interactive lessons on the real simulation (objective, short demo, attempt, event-based completion, tips, unlimited retries, skip), progress saved locally, floor markers, mobile text in the HUD rail | `tests/tutorial/*`, `e2e/tutorial.spec.ts` |
| F five Rumble stages | Oshodi Rush Hour (default), Lagos Island Markets, Ojuelegba Underbridge, Apapa Docks (45x31), Lekki Nightworks: distinct layouts, hazards (traffic, falling goods, container drops, trucks, debris, machinery), surroundings and looks; one signature track each | `rumble-stages`, `audio/assets` |
| Lead | Contracts, 11 new voice clips (30 total), five Rumble tracks (160 kbps), V2 event sounds, voice zones for the new stages, integration fixes, e2e updates, deployment switch | `audio/*`, all suites |

Verification on the integrated branch (container: 4 cores, software WebGL):
- `npx tsc --noEmit`, `npx eslint .`: clean. `npx vitest run`: 82 files, 1164 tests pass.
- Playwright: every spec run on the integrated build in both projects (desktop 1280x720, phone 844x390), after the
  spec updates for the V2 menu; all pass (the nine-arena sweep needed its retry once, after a preview-server start
  failure).
- GitHub CI run 92 on `1d69ad4` (2026-10-25): typecheck, lint, unit tests, build and the full Playwright suite passed;
  `deploy-preview` then published `gh-pages` commit `fea5846` ("Preview build of 1d69ad4"), whose `build.json` names
  `1d69ad4` on `claude/wahala-gameplay-rumble-v2`. (Run 91 had failed on one phone-only e2e measurement - fixed - so it
  published nothing and the voice-integration preview stayed live until then.)
- Not measured: frame rates on physical phones (only software-rendered Chromium was available).

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

## V2 Training Academy (stream E, branch `v2/e-academy`) - supersedes the How to Play section below

- **What:** the title's *How to play* button opens the Training Academy: 20 lessons in 5 courses (Beginner: move & turn, A places, escaping, plus reach, shelter; Power-ups: Extra Socket chain, Petrol, Square Blast, Okada & Armour; Generator tricks: kick, punch, disarm, Generator Pass, Remote = hold B; Button B: melee, one-press vehicle; Match rules: Wahala Crush + 0:30 traps, Survival rewards, Deathmatch respawns, Team friend vs enemy). Each lesson: objective -> brief real-engine demo -> the human's practice (normal HUD + TouchControls) checked task by task from real sim events/state -> tips for common mistakes -> unlimited retries from checkpoints -> next lesson only when completed or skipped. Green floor markers; progress in `localStorage` `wahala.academy.v1`; any lesson can be watched or practised from the lesson list. Decisions WE1-WE10.
- **Code:** `src/tutorial/` (`lessons/*`, `practice.ts` PracticeSession + detectors, `hints.ts` device wording, `progress.ts`), `app/TutorialController.ts`, `ui/HowToPlay.tsx/.css`, `ui/howToPlayControls.ts` (V2 rows: move, A place, B tap special, B hold detonate). Small shared edits: `store.ts` (TutorialView), `MatchController.ts` (`ScenarioDirector.markers` -> `FrameInfo.markers`), `render/views/OverlayViews.ts` (marker drawing), `session.ts` (Academy commands, narration cue hook, board corners in page coordinates).
- **Verification (2026-10-25):** `tests/tutorial/*` 92 Vitest tests (every demo shows its mechanic; every practice has a correct attempt through the real input port that completes it, an idle run that completes nothing, mistake tips and a fail -> retry-from-checkpoint path; vehicle one-press for all three characters; touch wording names only buttons A / B). Playwright `e2e/tutorial.spec.ts` (`WAHALA_MULTIPROCESS=1`, one worker): lesson 1 demo + practice by keyboard (desktop) / floating stick (phone) + skip + lesson list; at 844x390 and 667x375 no Academy text over the board or its bottom row / lower-left spawn, and button A places a real generator. Screenshots in `e2e-shots/*academy*`.
- **Not done / depends on stream A:** the human cannot press B until stream A binds `special` / B-hold in the input layer (the legend shows "not bound" until then; tests drive B with Intents). Touch highlight of B targets `data-testid="btn-special"` (A's naming is not known yet). The stage-hazard, Power Yard rule and City Rumble minimap chapters were dropped (WE2).

## How to Play: in-engine demonstrations + safe practice (nine-arenas branch, workstream F)

- **What:** the title's *How to play* button (`data-testid="help-button"`) opens a tutorial beside the live game view: 15 chapters (moving; generators and the plus blast; Extra Socket and chains; Petrol / Diesel range; Kick; Punch; Carry; Generator Pass; Remote Starter; Push / Daze / Shove; the vehicle attack in six steps with the Keke turn; stage hazards; the mandatory final-30-second traps; the Surulere Power Yard rule; City Rumble and its minimap). Each chapter has a scripted demonstration played by the REAL engine (createGame + programmatic setup + a deterministic script of ordinary `Intent`s and vehicle-selector commands), with captions, part progress, pause, replay, previous / next and a chapter list, a "Remember" fact list and a controls legend for keyboard / gamepad / touch (keys and buttons read from the real binding tables; a picture of the real on-screen buttons). 13 chapters have a practice: the human plays player 0 against passive training dummies (no bots), goals tick off from simulation events, a failed attempt restarts with a message.
- **Code:** `src/tutorial/` (pure, imports only `src/sim`: chapter data, `ScriptRunner`, `PracticeTracker`, scenario setup), `src/app/TutorialController.ts`, `MatchController.startScenario(state, director)` (+ `ScenarioDirector`; a scenario has no bots, no results screen, no rematch / skip, no crowd banter, and ignores human gameplay input while a demo plays), `commands.openTutorial / tutorial* / exitTutorial` in `session.ts`, `ui/HowToPlay.tsx` + `HowToPlay.css`, `ui/howToPlayControls.ts`. Isolation: the tutorial never writes `settings` (practice character choice is tutorial-only; the City Rumble `O` toggle is not saved).
- **Tools:** `scripts/tutorial-shots.mjs` captures the tutorial (desktop + phone) from a running dev / preview server.
- **Phones:** on short landscape screens a practice starts with the lesson panel folded to a slim strip (goal ticks, show, exit) so the arena gets the width; during demos the HUD entry panel and inventory row are hidden (the demo's subtitle and step label carry that information) and the subtitle sits on the bottom edge.
- **Verification (2026-10-23):** `npm run check` passes (typecheck, ESLint, 686 Vitest tests in 45 files, of which 62 in `tests/tutorial/`, production build). Every chapter's demo is played headlessly through the real MatchController + simulation and asserted to show its mechanic (vehicle: voucher, entry mode, browse -> preview the chosen entrance -> turn stage -> chosen turn -> launch, Keke route bends, it drives and exits; Power Yard: crates broken along the whole row and column, the dummy behind a pillar caught; endgame: both waves warn and go live with stage hazards off; etc.); every practice has a scripted correct attempt through the real input port, and idle / failure / restart / settings-isolation tests. Playwright `e2e/tutorial.spec.ts` (`WAHALA_MULTIPROCESS=1 WAHALA_E2E_PORT=4391`, one worker): 4 passed, 2 skipped by design (device-specific), 0 retries: demo + pause + replay + next chapter + legend + exit with saved settings unchanged (desktop and phone), the Keke launch practice by keyboard (desktop) and by D-pad + on-screen buttons with the folded panel (phone), no console errors. The default `--single-process` launch crashed outright in this container under load, hence the opt-out. Screenshots: `docs/screenshots/nine-arenas/tutorial/` (desktop + phone, 10 each).
- **Not covered:** Kill Switch and Okada have no chapter of their own (Okada is mentioned where hazards and vehicles can be absorbed); the City Rumble lesson describes the minimap from the design (`src/ui/Minimap.tsx` was being built in parallel and is not shown in the captures); the stage-hazard and endgame lessons are watch-only.

## Nine arenas / City Rumble - integrated branch (`claude/wahala-nine-arenas-city-rumble`)

Report: `docs/NINE_ARENAS_CITY_RUMBLE.md`; decisions N1-N21 and E1-E10 in `DECISIONS.md`; deployment in
`DEPLOYMENT.md`. Six workstreams (visual quality, two arena-art passes, hazard presentation + menus, City Rumble,
tutorial) were merged onto the simulation core and verified together:

| Check (2026-10-24, integrated build) | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint .` | clean |
| `npx vitest run` | **53 files, 752 tests passed** |
| `npm run build` | succeeds; JS 0.90 MB + 0.65 MB three.js (gzip 299 KB + 163 KB), 18.7 MB of GLB models preloaded once behind the progress bar, music streamed per match (one MP3, 3-8 MB) |
| Playwright, all specs, desktop + phone, one worker (`WAHALA_MULTIPROCESS=1`) | **60 passed, 0 failed, 1 flaky (passed on retry), 9 skipped by design** (39 min) |
| GitHub Actions CI on this branch | green, e2e included (run #46, after the CI fixes N15) |
| `scripts/arena-balance.ts` (bots, 20 matches per arena) | every arena decided (90-100 % winners), 20-57 s average, stage-hazard eliminations 0-10 % |
| `npm run simulate -- --arena cityRumble --players 8/16/24/32` | 0.21-0.43 ms per tick (medium), 0 timeouts; see N16/N17 |
| GitHub Pages | build published to `gh-pages` on every push (`build.json` names the commit); **Pages itself must be enabled once by an admin** (`DEPLOYMENT.md`) |

Screenshots of the integrated build: `docs/screenshots/nine-arenas/final/` (all nine arenas desktop + phone:
countdown, running, blast, north side; Power Yard full-line blast; the six-step Keke attack; desktop + phone).

**Not verified:** sound by ear (no audio output in the container); frame rate on a real phone or GPU (software
WebGL here gives single-digit to ~20 fps whatever the scene); the live Pages URL (the container cannot reach
`*.github.io`, and Pages is not enabled yet); human playtesting of any balance number.


## Mobile joystick and music-first audio (branch `claude/wahala-mobile-joystick-audio`, from `39af53b`)

Report: `docs/MOBILE_JOYSTICK_AUDIO.md`; decisions M1-M9 in `DECISIONS.md`; audio in `AUDIO.md`; deployment in
`DEPLOYMENT.md`. Floating thumbstick (grid-only, one tile per slide, held = player's own cadence), right-edge
button column and a larger whole-arena board on landscape phones, music-first recommended mix with migration and a
"Use recommended mix" button, touch controls hidden once the player is out (regression found by the phone e2e run).

| Check (2026-10-24) | Result |
| --- | --- |
| `npm run check` (tsc, eslint, vitest, build) | clean; **54 files, 783 tests passed** |
| Playwright, all specs, desktop + phone, one worker | **63 passed, 1 failed, 10 skipped by design** (32 min); the failure (phone City Rumble: the stick zone covered the spectator button) was fixed and the affected specs re-run: **13 passed** (`mobile`, `rumble`, `tutorial`, both projects) |
| Real-browser phone frames (`scripts/mobile-shots.mjs`) | 568x320, 667x375, 740x360, 844x390, 932x430 and City Rumble: no page errors; buttons clear of the board; clock 34-43 px tall |
| GitHub Actions CI on `0abf93b` | **green**: typecheck, lint, unit tests, build and the full Playwright suite (desktop + phone) |
| GitHub Pages | published by CI only after that check passed: `gh-pages` commit `92c7e0b` ("Preview build of 0abf93b"), `build.json` names `0abf93b` / this branch; GitHub's "pages build and deployment" run succeeded; JS, CSS, music manifest and tracks served from `gh-pages` with status 200. The live `*.github.io` URL itself cannot be opened from the container (proxy) |

**Not verified:** sound by ear (no audio output in the container; levels are measured with ffmpeg); feel of the
stick on a real touch screen (Chromium touch emulation and mouse-driven pointer events only); frame rate on a
real phone.

## Nigerian voice integration and clean gameplay HUD (branch `claude/wahala-voice-integration`, from `7ef982f`)

Report: `docs/VOICE_INTEGRATION.md`; decisions V1-V10 in `DECISIONS.md`; audio details, event mapping, how to add
clips and licensing in `AUDIO.md` "Voice lines"; frames in `docs/screenshots/voice/`.

- 19 founder-approved Gemini TTS clips imported (of 47 planned lines; the rejected `conductor_cms_01` excluded),
  mapped to 8 of the 20 triggers; the other 12 triggers are wired and stay silent until their clips arrive.
- Voice bus, urgent-speech ducking, priority interruption, per-line cooldowns, per-arena lazy loading, zone-aware
  background talk (market line on Balogun / Oshodi / Yaba / City Rumble).
- Crowd speech bubbles removed; essential notices, stage alerts, the arena rule and the new subtitles (Off by
  default / On / Large) moved into a rail beside the board, sized from the board's screen corners.

| Check (2026-10-24) | Result |
| --- | --- |
| `npm run check` (tsc, eslint, vitest, build) | clean; **55 files, 791 tests passed** |
| Playwright, all specs, desktop + phone, one worker (`WAHALA_MULTIPROCESS=1`) | **76 passed, 0 failed, 0 flaky, 12 skipped by design** (29 min), including the new `e2e/voices.spec.ts` (clips decode at their listed lengths, per-arena loading, triggers, urgent interruption, 404/corrupt clips skipped, subtitles, nothing over the bottom row, joystick + generator placement with a subtitle showing). Then the Power Yard rule was found clipped in the rail on an iPhone SE frame: fixed, with a regression test (fails before, passes after on both projects) |
| Real-browser frames (`docs/screenshots/voice/`) | 568x320, 844x390, 932x430, 1280x720 and the Power Yard rule at 568x320 / 844x390: rail left of the board edge, bottom row and lower-left spawn uncovered, no page errors |
| GitHub Actions CI on `a9da0dd` (run #73) | **green**: typecheck, lint, unit tests, build and the full Playwright suite (desktop + phone, 84 min) |
| GitHub Pages | published by CI only after that check passed: `gh-pages` `build.json` names `a9da0dd` / `claude/wahala-voice-integration` (built 2026-10-24T08:37:56Z); the 19 voice MP3s are on `gh-pages` under `audio/voices/recorded/`. The live `*.github.io` page itself cannot be opened from the container (proxy) |
| Not verified | the mix by ear (no speakers in the container); playback on real iOS Safari / Android Chrome devices |


## V2 stream D: City Rumble modes, teams, respawning, scoring, main menu (branch `v2/d-modes`, from `ff67c52`)

Decisions WD1-WD12 in `DECISIONS.md` (section W). Frames: `docs/screenshots/v2-modes/`.

| Area | State |
| --- | --- |
| Main menu | City Rumble first (default), Classic Battle one tap away. Rumble: Survival / Deathmatch / Team Rumble cards, fighters 8-32 (team: N v N), 5 / 10 min (respawn modes), friendly fire (Team only), stage list (interim `RumbleStagePickerFallback`: every registered rumble arena; stream F's `RumbleStagePicker` takes the same props), bot preset + mixed roster. Classic: 2-4 players, crowd throws, all-bots level + per-bot level (interim `DifficultyPickerFallback`; stream B's `DifficultyPicker`), nine official arenas plus a "Test / experimental" strip once the sim exports `EXPERIMENTAL_ARENA_IDS`. Summary line under Play. 640x360 phone: Play visible without scrolling (e2e). |
| Rules | `matchRules` rebuilds the match settings for every start (no leaks: tested Team -> Classic -> Survival, rematch keeps the mode). Teams split by map side, human Green. |
| Respawn | Danger-free spawns (flames, predicted blasts incl. chains, stage hazards, vehicle routes, crowd throws), safe distance, own side, per-spawn cooldown, death-tile avoidance, open-floor fallback; 2.5 s protection that ends on placing a generator; life-based power reset. |
| Scoring | Sim stats only (kills / deaths / assists); Deathmatch ranking with shared places, team standings; results card per mode (Survival placing, Deathmatch K/D/A table, Team scoreboard). |
| HUD | Mode, team score bar, deathmatch rank, leaderboard K/D/A, respawn banner (no skip in respawn modes), spawn-protection tag, opponents-only "Nearby", feed survives respawns, ring hidden when the city never closes. |
| Bots | Opponents only as targets; with friendly fire: placement penalty for teammates in (chained) blasts, refused placements that trap a nearby teammate, no remote detonation / vehicle route onto teammates. |
| Render | Team jersey band + armbands on the rig bones, team-coloured ring / silhouette / name / minimap dot; blinking protection ring + body; death pose undone on respawn. |

| Check (2026-10-25, shared 4-core machine at load 15-31) | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint .` | clean |
| `tests/modes.test.ts` (22), `tests/modes-bots.test.ts` (5), `tests/app/modes-app.test.ts` (8) | pass |
| Full vitest without the `ordering-*` files | 818 / 823 on a loaded machine; the 5 failures were timeouts only. `rumble-ai` passed on a rerun; `behaviour` "most matches end" and `endgame-traps` "bots play full matches" pass with a long timeout (temporary copies) |
| `e2e/rumble.spec.ts`, desktop + phone (`WAHALA_MULTIPROCESS=1`) | 6 / 6 pass (menu + Team Rumble start + Classic, Deathmatch respawn flow, 32-fighter Survival) |
| Not done | Other streams' specs were not run (`e2e/helpers.startMatch` now picks Classic unless `game: 'rumble'`); `scripts/quick-shot.mjs` with `cityRumble` no longer has an arena card to click (Rumble starts from the Rumble setup) |
