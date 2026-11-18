# Campaign sectors and enemy AI

Branch family `claude/wahala-csa-*` (base `46f0781` + contract `6359813`). Each worker of this pass keeps its own section under its own heading; the lead merges them.

## District-sector architecture

Branch `claude/wahala-csa-sectors`. Decisions DS1-DS10 (`docs/DECISIONS.md`). Not merged, not deployed.

### Why

A field mission used to be played on its district's whole City Rumble map (41 x 31 to 75 x 39 tiles) although its route sat in a corner: a lot of map to wander, a follow camera free to show the whole city, and a scene the size of the district built for a route that uses a tenth of it. A field mission now plays in a **sector**: a recognisable part of the district, closed by real street objects, with the camera, the minimap and the renderer kept to it.

### How it is built (option c: keep the district, stamp a sector)

The district keeps its full layout (City Rumble, the boss missions and multiplayer use it unchanged). The sector is data plus a one-time stamp in the simulation:

| Piece | File | What |
| --- | --- | --- |
| Data | `src/sim/mission/sectors.ts` | `MissionSectorDef { id, districtId, name, area, rects: [x0, y0, x1, y1][] (inclusive; two make an L), barricades: { id, kind: 'bus' \| 'barrier' \| 'gate' \| 'rail' \| 'checkpoint', tiles }[], gates?: { ...barricade, opensAfterLeg }[], viewMargin, hazards: 'inside' \| 'none' }`, one per field mission (`FieldMissionDef.sectorId`) |
| Stamp | `src/sim/mission/sector.ts` `applySector` | called by `createGame` right after `placeSupplies` and before the floor hazards, the endgame traps and `createStage`: every barricade / closed gate tile becomes `Tile.Hard`, its hidden pickup and supply entry are dropped, and `GameState.sector = { id, rects, blocked, gates, clip, viewMargin, hazards }` is set. It draws no random number (tested: the RNG state after creation is the unstamped one) |
| Lookup | `missionSectorOf(spec)` | a field mission's `sectorId`, unless `MissionSpec.noSector` (the `?nosector` debug flag). Boss missions get none in this pass; a `MissionDef.sectorId` read here is all a boss sector needs later |
| Questions | `inSector(state, x, y)` | `true` without a sector, so every other match pays one property read |

**No sector, no change.** Without a sector the `sector` key does not exist: City Rumble, Classic, raids, the boss missions and multiplayer states (and their digests, `tests/enemy-fairness.test.ts`) are byte-identical; `observe()` adds `sector` only when there is one.

### What the core systems do inside a sector

| System | Rule | Where |
| --- | --- | --- |
| Stage hazards | policy `inside`: a scheduled hazard stays on only when every tile of every route (sweep) or zone (strike, push) lies inside the rects; a strike on a player and a drop always fit; `none` turns them all off. A route half inside would stop at a barricade, so it is off rather than trimmed. The arenas' own rules (Oshodi's rail lanes, warnings, fairness) are untouched: in these eleven sectors every sweep is off | `state.ts` `hazardFitsSector` |
| Drops | fallen goods land on in-sector tiles only | `systems/stage.ts` |
| Manholes | a trapdoor whose far end lies outside carries nobody (refused when armed and when resolved; the shared `manholePartners` cache is untouched) | `systems/stage.ts` |
| Respawns | `chooseSpawn` only uses in-sector tiles (the field runtime then puts the human on the checkpoint anyway) | `systems/respawn.ts` |
| Vehicles | a border entry is legal only when its tile lies inside the sector (a lane mouth outside would drive along closed streets into a barricade). Data, not an arena-id branch; none of the eleven sectors contains a lane mouth, so a voucher cannot call a vehicle inside them (field missions rarely give one) | `systems/entries.ts` `inSectorOnly` |
| Seats | posts snap to free floor inside the sector, never onto a barricade | `fieldState.ts` |
| The route | a sector is small, so the route never depends on blasting crates: between consecutive stops (start, markers, door, exit, return) the path with the fewest crates is cleared (decision DS6). Crates elsewhere stay for cover and traps | `fieldState.ts` `clearRoute` |
| Gates | a gate barricade opens (concrete to floor, `sectorGateOpened` event, the drawn object hides) when the leg it waits for is completed. Mechanism and tests only: no sector uses one yet | `sector.ts` `openSectorGates` |

### The eleven sectors

Sizes are walkable layout tiles inside the rects (and their share of the district). Every authored tile (start, markers, exits, doors, door return tiles, posts, the combat pilot's extra posts) lies inside; no marker, post, exit or door was moved, and no enemy entry was edited.

| Mission | Sector | Rects | Size | Boundary objects | Portion of the district |
| --- | --- | --- | --- | --- | --- |
| `oshodi.approach` | `oshodi.terminalApproach` | [2, 37, 35, 44] | 188 (10 %) | 4 barrier, 1 checkpoint, 2 bus, 1 gate (18 tiles) | The two southern stall streets from the Orita gate to the dispatch depot entrance: the terminal alleys north closed by bollards, a danfo rank and a Ring checkpoint; the depot gate and a parked bus east |
| `oshodi.railEdge` | `oshodi.railEdge` | [31, 26, 60, 34] + [37, 35, 60, 44] | 368 (19 %) | 2 rail, 2 barrier, 3 bus, 2 gate (31 tiles) | The interchange plaza at the end of the rail line, the east market lanes and the footbridge stairs: the rail buffer fence north, a bus and a yard fence west, the depot wall south-west |
| `mushin.approach` | `mushin.sparePartsRow` | [2, 28, 50, 36] | 349 (30 %) | 5 barrier, 5 bus, 1 checkpoint (24 tiles) | The southern stall rows, the back aisle and the loading bay to the parts storeroom; the lanes north to the motor road closed by parked danfos, barriers and a Ring checkpoint |
| `mushin.market` | `mushin.northAisles` | [2, 2, 50, 13] | 369 (31 %) | 2 gate, 2 barrier, 1 checkpoint (10 tiles) | The northern market blocks from the market gate to the top street; the five alley mouths onto the motor road closed |
| `fadeyiSomolu.approach` | `fadeyiSomolu.tollRoad` | [2, 21, 41, 30] | 309 (28 %) | 5 barrier, 3 bus, 1 checkpoint, 1 gate (48 tiles) | The southern block: the toll approach road, the tool shed and the plaza; the expressway kerb lined with barriers, parked buses and the Ring toll post |
| `fadeyiSomolu.junctions` | `fadeyiSomolu.northJunctions` | [2, 2, 41, 11] | 302 (27 %) | 5 barrier, 3 bus, 1 checkpoint, 1 gate (45 tiles) | The northern block of junction streets and the route office up to the slip road; the expressway kerb lined, the side road railed off |
| `ebuteMetta.approach` | `ebuteMetta.yardApproach` | [15, 26, 57, 36] | 375 (21 %) | 7 barrier, 1 checkpoint, 2 bus, 1 rail, 3 gate (40 tiles) | The southern yard streets from the yard gate past the sidings to the signal box and shed; the rail line ends at a buffer stop, the yard fence closes the east |
| `lagosIsland.approach` | `lagosIsland.ledgerRow` | [2, 18, 23, 30] | 224 (17 %) | 10 barrier, 1 gate, 1 checkpoint, 3 bus (42 tiles) | The south-west office block: the ledger counters and the records annexe; the marina road and the side street lined, bollards in the alleys north |
| `lagosIsland.press` | `lagosIsland.pressGrid` | [2, 2, 23, 15] + [22, 16, 23, 21] | 198 (15 %) | 8 barrier, 2 bus, 1 checkpoint, 2 gate (29 tiles) | The north-west grid of ledger offices and the press lane down the side street |
| `lekki.approach` | `lekki.gateApproach` | [2, 21, 33, 29] | 225 (16 %) | 2 gate, 2 checkpoint, 8 barrier, 3 bus (42 tiles) | The south-west estate block (garden, pool edge, standby plant) with the closed stretch of the estate road: Ring gatehouses close the road at both ends |
| `lekki.estate` | `lekki.northEstate` | [2, 2, 36, 9] + [24, 6, 54, 14] | 402 (29 %) | 7 barrier, 2 gate, 1 checkpoint, 1 bus (27 tiles) | The north drive, the central lawn and the east lawn down to the service road; a Ring gatehouse across the estate road |

The two missions of a district never share more than 15 % of their tiles (tested). `scripts/sector-ascii.ts <fieldId> ['[[x0,y0,x1,y1],...]']` prints a mission's board with its sector, its authored tiles and every leak of a trial rect set, grouped into runs (one barricade each): the authoring tool these were made with.

### Boundary presentation

`src/render/views/SectorBarricades.ts` builds the barricades as a `BoardCover` from the community cover kit (shared materials, the sign atlas, merged meshes per chunk) and the cast's danfo model (a procedural bus without it), merged with the arena's own cover by `mergeCovers` (`arenas/boardCover.ts`): the arena view draws no pillar on a barricade tile, `coveredAt` / `reach` / the view-clear bounds see each barricade as one fading object, and the occlusion fade works on them exactly as on buildings.

| Kind | Object |
| --- | --- |
| `bus` | a parked danfo every two tiles along the run (alternate directions, a route card towards the play area), a jersey block and a bollard on an odd tile |
| `barrier` | concrete jersey barriers with red / white reflective stripes and a steel crowd rail on top (it reads as closed, not as a step), yellow-black bollards at both ends, a ROAD CLOSED board on a long run, a cone |
| `gate` | a corrugated steel gate wall: posts, painted sheet panels with rust at the foot, rails, a padlocked chain, a NO ENTRY board |
| `rail` | a rail-yard buffer: heavy posts, a red-and-white buffer beam with a red lamp, a mesh fence behind, a DANGER - RAIL LINE board |
| `checkpoint` | a Ring checkpoint: a kiosk (window band, overhanging roof, red beacon, a RING CHECKPOINT / STOP - SHOW PASS board) and a red-and-white boom over orange / white water-filled barriers |

No soft `x` barrier (a blast would open the sector), no invisible wall. Names are fictional. Screenshots: `docs/screenshots/campaign-sector-ai/` (phone 740 x 360 at device scale 2, and desktop close-ups), taken with `scripts/sector-shots.mjs` (`:inspect` gives an unclamped close-up of a tile).

### Camera and minimap

- **Follow camera** (`render/cameraDirector.ts` `sectorBounds`, `render/cameraRig.ts` `inBounds`): with a sector the follow shot carries `bounds` (the rects' bounding box in world units and the sector's `viewMargin`). The rig keeps the HUD-free band within the box plus a margin of `max(viewMargin, its own HUD margin)` on the sides and the south (so a player at the box's edge is never pushed under the on-screen controls: the bug the City Rumble `free` shot avoids) and `viewMargin` to the north; along an axis where the box is narrower than the view the view is centred on it. City Rumble without a sector keeps its free follow shot (`tests/rumble-camera.test.ts` unchanged).
- **Overview / establishing shot**: framed on the sector (`fitRect`, the same fit as the whole arena, cached per screen layout), not the whole city.
- **Minimap** (`ui/minimapModel.ts` `minimapCrop`, `ui/Minimap.tsx`): crops to the sector's clip (bigger cells in the same box), dims the streets beyond the barricades, draws barricades orange and never as the closing city.

### Render cost

`render/sectorClip.ts` `renderClip`: the sector clip grown by 6 rows north (the three-quarter camera sees furthest above the band), 3 columns each side and 2 rows south. Outside it nothing is built: the arena's cover objects (`CoverFactory` takes an optional `clip`; the community factory and the Oshodi cover skip objects with no tile inside it; without a clip their output is unchanged), the arena view's per-tile pillars and crates, and the living environment's traffic routes, crowd zones and lights (`clipEnvironment`). Field equipment (below) has its own small view and is never drawn as a crate. Everything built is disposed by the existing view / cover dispose paths (the barricade covers own their materials, geometries and sign atlas).

Measurement: `scripts/sector-perf.mjs` loads every field mission through the debug handle `__WAHALA__.startFieldMission(id, { noSector })` with and without its sector, on the low and high presets, and reports the scene build time (`stats().loadMs`, `renderer.loadGame` timed), draw calls and triangles after the camera settled, live geometries / textures, and frame time mean / p95 over 4 s of play; `--leak` loads three missions in one page. Results below. **Software rendering (SwiftShader on 4 shared cores): the numbers compare the two variants on the same machine; they are not phone timings and no claim about real phones is made.**

| Mission | Quality | Build ms sector / whole | Draw calls | Triangles | Geometries | Textures | Frame mean ms | Frame p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `oshodi.approach` | low | 3199 / 2317.7 | 219 / 205 | 876210 / 1282342 (-32 %) | 246 / 295 | 181 / 188 | 796.9 / 498.5 | 1799.9 / 1100 |
| `oshodi.railEdge` | low | 1508.8 / 1838 | 217 / 210 | 583606 / 905937 (-36 %) | 286 / 292 | 180 / 178 | 371 / 641.4 | 783.2 / 1400 |
| `mushin.approach` | low | 1903 / 2378.2 | 200 / 185 | 633121 / 738677 (-14 %) | 309 / 290 | 191 / 182 | 662.9 / 682 | 1516.7 / 1550 |
| `mushin.market` | low | 2538.1 / 2439.9 | 165 / 162 | 550776 / 726299 (-24 %) | 249 / 289 | 173 / 182 | 575.8 / 637.5 | 1299.9 / 1499.9 |
| `fadeyiSomolu.approach` | low | 2678.5 / 2207.6 | 188 / 185 | 476217 / 578349 (-18 %) | 278 / 261 | 185 / 184 | 642.5 / 534.6 | 1616.7 / 1366.6 |
| `fadeyiSomolu.junctions` | low | 2082.4 / 2262.7 | 198 / 191 | 505820 / 566616 (-11 %) | 253 / 264 | 173 / 183 | 533.9 / 673.1 | 1116.6 / 1766.6 |
| `ebuteMetta.approach` | low | 2089.5 / 2438.3 | 192 / 199 | 690086 / 942082 (-27 %) | 249 / 266 | 157 / 157 | 590.2 / 681.7 | 1383.3 / 1483.2 |
| `lagosIsland.approach` | low | 2655.3 / 2000.1 | 251 / 239 | 670833 / 813396 (-18 %) | 269 / 292 | 173 / 176 | 583.8 / 669 | 1316.7 / 1616.6 |
| `lagosIsland.press` | low | 2695.2 / 2478.8 | 226 / 211 | 661177 / 716954 (-8 %) | 281 / 295 | 175 / 176 | 618.3 / 405.8 | 1466.6 / 916.7 |
| `lekki.approach` | low | 1805.2 / 1605.8 | 273 / 244 | 513524 / 655016 (-22 %) | 281 / 279 | 178 / 177 | 305.9 / 314.1 | 666.6 / 700 |
| `lekki.estate` | low | 1554.4 / 1325.4 | 184 / 177 | 451682 / 505752 (-11 %) | 274 / 276 | 178 / 178 | 341.8 / 347.8 | 750 / 800 |
| `oshodi.approach` | high | 1763.4 / 2036.5 | 505 / 506 | 2204586 / 3045230 (-28 %) | 286 / 332 | 237 / 290 | 1235.2 / 943.6 | 3249.8 / 1649.9 |
| `oshodi.railEdge` | high | 1566.7 / 2177.1 | 516 / 515 | 1584131 / 2695772 (-41 %) | 323 / 329 | 241 / 280 | 886.9 / 1146.6 | 1966.6 / 2799.9 |
| `mushin.approach` | high | 1935.6 / 1901.6 | 563 / 519 | 2080995 / 2221560 (-6 %) | 346 / 346 | 265 / 294 | 794.1 / 798.6 | 2433.1 / 2250 |
| `mushin.market` | high | 1666 / 1924.7 | 539 / 532 | 1939613 / 2262680 (-14 %) | 321 / 345 | 284 / 294 | 892.5 / 846.6 | 2133.2 / 1416.6 |
| `fadeyiSomolu.approach` | high | 2043.4 / 1611.6 | 503 / 481 | 2019281 / 2403763 (-16 %) | 287 / 270 | 250 / 274 | 744.1 / 795.2 | 2100 / 2266.6 |
| `fadeyiSomolu.junctions` | high | 1753.4 / 1479.8 | 457 / 470 | 1854416 / 2310576 (-20 %) | 264 / 273 | 253 / 273 | 802.8 / 1066.8 | 1933.3 / 2783.1 |
| `ebuteMetta.approach` | high | 2027.2 / 1878.3 | 509 / 512 | 1977958 / 2481499 (-20 %) | 302 / 317 | 230 / 273 | 1023.3 / 943.3 | 2733.3 / 2183.3 |
| `lagosIsland.approach` | high | 2399.9 / 1793.9 | 575 / 578 | 2046014 / 2540731 (-19 %) | 292 / 323 | 247 / 260 | 1119.7 / 972.8 | 1599.9 / 1966.6 |
| `lagosIsland.press` | high | 1924.9 / 1605.8 | 569 / 566 | 2126469 / 2499941 (-15 %) | 297 / 326 | 254 / 260 | 671.8 / 1509.7 | 1899.9 / 2349.9 |
| `lekki.approach` | high | 2673.5 / 2687.9 | 632 / 605 | 2009870 / 2303314 (-13 %) | 312 / 310 | 243 / 252 | 1356.6 / 1490.5 | 3516.6 / 2049.9 |
| `lekki.estate` | high | 2762.3 / 1986.4 | 514 / 490 | 1757226 / 1885060 (-7 %) | 299 / 299 | 243 / 253 | 1020.1 / 800.1 | 1500 / 2333.2 |

Mean triangle change on low: -20 % (range -36 to -8 %).

Mean triangle change on high: -18 % (range -41 to -6 %).

Reading it: the sector cuts the **triangles** drawn in play (the cover, crates and ambient traffic beyond the clip are gone; the biggest cuts are where the whole district showed busy terminal or yard scenery around the sector) and the live **geometries** in most missions; **draw calls** stay about the same (the follow camera sees the same amount of street; the barricades add a few merged meshes, one per material); **frame times** on software WebGL (300-1500 ms a frame, 4-14 frames a sample) are too noisy to rank either variant, and **build times** vary from run to run by more than the difference (the same mission measured twice differed by up to 1.3 s). Raw rows: `docs/measurements/campaign-sector-perf.md`.

**Leak check** (`--leak`, the same mission loaded three times in one page, low): before this branch every match start left about 118 geometries and 48 textures on the GPU (whole district: 295 -> 413 -> 531 geometries; the sector: 243 -> 335 -> 427). The set's backdrop never released what it built into its tree (baked statics, set pieces, per-match canvas boards); `assets/backdrop.ts` now disposes them on unload: geometries 243 -> 247 -> 251 (sector) and 295 -> 305 -> 315 (whole district). **Still open (pre-existing, not from the sectors):** about 48 textures per start, all library model textures (`ImageBitmap` map / normal / ao of the set's and the arena's GLB props) that each match takes a fresh copy of; to be traced in the asset library. The barricade covers and the equipment view release everything they own (`tests/render/sector-render.test.ts` builds and disposes them).

### Generator-sensitive objectives (shared leg kinds)

Two new field leg kinds for all districts and the finale (`FieldLegDef`, `src/sim/mission/field.ts`). **Not assigned to any existing mission** (the district worker does that); scenario tests run them on a test-only mission.

| Leg | Rule | View fields | Events |
| --- | --- | --- | --- |
| `destroyTargets { targets: { id, kind: 'relayBox' \| 'tollBox' \| 'switchCabinet' \| 'partsCage' \| 'controlPoint', x, y, label, hp? }[], crew? }` | each piece of Ring equipment stands from the start as a solid soft tile (blocks walking, stops a flame arm, hides nothing). Only a blast set off by the human takes a hit point, one per separate blast (`mission/equipment.ts`, hooked into `destroySoftBlocks` like raid cargo); melee never damages tiles, and a vehicle, the closing city or an enemy's blast leave it standing; stage hazards never touch soft tiles. A piece wrecked before its leg counts when the leg comes. The `crew` group guards the nearest standing piece during the leg | `fieldGoal.verb: 'destroy'`, `fieldGoal.targets { left, total }`, nodes of kind `target` (`tg:<id>`, progress by hit points), `progress` "equipment wrecked" | `fieldTargetHit { targetId, label, x, y, hpAfter, maxHp, left, byId }` (cargo cues in the audio router; `hpAfter` 0 = wrecked) |
| `holdArea { area: { x, y, radius, label }, holdSec, waves?: { group, atSec }[] }` | time accrues while the human is inside the square zone and no living enemy is (contested = frozen, outside = frozen, never lost). A wave group holds its post until `atSec` after the leg starts, then moves into the zone and fights for it | `fieldGoal.verb: 'secure'`, `fieldGoal.area { ticks, goalTicks, fraction, inside, contested, x, y, radius }`, a zone node of kind `area`, `progress` "seconds held" | the existing `missionNode` progress events |

HUD words (`app/fieldGoal.ts`): DESTROY / SECURE tags, "RELAY BOX (2 LEFT)", "JUNCTION 2.4 / 20.0 s", notes BLASTS ONLY / STAY INSIDE THE AREA / CLEAR THEM OUT OF THE AREA. The equipment is drawn by `render/views/FieldEquipmentViews.ts` (a steel cabinet per kind with a hazard stripe and a blinking red warning light, a scorched stump and debris when wrecked). Leg texts must follow `tests/field-checkpoint-clarity.test.ts`: "Destroy the N ..." and "Keep the ... for N seconds" (the word "hold" stays the door's).

### For the district worker

- Give a mission a new leg by data only (`fieldDefs.ts`); put its equipment and zone inside the sector on open floor; the route clearing and the tests pick them up (`fieldRouteStops`, `fieldTargetTiles`).
- A gate that opens between legs: add it to the sector's `gates` with `opensAfterLeg` (its tiles must be open layout floor at the rect edge); the leak test counts it as closed.
- Moving a marker or a post: keep it inside the rects; `npx tsx scripts/sector-ascii.ts <fieldId>` shows the board.

### Tests

`tests/mission-sectors.test.ts` (data: sizes, every authored tile inside, barricades on open edge tiles, no leaks; per mission and two seeds: a flood from the start never leaves the rects and reaches every target; the route needs no blasting; no sector, no key; the stamp draws no random number; determinism; hazards / drops / manholes / respawns / vehicle entries; gates), `tests/field-sector-legs.test.ts` (both leg kinds), `tests/render/camera-sector.test.ts` (bounds on desktop and a 740 x 360 phone from every corner, the overview, no change without a sector, the minimap crop), `tests/render/sector-render.test.ts` (barricade objects, merged covers, gate hide, cover / environment clipping), `tests/field-nodes.test.ts` (its walks now go round barricades), `e2e/campaign-sectors.spec.ts` (phone landscape: the sector loads, its barricades are built, the camera stays on it from every corner).
