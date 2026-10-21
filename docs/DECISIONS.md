# WAHALA! decisions log

Gameplay and tuning decisions taken during implementation, with the reason. The Game Design Bible stays authoritative; entries here are either the founder's approved D1-D16 defaults or implementation choices where the Bible left a gap. Update this file whenever playtesting changes a number or a rule.

## Approved defaults (D1-D16, plus clarifications)

| # | Decision | Where |
| --- | --- | --- |
| D1 | Players pass through each other; generators, concrete and soft blocks block. Prevents corridor deadlocks and body-block griefing. | `systems/stepping.ts` |
| D2 | Remote Starter affects generators placed **after** pickup. Unused remote generators auto-detonate after 20 s (failsafe). One button detonates all of the owner's remote generators. | `systems/generators.ts`, `config.generator.remoteFailsafeTicks` |
| D3 | Vehicle damage = number of **unique flame tiles of one chain reaction that lie on the vehicle's route**, summed across separate chains in one journey (never per-bomb counting, no double counting inside a chain). Keke 4, taxi 6, Danfo 9. Every damaging encounter slows the vehicle (x1.8 for 1.5 s). | `systems/vehicles.ts` `applyBlastExposure`, `config.vehicles` |
| D4 | A Kill-Switched generator frees its owner's capacity slot. | `queries.activeGeneratorCount` |
| D5 | Disarmed generators can still be kicked / punched / carried and still explode from flame, chains and vehicles. Cleanup: a disabled dud disappears after 25 s without exploding. | `generators.updateGeneratorTimers` |
| D6 | Vehicle-entry selection is real-time: the world keeps running, the selector stands still, **8 s** window; cancelling or timing out keeps the voucher. | `systems/vehicles.ts`, `app/vehicleEntry.ts` |
| D7 | Keke stops at its 2nd player hit, taxi at its 1st, Danfo never (all stop at concrete). Taxi breaks at most 2 soft blocks, Keke 1, Danfo any number. | `config.vehicles.specs` |
| D8 | **Any** border tile with a legal route is selectable (28 entries on Danfo Bus Park, corners count once per side). 1.2 s warning (lane + gate lamps + horn) before the vehicle moves. Keke: choose entry, then the turn tile + side. | `systems/entries.ts` |
| D9 | Okada absorbs **all** lethal hits of the tick it breaks in, then ignores those same events (until their flames expire / for 0.75 s for vehicles). A separate later event kills the rider. | `systems/lethality.ts` |
| D10 | Flames destroy floor pickups, except the one uncovered by that same blast. | `systems/pickups.ts` |
| D11 | Contextual controls: kick is automatic on walking into a generator; one context button (carry/drop/punch/throw), skill, detonate (only with Remote), disarm (only with charges), vehicle (only with a voucher). | `ui/TouchControls.tsx` |
| D12 | Push and Shove both move a rival one tile (shove has a shorter cooldown 3 s vs 4 s); Daze freezes for 1 s then 2 s of immunity. | `systems/skills.ts` |
| D13 | "Skip to results" fast-forwards the real simulation (bots only) to its true outcome. | `MatchController.skipToResults` |
| D14 | Arena 15 x 11 tiles, pillars on odd/odd tiles, 4-fold mirrored soft blocks. | `arenas/danfoBusPark.ts` |
| D15 | Generic "Yellow Cab" branding for the taxi. | `data/vehicles.ts` |
| D16 | Wahala Crush, crowd throws and floor traps ship **off by default**. | `app/settings.ts` |

## Implementation choices (not in the Bible)

- **Movement model:** a step commits its destination tile immediately; the renderer interpolates. One step = 10 ticks (6 tiles/s). Roller Skates 9/8/7, Okada -2 ticks, slow curse +4.
- **Flame behaviour:** a neighbouring generator absorbs an arm (and chains); soft blocks are removed only after the whole chain resolves so simultaneous blasts never disagree about what blocks what. Flame lifetime 0.6 s.
- **Chain events:** one chain reaction = one `BlastEvent` / event id; separate triggers in one tick that do not chain are separate events.
- **Spawn safety:** each spawn clears an L of three tiles plus the two corner-turn tiles (`(2,1)` and `(1,2)` relative to the corner) so a player can always escape their own first blast. Added after the e2e suite showed a corner could be sealed by random soft blocks.
- **Carry rule:** +1 s only on the first pickup of a **timed** generator; picking up remote/disabled generators gives nothing. Carried generators tick, can explode in hand, and are thrown if the carrier owns Gloves.
- **Jump Sneakers** hop exactly one generator (2 s cooldown). **Hot Fuel** is a one-generator boost: its arms burn through the first soft block of each arm.
- **Curses:** slow, reversed controls, weak fire (range 1) for 8 s. Pickup weights are in `config.pickups.weights`.
- **Death loot:** up to 2 held upgrades dropped on the nearest empty tiles (BFS), never into fire.
- **Wahala Crush:** starts at 0:40, one outer-ring tile every 0.8 s clockwise, 1.2 s telegraph. An Okada rider under a landing block is shoved to the nearest free tile (Okada consumed). Crush kills inside one tick can draw.
- **Crowd throws:** first at 0:25, then every 9-16 s, 2 s telegraph at a fixed tile (dodgeable). Bottle dazes; rare firecracker is lethal on its tile and the four around it (and sets generators off). Okada absorbs it.
- **Floor traps** (Lekki Roadworks only): pothole = brief stumble; oil = slide 2 tiles. Never lethal.
- **Pause policy:** auto-pause when the tab is hidden; Esc/P toggles; pausing is blocked after the match ends.
- **Pidgin captions** are original lines written for this project; a native-speaker review is recommended before shipping.

## Presentation overhaul (branch `claude/presentation-overhaul`) - no gameplay rules changed

| # | Decision | Where |
| --- | --- | --- |
| P1 | Assets are **generated from code** (numpy/scipy/Pillow -> glTF), not downloaded: the sandbox network blocks every CC0/asset host (Poly Haven, Quaternius, Kenney, Sketchfab, Mixamo, Freesound ...) and Blender's wheel is impractical. Provenance is therefore clean (all original), quality is bounded by what procedural modelling can do; see the overhaul report for honest limits. | `tools/assets/`, `docs/ASSET_PIPELINE.md` |
| P2 | Characters are rigged glTF skinned meshes (22 bones, 16 clips) driven by an `AnimationMixer` (`RiggedCharacter`); clip choice is a pure function of existing sim state (move/carry/mounted/dazed/dead) plus one-shots from `SimEvent`s. The procedural primitive models remain only as a load-failure fallback. | `render/assets/rigged.ts`, `render/views/PlayerViews.ts` |
| P3 | All models load through one `AssetLibrary` (Vite glob of `src/assets/models/**.glb`, base-path safe); the title screen shows load progress and the menu's live demo starts only when the cast is ready. | `render/assets/library.ts`, `app/session.ts` |
| P4 | HUD / title portraits are rendered from the 3D models (throw-away WebGL context) instead of drawn faces. | `render/portraits.ts`, `assets/portraits.ts` |
| P5 | A bots-only "attract" match runs behind the title menu (not on the `low` quality profile, never with `?nobots` / `?noattract`); it is a normal sim instance with the same code path and never touches the player's match. | `app/AttractController.ts` |
| P6 | Music is removed. The audio engine now produces SFX, engine/vehicle loops, a layered crowd ambience and event-driven crowd reactions (all synthesised; **no recorded Nigerian crowd or music is bundled and none is claimed**). Recorded files can be dropped into `public/audio/` to override any slot. | `src/audio/` |

## Lagos audio (branch `claude/wahala-lagos-audio`) - no gameplay rules changed

| # | Decision | Where |
| --- | --- | --- |
| A1 | Music is **pre-rendered audio files** (Ogg Vorbis + MP3 fallback) generated offline from original note data, not a runtime oscillator sequence. Supersedes P6 ("music is removed"). Loops are gapless by construction (wrap-around mixing) and the player loops `[0, manifest samples)`. | `tools/audiogen/`, `src/audio/music.ts`, `public/audio/music/` |
| A2 | Four independent persistent volumes (master 80, music 45, Lagos ambience and voices 65, effects 85) in their own store `wahala.audio.v1`; mute stays in `GameSettings.muted` (shared with the HUD button). The engine follows the store itself; the legacy `setVolumes()` is ignored while a store is active so stale callers cannot override saved choices. The old `musicVolume`/`sfxVolume` fields in `GameSettings` are now unused. | `src/audio/prefs.ts`, `src/ui/AudioSettings.tsx` |
| A3 | The crowd is a **street crowd, not a stadium**: `roar` and `cheerBig` reactions are demoted to quiet cheers; the babble beds sit under the speech and duck while a line is spoken. | `reactions.ts` (street mode), `ambience.ts`, `buses.ts` |
| A4 | **Spoken Pidgin is synthetic placeholder speech**, flagged as such in the data (`voices.json` `synthetic: true`), the settings panel and the docs. Reason: no Nigerian voice, no Pidgin/Yoruba/Igbo TTS and no recording host was reachable and paid services were excluded. Kokoro-82M (Apache-2.0, offline) reads the Pidgin spelling through its English front end (A/B: 0.88 vs 0.72 for hand-written IPA, Whisper round-trip proxy). Real recordings replace any line through `public/audio/voices/recorded.json` (licence statement required). | `tools/audiogen/build_voices.py`, `src/audio/pidgin.ts`, `docs/AUDIO.md` |
| A5 | Crowd speech pacing: category cooldowns of 8-30 s, at least 4.5 s between unforced reaction lines, one reaction voice at a time, shuffle-bag line choice with a 40 s recent-line memory, speaker rotation, 0.6 s trigger de-duplication, ambient scenes held back 2.5 s after any reaction. A first real-browser run produced a reaction every ~3 s, which was too chatty. | `src/audio/pidgin.ts` |
| A6 | Levels were set from measurements of a real-Chromium recording of the engine output (loudness per layer, speech-to-text round trip of the lines inside the mix): first version had spoken lines only 0-2 dB above the babble bed (inaudible), so the bed was lowered, lines raised, presence-EQ'd and the beds/music duck for speech. Still **not judged by ear**. | `tools/audio/browserSmoke.mjs` |

