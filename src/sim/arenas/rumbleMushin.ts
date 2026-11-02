import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import { line } from './build';
import { Board, nearestOpen, zoneNear } from './community/painter';
import { BOSS_BRIEF, communityArena } from './community/arena';
import type { CoverLegend } from './community/painter';
import { crossings } from './rumbleKit';

/**
 * City Rumble, researched arena - MUSHIN (Canonical Lagos Map Build Bible v2, section 3.1): the dense mainland
 * commerce of auto parts, food trade, grain, timber and residential courts, as six connected districts on a
 * 53 x 39 board (not mirrored). Selective compression and fictional links only: nothing here claims to be the
 * present-day street plan. The camera looks north, so far = north.
 *
 *   M1 Ladipo Machine Quarter (x 2-16, y 2-15)   auto-parts stalls, engine-testing workshops, scrap heaps, a wheel yard
 *   M2 Ojuwoye Trading Grid   (x 19-33, y 2-15)  the tight market grid of lock-up stalls, shop rows on both streets
 *   M4 Daleko Grain Quarter   (x 36-50, y 2-15)  grain warehouses with loading yards, sack stalls
 *   M3 Idi-Oro Transit Square (x 19-33, y 16-36) the main road, the transit plaza, the Idi-Oro food hall, leather streets
 *   M6 Neighbourhood Courtyards (x 2-16, y 21-36) residential compounds, lanes, a small court
 *   M5 Timber Row             (x 36-50, y 21-36) timber yards, saw sheds, the glass-and-timber frontage
 *
 * Routes (bible 3.1): main M1-M2-M3-M4-M5; workshop and neighbourhood flank M1-M6-M3; warehouse / material flank
 * M2-M4-M5-M6. Two long N-S streets (x 17-18, x 34-35) frame the centre column; the four-lane main road
 * (y 16-19) runs edge to edge and is the only place traffic crosses the board.
 */
const W = 53;
const H = 39;

/** Object letters of this board (the renderer's `mushin` families). */
export const MUSHIN_LEGEND: CoverLegend = {
  B: { kind: 'building', maxRun: 8 },
  S: { kind: 'shop', maxRun: 6 },
  L: { kind: 'lockup', maxRun: 6 },
  P: { kind: 'partsStall', maxRun: 4 },
  H: { kind: 'heap', maxRun: 3 },
  W: { kind: 'workshop', maxRun: 4 },
  M: { kind: 'stall', maxRun: 3 },
  G: { kind: 'warehouse', maxRun: 6 },
  T: { kind: 'timber', maxRun: 6 },
  F: { kind: 'foodHall', maxRun: 12 },
  R: { kind: 'house', maxRun: 5 },
  C: { kind: 'wall', maxRun: 6 },
  K: { kind: 'kiosk', maxRun: 2 },
  D: { kind: 'shelter', maxRun: 3 },
};

function paint(): Board {
  const b = new Board(W, H);
  // perimeter: tall buildings north / east / west, low lock-ups on the camera side
  b.fill(0, 0, W - 1, 1, 'B')
    .fill(0, 0, 1, H - 1, 'B')
    .fill(W - 2, 0, W - 1, H - 1, 'B')
    .fill(0, H - 2, W - 1, H - 1, 'L');
  // M1 Ladipo: workshops on the north edge, parts stalls in staggered rows, scrap heaps, the wheel yard
  b.blocks(2, 2, 16, 3, { ch: 'W', bw: 3, bh: 2, gx: 1, gy: 0 });
  b.blocks(2, 5, 16, 13, {
    ch: (i, j) => ((i + j) % 5 === 3 ? 'H' : 'P'),
    bw: 3,
    bh: 2,
    gx: 1,
    gy: 1,
    stagger: 2,
    seed: 11,
    jw: 1,
    drop: 0.1,
  });
  b.fill(9, 7, 13, 10, '_');
  // M2 Ojuwoye: shop rows north and south, the stall grid between
  b.fill(19, 2, 33, 3, 'S');
  b.blocks(19, 5, 33, 13, { ch: 'M', bw: 2, bh: 2, gx: 1, gy: 1, stagger: 1, seed: 23, drop: 0.12 });
  b.fill(19, 14, 33, 15, 'S');
  // M4 Daleko: four grain warehouses, loading yards, sack stalls
  b.blocks(36, 2, 50, 13, { ch: 'G', bw: 5, bh: 4, gx: 2, gy: 2, seed: 31, jw: 1, jh: 1 });
  b.fill(36, 14, 50, 15, 'S');
  b.blocks(36, 14, 50, 15, { ch: 'M', bw: 2, bh: 1, gx: 2, gy: 0 });
  // the main road and its shop rows
  b.fill(0, 16, W - 1, 19, '=');
  b.fill(2, 14, 16, 15, 'S').fill(2, 20, 33, 21, 'S').fill(36, 20, 50, 21, 'S');
  // M3 Idi-Oro Transit Square: the plaza, the food hall, bus shelters and kiosks, the leather streets south
  b.fill(19, 22, 33, 27, '_');
  b.fill(22, 23, 30, 26, 'F');
  b.blocks(19, 28, 33, 35, { ch: 'S', bw: 3, bh: 2, gx: 1, gy: 2, stagger: 2, seed: 71, jw: 1, drop: 0.1 });
  // M6 Neighbourhood Courtyards: compounds and lanes
  b.blocks(2, 22, 16, 35, {
    ch: (i, j) => ((i * 3 + j) % 4 === 0 ? 'C' : 'R'),
    bw: 4,
    bh: 3,
    gx: 2,
    gy: 2,
    stagger: 2,
    seed: 47,
    jw: 1,
    jh: 1,
    drop: 0.1,
  });
  b.fill(8, 27, 11, 29, '_');
  // M5 Timber Row: timber yards, saw sheds
  b.blocks(36, 22, 50, 35, {
    ch: (_i, j) => (j === 0 ? 'W' : 'T'),
    bw: 6,
    bh: 2,
    gx: 1,
    gy: 2,
    seed: 59,
    jw: 2,
    drop: 0.08,
  });
  // the two long streets and the lanes through the road-side shop rows
  for (const x of [17, 18, 34, 35]) b.fill(x, 2, x, 15, '.').fill(x, 20, x, 36, '.');
  for (const x of [8, 9, 25, 26, 42, 43]) b.fill(x, 14, x, 15, '.').fill(x, 20, x, 21, '.');
  return b;
}

const base = paint();
const open = base.layout(MUSHIN_LEGEND);
const near = (x: number, y: number, taken: Set<string>): [number, number] => {
  const t = nearestOpen(open, x, y, taken);
  taken.add(`${t[0]},${t[1]}`);
  return t;
};

/** Anchors by intent (the nearest open floor is used): a supply crate in every district, two in the big ones. */
const taken = new Set<string>();
/** Anchors of the west half; the east half mirrors them (Team Rumble splits by x, so supplies are balanced tile count for tile count). */
const SUPPLY_WEST: [number, number][] = [
  [4, 5],
  [13, 12],
  [22, 6],
  [20, 25],
  [5, 25],
  [13, 33],
  [10, 8],
  [23, 33],
  [24, 14],
];
const SUPPLIES = [...SUPPLY_WEST, ...SUPPLY_WEST.map(([x, y]): [number, number] => [W - 1 - x, y])].map(
  ([x, y]) => near(x, y, taken),
);
const BARRIERS = [
  [17, 9],
  [34, 9],
  [26, 28],
  [17, 29],
].map(([x, y]) => near(x!, y!, taken));

const ZONE_TAKEN = new Set<string>(taken);
/** Goods tumble off the shopfronts onto the marked aisle tiles of the trading streets. */
const ZONES = [
  [22, 13],
  [30, 13],
  [6, 13],
  [44, 13],
  [24, 4],
  [10, 4],
  [28, 36],
  [8, 36],
].map(([x, y]) => {
  const z = zoneNear(open, x!, y!, ZONE_TAKEN);
  for (const [a, b] of z) ZONE_TAKEN.add(`${a},${b}`);
  return z;
});

const TRAPS = [
  [4, 4],
  [12, 13],
  [18, 8],
  [34, 6],
  [47, 13],
  [36, 13],
  [10, 32],
  [14, 24],
  [44, 30],
  [47, 24],
  [27, 33],
  [22, 29],
].map(([x, y]) => {
  const t = near(x!, y!, ZONE_TAKEN);
  return [t[0], t[1], (t[0]! + t[1]!) % 2 === 0 ? 'o' : '~'] as const;
});

/** Lanes of the four-lane main road (right-hand traffic: westbound on the north lanes, eastbound on the south). */
const ROAD_WEST: [number, number][][] = [line([W - 1, 16], [0, 16]), line([W - 1, 17], [0, 17])];
const ROAD_EAST: [number, number][][] = [line([0, 18], [W - 1, 18]), line([0, 19], [W - 1, 19])];

const DISTRICTS: DistrictDef[] = [
  { id: 'ladipo', name: 'Ladipo Machine Quarter', role: 'works', rects: [[2, 2, 16, 15]] },
  { id: 'ojuwoye', name: 'Ojuwoye Trading Grid', role: 'street', rects: [[19, 2, 33, 15]] },
  { id: 'idiOro', name: 'Idi-Oro Transit Square', role: 'plaza', rects: [[19, 16, 33, 36]] },
  { id: 'daleko', name: 'Daleko Grain Quarter', role: 'service', rects: [[36, 2, 50, 15]] },
  { id: 'timberRow', name: 'Timber Row', role: 'works', rects: [[36, 20, 50, 36]] },
  { id: 'courtyards', name: 'Neighbourhood Courtyards', role: 'lane', rects: [[2, 20, 16, 36]] },
];
const LINKS: DistrictLink[] = [
  { from: 'ladipo', to: 'ojuwoye', kind: 'open', tiles: crossings(open, 17, 2, 17, 15, 1, 0) },
  { from: 'ojuwoye', to: 'daleko', kind: 'open', tiles: crossings(open, 34, 2, 34, 15, 1, 0) },
  { from: 'ojuwoye', to: 'idiOro', kind: 'open', tiles: crossings(open, 19, 15, 33, 15, 0, 1) },
  { from: 'ladipo', to: 'courtyards', kind: 'open', tiles: crossings(open, 2, 19, 16, 19, 0, 1) },
  { from: 'ladipo', to: 'idiOro', kind: 'open', tiles: crossings(open, 17, 16, 17, 19, 1, 0) },
  { from: 'daleko', to: 'idiOro', kind: 'open', tiles: crossings(open, 34, 16, 34, 19, 1, 0) },
  { from: 'daleko', to: 'timberRow', kind: 'open', tiles: crossings(open, 36, 19, 50, 19, 0, 1) },
  { from: 'courtyards', to: 'idiOro', kind: 'open', tiles: crossings(open, 17, 22, 17, 36, 1, 0) },
  { from: 'idiOro', to: 'timberRow', kind: 'open', tiles: crossings(open, 34, 22, 34, 36, 1, 0) },
];

export const MUSHIN_BOARD = base;
export const RUMBLE_MUSHIN: ArenaDef = communityArena({
  id: 'rumbleMushin',
  name: 'Mushin',
  board: base,
  legend: MUSHIN_LEGEND,
  supplies: SUPPLIES,
  barriers: BARRIERS,
  core: { w: 11, h: 9, x0: 21, y0: 16 },
  softDensity: 0.4,
  lanes: [
    [0, 16, 'right'],
    [0, 17, 'right'],
    [0, 18, 'right'],
    [0, 19, 'right'],
    [W - 1, 16, 'left'],
    [W - 1, 17, 'left'],
    [W - 1, 18, 'left'],
    [W - 1, 19, 'left'],
  ],
  traps: TRAPS,
  hazards: [
    {
      kind: 'sweep',
      style: 'traffic',
      routes: [...ROAD_WEST, ...ROAD_EAST],
      stepTicks: 5,
      firstAtSec: 9,
      everySec: [6, 9],
      warnSec: 2,
    },
    {
      kind: 'sweep',
      style: 'truck',
      routes: [...ROAD_EAST, ...ROAD_WEST],
      stepTicks: 5,
      firstAtSec: 20,
      everySec: [14, 20],
      warnSec: 2.5,
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
    { kind: 'drop', style: 'merch', count: 3, firstAtSec: 12, everySec: [10, 15], warnSec: 1.5 },
  ],
  info: {
    tagline:
      'Mushin at full trade: Ladipo auto parts, the Ojuwoye stall grid, Idi-Oro food hall, Daleko grain and Timber Row.',
    lighting: 'Hot, hazy mainland afternoon under tarpaulins and corrugated roofs',
    hazards: [
      'Danfos, buses and kekes race the four-lane main road (2 s warning on the lane).',
      'A delivery truck rolls the road on its own schedule (2.5 s warning).',
      'Loading goods tumble off the shopfronts onto marked aisle tiles (1.8 s warning).',
      'Traders drop goods into the aisles - new crates block your route.',
      'From 2:00 left the outer districts fill with concrete; the Idi-Oro plaza and the road never close.',
    ],
  },
  districts: DISTRICTS,
  links: LINKS,
  start: { x: 4, y: 33 },
  area: 'Mushin',
  boss: BOSS_BRIEF('Mushin', 'market-trade'),
});
