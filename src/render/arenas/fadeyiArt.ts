/**
 * City Rumble - FADEYI (presentation only; the board and hazards are `src/sim/arenas/rumbleFadeyi.ts`), built from
 * the Bible's Fadeyi section and the reference pack: a divided Ikorodu Road, blue BRT buses in a dedicated lane
 * between two concrete median barriers, yellow Danfos queued at the stop, commuters waiting along the pavement,
 * a three-storey white-and-beige bank-style frontage with blue windows beside older plastered blocks, overhead wires,
 * and a (fictional, functional) footbridge over the highway beyond the east edge. Every name on a board is FICTIONAL.
 */
import type { ArenaLook } from '../arenaLook';
import { timeOfDay } from '../timeOfDay';
import { box, cyl, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import { T } from './floorKit';
import type { FloorDrawer } from './floorKit';
import type { CoverFactory } from './boardCover';
import { communityCover } from './community/factory';
import { building, house, kiosk, lockup, shop, stall, wall, workshop } from './community/families';
import type { Family, Theme } from './community/kit';
import { board, box as cbox, cyl as ccyl } from './community/kit';
import { communityFloor } from './community/floor';
import { communityEnv } from './community/env';
import { nightLookOf } from './community/looks';
import { edgeStalls, streetLife, lampPost, lettered, plaque, skyline } from './community/setKit';
import { sign, signTexture } from './oshodiKit';
import { streetPlane } from './oshodiKit';
import { shophouseRows } from './shared';
import { layoutOf, mouthTraffic, tileWorld, floorWords, zebraTile } from './rumbleV2Kit';
import { FADEYI_CROSSINGS, FADEYI_ROWS } from '../../sim/arenas/rumbleFadeyi';
import type { StageEnvironment } from '../env/types';

const ID = 'rumbleFadeyi';
const cream = '#efe6d0';
const BRT_BLUE = 0x2a7fb8;

const THEME: Theme = {
  plaster: [0xc4bfb0, 0xb8b4a6, 0xd2cab4, 0xa8b0a8, 0xc8b8a0, 0xb4a89a, 0x9aa4ac],
  far: [0xb8b4a6, 0x9aa4ac, 0xc8b8a0, 0xd0cab8, 0x8a96a0, 0xb0a090],
  tarps: [0x2a6aa8, 0xe0b020, 0xc83a2a, 0xd8d0b8, 0x2f8a4a],
  roofs: [0x8a8e90, 0x9a6a4a, 0x7a8a8e, 0xa05a3a],
  accent: [0x2a6aa8, 0xc8a02a, 0x3a7a46, 0x9a2e22, 0xd8d0bc],
  shops: [
    { bg: '#1f5a8a', fg: cream, lines: [['AMOKE PHARMACY & STORES', 26]], border: cream },
    { bg: '#e0b020', fg: '#1c1608', lines: [['FADEYI PROVISIONS', 30]] },
    { bg: '#2f6e3c', fg: '#f4f0e0', lines: [['TAIWO PRINTING & COPY', 26]] },
    { bg: '#a8241c', fg: cream, lines: [['SHOLA GLASS & ALUMINIUM', 26]], border: cream },
    { bg: cream, fg: '#8a1e18', lines: [['MAMA TOPE FOODS', 32]], border: '#8a1e18' },
    { bg: '#16140f', fg: '#e8e0c8', lines: [['KEHINDE PHONES & ACCESSORIES', 22]] },
  ],
  small: [
    { bg: '#2f6e3c', fg: cream, lines: [['PURE WATER', 24]] },
    { bg: '#e0b020', fg: '#1c1608', lines: [['RECHARGE', 26]] },
    { bg: '#1f5a8a', fg: cream, lines: [['SNACKS', 28]] },
  ],
  seed: 311,
};

/** A BRT stop shelter on the median: a long blue-roofed canopy on steel posts, benches, a route board. */
const brtShelter: Family = (k, g, r, n) => {
  const x0 = k.wx(r.x) - 0.5;
  const len = r.w;
  cbox(k, g, k.metal, len, 0.1, 1.0, r.cx, 2.4, r.cz, BRT_BLUE, 0, 0, 0);
  cbox(k, g, k.paint, len, 0.24, 1.04, r.cx, 2.16, r.cz, 0xe8e4d8);
  for (let i = 0; i <= len; i += 2) ccyl(k, g, k.metal, 0.05, 0.05, 2.4, x0 + i, 0, r.cz - 0.32, 0x4a4e52, 6);
  cbox(k, g, k.glow, len - 0.3, 0.9, 0.04, r.cx, 1.0, r.cz - 0.42, 0xd8ecf4);
  cbox(k, g, k.paint, len - 0.6, 0.08, 0.4, r.cx, 0.45, r.cz - 0.1, 0x6e5440);
  board(
    k,
    g,
    k.atlas.board('brt', 256, 40, {
      bg: '#2a7fb8',
      fg: '#ffffff',
      lines: [['BRT  •  FADEYI', 26]],
      border: '#ffffff',
    }),
    Math.min(2.6, len - 0.3),
    0.36,
    r.cx,
    2.0,
    r.cz + 0.5,
  );
  void n;
};

/** Concrete median barrier: a jersey profile with a blue band, a guard rail on top of the long runs. */
const median: Family = (k, g, r) => {
  cbox(k, g, k.concrete, r.w - 0.04, 0.5, 0.7, r.cx, 0, r.cz, 0xb6b2a8);
  cbox(k, g, k.concrete, r.w - 0.04, 0.5, 0.36, r.cx, 0.5, r.cz, 0xa8a49a);
  cbox(k, g, k.paint, r.w - 0.04, 0.1, 0.74, r.cx, 0.62, r.cz, BRT_BLUE);
  for (let x = r.x; x < r.x + r.w; x += 2)
    ccyl(k, g, k.metal, 0.025, 0.025, 0.55, k.wx(x), 1.0, r.cz, 0x6a6e72, 5);
};

/** The three-storey bank-style frontage: white plastered block, rows of blue-framed windows, a railing and a forecourt. */
const bankBlock: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 6.4;
  cbox(k, g, k.concrete, r.w - 0.1, H, r.h - 0.1, r.cx, 0, r.cz, 0xe8e4d6);
  cbox(k, g, k.concrete, r.w + 0.1, 0.3, r.h + 0.1, r.cx, H, r.cz, 0x9a968a);
  for (let f = 0; f < 3; f++)
    for (let x = r.x; x < r.x + r.w; x += 2) {
      cbox(k, g, k.paint, 1.3, 0.9, 0.05, k.wx(x) + 0.5, 1.0 + f * 1.9, zf, 0x3a6a9a);
      cbox(k, g, k.glow, 1.1, 0.7, 0.05, k.wx(x) + 0.5, 1.1 + f * 1.9, zf + 0.02, 0x9cc4e0);
    }
  cbox(k, g, k.metal, r.w, 0.4, 0.04, r.cx, 0.35, zf + 0.5, 0x3a3e42);
  board(
    k,
    g,
    k.atlas.board('bankfront', 256, 48, {
      bg: '#e8e4d6',
      fg: '#16457a',
      lines: [['LAGOON TRUST FINANCE', 26]],
      border: '#16457a',
    }),
    Math.min(4, r.w - 0.5),
    0.5,
    r.cx,
    H - 0.6,
    zf + 0.04,
  );
  void n;
};

const FAMILIES: Record<string, Family> = {
  building,
  shop,
  lockup,
  stall,
  kiosk,
  wall,
  house,
  workshop,
  brtShelter,
  median,
  bankBlock,
};
const REACH: Record<string, number> = {
  building: 3,
  shop: 3,
  lockup: 1,
  stall: 1,
  kiosk: 2,
  wall: 2,
  house: 2,
  workshop: 2,
  brtShelter: 2,
  median: 1,
  bankBlock: 3,
};
export const RUMBLE_FADEYI_COVER: CoverFactory = communityCover({
  arenaId: ID,
  theme: THEME,
  families: FAMILIES,
  reach: REACH,
});

export const RUMBLE_FADEYI_LOOK: ArenaLook = {
  // flat grey-white midday over a busy divided highway: exhaust haze, hard shade only under the awnings
  sky: 0xaeb4b8,
  fog: { color: 0xa4aaac, near: 34, far: 118 },
  sun: { color: 0xfff0dc, intensity: 4.0, position: [-7, 22, 12] },
  hemi: { sky: 0xdce2e8, ground: 0x6a665e, intensity: 1.42 },
  envIntensity: 0.55,
  exposure: 1.1,
  floorTint: 0xc4beb2,
  pillarTint: 0xdad6ce,
  softTint: 0xcac4b8,
  slab: 0x6a6862,
  street: 0x3a3c3e,
  grit: { tone: 0x6a6860, dirt: 0x4a463e, dust: 0x8a867c },
  lamps: [
    [-21.4, 2.4, -2, 0xffd9a0],
    [21.4, 2.4, 2, 0xffd9a0],
  ],
};
export const RUMBLE_FADEYI_NIGHT_LOOK: ArenaLook = nightLookOf(RUMBLE_FADEYI_LOOK, [
  [-21.4, 2.6, -4, 0xffd9a0],
  [21.4, 2.6, 4, 0xffd9a0],
  [-10, 2.6, -14, 0xffc880],
  [10, 2.6, -14, 0xffc880],
  [-10, 2.6, 14, 0xffc880],
  [10, 2.6, 14, 0xffc880],
]);

export const RUMBLE_FADEYI_FLOOR: FloorDrawer = communityFloor(ID, {
  seed: 3111,
  base: [158, 154, 146],
  dust: 'rgba(120,112,100,',
  road: [64, 64, 66],
  pavers: [168, 164, 154],
  tint: {
    shopfronts: 'rgba(110,100,86,0.10)',
    neighbourhood: 'rgba(120,130,110,0.10)',
    recreation: 'rgba(90,120,90,0.10)',
    onipanu: 'rgba(110,100,90,0.12)',
  },
  extra: (g, _rg, layout) => {
    const cols = layout[0]!.length;
    const R = FADEYI_ROWS;
    // the BRT lanes: blue paint with the white BRT word, the median crossings: zebra bars and a refuge slab
    g.fillStyle = 'rgba(42,127,184,0.55)';
    g.fillRect(0, R.brt[0] * T, cols * T, 2 * T);
    for (const x of [6, 20, 34, 44])
      floorWords(g, 'BRT', x + 0.5, R.brt[0] + 1, 0.8, 'rgba(240,244,250,0.7)');
    for (const gx of FADEYI_CROSSINGS)
      for (const x of [gx, gx + 1])
        for (const y of [...R.west, ...R.brt, ...R.east]) zebraTile(g, x, y, false, 0.55);
    for (const gx of FADEYI_CROSSINGS) {
      g.fillStyle = 'rgba(190,186,176,0.8)';
      for (const y of [R.medianA, R.medianB]) g.fillRect(gx * T, y * T, 2 * T, T);
    }
    floorWords(g, 'BUS STOP', 23.5, R.east[2] - 0.5, 0.5, 'rgba(240,226,160,0.5)');
  },
});

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const tod = timeOfDay();
  const { wz } = tileWorld(W, H);
  const north = -H / 2;
  const hwGap = (c: number): boolean => c > wz(FADEYI_ROWS.top) - 1 && c < wz(FADEYI_ROWS.bottom) + 1;
  // the highway runs on beyond both edges: asphalt, edge lines, lane dashes, blue BRT lanes, median barriers
  for (const side of [-1, 1])
    streetPlane(
      ctx,
      `cr:fadeyi:hw${side}`,
      { x: side * (W / 2 + 26), z: wz(16), w: 52, d: 9.4, ppm: 14 },
      (g, px, s) => {
        g.fillStyle = '#3c3e40';
        g.fillRect(0, 0, 9999, 9999);
        const [, z0] = px(0, wz(10) - 0.5);
        const row = (y: number): number => z0 + (y - 10) * s;
        g.fillStyle = 'rgba(42,127,184,0.7)';
        g.fillRect(0, row(FADEYI_ROWS.brt[0]), 9999, 2 * s);
        g.fillStyle = 'rgba(232,224,196,0.7)';
        for (const y of [...FADEYI_ROWS.west, ...FADEYI_ROWS.brt, ...FADEYI_ROWS.east])
          for (let x = 0; x < 9999; x += s * 2) g.fillRect(x, row(y) + s * 0.96, s * 0.9, 3);
        g.fillStyle = '#b6b2a8';
        for (const y of [FADEYI_ROWS.medianA, FADEYI_ROWS.medianB])
          g.fillRect(0, row(y) + s * 0.15, 9999, s * 0.7);
      },
    );
  shophouseRows(ctx, { north: true, east: false, west: false, seed: 11, close: 0.5, scale: 1.2 });
  skyline(ctx, tod, {
    edge: 'north',
    off: 11,
    depth: 7,
    hMin: 6,
    hMax: 12,
    tints: ['#8a8a82', '#6a7a82', '#9a8a70', '#7a7a7a'],
    seed: 11,
  });
  skyline(ctx, tod, {
    edge: 'east',
    off: 5,
    depth: 6,
    hMin: 4.5,
    hMax: 8,
    tints: ['#8a8a82', '#9a8a70'],
    gap: hwGap,
    seed: 13,
    step: 5.6,
  });
  skyline(ctx, tod, {
    edge: 'west',
    off: 5,
    depth: 6,
    hMin: 4.5,
    hMax: 8,
    tints: ['#7a7a7a', '#9a8a70'],
    gap: hwGap,
    seed: 17,
    step: 5.6,
  });

  // the footbridge (fictional, functional): a steel-railed deck over the highway on two concrete piers, stairs at both ends
  const fx = W / 2 + 11;
  const zn = wz(FADEYI_ROWS.top - 1.2);
  const zs = wz(FADEYI_ROWS.bottom + 1.2);
  const conc = mat(0xb6b2a8, { roughness: 1, flat: false });
  const steel = mat(0x4a5258, { roughness: 0.5, metalness: 0.6 });
  ctx.statics.add(box(2.4, 0.4, zs - zn, conc, fx, 5.1, (zn + zs) / 2));
  for (const z of [zn, zs]) {
    ctx.statics.add(box(2.0, 5.2, 1.6, conc, fx, STREET + 2.6, z + (z === zn ? -0.4 : 0.4)));
    for (let i = 0; i < 6; i++)
      ctx.statics.add(
        box(
          2.0,
          0.12,
          0.5,
          conc,
          fx,
          STREET + 0.5 + i * 0.9,
          z + (z === zn ? -1.4 - i * 0.5 : 1.4 + i * 0.5),
        ),
      );
  }
  for (const dx of [-1.15, 1.15]) {
    ctx.statics.add(box(0.08, 0.9, zs - zn, steel, fx + dx, 5.8, (zn + zs) / 2));
    ctx.statics.add(box(0.1, 0.1, zs - zn, steel, fx + dx, 6.3, (zn + zs) / 2));
  }
  ctx.statics.add(box(3.4, 1.2, 0.2, mat(0x2a7fb8, { roughness: 0.6 }), fx, 6.5, zs - 3)); // the BRT sign gantry panel
  plaque(
    ctx,
    'cr:fadeyi:gantry',
    3.2,
    0.9,
    fx,
    6.5,
    zs - 2.88,
    0,
    lettered('BRT ONLY  •  ONIPANU', '#2a7fb8', '#ffffff'),
  );

  // wires, lamps, a billboard
  for (const x of [-W / 2 - 6, W / 2 + 6, -W / 2 - 18, W / 2 + 18])
    lampPost(ctx, x, wz(FADEYI_ROWS.top - 0.7), 0, 0xffd9a0);
  const board0 = signTexture(
    'fad:bb',
    512,
    128,
    {
      bg: '#e0b020',
      fg: '#1c1608',
      lines: [['FADEYI  •  ONIPANU  •  IKORODU', 38]],
      border: '#1c1608',
      wear: 1.1,
    },
    81,
  );
  sign(ctx, board0, -8, 5.8, north - 6, 8, 2, 0, { posts: 2 });
  mouthTraffic(ctx, layoutOf(ID), { kinds: ['danfo', 'taxi', 'danfo', 'keke'], depth: 3 });
  const streetGap = (z: number): boolean => z > wz(FADEYI_ROWS.top) - 1.5 && z < wz(FADEYI_ROWS.bottom) + 1.5;
  edgeStalls(ctx, {
    north: true,
    east: true,
    west: true,
    goods: ['provisions', 'basins', 'cloth'],
    gap: streetGap,
    seed: 3,
  });
  streetLife(ctx, { n: 14, gap: streetGap });
  ctx.ambient.exhaust(W / 2 + 6, 0.4, wz(18), 0, 1);
  ctx.ambient.dust(0, north - 1.4, 18, 1);
  void cyl;
}

export const RUMBLE_FADEYI_SET: ArenaSet = {
  build,
  crowd: 0.25,
  crowdEdges: { north: false, east: false, west: false, south: false },
};

export function fadeyiEnv(board: { cols: number; rows: number }): StageEnvironment {
  const { cols, rows } = board;
  return communityEnv(ID, board, {
    seed: 0x0311,
    kinds: ['bus', 'danfo', 'danfo', 'car', 'bus'],
    count: 4,
    speed: 4.2,
    crowds: [
      { id: 'queueWest', rect: { x0: -6, y0: 8, x1: -2, y1: 11.5 }, count: 9, mood: 'waiting', priority: 2 },
      {
        id: 'queueEast',
        rect: { x0: cols + 2, y0: 21.5, x1: cols + 6, y1: rows - 2.5 },
        count: 7,
        mood: 'waiting',
        priority: 2,
      },
      {
        id: 'tradersNorth',
        rect: { x0: cols * 0.5, y0: -4, x1: cols * 0.8, y1: -1.8 },
        count: 6,
        mood: 'trading',
        facing: 0,
      },
    ],
    lights: [
      { at: [-3, 10], height: 2.8, color: 0xffd9a0, size: 1.0, strength: 0.55, flicker: 'sodium', pool: 2.4 },
      {
        at: [cols + 3, 20],
        height: 2.8,
        color: 0xffd9a0,
        size: 1.0,
        strength: 0.55,
        flicker: 'sodium',
        pool: 2.4,
      },
    ],
    beds: ['buspark_loop', 'crowd_loop'],
  });
}
