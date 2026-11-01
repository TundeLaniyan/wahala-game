import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import type { Dir, TilePos } from '../types';
import { line } from './build';
import { RADIAL_CLEARANCE, crossings, rumbleStageConfig, trapGrid } from './rumbleKit';

/**
 * Lagos arenas, build 1 - Oshodi Transport Metropolis: the layered transport nexus as six connected
 * districts on a 63 x 47 board (NOT mirrored; the original 45 x 33 board sits at x 0-44, y 0-32 and the board grew east and south: four expansion districts, decisions LA17-LA21), after the Canonical Lagos Map Build Bible v2 (section 3.2).
 * Selective compression and fictional links only: nothing here claims to be the present-day street plan.
 * The camera looks north, so the bands read far (north) / centre / near (south):
 *
 *   far     O2 Skywalk Quarter (x 9-44, y 0-9): terminal back-of-house, skywalk piers and stair tower, an
 *           arcade, the north rail portal
 *   centre  O3 Trading Streets (x 0-8, the whole west side) | O1 Interchange Plaza (x 9-21) |
 *           O4 Expressway Junction (x 22-32) | O5 Railway Edge (x 33-44): tracks, platforms, station
 *   near    O6 Cappa Works + Recreation (x 9-44, y 23-32): workshops and yard, the Cappa Ground pitch
 *
 * Routes (bible 3.2): direct O3-O1-O4-O5 along the main road, upper O3-O2-O5, lower O3-O6-O5. Cross-links
 * O1-O2, O4-O2, O1-O6, O4-O6 join the bands. No district needs a blast to be reached.
 *
 * Grade separation (the engine is single-level): the Skywalk Quarter and the Cappa band are plain
 * ground-level routes that never touch a road or track tile. The railway runs only through the middle
 * band (x 36-37, y 10-22) and goes under them: its north portal (36-37, 7-9) is a solid block inside O2,
 * its south portal (36-37, 23-25) a solid block inside O6. The platforms (x 38-44) are therefore
 * reachable from the north (y 9|10) and from the south (x 38-40, y 22|23) without ever stepping on a
 * track tile; only the level crossing of the main road is shared with the rail lanes.
 *
 * Layout chars: '#' permanent cover, '=' road and track (traffic / trains / summoned vehicles, never a
 * crate), '_' kept-clear floor (the Cappa Ground pitch), 'x' authored barrier (always a crate),
 * '$' marked supply crate.
 */
const W = 63;
const H = 47;

const LAYOUT = [
  '###############################################################', // 0
  '###############################################################', // 1
  '##...........................................................##', // 2
  '##............##....##......##.#........##.........####......##', // 3
  '#####.###...$.......##......##...$......##....###..####..###.##', // 4
  '#####.###.....................................###........###.##', // 5
  '#####.###..######......###........................#..$..#....##', // 6
  '##.........######..#..x###...######.##..#####................##', // 7
  '###.#$.##..######......###...######.##........###........###.##', // 8
  '##..................................##.............#####.###.##', // 9
  '##........####..####......###.......==....###....#...........##', // 10
  '#####.###.####..####....##....##....==##..###.####..####.....##', // 11
  '##.........#............##....##....==....###.####..####..#..##', // 12
  '##.....x..####.=####.##......$......==...........#######.....##', // 13
  '...............=..................$.==.........................', // 14
  '===============================================================', // 15
  '===============================================================', // 16
  '===============================================================', // 17
  '===============================================================', // 18
  '...................=....x...........==...####....#######.......', // 19
  '#####.###.##.#.$.#.=....##.....####.==#..####................##', // 20
  '#####.###..........=....##.#...####.==...####.######.######..##', // 21
  '##........##...##..###.....#........==...####.......$........##', // 22
  '##...$...........................$..##...####................##', // 23
  '####.##.#.####.####..##.......##....##...####.#####.#######..##', // 24
  '##......#.####.####..##.......##....##...####...#######......##', // 25
  '##......................#........__________................####', // 26
  '#####.###...........x...#......____________....####.#.####...##', // 27
  '#####.###..##...###............____________....####.#.####...##', // 28
  '#####.###..##..................____________...............$..##', // 29
  '##.............................____________.....#######......##', // 30
  '###.......###...........###.............#######..............##', // 31
  '###.......###...........###.............#######...#######....##', // 32
  '##.........#######..........#######.........#######........#.##', // 33
  '##..........................#######........................#.##', // 34
  '##.####..####..####..####.......###...####.....####...####.#.##', // 35
  '##.####..####..####..####.......###...####.....####...####.#.##', // 36
  '##..........................#######........................#.##', // 37
  '##......#.....#.$...#...$.#.............#..######..#......##.##', // 38
  '##..........................#######..........................##', // 39
  '##.####..####..####..####........####......####.....#####....##', // 40
  '##.####..####..####..####............$........#######........##', // 41
  '##..........................#######..........................##', // 42
  '##.###.......######...###..###..........####...####...####...##', // 43
  '##.###................###..###..........####...####...####...##', // 44
  '###############################################################', // 45
  '###############################################################', // 46
];

/** Whole-match floor traps: oil on the main road and by the workshops, potholes in the side streets. */
const TRAP_MARKS = [
  [6, 17, '~'],
  [31, 16, '~'],
  [40, 16, '~'],
  [8, 22, 'o'],
  [12, 3, 'o'],
  [34, 14, 'o'],
  [27, 27, 'o'],
  [4, 26, 'o'],
  // the new districts: oil in the bus park and the Agege strip, potholes in the market and the freight yard
  [8, 39, '~'],
  [20, 34, 'o'],
  [36, 37, '~'],
  [49, 39, 'o'],
  [52, 6, 'o'],
  [48, 3, '~'],
  [58, 31, 'o'],
  [47, 22, '~'],
] as const;

/**
 * Summoned attack vehicles use the main road (four lanes from the west and east edges, through the
 * level crossing). There is no south road: the Cappa band must stay crossable on foot. They never use a track lane, a walking
 * gap or an aisle (the aisles are marked road tiles of their own: a bus bay opens onto the main road).
 */
const LANES: [number, number, Dir][] = [
  [0, 15, 'right'],
  [0, 16, 'right'],
  [0, 17, 'right'],
  [0, 18, 'right'],
  [W - 1, 15, 'left'],
  [W - 1, 16, 'left'],
  [W - 1, 17, 'left'],
  [W - 1, 18, 'left'],
];

/** The two track lanes of the railway edge (tile columns), portal to portal. */
export const OSHODI_TRACK_X = [36, 37] as const;
export const OSHODI_TRACK_Y: readonly [number, number] = [10, 22];

/** Traffic waves: the four lanes of the main road. */
const TRAFFIC_ROUTES: [number, number][][] = [
  line([0, 17], [W - 1, 17]),
  line([0, 18], [W - 1, 18]),
  line([W - 1, 15], [0, 15]),
  line([W - 1, 16], [0, 16]),
];
/** Bus-bay departures: the north bay (15, 13) east along lane 17, the south bay (19, 21) west along lane 16. */
const DEPARTURE_ROUTES: [number, number][][] = [
  [...line([15, 13], [15, 17]), ...line([16, 17], [W - 1, 17])],
  [...line([19, 21], [19, 16]), ...line([18, 16], [0, 16])],
];
/** The commuter line: northbound on column 36, southbound on column 37, portal to portal. */
const TRAIN_ROUTES: [number, number][][] = [
  line([OSHODI_TRACK_X[1], OSHODI_TRACK_Y[0]], [OSHODI_TRACK_X[1], OSHODI_TRACK_Y[1]]),
  line([OSHODI_TRACK_X[0], OSHODI_TRACK_Y[1]], [OSHODI_TRACK_X[0], OSHODI_TRACK_Y[0]]),
];

/**
 * The 32 starts, in slot order (even slots west of the centre line, odd slots east: Team Rumble splits by x),
 * slot 0 - the human - in the south-west of the Trading Streets. Chosen offline by a seeded max-min search over
 * every open floor tile that has the radial-blast way out (`RADIAL_CLEARANCE`) and is not on or beside a rail
 * lane, a trap or within two steps of a supply crate; scored on spread (8 / 16 / 32 starts at least 12 / 8 / 4
 * tiles apart), the walking distance of each half to the core and to a supply crate, and at least one start in
 * every district. tests/rumble-oshodi.test.ts re-checks every property.
 */
const SPAWNS: TilePos[] = [
  { x: 2, y: 39 },
  { x: 60, y: 2 },
  { x: 28, y: 6 },
  { x: 39, y: 44 },
  { x: 20, y: 20 },
  { x: 43, y: 13 },
  { x: 2, y: 13 },
  { x: 55, y: 31 },
  { x: 27, y: 41 },
  { x: 32, y: 26 },
  { x: 14, y: 9 },
  { x: 50, y: 40 },
  { x: 21, y: 33 },
  { x: 39, y: 2 },
  { x: 5, y: 2 },
  { x: 59, y: 19 },
  { x: 28, y: 31 },
  { x: 35, y: 38 },
  { x: 16, y: 2 },
  { x: 48, y: 9 },
  { x: 30, y: 19 },
  { x: 45, y: 36 },
  { x: 26, y: 24 },
  { x: 33, y: 10 },
  { x: 22, y: 9 },
  { x: 59, y: 10 },
  { x: 10, y: 39 },
  { x: 39, y: 32 },
  { x: 13, y: 27 },
  { x: 46, y: 28 },
  { x: 19, y: 42 },
  { x: 58, y: 41 },
];

export const OSHODI_METRO_DISTRICTS: DistrictDef[] = [
  { id: 'interchangePlaza', name: 'Interchange Plaza', role: 'plaza', rects: [[9, 10, 21, 22]] },
  { id: 'skywalkQuarter', name: 'Skywalk Quarter', role: 'concourse', rects: [[9, 0, 44, 9]] },
  { id: 'tradingStreets', name: 'Trading Streets', role: 'street', rects: [[0, 0, 8, 32]] },
  { id: 'expresswayJunction', name: 'Expressway Junction', role: 'approach', rects: [[22, 10, 32, 22]] },
  { id: 'railwayEdge', name: 'Railway Edge', role: 'rail', rects: [[33, 10, 44, 22]] },
  { id: 'cappaWorks', name: 'Cappa Works + Recreation', role: 'works', rects: [[9, 23, 44, 32]] },
  // the eastern and southern expansion (board 63 x 47): a market, a freight yard, a bus park and a strip
  { id: 'papaAjao', name: 'Papa Ajao Market', role: 'street', rects: [[45, 0, 62, 18]] },
  { id: 'freightYard', name: 'Freight Yard', role: 'rail', rects: [[45, 19, 62, 32]] },
  {
    id: 'busPark',
    name: 'Interstate Bus Park',
    role: 'concourse',
    rects: [
      [0, 33, 31, 42],
      [0, 43, 29, 46],
    ],
  },
  {
    id: 'agegeStrip',
    name: 'Agege Motor Strip',
    role: 'street',
    rects: [
      [32, 33, 62, 42],
      [30, 43, 62, 46],
    ],
  },
];

export const OSHODI_METRO_LINKS: DistrictLink[] = [
  // direct route O3-O1-O4-O5: the main road and both pavements
  {
    from: 'tradingStreets',
    to: 'interchangePlaza',
    kind: 'open',
    tiles: crossings(LAYOUT, 8, 10, 8, 22, 1, 0),
  },
  {
    from: 'interchangePlaza',
    to: 'expresswayJunction',
    kind: 'open',
    tiles: crossings(LAYOUT, 21, 10, 21, 22, 1, 0),
  },
  {
    from: 'expresswayJunction',
    to: 'railwayEdge',
    kind: 'open',
    tiles: crossings(LAYOUT, 32, 10, 32, 22, 1, 0),
  },
  // upper route O3-O2-O5: along the Skywalk Quarter, down onto the platforms north of the main road
  { from: 'tradingStreets', to: 'skywalkQuarter', kind: 'open', tiles: crossings(LAYOUT, 8, 2, 8, 9, 1, 0) },
  { from: 'skywalkQuarter', to: 'railwayEdge', kind: 'open', tiles: crossings(LAYOUT, 33, 9, 44, 9, 0, 1) },
  // lower route O3-O6-O5: along the Cappa band, up onto the platforms south of the main road
  { from: 'tradingStreets', to: 'cappaWorks', kind: 'open', tiles: crossings(LAYOUT, 8, 23, 8, 32, 1, 0) },
  { from: 'cappaWorks', to: 'railwayEdge', kind: 'open', tiles: crossings(LAYOUT, 33, 22, 44, 22, 0, 1) },
  // cross-links between the bands and the middle
  {
    from: 'interchangePlaza',
    to: 'skywalkQuarter',
    kind: 'open',
    tiles: crossings(LAYOUT, 9, 9, 21, 9, 0, 1),
  },
  {
    from: 'expresswayJunction',
    to: 'skywalkQuarter',
    kind: 'open',
    tiles: crossings(LAYOUT, 22, 9, 32, 9, 0, 1),
  },
  { from: 'interchangePlaza', to: 'cappaWorks', kind: 'open', tiles: crossings(LAYOUT, 9, 22, 21, 22, 0, 1) },
  // the expansion: east of the railway and the Skywalk Quarter, south of the Cappa band and the Trading Streets
  { from: 'skywalkQuarter', to: 'papaAjao', kind: 'open', tiles: crossings(LAYOUT, 44, 2, 44, 9, 1, 0) },
  { from: 'railwayEdge', to: 'papaAjao', kind: 'open', tiles: crossings(LAYOUT, 44, 10, 44, 18, 1, 0) },
  { from: 'cappaWorks', to: 'freightYard', kind: 'open', tiles: crossings(LAYOUT, 44, 23, 44, 32, 1, 0) },
  { from: 'papaAjao', to: 'freightYard', kind: 'open', tiles: crossings(LAYOUT, 45, 18, 62, 18, 0, 1) },
  { from: 'tradingStreets', to: 'busPark', kind: 'open', tiles: crossings(LAYOUT, 0, 32, 8, 32, 0, 1) },
  { from: 'cappaWorks', to: 'busPark', kind: 'open', tiles: crossings(LAYOUT, 9, 32, 31, 32, 0, 1) },
  { from: 'cappaWorks', to: 'agegeStrip', kind: 'open', tiles: crossings(LAYOUT, 32, 32, 44, 32, 0, 1) },
  { from: 'freightYard', to: 'agegeStrip', kind: 'open', tiles: crossings(LAYOUT, 45, 32, 62, 32, 0, 1) },
  {
    from: 'busPark',
    to: 'agegeStrip',
    kind: 'open',
    tiles: [...crossings(LAYOUT, 31, 33, 31, 42, 1, 0), ...crossings(LAYOUT, 29, 43, 29, 46, 1, 0)],
  },
  {
    from: 'expresswayJunction',
    to: 'cappaWorks',
    kind: 'open',
    tiles: crossings(LAYOUT, 22, 22, 32, 22, 0, 1),
  },
];

export const RUMBLE_OSHODI: ArenaDef = {
  id: 'rumbleOshodi',
  name: 'Oshodi Transport Metropolis',
  kind: 'rumble',
  layout: LAYOUT,
  spawns: SPAWNS,
  spawnClearance: RADIAL_CLEARANCE,
  mirrorSoftBlocks: false,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: {
    // up to two lethal stage events at once (the board is twice the first build: with one slot the road waves and
    // bus departures starved the railcar), each separately warned and never within the quiet seconds
    ...rumbleStageConfig({ core: { w: 11, h: 9, x0: 21, y0: 12 }, softDensity: 0.46, maxLethalEvents: 2 }),
    vehicles: { lanes: LANES },
  },
  floorTraps: trapGrid(TRAP_MARKS, W, H),
  // the endgame waves land in the core (x 21-31, y 12-20: the plaza's east edge and the junction), on and beside the main road
  endgameTraps: [
    trapGrid(
      [
        [23, 14, 'o'],
        [26, 13, '~'],
        [29, 14, 'o'],
        [26, 17, '~'],
        [25, 19, 'o'],
        [28, 20, '~'],
      ],
      W,
      H,
    ),
    trapGrid(
      [
        [24, 14, '~'],
        [28, 12, 'o'],
        [30, 14, '~'],
        [23, 16, 'o'],
        [22, 19, 'o'],
        [27, 19, '~'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      // signalled traffic waves on the main road (right-hand traffic: eastbound south lanes, westbound
      // north). The lane burns down
      // 2 s before the vehicle enters it.
      kind: 'sweep',
      style: 'traffic',
      routes: TRAFFIC_ROUTES,
      stepTicks: 4,
      firstAtSec: 8,
      everySec: [5, 8],
      warnSec: 2,
    },
    {
      // the bus-bay departures (RE-E3): a loaded bus waits in its bay (north bay (15, 13), south bay
      // (19, 21)), pulls out down / up the marked aisle onto the main road and leaves at the edge. The
      // sim holds the announcement while anyone on the lane could not walk off it in time.
      kind: 'sweep',
      style: 'danfo',
      depart: true,
      routes: DEPARTURE_ROUTES,
      stepTicks: 6,
      firstAtSec: 14,
      everySec: [9, 14],
      warnSec: 2.5,
    },
    {
      // the commuter railcar: one track lane at a time, portal to portal (north portal (36-37, 9), south
      // portal (36-37, 23)). A long warning (lane burning down from the entry, bell and horn, crossing
      // lights, HUD alert); both shoulders, the platforms, the Skywalk Quarter and the Cappa band are
      // track-free, so a safe tile is always one step away.
      kind: 'sweep',
      style: 'train',
      routes: TRAIN_ROUTES,
      stepTicks: 4,
      firstAtSec: 18,
      everySec: [16, 24],
      warnSec: 3.5,
    },
    { kind: 'drop', style: 'merch', count: 3, firstAtSec: 20, everySec: [12, 18], warnSec: 1.5 },
  ],
  info: {
    tagline:
      'The layered interchange: trading streets, the terminal plaza, the expressway junction, the railway edge, skywalks above and the Cappa works below.',
    lighting: 'Hazy midday over the interchange',
    hazards: [
      'Buses and kekes race the main road (2 s warning on the lane).',
      'A loaded bus pulls out of its terminal bay onto the road (2.5 s warning, aisle marked).',
      'A commuter railcar runs one track at a time between its bridge portals: lane lights, bell and horn 3.5 s ahead. The shoulders, platforms and the Skywalk and Cappa routes are safe.',
      'Traders drop goods into the lanes - new crates block your route.',
      'From 2:00 left the outer districts fill with concrete; the plaza and junction never close.',
    ],
  },
  districts: OSHODI_METRO_DISTRICTS,
  districtLinks: OSHODI_METRO_LINKS,
  futureBoss: {
    status: 'reserved',
    area: 'Oshodi',
    brief:
      'An original, legally distinct transport-network character, loosely inspired by a locally recognised Oshodi icon to be chosen after documented local review and approved before any art. No real name, face, voice, clothing, biography, catchphrase or branding. Not implemented in the multiplayer map pass.',
  },
};
