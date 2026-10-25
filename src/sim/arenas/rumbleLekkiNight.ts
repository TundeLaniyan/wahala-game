import type { ArenaDef } from './types';
import { trapRows } from './build';
import {
  RUMBLE_CLEARANCE,
  mirrorQuadrant,
  mirrorZones,
  pairedSpawns,
  rect,
  rumbleStageConfig,
} from './rumbleKit';

/**
 * City Rumble V2, F5 - Lekki Nightworks: the Lekki expressway works on the night shift (41 x 31), in the
 * approved Lekki Roadworks look (cold floodlights, sodium work lamps, black sky).
 *
 * Layout intent: AN OPEN DUG-OUT SITE WITH TRENCHES, DEBRIS STRIKES AND SCAFFOLD MAZES. Each corner holds
 * a scaffold maze around a half-built frame (one-tile passages, dead-end bays, short sight lines). The
 * rest is open excavation: few permanent blockers (pile caps, culvert boxes, column stubs), lots of
 * crates (spoil heaps, barriers, cable drums) and permanent trenches (potholes) and hydraulic-fluid
 * slicks. A haul road crosses the site (rows 10 and 20) and the site entrances run north and south
 * (columns 12 and 28).
 *
 * Stage: the tower crane drops debris on a rival's tile (only when they can step away, 1.8 s warning);
 * the excavators and the pile driver work marked 2 x 2 danger areas (lethal, 2 s warning).
 */
const W = 41;
const H = 31;

const QUADRANT = [
  '............=........',
  '.#.#.#.#.#..=........',
  '.#...#...#..=..##....',
  '.###.#.###..=..##....',
  '.....#......=........',
  '.#.###.#.#..=.....##.',
  '.#.......#..=.....##.',
  '.###.#.###..=........',
  '............=..#.....',
  '..#.........=........',
  '=====================',
  '.....................',
  '....##....#.......#..',
  '....##........#......',
  '........##...........',
  '........##.......#...',
];

const layout = mirrorQuadrant(QUADRANT, W, H);

/** Where the machines work: 2 x 2 danger areas beside the heavy concrete (mirrored). */
const MACHINE_ZONES: [number, number][][] = (
  [
    [13, 2],
    [16, 4],
    [6, 12],
    [10, 14],
  ] as const
).map(([x, y]) => rect(x, y, x + 1, y + 1));

export const RUMBLE_LEKKI_NIGHT: ArenaDef = {
  id: 'rumbleLekkiNight',
  name: 'Lekki Nightworks',
  kind: 'rumble',
  layout,
  spawns: pairedSpawns(
    layout,
    32,
    { x: 4, y: H - 5 },
    undefined,
    MACHINE_ZONES.flatMap((z) => mirrorZones(z, W, H)).flat(),
  ),
  spawnClearance: RUMBLE_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: rumbleStageConfig({ core: { w: 11, h: 9 }, softDensity: 0.52 }),
  // trenches (potholes: a stumble) and hydraulic-fluid slicks (a slide), always there
  floorTraps: trapRows(
    [
      [3, 11, 'o'],
      [4, 11, 'o'],
      [5, 11, 'o'],
      [6, 11, 'o'],
      [11, 13, 'o'],
      [11, 14, 'o'],
      [14, 4, '~'],
      [13, 6, '~'],
    ],
    W,
    H,
  ),
  // 0:30 the excavators break through, 0:15 the cut collapses - inside the core (x 15-25, y 11-19)
  endgameTraps: [
    trapRows(
      [
        [16, 12, 'o'],
        [19, 14, '~'],
        [17, 11, 'o'],
      ],
      W,
      H,
    ),
    trapRows(
      [
        [15, 14, '~'],
        [20, 13, 'o'],
        [18, 15, 'o'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      kind: 'strike',
      style: 'debris',
      zones: [],
      targetPlayers: true,
      activeSec: 0.25,
      firstAtSec: 15,
      everySec: [7, 11],
      warnSec: 1.8,
    },
    {
      kind: 'strike',
      style: 'debris',
      zones: MACHINE_ZONES.flatMap((z) => mirrorZones(z, W, H)),
      activeSec: 0.5,
      firstAtSec: 22,
      everySec: [8, 12],
      warnSec: 2,
    },
  ],
  info: {
    tagline: 'Night shift on the Lekki works: excavators, scaffold mazes, trenches and floodlights.',
    lighting: 'Night - industrial floodlights',
    hazards: [
      'The tower crane drops debris on a marked tile 1.8 s after the warning - step off it.',
      'Excavators and the pile driver work the marked 2 x 2 danger areas (2 s warning).',
      'Trenches trip you, hydraulic-fluid slicks slide you.',
      'From 2:00 left the site closes in; the centre of the dig never closes.',
    ],
  },
};
