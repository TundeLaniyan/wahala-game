import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import { line } from './build';
import { Board, nearestOpen, zoneNear } from './community/painter';
import type { CoverLegend } from './community/painter';
import { BOSS_BRIEF, communityArena } from './community/arena';
import { crossings } from './rumbleKit';

/**
 * City Rumble, researched arena - FADEYI (Canonical Lagos Map Build Bible v2, section 3.3): the compact, junction-
 * centred Ikorodu Road locality on a 43 x 29 board (deliberately the smallest researched arena: "not a stadium
 * arena and should not be inflated"). A divided highway with a BRT centreline runs the whole width; shopfronts and
 * workshops line its pavements, inner residential lanes lie behind them, and the Onipanu approach roads leave the
 * north-east and south-east corners. Selective compression; the pedestrian crossing is a FICTIONAL at-grade
 * crossing pair (median gaps with refuge islands), "not claimed as a current real bridge".
 *
 *   F2 Westbound Shopfronts  (x 2-39, y 2-11)    shop row on the highway pavement, stalls and workshops behind
 *   F1 BRT Centreline        (x 0-50, y 12-20)  westbound carriageway, BRT lanes between two median barriers,
 *                                               eastbound carriageway; median gaps at x 11-12 and 37-38 are the crossings
 *   F3 Inner Neighbourhood Grid (x 2-19, y 21-30) houses and lanes behind the south pavement
 *   F5 Recreation + Workshops (x 20-39, y 21-30)  workshops, the bank frontage, a walled recreation court
 *   F4 Onipanu Approach      (x 40-48, y 2-11 and 21-30)  the side roads and their frontage at the two east corners
 *
 * Routes (bible 3.3): direct F2-F1-F4; neighbourhood F2-F3-F4 and recreation F2-F5-F4 (both cross the highway at a
 * crossing gap); cross-links F1-F3 and F3-F5. Median gaps always stay open; the two carriageways and the BRT lanes
 * are the only lethal ground and each wave is telegraphed.
 */
const W = 51;
const H = 33;

/** Highway rows: westbound 12-13, median 14, BRT 15-16, median 17, eastbound 18-20 (the bay lane is 20). */
export const FADEYI_ROWS = {
  top: 12,
  bottom: 20,
  medianA: 14,
  medianB: 17,
  brt: [15, 16] as const,
  west: [12, 13] as const,
  east: [18, 19, 20] as const,
};
/** Median crossing gaps (tile columns, two wide). */
export const FADEYI_CROSSINGS = [11, 37] as const;

export const FADEYI_LEGEND: CoverLegend = {
  B: { kind: 'building', maxRun: 8 },
  S: { kind: 'shop', maxRun: 6 },
  L: { kind: 'lockup', maxRun: 6 },
  M: { kind: 'stall', maxRun: 3 },
  K: { kind: 'kiosk', maxRun: 2 },
  W: { kind: 'workshop', maxRun: 4 },
  R: { kind: 'house', maxRun: 5 },
  C: { kind: 'brtShelter', maxRun: 5 },
  D: { kind: 'median', maxRun: 6 },
  T: { kind: 'bankBlock', maxRun: 8 },
  V: { kind: 'wall', maxRun: 6 },
};

function paint(): Board {
  const b = new Board(W, H);
  b.fill(0, 0, W - 1, 1, 'B')
    .fill(0, 0, 1, H - 1, 'B')
    .fill(W - 2, 0, W - 1, H - 1, 'B')
    .fill(0, H - 2, W - 1, H - 1, 'L');
  const R = FADEYI_ROWS;
  // the Ikorodu Road carriageways and the BRT centreline
  b.fill(0, R.top, W - 1, R.bottom, '=');
  for (const y of [R.medianA, R.medianB]) {
    b.fill(2, y, W - 3, y, 'D');
    for (const x of FADEYI_CROSSINGS) b.fill(x, y, x + 1, y, '_'); // crossing gaps with refuge islands
  }
  b.fill(21, R.medianA, 27, R.medianA, 'C').fill(21, R.medianB, 27, R.medianB, 'C'); // the BRT stop shelters on the median lines
  // F2: the shop row on the north pavement, stalls / workshops / kiosks behind it, a lane through the row
  b.fill(2, 7, 38, 8, 'S');
  b.blocks(2, 2, 38, 4, {
    ch: (i) => (i % 3 === 0 ? 'W' : 'M'),
    bw: 3,
    bh: 2,
    gx: 3,
    gy: 0,
    seed: 5,
    jw: 1,
    drop: 0.2,
  });
  for (const x of [9, 10, 23, 24, 36, 37]) b.fill(x, 7, x, 8, '.');
  // F4 north-east: the Onipanu approach road leaves the north edge; frontage either side of it
  b.fill(42, 0, 45, 11, '=');
  b.fill(40, 7, 41, 8, 'S').fill(46, 7, 48, 8, 'S').fill(46, 2, 47, 4, 'K').fill(40, 2, 41, 4, 'B');
  // F3: the south shop row, houses and lanes behind it
  b.fill(2, 24, 19, 25, 'S');
  b.blocks(2, 28, 19, 30, { ch: 'R', bw: 4, bh: 3, gx: 5, gy: 0, seed: 9, jw: 1, drop: 0.25 });
  for (const x of [9, 10, 15, 16]) b.fill(x, 24, x, 25, '.');
  // F5: the bank frontage on the pavement, workshops, the walled recreation court
  b.fill(22, 24, 29, 26, 'T');
  b.blocks(22, 28, 29, 30, { ch: 'W', bw: 3, bh: 2, gx: 3, gy: 0, seed: 13, jw: 1, drop: 0.4 });
  b.fill(32, 24, 38, 30, '_').fill(31, 26, 31, 30, 'V');
  // F4 south-east: the side road leaves the south edge
  b.fill(42, 21, 45, 32, '=');
  b.fill(40, 24, 41, 25, 'S').fill(46, 24, 48, 25, 'B').fill(46, 27, 48, 29, 'K');
  return b;
}

const base = paint();
const open = base.layout(FADEYI_LEGEND);
const taken = new Set<string>();
const near = (x: number, y: number): [number, number] => {
  const t = nearestOpen(open, x, y, taken);
  taken.add(`${t[0]},${t[1]}`);
  return t;
};
const SUPPLIES = [
  [5, 4],
  [16, 5],
  [28, 4],
  [33, 10],
  [6, 10],
  [42, 10],
  [5, 22],
  [16, 29],
  [26, 22],
  [33, 28],
  [43, 22],
  [20, 10],
].map(([x, y]) => near(x!, y!));
const BARRIERS = [
  [20, 11],
  [36, 29],
].map(([x, y]) => near(x!, y!));
const ZONE_TAKEN = new Set<string>(taken);
const ZONES = [
  [6, 9],
  [24, 8],
  [12, 19],
  [24, 19],
].map(([x, y]) => {
  const z = zoneNear(open, x!, y!, ZONE_TAKEN);
  for (const [a, b] of z) ZONE_TAKEN.add(`${a},${b}`);
  return z;
});
const TRAPS = [
  [4, 5],
  [16, 9],
  [30, 9],
  [38, 5],
  [6, 25],
  [16, 20],
  [30, 25],
  [25, 25],
].map(([x, y]) => {
  const t = nearestOpen(open, x!, y!, ZONE_TAKEN);
  ZONE_TAKEN.add(`${t[0]},${t[1]}`);
  return [t[0], t[1], (t[0] + t[1]) % 2 === 0 ? 'o' : '~'] as const;
});

/** Carriageways: westbound on the north lanes, eastbound on the south; BRT lanes between the medians. */
const WESTBOUND: [number, number][][] = FADEYI_ROWS.west.map((y) => line([W - 1, y], [0, y]));
const EASTBOUND: [number, number][][] = [18, 19].map((y) => line([0, y], [W - 1, y]));
const BRT: [number, number][][] = [
  line([0, FADEYI_ROWS.brt[0]], [W - 1, FADEYI_ROWS.brt[0]]),
  line([W - 1, FADEYI_ROWS.brt[1]], [0, FADEYI_ROWS.brt[1]]),
];
/** A Danfo leaves its bay (13, 20) on the bottom lane and joins the eastbound carriageway to the edge. */
const DEPARTURE: [number, number][][] = [line([14, 20], [W - 1, 20])];

const DISTRICTS: DistrictDef[] = [
  { id: 'shopfronts', name: 'Westbound Shopfronts', role: 'street', rects: [[2, 2, 39, 11]] },
  { id: 'brtCentreline', name: 'BRT Centreline', role: 'approach', rects: [[0, 12, 50, 20]] },
  { id: 'neighbourhood', name: 'Inner Neighbourhood Grid', role: 'lane', rects: [[2, 21, 19, 30]] },
  {
    id: 'onipanu',
    name: 'Onipanu Approach',
    role: 'street',
    rects: [
      [36, 2, 44, 11],
      [36, 21, 44, 30],
    ],
  },
  { id: 'recreation', name: 'Recreation + Workshops', role: 'works', rects: [[20, 21, 39, 30]] },
];
const LINKS: DistrictLink[] = [
  { from: 'shopfronts', to: 'brtCentreline', kind: 'open', tiles: crossings(open, 2, 11, 39, 11, 0, 1) },
  { from: 'brtCentreline', to: 'neighbourhood', kind: 'open', tiles: crossings(open, 2, 20, 19, 20, 0, 1) },
  { from: 'brtCentreline', to: 'recreation', kind: 'open', tiles: crossings(open, 20, 20, 39, 20, 0, 1) },
  {
    from: 'brtCentreline',
    to: 'onipanu',
    kind: 'open',
    tiles: [...crossings(open, 40, 11, 48, 11, 0, 1), ...crossings(open, 40, 20, 48, 20, 0, 1)],
  },
  { from: 'shopfronts', to: 'onipanu', kind: 'open', tiles: crossings(open, 39, 2, 39, 11, 1, 0) },
  { from: 'neighbourhood', to: 'recreation', kind: 'open', tiles: crossings(open, 19, 21, 19, 30, 1, 0) },
  { from: 'recreation', to: 'onipanu', kind: 'open', tiles: crossings(open, 39, 21, 39, 30, 1, 0) },
];

export const FADEYI_BOARD = base;
export const RUMBLE_FADEYI: ArenaDef = communityArena({
  id: 'rumbleFadeyi',
  name: 'Fadeyi',
  board: base,
  legend: FADEYI_LEGEND,
  supplies: SUPPLIES,
  barriers: BARRIERS,
  core: { w: 11, h: 9, x0: 20, y0: 12 },
  softDensity: 0.4,
  lanes: [
    [0, 12, 'right'],
    [0, 13, 'right'],
    [0, 18, 'right'],
    [0, 19, 'right'],
    [W - 1, 12, 'left'],
    [W - 1, 13, 'left'],
    [W - 1, 18, 'left'],
    [W - 1, 19, 'left'],
  ],
  traps: TRAPS,
  hazards: [
    {
      kind: 'sweep',
      style: 'traffic',
      routes: [...WESTBOUND, ...EASTBOUND],
      stepTicks: 4,
      firstAtSec: 8,
      everySec: [5, 8],
      warnSec: 2,
    },
    {
      kind: 'sweep',
      style: 'traffic',
      routes: BRT,
      stepTicks: 5,
      firstAtSec: 16,
      everySec: [9, 13],
      warnSec: 2.5,
    },
    {
      kind: 'sweep',
      style: 'danfo',
      depart: true,
      routes: DEPARTURE,
      stepTicks: 6,
      firstAtSec: 20,
      everySec: [11, 16],
      warnSec: 2.5,
    },
    {
      kind: 'strike',
      style: 'goods',
      zones: ZONES,
      activeSec: 0.35,
      firstAtSec: 18,
      everySec: [7, 11],
      warnSec: 1.8,
    },
    { kind: 'drop', style: 'merch', count: 2, firstAtSec: 14, everySec: [12, 18], warnSec: 1.5 },
  ],
  info: {
    tagline:
      'The compact Fadeyi junction: the Ikorodu Road carriageways, the BRT centreline, shopfronts, inner lanes and the crossing problem.',
    lighting: 'Flat grey midday over a divided highway',
    hazards: [
      'Buses and kekes race the two carriageways (2 s warning on the lane).',
      'A BRT bus runs the median lanes on a longer warning (2.5 s); the median gaps with refuge islands are always safe.',
      'A Danfo pulls out of its bay onto the eastbound carriageway (2.5 s warning, bay marked).',
      'Goods fall from the shopfronts onto marked pavement tiles (1.8 s warning).',
      'From 2:00 left the outer lanes fill with concrete; the highway centre never closes.',
    ],
  },
  districts: DISTRICTS,
  links: LINKS,
  start: { x: 4, y: 27 },
  area: 'Fadeyi',
  boss: BOSS_BRIEF('Fadeyi / Shomolu', 'route-control'),
});
