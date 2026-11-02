import type { ArenaDef, DistrictDef, DistrictLink } from './types';
import { line } from './build';
import { Board, nearestOpen, zoneNear } from './community/painter';
import type { CoverLegend } from './community/painter';
import { BOSS_BRIEF, communityArena } from './community/arena';
import { crossings } from './rumbleKit';

/**
 * City Rumble, researched arena - LEKKI (Canonical Lagos Map Build Bible v2, section 3.5): the founder-approved
 * Phase 1 and Ikate transition - modern roads, high compound walls, mixed commerce, a construction site, leisure and
 * arts-market sheds, and the lagoon and coastal edges - as six connected districts on a 57 x 39 board (not mirrored;
 * it REPLACES the generic mirrored "Lekki Nightworks" roadworks grid, id `rumbleLekki`). Not an artificial
 * peninsula-wide map. The camera looks north: far = the lagoon promenade with the Link Bridge on the horizon, near =
 * the Lekki-Epe Expressway.
 *
 *   K4 Lagoon-Side Promenade (x 2-36, y 2-9)    paved waterfront, leisure kiosks, palms; mild water narrowing
 *   K5 Ikate Recreation Edge (x 37-54, y 2-17)  a sports court, leisure frontage and the arts-market sheds
 *   K2 Admiralty Commerce    (x 2-19, y 10-21)  glass-and-plaster mixed-use blocks, cafes, a construction site
 *   K6 Coastal Access Roads  (x 2-19, y 22-29)  sandy access lanes, beach-side stalls and a car park
 *   K3 Freedom Way Estates   (x 24-36, y 10-17 and x 24-54, y 21-29)  walled compounds and quiet streets
 *   K1 Expressway Gateway    (x 0-54, y 30-36)  the six-lane expressway, a gateway canopy and roadside services
 *
 * Roads: Admiralty Way (x 20-23) runs north-south from the promenade plaza to the expressway, Freedom Way
 * (y 18-20) runs east-west across the whole board. Routes (bible 3.5): K1-K2-K4-K5; estates K1-K3-K5; coastal
 * K2-K3-K6. The water modifier is a mild wash on the promenade edge (never lethal, a dry alternative always open).
 */
const W = 57;
const H = 39;

export const LEKKI_LEGEND: CoverLegend = {
  B: { kind: 'building', maxRun: 8 },
  G: { kind: 'glassBlock', maxRun: 6 },
  S: { kind: 'shop', maxRun: 6 },
  V: { kind: 'compoundWall', maxRun: 8 },
  R: { kind: 'villa', maxRun: 6 },
  K: { kind: 'kiosk', maxRun: 2 },
  A: { kind: 'artsShed', maxRun: 6 },
  H: { kind: 'hoarding', maxRun: 6 },
  P: { kind: 'palm', maxRun: 1 },
  F: { kind: 'fuelCanopy', maxRun: 8 },
  L: { kind: 'lockup', maxRun: 6 },
  M: { kind: 'stall', maxRun: 3 },
  C: { kind: 'sportsClub', maxRun: 8 },
};

function paint(): Board {
  const b = new Board(W, H);
  b.fill(0, 0, W - 1, 1, 'B')
    .fill(0, 0, 1, H - 1, 'B')
    .fill(W - 2, 0, W - 1, H - 1, 'B')
    .fill(0, H - 2, W - 1, H - 1, 'L');
  // roads: the expressway (y 30-34), Freedom Way (y 18-20, edge to edge), Admiralty Way (x 20-23)
  b.fill(0, 30, W - 1, 34, '=')
    .fill(0, 18, W - 1, 20, '=')
    .fill(20, 9, 23, 29, '=');
  // K4 promenade: palms along the lagoon edge, leisure kiosks, a paved plaza at the head of Admiralty Way
  b.fill(2, 2, 36, 9, '.').fill(14, 5, 29, 9, '_');
  b.blocks(3, 2, 36, 2, { ch: 'P', bw: 1, bh: 1, gx: 3, gy: 0 });
  b.blocks(4, 7, 36, 7, { ch: 'K', bw: 2, bh: 1, gx: 7, gy: 0, seed: 41 });
  b.fill(2, 4, 8, 6, 'S').fill(31, 4, 36, 6, 'S');
  // K5 Ikate: the sports court, the club frontage and the arts-market sheds in rows
  b.fill(37, 2, 54, 5, 'C');
  b.fill(41, 7, 49, 13, '_');
  b.blocks(37, 14, 54, 17, { ch: 'A', bw: 5, bh: 1, gx: 1, gy: 1, seed: 43 });
  b.blocks(37, 7, 40, 13, { ch: 'A', bw: 3, bh: 1, gx: 0, gy: 2, seed: 47 });
  // K2 Admiralty Commerce: glass-and-plaster blocks, cafes, the construction site behind its hoarding
  b.blocks(2, 10, 19, 17, {
    ch: (i, j) => ((i + j) % 3 === 0 ? 'G' : 'B'),
    bw: 4,
    bh: 3,
    gx: 2,
    gy: 2,
    stagger: 2,
    seed: 51,
    jw: 1,
    drop: 0.12,
  });
  b.fill(2, 21, 19, 21, 'H');
  for (const x of [8, 9, 14, 15]) b.fill(x, 21, x, 21, '.');
  b.fill(20, 17, 23, 21, '=');
  // K6 coastal access: stalls, a car park (kept clear), a few beach-side kiosks
  b.fill(4, 23, 17, 28, '_');
  b.blocks(2, 22, 19, 22, { ch: 'M', bw: 2, bh: 1, gx: 2, gy: 0, seed: 53 });
  b.blocks(3, 28, 18, 29, { ch: 'K', bw: 2, bh: 1, gx: 5, gy: 0, seed: 55 });
  // K3 estates: walled compounds with villas, quiet lanes between
  b.blocks(24, 10, 36, 17, {
    ch: (i, j) => ((i + j) % 2 === 0 ? 'V' : 'R'),
    bw: 4,
    bh: 3,
    gx: 2,
    gy: 2,
    stagger: 2,
    seed: 57,
    jw: 1,
    drop: 0.1,
  });
  b.blocks(24, 21, 54, 29, {
    ch: (i, j) => ((i * 2 + j) % 3 === 0 ? 'V' : 'R'),
    bw: 5,
    bh: 3,
    gx: 2,
    gy: 2,
    stagger: 3,
    seed: 59,
    jw: 1,
    drop: 0.1,
  });
  // K1 the gateway: roadside commerce and the fuel canopy on the south pavement, shops on the north pavement
  b.fill(2, 35, 14, 36, 'S').fill(24, 35, 32, 36, 'F').fill(40, 35, 54, 36, 'S');
  for (const x of [15, 16, 17, 33, 34, 35]) b.fill(x, 35, x, 36, '.');
  b.fill(24, 31, 27, 31, '=');
  // the lane clearings between the estate compounds and Admiralty Way
  b.fill(24, 21, 25, 29, '.');
  b.fill(34, 10, 35, 17, '.');
  return b;
}

const base = paint();
const open = base.layout(LEKKI_LEGEND);
const taken = new Set<string>();
const near = (x: number, y: number): [number, number] => {
  const t = nearestOpen(open, x, y, taken);
  taken.add(`${t[0]},${t[1]}`);
  return t;
};
const SUPPLIES = [
  [6, 8],
  [18, 6],
  [26, 4],
  [33, 8],
  [44, 9],
  [52, 12],
  [8, 13],
  [16, 16],
  [8, 25],
  [16, 27],
  [30, 14],
  [33, 24],
  [44, 25],
  [52, 28],
  [12, 35],
  [46, 35],
].map(([x, y]) => near(x!, y!));
const BARRIERS = [
  [20, 8],
  [36, 6],
  [19, 14],
  [50, 20],
].map(([x, y]) => near(x!, y!));
const ZONE_TAKEN = new Set<string>(taken);
const ZONES = [
  [6, 19],
  [12, 20],
  [16, 19],
].map(([x, y]) => {
  const z = zoneNear(open, x!, y!, ZONE_TAKEN);
  for (const [a, b] of z) ZONE_TAKEN.add(`${a},${b}`);
  return z;
});
const TRAPS = [
  [5, 8],
  [24, 5],
  [34, 7],
  [44, 8],
  [48, 16],
  [6, 14],
  [16, 13],
  [10, 25],
  [30, 14],
  [40, 26],
  [14, 35],
  [48, 35],
].map(([x, y]) => {
  const t = nearestOpen(open, x!, y!, ZONE_TAKEN);
  ZONE_TAKEN.add(`${t[0]},${t[1]}`);
  return [t[0], t[1], (t[0] + t[1]) % 2 === 0 ? 'o' : '~'] as const;
});

const EXPRESSWAY: [number, number][][] = [
  line([W - 1, 30], [0, 30]),
  line([W - 1, 31], [0, 31]),
  line([0, 33], [W - 1, 33]),
  line([0, 34], [W - 1, 34]),
];
const FREEDOM: [number, number][][] = [line([W - 1, 18], [0, 18]), line([0, 20], [W - 1, 20])];
/** The lagoon edge: a mild wash slides everyone on the marked promenade tiles one tile south (never lethal). */
const WASH = [
  {
    tiles: [
      [6, 3],
      [7, 3],
      [8, 3],
    ] as [number, number][],
    dir: 'down' as const,
  },
  {
    tiles: [
      [18, 3],
      [19, 3],
      [20, 3],
    ] as [number, number][],
    dir: 'down' as const,
  },
  {
    tiles: [
      [30, 3],
      [31, 3],
      [32, 3],
    ] as [number, number][],
    dir: 'down' as const,
  },
];

const DISTRICTS: DistrictDef[] = [
  { id: 'promenade', name: 'Lagoon-Side Promenade', role: 'plaza', rects: [[2, 2, 36, 9]] },
  { id: 'ikate', name: 'Ikate Recreation Edge', role: 'plaza', rects: [[37, 2, 54, 17]] },
  { id: 'admiralty', name: 'Admiralty Commerce', role: 'street', rects: [[2, 10, 19, 21]] },
  { id: 'coastal', name: 'Coastal Access Roads', role: 'lane', rects: [[2, 22, 19, 29]] },
  {
    id: 'estates',
    name: 'Freedom Way Estates',
    role: 'street',
    rects: [
      [24, 10, 36, 17],
      [24, 21, 54, 29],
    ],
  },
  { id: 'gateway', name: 'Expressway Gateway', role: 'approach', rects: [[0, 30, 54, 36]] },
];
const LINKS: DistrictLink[] = [
  { from: 'promenade', to: 'ikate', kind: 'open', tiles: crossings(open, 36, 2, 36, 9, 1, 0) },
  { from: 'promenade', to: 'admiralty', kind: 'open', tiles: crossings(open, 2, 9, 19, 9, 0, 1) },
  { from: 'promenade', to: 'estates', kind: 'open', tiles: crossings(open, 24, 9, 36, 9, 0, 1) },
  { from: 'admiralty', to: 'coastal', kind: 'open', tiles: crossings(open, 2, 21, 19, 21, 0, 1) },
  { from: 'estates', to: 'ikate', kind: 'open', tiles: crossings(open, 36, 10, 36, 17, 1, 0) },
  { from: 'admiralty', to: 'estates', kind: 'open', tiles: crossings(open, 19, 10, 19, 17, 1, 0) },
  { from: 'coastal', to: 'gateway', kind: 'open', tiles: crossings(open, 2, 29, 19, 29, 0, 1) },
  { from: 'estates', to: 'gateway', kind: 'open', tiles: crossings(open, 24, 29, 54, 29, 0, 1) },
  { from: 'coastal', to: 'estates', kind: 'open', tiles: crossings(open, 19, 22, 19, 29, 1, 0) },
];

export const LEKKI_BOARD = base;
export const RUMBLE_LEKKI: ArenaDef = communityArena({
  id: 'rumbleLekki',
  name: 'Lekki',
  board: base,
  legend: LEKKI_LEGEND,
  supplies: SUPPLIES,
  barriers: BARRIERS,
  core: { w: 11, h: 9, x0: 18, y0: 15 },
  softDensity: 0.4,
  lanes: [
    [0, 30, 'right'],
    [0, 31, 'right'],
    [0, 32, 'right'],
    [0, 33, 'right'],
    [0, 34, 'right'],
    [W - 1, 30, 'left'],
    [W - 1, 31, 'left'],
    [W - 1, 32, 'left'],
    [W - 1, 33, 'left'],
    [W - 1, 34, 'left'],
  ],
  traps: TRAPS,
  hazards: [
    {
      kind: 'sweep',
      style: 'traffic',
      routes: EXPRESSWAY,
      stepTicks: 4,
      firstAtSec: 9,
      everySec: [6, 9],
      warnSec: 2,
    },
    {
      kind: 'sweep',
      style: 'traffic',
      routes: FREEDOM,
      stepTicks: 5,
      firstAtSec: 15,
      everySec: [9, 13],
      warnSec: 2,
    },
    {
      kind: 'strike',
      style: 'debris',
      zones: ZONES,
      activeSec: 0.4,
      firstAtSec: 17,
      everySec: [8, 12],
      warnSec: 1.8,
    },
    { kind: 'drop', style: 'merch', count: 3, firstAtSec: 12, everySec: [11, 16], warnSec: 1.5 },
    { kind: 'push', style: 'wash', zones: WASH, firstAtSec: 20, everySec: [10, 15], warnSec: 2 },
  ],
  info: {
    tagline:
      'Lekki Phase 1 and Ikate: Admiralty Way, Freedom Way estates, the lagoon promenade and the arts-market sheds.',
    lighting: 'Clear coastal afternoon, the Link Bridge on the horizon',
    hazards: [
      'Cars and buses race the expressway and Freedom Way (2 s warning on the lane).',
      'Construction debris drops at the marked site gates (1.8 s warning).',
      'Lagoon water washes the promenade edge and slides you one tile south (never lethal; the dry paving is always open).',
      'Vendors drop goods into the lanes - new crates block your route.',
      'From 2:00 left the outer districts fill with concrete; Admiralty Way and Freedom Way never close at their crossing.',
    ],
  },
  districts: DISTRICTS,
  links: LINKS,
  start: { x: 5, y: 26 },
  area: 'Lekki / Ikate',
  boss: BOSS_BRIEF('Lekki / Ikate', 'contemporary culture or development'),
});
