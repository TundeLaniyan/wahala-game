import type { ArenaDef, CoverRect, DistrictDef, DistrictLink } from './types';
import { line } from './build';
import { Board, nearestOpen, zoneNear } from './community/painter';
import type { CoverLegend } from './community/painter';
import { BOSS_BRIEF, communityArena } from './community/arena';
import { crossings } from './rumbleKit';
import {
  BARRIERS_NEW,
  EBUTE_OLD_W,
  EBUTE_WEST_DX,
  SUPPLY_NEW,
  TRAPS_NEW,
  WASH_NEW,
  WEST_DISTRICTS,
  ebuteX,
  paintEbuteWest,
} from './ebuteWest';

/**
 * City Rumble, researched arena - EBUTE-METTA (Canonical Lagos Map Build Bible v2, section 3.6): working-railway
 * heritage and live transport together with Oyingbo commerce, older residential streets and a changing foreshore, as
 * six connected districts on a 55 x 39 board (not mirrored). Selective compression and fictional links only: the
 * Oko-Baba foreshore is a transition landscape, not an unchanged sawmill. The camera looks north: far = the colonial
 * terminus and the heritage garden, near = the foreshore.
 *
 *   E1 Railway Heritage     (x 2-21, y 2-15)     the colonial terminus with its veranda, the timber heritage house in its garden
 *   E3 Station Boulevard    (x 22-33, y 2-19)    the modern station hall, its forecourt, the two platforms, Murtala Muhammed Way
 *   E4 Oyingbo Trade Quarter (x 34-52, y 2-15)   the arcaded market building, stalls and the multimodal bus bays
 *   E5 Residential Mainland (x 2-21, y 20-36)    older plastered houses with verandas, lanes, a few shops
 *   E2 Working Rail Yard    (x 22-33, y 20-36)   the tracks, freight wagons, sheds and the signal cabin
 *   E6 Oko-Baba Foreshore   (x 34-52, y 20-36)   timber stacks, utilities and a waterside walk
 *
 * The railway: two track lanes (x 26 and 27, y 10-26) between two solid rail-bridge portals; beyond the portals the
 * corridor is open walkway (a grade-separated route over the tunnel mouths), so a track-free way across the board
 * is ALWAYS open (north y 2-7 and south y 29-36). One railcar at a time, 3.5 s warning. Routes (bible 3.6): rail
 * spine E1-E2-E3, market route E3-E4-E6, residential flank E3-E5-E6, crosslink E2-E6.
 */
/** The original (East) board; the expanded board is `W` wide, see ebuteWest.ts. */
const OLD_W = EBUTE_OLD_W;
const W = OLD_W + EBUTE_WEST_DX;
const H = 39;

export const EBUTE_LEGEND: CoverLegend = {
  B: { kind: 'building', maxRun: 8 },
  S: { kind: 'shop', maxRun: 6 },
  L: { kind: 'lockup', maxRun: 6 },
  H: { kind: 'terminus', maxRun: 9 },
  J: { kind: 'heritageHouse', maxRun: 6 },
  N: { kind: 'stationHall', maxRun: 8 },
  Q: { kind: 'portal', maxRun: 2 },
  R: { kind: 'platformPost', maxRun: 1 },
  W: { kind: 'wagon', maxRun: 4 },
  C: { kind: 'cabin', maxRun: 2 },
  A: { kind: 'marketArcade', maxRun: 6 },
  M: { kind: 'stall', maxRun: 3 },
  D: { kind: 'shelter', maxRun: 3 },
  X: { kind: 'house', maxRun: 5 },
  T: { kind: 'tree', maxRun: 2 },
  Y: { kind: 'timberStack', maxRun: 5 },
  K: { kind: 'kiosk', maxRun: 2 },
  U: { kind: 'utility', maxRun: 3 },
  // Ebute Metta West (ebuteWest.ts)
  P: { kind: 'oldHouse', maxRun: 5 },
  G: { kind: 'compound', maxRun: 6 },
  V: { kind: 'workshop', maxRun: 6 },
  F: { kind: 'trailer', maxRun: 6 },
  E: { kind: 'hoardingShop', maxRun: 4 },
  O: { kind: 'boatSlip', maxRun: 4 },
  Z: { kind: 'signalPost', maxRun: 1 },
};

/** The two railcar lanes (tile columns) and the rows between the portals. */
export const EBUTE_TRACK_X = [ebuteX(26), ebuteX(27)] as const;
export const EBUTE_TRACK_Y: readonly [number, number] = [10, 26];

/**
 * The ORIGINAL Ebute-Metta board (Ebute Metta East), exactly as before the westward expansion, in the old
 * coordinates (55 x 39). `compose()` shifts it by EBUTE_WEST_DX; nothing about it changed.
 */
function paintEast(): Board {
  const b = new Board(OLD_W, H);
  b.fill(0, 0, OLD_W - 1, 1, 'B')
    .fill(0, 0, 1, H - 1, 'B')
    .fill(OLD_W - 2, 0, OLD_W - 1, H - 1, 'B')
    .fill(0, H - 2, OLD_W - 1, H - 1, 'L');
  // Murtala Muhammed Way (y 16-19) and the railway lanes with their solid bridge portals
  b.fill(0, 16, OLD_W - 1, 19, '=');
  b.fill(26, 10, 27, 26, '=');
  b.fill(26, 8, 27, 9, 'Q').fill(26, 27, 27, 28, 'Q');
  // E1 Railway Heritage: the colonial terminus along the north edge, the heritage house in its garden
  b.fill(3, 2, 20, 5, 'H');
  for (const x of [9, 10, 15, 16]) b.fill(x, 5, x, 5, '.');
  b.fill(3, 7, 20, 13, '_');
  b.fill(13, 8, 18, 11, 'J');
  b.blocks(3, 7, 12, 13, { ch: 'T', bw: 1, bh: 1, gx: 3, gy: 3, stagger: 2, seed: 61, drop: 0.2 });
  b.fill(3, 14, 20, 15, 'S');
  for (const x of [8, 9, 14, 15]) b.fill(x, 14, x, 15, '.');
  // E3 Station Boulevard: the platforms, canopy posts, the modern station hall and its forecourt
  b.fill(30, 10, 33, 15, 'N');
  b.fill(30, 3, 33, 9, '_');
  b.fill(22, 3, 25, 9, '_');
  for (const y of [11, 14]) b.set(24, y, 'R').set(29, y, 'R');
  b.fill(23, 13, 23, 13, 'T').fill(23, 5, 23, 5, 'T').fill(32, 5, 32, 5, 'T');
  // E4 Oyingbo Trade Quarter: the arcaded market building, stalls, the multimodal bay shelters
  b.fill(36, 3, 51, 6, 'A');
  for (const x of [41, 42, 46, 47]) b.fill(x, 6, x, 6, '.');
  b.blocks(36, 8, 51, 12, { ch: 'M', bw: 2, bh: 2, gx: 1, gy: 1, stagger: 1, seed: 63, drop: 0.12 });
  b.fill(36, 14, 51, 14, 'D');
  for (const x of [40, 41, 47, 48]) b.fill(x, 14, x, 14, '.');
  b.fill(36, 15, 51, 15, '.');
  // E5 Residential Mainland: older houses with verandas, lanes between, a shop row on Murtala Muhammed Way
  b.fill(2, 20, 21, 21, 'S');
  for (const x of [7, 8, 14, 15]) b.fill(x, 20, x, 21, '.');
  b.blocks(2, 23, 21, 35, { ch: 'X', bw: 4, bh: 3, gx: 2, gy: 2, stagger: 2, seed: 65, jw: 1, drop: 0.1 });
  // E2 Working Rail Yard: freight wagons on sidings, the signal cabin, sheds
  b.blocks(29, 21, 33, 26, { ch: 'W', bw: 4, bh: 2, gx: 0, gy: 1, seed: 67 });
  b.fill(23, 22, 24, 23, 'C');
  b.fill(22, 31, 25, 33, 'L').fill(29, 31, 33, 33, 'L');
  // E6 Oko-Baba Foreshore: timber stacks, utility cabinets, the waterside walk (open)
  b.blocks(36, 21, 51, 27, {
    ch: (i, j) => ((i + j) % 3 === 0 ? 'U' : 'Y'),
    bw: 4,
    bh: 2,
    gx: 2,
    gy: 2,
    stagger: 2,
    seed: 69,
    jw: 1,
    drop: 0.15,
  });
  b.blocks(36, 20, 51, 20, { ch: 'K', bw: 1, bh: 1, gx: 5, gy: 0, seed: 70 });
  // lanes between the districts: the west and east edges of the corridor stay open
  for (const x of [20, 21]) b.fill(x, 22, x, 35, '.');
  for (const x of [34, 35]) b.fill(x, 20, x, 36, '.');
  return b;
}

const east = paintEast();
const eastOpen = east.layout(EBUTE_LEGEND);

/** The expanded board: the new west territory, then the old board shifted east (its old west border becomes the facade). */
function compose(): Board {
  const b = new Board(W, H);
  paintEbuteWest(b);
  // old columns 2..54 become 20..72; the old border columns 0-1 are replaced by the west territory's own tiles
  for (let y = 0; y < H; y++) for (let x = 2; x < OLD_W; x++) b.set(ebuteX(x), y, east.get(x, y));
  return b;
}

const base = compose();
const open = base.layout(EBUTE_LEGEND);

/**
 * The objects. The original board's objects keep their order, variants and numbering (so every shop sign, house and
 * facade of Ebute Metta East looks exactly as before), shifted by EBUTE_WEST_DX; its old west border columns (x 0-1) are
 * gone (the west territory stands there). The west's own objects follow, numbered on from the east's.
 */
function composeCover(): CoverRect[] {
  const eastCover = east
    .cover(EBUTE_LEGEND)
    .filter((r) => r.x + r.w > 2)
    .map((r) => ({ ...r, x: ebuteX(r.x) }));
  const westOnly = new Board(W, H);
  paintEbuteWest(westOnly);
  // the old top / bottom border pieces (shifted) already cover x >= EBUTE_WEST_DX of rows 0-1 and 37-38
  for (const y of [0, 1, H - 2, H - 1]) westOnly.fill(EBUTE_WEST_DX, y, W - 1, y, '.');
  westOnly.fill(EBUTE_WEST_DX + 2, 0, W - 1, H - 1, '.');
  const first = east.cover(EBUTE_LEGEND).length;
  const westCover = westOnly.cover(EBUTE_LEGEND).map((r, i) => ({ ...r, v: (first + i) % 7, g: first + i }));
  return [...eastCover, ...westCover];
}

// ---- anchors of the ORIGINAL board: computed on the original layout (so they snap exactly as before) and shifted ----
const takenEast = new Set<string>();
const nearEast = (x: number, y: number): [number, number] => {
  const t = nearestOpen(eastOpen, x, y, takenEast);
  takenEast.add(`${t[0]},${t[1]}`);
  return t;
};
const shift = ([x, y]: readonly [number, number]): [number, number] => [ebuteX(x), y];
/** Anchors of the old west half; the old east half mirrors them (the original supplies, balanced tile for tile on the old board). */
const SUPPLY_WEST: [number, number][] = [
  [5, 8],
  [19, 10],
  [4, 14],
  [24, 6],
  [24, 13],
  [5, 26],
  [18, 30],
  [10, 33],
  [24, 29],
];
const SUPPLIES_EAST = [
  ...SUPPLY_WEST,
  ...SUPPLY_WEST.map(([x, y]): [number, number] => [OLD_W - 1 - x, y]),
].map(([x, y]) => shift(nearEast(x, y)));
const BARRIERS_EAST = [
  [21, 13],
  [34, 9],
  [21, 25],
  [35, 28],
].map(([x, y]) => shift(nearEast(x!, y!)));
const ZONE_TAKEN_EAST = new Set<string>(takenEast);
const ZONES = [
  [42, 7],
  [46, 7],
  [40, 15],
  [48, 15],
].map(([x, y]) => {
  const z = zoneNear(eastOpen, x!, y!, ZONE_TAKEN_EAST);
  for (const [a, b] of z) ZONE_TAKEN_EAST.add(`${a},${b}`);
  return z.map(shift);
});
const TRAPS_EAST = [
  [5, 7],
  [14, 13],
  [22, 4],
  [32, 4],
  [24, 14],
  [38, 9],
  [46, 11],
  [6, 22],
  [16, 30],
  [24, 30],
  [39, 30],
  [48, 24],
].map(([x, y]) => {
  const t = nearestOpen(eastOpen, x!, y!, ZONE_TAKEN_EAST);
  ZONE_TAKEN_EAST.add(`${t[0]},${t[1]}`);
  return [ebuteX(t[0]), t[1], (t[0] + t[1]) % 2 === 0 ? 'o' : '~'] as const;
});

// ---- anchors of the west territory: snapped on the expanded layout, never onto an old anchor ----
const takenAll = new Set<string>([
  ...SUPPLIES_EAST.map(([x, y]) => `${x},${y}`),
  ...BARRIERS_EAST.map(([x, y]) => `${x},${y}`),
  ...ZONES.flat().map(([x, y]) => `${x},${y}`),
  ...TRAPS_EAST.map(([x, y]) => `${x},${y}`),
]);
const snap = (x: number, y: number): [number, number] => {
  const t = nearestOpen(open, x, y, takenAll);
  takenAll.add(`${t[0]},${t[1]}`);
  return t;
};
const SUPPLIES_WEST = SUPPLY_NEW.map(([x, y]) => snap(x, y));
const BARRIERS_WEST = BARRIERS_NEW.map(([x, y]) => snap(x, y));
const TRAPS_WEST = TRAPS_NEW.map(([x, y]) => {
  const t = snap(x, y);
  return [t[0], t[1], (t[0] + t[1]) % 2 === 0 ? 'o' : '~'] as const;
});
const SUPPLIES = [...SUPPLIES_WEST, ...SUPPLIES_EAST];
const BARRIERS = [...BARRIERS_WEST, ...BARRIERS_EAST];
const TRAPS = [...TRAPS_WEST, ...TRAPS_EAST];

// Murtala Muhammed Way, which carries on west as Apapa Road: the same four lanes across the whole board
const ROAD_WEST: [number, number][][] = [line([W - 1, 16], [0, 16]), line([W - 1, 17], [0, 17])];
const ROAD_EAST: [number, number][][] = [line([0, 18], [W - 1, 18]), line([0, 19], [W - 1, 19])];
/** The commuter line: southbound on column 27, northbound on column 26 (old coordinates), portal to portal. */
const TRAIN_ROUTES: [number, number][][] = [
  line([EBUTE_TRACK_X[1], EBUTE_TRACK_Y[0]], [EBUTE_TRACK_X[1], EBUTE_TRACK_Y[1]]),
  line([EBUTE_TRACK_X[0], EBUTE_TRACK_Y[1]], [EBUTE_TRACK_X[0], EBUTE_TRACK_Y[0]]),
];
/** The mild foreshore wash: marked waterside tiles slide you one tile north (never lethal). Oko-Baba (east) and Otumara (west). */
const WASH = [
  ...WASH_NEW,
  ...[
    [40, 41, 42],
    [46, 47, 48],
  ].map((xs) => ({ tiles: xs.map((x): [number, number] => [ebuteX(x), 36]), dir: 'up' as const })),
];

/** The six original districts, shifted; the west adds four (ebuteWest.ts). */
const shiftRect = ([x0, y0, x1, y1]: [number, number, number, number]): [number, number, number, number] => [
  ebuteX(x0),
  y0,
  ebuteX(x1),
  y1,
];
const DISTRICTS: DistrictDef[] = [
  ...WEST_DISTRICTS,
  { id: 'heritage', name: 'Railway Heritage', role: 'plaza', rects: [shiftRect([2, 2, 21, 15])] },
  { id: 'station', name: 'Station Boulevard', role: 'concourse', rects: [shiftRect([22, 2, 33, 19])] },
  { id: 'oyingbo', name: 'Oyingbo Trade Quarter', role: 'street', rects: [shiftRect([34, 2, 52, 15])] },
  { id: 'residential', name: 'Residential Mainland', role: 'lane', rects: [shiftRect([2, 20, 21, 36])] },
  { id: 'railYard', name: 'Working Rail Yard', role: 'rail', rects: [shiftRect([22, 20, 33, 36])] },
  { id: 'foreshore', name: 'Oko-Baba Foreshore', role: 'works', rects: [shiftRect([34, 20, 52, 36])] },
];
const E = ebuteX;
/** The last column of the west territory (its east edge, beside the old board's west lane). */
const XW = EBUTE_WEST_DX + 1;
const LINKS: DistrictLink[] = [
  { from: 'heritage', to: 'station', kind: 'open', tiles: crossings(open, E(21), 2, E(21), 15, 1, 0) },
  { from: 'station', to: 'oyingbo', kind: 'open', tiles: crossings(open, E(33), 2, E(33), 15, 1, 0) },
  { from: 'heritage', to: 'residential', kind: 'open', tiles: crossings(open, E(2), 19, E(21), 19, 0, 1) },
  { from: 'station', to: 'railYard', kind: 'open', tiles: crossings(open, E(22), 19, E(33), 19, 0, 1) },
  { from: 'oyingbo', to: 'foreshore', kind: 'open', tiles: crossings(open, E(34), 19, E(52), 19, 0, 1) },
  { from: 'residential', to: 'railYard', kind: 'open', tiles: crossings(open, E(21), 20, E(21), 36, 1, 0) },
  { from: 'railYard', to: 'foreshore', kind: 'open', tiles: crossings(open, E(33), 20, E(33), 36, 1, 0) },
  { from: 'station', to: 'residential', kind: 'open', tiles: crossings(open, E(21), 16, E(21), 19, 0, 0) },
  // Ebute Metta West: its own street graph, joined to the old board along its former west border (x XW -> XW + 1)
  { from: 'abuleIjesha', to: 'heritage', kind: 'open', tiles: crossings(open, XW, 2, XW, 15, 1, 0) },
  { from: 'abuleIjesha', to: 'apapaRoad', kind: 'open', tiles: crossings(open, 2, 12, XW, 12, 0, 1) },
  { from: 'apapaRoad', to: 'heritage', kind: 'open', tiles: crossings(open, XW, 13, XW, 15, 1, 0) },
  { from: 'apapaRoad', to: 'residential', kind: 'open', tiles: crossings(open, XW, 16, XW, 22, 1, 0) },
  { from: 'apapaRoad', to: 'ilogbo', kind: 'open', tiles: crossings(open, 2, 22, XW, 22, 0, 1) },
  { from: 'ilogbo', to: 'residential', kind: 'open', tiles: crossings(open, XW, 23, XW, 36, 1, 0) },
  { from: 'ilogbo', to: 'otumara', kind: 'open', tiles: crossings(open, 2, 31, XW, 31, 0, 1) },
  { from: 'otumara', to: 'residential', kind: 'open', tiles: crossings(open, XW, 32, XW, 36, 1, 0) },
];

export const EBUTE_METTA_BOARD = base;
export const RUMBLE_EBUTE_METTA: ArenaDef = communityArena({
  id: 'rumbleEbuteMetta',
  name: 'Ebute-Metta',
  board: base,
  legend: EBUTE_LEGEND,
  cover: composeCover(),
  supplies: SUPPLIES,
  barriers: BARRIERS,
  core: { w: 11, h: 9, x0: E(22), y0: 14 },
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
      style: 'train',
      routes: TRAIN_ROUTES,
      stepTicks: 4,
      firstAtSec: 18,
      everySec: [16, 24],
      warnSec: 3.5,
    },
    {
      kind: 'sweep',
      style: 'truck',
      routes: [...ROAD_EAST, ...ROAD_WEST],
      stepTicks: 5,
      firstAtSec: 24,
      everySec: [14, 20],
      warnSec: 2.5,
    },
    {
      kind: 'strike',
      style: 'goods',
      zones: ZONES,
      activeSec: 0.35,
      firstAtSec: 16,
      everySec: [7, 11],
      warnSec: 1.8,
    },
    { kind: 'drop', style: 'merch', count: 3, firstAtSec: 12, everySec: [10, 15], warnSec: 1.5 },
    { kind: 'push', style: 'wash', zones: WASH, firstAtSec: 22, everySec: [10, 16], warnSec: 2 },
  ],
  info: {
    tagline:
      'Working railway heritage and its western streets: the colonial terminus, the modern station, Oyingbo trade, the Oko-Baba foreshore, and Apapa Road with Ilogbo, Abule Ijesha and the Otumara waterfront to the west.',
    lighting: 'Warm hazy afternoon over rail steel and old brick',
    hazards: [
      'Buses, kekes and delivery trucks run Murtala Muhammed Way, which carries on west as Apapa Road (2 s warning on the lane).',
      'A commuter railcar runs one track at a time between its bridge portals: lane lights, bell and horn 3.5 s ahead. North of the north portal and south of the south portal the corridor is open walkway, always safe.',
      'Goods fall from the Oyingbo arcade onto marked tiles (1.8 s warning).',
      'The foreshore and Otumara waterfront washes slide you one tile back (never lethal).',
      'Parked trailers and tankers on the Apapa Road shoulders are cover; the disused Ilogbo rail spur is scenery, not a track lane.',
      'The terminus and the heritage house are scenery and cannot be blasted.',
      'From 2:00 left the outer districts fill with concrete; the station and the road crossing never close.',
    ],
  },
  districts: DISTRICTS,
  links: LINKS,
  start: { x: E(5), y: 32 },
  area: 'Ebute-Metta / Oyingbo',
  boss: BOSS_BRIEF('Ebute-Metta / Oyingbo', 'railway or cultural'),
});
