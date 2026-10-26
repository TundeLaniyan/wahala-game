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

## 2. The five remaining environments (in suggested order)

Each is a separate arena with its own districts, built and reviewed like Ojuelegba (layout + tests first, then
presentation, then bots and performance). The current V2 stages for Oshodi, Lagos Island, Apapa and Lekki stay
playable until their multi-district successors replace them in place (same id, music and menu card).

1. **Oshodi Interchange** (successor of `rumbleOshodi`). Districts: the BRT corridor under the expressway, the
   bus-park blocks, the market under the bridge, the footbridge approaches, the slip road. Hazards: the existing long
   traffic routes plus a BRT bus departure. Identity: midday glare, exhaust haze. Watch: long open lanes favour the
   radial blast less than corners do - add breach barriers across the widest lanes.
2. **Lagos Island Markets** (successor of `rumbleLagosIsland`). Districts: stall corridors, two plazas, the textile
   arcade, the waterside loading street, the central market square kept as open `_` ground. Hazards: falling goods, cart pushes. Watch: corridors are radial-blast
   death traps - measure self-eliminations and widen where bots and humans die to their own blasts.
3. **Apapa Docks** (successor of `rumbleApapa`). Districts: container stacks, the quay apron, the transit sheds, the
   truck holding road, the gate. Hazards: crane drops, truck sweeps. Opportunity: stacked containers as two-tile
   permanent cover with breachable container doors (`x`).
4. **Lekki Roadworks** (successor of `rumbleLekkiNight`). Districts: the dug-out site, scaffold mazes, the haul road,
   the site compound, the finished carriageway. Hazards: debris strikes, excavator zones. Night light pockets carry
   readability: the env budget must keep the work lamps on `q=low`.
5. **Surulere Stadium District** (new arena, `rumbleSurulere`). See section 3: these requirements are locked.

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
