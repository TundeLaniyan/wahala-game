# WAHALA! - City Rumble roadmap: the five remaining Lagos environments and a future campaign

Written with City Rumble Evolution V1 (`RUMBLE_EVOLUTION.md`). Nothing in this file is implemented yet; it says
how the systems built in V1 carry the next arenas and a single-player campaign without a second engine.

## 1. What every new Rumble arena reuses (no new engine work)

| Need | V1 system | An arena supplies |
| --- | --- | --- |
| Layout, cover, shortcuts | `ArenaDef.layout` chars: `#` permanent, `x` authored barrier (breach), `$` supply crate, `_` kept-clear floor, `=` road | the grid (non-mirrored allowed, `mirrorSoftBlocks: false`) |
| Districts and connectivity | `ArenaDef.districts` / `districtLinks` (`open` / `chokepoint` / `breach`) | named rectangles + links; the district test template (`tests/rumble-ojuelegba.test.ts`) gives >= 2 exits per district, reachability, breach checks |
| Radial combat | `blastMode: 'radial'` via the Rumble rulesets; walls / crates shadow blasts | nothing: cover is the layout |
| Opening pace | supply crates `$` (finite basic upgrades) + two starting generators | 4-8 supply crates placed for a lively opening |
| Summoned attacks | `config.vehicles.lanes` (border road mouths) | the road mouths Danfo / taxi / Keke may use |
| Environmental hazards | `stageHazards` (sweep incl. the Danfo departure, strike, push, drop, teleport) with the fairness guards in `stage.ts` | routes / zones / schedules as data |
| Living surroundings | `StageEnvironment` (`render/env`): ambient traffic routes, protected crowd zones, NPC reactions, light and audio identity, occlusion hints, per-quality budgets | an env file like `render/env/ojuelegbaEnv.ts` |
| Look | per-arena `render/arenas/<name>Art.ts`: look, set, floor, render-only cover map (grouped `#` tiles drawn as one object) | the art module |
| Bots | radial-aware danger maps, cover sense, supply-crate interest | nothing (they read `observe()`) |

Rules stay generic: an arena never gets an `if (arenaId === ...)` in rules code; its differences are config overrides
and data.

## 2. The five remaining environments (order from the research pack)

Each is a separate arena with its own districts, built and reviewed like Ojuelegba: greybox layout + district tests
first, then readability on the smallest phone, then one signalled hazard, then presentation, bots and performance.
The current V2 stages for Oshodi, Lagos Island, Apapa and Lekki stay playable until their multi-district successors
replace them in place (same id, music and menu card). District plans below are the primary research's fictional
compositions (`RUMBLE_RESEARCH_DIGEST.md` section 3); every link list is "always open" unless marked as a breach.

1. **Lagos Island Markets** (successor of `rumbleLagosIsland`; the research's second systems test: destruction that
   reorganises a route network). Districts: textile street, Idumota-style junction (the exposed vehicle crossing
   with two refuge pockets), wholesale loading court, covered shopping passage (foot-only), quieter neighbourhood
   edge. Links A-B, B-C, C-E, E-A, A-D, D-C; breach D-E through a shuttered empty stock passage; the outer loop
   survives every break state. Cultural review before art lock: no route through palace grounds or a mosque, Eyo
   never an enemy / costume / destructible, no fire hazard modelled on a real market fire. Watch: corridors are
   radial-blast death traps - measure self-eliminations and widen where fighters die to their own blasts.
2. **Apapa Docks** (successor of `rumbleApapa`). Districts: gate and inspection apron, container canyon (two unequal
   blocks), L-shaped warehouse apron, crane transfer court, quayside service walk. Links A-B, B-D, D-C, C-A, C-E, E-B;
   breach A-D via marked empty packing crates; containers are permanent architecture. Hazards: a terminal-tractor
   crossing first, then a fictional marked container lowering into an EMPTY slot (delayed while occupied) - the
   only place the container idea is allowed. Attack vehicles only on the wide gate-canyon-court-warehouse loop.
3. **Oshodi Interchange** (successor of `rumbleOshodi`). Districts: terminal forecourt, bus loading apron, concourse
   spine (contiguous ticket-booth islands), transfer street (the strongest vehicle corridor), service court. Links
   A-C, A-D, C-B, B-D, C-E, E-A; breach E-B through a pallet barrier. Hazard: a bus departure lane after amber lights,
   never moving while its warning is hidden behind a parked bus. The skywalk is a cutaway landmark, not a layer.
4. **Surulere Stadium District** (new arena, `rumbleSurulere`). See section 3: these requirements are locked.
5. **Lekki Roadworks** (successor of `rumbleLekkiNight`; the specialised night / traffic stage once warning
   readability is proven in daylight). Districts: contraflow carriageway, excavated work strip with visible plate
   crossings, materials yard, frontage service lane, junction crossover. Links A-E, E-D, D-B, B-A, D-C, C-E; breach
   B-C through yard hoarding. Hazard: a slow roller on one marked lane; trenches are permanent visible no-go
   footprints. The env budget must keep the work lamps on `q=low`.

## 3. Surulere Stadium District - founder lock (future milestone)

Ojuelegba Underbridge and Surulere Stadium District are TWO SEPARATE arenas. Surulere is not merged into Ojuelegba,
and an exterior stadium backdrop is not an acceptable substitute. Mandatory:

- A large **enterable football stadium** with a **playable pitch** (open `_` ground: no random crates, a few `x`
  barriers such as goal frames / advertising boards that can be blasted away).
- **Multiple entrances and exits** (at least four gates / tunnels) so generators can be placed tactically at the
  mouths and every fighter has an escape: the district test must show >= 2 exits from the pitch and from each stand.
- **Stands, tunnels and perimeter concourses** as distinct districts: stand tiers are architecture beside the pitch
  (one playable elevation, like the Ojuelegba flyover), tunnels are chokepoint links, the concourse rings the bowl.
- **Surrounding neighbourhood streets** outside the stadium (street traders, a bus stop, a car park) as their own
  districts, with traffic sweeps on the outer roads.
- **Distinct combat zones inside and outside**, interconnected so stadium combat and street combat happen in the same
  match; spawns spread over both.
- **No repetitive checkerboard layout** anywhere.
- The research's lighter option (a stadium bowl as non-playable backdrop with a gate plaza, merchandise lane,
  community court and service crescent outside) is overruled by the founder: those exterior districts are welcome
  as the surrounding streets, but the pitch and stands must be playable ground too.
- Engineering notes: the bowl needs occlusion handling (stand roofs fade near the followed fighter); the survival
  core should be the pitch centre; crowd zones in the upper stands are protected off-board-equivalent areas
  (non-walkable `#` tiles drawn as seating), so NPC fans can react to blasts without ever being sim entities.
- True stacked-floor combat (fighting in the upper tiers) waits until the engine supports collision, AI and blast
  rules across levels; until then upper tiers are scenery.

## 4. A future single-player campaign on the same engine

Not implemented. The campaign reuses `createGame` / `tick` / the bots exactly as City Rumble does; a campaign level
is an arena + ruleset + script, not new rules code.

- **Levels as data:** `CampaignLevel = { arenaId, game: 'survival' | 'deathmatch' | 'objective', roster, objectives,
  script }`. Arenas are the Rumble districts (Ojuelegba first), so every level inherits radial combat, cover,
  supply crates, hazards and the living environment.
- **Enemies:** computer-controlled fighters are ordinary bot seats with an `AiProfile` (the seven difficulty levels
  plus campaign profiles: guards that hold a district, runners that flee to a link, ambushers that wait in blast
  shadows - all built on the existing goal / danger / tactics layers, still seeing only `observe()`).
- **Fictional Agbero-inspired antagonists:** a park-tout crew that "controls" the Danfo Park in the story; their
  leaders are boss fighters: a normal fighter with extra Armour plates, a fixed signature vehicle and a scripted
  phase change (e.g. at half armour the boss calls a Danfo departure on the lane). Fictional names, no real people,
  unions or groups, no glorification of extortion: the player is breaking the crew's hold on the park.
- **Objectives:** a small pure `sim/systems/objectives.ts` evaluated each tick from state (reach a district, destroy
  marked barriers, defend a supply crate, survive a crush, eliminate the boss), ending the match through the
  existing `match.ts` result path. Objective markers are HUD-rail notices, never text over the board.
- **Progression:** between levels only (unlocked arenas, cosmetic fighter styles, Academy-style briefings from
  `src/tutorial`); in-match power still comes from eliminations and supply crates, so balance measured for Rumble
  carries over.
- **Testing:** each level gets a headless completion test (a scripted or bot player can finish it; the boss can be
  beaten; no softlock), the same pattern as `tests/rumble-stages.test.ts`.
