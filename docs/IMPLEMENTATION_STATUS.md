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
10. Wahala Crush pacing (starts 0:40, one tile / 0.8 s) and crowd-throw frequency.

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

## Lagos audio (branch `claude/wahala-lagos-audio`)

Details and honest limits: `docs/AUDIO.md`. No simulation, AI, input or render code changed.

- **Music:** original Afrobeats-inspired loops (`match_loop` 32 bars at 108 BPM, `menu_loop`, `match_tension` stem) and win/lose/draw stings, generated by `tools/audiogen/` and loaded by `src/audio/music.ts` (menu music after the first gesture, crossfade to the match loop, tension stem for the last 30 s, sting on the result). **Not listened to.**
- **Ambience:** three generated Lagos beds (market babble, bus park, livelier chatter) via the sample slots, plus scheduled street conversations and shouted calls; stadium roars removed.
- **Spoken Pidgin:** 134 lines (reactions + conversations + conductor/hawker calls), 20 synthetic voices. **Synthetic placeholders, not Nigerian speakers, not authentic, not assessed by a human.** Slots for real recordings and a recording script are in place.
- **Settings:** master / music / Lagos ambience and voices / effects sliders, voices switch, reset; persistent; on the title screen and the pause menu (`src/ui/AudioSettings.tsx`, minimal edits to `TitleScreen.tsx`, `Overlays.tsx`, `session.ts`).
- **Not verified:** how any of it sounds; Safari/iOS (Ogg Vorbis is not decoded there, so the MP3 fallback is used; its gapless looping relies on the manifest loop points); real-device memory use (about 45 MB of decoded speech plus music buffers).
- **Verification run:** `npm run check` (typecheck, lint, 388 unit tests including 173 audio tests, production build) passes; `npx playwright test` 36 passed, 4 skipped by design (desktop + landscape phone), including the new audio spec (no AudioContext before the first gesture, menu music after it, match music at match start, four sliders with 80/45/65/85 defaults persisted across reload, mute remembered, panel on the pause menu). A real-Chromium recording of a four-bot match through the real engine and the shipped files ran without audio errors (`tools/audio/browserSmoke.mjs`).

