# WAHALA! City Rumble V2 - five Lagos stages (stream F)

Founder requirement of 2026-10-25: five substantial large-map City Rumble arenas, each a distinct Lagos location
with its own architecture, surroundings, light, hazards and movement. Decisions WF1-WF13 are in `DECISIONS.md`
(section W). Simulation data: `src/sim/arenas/rumble*.ts` (helpers `rumbleKit.ts`); presentation:
`src/render/arenas/rumble*Art.ts` (helpers `rumbleV2Kit.ts`), registered in `newArenas.ts`; menu cards:
`src/ui/RumbleStagePicker.tsx`.

The five stages come first in `RUMBLE_ARENA_IDS`; the original district (`cityRumble`) stays last and unchanged.

## 1. What every stage guarantees (tested in `tests/rumble-stages.test.ts`)

- 32 distinct spawns on open floor with a clear way out, in mirrored pairs (slot 2k west, 2k+1 its 180-degree
  mirror east), spread by farthest-point order (minimum gap >= 12 / 8 / 5 tiles for 8 / 16 / 32 players).
- 4-fold mirror-symmetric layout; every spawn reaches every other spawn and every open tile (crates ignored).
- Survival: the city closes ring by ring from 2:00 left to a core that never closes, reached by 0:30; at every
  step of the closing the still-open city stays one region apart from a few ring tiles briefly sealed behind
  pillars just before their own ring lands (at most 30; the original district peaks at 17); the mandatory
  0:30 / 0:15 trap waves land in the core. Deathmatch and Team never close the city (`modes.ts`).
- Stage hazards: sweeps only on road (`=`) tiles and always entering from the board edge; strike zones on open
  floor; every lethal event telegraphed >= `stage.minLethalWarnTicks` (checked on the live warnings), first event
  >= 8 s in, live events shown on the minimap. Up to two lethal events at once (WF6).
- `createGame` works for Survival / Deathmatch / Team with 32 competitors (team 0 = west half, team 1 = east half),
  roads never get crates, and all three signature vehicles have border entrances.
- 32 bots run every stage in every ruleset without a fault; a full 16-bot Survival match ends with a result.
- The stadium (follow) camera, the minimap (layout, roads, crates, closing ring, live hazards) and the vehicle
  attack entrances are generic and work on every stage.

## 2. The stages

Layout statistics (`npx tsx scripts/rumble-stages.ts --stats`; crates ignored). *Chokepoints* = open tiles
whose loss splits the board (articulation points); *avg corridor* = mean length of the maximal straight runs of
open tiles.

| Stage | Size | Open % | Road % | Avg corridor | Chokepoints | Spawn gap 8/16/32 |
| --- | --- | --- | --- | --- | --- | --- |
| Oshodi Rush Hour (`rumbleOshodi`) | 41 x 31 | 83.5 | 26.2 | 11.1 | 0 | 14 / 10 / 6 |
| Lagos Island Markets (`rumbleLagosIsland`) | 41 x 31 | 69.0 | 18.2 | 5.8 | 134 | 17 / 12 / 5 |
| Ojuelegba Underbridge (`rumbleOjuelegba`) | 41 x 31 | 72.8 | 23.3 | 12.3 | 4 | 17 / 10 / 6 |
| Apapa Docks (`rumbleApapa`) | 45 x 31 | 77.1 | 14.8 | 8.1 | 0 | 16 / 9 / 7 |
| Lekki Nightworks (`rumbleLekkiNight`) | 41 x 31 | 83.8 | 9.6 | 9.9 | 0 | 16 / 11 / 6 |
| *original district (`cityRumble`)* | 41 x 31 | 81.6 | 37.1 | 12.4 | 80 | 16 / 8 / 4 |

### F1 Oshodi Rush Hour - long lanes and traffic cross-fire (the flagship)

- **Layout:** two dual carriageways run the whole width (rows 6-7 and 23-24, opposite directions), two dual roads
  the whole height (columns 10-11 and 29-30), and the red BRT corridor along the centre row under the flyover,
  between two rows of flyover piers. Nine bus-park / market blocks on the classic pillar grid sit between the roads.
  Every road is a crate-free firing lane, so blasts and vehicle attacks reach far; safety is the blocks. Danfo bays
  open off the outer edge in the four corner blocks. Core 13 x 9 under the flyover.
- **Hazards:** buses and kekes race any of ten long routes (both directions, 2 s lane telegraph, 4 ticks per tile);
  Danfos nose into the corner bays and reverse out (2 s). Up to two at once.
- **Look:** bright midday, pale exhaust haze, no lamps. Floor: pavers in the blocks, sun-bleached tarmac with
  yellow double centre lines, white lane edges, zebras, yellow box junctions, the BRT ONLY corridor, BUS STOP bays
  and the flyover deck's hard shadow band. Obstacles: flyover piers in the shadow band, precast bus-park pillars
  elsewhere; tyres, crates, barricades.
- **Surroundings:** the elevated expressway on hammerhead piers across the north with an under-bridge market
  and a slip road dropping east; a covered footbridge over the west carriageway (a walker on it); a green
  direction gantry over the east; BRT shelters at both ends of the corridor; Danfos, kekes and taxis queued in every
  road mouth with idling exhaust; umbrellas, tables, a suya drum, traffic lights; conductors, traders, a warden.

### F2 Lagos Island Markets - tight stall corridors into plazas, chokepoints

- **Layout:** lock-up stall rows (3 x 1 concrete) on every even row, staggered so the one-tile cross alleys never
  line up: north-south movement is a zig-zag through narrow gaps (134 chokepoints, avg corridor 5.8). Shop stubs
  break the long aisles. Four small plazas (5 x 4, a kiosk in the middle) and the central square (the 11 x 9 core)
  are crate-free open ground where the corridors spill out. Market access roads with shopfronts along the north
  and south edges.
- **Hazards:** bales and cartons tumble off shopfronts onto two marked aisle tiles (`goods`, lethal, 1.8 s);
  goods spill into the aisles as four new crates (`merch`, non-lethal route obstructions, never within 2 tiles of
  anyone); kekes and buses crawl along the access roads (2 s).
- **Look:** hot, hazy afternoon (warm ochre light, closer fog), bare bulbs at the edges. Floor: red laterite dust
  on worn concrete, foot-polished aisles, gutters along every stall front, cloth and print mats at the counters,
  paver plazas with kiosk rings. Obstacles: plastered stall piers, poster-covered precast posts in the plazas; bales (sacks),
  cartons, kegs.
- **Surroundings:** tall commercial blocks on three sides with continuous stall rows under rusted sheets and
  patched tarps (cloth, basins, grain, provisions), fictional textile-house boards, a BALOGUN / IDUMOTA banner, a
  buka's wood fire, push trucks of bales, wheelbarrows, umbrellas, kekes and a Danfo at the access roads, traders
  and porters.

### F3 Ojuelegba Underbridge - a pillar forest and two wide roads

> **Superseded (City Rumble Evolution, workstream D):** Ojuelegba is now the five-district 45 x 33 prototype -
> see `RUMBLE_EVOLUTION.md` section D (decisions RE-D1..RE-D10). The description below is the V2 stage it replaced.

- **Layout:** the flyover crosses north-south over columns 13-27: under it a forest of single piers (every other
  tile in six columns) split by two taxi-queue lanes (columns 17 and 23). Either side, a dense neighbourhood of
  3 x 2 buildings with one-tile lanes. Two three-lane roads cross the whole board east-west (rows 6-8, 22-24): wide,
  open and exposed. Core 11 x 9 in the pier forest.
- **Hazards:** buses and kekes race the wide roads (2 s, 4 ticks per tile); taxis charge down the queue lanes
  under the bridge (2 s); vendors dump barrows and tyres in the lanes as three new crates.
- **Look:** late afternoon with a low amber sun from the west (long hard shadows), brown haze; fluorescent tubes
  under the bridge. Floor: the deck's deep shadow over the whole bridge band with stained pier footings and
  expansion-joint drips, hatched yellow TAXI lanes, lane-dashed roads, dusty broken concrete in the lanes.
  Obstacles: flyover piers under the bridge, broken compound walls and precast corners in the streets.
- **Surroundings:** the flyover deck running on north of the board on twin columns with OJUELEGBA on its fascia and
  Danfos crossing on top; the bus stop underneath (benches, kiosk, people waiting), stalls and umbrellas, a
  vulcaniser, the taxi rank, jammed Danfos and kekes at both wide roads, shophouses, poles and wires.

### F4 Apapa Docks - container blocks, long straight aisles, crane strike zones

- **Layout:** stacks of containers (4 x 2 blocks, a 9 x 2 transit shed in each corner, a 7-wide stack on the
  centre line) in a regular grid with two-tile aisles that run straight across the yard: blasts and vehicles
  travel a long way, cover is the end of a stack (vehicle heaven). Two haul roads (columns 11-12 and 32-33) and the
  quay road (rows 1 and 29) are truck lanes; the open loading apron across the middle is the 13 x 9 core.
- **Hazards:** quay cranes lower containers onto marked 2 x 2 aisle zones (`cargo`, lethal, 2.2 s, a container
  descends with a growing shadow and a red light shaft; 28 zones); articulated container trucks (`truck`, their own
  model) race the haul and quay roads (2 s).
- **Look:** humid harbour noon, blue-grey salt haze. Floor: heavy 3 x 3 yard slabs with sealed joints, rust bleeding
  from the stacking pads, yellow slot lines and painted bay codes, arrows on the haul roads, the hatched LOADING
  APRON, a yellow-black safety edge on the quay side. Obstacles: two new stacked-container models (mixed faded
  colours, fictional markings), precast shed panels in the corners; drums, crates, cable drums.
- **Surroundings:** two ship-to-shore gantry cranes on their rails over the quay apron with booms out over a moored
  container ship (deck stacked high, funnel smoke) and the harbour water; container stacks and a transit shed east
  and west; the terminal gate with its booth; articulated container trucks and a fuel tanker queued at the quay
  road; high-mast lights; a straddle carrier; dockers, a gate clerk and a driver arguing over papers.

### F5 Lekki Nightworks - open dug-out site, trenches, debris strikes, scaffold mazes

- **Layout:** each corner holds a scaffold maze around a half-built frame (one-tile passages, dead-end bays, short
  sight lines); the rest is open excavation (83.8 % open, the fewest roads) with few permanent blockers (pile caps,
  culvert boxes, column stubs), lots of crates and permanent trenches (potholes: stumble) and hydraulic-fluid
  slicks (slide). A haul road crosses the site (rows 10, 20) and the site entrances run north-south (12, 28).
- **Hazards:** the tower crane drops debris on a rival's tile (only when they can step away, 1.8 s); excavators and
  the pile driver work 16 marked 2 x 2 danger areas (lethal, 2 s).
- **Look:** the approved Lekki Roadworks night: same sky, fog colour, cold white key light, sodium work lamps,
  exposure and grit; six sodium lamps around the bigger site. Floor: bare laterite and sand, poured slabs under the
  mazes, rolled-gravel haul roads with ruts, excavator track marks, wet hollows that catch the floodlights, survey
  paint and dropped rebar. Obstacles: the new scaffold bay model in the mazes, cast columns with rebar in the dig;
  barricades, cable drums, tyres.
- **Surroundings (all from the Lekki Roadworks kit):** excavators loading a skip and digging the west trench, the
  half-built frame behind scaffold and netting, two tower cranes, the Lekki skyline, lighting towers and a
  generator, the mixer and heaps, the roller on steaming asphalt, the site office, the tar boiler, hoardings, a fire
  drum; the hi-vis crew digging, hauling and arguing; the camera side keeps cones, sandbags, barriers and cable.

## 3. Bots (headless, `scripts/rumble-stages.ts`, real clock)

Standard and Beginner bots mixed (every third seat Beginner), the real rules of each ruleset, no human. Commands:
`npx tsx scripts/rumble-stages.ts --bots --matches 2 --players 16,32` (Survival), `... --matches 1 --game deathmatch
--minutes 5`, `... --game team --minutes 5`. ms/tick (bots + simulation) was measured while five other build streams
shared the 4-core machine (load average 25-38), so it is several times the idle cost; it is only comparable
between rows of the same run.

**Survival** (3:00 clock, the city closes from 2:00 left). Every match ended on its own with a result before the
clock; nobody was buried by the closing city except one bot on Lagos Island; stage hazards took 0-2 bots per match.

| Stage | Bots | Seed | Result | Ended at (s) | Crushed | Hazard deaths | ms/tick |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOshodi | 16 | 116 | winner 6 | 151 | 0 | 0 | 1.42 |
| rumbleOshodi | 16 | 133 | winner 6 | 62 | 0 | 0 | 1.70 |
| rumbleOshodi | 32 | 132 | winner 19 | 105 | 0 | 0 | 1.33 |
| rumbleOshodi | 32 | 149 | draw | 65 | 0 | 0 | 1.65 |
| rumbleLagosIsland | 16 | 116 | winner 9 | 114 | 0 | 0 | 0.72 |
| rumbleLagosIsland | 16 | 133 | winner 3 | 68 | 0 | 0 | 0.80 |
| rumbleLagosIsland | 32 | 132 | winner 20 | 69 | 0 | 0 | 1.24 |
| rumbleLagosIsland | 32 | 149 | winner 24 | 77 | 1 | 1 | 1.80 |
| rumbleOjuelegba | 16 | 116 | winner 9 | 62 | 0 | 1 | 1.04 |
| rumbleOjuelegba | 16 | 133 | winner 3 | 92 | 0 | 1 | 0.86 |
| rumbleOjuelegba | 32 | 132 | winner 14 | 40 | 0 | 2 | 2.16 |
| rumbleOjuelegba | 32 | 149 | draw | 28 | 0 | 0 | 2.39 |
| rumbleApapa | 16 | 116 | draw | 92 | 0 | 0 | 1.37 |
| rumbleApapa | 16 | 133 | winner 13 | 153 | 0 | 0 | 0.74 |
| rumbleApapa | 32 | 132 | winner 12 | 150 | 0 | 0 | 1.02 |
| rumbleApapa | 32 | 149 | draw | 73 | 0 | 0 | 2.20 |
| rumbleLekkiNight | 16 | 116 | winner 0 | 155 | 0 | 0 | 0.78 |
| rumbleLekkiNight | 16 | 133 | winner 9 | 56 | 0 | 0 | 0.85 |
| rumbleLekkiNight | 32 | 132 | winner 3 | 29 | 0 | 0 | 2.06 |
| rumbleLekkiNight | 32 | 149 | winner 13 | 152 | 0 | 1 | 0.91 |
| cityRumble | 16 | 116 | winner 15 | 62 | 0 | 0 | 0.98 |
| cityRumble | 16 | 133 | winner 3 | 50 | 0 | 0 | 0.75 |
| cityRumble | 32 | 132 | winner 2 | 54 | 0 | 0 | 1.29 |
| cityRumble | 32 | 149 | draw | 74 | 0 | 0 | 1.20 |

A draw is a simultaneous final elimination (the last two or three bots caught in the same blast), as on the
original district. Match length varies a lot by seed on every stage (Ojuelegba's wide roads and pier forest give the
fastest 32-bot matches, 28-40 s; Apapa and Lekki the longest, up to 2:35).

**Deathmatch** (5:00, respawns, never closes) and **Team Rumble** (5:00, default split = slot parity = west vs
east, friendly fire off). Every match ran the full clock without a fault.

| Stage | Bots | Deathmatch eliminations | DM top eliminator (slot) | Team eliminations (west - east) |
| --- | --- | --- | --- | --- |
| rumbleOshodi | 16 | 145 | 4 | 17 - 19 |
| rumbleOshodi | 32 | 456 | 18 | 35 - 31 |
| rumbleLagosIsland | 16 | 124 | 14 | 1 - 2 |
| rumbleLagosIsland | 32 | 392 | 22 | 7 - 24 |
| rumbleOjuelegba | 16 | 161 | 3 | 7 - 30 |
| rumbleOjuelegba | 32 | 454 | 12 | 58 - 71 |
| rumbleApapa | 16 | 136 | 7 | 22 - 21 |
| rumbleApapa | 32 | 455 | 22 | 59 - 34 |
| rumbleLekkiNight | 16 | 141 | 15 | 20 - 25 |
| rumbleLekkiNight | 32 | 443 | 28 | 55 - 54 |

Observation for stream D / B: with the interim team awareness at this commit, bots fight far less in Team Rumble than
in Deathmatch on every stage (e.g. Oshodi 16 bots: 145 eliminations in Deathmatch, 36 in Team), and least of all on
Lagos Island, where the two sides start in mirrored mazes (16 bots: 3 eliminations in five minutes). The stages give
both sides identical ground; the low contact comes from the bots' team play, which is D's / B's workstream.

## 4. Screenshots

Real game frames (production build, Chromium with software WebGL, medium quality, 1280 x 720, 8 competitors,
follow camera) captured with `node scripts/rumble-v2-shots.mjs <dir> <arenaId> desktop 8 600` (SPOTS moves the
local player to chosen tiles for a few seconds of live play; the local player keeps spawn protection while the
frames are staged). Working copies: `e2e-shots/rumble-v2/` (ignored by version control); the reviewed set is
committed in `docs/screenshots/rumble-v2/`:

| Stage | Frames |
| --- | --- |
| Oshodi Rush Hour | `rumbleOshodi-desktop-play.jpg` (spawn, west side, BRT shelter), `-spot0` (north carriageway, zebra and box junction), `-spot1` (east edge), `rumbleOshodi-mobile-play.jpg` / `-spot0` (844 x 390 phone) |
| Lagos Island Markets | `rumbleLagosIsland-desktop-play.jpg` (west stall corridors, market blocks beyond the wall), `-spot0` (central square: pavers, kiosk rings, BALOGUN), `-spot1` (north access road and shopfronts) |
| Ojuelegba Underbridge | `rumbleOjuelegba-desktop-play.jpg`, `-spot0` (under the bridge: piers, TAXI lanes, the wide road, the bus stop beyond the wall), `-spot1` (west neighbourhood lanes) |
| Apapa Docks | `rumbleApapa-desktop-play.jpg` (a crane warning live, haul road arrows), `-spot0` (container aisles, bay codes), `-spot1` (east stacks and quay road) |
| Lekki Nightworks | `rumbleLekkiNight-desktop-play.jpg`, `-spot0` (the dig: rebar columns, haul road, survey marks), `-spot1` (a scaffold maze) |

Render cost in those frames (medium): 350-470 draw calls, 1.5-1.75 M triangles (the original district: about 700
calls). The menu card images are `public/previews/<arenaId>.jpg` (640 x 360, HUD hidden).

## 5. Music and voices

Music (`public/audio/music/manifest.json`, one founder track per stage as playlist, start and signature):
Oshodi `pixabay_601035`, Lagos Island `pixabay_554543`, Ojuelegba `pixabay_515507`, Apapa `pixabay_455231`,
Lekki Nightworks `pixabay_623364`.

Voice zones (the lead owns `voices.json`): recommended `bus_park` + `market` for Oshodi and Ojuelegba, `market`
for Lagos Island, `bus_park` for Apapa (drivers and conductors at the terminal gate), none for Lekki Nightworks
(a working site, like Lekki Roadworks).

## 6. Limits

- Judged on software-rendered frames only; nobody has played these stages on a real phone or listened to them.
  Frame rate on real devices is unmeasured (`?fps` and the `q=low` profile are available).
- The follow camera shows the surroundings only near an edge; the expressway (Oshodi), the deck (Ojuelegba) and the
  ship and cranes (Apapa) stand north of the board and were reviewed from edge frames, not close-ups.
- The flyovers over Ojuelegba and Oshodi are suggested on the board by piers and a painted deck shadow (nothing may
  stand over the board); the decks themselves are built only north of it.
- Balance comes from bot batches, not human play. Team Rumble contact is low with the interim team AI (section 3).
- The global grit pass greys the containers by design; their paints are authored bright to survive it.
- The stage picker is not wired into the menu on this branch: stream D's menu has a stand-in with the same props,
  which the lead swaps for `RumbleStagePicker`. The default `rumbleArenaId` is still `cityRumble` (settings belong
  to the lead); `rumbleOshodi` as the default would put the flagship first.
