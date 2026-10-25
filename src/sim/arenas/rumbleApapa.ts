import type { ArenaDef } from './types';
import { line, trapRows } from './build';
import {
  AISLE_CLEARANCE,
  mirrorQuadrant,
  mirrorZones,
  pairedSpawns,
  rect,
  rumbleStageConfig,
} from './rumbleKit';

/**
 * City Rumble V2, F4 - Apapa Docks: a container terminal on the Lagos harbour (45 x 31, the widest
 * stage: a container yard is long, and the extra columns give the straight aisles their length).
 *
 * Layout intent: CONTAINER BLOCKS WITH LONG STRAIGHT AISLES (VEHICLE HEAVEN) AND CRANE STRIKE ZONES.
 * Stacks of containers (4 x 2 concrete blocks, a 9 x 2 transit shed in each corner, a 7-wide stack on
 * the centre line) stand in a regular grid; the two-tile aisles between them run straight across the
 * yard, so a generator blast or a vehicle attack travels a long way and cover is the end of a stack.
 * Two haul roads (columns 11-12 and 32-33) and the quay road (rows 1 and 29) are crate-free truck
 * lanes; the open loading apron across the middle (rows 13-17) is the core that never closes.
 *
 * Stage: the quay cranes lower containers onto marked 2 x 2 zones in the aisles (lethal, 2.2 s warning
 * with a growing shadow); container trucks race the haul roads and the quay road (2 s warning).
 */
const W = 45;
const H = 31;

const QUADRANT = [
  '...........==..........',
  '=======================',
  '...........==..........',
  '.#########.==..####.###',
  '.#########.==..####.###',
  '...........==..........',
  '...........==..........',
  '.####.####.==..#..#.###',
  '.####.####.==..#..#.###',
  '...........==..........',
  '...........==..........',
  '.####.####.==..####....',
  '.####.####.==..####....',
  '...........==..........',
  '...........==..........',
  '...........==..........',
];

const layout = mirrorQuadrant(QUADRANT, W, H);

/** 2 x 2 container footprints in the aisles (mirrored to the four quarters of the yard). */
const CRANE_ZONES: [number, number][][] = (
  [
    [2, 5],
    [7, 9],
    [16, 5],
    [16, 9],
    [20, 13],
    [7, 13],
    [13, 7],
  ] as const
).map(([x, y]) => rect(x, y, x + 1, y + 1));

export const RUMBLE_APAPA: ArenaDef = {
  id: 'rumbleApapa',
  name: 'Apapa Docks',
  kind: 'rumble',
  layout,
  // one-tile lanes / two-tile aisles: the aisle L (three along, then the turn) fits where the corner L does not
  spawns: pairedSpawns(
    layout,
    32,
    { x: 4, y: H - 5 },
    AISLE_CLEARANCE,
    CRANE_ZONES.flatMap((z) => mirrorZones(z, W, H)).flat(),
  ),
  spawnClearance: AISLE_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: rumbleStageConfig({ core: { w: 13, h: 9 }, softDensity: 0.5 }),
  floorTraps: trapRows(
    [
      [13, 6, '~'],
      [3, 10, '~'],
      [5, 14, 'o'],
    ],
    W,
    H,
  ),
  // the endgame waves land on the loading apron (x 16-28, y 11-19)
  endgameTraps: [
    trapRows(
      [
        [17, 13, 'o'],
        [20, 14, '~'],
        [22, 12, 'o'],
      ],
      W,
      H,
    ),
    trapRows(
      [
        [19, 15, '~'],
        [21, 13, 'o'],
        [16, 14, 'o'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      kind: 'strike',
      style: 'cargo',
      zones: CRANE_ZONES.flatMap((z) => mirrorZones(z, W, H)),
      activeSec: 0.4,
      firstAtSec: 12,
      everySec: [5, 8],
      warnSec: 2.2,
    },
    {
      kind: 'sweep',
      style: 'truck',
      routes: [
        line([0, 1], [W - 1, 1]),
        line([W - 1, H - 2], [0, H - 2]),
        line([11, 0], [11, H - 1]),
        line([12, H - 1], [12, 0]),
        line([32, 0], [32, H - 1]),
        line([33, H - 1], [33, 0]),
      ],
      stepTicks: 5,
      firstAtSec: 18,
      everySec: [7, 11],
      warnSec: 2,
    },
  ],
  info: {
    tagline: 'A container terminal on the harbour: stacks, gantry cranes and long, straight aisles.',
    lighting: 'Humid harbour noon, salt haze',
    hazards: [
      'Quay cranes lower containers onto the marked 2 x 2 zones in the aisles (2.2 s warning).',
      'Container trucks race the haul roads and the quay road (2 s warning on the lane).',
      'From 2:00 left the yard closes in; the loading apron at the centre never closes.',
    ],
  },
};
