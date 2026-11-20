# Campaign world: campaign-only areas

Framework + Oshodi: branch `claude/wahala-cg-world`, from production `0b89d09` (decisions WX1-WX9). The other districts
(sections below): the community campaign kit and Mushin (WM1-WM6), Fadeyi/Somolu (WF1-WF5), Ebute Metta and Lagos Island
(WE1-WE8), Lekki Phase 1 and the Ojuelegba finale (WL1-WL10), merged into `claude/wahala-campaign-guidance-expansion-v1`.

## Status of the 21 missions

NEW = the mission plays on a newly authored campaign-only board (a place the City Rumble map does not have); REUSED = the
existing board, bounded to a part of it; UNCHANGED = the board and its extent as before (the campaign follow camera is a
camera change, not a new environment). Walkable tiles: the old sector of the Rumble map -> the new board.

| # | Mission | Board | Status | Walkable tiles |
| --- | --- | --- | --- | --- |
| 1 | Oshodi: Terminal Approach | `campaignOshodiOrita` (Orita Gate) | NEW | 188 -> 728 |
| 2 | Oshodi: Rail Edge | `campaignOshodiRailside` (Railside) | NEW | 368 -> 854 |
| 3 | Oshodi: The Controller (boss) | `rumbleOshodi`, bounded to the dispatch corridor (WX9) | REUSED (bounded) | - |
| 4 | Mushin: Spare-Parts Row | `campaignMushinPartsRow` | NEW | 349 -> 684 |
| 5 | Mushin: Aisle Sweep | `campaignMushinMarketHall` | NEW | 369 -> 734 |
| 6 | Mushin: The Parts Broker (boss) | `rumbleMushin`, whole map (WM6) | UNCHANGED | - |
| 7 | Fadeyi/Somolu: Toll Approach | `campaignFadeyiTollCorridor` | NEW | 309 -> 697 |
| 8 | Fadeyi/Somolu: Junction Run | `campaignFadeyiSideRoutes` | NEW | 302 -> 731 |
| 9 | Fadeyi/Somolu: The Garage Master (boss) | `rumbleFadeyi`, whole map (WF5) | UNCHANGED | - |
| 10 | Ebute Metta: Yard Approach | `campaignEbuteFreightYard` | NEW | 462 -> 879 |
| 11 | Ebute Metta: Goods Yard (raid section) | the raid's own board | UNCHANGED | - |
| 12 | Ebute Metta: The Timetable (boss) | `rumbleEbuteMetta`, whole map (WE8) | UNCHANGED | - |
| 13 | Lagos Island: Ledger Row | `campaignLagosLedgerLanes` | NEW | 224 -> 831 |
| 14 | Lagos Island: Press Run | `campaignLagosPressYards` | NEW | 198 -> 736 |
| 15 | Lagos Island: The Registrar (boss) | `rumbleLagosIsland`, whole map (WE8) | UNCHANGED | - |
| 16 | Lekki Phase 1: Gate Approach | `campaignLekkiEstateGate` | NEW | 225 -> 834 |
| 17 | Lekki Phase 1: Estate Sweep | `campaignLekkiInnerEstate` | NEW | 402 -> 854 |
| 18 | Lekki Phase 1: The Steward (boss) | `rumbleLekki`, whole map (bounding not attempted) | UNCHANGED | - |
| 19 | Ojuelegba: Return to Ojuelegba | `campaignOjuelegbaSouthStreets` | NEW | 218 -> 821 |
| 20 | Ojuelegba: Hold the Junction | `campaignOjuelegbaBusInterchange` | NEW | 190 -> 863 |
| 21 | Ojuelegba: Break the Ring (boss) | `rumbleOjuelegba`, its existing bounded sector (WL10) | UNCHANGED | - |

The raids entered from field-mission doors keep their own boards (UNCHANGED). Every City Rumble layout is pinned by hash
(`tests/campaign-world.test.ts`, `tests/campaign-community-kit.test.ts`).

## Why

The district sectors (docs/CAMPAIGN_SECTOR_AI.md, "District-sector architecture") only cut a district's City Rumble map into
pieces: a field mission played a clipped corner of the competitive map. The founder wants each district made of several
geographically coherent places, including places that do not exist in the multiplayer arena, with different missions
exploring different parts, only the current mission's area loaded and simulated, and the Rumble arena kept as the compact
competitive interpretation of the district.

A **campaign area** is that place: a new board painted for the campaign (a campaign-only arena no menu lists), its area data
(where it lies in the district, its parts, its gates, its landmarks) and the missions played on it.

## The framework

| Piece | File | What |
| --- | --- | --- |
| Board kit | `src/sim/arenas/campaign/kit.ts` | `campaignArena(spec)`: painted letter rows -> `ArenaDef` (`campaignOnly: true`, `kind: 'rumble'`, the layout, the `coverMap`, 12 balanced starts, two mandatory endgame waves from a seeded generator, the Rumble stage rules without summoned-vehicle lanes or a forced crush). No raw `#`: every solid tile is a kit object. |
| District kit (Oshodi) | `src/sim/arenas/campaign/oshodiKit.ts` | The Transport Metropolis cover letters (Q building, E lock-up, H shop, K kiosk, M stall, O container, T terminal, P pier, U stair tower, W wall, B parked danfo, S shelter, C canopy column, I kerb island, L platform post, N cabin, Y workshop, J skip, X generator house ...), checked letter for letter against the renderer's map. |
| Registry | `src/sim/arenas/campaign/index.ts` | `CAMPAIGN_ARENAS` / `CAMPAIGN_ARENA_IDS`: never in `ARENAS`, so never in `STANDARD_ARENA_IDS`, `RUMBLE_ARENA_IDS`, `EXPERIMENTAL_ARENA_IDS`, the pickers, previews or the multiplayer tests; `getArena` finds them. |
| Area data | `src/sim/mission/areas.ts`, `campaignAreas.ts`, `areasOshodi.ts` | `CampaignAreaDef`: id, district, arena, `format` (field / boss), missions, `place` (compass bearing from the interchange and neighbours with the way through), `subAreas` (named rects with a role and a purpose; they become `ArenaDef.districts`), `sector` (a `MissionSectorDef` on the area's board: the play area, the camera bounds through `viewMargin`, progressive `gates`), `entry`, `exits`, `landmarks` (anchors with a kind and a story). |
| Mission hook | `FieldMissionDef.arenaId` + `sectorId`; `MissionSectorDef.arenaId` | Absent = today's behaviour (the district's Rumble map). A boss mission already names its arena (`MissionDef.arenaId`) and may name a sector and a start (`sectorId`, `start`, FN7). |
| Resolver | `src/sim/mission/arena.ts` | `fieldArenaId(def)`, `missionArenaId(spec)`: the one answer to "which board" for `createGame`, `buildMissionGame`, the scripted tools (`sector-ascii`, `district-play`, the harnesses) and the tests. The app loader takes the arena from the built `GameOptions`; observe and the minimap read `state.arenaId` and `state.sector`. Saves store mission ids only (unchanged). |
| Archived pilot | `src/sim/mission/archivedFieldDefs.ts` | The archived combat pilot replays FROZEN mission data (Terminal Approach in its old sector of the Rumble map), never the campaign's. |
| Presentation | `src/render/arenas/campaign/register.ts`, `oshodiCampaign.ts` | `campaignArtTable()` registers every campaign arena with its district kit: the district's day and night looks, a floor drawn by sub-area role (pavers, slabs, worn asphalt, oil-stained hardstanding, ballast; road paint on `=`, kept-clear aprons hatched, barrier crates framed, sub-area names stencilled), the district's cover builder on the area's own letter map (`buildOshodiMetroCover(board, map)`), the community environment with crowds and light pockets at the landmarks, and a set from the district set kit (skyline, expressway flyover, danfo ranks, market umbrellas, floodlights, a footbridge, a rail viaduct; street life and lamp posts) placed from the landmark anchors. Everything off the board; the south (camera) side stays low. Obstacle styles: the district's, clutter by sub-area role. The follow camera list (`STADIUM_ARENAS`) includes the campaign arenas. |
| Boundaries | the board's own letters + `SectorBarricades` | Buildings, walls, lock-ups and parked danfos close a board; a gate between sub-areas is a sector gate drawn as a steel gate or a Ring checkpoint that hides when it opens. No invisible wall, no soft crate. |

Determinism: a board is pure data built at import (seeded authoring marks only); no Classic, City Rumble or multiplayer
digest changes (`tests/enemy-fairness.test.ts`, `tests/mission-regression.test.ts`), and the Rumble Oshodi layout hash is
pinned (`tests/campaign-world.test.ts`).

### How to add a campaign area (for the next districts)

1. **Choose the place.** A part of the district the Rumble map compresses or leaves out, with 3-4 parts that each have a
   job in the mission. Write the area's place: compass bearing from the district core, neighbours and the way through.
2. **Check the kit.** A district needs a letter kit and a presentation kit once: Oshodi has `OSHODI_KIT` and
   `oshodiCampaign.ts`. A **community district** (Mushin, Fadeyi/Somolu, Ebute Metta, Lagos Island, Lekki) uses the shared
   community campaign kit (decision WM1); Mushin is the worked example:
   - **Sim:** paint the board with the community `Board` and the district's own `CoverLegend` (exported by its Rumble module,
     e.g. `MUSHIN_LEGEND`), then
     `campaignArena({ ..., rows: b.rows(), legend: communityLegend(LEGEND), cover: b.cover(LEGEND) })`
     (`arenas/campaign/kit.ts`). `checkCover` refuses at import a cover that drifts from the letters. The Rumble arena module
     is not changed.
   - **Render:** export the district's cover theme, families and reach (and its ground colours) from its `*Art.ts` without
     changing the Rumble output (`MUSHIN_THEME`, `MUSHIN_FAMILIES`, `MUSHIN_REACH`, `MUSHIN_GROUND`), write
     `render/arenas/campaign/<district>Campaign.ts` with one `CommunityDistrictArt` (`communityKit.ts`): `look`, `nightLook`,
     `theme`, `families`, `reach`, `floor` (ground + `roleTint` per sub-area role), `env` (`seed`, vehicle `kinds`, `beds`,
     `crowdAt` / `lightAt`: which landmark kinds gather people or cast light), `set` (`backdrop` round every area and
     `landmarks`: the district's existing set pieces BY LANDMARK KIND, each placed from the area's landmark anchors with
     `landmarkPlace`). Then add ONE line to `KITS` in `register.ts`: `<districtId>: communityCampaignKit(<DISTRICT>_CAMPAIGN_ART)`.
     No other code: `campaignArtTable()` draws every area of the district with it (cover = the community cover factory on
     the area's `ArenaDef.cover`, floor = the community floor tinted by role with barriers framed and sub-area names
     stencilled, env = the community env, set = backdrop + landmarks + lamp posts and street life on the sides).
   - **Landmarks:** `CampaignLandmark.kind` is open (`CampaignLandmarkKind`): use the shared kinds or the district's own piece
     names (Mushin: `redLine`, `footbridge`, `partsSpill`, `edgeStalls`, `signBoard`, `smoke`, `danfoRank`, `floodlight`); a
     kind the kit does not draw is skipped.
   - **Tests:** `tests/campaign-community-kit.test.ts` (the kit on a test board, the Rumble community boards' layout and
     cover hashes); `tests/render/campaign-art.test.ts` checks every registered area uses its district's Rumble looks.
3. **Paint the board** in `src/sim/arenas/campaign/<district><Area>.ts` with the community `Board` (`fill`, `set`,
   `rows()`): edges of real objects (tall north, low lock-ups south), sub-areas joined by 2-wide lanes round blocks of cover,
   no plaza bigger than a hold zone needs, supply / barrier crates where a player can count on them, a few floor traps off
   every patrol. Call `campaignArena({ id, name, rows, legend, start, subAreas, traps, hazards, endgame, info })` and add the
   arena to `CAMPAIGN_ARENAS`.
4. **Write the area** in `src/sim/mission/areas<District>.ts`: sub-areas with purposes, the sector (rects = the play area;
   `gates` with `opensAfterLeg` for the sector transitions; `viewMargin: 3`), entry, exits, landmarks; add it to
   `CAMPAIGN_AREA_DEFS`.
5. **Re-author the mission** in `fieldDefs.ts`: `arenaId`, `sectorId`, start, markers / doors / equipment / hold zones /
   exits on the new board (keep the leg kinds, labels, door and raid ids, enemy groups), and enemies with real routes
   (`patrol()` loops of 12+ tiles, `post()` in cover). Update the briefing text in `src/campaign/content/` if it names places.
6. **Print and check:** `npx tsx scripts/sector-ascii.ts <fieldId>` (board, authored tiles, leaks), then
   `npx vitest run tests/campaign-world.test.ts tests/mission-sectors.test.ts tests/field-nodes.test.ts` and the district's
   `tests/field-districts-*.test.ts`.
7. **Measure, then fix the layout or the encounters (never the thresholds):** `npx tsx scripts/district-play.ts play <id>`
   (Easy / Normal / Hard), `npx tsx scripts/campaign-area-check.ts <id> 8 bait,plain` (the human-like bait and the plain-sight
   fairness probe), `npx tsx scripts/readability.ts`, and the perf script on the built game.
8. **Look at it:** `scripts/sector-shots.mjs` (follow, `:overview`, `:inspect`) at 740 x 360 and 844 x 390 (device scale 2)
   and 1280 x 720; judge the picture.

## Oshodi

```
              (the interchange: terminal, expressway, rail = the City Rumble map)
                    |                                   |
   oshodi.orita (SW) ---- depot back lane ---- oshodi.railside (SE)
   mission 1                                    mission 2
                    \_ boss: the dispatch corridor of the Rumble map (rows 10-22) _/
```

Legend of the maps below: letters are objects (see the kit), `.` floor, `_` kept clear, `=` road / siding, `x` barrier crate,
`$` supply crate; `@` start, `R` return, `1-3` checkpoints, `D` door, `t` equipment, `h` hold zone centre, `>` escape exit,
`e` an enemy's post.

### Mission 1, Terminal Approach: Orita Gate and the Dispatch Depot (`oshodi.orita`, `campaignOshodiOrita`, 46 x 26)

```
    0         1         2         3         4
    0123456789012345678901234567890123456789012345
  0 QQQQQQQQQQQQTTTTTTTTTTTTTTTTTTQQQQQQQQQQQQQQQQ
  1 QQQQQQQQQQQQTTTTTTTTTTTTTTTTTTQQQQQQQQQQQQQQQQ
  2 QQ.........Q...................W............QQ
  3 QQ.BBBB.S..Q..C....C....C....C.W.YYYYY..YYYYQQ
  4 QQ.........Q........e..........W.YYYYY..YYYYQQ
  5 QQ.........Q...................W.YYYYY..YYYYQQ
  6 QQ.BBBB.S..Q1...KK...S...KK....W.YYYYY..YYYYQQ
  7 QQ.........Q................2..W............QQ
  8 QQ.............................W............QQ
  9 QQ==============II======II=====W............QQ
 10 QQ==============II======II=====W..YYYYYY.J..QQ
 11 QQ.......$...................x.W..YYYYYY.J..QQ
 12 QQ.........H.MMM...MMM...MMM...W..YYYYYY....QQ
 13 QQ.e.......H.MMM...MMM...MMM...W____D_______QQ
 14 QQ...KKK.........e............eW____________QQ
 15 QQ...KKK.......................W_____e______QQ
 16 QQ.........H.OOO..MMM..OOOO....W............QQ
 17 QQ.........H.OOO..MMM..OOOO....W.OOO...XX...QQ
 18 QQ..R..........................W.OOO...XX...QQ
 19 QQ.............................W............QQ
 20 QQ.....EEEEH..MMM...MMM...MMM..G..........JJQQ
 21 QQ.@...EEEEH..MMM...MMM...MMM3.G............QQ
 22 QQ...............x....$........G............QQ
 23 QQ.............................W............QQ
 24 EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE
 25 EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE
```

(`G` = the depot's steel gate, a sector gate: closed until the checkpoints are walked.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Orita Gate loading street (x 2-10) | park | The entry and the way out: the danfo rank in its bays, bay shelters, the ticket kiosk with the park warden's loop (the first trap is taught here), the ORITA GATE return. |
| Terminal forecourt (x 11-30, y 2-10) | concourse | Checkpoints A and B under the terminal's south wing and its canopy columns; a fare tout throws at the queue lines; the bus-loading street with its kerb islands. |
| Papa Kekere market lanes (x 11-30, y 11-23) | street | A staggered grid of stall blocks and container shops; a warden loops the middle block; the ticket tout watches the lanes; checkpoint C at the depot fence. |
| Dispatch depot yard (x 31-43) | works | Behind the steel gate: warehouses, skips, the generator house, the kept-clear loading apron, the DISPATCH DEPOT door (the warehouse raid, unchanged) and the heavy walking across it. |

Landmarks (data, `areasOshodi.ts`): the Orita flyover (the expressway deck north), the Orita Gate danfo rank (west), the
Papa Kekere market umbrellas, the depot floodlights (east). Encounters: kiosk warden (agbero, 18-tile loop), fare tout
(thrower post), market warden (agbero, 18-tile loop), ticket tout (thrower post), lane blocker (heavy, 16-tile shuttle
across the door).

### Mission 2, Rail Edge: the Railside Streets (`oshodi.railside`, `campaignOshodiRailside`, 48 x 28)

```
    0         1         2         3         4
    012345678901234567890123456789012345678901234567
  0 WWWWWWWWWWWWWWWWWWWWWWWWQQQQQQQQQQQQQQQQQQQQQQQQ
  1 WWWWWWWWWWWWWWWWWWWWWWWWQQQQQQQQQQQQQQQQQQQQQQQQ
  2 QQ================================NNW.........QQ
  3 QQ================================NNW....UUU..QQ
  4 QQ..........e.......................W....UUU..QQ
  5 QQ...L...L...L.t..OO...e............W....UUU..QQ
  6 QQ..._______......OO....YYYYY...J...W.K...>...QQ
  7 QQ..._______..OOO.OO....YYYYY.t.J...W.........QQ
  8 QQ...___h___..OOO.OO....YYYYY.......W.........QQ
  9 QQ..._______......OO................W..PP.....QQ
 10 QQe.._______....e............e......G..PP.....QQ
 11 QQ..e...............x...............G......PP.QQ
 12 QQ.....e.............YY.YYYY...XX...G......PP.QQ
 13 QQ.MMM..MMM..MMM..MM.YY.YYYY...XX...W.........QQ
 14 QQ.MMM..MMM..MMM..MM.YY.............W....OO...QQ
 15 QQ...................YY.............W....OO...QQ
 16 QQ..................................W.........QQ
 17 QQ..OOOO...MMM..OOOO...x.....t....$.W.BBBB....QQ
 18 QQ..OOOO...MMM..OOOO................W......S..QQ
 19 QQ........e.........................W.........QQ
 20 QQ...................YY..YYYYY......W.BBBB....QQ
 21 QQ.MMM...MMM...MMM...YY..YYYYY...J..W.........QQ
 22 QQ.MMM...MMM...MMM...YY..YYYYY......W.........QQ
 23 QQ...................YY.............W.........QQ
 24 QQ.@...$.............YY.............W.......R.QQ
 25 QQ...................YY.............W.........QQ
 26 EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE
 27 EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE
```

(`G` = the station barrier, a Ring checkpoint gate: closed until the plaza is held.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Siding rail plaza (x 2-19, y 2-10) | rail | The siding along the rail fence with its buffer-stop relay cabin, platform posts, the relay box by the buffer stop, the kept-clear RAIL PLAZA to hold for 25 s; the trailer crews walk the siding and come back for it. |
| Ayo market lanes (x 2-20, y 11-25) | street | The entry: two hawkers loop the stall blocks (leg 1); the trailer hand waits at the corner below the plaza. |
| Relay service corridor (x 20-35) | service | The mast shed with a warden's loop, the relay boxes by the shed and in the yard, a heavy minding the nearest box, the generator house and workshops. |
| Footbridge approach (x 36-45) | concourse | Behind the station barrier (it lifts once the plaza is held): the Ayo footbridge's stair tower (the FOOTBRIDGE exit at its foot), piers, a danfo rank, the PARK GATE return. |

Landmarks: the commuter line on its viaduct (north), the Ayo footbridge (east), the park gate danfo rank (east), the Ayo
market umbrellas (west). Encounters: two hawkers (market enforcers, 24- and 28-tile loops), the relay minder (heavy post),
the plaza warden (agbero, 20-tile loop), the trailer crew (agbero shuttle on the siding, a thrower post), the late crew
(area boy shuttle), the trailer hand (the escape's pursuer: 8 tiles from the plaza and 4 tiles further from the footbridge
than the player, the escape fairness rule).

### Mission 3, the Oshodi boss: the dispatch corridor (a bounded part of the Rumble map)

The boss recipe, its relay nodes and its convoy strike lanes are tied to the district's main road, so the boss was
restructured onto a bounded part of the existing district map rather than a new board (decision WX9): sector
`oshodi.dispatchCorridor`, rows 10-22 of `rumbleOshodi` (638 walkable tiles): the main road, the interchange plaza, the
expressway junction, the railway edge and the market front. Every relay node of the three phases, the four convoy lanes,
the boss post and the crew lie inside; 20 Ring cordons (jersey barriers, parked danfos, steel gates, Ring checkpoints, a
rail barrier by the platforms) close the skywalk quarter north and the Cappa works, pitch and bus park south; the human
starts at the west end of the market front (`MissionDef.start` [2, 19]). The traffic waves, bus departures, the railcar and
the drops run wholly inside, so every stage hazard stays on.

### What is new, expanded, reused, unchanged

| Item | Status |
| --- | --- |
| The Orita Gate board: rank, forecourt, Papa Kekere market, depot yard and its gate (46 x 26) | NEW (campaign-only geography) |
| The Railside board: siding plaza, Ayo market, relay service corridor, footbridge approach and its barrier (48 x 28) | NEW (campaign-only geography) |
| Terminal Approach and Rail Edge play area | EXPANDED: 188 -> 728 and 368 -> 854 walkable tiles, 4 sub-areas each |
| The two missions' routes, enemy posts and patrols, equipment and hold zone positions | NEW (re-authored on the new boards) |
| Leg kinds, labels, door / raid ids (`depot` / `warehouseDispatchDepot`), groups, clock | UNCHANGED (par of Terminal Approach 90 -> 120 s, WX7) |
| The boss mission's play area | REUSED and bounded: the Rumble map's main-road band (rows 10-22) with Ring cordons; the recipe, nodes, lanes, crew and numbers unchanged |
| Cover objects, looks, night looks, floor materials, skyline, expressway, footbridge, danfo, kiosks, stalls | REUSED (Oshodi kit and set kit; no new model, texture or audio) |
| The City Rumble Oshodi map, Classic, City Rumble, multiplayer | UNCHANGED (layout hash and digests pinned) |
| The warehouse raid, every other district's missions, menus, camera code | UNCHANGED (the follow-camera list only gains the campaign arena ids) |

## Measurements

All scripted measurements use the real rules and real enemy bots; the old numbers are the same scripts on `0b89d09`.

| Measure | Terminal Approach old -> new | Rail Edge old -> new |
| --- | --- | --- |
| Walkable tiles of the play area | 188 -> 728 | 368 -> 854 |
| Scripted playthrough (6 seeds) Easy / Normal / Hard won | 6/6/6 -> 6/6/6 | 6/6/6 -> 6/6/6 |
| Field seconds Easy / Normal / Hard (mean of wins) | 24.0 / 21.0 / 23.7 -> 40.1 / 48.2 / 54.9 | 111.2 / 112.6 / 117.1 -> 106.9 / 110.7 / 127.3 |
| Human-like bait on the default target, Normal (8 seeds): first try / within two | 8/8, 8/8 -> 8/8, 8/8 | 8/8, 8/8 -> 8/8, 8/8 |
| Plain-sight fairness probe (4 seeds, at most 1 caught) | 0/4 -> 1/4 | 0/4 -> 0/4 |
| Human-like Oshodi flow won Easy / Normal / Hard (8 / 8 / 20 seeds) | 8 / 8 / 16 -> 8 / 8 / 17 | - |
| District cost Hard / Normal (both missions, test needs > 1.05) | 1.13 -> 1.08 | |

Boss (generator-first fights, seeds 101-106): won 6 / 6 / 6 on Easy / Normal / Hard before and after; lives over the six
runs 0 / 1 / 2 -> 2 / 3 / 7 (the corridor is tighter); pure punching still breaks nothing.

Patrol coverage (RC2c): every ordinary roamer of both missions walks a real route (12+ tiles, `tests/campaign-reliability-data.test.ts`).

Performance and the readability probe: see "Render cost" below.

## Render cost

`scripts/sector-perf.mjs <ids> low,high --sector-only` on a 740 x 360 page (device scale 1), the mission as the campaign plays
it: the old sector of the City Rumble map (the base build, `0b89d09`) against the new campaign board, two passes each
(first / second pass; build ms is `renderer.loadGame`, draw calls and triangles once the follow camera settled, frame time
over 4 s of live play). **Software rendering (SwiftShader on shared cores): the numbers compare the variants on the same
machine; they are not phone timings and no claim about real phones is made.**

| Mission | Quality | Build ms old / new | Draw calls old / new | Triangles old / new | Geometries old / new | Textures old / new | Frame mean ms old / new | Frame p95 ms old / new |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `oshodi.approach` | low | 2271, 2092 / 1520, 1959 | 228 / 162 | 867010 / 466413 (-46 %) | 254 / 202 | 175 / 154 | 668, 607 / 481, 477 | 1600, 1350 / 1050, 1083 |
| `oshodi.railEdge` | low | 2263, 1961 / 1911, 1641 | 313 / 180 | 752026 / 509043 (-32 %) | 300 / 229 | 207 / 172 | 558, 504 / 472, 463 | 1150, 1117 / 1017, 1017 |
| `oshodi.approach` | high | 2298, 2094 / 1693, 1634 | 512 / 422 | 2184941 / 1408917 (-36 %) | 294 / 225 | 231 / 233 | 1644, 1453 / 1054, 1065 | 4100, 3900 / 2783, 2800 |
| `oshodi.railEdge` | high | 2011, 2079 / 1775, 1454 | 629 / 456 | 1824037 / 1464588 (-20 %) | 337 / 252 | 268 / 252 | 1333, 1168 / 1082, 853 | 3133, 3117 / 2583, 2633 |

Reading it: although each area is 2.3-3.9 times the old sector's playable size, the scene is cheaper. The old sector still
built the 63 x 47 district's backdrop, set and the cover inside its render clip; a campaign board builds only its own
46 x 26 / 48 x 28 world. Fewer draw calls, 20-46 % fewer triangles, fewer live geometries and textures, shorter builds and
lower frame times in every row. The boss mission (the dispatch corridor) has no debug start path in the script; its render
clip is the corridor's (rows 1-27 of the 47-row district map, after the view and render margins) instead of the whole map.

Readability probe (`scripts/readability.ts normal`, both Oshodi missions): old -> new, ordinary roamers patrolling 7/7 ->
7/7; disengage probes: pursued 17 -> 21, reached adjacent 0 % -> 0 %, human hurt by anyone 41 % -> 19 %, chase length mean
1.7 -> 2.2 s (p95 2.9 -> 3.4 s), back on route median 3.1 -> 3.6 s.

## Screenshots

`docs/screenshots/campaign-guidance-expansion/world/` (30 shots): `phone-` 740 x 360 and `phoneWide-` 844 x 390 (device
scale 2) and `desktop-` 1280 x 720; for each area the follow camera in each sub-area (Orita: 4x20 the rank and kiosk, 20x6
the forecourt under the terminal wing, 20x18 the market, 37x17 the depot yard; Railside: 6x20 the market, 8x9 the plaza and
platform posts, 27x10 the service corridor, 41x8 the footbridge stair tower) and the overview (`-overview`). Taken with
`scripts/sector-shots.mjs <dir> <phone|phoneWide|desktop> <fieldId@XxY[:overview],...>` on the built game.

## What is left

- Every field mission now has its own board (the table at the top); the district sections below list what is left in each.
- A campaign-only board for a boss needs the boss recipe's strike lanes on that board; Oshodi's boss stays on the Rumble
  map's corridor (WX9); the Mushin, Fadeyi/Somolu, Ebute Metta and Lagos Island bosses stay on their whole Rumble maps
  (their strike points span the map: WM6, WF5, WE8), the finale boss in its existing sector (WL10); bounding the Lekki boss
  was not attempted.
- The rail sub-area's siding is walkable track (no train runs into the area); a train on it would need a `train` sweep and
  its warnings.

## Mushin

Branch `claude/wahala-cg-mushin` (decisions WM1-WM6). Mushin is the first community district on the shared community
campaign kit (WM1, "How to add a campaign area" step 2): its boards are painted with the Rumble map's own letters
(`MUSHIN_LEGEND`) and drawn by the community cover factory, floor and environment with the Rumble Mushin looks, cover
families and ground, and a set of the Rumble set's pieces placed from each area's landmarks (`mushinCampaign.ts`).

```
            (the Red Line and the Mushin shop rows north)
   mushin.partsRow (NW) ---- the yard service lane ---- mushin.marketHall (NE)
   mission 1                                             mission 2
            \____ the Idi-Oro road and the transit square = the City Rumble map ____/
                         boss: the whole Rumble map (unchanged, WM6)
```

Legend of the maps below: the Mushin letters (B building, S shop, L lock-up, P parts stall, H tyre heap, W workshop, M stall,
G warehouse, T timber / goods stack, K kiosk, C wall, D stall canopy), `.` floor, `_` kept clear, `=` service lane, `x`
barrier crate, `$` supply crate.

### Mission 1, Spare-Parts Row: the Ladipo side streets and the supplier yard (`mushin.partsRow`, `campaignMushinPartsRow`, 48 x 26)

```
    0         1         2         3         4
    012345678901234567890123456789012345678901234567
  0 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  1 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  2 BB...........SSSSSSSSSSSSSSSSSS.C.............BB
  3 BBWW...PP.SS....................C.GGGGG..GGGGGBB
  4 BBWW...PP.SS..PPP..PPP..PPP..HH.C.GGGGG..GGGGGBB
  5 BBWW......SS..PPP..PPP..PPP..HH.C.GGGGG..GGGGGBB
  6 BB........SS...........1........C.GGGGG..GGGGGBB
  7 BB.....PP.SS.HH..PPP..PPP..PPP..C.............BB
  8 BBWW...PP.SS.HH..PPP..PPP..PPP..C......KK.....BB
  9 BBWW......SS...................xC_____________BB
 10 BBWW...H..SS..PPP...PPP...PPP...C___t_________BB
 11 BB..............................C_____________BB
 12 BB.........x....................C...........t.BB
 13 BB...$..........................C.C...........BB
 14 BBWW...PP....WWW...WWW...WWWW...C.C.GGGGGGG.HHBB
 15 BBWW...PP....WWW...WWW...WWWW...C.C.GGGGGGG.HHBB
 16 BBWW............................C...GGGGGGG...BB
 17 BB...........................HH.C......D......BB
 18 BB....KK....LLL..LLL...LLL...HH.G.............BB
 19 BB..........LLL..LLL...LLL......G..........HH.BB
 20 BB..R.........................2.G....WWWW..HH.BB
 21 BB.......LLL...WW...WWW...K$....C....WWWW.....BB
 22 BB.@.....LLL...WW...WWW.........C.KK......t...BB
 23 BB..............................C.KK..........BB
 24 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 25 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

(`@` start, `R` ROW GATE return, `1` STALL ROW, `2` BACK AISLE, `t` parts cage, `D` the storeroom door, `G` the yard's
steel gate, a sector gate: closed until the checkpoints are walked.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Row Gate street (x 2-11) | street | The entry and the way out: a narrow side street of workshops and parts stalls, a kiosk, the ROW GATE return; the back of the stall row's shops is its east frontage. |
| Spare-parts row (x 12-31, y 2-11) | works | Shopfronts north, parts stalls and tyre heaps in a staggered grid; checkpoint STALL ROW on the parts hawker's 18-tile loop. |
| Engine back aisle (x 12-31, y 12-23) | lane | The cross street, workshops, lock-ups and a heap; the stall guard's 32-tile loop; checkpoint BACK AISLE by the yard gate. |
| Supplier yard (x 32-45) | service | Behind the steel gate: two warehouses, the kept-clear loading apron with the first cage, the parts storeroom and its door, the second and third cages; the bay runner's 34-tile loop, the cage minder (heavy) and the bay lookout (thrower). |

Landmarks (`areasMushin.ts`): the Mushin Red Line station on its viaduct (north), the Row Gate Spares Association board
(north), the parts spill of umbrellas, tyre stacks and drums (west), the engine-testing smoke (north), the supplier yard
floodlights (east).

### Mission 2, Aisle Sweep: the covered market, the warehouses and the service lane (`mushin.marketHall`, `campaignMushinMarketHall`, 50 x 26)

```
    0         1         2         3         4
    01234567890123456789012345678901234567890123456789
  0 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  1 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  2 BBS..SSSSSSSSSSSS..............C===============.BB
  3 BB.R..............LLL...LLL..KKC===============.BB
  4 BB.MM..MM..MM..DD.LLL...LLL..KKC......2..._____.BB
  5 BB.MM..MM..MM..DD..............CGGGGGGGGG.__h__.BB
  6 BB.............................C.........._____.BB
  7 BB......MM..DD.....MM..MM..MM..C..TTTT...C......BB
  8 BB......MM..DD.....MM..MM..MM..C..TTTT...C.GGG..BB
  9 BB.........SSS.................C.........C.GGG..BB
 10 BB.MM..DD.DSSS.MM..............C.x...1..........BB
 11 BB.MM..DD..MM..MMKKK..LLLL..KKKC......TT........BB
 12 BB....................LLLL.....G..TT..TT.C.GGGG.BB
 13 BB..DD..MM..MM..x..........$...G..TT..TT.C.GGGG.BB
 14 BB..DD..MM..MM.................G.........C......BB
 15 BB.................MM..MM..MM..CCCCC..CCCCCC..C.BB
 16 BB.MM..MM..MM..DD..MM..MM..MM..C................BB
 17 BB.MM..MM..MM..DD..............C..............$.BB
 18 BB.............................C..WWWW...HH.....BB
 19 BB..MM..MM..DD....LLL...LLL..DDC..WWWW...HH.....BB
 20 BB..MM..MM..DD....LLL...LLL..DDC................BB
 21 BB.............................CLL..........WWW.BB
 22 BB.@..LLLL....$................CLL....KK....WWW.BB
 23 BB....LLLL.....................CLL..............BB
 24 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 25 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

(`@` start, `R` MARKET GATE return, `D` at 10,10 the BACK STALL door (optional raid), `1` FAR STALL, `2` TOP STREET, `h` the
LORRY BAY hold zone (radius 1), `G` at x 31 the hall's steel gate, a sector gate: closed until the runners are down.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Oloja covered market (x 2-16) | street | The entry and the way out: 2 x 2 stall blocks and canopies with one-stall aisles, the back stall and its door, a runner's 30-tile loop, the MARKET GATE in the north shop row. |
| Provisions aisles (x 17-30) | lane | Kiosks, lock-ups and stall pairs; a runner's 24-tile loop, a thrower runner on the south aisle (26 tiles), the last loader's 24-tile loop north. |
| Warehouse interiors (x 31-47, y 5-15) | works | Behind the hall gate: goods stacks between walls and a warehouse bay; the FAR STALL checkpoint; a loader's 18-tile loop round the goods bay. |
| Service lane and lorry bay (y 2-4, the yard y 16-23) | service | The top street (the service lane, TOP STREET checkpoint), the kept-clear lorry bay at its east end to hold for 40 s, a loader on the kerb; the late loaders (a thrower, an area boy on a 16-tile loop round the tyre heap) in the loaders' yard south. |

Landmarks: the Oloja Covered Market board (north), the market street's lock-up stalls (west), the Red Line behind the
service lane (north), the lorry bay floodlights (east), the loaders' danfo rank (east).

### Mission 3, the Mushin boss: unchanged on the Rumble map (WM6)

The Parts Broker's recipe places its stacks across the whole district map in every phase (phase 1: Ladipo 11,8, Idi-Oro
25,22, Daleko 44,7; phase 2: the courtyards 9,28 to Timber Row 49,30; phase 3: 6,36 to 49,10), the runners restock from all
six quarters and the traffic and truck sweeps run the main road edge to edge. No coherent part of the map holds every stack
of the three phases without moving them (which would change the recipe), so the boss is not bounded: it plays the whole
Rumble map as before. A bounded Mushin boss needs the stacks re-authored first.

### What is new, expanded, reused, unchanged

| Item | Status |
| --- | --- |
| The Parts Row board: Row Gate street, spare-parts row, engine back aisle, supplier yard and its gate (48 x 26) | NEW (campaign-only geography) |
| The Market Hall board: covered market, provisions aisles, warehouse interiors, service lane and lorry bay, loaders' yard, the hall gate (50 x 26) | NEW (campaign-only geography) |
| Spare-Parts Row and Aisle Sweep play area | EXPANDED: 349 -> 684 and 369 -> 734 walkable tiles, 4 sub-areas each |
| The two missions' routes, enemy posts and patrols, cages, markers, door and hold zone positions | NEW (re-authored on the new boards) |
| Leg kinds, labels, door / raid ids (`storeroom`, `backStall` / `partsStoreroom`), groups, clocks and pars | UNCHANGED |
| The boss mission | UNCHANGED (whole Rumble map, WM6) |
| Cover objects, looks, night looks, ground, Red Line station, footbridge, umbrellas, stalls, tyre stacks | REUSED (the Rumble Mushin pieces through the community kit; no new model, texture or audio) |
| The City Rumble Mushin map, Classic, City Rumble, multiplayer | UNCHANGED (layout and cover hashes pinned) |

### Mushin measurements

The same scripts as Oshodi's, old = the integration branch at `77e128f` (the missions in their Rumble-map sectors).

| Measure | Spare-Parts Row old -> new | Aisle Sweep old -> new |
| --- | --- | --- |
| Walkable tiles of the play area | 349 -> 684 | 369 -> 734 |
| Scripted playthrough (6 seeds) Easy / Normal / Hard won | 6/6/6 -> 6/6/6 | 6/6/6 -> 6/6/6 |
| Field seconds Easy / Normal / Hard (mean of wins) | 61.5 / 77.0 / 81.9 -> 71.7 / 66.7 / 76.0 | 104.1 / 108.5 / 130.9 -> 99.3 / 107.1 / 120.9 |
| Lives used Easy / Normal / Hard (mean) | 0 / 0 / 0.17 -> 0 / 0 / 0.17 | 0 / 0 / 0.17 -> 0 / 0 / 0 |
| Human-like bait on the default target, Normal (8 seeds): first try / within two | 8/8, 8/8 -> 7/8, 8/8 | 8/8, 8/8 -> 8/8, 8/8 |
| Plain-sight fairness probe (4 seeds, at most 1 caught) | 0/4 -> 0/4 | 0/4 -> 0/4 |
| Ordinary roamers on a real route (readability) | 3/3 -> 3/3 | 6/6 -> 6/6 |

District cost Hard > Normal x 1.05 and Easy <= Normal x 1.05 (`tests/field-districts-mushin.test.ts`): passes on the new
boards. Readability probe (`scripts/readability.ts normal`, old both missions together -> new per mission): pursued 24 of
26 probes -> 10 of 10 / 10 of 16; human hurt by anyone 25 % -> 20 % / 20 %; chase mean 2.3 s -> 1.7 / 2.1 s (p95 3.8 ->
2.9 / 5.2 s); back on route median 3.4 s -> 3.8 / 3.7 s.

Render cost (`scripts/campaign-perf.mjs field:mushin.approach,field:mushin.market low,high --dist=dist`, a 740 x 360 page;
old = the `field:mushin.approach` rows of docs/measurements/campaign-guidance-expansion-baseline.md, `0b89d09` / the camera
branch; Aisle Sweep has no old row there). **Software rendering on a shared 4-core machine with other workers running: frame
times are noisy and are not phone timings.**

| Mission | Quality | Draw calls old -> new | Triangles old -> new | Geometries old -> new | Textures old -> new | Build ms new | Frame mean / p95 ms new |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mushin.approach` | low | 216-220 -> 137 | 684344-686978 -> 428020 (-37 %) | 212-316 -> 166 | 148-202 -> 158 | 3921 | 1044 / 3417 |
| `mushin.market` | low | - -> 162 | - -> 500772 | - -> 161 | - -> 147 | 5771 | 867 / 2267 |
| `mushin.approach` | high | 559-563 -> 388 | 2097902-2100532 -> 1381399 (-34 %) | 303-353 -> 201 | 242-276 -> 228 | 6775 | 2530 / 6316 |
| `mushin.market` | high | - -> 403 | - -> 1440972 | - -> 198 | - -> 227 | 3843 | 2411 / 6566 |

As with Oshodi, the campaign board builds only its own 48 x 26 / 50 x 26 world instead of the 53 x 39 district's backdrop,
set and clipped cover: about a third fewer triangles and draw calls although the play area is about twice the old sector.

Screenshots: `docs/screenshots/campaign-guidance-expansion/world/mushin/` (30 shots, `phone-` 740 x 360 and `phoneWide-`
844 x 390 at device scale 2, `desktop-` 1280 x 720): Parts Row 4x20 the gate street, 22x6 the stall row, 22x17 the back
aisle, 39x10 the supplier yard, the overview; Market Hall 5x18 the covered market, 24x9 the provisions aisles, 36x10 the
warehouses, 44x5 the lorry bay, the overview. Far teleports were shot with `SHOT_SETTLE_MS=9000` (`scripts/sector-shots.mjs`:
the follow camera glides per frame and a software frame takes about a second).

What is left for Mushin: the boss (WM6, its stacks would need re-authoring first).

## Fadeyi/Somolu

Branch `claude/wahala-cg-fadeyi`, from the community campaign kit (`662f8e2`). Decisions WF1-WF5. Painted with the community
kit as is (step 2): the Rumble `FADEYI_LEGEND` plus `H` (the community warehouse) in `FADEYI_CAMPAIGN_LEGEND`
(`sim/arenas/campaign/fadeyiKit.ts`), drawn by `KITS.fadeyiSomolu = communityCampaignKit(FADEYI_CAMPAIGN_ART)`
(`render/arenas/campaign/fadeyiCampaign.ts`: the Rumble Fadeyi looks, cover pieces, grey highway ground, and the set pieces
`ikoroduRoad`, `footbridge`, `signBoard`, `edgeStalls`, `danfoRank`, `floodlight`).

```
                  (the Fadeyi junction: Ikorodu Road and the BRT centreline = the City Rumble map)
                         |                                                  |
   fadeyiSomolu.tollCorridor (S of the highway)            fadeyiSomolu.sideRoutes (NE, the Onipanu side)
   mission 1: slip, checkpoint street, toll plaza, yard    mission 2: route office, back lanes, pound, slip road
                  \_ boss: the whole compact Rumble junction, unchanged (WF5) _/
```

Legend as for Oshodi; `D` here is the median / jersey barrier, `V` a compound wall, `H` a warehouse, `K` a kiosk or toll
booth, `G` the sector gate.

### Mission 1, Toll Approach: the Kobo Toll Corridor (`fadeyiSomolu.tollCorridor`, `campaignFadeyiTollCorridor`, 48 x 26)

```
    0         1         2         3         4       
    012345678901234567890123456789012345678901234567
  0 BBDDDDBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  1 BBDDDDBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
  2 BB_R__..............................V.........BB
  3 BB.==.KK....SSSS..WWW.MMM..BBBBBBB..V.WWW..HHHBB
  4 BB.==e......SSSS..WWW.MMM..BBBBBBB..V.WWW..HHHBB
  5 BB.==.SSSS.......e.........BBBBBBB..V......HHHBB
  6 BB.==.SSSS..MMM...SSSS..............V.........BB
  7 BB.==.SSSS..MMM...SSSS........t.....V..HHHH...BB
  8 BB.==..................t.===========V..HHHH...BB
  9 BB.==...DDDDDDD..DDDD.KDD==DDDKDDD==V.........BB
 10 BB==================================G=====....BB
 11 BB==================================G=====....BB
 12 BB......DDDDD.DDDD.K.DDDD==DDDKDDD==V......WW.BB
 13 BB....KK.................===========V......WW.BB
 14 BB..........LLLL..RRRR.LL.....t.e...V.......e.BB
 15 BB....RRRR..LLLL..RRRR.LL.WWW...MMM.V..WWWWW..BB
 16 BB....RRRR........RRRR....WWW...MMM.V..WWWWW..BB
 17 BB.KK.RRRR............e...........x.V..WWWWW..BB
 18 BB..........RRR..WWWW..MM...SSSS....V.___D___.BB
 19 BB..........RRR..WWWW..MM...SSSS....V._______.BB
 20 BB.....LLL..RRR.......x.......$.....V.........BB
 21 BB.@...LLL................LL....KK..V.LL...HH.BB
 22 BB.......$.......LLL................V.........BB
 23 BB..................................V.........BB
 24 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 25 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

(`G` = the yard's toll bar, a Ring checkpoint gate: closed until the toll boxes are smashed.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Ikorodu Road slip (x 2-10) | approach | The entry and the way out: the slip road down from the highway barrier (the TOLL GATE), a kiosk, the shop block a marshal loops, houses and lock-ups by the start. |
| Kobo checkpoint street (x 11-24) | street | The access-control street: the approach road between two jersey-barrier lines with gaps and toll kiosks; two marshals loop the blocks either side; the first toll box by the kiosk gap. |
| Toll plaza corridor (x 25-35) | concourse | The checkpoint corridor: the road widened into lanes between two booth islands under the Ring toll office; toll boxes north and south of the islands, the toll heavy minding the nearest. |
| Tool-shed yard (x 36-45) | works | Behind the compound wall and its toll bar: garages, stores, the TOOL SHED door on its kept-clear apron (the junction tool-shed raid, unchanged) and the yard lookout. |

Landmarks (`areasFadeyi.ts`): Ikorodu Road beyond the north barrier, the Kobo toll point board, the Fadeyi footbridge and
the slip-side stalls (west), the Onipanu danfo rank and the yard lamps (east). Encounters: three route marshals (16-18-tile
loops round the slip shop block and the checkpoint-street blocks), the toll heavy (post by the plaza boxes), the toll
lookout (thrower post in the yard, covering the door).

### Mission 2, Junction Run: the Somolu Side Routes (`fadeyiSomolu.sideRoutes`, `campaignFadeyiSideRoutes`, 50 x 27)

```
0         1         2         3         4         
    01234567890123456789012345678901234567890123456789
  0 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBDDDDDBBBB
  1 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBDDDDDBBBB
  2 BB................e...............V..........>__BB
  3 BB.BBBBBB....RRRR..RRR...SSSS..RR.V.WWW..SSS.==.BB
  4 BB.BBBBBB.K..RRRR..RRR...SSSS..RR.V.WWW..SSS.==.BB
  5 BB.BBBBBB....RRRR.......2.SSSS....V..........==.BB
  6 BB.BBBBBB...e......RRR.e.........RV.KK..LLLL.==.BB
  7 BB.._R____...RRR...RRR..RRRR...RRRV..........==.BB
  8 BB..______...RRR........RRRR...RRRV.SSS..WWWe==.BB
  9 BB..........1RRR..VVVV..........RRV.SSS..WWW.==.BB
 10 BB.VVV..VVV.......VVVV..RRR..R..3.V..........==.BB
 11 BB............RRRR......RRR..R..RRV.MMM..KK..==.BB
 12 BB..@.........RRRR.....___.......RV..........==.BB
 13 BB....................._h_........G============.BB
 14 BB..RRR................___........G============.BB
 15 BB..RRR..KK..VVVVVVxxVVV..VVVVVV..V..........SS.BB
 16 BB..RRR......Ve.........V......V..V.LLL..WW..SS.BB
 17 BB...........V.HHHHH....V.WWW.eV..V.LLL..WW.....BB
 18 BB.WWW.........HHHHH.......WWW....V.............BB
 19 BB.WWW..RRR..V.HHHHH....V......V..V..HHH...KK...BB
 20 BB..$...RRR..V.......e..V.HHHH.V..V..HHH........BB
 21 BB...........VVVV..VVVVV..HHHH.V..V.............BB
 22 BB.LL..KK...........e.............V.WW...LLL....BB
 23 BB.............RRRR..RRR..RRRR.$..V.WW...LLL....BB
 24 BB.............RRRR..RRR..RRRR....V.............BB
 25 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 26 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

(`G` = the route checkpoint, a Ring checkpoint gate: closed until the centre junction is held.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Ring route office (x 2-11) | service | The entry and the way back: the office block and its kept-clear forecourt (ROUTE OFFICE), compound walls, a garage, houses down the west lane. |
| Somolu back lanes (x 12-33, y 2-14) | lane | Irregular house blocks, a corner shop row and a walled plot: junctions 1-3 west to east, a marshal looping the west block, the crossing crew on the lanes, the kept-clear CENTRE JUNCTION where the north-south lane crosses the route. |
| Kobo vehicle pound (x 12-33, y 15-24) | works | The walled pound (the crossing crews' base): a late marshal loops the sheds, a lookout on the garage corner, the last crew on the back lane, the pursuer waiting by the gate; a blastable barrier pair on its north gate. |
| Onipanu slip road (x 34-47) | approach | Behind the route checkpoint (it lifts once the junction is held): the slip up to the highway barrier (SLIP ROAD), garages, shops and stores, the slip heavy beside the escape. |

Landmarks: Ikorodu Road and the Kobo route office board (north), the pound lamps (west), the Onipanu footbridge and the slip
road danfo rank (east). Encounters: five route marshals / area boy on 16-34-tile routes, the lookout (thrower post), the
slip heavy (post), the pursuer (10 tiles from the junction, further from the slip road than the player).

### Mission 3, the Fadeyi/Somolu boss: unchanged (WF5)

Not bounded. The recipe's junction nodes span x 6-47, y 5-27 of the 51 x 33 board and the traffic, BRT and bus-departure
sweeps run the full width, so a cordon keeping every node and hazard would trim only the outer rows: no coherent part exists
without moving the recipe. The Rumble Fadeyi is already the compact junction.

### What is new, expanded, reused, unchanged (Fadeyi/Somolu)

| Item | Status |
| --- | --- |
| The Kobo Toll Corridor board: slip, checkpoint street, toll plaza corridor, tool-shed yard and its toll bar (48 x 26) | NEW (campaign-only geography) |
| The Somolu Side Routes board: route office, back lanes, vehicle pound, Onipanu slip road and its checkpoint (50 x 27) | NEW (campaign-only geography) |
| Toll Approach and Junction Run play area | EXPANDED: 309 -> 697 and 302 -> 731 walkable tiles, 4 sub-areas each |
| The two missions' routes, enemy posts and patrols, equipment, hold zone and exit positions, briefing text | NEW (re-authored on the new boards) |
| Leg kinds, labels, door / raid ids (`shed` / `junctionToolShed`), groups, clocks and par | UNCHANGED |
| The boss mission | UNCHANGED (the whole Rumble map, WF5) |
| Cover objects, looks, night looks, ground, footbridge, danfos, stalls, signs | REUSED (Fadeyi Rumble art + the community warehouse; no new model, texture or audio) |
| The City Rumble Fadeyi map, Classic, City Rumble, multiplayer | UNCHANGED (layout and cover hashes pinned) |

### Measurements (Fadeyi/Somolu)

Same scripts and seeds as Oshodi; old = the same scripts on the kit base `662f8e2` (the old Rumble sectors).

| Measure | Toll Approach old -> new | Junction Run old -> new |
| --- | --- | --- |
| Walkable tiles of the play area | 309 -> 697 | 302 -> 731 |
| Scripted playthrough (6 seeds) Easy / Normal / Hard won | 6/6/6 -> 6/6/6 | 6/6/6 -> 6/6/6 |
| Field seconds Easy / Normal / Hard (mean of wins) | 68.0 / 72.5 / 70.3 -> 71.7 / 77.7 / 91.4 | 93.3 / 104.2 / 111.7 -> 93.9 / 99.6 / 128.2 |
| Lives used per run Easy / Normal / Hard | 0 / 0 / 0.17 -> 0 / 0 / 0 | 0 / 0.17 / 0.17 -> 0 / 0 / 0 |
| Human-like bait on the default target, Normal (8 seeds): first try / within two | 8/8, 8/8 -> 8/8, 8/8 | 6/8, 7/8 -> 7/8, 8/8 |
| Plain-sight fairness probe (4 seeds, at most 1 caught) | 0/4 -> 0/4 | 0/4 -> 0/4 |
| Ordinary roamers on a real route (readability) | 3/3 -> 3/3 | 5/5 -> 5/5 |

Hard costs more than Normal over both missions (field seconds Normal 177 -> Hard 220, 1.24 x; before 177 -> 182, 1.03 x); Easy no more than Normal.
Junction Run's old bait missed the 90 % within-two bar (7/8); the new board meets it.
Readability probe (`scripts/readability.ts normal`, both missions): pursued 22 -> 17, reached adjacent 0 % -> 6 % (one probe),
hurt by the chased enemy 0 % -> 0 %, hurt by anyone 9 % -> 35 % (all on Junction Run, where the probe's run to the farthest
tile passes the pound's lookout and the waiting pursuer), chase length mean 1.8 -> 1.9 s, back on route median 2.9 -> 3.3 s.

Render cost (`scripts/campaign-perf.mjs field:fadeyiSomolu.approach,field:fadeyiSomolu.junctions low,high`, one pass each;
old = the base build with the old sectors of the Rumble map, new = this branch). **Software rendering (SwiftShader) on
cores shared with three other workers' screenshot runs: frame times and build times are noisy and are not phone timings; no
claim about real phones is made.** Draw calls, triangles, geometries and textures are the steady numbers.

| Mission | Quality | Build ms old / new | Draw calls old / new | Triangles old / new | Geometries old / new | Textures old / new | Frame mean ms old / new | Frame p95 ms old / new |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fadeyiSomolu.approach` | low | 5060 / 3943 | 200 / 116 | 537287 / 359528 (-33 %) | 298 / 159 | 201 / 156 | 1678 / 1214 | 4717 / 3517 |
| `fadeyiSomolu.junctions` | low | 6477 / 6879 | 264 / 154 | 658638 / 454723 (-31 %) | 263 / 140 | 203 / 140 | 1163 / 1468 | 3050 / 2250 |
| `fadeyiSomolu.approach` | high | 4946 / 7337 | 515 / 375 | 2091512 / 1304886 (-38 %) | 307 / 215 | 266 / 265 | 2507 / 1888 | 3617 / 3133 |
| `fadeyiSomolu.junctions` | high | 6468 / 7855 | 571 / 368 | 2364550 / 1296260 (-45 %) | 274 / 199 | 283 / 235 | 2058 / 2267 | 3450 / 6683 |

As for Oshodi, each area is 2.3-2.4 times the old sector's playable size yet the scene is lighter: 27-42 % fewer draw calls,
31-45 % fewer triangles, fewer live geometries and textures (a campaign board builds only its own 48 x 26 / 50 x 27 world,
the old sector built the 51 x 33 district's set and highway). Build and frame times moved both ways run to run on the busy
machine. Bytes fetched at the mission start: 43-136 KB old, 48-244 KB new; the initial load is 22 KB larger (the two boards' data).

Screenshots: `docs/screenshots/campaign-guidance-expansion/world/fadeyiSomolu/` (`phone-` 740 x 360, `phoneWide-` 844 x 390 at
device scale 2, `desktop-` 1280 x 720): Toll Corridor 4x20 the slip, 20x13 the checkpoint street, 30x10 the toll plaza,
41x20 the yard, and the overview; Side Routes 5x11 the route office, 20x5 the back lanes, 24x14 the centre junction, 21x18
the pound, 43x12 the slip road (staged behind the closed checkpoint, hence the arrow's "no open route"), and the overview.

## Ebute Metta and Lagos Island

Branch `claude/wahala-cg-ebute-island`, from the community-kit commit `662f8e2`. Decisions WE1-WE8 (`docs/DECISIONS.md`).
Both districts use the shared community kit (WM1) as it is: each is a `KITS` entry (`ebuteMettaCampaign.ts`,
`lagosIslandCampaign.ts`) with the district's own `CoverLegend` (`EBUTE_LEGEND`, `LAGOS_ISLAND_LEGEND`), its Rumble looks,
cover theme / families / reach and ground, exported from its `*Art.ts` without changing the Rumble output. One small,
backward-compatible kit option was added: `CommunityDistrictArt.floor.extra`, the district's own floor marks drawn after the
kit's (Ebute Metta: ballast, sleepers and rails on its track lanes, the level crossing striped).

```
            (the station, Oyingbo, the foreshore = the Ebute Metta City Rumble map)
                                     |  the freight line south
          ebuteMetta.freightYard (S): cargo streets - level crossing - goods sidings / works compounds

        (Balogun, Broad Street, the civic square, the Marina = the Lagos Island City Rumble map)
                     |                                              |
   lagosIsland.ledgerLanes (NW): cloth lanes, market      lagosIsland.pressYards (NE): back streets,
   road, counter hall, Ledger House records yard          substation, pump house yard, press lane
                     \_______ the back streets behind the records yard _______/
```

Legend of the maps below: as Oshodi's, with the district's own letters (`EBUTE_LEGEND`: B building, L lock-up, Y timber /
goods stack, F trailer, W wagon, G compound wall, V workshop, U utility, C cabin, K kiosk, Z signal post, Q rail portal;
`LAGOS_ISLAND_LEGEND`: O office tower, H heritage frontage, S shop, M stall, L lock-up, A arcade, K kiosk, V compound
wall, Q corrugated hall, T tree, B building); `+` is a sector gate, `t` a piece of equipment.

### Ebute Metta: Yard Approach in the Iron Lane Freight Yard (`ebuteMetta.freightYard`, `campaignEbuteFreightYard`, 50 x 30)

```
    0         1         2         3         4
    01234567890123456789012345678901234567890123456789
  0 BBBBBBBBBBBBBBBBBBBBBBQQBBBBBBBBBBBBBBBBBBBBBBBBBB
  1 BBBBBBBBBBBBBBBBBBBBBBQQBBBBBBBBBBBBBBBBBBBBBBBBBB
  2 BB....................==.......G................BB
  3 BB..BBBBB...BBBBB.YY..==..WWWW.G.WWWW....WWWW...BB
  4 BB..BBBBB...BBBBB.YY.Z==..WWWW.G.WWWW....WWWW...BB
  5 BB..BBBBB...BBBBB.....==.......G................BB
  6 BB....................==.......G.......CC.......BB
  7 BB..................e.==..WWWW.G.YY....CC...WWW.BB
  8 BB..LLLL...LLL..YY....==..WWWW.G.YY.e.____..WWW.BB
  9 BB..LLLL...LLL..YY.t..==.......G......_h__..e...BB
 10 BB..LLLL...LLL..YY....==.......G.WWWZ.____..YYY.BB
 11 BB..........e......KK.==Z.UU...G.WWW.......ZYYY.BB
 12 BB.......FFFF......KK.==..UU...G................BB
 13 BB..$.............x...==.......GGGGGG+++GGGGGGGGBB
 14 BB=========================FFFF=================BB
 15 BB====FFFF=================================FFFF=BB
 16 BB....................==.............x..........BB
 17 BB...FFFF.............==.........GGGG.....VVVVV.BB
 18 BB....e....BBBBB...LLZ==..VVVVe..GGGG.....VVVVV.BB
 19 BB......t..BBBBB...LL.==..VVVV...GGGG.....VVVVV.BB
 20 BB..LLLL...BBBBB...LL.==..VVVV..............e...BB
 21 BB..LLLL...BBBBB...LL.==t..............VVVVV....BB
 22 BB..LLLL..........$...==......e..UUU...VVVVV.GG.BB
 23 BB....................==..YYY....UUU...VVVVV.GG.BB
 24 BB.R......YY...LLL.UU.==Z.YYY.......t..__D__.GG.BB
 25 BB....KK..YY...LLL.UU.==........$......_____....BB
 26 BB.@..KK.......LLL.UU.==.........GGGG...........BB
 27 BB....................==........................BB
 28 LLLLLLLLLLLLLLLLLLLLLLQQLLLLLLLLLLLLLLLLLLLLLLLLLL
 29 LLLLLLLLLLLLLLLLLLLLLLQQLLLLLLLLLLLLLLLLLLLLLLLLLL
```

(`+` = the sidings gate in the yard fence: closed until the four switch cabinets are wrecked.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Iron Lane cargo streets (x 2-18) | street | The entry and the YARD GATE return; bonded warehouses, cargo lock-ups and goods stacks, trailers on the freight road; two cabinets; the yard enforcer loops the lock-ups by the gate (24 tiles), the yard runner loops the cargo block north of the road (42 tiles). |
| Alafia level crossing (x 19-30) | rail | The freight line (x 22-23) under its two bridge portals, the freight road crossing it, signal posts, the keeper's hut, wagons on the loop siding, the goods shed; a cabinet by the track, the switchman, the relief enforcer looping the goods shed (32 tiles). |
| Oyingbo goods sidings (x 31-47, y 2-13) | service | Behind the yard fence and its steel gate: wagons on the sidings, timber, the signal cabin and its kept-clear apron (the hold zone); the freight guards (heavy, thrower). |
| Ajao works compounds (x 31-47, y 14-27) | works | Walled compounds and workshops, the last cabinet, the SIGNAL SHED door (the `junctionToolShed` raid, unchanged) on its apron and the yard lieutenant looping the shed (32 tiles). |

Landmarks: the freight line viaduct with the green-and-white train (north), the Iron Lane trailer park and the Iron Lane
Cargo Terminal board (west), the goods sidings floodlights and the Ajao works smoke (east). The freight line is walkable
track; no train runs into the area (as on Oshodi's siding). The `railYardGoods` raid stays the district's standalone
section 2 (it has no door on this mission).

### Lagos Island mission 1: Ledger Row in the Ledger Lanes (`lagosIsland.ledgerLanes`, `campaignLagosLedgerLanes`, 52 x 28)

```
    0         1         2         3         4         5
    0123456789012345678901234567890123456789012345678901
  0 OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOHHHHHHHHHHHOO
  1 OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOHHHHHHHHHHHOO
  2 BB..................==................V...........BB
  3 BB.SSSSS..SSSSSS..AA==..AAAAAAAAAAAAA.V...OOOOOOO.BB
  4 BB.SSSSS..SSSSSS..AA==..AAAAAAAAAAAAA.V...OOOOOOO.BB
  5 BB................AA==........e.......V...OOOOOOO.BB
  6 BB................AA==....._______....V...OOOOOOO.BB
  7 BB.MMM..MM..LLLL..AA==..SS._______.SS.V...OOOOOOO.BB
  8 BB.MMM..MM..LLLL..AA==..SS.___h___.SS.V...........BB
  9 BB..................==..SS._______.SS.V...........BB
 10 BB.$................==x.SS._______.SS.V.HHHH..VVV.BB
 11 BB...MMM..LLL..MM...==..SS.........SS.V.HHHH..VVV.BB
 12 BB...MMM..LLL..MM.AA==................V.HHHH..VVV.BB
 13 BB....e...........AA==e.....T...T..e..V.......VVV.BB
 14 BB................AA==................V..t........BB
 15 BB.MM..SSSS..MM...AA==..KK..MM...KK...V.........t.BB
 16 BB.MM..SSSS..MM....e==..KK..MM...KK...V.K....LLL..BB
 17 BB..................==....x...........+.K....LLL..BB
 18 BB..................==================+.........T.BB
 19 BB...LLLL..SSSS...AA==================+.....e.....BB
 20 BB...LLLL..SSSS...AA==..e.............V...........BB
 21 BB.R.......SSSS...AA==.MMMM..SSS..MMM.V.t.HHHHH...BB
 22 BB................AA==.MMMM..SSS..MMM.V...HHHHH...BB
 23 BB.....MMM.......$..==.......SSS......V...HHHHH...BB
 24 BB.@...MMM....KKK...==......KKKK....$.V.....D...T.BB
 25 BB..................==................V...........BB
 26 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 27 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

(`+` = the records gate in the compound wall: closed until the counter hall is kept.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Ileri cloth lanes (x 2-19) | street | The entry and the ROW GATE: stall blocks, lock-ups and shopfronts in narrow lanes, the arcade along the road; the row runner loops the lanes alone (26 tiles) and joins the last wave. |
| Oke-Ayo market road (x 20-37, y 14-25) | lane | The hand-cart road from the lanes to the records gate, stalls and kiosks; an auditor loops its stall block (18 tiles), the row heavy holds the arcade's mouth. |
| Counter hall court (x 20-37, y 2-13) | plaza | The counter hall's arcade round its kept-clear court (the hold zone, radius 2); an auditor loops the court (30 tiles), the hall watch rounds the kiosks east of it (20 tiles), a thrower waits under the arcade. |
| Ledger House records yard (x 38-49) | service | Behind the records gate: the records office tower, the old registry, the archive stores, the three stamp machines, the RECORDS ANNEXE door (`recordsVault`, unchanged) and the annexe heavy. |

Landmarks: the Broad Street office towers and the island bridge approach (north), the Ileri cloth market (west), the
Ledger House board (east).

### Lagos Island mission 2: Press Run in the Press Yards (`lagosIsland.pressYards`, `campaignLagosPressYards`, 50 x 28)

```
    0         1         2         3         4
    01234567890123456789012345678901234567890123456789
  0 OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
  1 OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
  2 BB...BBBB.........V...........e.....BB..........BB
  3 BB.@.BBBB..BBBB...V.eQQQQQ...QQQQQQ.BB.....OOOO.BB
  4 BB...BBBB..BBBB...V..QQQQQ...QQQQQQ.BB.....OOOO.BB
  5 BB.........BBBB.....................BB.....OOOO.BB
  6 BB.$....................t...........BB..........BB
  7 BB................V..KK...QQQQ...KK.BB..KK......BB
  8 BB.R..............V..KK...QQQQ...KK.BB..KK..LLL.BB
  9 BB.....BBB..LLLL..V...........$t....BB......LLL.BB
 10 BBBBB..BBB..LLLL..V.....................t...LLL.BB
 11 BBBBB..BBB..LLLL..VVVVVV..VVVVVV..VV............BB
 12 BBBBB..BBB......x....................x..........BB
 13 BB........e...........................VV++VVVVVVBB
 14 BB........KK........QQQQQ...QQQQQQ....BB..BBBBBBBB
 15 BB..BBBB..KK.BBBB...QQQQQ...QQQQQQ..T.BB..BBBBBBBB
 16 BB..BBBB.....BBBB...QQQQQ.............BBe.BBBBBBBB
 17 BB..BBBB.....BBBB.........t.........e.BB..K..BBBBB
 18 BB...........BBBB..............QQQ....BB..K..BBBBB
 19 BB........T.........LL...VVVV..QQQ..T.BB.....BBBBB
 20 BBLL................LL...VVVV..QQQ....BB.....BBBBB
 21 BBLL..BBBB..........LL.........QQQ....BB.....BBBBB
 22 BBLL..BBBB..BBBB..........$..e......t.BB.e...BBBBB
 23 BB....BBBB..BBBB...........LLL........BB.....BBBBB
 24 BB..........BBBB...VVVVV...LLL...LLL..BB.>...BBBBB
 25 BB....................................BB.....BBBBB
 26 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 27 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

(`+` = the press lane's Ring checkpoint: closed until the five presses are wrecked.)

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Back streets (x 2-17) | lane | The entry and the PRESS GATE: old houses, lock-ups and kiosks on narrow secondary streets; a hired street enforcer walks the middle street end to end (15 tiles each way). |
| Ireti substation (x 18-47, y 2-12) | works | A walled compound of transformer halls and switch kiosks with three gateways, the lane head yard east of it; three presses, the press minder (heavy), the bureau auditor's office corner. |
| Olumo pump house yard (x 18-37, y 13-25) | service | Pump halls, stores, the tank plinths' wall and a tree line; two presses, the bottle pressman, the lane thrower watching the yard. |
| The press lane (x 38-47, y 13-25) | street | The only way out: a 2-wide lane between the houses behind its checkpoint, a back court; the lane guard loops its head (12 tiles), the lane heavy stands at its narrow end, the PRESS LANE exit at its foot. |

Landmarks: the Ireti substation gantry (north), the substation board and the pump house's raised tank over the lane
(east), the back-street traders (west).

### The bosses (unchanged, decision WE8)

Neither boss was bounded. The Ebute Metta boss (dispatch windows) has its switches and crew in the station / rail yard
column, but its stage hazards span the whole board: traffic and trucks on the full width of Murtala Muhammed Way / Apapa
Road, goods strikes at the Oyingbo arcade (row 7), the washes on the Oko-Baba and Otumara foreshore (row 36). A corridor
that keeps every hazard firing would be rows 7-36 of the 39-row map, i.e. nearly all of it; a smaller one would switch
hazards off. The Lagos Island boss (evidence run) places its ledgers and presses across the whole map (x 6-50, y 2-34) in
its three phases; there is no coherent part that holds them. Both stay on their whole district maps, recipe and numbers
unchanged (never half-moved).

### What is new, expanded, reused, unchanged

| Item | Status |
| --- | --- |
| The Iron Lane Freight Yard board: cargo streets, level crossing, goods sidings and their gate, works compounds (50 x 30) | NEW (campaign-only geography) |
| The Ledger Lanes board: cloth lanes, market road, counter hall court, records yard and its gate (52 x 28) | NEW (campaign-only geography) |
| The Press Yards board: back streets, substation, pump house yard, press lane and its checkpoint (50 x 28) | NEW (campaign-only geography) |
| Yard Approach, Ledger Row and Press Run play areas | EXPANDED: 462 -> 879, 224 -> 831 and 198 -> 736 walkable tiles, 4 sub-areas each |
| The three missions' routes, enemy posts and patrols, equipment, hold zones, doors and exits | NEW (re-authored on the new boards) |
| Leg kinds, labels, door / raid ids (`shed` / `junctionToolShed`, `annexe` / `recordsVault`), groups, clocks and pars | UNCHANGED |
| Press Run's "lanes" street walker (Ring security -> a hired agbero) and its pressmen (two market enforcers -> a heavy and a thrower) | CHANGED encounters (WE7) |
| The two district bosses | UNCHANGED (whole district maps, WE8) |
| Cover objects, looks, night looks, floor colours, viaduct, skyline, signs, umbrellas, stalls | REUSED (the districts' Rumble kits; the trailers, water tank and gantry are a few procedural boxes; no new model, texture or audio) |
| The City Rumble Ebute Metta and Lagos Island maps, Classic, City Rumble, multiplayer | UNCHANGED (layout hashes and digests pinned) |

### Measurements

Same scripts and seeds as Oshodi's; "old" = the old sectors of the Rumble maps on `662f8e2`.

| Measure | Yard Approach old -> new | Ledger Row old -> new | Press Run old -> new |
| --- | --- | --- | --- |
| Walkable tiles of the play area | 462 -> 879 | 224 -> 831 | 198 -> 736 |
| Scripted playthrough (6 seeds) Easy / Normal / Hard won | 6/6/5 -> 6/6/6 | 6/6/5 -> 6/6/6 | 5/4/5 -> 6/6/6 |
| Field seconds Easy / Normal / Hard (mean of wins) | 103.6 / 112.0 / 130.4 -> 110.9 / 109.0 / 159.7 | 83.4 / 100.0 / 118.3 -> 115.5 / 125.3 / 125.6 | 99.0 / 115.1 / 142.0 -> 91.4 / 106.7 / 150.8 |
| Lives used Easy / Normal / Hard (mean) | 0 / 0 / 1.50 -> 0 / 0 / 0.50 | 0 / 0 / 0.83 -> 0 / 0 / 0.50 | 0 / 0 / 0.17 -> 0 / 0 / 0.17 |
| Human-like bait on the default target, Normal (8 seeds): first try / within two | 5/8, 7/8 (area boy) -> 8/8, 8/8 (agbero) | 1/8, 1/8 (Ring security) -> 7/8, 8/8 (area boy) | 1/8, 1/8 (Ring security) -> 8/8, 8/8 (agbero) |
| Plain-sight fairness probe (4 seeds, at most 1 caught) | 0/4 -> 0/4 | 0/4 -> 0/4 | 0/4 -> 0/4 |
| Ordinary roamers on a moving patrol (readability probe) | 2/4 -> 3/4 | 4/4 -> 4/4 | 2/4 -> 2/2 |

Readability probe (`scripts/readability.ts normal`, the three missions): pursued 34 -> 30 of 44 probes, reached adjacent
2.9 % -> 10.0 %, human hurt by that enemy 2.9 % -> 6.7 %, by anyone 55.9 % -> 13.3 %, chase length mean 2.1 -> 2.0 s (p95
6.9 -> 3.8 s), back on route median 3.4 -> 3.4 s. The "badly placed generator" drill (`tests/field-districts-ebute-lagos-lekki.test.ts`)
passes for every tested seat. The field-mission Hard / Easy comparison over the five missions of that file still holds.

### Render cost

`node scripts/campaign-perf.mjs field:ebuteMetta.approach,field:lagosIsland.approach,field:lagosIsland.press low,high` on a
740 x 360 page (device scale 1): old = the base `662f8e2` build (the old sectors of the Rumble maps), new = this branch's
build, one pass each. **Software rendering (SwiftShader on shared cores): the columns compare the two builds on the same
machine; they are not phone timings and no claim about real phones is made.** Draw calls, triangles, geometries and
textures are the deterministic columns; build and frame times vary between identical runs.

| Mission | Quality | Build ms old / new | Draw calls old / new | Triangles old / new | Geometries old / new | Textures old / new | Frame mean ms old / new | Frame p95 ms old / new | AI ms / tick old / new |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ebuteMetta.approach` | low | 2445 / 2360 | 269 / 155 | 818298 / 448540 (-45 %) | 209 / 165 | 172 / 168 | 779 / 582 | 1900 / 1217 | 0.78 / 0.45 |
| `lagosIsland.approach` | low | 2505 / 2718 | 292 / 160 | 722791 / 506317 (-30 %) | 260 / 162 | 180 / 140 | 470 / 670 | 1117 / 1550 | 0.39 / 0.56 |
| `lagosIsland.press` | low | 2218 / 2592 | 276 / 116 | 717682 / 417912 (-42 %) | 263 / 142 | 173 / 139 | 431 / 520 | 950 / 1250 | 0.30 / 0.32 |
| `ebuteMetta.approach` | high | 1921 / 2150 | 608 / 390 | 2182173 / 1315299 (-40 %) | 281 / 206 | 246 / 247 | 824 / 1366 | 2400 / 3717 | 0.56 / 0.93 |
| `lagosIsland.approach` | high | 1926 / 2402 | 592 / 411 | 2038549 / 1468819 (-28 %) | 295 / 210 | 256 / 221 | 1328 / 1603 | 1817 / 3733 | 0.57 / 0.56 |
| `lagosIsland.press` | high | 2124 / 1724 | 613 / 323 | 2199763 / 1233902 (-44 %) | 302 / 203 | 254 / 225 | 1539 / 813 | 2350 / 2400 | 0.46 / 0.52 |

Reading it: as with Oshodi's areas (the "Render cost" rows above), each new board is 1.9-3.7 times the old sector's playable
size and the scene is still cheaper: 28-45 % fewer triangles, 33-58 % fewer draw calls, fewer live geometries and textures
in every row (the old sector built the 75 x 39 / 55 x 39 district's backdrop and the cover inside its render clip). Frame
times on this software renderer are a handful of frames per 4 s sample and move in both directions between runs; the build
times are within the run-to-run spread. The AI cost per tick stays under 1 ms. (`mission fetch KB`, not in the table, is the
scene's audio, which the boards do not change; it was 262-3319 KB new and 262-427 KB old.)

### Screenshots

`docs/screenshots/campaign-guidance-expansion/world/ebuteMetta/` and `.../world/lagosIsland/`: `phone-` 740 x 360 and
`phoneWide-` 844 x 390 (device scale 2) and `desktop-` 1280 x 720; the follow camera in each sub-area (Freight Yard: 8x22
the cargo streets, 25x10 the level crossing, 39x10 the sidings, 40x26 the works; Ledger Lanes: 8x18 the lanes, 24x20 the
market road, 30x11 the counter hall, 44x15 the records yard; Press Yards: 8x13 the back streets, 24x9 the substation, 26x22
the pump yard, 41x20 the press lane) and the overview (`-overview`). Taken with `scripts/sector-shots.mjs` on the built game; the
human is staged on the tile, so a shot behind a still-closed gate shows the compass's "no open route".

## Lekki Phase 1

Decisions WL1-WL5. Lekki is a community district: its areas are painted with its own Rumble letters (`LEKKI_LEGEND`, plus the
campaign-only substation `T`) and drawn by the community campaign kit (`lekki: communityCampaignKit(LEKKI_CAMPAIGN_ART)`,
`render/arenas/campaign/lekkiCampaign.ts`): the Rumble Lekki looks, its glass-and-plaster blocks, compound walls with steel
gates and hedges, white villas, palms, kiosks and lock-ups, its pale sand-and-concrete ground. Neither area includes Admiralty
Way, so its interlocking paving (LI7) is not used: every road here is asphalt, as LI7 wants for every road but the boulevard.

```
        (Admiralty Way, Freedom Way, the promenade = the City Rumble map)
                         |                                  |
   lekki.estateGate (S): the Seabreeze gate,  --- back service road ---  lekki.innerEstate (E): the Palmgrove drive,
   its service roads and the standby plant                                the water works and the Coralview substation
```

Legend of the maps below: letters are objects (`B` building, `G` glass block, `S` shop, `V` compound wall, `R` villa, `K`
kiosk / gatehouse booth, `H` hoarding, `P` palm, `L` lock-up, `M` stall, `T` substation), `.` floor, `_` kept clear, `=`
road, `x` barrier crate, `$` supply crate; `@` start, `R` return (on the floor), `D` door, `t` equipment, `h` hold zone
centre, `>` escape exit, `e` an enemy's post, `|` / `-` a sector gate (closed until its leg is done).

### Mission 1, Gate Approach: the Seabreeze Estate Gate (`lekki.estateGate`, `campaignLekkiEstateGate`, 48 x 28)

```
    0         1         2         3         4       
    012345678901234567890123456789012345678901234567
  0 BBBBBBBBBBGGGGGGBBBBBBBBBBBBBBBBBBGGGGGGBBBBBBBB
  1 BBBBBBBBBBGGGGGGBBBBBBBBBBBBBBBBBBGGGGGGBBBBBBBB
  2 BB............................V.==............BB
  3 BB...........t...e............V.==..BBBBBBB...BB
  4 BB..RRRR.P.VVVV...RRRR.P.VVVV.V.==..BBBBBBB...BB
  5 BB..RRRR...VVVV.P.RRRR...VVVV.V.==..BBBBBBB...BB
  6 BB............................V.==.____D____..BB
  7 BB....e......................xV.==._________..BB
  8 BBRR.P.VVVV...RRRR.P.VVVV..RR.V.==............BB
  9 BBRR...VVVV.P.RRRR...VVVV.PRR.V.==P...t.......BB
 10 BB......e.....................V.==..HHH...TTT.BB
 11 BB..P....P....P....P.......KK.|.==........TTT.BB
 12 BB==================__________|.==.t..........BB
 13 BB==================___h______|.==..GGGG....K.BB
 14 BB==================__________|.==e.GGGG......BB
 15 BB....P....P....P....P.....KK.|.==..GGGG..HHH.BB
 16 BB.R......$.......e...........V.==........HHH.BB
 17 BB..SSSS...LLLL....SSSS...GGG.V.==............BB
 18 BB..SSSS...LLLL....SSSS...GGG.V.==P.....t.....BB
 19 BB..SSSS...........SSSS...GGG.V.==..LLLL......BB
 20 BB........x................e..V.==..LLLL..LLL.BB
 21 BB============================V.==........LLL.BB
 22 BB============================V.==............BB
 23 BB............................V.==......$.....BB
 24 BB.@..KK....MM....KK....MM....V.==..KK........BB
 25 BB..........MM..........MM....V.==............BB
 26 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 27 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Seabreeze garden walk (x 2-29, y 2-10) | plaza | Two staggered rows of villa compounds between two-tile walks; a gate tout and a Ring guard loop two compounds, a heavy watches the walk's mouth onto the gate road; one standby feeder stands on the north walk. |
| Estate gate road (x 2-29, y 11-15) | approach | A palm avenue up to the Ring's gatehouse booths; the GATEHOUSE ROAD to keep for 25 s on the checkpoint apron while the gatehouse guard (18-tile loop round the staff quarters, sent at 4 s) and the thrower (11 s) come for it. |
| Coral Close service road (x 2-29, y 16-25) | street | The entry and the way out: the staff quarters, the staff bus kiosks, the SIDE GATE return. |
| Standby plant yard (x 30-45) | works | Behind the checkpoint boom (it lifts once the road is held): the back service road, three standby feeders, the Ring road marshal's 22-tile loop round the estate office, the plant hall and its door (the `standbyPlant` raid, unchanged). |

Landmarks (`areasLekki.ts`): the Phase One glass towers north (the boulevard beyond the wall), the Coral Close staff bus stop
(west), the Seabreeze gatehouse name board (west), the plant floodlights (east).

### Mission 2, Estate Sweep: Palmgrove and the Coralview Substation (`lekki.innerEstate`, `campaignLekkiInnerEstate`, 48 x 28)

```
    0         1         2         3         4       
    012345678901234567890123456789012345678901234567
  0 BBBBRRRRRRRRBBBBBBRRRRRRRRBBBBGGGGGGGGBBBBBBBBBB
  1 BBBBRRRRRRRRBBBBBBRRRRRRRRBBBBGGGGGGGGBBBBBBBBBB
  2 BB...........................V..............e.BB
  3 BB.@.........................|..e.............BB
  4 BB===========================|...TTT.t.TTT....BB
  5 BB===========================|...TTT...TTT....BB
  6 BB.R....e..................e.|...............eBB
  7 BB.RRRR..VVVV..RRRR..VVVV....V......___...t...BB
  8 BB.RRRR..VVVV..RRRR..VVVV.P..V.t....___....BB.BB
  9 BB..................e........V.............BB.BB
 10 BB.VVV.P.....KK....RRRR......V...TTT.t.TTT.BB.BB
 11 BB.VVV.$.....KK....RRRR..P...V...TTT...TTT.BB.BB
 12 BB...........................V..e..........BB.BB
 13 BB.e........LLL...HHHHHH.HHH.V....t...........BB
 14 BB..BBBBB...LLL...TT.........V................BB
 15 BB..BBBBB.........TT.........V..LLLLL...HH....BB
 16 BB..BBBBB.........TT...GGGG..V..LLLLL...HH....BB
 17 BB..........LLL........GGGG..V..........HH....BB
 18 BB..........LLL........GGGG..V..............$.BB
 19 BB..LLL...P..........P.......V................BB
 20 BB..............x............VVxVVVVVVVVVVVVVVBB
 21 BB........................$...................BB
 22 BB============================================BB
 23 BB============================================BB
 24 BB..............................>.............BB
 25 BB......MM..........KK............MM..........BB
 26 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 27 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Palmgrove north drive (x 2-28, y 2-11) | street | The entry: an estate marshal loops a villa compound (16 tiles), the drive heavy holds the inner gate, a thrower the terrace; ESTATE GATE return by the start. |
| Palmgrove water works (x 2-28, y 12-20) | service | The pump house, borehole sheds and treatment tanks; a tanker tout loops the pump house (20 tiles). |
| Coralview substation (x 29-45, y 2-20) | works | Behind the inner estate gate (`lawnGate`, open once the four are down): four transformer pads, five control points, two grid techs looping the pads (26 tiles each), the hound kennels in the north-east corner. |
| Estate service lane (x 2-45, y 21-25) | lane | The escape: SERVICE LANE at the lane's east end, past the back fence (its barrier crate is the short way, the inner gate the long one). |

Landmarks: the Coralview 33 kV line on its masts (north), the Palmgrove water tower (west), the Palmgrove Estate name board
(west), the substation floodlights (east).

### What is new, expanded, reused, unchanged (Lekki)

| Item | Status |
| --- | --- |
| The Seabreeze Estate Gate board: garden walk, gate road and checkpoint, service road, plant yard (48 x 28) | NEW (campaign-only geography) |
| The Palmgrove board: north drive, water works, Coralview substation, service lane (48 x 28) | NEW (campaign-only geography) |
| Gate Approach and Estate Sweep play area | EXPANDED: 225 -> 834 and 402 -> 854 walkable tiles, 4 sub-areas each |
| Routes, posts, patrols, equipment, hold zone, gates, exits | NEW (re-authored on the new boards) |
| Leg kinds, door / raid (`plant` / `standbyPlant`), groups, clock, par, the `lawnGate` id | UNCHANGED (two leg texts name the new places) |
| The substation piece (`T`) | NEW presentation piece (procedural, no texture or model) |
| Looks, cover pieces, ground, set kit | REUSED (Rumble Lekki pieces; the Rumble output unchanged) |
| The City Rumble Lekki map, Admiralty Way and its paving, the boss | UNCHANGED (layout and cover hashes pinned) |

## The Ojuelegba finale

Decisions WL6-WL10. Ojuelegba is the reference arena the story opens on and has its own cover builder, so its areas follow the
Oshodi pattern, not the community kit: a letter kit equal to the Underbridge cover letters (`OJUELEGBA_KIT`) and the reference
builder drawing the area's letter map (`render/arenas/campaign/ojuelegbaCampaign.ts`), with the flyover's girders and pier
shafts carried on over the area's own piers, the late-afternoon look and the reference floor materials. The City Rumble
Ojuelegba arena is untouched (layout pinned); the finale boss keeps its sector of it (`ojuelegba.danfoYard`, FN7).

```
                 ojuelegba.busInterchange (N): the flyover running on north over the bus stops,
                 the under-bridge market and the Ring control yard (mission 20)
                                     |
                 the junction (the City Rumble map; the boss's danfo yard is its east pocket, mission 21)
                                     |
                 ojuelegba.southStreets (S): the motor park, the shop street, the vulcanisers' yard
                 and the corner under the flyover's south ramp (mission 19)
```

Legend: `P` pier (the deck overhead), `D` / `N` parked danfos, `H` shop, `Q` building, `O` workshop, `C` container shop,
`W` wall, `I` kerb island, `K` kiosk, `T` stall, `L` lock-up, `S` shed, `Y` tyre rack, `B` bus stop, `G` generator house,
`J` skip; the markers as above.

### Mission 19, Return to Ojuelegba: the South Streets (`ojuelegba.southStreets`, `campaignOjuelegbaSouthStreets`, 48 x 28)

```
    0         1         2         3         4       
    012345678901234567890123456789012345678901234567
  0 QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ
  1 QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ
  2 QQ...........W................................QQ
  3 QQ..PP.R..PP.W.TTT...CCC...TTT.....DDDDDD.....QQ
  4 QQ..PP....PP.W.TTT...CCC...TTT............NN..QQ
  5 QQ...........W............................NN..QQ
  6 QQI...BBB...IW................................QQ
  7 QQ...........W....CCC...TTT........DDDD.......QQ
  8 QQ..PP....PP.W....CCC...TTT...................QQ
  9 QQ..PP....PP.W..................$.............QQ
 10 QQ...........W.TTT...TTT...CCC.............NN.QQ
 11 QQ...........W.TTT...TTT...CCC.....NN..NN..NN.QQ
 12 QQ------HHHHHW......x..............NN..NN.....QQ
 13 QQt....t.....W.......e...........x............QQ
 14 QQ.e....e....W.HHHHH..HHHHH..HHH...e..........QQ
 15 QQ..YY...OOO.W.HHHHH..HHHHH..HHH....DDDD..SSS.QQ
 16 QQ..YY...OOO.W.HHHHH..HHHHH..HHH..........SSS.QQ
 17 QQ...........W................................QQ
 18 QQ....$......Wt............................NN.QQ
 19 QQ.....OOO...|....................KK.......NN.QQ
 20 QQYYY..OOO...|..TTT..K...TTT..CC........KK..Y.QQ
 21 QQ.....OOO...|..e...........$.................QQ
 22 QQ...........|................................QQ
 23 QQ.GG........Wt.....................DDDD......QQ
 24 QQ.GG.....JJ.W..TTT....TTT....TT............@.QQ
 25 QQ...........W..TTT....TTT....TT..............QQ
 26 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 27 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

| Sub-area | Role | What happens there |
| --- | --- | --- |
| Ijoko motor park (x 34-45) | park | The entry: the danfos drop you here; a Ring patrol (agbero) loops a danfo row. |
| Kekere shop street (x 13-33) | lane | The shop street with its row of stalls down the middle and the back street's stall blocks; a Ring route marshal loops the middle shops; the barrier heavy minds the two barrier locks at the lane barrier. |
| Vulcanisers yard (x 2-13, y 12-25) | works | Behind the lane barrier (open once its locks are blasted): tyre racks, workshops, the generator house; the lock guard and the lane runner loop it; the two gate locks by the corner gate. |
| Flyover ramp corner (x 2-12, y 2-11) | underbridge | Behind the corner gate (open once the gate locks are blasted): two bents of piers under the deck, the bus stop, the JUNCTION CORNER. |

Landmarks: the flyover running on north over the ramp, the Ijoko danfo rank (east), the Kekere traders (north), the
vulcaniser's smoke (west).

### Mission 20, Hold the Junction: the Underbridge Interchange (`ojuelegba.busInterchange`, `campaignOjuelegbaBusInterchange`, 48 x 28)

```
    0         1         2         3         4       
    012345678901234567890123456789012345678901234567
  0 QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ
  1 QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ
  2 QQ............................e....W.e........QQ
  3 QQ..............PP..TTTT....PP.....W..OOOOOO..QQ
  4 QQ.KK...CCC.....PP.......t..PP.....W..OOOOOO..QQ
  5 QQ.KK...CCC.e......................W..OOOOOO..QQ
  6 QQ...........KK......BBB.......KK..W..........QQ
  7 QQ...........KK...........$....KK..W.t....e...QQ
  8 QQ.TTT................h............W...CCC..$.QQ
  9 QQ.........YY.......IIIII..........W...CCC....QQ
 10 QQ............................................QQ
 11 QQ=======II===================================QQ
 12 QQ=======II===================================QQ
 13 QQ=======II===================================QQ
 14 QQ...R.............x..........................QQ
 15 QQ.............t...................W..........QQ
 16 QQ..CCC.......e.PP..TTT.CCC.PP.....W..GGG..JJ.QQ
 17 QQ..CCC..KK.....PP..TTT.CCC.PP.....W..GGG.....QQ
 18 QQ.......KK...................e....W..GGG.....QQ
 19 QQ..@........TTT.....e.........CCC.W..........QQ
 20 QQ.....$.....TTT......TTT......CCC........NN..QQ
 21 QQ.SSS............CCC.TTT..TTT............NN..QQ
 22 QQ.SSS...TTT......CCC......TTT.....x..YY..NN..QQ
 23 QQ.......TTT..TTT.....................YY..NN..QQ
 24 QQ............TTT.......TTT...................QQ
 25 QQ......................TTT...................QQ
 26 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 27 LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
```

| Sub-area | Role | What happens there |
| --- | --- | --- |
| West approach road (x 2-12) | approach | The entry and the way out: kiosks, a container shop, the kerb island at the road's mouth, the WEST PAVEMENT. |
| Underbridge bus stop (x 13-34, y 2-13) | underbridge | Under the deck: the bus stop island and shelter to keep for 25 s; a Ring agbero loops the kiosks by the north girder; one control box. |
| Underbridge market (x 13-34, y 14-25) | street | Stall blocks and container shops between the south piers; the lieutenant beside the control box at the south-west pier, a market enforcer and a Ring guard loop the stalls. |
| Ring control yard (x 35-45) | service | Behind its wall: workshops, the generator house, a danfo rank; the east wave (an area boy, a thrower, sent at 18 s) and a control box. |

Landmarks: the flyover running on north, the interchange danfo rank (west), the under-bridge market traders (west), the
Ring yard floodlights (east).

### What is new, expanded, reused, unchanged (the finale)

| Item | Status |
| --- | --- |
| The South Streets board: motor park, shop street, vulcanisers yard, ramp corner (48 x 28) | NEW (campaign-only streets the Rumble map does not have) |
| The Underbridge Interchange board: west road, bus stop under the deck, market, Ring yard (48 x 28) | NEW (campaign-only) |
| Return to Ojuelegba and Hold the Junction play area | EXPANDED: 218 -> 821 and 190 -> 863 walkable tiles, 4 sub-areas each |
| Routes, posts, patrols, equipment, hold zone, gates, exits; the junction's wave make-up (WL9) | NEW (re-authored) |
| Leg kinds, the Ring gates (`laneBarrier`, `cornerGate`), equipment ids and labels, groups, clock, par | UNCHANGED (the leg texts and briefings name the new places) |
| Piers and deck, danfos, shops, workshops, kiosks, stalls, look, floor materials, flyover set | REUSED (reference arena pieces; its output unchanged) |
| The City Rumble Ojuelegba arena, the finale boss and its sector | UNCHANGED (layout pinned; WL10) |

### Measurements (Lekki and the finale)

The same scripts as the Oshodi rows; the old numbers are the old district sectors on `662f8e2` (scripted play, bait, probes)
and on the base build `0b89d09` (render cost: the scratchpad base build serving the old sectors).

| Measure | Gate Approach old -> new | Estate Sweep old -> new | Return to Ojuelegba old -> new | Hold the Junction old -> new |
| --- | --- | --- | --- | --- |
| Walkable tiles of the play area | 225 -> 834 | 402 -> 854 | 218 -> 821 | 190 -> 863 |
| Scripted playthrough (6 seeds) Easy / Normal / Hard won | 6/6/6 -> 6/6/6 | 6/6/6 -> 6/6/6 | 6/6/6 -> 6/6/6 | 6/6/6 -> 6/6/6 |
| Field seconds Easy / Normal / Hard (mean of wins) | 88.5 / 97.7 / 106.8 -> 98.3 / 115.5 / 149.8 | 82.5 / 83.5 / 105.2 -> 91.7 / 109.4 / 118.8 | 47.3 / 51.4 / 79.3 -> 51.5 / 50.7 / 74.9 | 72.7 / 97.0 / 128.4 -> 85.8 / 83.1 / 89.9 |
| Human-like bait on the default target, Normal (8 seeds): first try / within two | 0/8, 0/8 -> 8/8, 8/8 | 0/8, 0/8 -> 7/8, 8/8 | 8/8, 8/8 -> 8/8, 8/8 | 4/8, 5/8 -> 8/8, 8/8 |
| Plain-sight fairness probe (4 seeds, at most 1 caught) | 0/4 -> 0/4 | 0/4 -> 0/4 | 0/4 -> 0/4 | 0/4 -> 0/4 |
| Ordinary roamers patrolling (`readability.ts normal`) | 2/4 -> 3/4 | 2/5 -> 4/5 | 3/4 -> 4/4 | 0/5 -> 3/4 |

The scripted playthroughs win every level on every seed before and after; the Lekki areas take longer (the boards are 2.1-3.7
times the old sectors and the walk to the plant or the substation is real), the junction is quicker on Hard (its waves come
once the hold is under way, WL9). The bait's default target is the most isolated patroller; on Lekki it used to be Ring
Security, whose keen trap sense walks off a generator at its feet by design (WL3). Every ordinary roamer has an authored
route of 12+ tiles (RC2c); the ones not counted as patrolling are hold-wave members, who hold their post until sent (`field.ts`).

Render cost: `scripts/campaign-perf.mjs <missions> low,high` on a 740 x 360 page, the old sector (base build) against the new
area (this branch), back to back. **Software rendering (SwiftShader) on cores shared with three other workers' builds,
shots and perf runs: the frame times sampled only 2-6 frames and are noise; build ms are too. The scene counters are
deterministic and are the comparison. Never a phone claim.**

| Mission | Quality | Draw calls old / new | Triangles old / new | Geometries old / new | Textures old / new |
| --- | --- | --- | --- | --- | --- |
| `lekki.approach` | low | 268 / 147 | 541358 / 427808 (-21 %) | 299 / 159 | 197 / 159 |
| `lekki.estate` | low | 216 / 131 | 465586 / 405226 (-13 %) | 309 / 139 | 206 / 136 |
| `ojuelegba.return` | low | 235 / 142 | 676391 / 676154 (0 %) | 298 / 182 | 201 / 151 |
| `ojuelegba.junction` | low | 210 / 174 | 428839 / 502682 (+17 %) | 230 / 180 | 181 / 143 |
| `lekki.approach` | high | 644 / 389 | 2030610 / 1310181 (-35 %) | 330 / 208 | 262 / 237 |
| `lekki.estate` | high | 549 / 340 | 1767513 / 1184084 (-33 %) | 334 / 189 | 271 / 207 |
| `ojuelegba.return` | high | 518 / 405 | 1668075 / 1861680 (+12 %) | 321 / 244 | 257 / 230 |
| `ojuelegba.junction` | high | 486 / 452 | 1388937 / 1646620 (+19 %) | 267 / 240 | 233 / 222 |

Reading it: fewer draw calls, geometries and textures in every row (a campaign board builds only its own world, not the
district's backdrop). Triangles fall on Lekki; on the finale they stay level or rise by 12-19 %: each area is about four
times the old sector and both carry the flyover overhead (girders and pier shafts) and dense danfo rows, where the old
sectors showed a corner of the Rumble map. The mission fetch is small on the new areas (87-162 KB; the old sector's
mission fetched 1.6-2.3 MB of the Rumble set's models on some rows).

Screenshots: `docs/screenshots/campaign-guidance-expansion/world/lekki/` and `.../world/ojuelegba/`, `phone-` 740 x 360 and
`phoneWide-` 844 x 390 (device scale 2) and `desktop-` 1280 x 720: the follow camera in the sub-areas (Gate Approach 4x22 the
service road, 12x6 the garden walk, 23x13 the checkpoint apron, 38x9 the plant yard; Estate Sweep 8x3 the drive, 6x18 the
water works, 37x7 the substation; Return 42x20 the motor park, 22x19 the shop street, 7x18 the vulcanisers yard, 7x6 the ramp
corner; Junction 22x8 the bus stop under the deck, 24x18 the market, 40x10 the Ring yard) and the overviews (`-overview`).

### What is left (Lekki and the finale)

- The finale boss stays in its sector of the reference arena (WL10); the Lekki boss on the Rumble map (not in this brief).
- The substation, water tower and power line are procedural pieces; a founder art pass may want models.
- Frame times of the new areas need a quiet machine (or a real device) to compare.
