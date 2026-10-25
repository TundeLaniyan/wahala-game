import type { ArenaDef } from './types';
import { line, trapRows } from './build';
import { AISLE_CLEARANCE, mirrorQuadrant, pairedSpawns, rumbleStageConfig } from './rumbleKit';

/**
 * City Rumble V2, F3 - Ojuelegba Underbridge: the streets under the Ojuelegba flyover (41 x 31).
 *
 * Layout intent: A PILLAR FOREST UNDER THE BRIDGE PLUS TWO WIDE ROADS. The flyover crosses the board
 * north-south over columns 13-27: under it stands a forest of single piers (every other tile in six
 * columns), split by the two taxi-queue lanes (columns 17 and 23). Either side, a dense neighbourhood
 * of 3 x 2 buildings with one-tile lanes (narrow, shadowed, short sight lines). Two wide three-lane
 * roads (rows 6-8 and 22-24) cross the whole board east-west under the bridge: wide open, crate-free
 * and exposed to the traffic.
 *
 * Stage: buses and kekes race the wide roads (2 s warning); taxis charge down the queue lanes under the
 * bridge (2 s warning); vendors' barrows, tyres and cartons are dumped in the lanes as new crates (warned
 * obstacles, never next to anyone).
 */
const W = 41;
const H = 31;

const QUADRANT = [
  '.................=...',
  '.###.###.###.#.#.=.#.',
  '.###.###.###.....=...',
  '.............#.#.=.#.',
  '.###.#.#.###.....=...',
  '.###.#.#.###.#.#.=.#.',
  '=====================',
  '=====================',
  '=====================',
  '.............#.#.=.#.',
  '.#.#.###.###.....=...',
  '.###.###.###.#.#.=.#.',
  '.................=...',
  '.###.###.#.#.#.#.=.#.',
  '.###.###.#.#.....=...',
  '.............#.#.=.#.',
];

const layout = mirrorQuadrant(QUADRANT, W, H);

export const RUMBLE_OJUELEGBA: ArenaDef = {
  id: 'rumbleOjuelegba',
  name: 'Ojuelegba Underbridge',
  kind: 'rumble',
  layout,
  // one-tile lanes / two-tile aisles: the aisle L (three along, then the turn) fits where the corner L does not
  spawns: pairedSpawns(layout, 32, { x: 4, y: H - 5 }, AISLE_CLEARANCE),
  spawnClearance: AISLE_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: rumbleStageConfig({ core: { w: 11, h: 9 }, softDensity: 0.48 }),
  floorTraps: trapRows(
    [
      [4, 7, 'o'],
      [9, 8, '~'],
      [6, 12, '~'],
    ],
    W,
    H,
  ),
  // the endgame waves land in the pier forest at the centre (x 15-25, y 11-19)
  endgameTraps: [
    trapRows(
      [
        [16, 12, 'o'],
        [18, 14, '~'],
        [20, 13, 'o'],
      ],
      W,
      H,
    ),
    trapRows(
      [
        [16, 14, '~'],
        [18, 12, 'o'],
        [20, 11, '~'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      kind: 'sweep',
      style: 'traffic',
      routes: [
        line([0, 6], [W - 1, 6]),
        line([W - 1, 7], [0, 7]),
        line([0, 8], [W - 1, 8]),
        line([W - 1, 22], [0, 22]),
        line([0, 23], [W - 1, 23]),
        line([W - 1, 24], [0, 24]),
      ],
      stepTicks: 4,
      firstAtSec: 10,
      everySec: [5, 8],
      warnSec: 2,
    },
    {
      kind: 'sweep',
      style: 'checkpoint',
      routes: [
        line([17, 0], [17, H - 1]),
        line([17, H - 1], [17, 0]),
        line([23, 0], [23, H - 1]),
        line([23, H - 1], [23, 0]),
      ],
      stepTicks: 5,
      firstAtSec: 16,
      everySec: [8, 12],
      warnSec: 2,
    },
    { kind: 'drop', style: 'merch', count: 3, firstAtSec: 20, everySec: [12, 18], warnSec: 1.5 },
  ],
  info: {
    tagline: 'Under the Ojuelegba bridge: a forest of piers, taxi queues and two roaring roads.',
    lighting: 'Late afternoon, deep bridge shadow',
    hazards: [
      'Buses and kekes race along the two wide roads (2 s warning on the lane).',
      'Taxis charge down the queue lanes under the bridge (2 s warning).',
      'Vendors dump barrows and tyres in the lanes - new crates block your route.',
      'From 2:00 left the outer streets fill with concrete; the pier forest at the centre never closes.',
    ],
  },
};
