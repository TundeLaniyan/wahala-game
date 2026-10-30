# Oshodi Transport Metropolis (Lagos arenas, build 1)

Branch `claude/wahala-lagos-arenas-v1`, from the release baseline `1e099f6` (`claude/wahala-stitch-uiux-v1`).
Source of truth for this arena: _WAHALA Canonical Lagos City Rumble Map Build Bible v2_ (30 October 2026),
section 3.2 and the shared map-build contract. Existing tested engine contracts and founder-approved decisions
stay above the research (authority order, bible section 1). **Ojuelegba is untouched** (its files, tests and
numbers are unchanged; only registries and tests that listed "the stages" gained this one).

The arena is a new City Rumble stage, `rumbleOshodiMetro` ("Oshodi Transport Metropolis"). The older
`rumbleOshodi` ("Oshodi Rush Hour", the default stage) is **not** touched or removed: see "Open decisions".

## 1. The plan, as implemented

### 1.1 District graph (45 x 33, not mirrored)

| Id (bible) | District | Tiles | Role |
| --- | --- | --- | --- |
| `interchangePlaza` (O1) | Interchange Plaza | x 9-21, y 10-22 | terminal wings, bus bays, canopy columns; the Survival core meets here |
| `skywalkQuarter` (O2) | Skywalk Quarter | x 9-44, y 0-9 | skywalk piers, stair tower, terminal annex, arcade, the north rail portal |
| `tradingStreets` (O3) | Trading Streets | x 0-8, y 0-32 | shopfronts, kiosks, stalls, container shops (the human starts here) |
| `expresswayJunction` (O4) | Expressway Junction | x 22-32, y 10-22 | box junction, kerb islands with direction signs, signal gantries |
| `railwayEdge` (O5) | Railway Edge | x 33-44, y 10-22 | two track lanes, level crossing, platforms, station, signal cabin |
| `cappaWorks` (O6) | Cappa Works + Recreation | x 9-44, y 23-32 | workshops, yard, generator house, the Cappa Ground pitch and pavilion |

Routes (bible 3.2): **direct** O3-O1-O4-O5 along the main road; **upper** O3-O2-O5 (Skywalk Quarter, down onto
the north platform); **lower** O3-O6-O5 (Cappa band, up onto the south platform through the x 38-40 passage);
plus cross-links O1-O2, O4-O2, O1-O6, O4-O6. No district needs a blast to be reached. All of it is data
(`ArenaDef.districts` / `districtLinks`) and tested.

### 1.2 Board and boundaries

45 x 33 (the proven Ojuelegba size: camera, quality ladder and 32-fighter budgets all hold). Solid perimeter on
the north and south (south = low lock-ups on the camera edge); open only at the main road's west and east mouths.

### 1.3 Spawns

32, explicit and tested (`SPAWNS` in the arena file): slot 0 (the human) in the south-west of the Trading
Streets, even slots west and odd slots east (Team Rumble splits by x), every district starts at least one fighter,
none on a trap, a hazard lane, beside a rail lane or within two steps of a supply crate, each with the radial-blast
way out. Spread: 8 / 16 / 32 starts are at least 12 / 8 / 4 tiles apart. Chosen offline by a seeded max-min search
(the stock farthest-point picker piled 17 fighters into the wide north band); the tests re-check every property.

### 1.4 Main route and flanks, traffic lanes and rail hazard lanes

- **Main road**: rows 15-18, west edge to east edge, four lanes, through the plaza and the junction and over the
  level crossing. Traffic waves (sweep, 2 s warning) and two bus-bay departures (RE-E3; north bay (15,13) and south
  bay (19,21), 2.5 s warning, a marked pull-out aisle each) run on it.
- **Rail**: two track lanes at x 36 (northbound) and x 37 (southbound), y 10-22. One lane at a time, 3.5 s warning,
  15 tiles/s, in and out of two **solid rail-bridge abutment blocks** (the north one is three tiles deep inside the
  Skywalk Quarter, the south one inside the Cappa band), so a railcar never crosses the upper and lower routes.
- **Attack vehicles**: eight lanes from the west and east edges along the main road only (a south road was
  removed: it split the Cappa band and broke the hazard-free lower route). Never a track lane.

### 1.5 Warning and refuge systems

| Hazard | Warning (all in the data / tests) | Refuge |
| --- | --- | --- |
| Traffic wave | lane burns down 2 s ahead, horn (existing) | pavements either side, any tile off the lane |
| Bus departure | 2.5 s, the sim holds the announcement while anyone on the lane could not walk off it | the aisle's flanks |
| Railcar | 3.5 s: lane burning down, **alternating red crossing lamps** at both lane ends and the crossing, `rail_bell` + `train_horn` (panned), a HUD alert (`TRAIN <arrow> - STAY OFF THE TRACK`, `TRAIN COMING - GET OFF THE TRACK!` when on it) | the shoulders (x 35, x 38), both platforms, the whole Skywalk Quarter and the Cappa band: **every track tile is one step from a track-free tile** (`laneEscapeSteps`, tested against the slowest walker) |

One lethal stage event at a time on this stage (`maxLethalEvents: 1`): the railcar never overlaps traffic or a bus
departure, and nothing runs once Wahala Crush starts or in the last 5 s. The hazard is rare (every 16-24 s), never
random under a player (a fixed lane, announced), and never closes every escape.

### 1.6 Permanent cover families (23, none a generic crate or pillar)

Interchange: terminal wings (lit glass band, name board), ticket hall, parked buses with route cards, bay shelters,
huge canopy columns. Skywalk: round piers with a flared head, landing and stair, stair tower. Junction: kerb islands
carrying direction signs, signal gantry feet with signal heads. Railway: rail-bridge abutments (arch openings, danger
boards, red lamp heads), platform posts, signal cabin, station concourse. Trading: shopfronts, kiosks, stalls,
container shops, occupied buildings (tall on the far perimeter), low lock-ups on the camera edge. Cappa: workshops,
skips, generator house, pavilion, a wall. Cover map `oshodiMetroCoverMap.ts` (a letter per `#`), builder
`oshodiMetroCover.ts`, boards `oshodiMetroSigns.ts` (all fictional names; Lagos place names only on bus route cards).
Crates are per-district clutter (five families); authored `x` barriers are barricades and tyre stacks in a painted
yellow-and-black frame.

### 1.7 Landmarks and verticality

North of the board (nothing over the playfield, camera side kept low): the terminal canopy and lit hall with the
INTERCHANGE fascia, the **elevated expressway** (box-girder deck on twin-column bents at 7.4 m, barriers, lamp
standards, a direction gantry), two covered **skywalk spans** on round piers, the commuter-rail **viaduct** leaving
the north portal and the station tower beside it, and a skyline of eight towers with window grids and red mast
lights. East: the Cappa Ground's floodlight masts and the forecourt canopy. The far perimeter frontage inside the
board steps between 4.4 and 7 m. Verticality is carried by the objects, not a flat yard.

### 1.8 Day and night

Same geometry, hazards and timings. `OSHODI_METRO_LOOK` is a hazy midday; `OSHODI_METRO_NIGHT_LOOK` is a floodlit
night (cold key light, sodium over the expressway, cool platform lamps). Selected with the **review flag
`?tod=night`** (`render/timeOfDay.ts`); default day. Night adds lamps and practical-light strength, lights more
tower windows, and is tested to light the ground at least as well as the approved Lekki Nightworks night.

### 1.9 Ambient traffic is not combat traffic

`render/env/oshodiMetroEnv.ts`: expressway deck traffic (both ways), the road mouths and the forecourt road. Muted
ambient kinds only, never on the board or a track lane, never wearing a warning colour, no okadas, trucks only on the
deck. The only vehicles that can hurt anyone are the stage sweeps and the summoned attack vehicles.

## 2. New engine surface (small, additive)

- `StageHazardStyle` gains `'train'` (a **sweep** on the track lanes; lethal footprint = its tile plus the one it is
  leaving, like every sweep). The railcar is drawn as one short car so the picture never claims more length than the
  hazard has (`views/hazardTrain.ts`).
- `DistrictDef.role` gains `'rail'` and `'works'`.
- `ArenaDef.futureBoss` (optional metadata, read by nothing): the reserved boss identity slot (section 5).
- Audio: three synthesised recipes (`train_horn`, `rail_bell`, `train_pass`); the HUD alert, voice mapping (the
  railcar is never voiced as a Danfo or Keke) and `README` slot table are updated.
- `render/timeOfDay.ts` and `ArenaArt.nightLook` (only this stage ships a night look).

Nothing else in the simulation changed: movement, radial blasts, generator combat, rewards, the stadium camera and
the quality ladder are as they were.

## 3. Validation

| Area | Test file |
| --- | --- |
| District connectivity, links, routes, spawns, supplies, attack lanes, hazard timing, safe escape, railcar in a running match, boss slot | `tests/rumble-oshodi-metro.test.ts` |
| Cover alignment, families, spill, camera edge, fade, crates, cover cost | `tests/render/oshodi-metro-cover.test.ts` |
| Environment validity, budgets per quality tier, ambient/combat separation, day/night routes | `tests/render/oshodi-metro-env.test.ts` |
| Day/night readability, `?tod`, floor painter, railcar model/name/alert/audio, menu card | `tests/render/oshodi-metro-art.test.ts` |
| Surroundings rules (nothing on the board, camera side low, 200+ meshes, people, vehicles) | `tests/render/rumble-stage-sets.test.ts` (this stage added) |
| Audio manifest compatibility (no new music or recording, default playlist), event routing | `tests/audio/assets.test.ts`, `tests/audio/engine.test.ts`, `tests/audio/pidginReactions.test.ts` |
| Desktop and phone in the real game | `e2e/oshodi-metro.spec.ts` |
| Registries that listed "the stages" | `tests/arenas.test.ts`, `tests/rumble-stages.test.ts`, `tests/living-env.test.ts`, `tests/render/obstacleStyles.test.ts` |

Evidence script: `scripts/oshodi-shots.mjs` (see its header). Bot batch:
`npm run simulate -- --arena rumbleOshodiMetro --game survival --players 32 --matches 4`.

### Verification run (container: 4 cores, software WebGL)

- `npx tsc --noEmit`, `npx eslint .`: clean. `npm run build`: ok.
- `npx vitest run`: **109 files, 1650 passed, 5 skipped, 0 failed** (baseline `1e099f6`: 106 files, 1607 passed). New: 4 test
  files (73 tests, of which the sim file has 34) plus additions to 7 existing test files and the `e2e/oshodi-metro.spec.ts` spec.
- Playwright (`WAHALA_MULTIPROCESS=1`, built bundle, desktop + phone projects): `e2e/oshodi-metro.spec.ts` 6 / 6
  passed; the existing `menu.spec.ts` and `rumble.spec.ts` (which see the extra stage card): 21 passed, 7 skipped
  (project-specific), 0 failed.
- Bots: 4 matches of 32 bots on the stage all finished (82 s on average; 1 hazard elimination in the batch).
- Real-browser frames: no page errors in any capture (desktop and phone, day and night).

### Measured cost (medium quality, same staging, software WebGL)

| Frame | Oshodi Metropolis | Ojuelegba (reference) |
| --- | --- | --- |
| Slot-0 spawn, bots idle (`?nobots`), draw calls / triangles | **662** / 2.39 M | 601 / 2.45 M |
| Slot-0 spawn, bots live, a single frame | 921 / 2.25 M | 716 / 2.21 M |

The board cover costs the same as Ojuelegba's (20 merged meshes, ~24 k triangles each). The idle comparison is the
cleaner one (+10% calls, -2% triangles); the live-bots frame is noisier (flames, generators and lights vary frame to
frame) and shows a larger gap, so the draw-call margin over Ojuelegba is **10-29%** and not yet optimised. No test
budget is breached (environment budgets per tier, cover meshes <= 90, triangles < 450 k). Cheap follow-ups if the
phone ladder needs headroom: merge the unique-material landmark boards and the skyline towers into one atlas
material, instance the repeated far-frontage blocks.

## 3a. Evidence (`docs/screenshots/oshodi-metropolis/`)

All are real frames of the running game (stage `rumbleOshodiMetro`, 16 competitors, seed 7, medium quality) made
by `scripts/oshodi-shots.mjs`; the railcar events in frames 3-5 are queued with the sim's own event shape so the
frames are reproducible (the natural schedule is random). Bots idle in the art frames so no blast is in shot.

| # | File | What it shows |
| --- | --- | --- |
| 1 | `1-desktop-establishing.jpg` | the whole interchange from above the plaza: skyline, terminal wings and bus bays, skywalk tower, main road and box junction, level crossing and station, works and Cappa Ground |
| 2 | `2-close-landmark-skywalk-tower.jpg`, `2b-close-far-frontage.jpg` | the skywalk piers and stair tower with their signs; the far frontage (glass, balcony and plaster blocks) under the terminal fascia |
| 3 | `3-rail-warning.jpg`, `3b-rail-running.jpg` | the railcar telegraphed (lane burning down, HUD alert with countdown, danger board on the portal) and running out of the portal block |
| 4 | `4-night-plaza.jpg`, `4b-night-rail-warning.jpg` | the same plaza and the same railcar warning under the night look |
| 5 | `5-mobile-rail-warning.jpg`, `5b-mobile-night-rail-warning.jpg` | phone landscape (844 x 390 at 2x): the warning with the alert, the lane and the touch controls, by day and by night |

Menu card: `public/previews/rumbleOshodiMetro.jpg` (day, from `scripts/rumble-v2-shots.mjs`).

## 4. Assumptions (the bible's "do not invent current conditions" rule)

- The street plan is **fictional and compressed**: the districts, links, portals, the platforms' position and the
  Cappa Ground's place are design inference ([DI]/[FA]), not a claim about today's Oshodi.
- The engine is **single-level**. The Skywalk Quarter is a track-free ground route with raised-deck art (piers,
  landings, a stair tower, spans beyond the north edge); it is not a second walkable floor. "Grade-separated" means
  the upper and lower routes never share a tile with a road or track lane (tested).
- Terminal 2-3 bridge and elevated links, terminal-to-rail walking connections, the Cappa geography and night
  lighting are listed unresolved in the bible (section 6): represented by fictional functional links.
- The rail line is shown as a commuter railcar with generic "OSHODI STATION / COMMUTER RAIL" wording; no operator
  name, logo or livery is copied. Business names on shopfronts are fictional.
- Sound: three synthesised effects. No recordings, no music, no voice added (the founder policy stands). Written
  descriptions in the bible are not recordings.

## 5. Future boss slot (reserved only, not implemented)

`ArenaDef.futureBoss` on this arena: `{ status: 'reserved', area: 'Oshodi', brief: ... }`: an original,
legally distinct transport-network character, loosely inspired by a locally recognised Oshodi icon to be chosen after
**documented local research and later approval**. No inspiration has been selected. No real name, face, voice,
clothing, biography, catchphrase or branding may be used. Nothing reads the field; no boss exists in the simulation,
the renderer or the menus (tested).

## 6. Open decisions for founder review

1. **Replace or keep Oshodi Rush Hour?** `rumbleOshodi` (the 41 x 31 mirrored stage, default of the Rumble setup and
   of many tests) is untouched. Two Oshodi stages now appear in the picker. Ojuelegba's precedent was to replace the
   old layout in place; that would touch the default stage and its tests, so it is left to you.
2. **Music**: the stage plays the existing default playlist. A signature track needs a founder assignment (the five
   assigned tracks are one-per-stage by test).
3. **Voice zones**: `voices.json` lists the arenas of the `bus_park` and `market` zones (generated from the founder
   manifest). The new arena is in neither, so zone-specific voice lines do not play here. Adding it means a founder
   manifest change and a re-import (`tools/audio/voices/import_voices.py`), not done here.
4. **Night look in the menu**: `?tod=night` is a review flag. A player-facing day/night switch (or a night preview
   card) is not built.
5. **Menu card**: a day preview picture is generated (`public/previews/rumbleOshodiMetro.jpg`); there is no night
   preview in the menu and the card text does not mention the night look (it is not player-selectable).
6. **Local review** (bible section 6): a Lagos-based reviewer should accept / revise / reject each district against
   photos before the geography is called final.
