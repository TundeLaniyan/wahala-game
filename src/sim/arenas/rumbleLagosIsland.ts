import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import { line } from './build';
import { Board, nearestOpen, zoneNear } from './community/painter';
import type { CoverLegend } from './community/painter';
import { BOSS_BRIEF, communityArena } from './community/arena';
import { crossings } from './rumbleKit';

/**
 * City Rumble, researched arena - LAGOS ISLAND (Canonical Lagos Map Build Bible v2, section 3.4): Balogun and
 * Idumota trade running into the Broad Street offices, the old civic square, the Onikan recreation grounds and the
 * Marina harbour edge, as six connected districts on a 55 x 39 board (not mirrored; it REPLACES the generic mirrored
 * "Lagos Island Markets" grid under the same id). Selective compression, fictional links only. The camera looks
 * north: far = north (the cathedral backdrop and the civic square), near = the Marina waterfront.
 *
 *   L1 Balogun Trading Maze   (x 2-19, y 2-30)    textile stalls and lock-ups in staggered rows, lanes between
 *   L2 Idumota Gateway        (x 20-33, y 2-16)   the bus and market approach: the boulevard's north end
 *   L3 Broad Street Row       (x 20-33, y 17-30)  the boulevard between market shopfronts and the office blocks
 *   L4 Old Eko Civic Square   (x 34-52, y 2-16)   a paved civic square with its heritage frontage and trees
 *   L5 Onikan Recreation      (x 34-52, y 17-30)  the walled heritage park and recreation ground (protected walls)
 *   L6 Marina Waterfront      (x 2-52, y 31-36)   the Marina road and the harbour promenade, low on the camera side
 *
 * Routes (bible 3.4): trading L1-L2-L6, commercial L1-L3-L5-L6, civic flank L1-L4-L5, boulevard-to-waterfront
 * crossover L3-L6. Heritage walls and the cathedral are protected background architecture (never targets).
 */
const W = 55;
const H = 39;

export const LAGOS_ISLAND_LEGEND: CoverLegend = {
  B: { kind: 'building', maxRun: 8 },
  S: { kind: 'shop', maxRun: 6 },
  M: { kind: 'stall', maxRun: 3 },
  L: { kind: 'lockup', maxRun: 6 },
  K: { kind: 'kiosk', maxRun: 2 },
  O: { kind: 'officeTower', maxRun: 6 },
  H: { kind: 'heritage', maxRun: 7 },
  V: { kind: 'parkWall', maxRun: 8 },
  T: { kind: 'tree', maxRun: 2 },
  Q: { kind: 'quayShed', maxRun: 8 },
  N: { kind: 'monument', maxRun: 3 },
  A: { kind: 'arcade', maxRun: 6 },
};

function paint(): Board {
  const b = new Board(W, H);
  b.fill(0, 0, W - 1, 1, 'B')
    .fill(0, 0, 1, H - 1, 'B')
    .fill(W - 2, 0, W - 1, H - 1, 'B')
    .fill(0, H - 2, W - 1, H - 1, 'Q');
  // Broad Street boulevard (x 24-27) and the Marina road (y 31-33)
  b.fill(24, 0, 27, 30, '=').fill(0, 31, W - 1, 33, '=');
  // L1 Balogun: shop frontage, then staggered textile stall rows with lanes between (2-wide spine at x 10-11)
  b.fill(2, 2, 19, 3, 'S');
  b.blocks(2, 5, 19, 12, { ch: 'M', bw: 2, bh: 2, gx: 1, gy: 1, stagger: 1, seed: 21, drop: 0.1 });
  b.blocks(2, 16, 19, 22, {
    ch: (i, j) => ((i + j) % 4 === 0 ? 'L' : 'M'),
    bw: 2,
    bh: 2,
    gx: 1,
    gy: 1,
    stagger: 1,
    seed: 23,
    drop: 0.1,
  });
  b.blocks(2, 26, 19, 29, { ch: 'M', bw: 2, bh: 2, gx: 1, gy: 1, stagger: 1, seed: 25, drop: 0.12 });
  for (const x of [10, 11]) b.fill(x, 4, x, 30, '.');
  // market shopfronts facing the boulevard on its west side (x 20-21), the office row on its east side (x 30-33)
  b.fill(20, 2, 21, 30, 'S');
  for (const y of [8, 9, 14, 15, 22, 23, 28, 29]) b.fill(20, y, 21, y, '.');
  b.blocks(30, 2, 33, 30, { ch: 'O', bw: 4, bh: 5, gx: 0, gy: 2, seed: 27 });
  for (const y of [7, 8, 14, 15, 21, 22, 28, 29]) b.fill(30, y, 33, y, '.');
  // L4 Old Eko Civic Square: the paved square, the monument, heritage frontage and trees
  b.fill(36, 4, 51, 14, '_');
  b.fill(44, 8, 46, 10, 'N');
  b.fill(34, 2, 52, 3, 'H');
  for (const x of [39, 40, 47, 48]) b.fill(x, 2, x, 3, '.');
  b.blocks(36, 5, 51, 5, { ch: 'T', bw: 1, bh: 1, gx: 3, gy: 0 });
  b.blocks(36, 13, 51, 13, { ch: 'T', bw: 1, bh: 1, gx: 3, gy: 0 });
  b.fill(34, 15, 52, 16, 'A');
  for (const x of [38, 39, 45, 46]) b.fill(x, 15, x, 16, '.');
  // L5 Onikan Recreation: the heritage park wall with gates, a lawn, trees, a pavilion
  b.fill(34, 17, 52, 17, 'V');
  for (const x of [38, 39, 47, 48]) b.fill(x, 17, x, 17, '.');
  b.fill(36, 19, 50, 28, '_');
  b.fill(36, 29, 52, 30, 'V');
  for (const x of [41, 42]) b.fill(x, 29, x, 30, '.');
  b.blocks(36, 19, 50, 28, { ch: 'T', bw: 1, bh: 1, gx: 4, gy: 4, stagger: 2, seed: 29, drop: 0.2 });
  b.fill(42, 22, 44, 24, 'K');
  // L6 Marina waterfront: harbour sheds and a ferry office on the quay, bollard kiosks
  b.blocks(3, 35, 52, 36, { ch: (i) => (i % 3 === 1 ? 'Q' : 'K'), bw: 4, bh: 2, gx: 6, gy: 0, seed: 31 });
  return b;
}

const base = paint();
const open = base.layout(LAGOS_ISLAND_LEGEND);
const taken = new Set<string>();
const near = (x: number, y: number): [number, number] => {
  const t = nearestOpen(open, x, y, taken);
  taken.add(`${t[0]},${t[1]}`);
  return t;
};
const SUPPLIES = [
  [5, 14],
  [14, 24],
  [8, 6],
  [16, 18],
  [22, 9],
  [31, 8],
  [31, 23],
  [38, 8],
  [48, 12],
  [44, 18],
  [41, 26],
  [50, 25],
  [10, 34],
  [26, 34],
  [44, 34],
  [18, 30],
].map(([x, y]) => near(x!, y!));
const BARRIERS = [
  [19, 24],
  [33, 14],
  [35, 18],
  [50, 17],
].map(([x, y]) => near(x!, y!));
const ZONE_TAKEN = new Set<string>(taken);
const ZONES = [
  [8, 14],
  [14, 24],
  [22, 16],
  [31, 8],
  [38, 14],
  [6, 5],
].map(([x, y]) => {
  const z = zoneNear(open, x!, y!, ZONE_TAKEN);
  for (const [a, b] of z) ZONE_TAKEN.add(`${a},${b}`);
  return z;
});
const TRAPS = [
  [5, 14],
  [15, 22],
  [8, 27],
  [23, 12],
  [31, 10],
  [40, 10],
  [48, 6],
  [44, 20],
  [38, 26],
  [14, 34],
  [34, 35],
  [49, 34],
].map(([x, y]) => {
  const t = nearestOpen(open, x!, y!, ZONE_TAKEN);
  ZONE_TAKEN.add(`${t[0]},${t[1]}`);
  return [t[0], t[1], (t[0] + t[1]) % 2 === 0 ? 'o' : '~'] as const;
});

/** The boulevard (southbound on x 26-27 is the east pair: right-hand traffic) and the Marina road. */
const BOULEVARD: [number, number][][] = [
  line([24, 30], [24, 0]),
  line([25, 30], [25, 0]),
  line([26, 0], [26, 30]),
  line([27, 0], [27, 30]),
];
const MARINA: [number, number][][] = [
  line([0, 31], [W - 1, 31]),
  line([W - 1, 32], [0, 32]),
  line([0, 33], [W - 1, 33]),
];
const WASH_ZONES = [
  {
    tiles: [
      [10, 36],
      [11, 36],
      [12, 36],
    ] as [number, number][],
    dir: 'up' as const,
  },
  {
    tiles: [
      [30, 36],
      [31, 36],
      [32, 36],
    ] as [number, number][],
    dir: 'up' as const,
  },
  {
    tiles: [
      [44, 36],
      [45, 36],
      [46, 36],
    ] as [number, number][],
    dir: 'up' as const,
  },
];

const DISTRICTS: DistrictDef[] = [
  { id: 'balogun', name: 'Balogun Trading Maze', role: 'street', rects: [[2, 2, 19, 30]] },
  { id: 'idumota', name: 'Idumota Gateway', role: 'approach', rects: [[20, 2, 33, 16]] },
  { id: 'broadStreet', name: 'Broad Street Row', role: 'street', rects: [[20, 17, 33, 30]] },
  { id: 'civicSquare', name: 'Old Eko Civic Square', role: 'plaza', rects: [[34, 2, 52, 16]] },
  { id: 'onikan', name: 'Onikan Recreation', role: 'park', rects: [[34, 17, 52, 30]] },
  { id: 'marina', name: 'Marina Waterfront', role: 'approach', rects: [[2, 31, 52, 36]] },
];
const LINKS: DistrictLink[] = [
  { from: 'balogun', to: 'idumota', kind: 'open', tiles: crossings(open, 19, 2, 19, 16, 1, 0) },
  { from: 'balogun', to: 'broadStreet', kind: 'open', tiles: crossings(open, 19, 17, 19, 30, 1, 0) },
  { from: 'idumota', to: 'broadStreet', kind: 'open', tiles: crossings(open, 20, 16, 33, 16, 0, 1) },
  { from: 'idumota', to: 'civicSquare', kind: 'open', tiles: crossings(open, 33, 2, 33, 16, 1, 0) },
  { from: 'broadStreet', to: 'onikan', kind: 'open', tiles: crossings(open, 33, 17, 33, 30, 1, 0) },
  { from: 'civicSquare', to: 'onikan', kind: 'open', tiles: crossings(open, 34, 16, 52, 16, 0, 1) },
  { from: 'onikan', to: 'marina', kind: 'open', tiles: crossings(open, 36, 30, 52, 30, 0, 1) },
  { from: 'broadStreet', to: 'marina', kind: 'open', tiles: crossings(open, 20, 30, 33, 30, 0, 1) },
  { from: 'balogun', to: 'marina', kind: 'open', tiles: crossings(open, 2, 30, 19, 30, 0, 1) },
];

export const LAGOS_ISLAND_BOARD = base;
export const RUMBLE_LAGOS_ISLAND: ArenaDef = communityArena({
  id: 'rumbleLagosIsland',
  name: 'Lagos Island',
  board: base,
  legend: LAGOS_ISLAND_LEGEND,
  supplies: SUPPLIES,
  barriers: BARRIERS,
  core: { w: 11, h: 9, x0: 22, y0: 17 },
  softDensity: 0.42,
  lanes: [
    [24, 0, 'down'],
    [25, 0, 'down'],
    [26, 0, 'down'],
    [27, 0, 'down'],
    [0, 31, 'right'],
    [0, 32, 'right'],
    [0, 33, 'right'],
    [W - 1, 31, 'left'],
    [W - 1, 32, 'left'],
    [W - 1, 33, 'left'],
  ],
  traps: TRAPS,
  endgame: [
    [
      [24, 18, 'o'],
      [27, 21, '~'],
      [25, 24, 'o'],
      [22, 20, '~'],
      [29, 19, 'o'],
      [26, 26, '~'],
    ],
    [
      [25, 17, '~'],
      [26, 22, 'o'],
      [29, 25, '~'],
      [23, 23, 'o'],
      [24, 19, '~'],
      [27, 18, 'o'],
    ],
  ],
  hazards: [
    {
      kind: 'sweep',
      style: 'traffic',
      routes: BOULEVARD,
      stepTicks: 5,
      firstAtSec: 9,
      everySec: [6, 9],
      warnSec: 2,
    },
    {
      kind: 'sweep',
      style: 'traffic',
      routes: MARINA,
      stepTicks: 4,
      firstAtSec: 14,
      everySec: [7, 11],
      warnSec: 2,
    },
    {
      kind: 'strike',
      style: 'goods',
      zones: ZONES,
      activeSec: 0.35,
      firstAtSec: 15,
      everySec: [6, 10],
      warnSec: 1.8,
    },
    { kind: 'drop', style: 'merch', count: 4, firstAtSec: 10, everySec: [8, 12], warnSec: 1.5 },
    { kind: 'push', style: 'wash', zones: WASH_ZONES, firstAtSec: 22, everySec: [10, 16], warnSec: 2 },
  ],
  info: {
    tagline:
      'Balogun trade, Broad Street offices, the old civic square, the Onikan grounds and the Marina harbour edge.',
    lighting: 'Bright, hazy island midday with harbour light',
    hazards: [
      'Buses and kekes race Broad Street and the Marina road (2 s warning on the lane).',
      'Goods fall off the textile shopfronts onto marked aisle tiles (1.8 s warning).',
      'Traders drop goods into the lanes - new crates block your route.',
      'Harbour water washes over the Marina promenade and slides you one tile back (never lethal).',
      'The heritage walls and the cathedral are scenery and cannot be blasted.',
      'From 2:00 left the outer districts fill with concrete; the boulevard junction never closes.',
    ],
  },
  districts: DISTRICTS,
  links: LINKS,
  start: { x: 4, y: 24 },
  area: 'Lagos Island',
  boss: BOSS_BRIEF('Lagos Island', 'civic or cultural'),
});
