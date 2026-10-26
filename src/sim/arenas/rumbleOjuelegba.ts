import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import type { Dir } from '../types';
import { line } from './build';
import {
  RADIAL_CLEARANCE,
  around,
  balancedSpawns,
  crossings,
  rumbleStageConfig,
  tilesOf,
  trapGrid,
} from './rumbleKit';

/**
 * City Rumble Evolution, workstream D - Ojuelegba Underbridge: five connected districts round the
 * Ojuelegba flyover (45 x 33, NOT mirrored), after the approved research layout (J-A .. J-E). The camera
 * looks north, so the bands read far (north) / centre / near (south):
 *
 *   far     Rear Service Loop (E): service entrance west - repair court middle - return lane east
 *   centre  Western Approach (A) | Underbridge Pier Court (B) | Eastern Danfo pocket (C)
 *   near    Shopfront Lane (D), west and the middle bend      | the pocket's crossing refuge (C)
 *
 * Always-open links: A-B, B-C, A-D, D-C, A-E, E-C. Destruction-added: B-E through the marked empty
 * workshop-yard partition (the one `x` in the yard wall). Three A-to-C paths: straight through the pier
 * court, the close shopfront flank, the long rear loop. No district needs a blast to be reached.
 *
 * - A (x 0-13, y 11-21): the street narrowing toward the bridge (roadside buildings close in), two short
 *   parking recesses kept clear, kerb islands, an escape pavement along the south.
 * - B (x 14-30, y 11-21): under the deck; three bents of large 2 x 2 / 2 x 3 hammerhead piers: a pair round
 *   the clear bay, a second pair, then a wider opening and an offset bent. The bus stop on the south
 *   pavement. The through road (rows 15-18) runs between the supports. The Survival core.
 * - C (x 31-44, y 11-32): Danfos packed nose-to-tail beside the road, bays south of it, loose parcel stacks
 *   (`x`, alternate crossing angles), the departure strip (x 41-42) where buses pull out onto the road and
 *   leave east, the railed crossing refuge.
 * - D (x 0-30, y 22-32): shops facing south onto a 3-4 wide lane that bends at x 14, stalls and doorway
 *   recesses for rhythm, a marked empty partition opening a cross-passage to the back pavement; low lock-ups
 *   along the camera edge.
 * - E (x 0-44, y 0-10): a loop round the repair workshops (tyre racks, the generator house, a skip), entered
 *   from A (west) and C (east): the long, safe bypass with two exits.
 *
 * Layout chars: '#' permanent cover, '=' road (traffic / summoned vehicles, never a crate), '_' kept-clear
 * floor, 'x' authored barrier (always a crate: blasting it opens a shortcut), '$' marked supply crate.
 */
const W = 45;
const H = 33;

const LAYOUT = [
  '#############################################', // 0
  '#############################################', // 1
  '##..........................................#', // 2
  '##...................$......................#', // 3
  '##....#...###########...########.......###..#', // 4
  '##....#...###########...########.......###..#', // 5
  '##..........................................#', // 6
  '##...$......##.................##..##..$....#', // 7
  '##..........................................#', // 8
  '##.....##############...#############.....###', // 9
  '###....###############x##############.....###', // 10
  '###.....######...........$..##......._____...', // 11
  '......$.##__##..##.....##...##.######.....##.', // 12
  '...##...........##.....##...##.######.....##.', // 13
  '.................._____......................', // 14
  '=============================================', // 15
  '=============================================', // 16
  '=============================================', // 17
  '=============================================', // 18
  '................##_____##................==..', // 19
  '......#..#__##..##.....##..##....####....==..', // 20
  '.........#####.....###.....##....####..$.==.#', // 21
  '#......########################......x...==.#', // 22
  '#......###.####################..####....==..', // 23
  '#.............####.#######.####..####....==..', // 24
  '......................................x..==..', // 25
  '.........$.....................##.x......==..', // 26
  '..##...##..##..................##........==..', // 27
  '...............#######x######............==..', // 28
  '....##...........................####....==..', // 29
  '.............#.............$.............==..', // 30
  '########################################.==..', // 31
  '########################################.==..', // 32
];

/** Whole-match floor traps: oil on the through road and by the generator house, potholes on the side roads. */
const TRAP_MARKS = [
  [6, 16, '~'],
  [37, 17, '~'],
  [4, 24, 'o'],
  [12, 3, 'o'],
  [41, 7, '~'],
  [27, 26, 'o'],
  [43, 28, 'o'],
] as const;

/**
 * Summoned attack vehicles use the through road only (A -> under the bridge -> C and back): its four lanes
 * from the west and east edges, and the departure strip from the depot gate in the south-east. They pass
 * between the piers, never through the walking gaps.
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
  [41, H - 1, 'up'],
  [42, H - 1, 'up'],
];

export const OJUELEGBA_DISTRICTS: DistrictDef[] = [
  { id: 'westApproach', name: 'Western Approach', role: 'approach', rects: [[0, 11, 13, 21]] },
  { id: 'pierCourt', name: 'Underbridge Pier Court', role: 'underbridge', rects: [[14, 11, 30, 21]] },
  { id: 'danfoPark', name: 'Eastern Danfo Pocket', role: 'park', rects: [[31, 11, 44, 32]] },
  { id: 'shopfrontLane', name: 'Shopfront Lane', role: 'lane', rects: [[0, 22, 30, 32]] },
  { id: 'serviceLoop', name: 'Rear Service Loop', role: 'service', rects: [[0, 0, 44, 10]] },
];

export const OJUELEGBA_LINKS: DistrictLink[] = [
  // A-B: the street runs on under the deck (pavements and the through road)
  { from: 'westApproach', to: 'pierCourt', kind: 'open', tiles: crossings(LAYOUT, 13, 11, 13, 21, 1, 0) },
  // B-C: the road strip and both pavements into the bus pocket
  { from: 'pierCourt', to: 'danfoPark', kind: 'open', tiles: crossings(LAYOUT, 30, 11, 30, 21, 1, 0) },
  // A-D: the street corner down into the shop lane
  { from: 'westApproach', to: 'shopfrontLane', kind: 'open', tiles: crossings(LAYOUT, 0, 21, 13, 21, 0, 1) },
  // D-C: the lane and the back pavement run on to the crossing refuge
  { from: 'shopfrontLane', to: 'danfoPark', kind: 'open', tiles: crossings(LAYOUT, 30, 25, 30, 25, 1, 0) },
  { from: 'shopfrontLane', to: 'danfoPark', kind: 'open', tiles: crossings(LAYOUT, 30, 28, 30, 30, 1, 0) },
  // A-E: the service entrance; E-C: the return lane
  { from: 'westApproach', to: 'serviceLoop', kind: 'open', tiles: crossings(LAYOUT, 0, 10, 13, 10, 0, 1) },
  { from: 'serviceLoop', to: 'danfoPark', kind: 'open', tiles: crossings(LAYOUT, 31, 10, 44, 10, 0, 1) },
  // B-E: only by blasting the empty workshop-yard partition
  { from: 'pierCourt', to: 'serviceLoop', kind: 'breach', tiles: [[22, 10]] },
];

export const RUMBLE_OJUELEGBA: ArenaDef = {
  id: 'rumbleOjuelegba',
  name: 'Ojuelegba Underbridge',
  kind: 'rumble',
  layout: LAYOUT,
  // west / east balanced (Team Rumble splits by x); slot 0, the human, in the south-west of the shop lane;
  // never on a trap or within two steps of a supply crate
  spawns: balancedSpawns(LAYOUT, 32, { x: 1, y: 25 }, RADIAL_CLEARANCE, [
    ...TRAP_MARKS.map(([x, y]) => [x, y] as const),
    ...around(tilesOf(LAYOUT, '$'), 2),
  ]),
  spawnClearance: RADIAL_CLEARANCE,
  mirrorSoftBlocks: false,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: {
    ...rumbleStageConfig({ core: { w: 11, h: 9 }, softDensity: 0.46 }),
    vehicles: { lanes: LANES },
  },
  floorTraps: trapGrid(TRAP_MARKS, W, H),
  // the endgame waves land in the pier court round the clear bay and on the road between the piers
  endgameTraps: [
    trapGrid(
      [
        [19, 14, 'o'],
        [21, 16, '~'],
        [26, 17, '~'],
        [20, 19, 'o'],
        [25, 13, 'o'],
      ],
      W,
      H,
    ),
    trapGrid(
      [
        [22, 14, '~'],
        [18, 17, 'o'],
        [24, 16, 'o'],
        [22, 20, '~'],
        [19, 12, '~'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      // buses and kekes on the through road (right-hand traffic: eastbound south lanes, westbound north)
      kind: 'sweep',
      style: 'traffic',
      routes: [
        line([0, 17], [W - 1, 17]),
        line([0, 18], [W - 1, 18]),
        line([W - 1, 15], [0, 15]),
        line([W - 1, 16], [0, 16]),
      ],
      stepTicks: 4,
      firstAtSec: 10,
      everySec: [6, 9],
      warnSec: 2,
    },
    {
      // the signalled bus pull-out (a DEPARTURE, RE-E3): a loaded Danfo waits in its bay at the foot of the
      // departure strip (x 41 / 42, row 31), pulls out up the strip and onto the road and leaves at the east
      // edge (rows 18 / 17). The bus is shown parked in the bay through the telegraph; the sim holds the
      // announcement while anyone on the lane could not walk off it in time. Pavements beside the strip and
      // the bays west of it are safe. Workstream E owns the presentation (horn, lit road markers).
      kind: 'sweep',
      style: 'danfo',
      depart: true,
      routes: [
        [...line([41, H - 2], [41, 19]), ...line([41, 18], [W - 1, 18])],
        [...line([42, H - 2], [42, 18]), ...line([42, 17], [W - 1, 17])],
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
      'Under the Ojuelegba flyover: the approach, the pier court, the bus pocket, the shop lane and the service loop.',
    lighting: 'Late afternoon, deep bridge shadow',
    hazards: [
      'Buses and kekes race the through road under the bridge (2 s warning on the lane).',
      'A loaded Danfo pulls out of the depot up the departure strip and onto the road (2.5 s warning).',
      'Vendors dump barrows and tyres in the lanes - new crates block your route.',
      'From 2:00 left the outer districts fill with concrete; the pier court never closes.',
    ],
  },
  districts: OJUELEGBA_DISTRICTS,
  districtLinks: OJUELEGBA_LINKS,
};
