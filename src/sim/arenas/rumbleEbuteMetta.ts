import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import { line } from './build';
import { Board, nearestOpen, zoneNear } from './community/painter';
import type { CoverLegend } from './community/painter';
import { BOSS_BRIEF, communityArena } from './community/arena';
import { crossings } from './rumbleKit';

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
const W = 55;
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
};

/** The two railcar lanes (tile columns) and the rows between the portals. */
export const EBUTE_TRACK_X = [26, 27] as const;
export const EBUTE_TRACK_Y: readonly [number, number] = [10, 26];

function paint(): Board {
  const b = new Board(W, H);
  b.fill(0, 0, W - 1, 1, 'B')
    .fill(0, 0, 1, H - 1, 'B')
    .fill(W - 2, 0, W - 1, H - 1, 'B')
    .fill(0, H - 2, W - 1, H - 1, 'L');
  // Murtala Muhammed Way (y 16-19) and the railway lanes with their solid bridge portals
  b.fill(0, 16, W - 1, 19, '=');
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

const base = paint();
const open = base.layout(EBUTE_LEGEND);
const taken = new Set<string>();
const near = (x: number, y: number): [number, number] => {
  const t = nearestOpen(open, x, y, taken);
  taken.add(`${t[0]},${t[1]}`);
  return t;
};
/** Anchors of the west half; the east half mirrors them (Team Rumble splits by x, so supplies are balanced tile count for tile count). */
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
const SUPPLIES = [...SUPPLY_WEST, ...SUPPLY_WEST.map(([x, y]): [number, number] => [W - 1 - x, y])].map(
  ([x, y]) => near(x, y),
);
const BARRIERS = [
  [21, 13],
  [34, 9],
  [21, 25],
  [35, 28],
].map(([x, y]) => near(x!, y!));
const ZONE_TAKEN = new Set<string>(taken);
const ZONES = [
  [42, 7],
  [46, 7],
  [40, 15],
  [48, 15],
].map(([x, y]) => {
  const z = zoneNear(open, x!, y!, ZONE_TAKEN);
  for (const [a, b] of z) ZONE_TAKEN.add(`${a},${b}`);
  return z;
});
const TRAPS = [
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
  const t = nearestOpen(open, x!, y!, ZONE_TAKEN);
  ZONE_TAKEN.add(`${t[0]},${t[1]}`);
  return [t[0], t[1], (t[0] + t[1]) % 2 === 0 ? 'o' : '~'] as const;
});

const ROAD_WEST: [number, number][][] = [line([W - 1, 16], [0, 16]), line([W - 1, 17], [0, 17])];
const ROAD_EAST: [number, number][][] = [line([0, 18], [W - 1, 18]), line([0, 19], [W - 1, 19])];
/** The commuter line: southbound on column 27, northbound on column 26, portal to portal. */
const TRAIN_ROUTES: [number, number][][] = [
  line([EBUTE_TRACK_X[1], EBUTE_TRACK_Y[0]], [EBUTE_TRACK_X[1], EBUTE_TRACK_Y[1]]),
  line([EBUTE_TRACK_X[0], EBUTE_TRACK_Y[1]], [EBUTE_TRACK_X[0], EBUTE_TRACK_Y[0]]),
];
/** The mild foreshore wash: marked waterside tiles slide you one tile north (never lethal). */
const WASH = [
  {
    tiles: [
      [40, 36],
      [41, 36],
      [42, 36],
    ] as [number, number][],
    dir: 'up' as const,
  },
  {
    tiles: [
      [46, 36],
      [47, 36],
      [48, 36],
    ] as [number, number][],
    dir: 'up' as const,
  },
];

const DISTRICTS: DistrictDef[] = [
  { id: 'heritage', name: 'Railway Heritage', role: 'plaza', rects: [[2, 2, 21, 15]] },
  { id: 'station', name: 'Station Boulevard', role: 'concourse', rects: [[22, 2, 33, 19]] },
  { id: 'oyingbo', name: 'Oyingbo Trade Quarter', role: 'street', rects: [[34, 2, 52, 15]] },
  { id: 'residential', name: 'Residential Mainland', role: 'lane', rects: [[2, 20, 21, 36]] },
  { id: 'railYard', name: 'Working Rail Yard', role: 'rail', rects: [[22, 20, 33, 36]] },
  { id: 'foreshore', name: 'Oko-Baba Foreshore', role: 'works', rects: [[34, 20, 52, 36]] },
];
const LINKS: DistrictLink[] = [
  { from: 'heritage', to: 'station', kind: 'open', tiles: crossings(open, 21, 2, 21, 15, 1, 0) },
  { from: 'station', to: 'oyingbo', kind: 'open', tiles: crossings(open, 33, 2, 33, 15, 1, 0) },
  { from: 'heritage', to: 'residential', kind: 'open', tiles: crossings(open, 2, 19, 21, 19, 0, 1) },
  { from: 'station', to: 'railYard', kind: 'open', tiles: crossings(open, 22, 19, 33, 19, 0, 1) },
  { from: 'oyingbo', to: 'foreshore', kind: 'open', tiles: crossings(open, 34, 19, 52, 19, 0, 1) },
  { from: 'residential', to: 'railYard', kind: 'open', tiles: crossings(open, 21, 20, 21, 36, 1, 0) },
  { from: 'railYard', to: 'foreshore', kind: 'open', tiles: crossings(open, 33, 20, 33, 36, 1, 0) },
  { from: 'station', to: 'residential', kind: 'open', tiles: crossings(open, 21, 16, 21, 19, 0, 0) },
];

export const EBUTE_METTA_BOARD = base;
export const RUMBLE_EBUTE_METTA: ArenaDef = communityArena({
  id: 'rumbleEbuteMetta',
  name: 'Ebute-Metta',
  board: base,
  legend: EBUTE_LEGEND,
  supplies: SUPPLIES,
  barriers: BARRIERS,
  core: { w: 11, h: 9, x0: 22, y0: 14 },
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
      'Working railway heritage: the colonial terminus, the modern station, Oyingbo trade and the Oko-Baba foreshore.',
    lighting: 'Warm hazy afternoon over rail steel and old brick',
    hazards: [
      'Buses, kekes and delivery trucks run Murtala Muhammed Way (2 s warning on the lane).',
      'A commuter railcar runs one track at a time between its bridge portals: lane lights, bell and horn 3.5 s ahead. North of the north portal and south of the south portal the corridor is open walkway, always safe.',
      'Goods fall from the Oyingbo arcade onto marked tiles (1.8 s warning).',
      'The foreshore wash slides you one tile back (never lethal).',
      'The terminus and the heritage house are scenery and cannot be blasted.',
      'From 2:00 left the outer districts fill with concrete; the station and the road crossing never close.',
    ],
  },
  districts: DISTRICTS,
  links: LINKS,
  start: { x: 5, y: 32 },
  area: 'Ebute-Metta / Oyingbo',
  boss: BOSS_BRIEF('Ebute-Metta / Oyingbo', 'railway or cultural'),
});
