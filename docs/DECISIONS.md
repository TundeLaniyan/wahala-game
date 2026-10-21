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
- **Floor traps** (designated trap arena only; was Lekki Roadworks, now Balogun Market, see E2): pothole = brief stumble; oil = slide 2 tiles. Never lethal.
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

## Session E: vehicles and arenas (branch `claude/wahala-vehicles-arenas-v4`) - no rules or tuning numbers changed

| # | Decision | Where |
| --- | --- | --- |
| E1 | **Audit:** the game had two selectable arenas, but "Lekki Roadworks" was the Danfo Bus Park layout re-exported with a hazard grid and drawn with exactly the same scene, so players saw the same stage twice. It is retired as a separate arena. | `sim/arenas/` |
| E2 | **Balogun Market** is a new 15x11 arena with its own layout: two-tile stall counters in rows 1/9, single stall posts in rows 3/7, side counters and a central market square (34 concrete tiles vs 35 in the bus park; only 14 concrete positions are shared, 41 tiles differ). Full lanes on rows 0/2/8/10 and columns 0/7/14 keep every vehicle usable; spawns keep a guaranteed escape. Because the Bible locks stage hazards to *specially designed* arenas, the market is now the one trap arena (palm-oil spills + broken paving with the "Floor traps" option); the bus park has none. A stored `lekkiRoadworks` setting migrates to the market with traps on. | `sim/arenas/balogunMarket.ts`, `app/settings.ts` |
| E3 | Every arena must pass `validateArena` (rectangular, mirror-symmetric when soft blocks are mirrored, one connected open area, a cleared escape from each spawn's own first blast, >= 12 legal straight vehicle lanes, hazards only on open floor). Tested for both arenas together with bots finishing Classic and Crush matches, vehicle launches by bots, and no duplicate layouts. 80-match batches: bus park 37.7 s average, 0 timeouts; market 41.3 s, 3 timeouts in 80, Medium/Hard self-kill rates within 1-6 points of the bus park. | `sim/arenas/validate.ts`, `tests/arenas.test.ts` |
| E4 | Arena look is data: `render/themes/` gives each arena id a theme (floor texture set, permanent and destructible models with weights, walls, sky/fog, bunting, signboard, `dress()` for the surroundings). Market permanent tiles in a straight run draw as joined trading counters (turned along the run, 1.18x tall so they stand above the goods); isolated ones as stall posts. The title-menu demo previews the selected arena. | `render/themes/`, `render/views/ArenaView.ts`, `app/session.ts` |
| E5 | New generated assets (same numpy/Pillow pipeline): market floor (terracotta interlock pavers), stall post, counter, four market goods, market walls, stall, parasol, fabric rack, two market buildings; bus-terminal shelter, jersey barrier, route sign, loading-bay booth; a 1.6k-triangle parked danfo used for the ~14 background buses instead of the full 9.4k model. | `tools/assets/env_market.py`, `env_busterminal.py`, `tex_market.py`, `veh_parked.py` |
| E6 | Danfo, taxi and Keke rebuilt: clean untextured Lagos yellow (no rust), rounder danfo nose and continuous black window band with pinstriped stripe, a lower three-box taxi with a chequered band, a Keke with steering fork, windscreen, canopy and benches, new dished wheels. 9.4k / 8.5k / 8.9k triangles (over the 8k doc budget; three are on screen at most). At runtime the `paint` material becomes a clear-coat `MeshPhysicalMaterial` and glass/chrome reflect the environment more strongly. Routes, hitboxes, speeds and damage are untouched. | `tools/assets/veh_*.py`, `render/assets/vehicles.ts` |
| E7 | Sharpness: anisotropic filtering on every model texture (glTF defaults to none) and 16x on the floor; High renders at >= 1.5x resolution even on 1x displays (supersampling on top of MSAA); Medium's DPR cap 1.5 -> 1.75 for phones; Auto quality now steps resolution down (to 0.8x) before dropping a whole quality level; the sun's shadow frustum is fitted to the arena (about 1.36x more shadow texels on the field) with a smaller PCF radius. No sharpening filter or extra bloom was added. | `render/assets/library.ts`, `render/quality.ts`, `render/GameRenderer.ts`, `render/lighting.ts` |
| E8 | Model folder grows to ~19 MB (+4.5 MB market/terminal assets incl. a 0.84 MB floor set and two ~0.5 MB buildings). Over the 15 MB target; the building atlases and vehicle decal/tyre textures are the places to trim. | `src/assets/models` |
