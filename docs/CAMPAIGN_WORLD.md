# Campaign world: campaign-only areas (framework + Oshodi)

Branch `claude/wahala-cg-world`, from production `0b89d09`. Decisions WX1-WX9 (`docs/DECISIONS.md`). Not merged, not deployed.

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

- The other districts (Mushin, Fadeyi/Somolu, Ebute Metta, Lagos Island, Lekki Phase 1, the Ojuelegba finale): the pattern
  above; a community district needs its entry in `KITS` (step 2).
- A campaign-only board for a boss needs the boss recipe's strike lanes on that board; Oshodi's boss stays on the Rumble
  map's corridor (WX9).
- The rail sub-area's siding is walkable track (no train runs into the area); a train on it would need a `train` sweep and
  its warnings.
