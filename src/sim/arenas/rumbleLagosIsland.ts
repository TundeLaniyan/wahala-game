import type { ArenaDef } from './types';
import { line, trapRows } from './build';
import { AISLE_CLEARANCE, mirrorQuadrant, mirrorZones, pairedSpawns, rumbleStageConfig } from './rumbleKit';

/**
 * City Rumble V2, F2 - Lagos Island Markets: the Balogun / Idumota trading streets (41 x 31).
 *
 * Layout intent: TIGHT STALL CORRIDORS THAT OPEN INTO PLAZAS, WITH CHOKEPOINTS. Rows of lock-up stalls
 * (3 x 1 concrete runs) stand on every even row; the stall rows are staggered, so the one-tile aisles
 * between them run east-west but the cross alleys never line up: going north or south means a zig-zag
 * through narrow gaps (the chokepoints), and shop stubs break the long aisles. Four small plazas
 * (5 x 4, a kiosk in the middle) and the big central square (11 x 7, the core that never closes) are
 * crate-free open ground where the corridors spill out. A market access road with shopfronts runs
 * along the north and south edges.
 *
 * Stage: bales and cartons tumble off the shopfronts onto marked aisle tiles (lethal, 1.8 s warning);
 * goods fall into the aisles as new crates that block routes (non-lethal, never near anyone); kekes
 * and buses crawl along the access roads (2 s warning).
 */
const W = 41;
const H = 31;

const QUADRANT = [
  '.....................',
  '.#.#.#.#.#.#.#.#.#.#.',
  '=====================',
  '.....................',
  '####.###.###.###.####',
  '......#.......#......',
  '##.###.###.###.###.##',
  '.....=====..#........',
  '####.==#==##.###.####',
  '.....=====...#.......',
  '##.##=====.###.###.##',
  '...#............#....',
  '####.###.###.##======',
  '..........#....==#===',
  '##.###.###.###.======',
  '......#........======',
];

const layout = mirrorQuadrant(QUADRANT, W, H);

/** Shopfront tiles where goods come down (two tiles each), mirrored to the four quarters. */
const SHOPFRONTS: [number, number][][] = [
  [
    [2, 5],
    [3, 5],
  ],
  [
    [9, 9],
    [10, 9],
  ],
  [
    [12, 11],
    [13, 11],
  ],
  [
    [4, 13],
    [5, 13],
  ],
  [
    [18, 7],
    [19, 7],
  ],
  [
    [11, 3],
    [12, 3],
  ],
];

export const RUMBLE_LAGOS_ISLAND: ArenaDef = {
  id: 'rumbleLagosIsland',
  name: 'Lagos Island Markets',
  kind: 'rumble',
  layout,
  spawns: pairedSpawns(layout, 32, { x: 4, y: H - 5 }, AISLE_CLEARANCE),
  spawnClearance: AISLE_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: rumbleStageConfig({ core: { w: 11, h: 9 }, softDensity: 0.46 }),
  floorTraps: trapRows(
    [
      [7, 5, '~'],
      [11, 13, '~'],
      [1, 9, 'o'],
    ],
    W,
    H,
  ),
  // the endgame waves land on the central square (x 15-25, y 11-19)
  endgameTraps: [
    trapRows(
      [
        [15, 13, 'o'],
        [18, 14, '~'],
        [19, 12, 'o'],
      ],
      W,
      H,
    ),
    trapRows(
      [
        [16, 15, '~'],
        [20, 13, 'o'],
        [18, 12, '~'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      kind: 'strike',
      style: 'goods',
      zones: SHOPFRONTS.flatMap((z) => mirrorZones(z, W, H)),
      activeSec: 0.35,
      firstAtSec: 14,
      everySec: [5, 9],
      warnSec: 1.8,
    },
    { kind: 'drop', style: 'merch', count: 4, firstAtSec: 10, everySec: [7, 11], warnSec: 1.5 },
    {
      kind: 'sweep',
      style: 'traffic',
      routes: [
        line([0, 2], [W - 1, 2]),
        line([W - 1, 2], [0, 2]),
        line([0, H - 3], [W - 1, H - 3]),
        line([W - 1, H - 3], [0, H - 3]),
      ],
      stepTicks: 6,
      firstAtSec: 24,
      everySec: [10, 16],
      warnSec: 2,
    },
  ],
  info: {
    tagline: 'Balogun at full trade: stall corridors, textile lock-ups and crowded plazas.',
    lighting: 'Hot, hazy afternoon under tarpaulins',
    hazards: [
      'Bales and cartons tumble off the shopfronts onto the marked aisle tiles (1.8 s warning).',
      'Goods spill into the aisles as new crates and block routes (never next to anyone).',
      'Kekes and buses crawl along the access roads at the top and bottom edges (2 s warning).',
      'From 2:00 left the outer market closes in; the central square never closes.',
    ],
  },
};
