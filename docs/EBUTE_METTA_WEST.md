# Ebute Metta West: the Ebute-Metta City Rumble arena, expanded westward

Branch `claude/wahala-lagos-enhancement-v1` (the work is committed on a worktree branch built on it). Decisions `EW1`-`EW10` in `docs/DECISIONS.md`. Pure board data and
presentation: no rule, hazard style, sim system, bot or camera rule changed. Campaign lives / respawn, the campaign UI, Lekki and the
bosses were not touched.

The City Rumble arena **Ebute-Metta** (`rumbleEbuteMetta`) was Ebute Metta EAST in character: the colonial terminus, the modern station,
the commuter rail corridor, Oyingbo trade, the mainland houses, the rail yard and the Oko-Baba foreshore. It now carries on to the
**west** with four new districts. The original board is kept tile for tile (its layout, roads, objects, hazards and look are
unchanged); the new ground is genuinely new territory, not a scaled copy.

## 1. What changed, in numbers

Computed by `npx tsx scripts/ebute-stats.ts` (before = the pinned original `tests/ebuteEastOriginal.ts`, after = the live arena):

| Measure | Before | After | Change |
|---|---|---|---|
| Board (tiles) | 55 x 39 = 2145 | 75 x 39 = 2925 | +20 columns |
| Non-wall (open) tiles | 1329 | 1774 | +445 (+33.5 %) |
| Open share of the board | 62 % | 60.6 % | |
| Road and track tiles | 246 | 326 | +80 |
| Open tiles, west team half (x < centre) | 622 | 795 | +27.8 % |
| Open tiles, east team half (x > centre) | 676 | 962 | +42.3 % |
| Largest plain-floor square | 10 x 10 | 10 x 10 | |

| District | Before (open tiles) | After (open tiles) | Change |
|---|---|---|---|
| Abule Ijesha Lanes (`abuleIjesha`) | new | 127 | new district |
| Apapa Road (`apapaRoad`) | new | 144 | new district |
| Ilogbo Quarter (`ilogbo`) | new | 113 | new district |
| Otumara Waterfront (`otumara`) | new | 69 | new district |
| Railway Heritage (`heritage`) | 156 | 156 | unchanged |
| Station Boulevard (`station`) | 181 | 181 | unchanged |
| Oyingbo Trade Quarter (`oyingbo`) | 154 | 154 | unchanged |
| Residential Mainland (`residential`) | 227 | 227 | unchanged |
| Working Rail Yard (`railYard`) | 153 | 153 | unchanged |
| Oko-Baba Foreshore (`foreshore`) | 286 | 286 | unchanged |
| Road and lane tiles outside any district | 172 | 164 | -8 (Murtala Muhammed Way outside the station; the road's old west end now belongs to Apapa Road) |
| **Total** | **1329** | **1774** | **+445** |

* The board grew by **`EBUTE_WEST_DX` = 20** columns on the west (55 -> 75 wide, height 39 unchanged). Every old tile `x` is now
  `ebuteX(x) = x + 20`; the old west border (old x 0-1) is replaced by the new territory, and the old lane at old x 2 (now x 22) stays a lane.
* Non-wall tiles **1,329 -> 1,774 (+445, +33.5 %)**, inside the 1,700-1,800 target. The open share falls from 62.0 % to 60.6 %, so the
  west is built like the east (houses, lanes and yards), not emptier.
* The six original districts keep exactly their old tile counts; the four new ones hold 453 open tiles (the new road carries
  the rest of the gain).
* Team Rumble halves (split by x at the new centre column 37): the west half is 17 % smaller than the east (decision EW5, see 6).

### Before and after, as the game's own ASCII

`#` concrete / object, `=` road and track, `.` floor, `_` plaza, `x` barrier crate, `$` supply crate. Rulers are in tiles. The old board is
columns 20-74 of the new one (compare the right three quarters, row for row).

```
BEFORE (55 x 39)
    0         1         2         3         4         5    
  0 #######################################################
  1 #######################################################
  2 ##.##################................................##
  3 ##.##################.____....____..################.##
  4 ##.##################.____$...____..################.##
  5 ##.######..####..####._#__...$__#_..################.##
  6 ##.$..................____....____..#####..###..####.##
  7 ##.#_______#_________.____....____..............$....##
  8 ##.__________######__$____##..____..##.##.##.##.##...##
  9 ##.__________######__.____##..____x.##.##.##.##.##...##
 10 ##.__________######__.....==..####.$.................##
 11 ##.__#___#___######__...#.==.#####...##.##.##.##.##..##
 12 ##$__________________.....==.$####...##.##.##.##.##..##
 13 ##.__________________x.#$.==..####...............$...##
 14 ##.#####..####..#####...#.==.#####..####..#####..###.##
 15 ##.#####..####..#####.....==..####...................##
 16 =======================================================
 17 =======================================================
 18 =======================================================
 19 =======================================================
 20 #######..#####..######....==........#.....#.....#....##
 21 #######..#####..######....==.####...###...####..###..##
 22 ##.....................##.==.####...###...####..###..##
 23 ######..###...####.....##.==.........................##
 24 ######..###...####........==.####....................##
 25 ######..###...####...x....==.####.....###...####.....##
 26 ##...$....................==..........###...####.$...##
 27 ##........................##.........................##
 28 ##..###.........####......##.......x.................##
 29 ##..###.........####....$.....$......................##
 30 ##..###.........####................$................##
 31 ##...............$....####...#####...................##
 32 ##.......$............####...#####...................##
 33 #####...###...###.....####...#####..........$........##
 34 #####...###...###....................................##
 35 #####...###...###....................................##
 36 ##...................................................##
 37 #######################################################
 38 #######################################################

AFTER (75 x 39)
    0         1         2         3         4         5         6         7    
  0 ###########################################################################
  1 ###########################################################################
  2 #####...####..####..##.##################................................##
  3 #####...####..####..##.##################.____....____..################.##
  4 #####...####..####..##.##################.____$...____..################.##
  5 ##.....................######..####..####._#__...$__#_..################.##
  6 ##..$............$.....$..................____....____..#####..###..####.##
  7 ######...###..####..##.#_______#_________.____....____..............$....##
  8 ######...###..####..##.__________######__$____##..____..##.##.##.##.##...##
  9 #####...###...####..##.__________######__.____##..____x.##.##.##.##.##...##
 10 #####...###...####..##.__________######__.....==..####.$.................##
 11 ##..##......$.....##...__#___#___######__...#.==.#####...##.##.##.##.##..##
 12 ##...........x........$__________________.....==.$####...##.##.##.##.##..##
 13 ##.....................__________________x.#$.==..####...............$...##
 14 ########..######..####.#####..####..#####...#.==.#####..####..#####..###.##
 15 ########..######..####.#####..####..#####.....==..####...................##
 16 ===========================================================================
 17 ===========================================================================
 18 ===========================================================================
 19 ===========================================================================
 20 ######..######..###########..#####..######....==........#.....#.....#....##
 21 ######..######..###########..#####..######....==.####...###...####..###..##
 22 ##.......$......$..........................##.==.####...###...####..###..##
 23 #####...####..###...######..###...####.....##.==.........................##
 24 #####...####..###...######..###...####........==.####....................##
 25 #####...####..###...######..###...####...x....==.####.....###...####.....##
 26 ##.......$...............$....................==..........###...####.$...##
 27 ##............................................##.........................##
 28 #####...###...###.......###.........####......##.......x.................##
 29 #####...###...###.......###.........####....$.....$......................##
 30 #####...###...######....###.........####................$................##
 31 ##..$......#....$....................$....####...#####...................##
 32 ##....x......................$............####...#####...................##
 33 #####...####...###..#####...###...###.....####...#####..........$........##
 34 #####...####...###..#####...###...###....................................##
 35 #####...####..........###...###...###....................................##
 36 ##........$..............................................................##
 37 ###########################################################################
 38 ###########################################################################
```

## 2. Real geography: sources, what is real, what is compressed, what is invented

Research was done with web search on 2026-11-06. **The fetch tool could not reach the news and encyclopedia hosts** (their domains
are outside the session's allowed network: en.wikipedia.org, dailytrust.com, theeagleonline.com.ng did not resolve), so every fact below
comes from search-result summaries, not from reading the pages in full. They are good enough for names and rough relative position; they are
not a survey. Anything that needs a surveyed map (exact street geometry, exact distances) is not claimed.

| Fact used | Source (search result) |
|---|---|
| Ebute Metta is a neighbourhood of Lagos Mainland divided into **Ebute Metta East** and **Ebute Metta West**; the name is Yoruba for "three harbours" (Iddo, Otto, Oyingbo); one summary adds that the railway divides East from West (another summary of the same search says no source states that boundary: treat it as unconfirmed) | [Ebute Metta (Wikipedia)](https://en.wikipedia.org/wiki/Ebute_Metta), [Lagos Mainland (Wikipedia)](https://en.wikipedia.org/wiki/Lagos_Mainland) |
| **Apapa Road** is a ward / street of Ebute Metta East LCDA (wards listed: Ebute Meta, Otto/Iddo, Otto II, Apapa Road, Sabo, Makoko); Ebute Meta West is a ward under Lagos Mainland LGA | [LASIEC electoral wards](https://lasiec.gov.ng/electoral-wards/) |
| The Apapa corridor (Apapa Road, Ijora, Costain, Western Avenue) is a route for trucks, tankers and trailers heading to the port, with long parked queues | [Guardian: Tankers' unending siege to Lagos roads](https://guardian.ng/features/tankers-unending-siege-to-lagos-roads/), [Shipping Position: gridlock on Mile 2 Apapa road](https://shippingposition.com.ng/traffic-gridlock-plagues-mile-2-apapa-road-as-tankers-trucks-overwhelm-commuters/) |
| **Ilogbo** is a community **off Apapa Road in Ebute-Metta** (Dawodu Lane is named). It is not Ilogbo Elegba, which is a different place in Ojo. Only its location is used here | [The Eagle Online: report on a Lagos community off Apapa Road, Ebute-Metta](https://theeagleonline.com.ng/one-killed-houses-burnt-as-gunmen-attack-lagos-community) |
| **Ilaje Otumara** is a riverine community of Ebute Metta West, about five minutes' drive from Apapa Road; riverine, over a century old, in Lagos Mainland LGA | [The Eagle Online](https://theeagleonline.com.ng/lagos-state-community-where-residents-lack-access-to-basic-amenities/), [Daily Trust: Ilaje Otumara, a different kind of Lagos slum](https://dailytrust.com/ilaje-otumara-a-different-kind-of-lagos-slum/) |
| Otumara residents have faced demolition notices (Feb 2025) and the state has said it intends to redevelop Otto and Otumara | [Guardian TV](https://tv.guardian.ng/48-hour-eviction-otumara-residents-in-lagos-fight-to-save-their-homes) |
| **Abule Ijesha** is an area of Yaba (property listings give Morris Street, Alaka Street, Saka Lane; about 3 minutes from UNILAG) | [Nigeria Property Centre listings](https://nigeriapropertycentre.com/unfurnished/lagos/yaba/abule-ijesha) (a commercial listing site: a weak source for position) |
| "Ijero" appears only in the name of a church school in Ebute Metta; no place called **Abule Ijero** was found | search results for "Abule Ijero" |
| The Lagos-Ibadan line stops at Ebute Metta station; a federal push to finish the **Ebute Metta - Apapa seaport** rail link exists | [Transport in Lagos (Wikipedia)](https://en.wikipedia.org/wiki/Transport_in_Lagos), [FMINO](https://fmino.gov.ng/january-commissioning-of-the-lagos-ibadan-rail-project-sacrosanct-fg/), [Vanguard 2018](https://www.vanguardngr.com/2018/08/lagos-ibadan-rail-ready-december/amp/) |
| Ebute Metta is a historic railway neighbourhood (NRC headquarters, Awori / Otto roots); residents have faced demolitions since 2024 | [The Mirror](https://themirroronline.com.ng/ebute-metta-residents-drag-government-to-court-over-unlawful-demolitions/) |

### Plausibility verdict per name

| Name | Real? | Verdict | How the game uses it |
|---|---|---|---|
| **Apapa Road** | Yes: a ward of Ebute Metta East and the road to Apapa | **Plausible, high.** Murtala Muhammed Way is the game's main road (east side); Apapa Road leaving west toward Ijora / Costain is the natural continuation | The four road rows run on to the west edge as Apapa Road (road words "APAPA RD", a worn zebra), with trailer and tanker bays on both shoulders |
| **Ilogbo** | Yes: a community off Apapa Road (not Ilogbo Elegba, Ojo) | **Plausible, high** | Ilogbo Quarter, south of the road: dense older plastered houses, walled compounds and spares workshops |
| **Otumara (Ilaje Otumara)** | Yes: riverine, Ebute Metta West | **Plausible, high; compressed.** Really it is a lagoon-side settlement a few minutes from Apapa Road; here it is the south-west waterfront, which also keeps the arena's lagoon on its south side | Otumara Waterfront: canoe slips, a timber yard, boat-yard lock-ups, a drainage channel, a plank jetty and canoes on the lagoon. Shown as a working waterfront, not as a slum, a demolition or a conflict |
| **Abule Ijesha** | Yes: Yaba area, north of Ebute Metta | **Plausible, medium; compressed and moved.** Really it lies north in Yaba; here it is the north-west lane quarter. Source for position is weak | Abule Ijesha Lanes: plastered houses, compounds, lock-ups, a bukka row, kiosks |
| **Abule Ijero** | **Not found** (only an "Ijero" church school) | **Rejected as a district name** (unverified); not used anywhere in the game | none |
| **Iddo** | Yes: one of the "three harbours", by the lagoon, south of Ebute Metta | **Plausible but not modelled in the west.** It already appears as a sign on the viaduct (`EBUTE-METTA <- IDDO`) | unchanged |
| **Costain** | Yes: bridge / roundabout on the Apapa corridor | **Plausible direction only** (the road and its trucks come from there) | not named; the trailers on Apapa Road imply it |
| **Oyingbo**, **Oko-Baba** | Yes | already in the east | unchanged |
| **Branch / siding track on the Apapa side** | The Ebute Metta - Apapa rail link is real | **Plausible as a hint only.** A real working spur is not claimed | a DISUSED spur (rusted rails, weeds, buffer stop, one signal post and cross-buck sign) in the Ilogbo lane; floor paint plus one cover tile, never a hazard |

### Real, compressed, invented

* **Real:** the names Apapa Road, Ilogbo, Otumara, Abule Ijesha; Apapa Road as the trucking road to the port; older plastered
  houses and walled compounds in the mainland streets; Otumara as a lagoon-side community with canoes; the railway at Ebute Metta.
* **Compressed (selective compression, as the existing arena already does):** four neighbourhoods that sit kilometres apart fit in
  20 x 35 tiles; Abule Ijesha (Yaba) moves from the north to the north-west corner; Otumara moves to the south-west waterfront; the
  Apapa corridor becomes the same four lanes as Murtala Muhammed Way.
* **Invented:** every sign, shop and billboard text (generic wording: PHONE CHARGING, LOTTO RESULTS, APAPA ROAD AUTO PARTS, NEW
  HOMES PLOTS AVAILABLE, FRESH FISH & ICE ... no real business, brand, operator or person); the layout of the streets; the disused spur
  and its signal post; the slips and the jetty; the street life.

## 3. The new districts (tile rectangles, new coordinates)

Rectangles are inclusive `[x0, y0, x1, y1]`, disjoint from the six original districts (which moved by +20 in x).

| District id | Name | Rect(s) | Open tiles | Character |
|---|---|---|---|---|
| `abuleIjesha` | Abule Ijesha Lanes | `[2, 2, 21, 12]` | 127 | three block columns of older plastered houses (`oldHouse`, 2-3 storeys, shuttered windows, balconies, poles), walled compounds, a spares workshop block, a lock-up row and a bukka shop row, a kiosk (PHONE CHARGING), a stall, a rooftop-hoarding shop; lanes 2-3 wide; a two-wide east-west lane (y 5-6) that runs straight into the old lane, and a three-wide service lane (y 11-13) |
| `apapaRoad` | Apapa Road | `[0, 13, 21, 22]` | 144 | the four-lane road (hazard lanes) plus both shoulders: trailers and tankers parked nose to tail (`trailer`: ribbed containers, tanker barrels, cabs) with gaps every 8 tiles for crossings, lock-ups and shops at the ends, a service lane (y 13) and a lane (y 22) |
| `ilogbo` | Ilogbo Quarter | `[2, 23, 21, 31]` | 113 | dense old streets: houses, walled compounds, spares workshops, a stall, the disused spur lane (y 31-32) with its signal post, gateways (y 26-32) onto the old Residential Mainland |
| `otumara` | Otumara Waterfront | `[2, 32, 21, 36]` | 69 | canoes on timber slips (`boatSlip`), a timber stack, boat-yard lock-ups, the waterside walk (y 36) with two lagoon washes, a drainage channel painted on the floor, a plank jetty and three canoes on the water beyond the board |

The old districts, shifted: Railway Heritage `[22, 2, 41, 15]`, Station Boulevard `[42, 2, 53, 19]`, Oyingbo Trade Quarter `[54, 2, 72, 15]`,
Residential Mainland `[22, 20, 41, 36]`, Working Rail Yard `[42, 20, 53, 36]`, Oko-Baba Foreshore `[54, 20, 72, 36]`.

## 4. Connectivity design

* **Seamless road.** Murtala Muhammed Way / Apapa Road is one road: rows y 16-19 are `=` from x 0 to x 74. The traffic and truck sweeps run
  the whole width (75 tiles, edge to edge, 2 s / 2.5 s warning, entering from the board edges as the rules require), and the summoned-vehicle lanes
  sit at the four mouths on each edge.
* **Rail corridor stays where it is** relative to the old board: lanes at x 46-47 (old 26-27), y 10-26 between two solid portals at
  y 8-9 and 27-28; the railcar still runs one lane at a time with its 3.5 s warning. The always-open **track-free route** holds: north of the
  north portal (y 2-7) and south of the south portal (y 29-36) the corridor is open walkway, and the test closes either crossing and
  still reaches the other side.
* **Gateways.** The new territory's east edge (x 20-21) is a facade of lock-ups, shops, compounds and houses with 14 open gateway rows onto the
  old lane (x 22): y 5-6, 11-13, 22, 26-32, 36 (five separate runs), so the join is a set of streets, not a hole in a wall. The north gateways
  line up with the old open rows (y 6 and the garden), the south ones with the old open rows of the Residential Mainland.
* **District graph.** Every new district has at least two links (`abuleIjesha`: Heritage, Apapa Road; `apapaRoad`: Abule Ijesha, Heritage,
  Residential, Ilogbo; `ilogbo`: Apapa Road, Otumara, Residential; `otumara`: Ilogbo, Residential), every link tile is open floor, and every
  one of the 1,774 open tiles is reachable from every one of the 32 spawns.
* **No pockets, no big empty space.** The largest plain-floor square in the west is 4 x 4 (the old board has a 10 x 10 on the foreshore);
  lanes are 2-3 tiles wide and broken by kiosks, stalls and the offsets of the house blocks (a third of the blocks are three tiles
  wide so the lanes zigzag). The share of tiles covered by objects matches the old neighbour of each band within 10 points
  (north band 44 % beside Railway Heritage 44 %; south band 38 % beside Residential Mainland 33 %).
* **Economy.** 9 new supply crates (west 13 / east 13 / 1 on the centre column), 6 floor traps, 2 barrier crates, 2 wash zones; old anchors
  are snapped on the original layout and shifted, so none moved.

## 5. West-side detail (all data-driven)

* **Cover legend** (`EBUTE_LEGEND`): `P oldHouse`, `G compound`, `V workshop` (shared family), `F trailer`, `E hoardingShop`, `O boatSlip`,
  `Z signalPost`, on top of the original letters. The cover list is the original objects first (same variants) and the west's own after
  them (`CommunitySpec.cover`).
* **Buildings and street furniture:** plastered older houses with louvred shutters, shared balconies, lean zinc roofs, rain-streaked
  plaster and utility poles with cross-arms; walled compounds with steel gates, pillars, coping, a roof, a tank and a shade tree; open-front
  spares / mechanic workshops (shared family, west palette and `AUTO PARTS` boards); lock-ups and bukka shops; kiosks and stalls
  (PHONE CHARGING, LOTTO RESULTS, AIRTIME & DATA, PEPPER SOUP); a shop under a rooftop hoarding (invented messages); trailers and tankers;
  canoe slips; the signal post on the disused spur; drain slabs with gratings along house feet; an open drainage channel at Otumara; road words
  and a faded zebra on Apapa Road; more lagoon-side canoes and a jetty; more umbrellas along the north edge.
* **Street life:** `streetLife` (the same `StreetLife.ts` vignettes as the other arenas) goes from 14 to 18 people on the edges, and two living-
  environment crowds are added west of the board (drivers and touts at the trailers, fishers at the slips; the budget system trims them by quality).
* **Look:** the day and night lamps of the west and east edges moved with the board (same count; the original look is unchanged).

## 6. Team Rumble balance and the economy

Team Rumble splits by x at the centre column. The expansion adds ground strictly on the west, but the old board's open floor lies mostly
east of its own centre, so the new centre (old x 17) leaves **795 open tiles in the west half and 962 in the east half (-17 %)**. The
stage test now allows 20 % for this arena (Oshodi allows 12 % for the same reason) and `tests/ebute-west.test.ts` adds the checks that matter
for fairness: the supply crates are exactly balanced per half (13 / 13 / 1 on the centre column), cover share per band matches the
neighbouring old district, and the spawn generator still alternates west / east on the 32 starts. Survival uses the original core
(`x0 = ebuteX(22)`), so a fighter spawned in the new far west walks up to 20 tiles farther to the core than anyone could before; the ring closes at the same schedule and the
Survival bot tests (16 bots to a result, crush deaths <= 3) pass.

## 7. Files and consumers updated

| Area | Files |
|---|---|
| Sim board | `src/sim/arenas/ebuteWest.ts` (new: `EBUTE_WEST_DX`, `ebuteX`, the west rows, anchors, districts), `src/sim/arenas/rumbleEbuteMetta.ts` (old board kept as `paintEast`, `compose`, shifted anchors / hazards / districts / links), `src/sim/arenas/community/arena.ts` (`cover` override) |
| Campaign (coordinates only) | `src/sim/mission/defs.ts` (Ebute dispatch-windows mission: nodes, crew posts, boss post), `src/sim/mission/fieldDefs.ts` (Yard Approach: start, markers, door, enemies); `objectives/windows.ts` reads the arena's train hazard and needed no change |
| Art | `src/render/arenas/ebuteMettaArt.ts` (six families, `THEME_WEST`, `forWest`, floor, set, environment), `src/render/assets/obstacleStyles.ts` (west clutter per district) |
| Tests | `tests/ebute-west.test.ts` (new), `tests/ebuteEastOriginal.ts` (fixture), `tests/arenas.test.ts`, `tests/rumble-stages.test.ts`, `tests/rumble-economy-evolution.test.ts`, `e2e/researched-arenas.spec.ts` |
| Tools | `scripts/ebute-stats.ts`, `scripts/ebute-perf.mjs`, `scripts/map-identity-shots.mjs` (Ebute shots, `EXTRA_SHOTS`), `scripts/researched-pack.mjs` |
| Docs | this file, `docs/DECISIONS.md` (EW1-EW10), `docs/CITY_RUMBLE_RESEARCHED_ARENAS.md`, `docs/MAP_IDENTITY.md`, `docs/IMPLEMENTATION_STATUS.md` |

Menu text (`info.tagline`, `info.hazards`) is on the arena; the menu reads board size, districts and hazards from the registry, so it shows 75 x 39
and ten districts with no UI change. The `area` label stays `Ebute-Metta / Oyingbo` (the reserved boss brief and the researched-map registry pin it).
The menu preview picture `public/previews/rumbleEbuteMetta.jpg` was regenerated by `scripts/arena-previews.mjs`.

## 8. Performance

Measured by `scripts/ebute-perf.mjs` (software WebGL, the normal City Rumble follow camera on the local player staged at three
spots, median of five `stats()` samples per spot; the "static" columns are the visible meshes and triangles of the built scene, an upper
bound of the draw calls, counted like `scripts/map-identity-perf.mjs`). Before = the build before this branch, after = the final build.
The three spots are the same three places of the OLD board (station forecourt, rail yard, the old west garden), so the frames
compare the same content under the same camera; the rest of the new board is only built, not in view.

**Static scene budget (whole board built)**

| View | Quality | Static meshes before | after | change | Static triangles before | after | change |
|---|---|---|---|---|---|---|---|
| desktop 1280x720 | low | 368 | 419 | +13.9 % | 894,112 | 1,149,304 | +28.5 % |
| desktop 1280x720 | medium | 418 | 457 | +9.3 % | 1,126,679 | 1,324,740 | +17.6 % |
| phone 844x390 | low | 370 | 421 | +13.8 % | 906,839 | 1,162,081 | +28.1 % |
| phone 844x390 | medium | 415 | 469 | +13.0 % | 1,117,995 | 1,377,208 | +23.2 % |

**Per-frame draw calls and triangles of the follow camera**

| View | Quality | Spot (follow camera) | Draw calls before | after | Triangles before | after |
|---|---|---|---|---|---|---|
| desktop 1280x720 | low | station | 212 | 201 (-5.2 %) | 1,008,999 | 1,249,168 (+23.8 %) |
| desktop 1280x720 | low | yard | 196 | 191 (-2.6 %) | 942,372 | 1,215,409 (+29.0 %) |
| desktop 1280x720 | low | west-edge-old | 154 | 162 (+5.2 %) | 760,636 | 1,089,249 (+43.2 %) |
| desktop 1280x720 | medium | station | 481 | 471 (-2.1 %) | 2,248,487 | 2,759,824 (+22.7 %) |
| desktop 1280x720 | medium | yard | 454 | 445 (-2.0 %) | 2,146,358 | 2,656,099 (+23.7 %) |
| desktop 1280x720 | medium | west-edge-old | 408 | 417 (+2.2 %) | 1,947,138 | 2,547,239 (+30.8 %) |
| phone 844x390 | low | station | 225 | 203 (-9.8 %) | 1,042,932 | 1,216,224 (+16.6 %) |
| phone 844x390 | low | yard | 196 | 187 (-4.6 %) | 942,356 | 1,188,248 (+26.1 %) |
| phone 844x390 | low | west-edge-old | 163 | 163 (+0.0 %) | 775,099 | 1,101,949 (+42.2 %) |
| phone 844x390 | medium | station | 499 | 481 (-3.6 %) | 2,299,343 | 2,761,860 (+20.1 %) |
| phone 844x390 | medium | yard | 455 | 449 (-1.3 %) | 2,146,731 | 2,663,919 (+24.1 %) |
| phone 844x390 | medium | west-edge-old | 422 | 422 (+0.0 %) | 1,972,784 | 2,564,736 (+30.0 %) |

Reading: **draw calls do not regress** (-10 % .. +5 % at the same spots, i.e. noise: the cover builder bakes every object into a few merged
meshes per chunk, and the crate, pillar and prop models are instanced, one draw call per model however many tiles use it). **Triangles
grow with the playable area**: +17 % .. +31 % per frame at the same spots (+42 % at the old west edge, where the new west comes into
view) and +18 % .. +29 % triangles, +9 % .. +14 % meshes for the whole built scene in the table above. In the figure `docs/MAP_IDENTITY.md` uses (640x360, medium: 618 meshes / 1,726,990 triangles for the old board) the new board is 667 meshes / 1,954,928 triangles (+7.9 % / +13.2 %). A breakdown of that scene shows
where it comes from: the instanced soft-crate and pillar props of the larger board (their instance counts went from 85 / 64 / 56 to 112 /
117 / 68: an instanced mesh is drawn whole, not culled per instance, so its triangles follow the number of crates, which follows the
playable tiles, +33 %), plus the cover (+13 k) and 8 more people. Nothing wasteful was added: no light, post-processing pass or texture, and the quality ladder (`render/quality.ts`) is untouched; the totals are in the range of the other researched boards (`docs/CITY_RUMBLE_RESEARCHED_ARENAS.md` measured about 2.9 M triangles per medium frame for Mushin, Lagos Island and the old Ebute-Metta in its own frames, which are not directly comparable). The follow camera and the quality controller are unchanged; on a slow device the existing Auto ladder trades the
triangles away as it always has.


## 9. Screenshots (real frames of the real game, software WebGL, medium quality, normal City Rumble follow camera)

`docs/screenshots/ebute-west/`, made with `scripts/map-identity-shots.mjs` (`EXTRA_SHOTS` for the before tiles). Before = the build before
this branch's first commit; after = the final build.

| Frame | Before | After |
|---|---|---|
| Whole board (zoomed-out overview, same debug camera and zoom rule): the old board is the right three quarters | ![before whole](screenshots/ebute-west/before_rumbleEbuteMetta_whole.jpg) | ![after whole](screenshots/ebute-west/after_rumbleEbuteMetta_whole.jpg) |
| Station forecourt, tile (31,17) before = (51,17) after: unchanged | ![before follow-station](screenshots/ebute-west/before_rumbleEbuteMetta_follow-station.jpg) | ![after follow-station](screenshots/ebute-west/after_rumbleEbuteMetta_follow-station.jpg) |
| Rail yard, (28,23) before = (48,23) after: unchanged | ![before follow-yard](screenshots/ebute-west/before_rumbleEbuteMetta_follow-yard.jpg) | ![after follow-yard](screenshots/ebute-west/after_rumbleEbuteMetta_follow-yard.jpg) |
| Signal gantry and portal, (26,5) before = (46,5) after: unchanged | ![before follow-gantry](screenshots/ebute-west/before_rumbleEbuteMetta_follow-gantry.jpg) | ![after follow-gantry](screenshots/ebute-west/after_rumbleEbuteMetta_follow-gantry.jpg) |
| The old west garden and lane, (5,9) before = (25,9) after: the old lane now has the new Abule Ijesha facade to its west | ![before follow-west-garden](screenshots/ebute-west/before_rumbleEbuteMetta_follow-west-garden.jpg) | ![after follow-west-garden](screenshots/ebute-west/after_rumbleEbuteMetta_follow-west-garden.jpg) |
| Murtala Muhammed Way near the old west end, (6,17) before = (26,17) after: the road now runs on to the west | ![before follow-west-road](screenshots/ebute-west/before_rumbleEbuteMetta_follow-west-road.jpg) | ![after follow-west-road](screenshots/ebute-west/after_rumbleEbuteMetta_follow-west-road.jpg) |
| Old west residential lanes, (6,30) before = (26,30) after: their west end is now an open gateway into Ilogbo | ![before follow-west-residential](screenshots/ebute-west/before_rumbleEbuteMetta_follow-west-residential.jpg) | ![after follow-west-residential](screenshots/ebute-west/after_rumbleEbuteMetta_follow-west-residential.jpg) |

New ground (after only; there is nothing to compare with before):

| Frame | After |
|---|---|
| Abule Ijesha Lanes, tile (8,7): plastered houses, compounds, the east-west lane | ![after follow-abule](screenshots/ebute-west/after_rumbleEbuteMetta_follow-abule.jpg) |
| Apapa Road north shoulder, (9,14): parked trailers and tankers, the PHONE CHARGING kiosk, a crossing gap | ![after follow-truck-park](screenshots/ebute-west/after_rumbleEbuteMetta_follow-truck-park.jpg) |
| Apapa Road, (8,17): the four lanes with road words and a worn zebra, trailers on both shoulders | ![after follow-apapa-road](screenshots/ebute-west/after_rumbleEbuteMetta_follow-apapa-road.jpg) |
| Ilogbo Quarter, (9,26): dense houses and a walled compound seen from the lane | ![after follow-ilogbo](screenshots/ebute-west/after_rumbleEbuteMetta_follow-ilogbo.jpg) |
| The disused rail spur and its signal post, (11,31): rusted rails flush with the floor, weeds, cross-buck | ![after follow-spur](screenshots/ebute-west/after_rumbleEbuteMetta_follow-spur.jpg) |
| Otumara Waterfront, (10,34): canoe slips and the timber yard by the lagoon edge | ![after follow-otumara](screenshots/ebute-west/after_rumbleEbuteMetta_follow-otumara.jpg) |


## 10. Tests run

Targeted only (no full suite, no full e2e):

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on every changed `src`, `tests`, `scripts`, `e2e` file | clean |
| `npx prettier --check` on every changed non-docs file | clean |
| `npx vitest run tests/ebute-west.test.ts` | 22 passed (size and +33.5 % area, east kept tile for tile, rail lanes and portals shifted, road and sweeps edge to edge, every open tile reachable from all 32 spawns, track-free route north and south, gateways, supplies balanced 13 / 13 / 1, traps / zones / washes on open floor, start tile, ten districts disjoint and linked, no empty square above 4 x 4 in the west, cover share per band, campaign tiles) |
| `npx vitest run tests/arenas.test.ts tests/rumble-stages.test.ts tests/rumble-researched.test.ts tests/ebute-west.test.ts tests/mission-nodes.test.ts tests/mission-objectives.test.ts tests/mission-runtime.test.ts tests/field-missions.test.ts tests/field-nodes.test.ts tests/rumble-economy-evolution.test.ts` | 10 files, 476 passed, 7 skipped (the whole Rumble stage file, including 32-bot runs of Survival / Deathmatch / Team and the 16-bot Survival-to-a-result match on the Ebute board) |
| `npx vitest run tests/render tests/living-env.test.ts tests/campaign-content.test.ts tests/campaign-progress.test.ts tests/campaign-sections.test.ts tests/audio/playlist.test.ts tests/audio/assets.test.ts` | 32 files, 447 passed |
| `npx vitest run tests/rumble-camera.test.ts tests/rumble-app.test.ts tests/rumble-ai.test.ts tests/render/rumble-hazard-art.test.ts tests/render/oshodi-metro-art.test.ts tests/audio/playlist.test.ts` | 6 files, 46 passed |
| `WAHALA_MULTIPROCESS=1 WAHALA_CHROMIUM=/opt/pw-browsers/chromium WAHALA_E2E_PORT=5302 npx playwright test e2e/researched-arenas.spec.ts -g Ebute` (desktop and mobile projects) | 3 passed, 3 skipped by design: Ebute picked from the menu on a 75 x 39 board (desktop), its night look (desktop), and the new phone test at 844 x 390 with exactly two action buttons (mobile) |

(The container's Chromium needs `WAHALA_MULTIPROCESS=1`: the config's `--single-process` launch crashes on its software GL.)


## 11. Known limitations

* Research could not open the news pages (network allow-list); the geography is from search summaries. Abule Ijero is unverified and unused.
  The relative positions of the four neighbourhoods are compressed and rearranged for play, as the original arena already does.
* The west half of the Team Rumble split is 17 % smaller than the east (EW5); supplies and cover are balanced, the area is not. Survival
  fighters spawned in the far west walk farther to the core.
* The old west border facade pieces were removed, so the east facade's `building` variants renumber (cosmetic).
* The disused spur is floor paint and one signal post, not a model of a real siding.
* Software WebGL frame numbers vary; the budget numbers are medians of five samples. Real hardware will differ.

