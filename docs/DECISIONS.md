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

## Visual pass v3 (branch `claude/wahala-visual-v3`) - presentation only, no gameplay rules or tuning changed

| # | Decision | Where |
| --- | --- | --- |
| V1 | Camera pitch 58 -> 51 degrees, FOV 36 -> 44 (56 portrait); the look-at point is re-centred for each fitted distance so the perspective-shrunk far edge and the 1.5 m far wall top fill the HUD-free band. Picking still ray-casts this camera onto the floor; a unit test round-trips every tile on desktop, landscape phone and portrait. | `render/cameraRig.ts`, `tests/render/camera.test.ts` |
| V2 | Permanent vs destructible is separated by value, height and hue: pillars 1.14 m pale precast concrete with a blue/yellow foot band; walls 1.05 m with pilasters (stepping down to 0.4 on the camera side so no tile is hidden); crates warm light pine at 0.74 m, barricades and tyres; soft-block variants are weighted (crates > barricades/tyres > sacks > market goods) instead of uniformly mixed. Collision and tile positions are untouched. | `tools/assets/env_pillars.py`, `env_walls.py`, `env_soft.py`, `render/assets/props.ts` |
| V3 | Taller pillars can hide a player in the row behind them, so occluded parts of every player are drawn as a slot-coloured silhouette (stencil-masked so limbs never tint their own body). Generator countdown numbers already draw on top. | `render/assets/xray.ts` |
| V4 | Characters get stylised game proportions (thicker limbs, broader chest, 1.2x head about the chin, chunkier trainers) and are drawn 1.62 tiles tall (was 1.5); faces have fuller jaws, broad noses, fuller lips and dark lid lines; a warm Fresnel rim separates them from the floor. | `tools/assets/chargen.py`, `build_characters.py`, `render/assets/rim.ts`, `rigged.ts` |
| V5 | The Okada is drawn 1.55x (wheels and front end stick out beyond the rider), in Bajaj red rather than danfo yellow, with the rider seated on the seat, a faint golden Fresnel shield bubble, an OKADA badge, speed dust, a mount pop and a dismount hop. These read `Player.mounted` only; the one-hit rule is unchanged. | `render/views/PlayerViews.ts`, `okadaShield.ts`, `tools/assets/veh_okada.py` |
| V6 | Colour grade is folded into tone mapping (`CustomToneMapping`: ACES + warm balance + saturation + gentle S-curve) instead of a post-processing pass, so it costs nothing on phones. No SSAO pass: depth cues come from stronger sun shadows, baked AO in the atlases and the grade. | `render/grading.ts`, `render/lighting.ts` |
| V7 | Explosions light the scene through a fixed pool of point lights (0/1/3 by quality; the count never changes during a match, so no shader recompiles); flames have an alpha-blended orange body plus an additive hot core so they keep their mass on the pale floor. Vehicles trail additive speed streaks. | `render/views/FlameViews.ts`, `VehicleViews.ts`, `render/quality.ts` |
| V8 | The crowd is a street, not a stadium: watchers (calm poses flipping to reactions with match excitement), facing conversation pairs and street walkers (two-frame stride), 20 outfits incl. ankara, wrappers, kaftan + fila and basin carriers. Each pose is an InstancedMesh refilled per frame with only the people in that pose. 70 / 170 / 320 people by quality; ~2.3k triangles each after vertex-cluster decimation. Visual only (crowd sound is not part of this pass). | `tools/assets/crowd_lib.py`, `build_crowd.py`, `render/assets/crowd.ts` |
| V9 | Model folder grew from 14.6 MB to ~16.0 MB (crowd pose pairs, taller wall/pillar atlases at reduced JPEG quality), slightly over the 15 MB target in the pipeline doc; accepted for now, the danfo/taxi/keke atlases are the next place to trim. | `src/assets/models` |
