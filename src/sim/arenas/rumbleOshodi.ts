import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import type { Dir, TilePos } from '../types';
import { line } from './build';
import { RADIAL_CLEARANCE, crossings, rumbleStageConfig, trapGrid } from './rumbleKit';

/**
 * Lagos arenas, build 1 - Oshodi Transport Metropolis: the layered transport nexus as six connected
 * districts on a 45 x 33 board (NOT mirrored), after the Canonical Lagos Map Build Bible v2 (section 3.2).
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
const W = 45;
const H = 33;

const LAYOUT = [
  '#############################################', // 0
  '#############################################', // 1
  '##.........................................##', // 2
  '##............##....##......##.#........##.##', // 3
  '#####.###...$.......##......##...$......##.##', // 4
  '#####.###..................................##', // 5
  '#####.###..######......###.................##', // 6
  '##.........######..#..x###...######.##..#####', // 7
  '###.#$.##..######......###...######.##.....##', // 8
  '##..................................##.......', // 9
  '##........####..####......###.......==....###', // 10
  '#####.###.####..####....##....##....==##..###', // 11
  '##.........#............##....##....==....###', // 12
  '##.....x..####.=####.##......$......==......x', // 13
  '...............=..................$.==.......', // 14
  '=============================================', // 15
  '=============================================', // 16
  '=============================================', // 17
  '=============================================', // 18
  '...................=....x...........==...####', // 19
  '#####.###.##.#.$.#.=....##.....####.==#..####', // 20
  '#####.###..........=....##.#...####.==...####', // 21
  '##........##...##..###.....#........==...####', // 22
  '##...$...........................$..##...####', // 23
  '####.##.#.####.####..##.......##....##...####', // 24
  '##......#.####.####..##.......##....##...####', // 25
  '##......................#........__________##', // 26
  '#####.###...........x...#......____________##', // 27
  '#####.###..##...###............____________##', // 28
  '#####.###..##..................____________##', // 29
  '##.............................____________##', // 30
  '#############################################', // 31
  '#############################################', // 32
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
  { x: 6, y: 26 },
  { x: 24, y: 2 },
  { x: 20, y: 10 },
  { x: 42, y: 13 },
  { x: 14, y: 30 },
  { x: 26, y: 23 },
  { x: 3, y: 13 },
  { x: 31, y: 9 },
  { x: 2, y: 2 },
  { x: 41, y: 5 },
  { x: 9, y: 21 },
  { x: 26, y: 13 },
  { x: 8, y: 9 },
  { x: 25, y: 30 },
  { x: 20, y: 26 },
  { x: 32, y: 26 },
  { x: 15, y: 4 },
  { x: 30, y: 20 },
  { x: 6, y: 2 },
  { x: 38, y: 6 },
  { x: 14, y: 26 },
  { x: 23, y: 28 },
  { x: 9, y: 30 },
  { x: 30, y: 5 },
  { x: 18, y: 8 },
  { x: 25, y: 9 },
  { x: 18, y: 2 },
  { x: 42, y: 8 },
  { x: 14, y: 12 },
  { x: 27, y: 3 },
  { x: 12, y: 23 },
  { x: 30, y: 30 },
];

export const OSHODI_METRO_DISTRICTS: DistrictDef[] = [
  { id: 'interchangePlaza', name: 'Interchange Plaza', role: 'plaza', rects: [[9, 10, 21, 22]] },
  { id: 'skywalkQuarter', name: 'Skywalk Quarter', role: 'concourse', rects: [[9, 0, 44, 9]] },
  { id: 'tradingStreets', name: 'Trading Streets', role: 'street', rects: [[0, 0, 8, 32]] },
  { id: 'expresswayJunction', name: 'Expressway Junction', role: 'approach', rects: [[22, 10, 32, 22]] },
  { id: 'railwayEdge', name: 'Railway Edge', role: 'rail', rects: [[33, 10, 44, 22]] },
  { id: 'cappaWorks', name: 'Cappa Works + Recreation', role: 'works', rects: [[9, 23, 44, 32]] },
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
  { from: 'tradingStreets', to: 'cappaWorks', kind: 'open', tiles: crossings(LAYOUT, 8, 23, 8, 30, 1, 0) },
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
    // one lethal stage event at a time: the railcar never overlaps traffic or a bus departure
    ...rumbleStageConfig({ core: { w: 11, h: 9 }, softDensity: 0.46, maxLethalEvents: 1 }),
    vehicles: { lanes: LANES },
  },
  floorTraps: trapGrid(TRAP_MARKS, W, H),
  // the endgame waves land in the core where the plaza meets the junction, on and beside the main road
  endgameTraps: [
    trapGrid(
      [
        [19, 14, 'o'],
        [21, 16, '~'],
        [26, 17, '~'],
        [20, 19, 'o'],
        [25, 14, 'o'],
      ],
      W,
      H,
    ),
    trapGrid(
      [
        [22, 14, '~'],
        [18, 17, 'o'],
        [24, 16, 'o'],
        [22, 19, '~'],
        [26, 12, '~'],
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
      everySec: [5, 7.5],
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
