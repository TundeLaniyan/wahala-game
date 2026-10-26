import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import type { Dir } from '../types';
import { line } from './build';
import {
  RADIAL_CLEARANCE,
  around,
  balancedSpawns,
  crossings,
  rect,
  rumbleStageConfig,
  tilesOf,
  trapGrid,
} from './rumbleKit';

/**
 * City Rumble Evolution, workstream D - Ojuelegba Underbridge: five connected districts round the
 * Ojuelegba flyover (45 x 33, NOT mirrored). docs/RUMBLE_EVOLUTION.md section D has the map, the routes
 * and the numbers; the look of every district is `src/render/arenas/rumbleOjuelegbaArt.ts` (+ `ojuelegba*.ts`).
 *
 * - Western Approach (x 0-15, y 0-21): the dual carriageway coming in from the west (rows 7-11, a jersey
 *   barrier median on row 9 with crossing gaps), a walled compound and container shops on the north kerb,
 *   a broken-down lorry, a mechanic's shed and a container shop on the south side.
 * - Central Underbridge / Pier Court (x 16-31, y 0-21): under the flyover deck (the deck itself runs on north
 *   of the board, off it). Twin 2 x 2 hammerhead pier bents carry the deck at rows 1-2, 5-6, 13-14 and 18-19;
 *   the under-bridge road runs north between them (x 21-23) and meets the carriageway at the junction. South
 *   of it the pier court (kept clear of crates) with the bus stop shelter is the Survival core.
 * - Eastern Danfo Park (x 32-44, y 0-20): a fenced park; the aisle (x 38-39) runs in from the north gate and
 *   leaves as the departure lane out of the east edge (rows 17-18). Parked Danfos stand nose-in in bays either
 *   side (2 x 2 / 2 x 3 groups of buses); empty bays are kept clear. Gates in the west fence (one wide, two
 *   single) and one into the service road; a zinc panel (breach) each to the pier court and the service loop.
 * - Shopfront Lane (x 0-25, y 22-32): a row of shop buildings faces south onto the lane (doorway recesses),
 *   stalls and kiosks on the south side; back alleys up to the approach (one blocked by barrows = breach).
 * - Rear Service Loop (x 26-44, y 21-32): a one-way service road loop behind the shops and the park with the
 *   generator house, skips, a loading dock with kept-clear loading bays, and spurs out to the east and south
 *   edges (deliveries).
 *
 * Layout chars: '#' permanent cover, '=' road (traffic / summoned vehicles, never a crate), '_' kept-clear
 * floor, 'x' authored barrier (always a crate: blasting it opens a shortcut), '$' marked supply crate.
 */
const W = 45;
const H = 33;

const LAYOUT = [
  '.....................===........#.....==.....', // 0
  '.................##..===..##....#..##_==_##..', // 1
  '.####...####..##.##..===..##.##.#..##_==_##..', // 2
  '......$....#.........===............._==_##..', // 3
  '...........#.........===........#...._==_....', // 4
  '.###..###.....##.##..===..##....#...._==_....', // 5
  '.................##..===..##.##.#..##_==_##..', // 6
  '========================........#.$##_==_##..', // 7
  '========================...........##_==_....', // 8
  '===#####===######=======..........#.._==_....', // 9
  '========================..........#.._==_....', // 10
  '========================.....$.....##_==_##..', // 11
  '...............$..._______......#..##_==_##..', // 12
  '.####............##..###..##....#...._==_##..', // 13
  '.......###.......##.......##..#.x..##_==_....', // 14
  '.......###...##...._______....#.#..##_==_....', // 15
  '.............##...._______......#...._==.....', // 16
  '.###..............._______......#.....=======', // 17
  '......#...###....##_______##.##.......=======', // 18
  '.................##_______##....#............', // 19
  '..................._______......####.####x###', // 20
  '..............................##.............', // 21
  '#####x######..#####..#####.================..', // 22
  '##.##..##.##..##.##..#####.=..............=..', // 23
  '.........................x.=.###...##___#.=..', // 24
  '..........$..............#.=.###.....___#.=..', // 25
  '===........................=.........___#.===', // 26
  '...........................=....$....___#.=..', // 27
  '....#....##....#....##...#.=.......##___#.=..', // 28
  '.........................#.=..............=..', // 29
  '..##........##.............================..', // 30
  '..##........##....##..............==.........', // 31
  '..................##..............==...##....', // 32
];

/** Whole-match floor traps: oil on the carriageway and by the generator house, potholes on the side roads. */
const TRAP_MARKS = [
  [5, 10, '~'],
  [14, 8, '~'],
  [9, 4, 'o'],
  [4, 19, 'o'],
  [7, 26, 'o'],
  [29, 16, '~'],
  [32, 26, '~'],
  [38, 31, 'o'],
  [43, 5, 'o'],
] as const;

/**
 * Summoned attack vehicles enter only at the board's road mouths: the carriageway from the west (not the
 * median row), the under-bridge road from the north, the park gate (north) and the departure lane (east),
 * the service spurs (east, south) and the shop lane's keke stub (west).
 */
const LANES: [number, number, Dir][] = [
  [0, 7, 'right'],
  [0, 8, 'right'],
  [0, 10, 'right'],
  [0, 11, 'right'],
  [21, 0, 'down'],
  [22, 0, 'down'],
  [23, 0, 'down'],
  [38, 0, 'down'],
  [39, 0, 'down'],
  [44, 17, 'left'],
  [44, 18, 'left'],
  [44, 26, 'left'],
  [34, 32, 'up'],
  [35, 32, 'up'],
  [0, 26, 'right'],
];

export const OJUELEGBA_DISTRICTS: DistrictDef[] = [
  { id: 'westApproach', name: 'Western Approach', role: 'approach', rects: [[0, 0, 15, 21]] },
  {
    id: 'pierCourt',
    name: 'Underbridge Pier Court',
    role: 'underbridge',
    rects: [
      [16, 0, 31, 20],
      [16, 21, 25, 21],
    ],
  },
  { id: 'danfoPark', name: 'Eastern Danfo Park', role: 'park', rects: [[32, 0, 44, 20]] },
  { id: 'shopfrontLane', name: 'Shopfront Lane', role: 'lane', rects: [[0, 22, 25, 32]] },
  { id: 'serviceLoop', name: 'Rear Service Loop', role: 'service', rects: [[26, 21, 44, 32]] },
];

export const OJUELEGBA_LINKS: DistrictLink[] = [
  // the carriageway, the north kerb and the south roadside all run on under the deck
  { from: 'westApproach', to: 'pierCourt', kind: 'open', tiles: crossings(LAYOUT, 15, 0, 15, 21, 1, 0) },
  // the park's west fence: a pedestrian gate, the wide forecourt gate, a zinc panel, the south-west gate
  { from: 'pierCourt', to: 'danfoPark', kind: 'chokepoint', tiles: [[32, 3]] },
  { from: 'pierCourt', to: 'danfoPark', kind: 'open', tiles: rect(32, 8, 32, 11) },
  { from: 'pierCourt', to: 'danfoPark', kind: 'breach', tiles: [[32, 14]] },
  { from: 'pierCourt', to: 'danfoPark', kind: 'chokepoint', tiles: [[32, 18]] },
  // behind the pier court the service road starts (skips behind the park)
  {
    from: 'pierCourt',
    to: 'serviceLoop',
    kind: 'open',
    tiles: [...crossings(LAYOUT, 26, 20, 31, 20, 0, 1), ...crossings(LAYOUT, 25, 21, 25, 21, 1, 0)],
  },
  // the park's south fence: a gate, and a zinc panel opposite the loading dock
  { from: 'danfoPark', to: 'serviceLoop', kind: 'chokepoint', tiles: [[36, 20]] },
  { from: 'danfoPark', to: 'serviceLoop', kind: 'breach', tiles: [[41, 20]] },
  // back alleys between the shop buildings
  { from: 'westApproach', to: 'shopfrontLane', kind: 'chokepoint', tiles: rect(12, 22, 13, 22) },
  { from: 'westApproach', to: 'shopfrontLane', kind: 'breach', tiles: [[5, 22]] },
  { from: 'pierCourt', to: 'shopfrontLane', kind: 'chokepoint', tiles: rect(19, 22, 20, 22) },
  // the lane runs on into the loop; the back pavement too; barrows block a hole in the yard wall
  { from: 'shopfrontLane', to: 'serviceLoop', kind: 'open', tiles: rect(25, 26, 25, 27) },
  { from: 'shopfrontLane', to: 'serviceLoop', kind: 'open', tiles: rect(25, 30, 25, 32) },
  { from: 'shopfrontLane', to: 'serviceLoop', kind: 'breach', tiles: [[25, 24]] },
];

export const RUMBLE_OJUELEGBA: ArenaDef = {
  id: 'rumbleOjuelegba',
  name: 'Ojuelegba Underbridge',
  kind: 'rumble',
  layout: LAYOUT,
  // west / east alternate (Team Rumble splits by x); slot 0, the human, in the south-west of the shop lane;
  // never on a trap or within two steps of a supply crate
  spawns: balancedSpawns(LAYOUT, 32, { x: 3, y: H - 4 }, RADIAL_CLEARANCE, [
    ...TRAP_MARKS.map(([x, y]) => [x, y] as const),
    ...around(tilesOf(LAYOUT, '$'), 2),
  ]),
  spawnClearance: RADIAL_CLEARANCE,
  mirrorSoftBlocks: false,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: {
    ...rumbleStageConfig({ core: { w: 11, h: 9 }, softDensity: 0.5 }),
    vehicles: { lanes: LANES },
  },
  floorTraps: trapGrid(TRAP_MARKS, W, H),
  // the endgame waves land in the pier court round the bus stop (core x 17-27, y 12-20)
  endgameTraps: [
    trapGrid(
      [
        [19, 15, 'o'],
        [23, 17, '~'],
        [21, 19, 'o'],
        [25, 14, '~'],
        [20, 12, 'o'],
      ],
      W,
      H,
    ),
    trapGrid(
      [
        [24, 19, '~'],
        [19, 17, 'o'],
        [22, 15, '~'],
        [25, 16, 'o'],
        [24, 12, '~'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      // buses and kekes on the carriageway turning north under the bridge, and back (right-hand traffic)
      kind: 'sweep',
      style: 'traffic',
      routes: [
        [...line([0, 11], [22, 11]), ...line([23, 11], [23, 0])],
        [...line([0, 10], [21, 10]), ...line([22, 10], [22, 0])],
        [...line([21, 0], [21, 6]), ...line([21, 7], [0, 7])],
        [...line([22, 0], [22, 7]), ...line([22, 8], [0, 8])],
      ],
      stepTicks: 4,
      firstAtSec: 10,
      everySec: [5, 8],
      warnSec: 2,
    },
    {
      // Danfo departure: a loaded bus pulls in at the north gate, runs the park aisle and leaves along the
      // departure lane out of the east edge (route data: aisle x 38 / 39, lane rows 17 / 18; workstream E
      // owns the departure presentation and may extend this entry)
      kind: 'sweep',
      style: 'danfo',
      routes: [
        [...line([38, 0], [38, 16]), ...line([38, 17], [44, 17])],
        [...line([39, 0], [39, 17]), ...line([39, 18], [44, 18])],
      ],
      stepTicks: 6,
      firstAtSec: 14,
      everySec: [9, 14],
      warnSec: 2.5,
    },
    { kind: 'drop', style: 'merch', count: 3, firstAtSec: 20, everySec: [12, 18], warnSec: 1.5 },
  ],
  info: {
    tagline:
      'Five districts round the Ojuelegba flyover: the approach, the pier court, the Danfo park, the shops and the service loop.',
    lighting: 'Late afternoon, deep bridge shadow',
    hazards: [
      'Buses and kekes race the western carriageway and turn under the bridge (2 s warning on the lane).',
      'Loaded Danfos leave the park down the aisle and out along the departure lane (2.5 s warning).',
      'Vendors dump barrows and tyres in the lanes - new crates block your route.',
      'From 2:00 left the outer districts fill with concrete; the pier court never closes.',
    ],
  },
  districts: OJUELEGBA_DISTRICTS,
  districtLinks: OJUELEGBA_LINKS,
};
