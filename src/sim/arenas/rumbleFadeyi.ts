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
 *   F2 Westbound Shopfronts  (x 2-31, y 2-9)    shop row on the highway pavement, stalls and workshops behind
 *   F1 BRT Centreline        (x 0-42, y 10-18)  westbound carriageway, BRT lanes between two median barriers,
 *                                               eastbound carriageway; median gaps at x 10-11 and 28-29 are the crossings
 *   F3 Inner Neighbourhood Grid (x 2-17, y 19-27) houses and lanes behind the south pavement
 *   F5 Recreation + Workshops (x 18-31, y 19-27)  workshops, the bank frontage, a walled recreation court
 *   F4 Onipanu Approach      (x 32-40, y 2-9 and 19-27)  the side roads and their frontage at the two east corners
 *
 * Routes (bible 3.3): direct F2-F1-F4; neighbourhood F2-F3-F4 and recreation F2-F5-F4 (both cross the highway at a
 * crossing gap); cross-links F1-F3 and F3-F5. Median gaps always stay open; the two carriageways and the BRT lanes
 * are the only lethal ground and each wave is telegraphed.
 */
const W = 43;
const H = 29;

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
  // the Ikorodu Road carriageways and the BRT centreline
  b.fill(0, 10, W - 1, 18, '=');
  for (const y of [12, 15]) {
    b.fill(2, y, W - 3, y, 'D');
    b.fill(10, y, 11, y, '_').fill(28, y, 29, y, '_'); // crossing gaps with refuge islands
  }
  b.fill(17, 12, 22, 12, 'C').fill(17, 15, 22, 15, 'C'); // the BRT stop shelters on the median lines
  // F2: the shop row on the north pavement, stalls / workshops / kiosks behind it, a lane through the row
  b.fill(2, 6, 31, 7, 'S');
  b.blocks(2, 2, 31, 3, { ch: (i) => (i % 3 === 0 ? 'W' : 'M'), bw: 3, bh: 2, gx: 2, gy: 0, seed: 5, jw: 1, drop: 0.15 });
  for (const x of [8, 9, 20, 21, 29, 30]) b.fill(x, 6, x, 7, '.');
  // F4 north-east: the Onipanu approach road leaves the north edge; frontage either side of it
  b.fill(34, 0, 37, 9, '=');
  b.fill(32, 6, 33, 7, 'S').fill(38, 6, 40, 7, 'S').fill(38, 2, 39, 3, 'K').fill(32, 2, 33, 3, 'B');
  // F3: the south shop row, houses and lanes behind it
  b.fill(2, 21, 17, 22, 'S');
  b.blocks(2, 24, 17, 26, { ch: 'R', bw: 4, bh: 3, gx: 3, gy: 0, seed: 9, jw: 1, drop: 0.1 });
  // F5: the bank frontage on the pavement, workshops, the walled recreation court
  b.fill(19, 21, 26, 22, 'T');
  b.blocks(19, 24, 25, 26, { ch: 'W', bw: 3, bh: 2, gx: 1, gy: 0, seed: 13, jw: 1, drop: 0.2 });
  b.fill(27, 21, 31, 26, '_').fill(26, 23, 26, 26, 'V');
  // F4 south-east: the side road leaves the south edge
  b.fill(34, 19, 37, 28, '=');
  b.fill(32, 21, 33, 22, 'S').fill(38, 21, 40, 22, 'B').fill(38, 24, 40, 26, 'K');
  for (const x of [8, 9, 14, 15]) b.fill(x, 21, x, 22, '.');
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
  [5, 5],
  [14, 4],
  [25, 5],
  [29, 8],
  [6, 9],
  [38, 8],
  [5, 24],
  [14, 24],
  [22, 26],
  [30, 25],
  [39, 22],
].map(([x, y]) => near(x!, y!));
const BARRIERS = [
  [18, 9],
  [33, 25],
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

/** Carriageways: westbound on the north lanes (rows 10-11), eastbound on the south (rows 16-17); BRT lanes 13-14. */
const WESTBOUND: [number, number][][] = [line([W - 1, 10], [0, 10]), line([W - 1, 11], [0, 11])];
const EASTBOUND: [number, number][][] = [line([0, 16], [W - 1, 16]), line([0, 17], [W - 1, 17])];
const BRT: [number, number][][] = [line([0, 13], [W - 1, 13]), line([W - 1, 14], [0, 14])];
/** A Danfo leaves its bay at the south-west and joins the eastbound carriageway. */
const DEPARTURE: [number, number][][] = [[...line([13, 18], [13, 18]), ...line([14, 18], [W - 1, 18])]];

const DISTRICTS: DistrictDef[] = [
  { id: 'shopfronts', name: 'Westbound Shopfronts', role: 'street', rects: [[2, 2, 31, 9]] },
  { id: 'brtCentreline', name: 'BRT Centreline', role: 'approach', rects: [[0, 10, 42, 18]] },
  { id: 'neighbourhood', name: 'Inner Neighbourhood Grid', role: 'lane', rects: [[2, 19, 17, 27]] },
  {
    id: 'onipanu',
    name: 'Onipanu Approach',
    role: 'street',
    rects: [
      [32, 2, 40, 9],
      [32, 19, 40, 27],
    ],
  },
  { id: 'recreation', name: 'Recreation + Workshops', role: 'works', rects: [[18, 19, 31, 27]] },
];
const LINKS: DistrictLink[] = [
  { from: 'shopfronts', to: 'brtCentreline', kind: 'open', tiles: crossings(open, 2, 9, 31, 9, 0, 1) },
  { from: 'brtCentreline', to: 'neighbourhood', kind: 'open', tiles: crossings(open, 2, 18, 17, 18, 0, 1) },
  { from: 'brtCentreline', to: 'recreation', kind: 'open', tiles: crossings(open, 18, 18, 31, 18, 0, 1) },
  {
    from: 'brtCentreline',
    to: 'onipanu',
    kind: 'open',
    tiles: [...crossings(open, 32, 9, 40, 9, 0, 1), ...crossings(open, 32, 18, 40, 18, 0, 1)],
  },
  { from: 'shopfronts', to: 'onipanu', kind: 'open', tiles: crossings(open, 31, 2, 31, 9, 1, 0) },
  { from: 'neighbourhood', to: 'recreation', kind: 'open', tiles: crossings(open, 17, 19, 17, 27, 1, 0) },
  { from: 'recreation', to: 'onipanu', kind: 'open', tiles: crossings(open, 31, 19, 31, 27, 1, 0) },
];

export const FADEYI_BOARD = base;
export const RUMBLE_FADEYI: ArenaDef = communityArena({
  id: 'rumbleFadeyi',
  name: 'Fadeyi',
  board: base,
  legend: FADEYI_LEGEND,
  supplies: SUPPLIES,
  barriers: BARRIERS,
  core: { w: 11, h: 9, x0: 16, y0: 10 },
  softDensity: 0.4,
  lanes: [
    [0, 10, 'right'],
    [0, 11, 'right'],
    [0, 16, 'right'],
    [0, 17, 'right'],
    [W - 1, 10, 'left'],
    [W - 1, 11, 'left'],
    [W - 1, 16, 'left'],
    [W - 1, 17, 'left'],
  ],
  traps: TRAPS,
  endgame: [
    [
      [18, 11, 'o'],
      [22, 17, '~'],
      [24, 11, 'o'],
      [20, 13, '~'],
      [17, 16, 'o'],
    ],
    [
      [19, 10, '~'],
      [24, 16, 'o'],
      [21, 14, '~'],
      [26, 10, 'o'],
      [16, 17, '~'],
    ],
  ],
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
  start: { x: 4, y: 23 },
  area: 'Fadeyi',
  boss: BOSS_BRIEF('Fadeyi / Shomolu', 'route-control'),
});
