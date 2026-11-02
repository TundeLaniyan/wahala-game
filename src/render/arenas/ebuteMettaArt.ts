/**
 * City Rumble - EBUTE-METTA (presentation only; the board and hazards are `src/sim/arenas/rumbleEbuteMetta.ts`),
 * built from the Bible's Ebute-Metta section and the reference pack: the colonial terminus with its deep veranda on
 * white columns, green-teal trim and wooden signboard; the weatherboard heritage house (white boards with a glazing
 * strip, ochre columns, a hipped grey roof and a water tank); the modern station with its sweeping cantilever canopy
 * and glass-and-steel facade over a wide paved forecourt; ballasted track lanes between rail-bridge portals, freight
 * wagons and a signal cabin in the yard; the tan, red-balustraded Oyingbo market arcade; plastered mainland houses;
 * and the Oko-Baba foreshore with timber stacks and utilities. Beyond the board: the lagoon, a bridge on the far
 * horizon and the rail viaduct. Every name on a board is FICTIONAL; place and plain station wording only.
 */
import type { ArenaLook } from '../arenaLook';
import { timeOfDay } from '../timeOfDay';
import { box, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import type { FloorDrawer } from './floorKit';
import { T } from './floorKit';
import type { CoverFactory } from './boardCover';
import { communityCover } from './community/factory';
import { building, house, kiosk, lockup, shelter, shop, stall } from './community/families';
import type { Family, Theme } from './community/kit';
import { board, box as cbox, cyl as ccyl, pick } from './community/kit';
import { communityFloor } from './community/floor';
import { communityEnv } from './community/env';
import { nightLookOf } from './community/looks';
import { lampPost, lettered, plaque, railcars, skyline, viaduct } from './community/setKit';
import { streetPlane, umbrella as setUmbrella } from './oshodiKit';
import { shophouseRows } from './shared';
import { layoutOf, mouthTraffic, tileWorld } from './rumbleV2Kit';
import type { StageEnvironment } from '../env/types';

const ID = 'rumbleEbuteMetta';
const cream = '#efe6d0';

const THEME: Theme = {
  plaster: [0xc8b48e, 0xd2c6a6, 0xb88a64, 0xcfa88a, 0x9fb0a6, 0xc8c0a8, 0xb4a090],
  far: [0xb5654a, 0xd2c6a6, 0x9a4a32, 0xc89a78, 0x7a8aa0, 0xc8c0a8],
  tarps: [0xc83a2a, 0xe0b020, 0x2a6aa8, 0x2f8a4a, 0xe07a20, 0x7a3a8a],
  roofs: [0x9a4a32, 0x8a4a30, 0x7a8a8e, 0xa05a3a],
  accent: [0x2a6a74, 0x7a1e1e, 0x2e5a34, 0xc8a02a, 0x2e5a8e],
  shops: [
    { bg: '#7a1e1e', fg: '#f2e6c8', lines: [['OYINGBO TRADERS HALL', 26]], border: '#f2e6c8' },
    { bg: '#2e5a34', fg: '#f6e9c6', lines: [['IYA ABEKE PROVISIONS', 24]], border: '#f6e9c6' },
    { bg: '#e0b020', fg: '#1c1608', lines: [['RAILWAY SQUARE TAILORS', 22]] },
    { bg: '#1f5a8a', fg: cream, lines: [['MURTALA WAY HARDWARE', 24]], border: cream },
    { bg: '#16140f', fg: '#e8e0c8', lines: [['EBUTE BATTERIES & CABLES', 22]] },
  ],
  small: [
    { bg: '#2f6e3c', fg: cream, lines: [['PURE WATER', 24]] },
    { bg: '#e0b020', fg: '#1c1608', lines: [['TICKETS & RECHARGE', 18]] },
    { bg: '#a8241c', fg: cream, lines: [['SUYA', 34]] },
  ],
  seed: 341,
};

/** The colonial terminus: a long cream block with a deep veranda on white columns, teal trim, a hipped roof and a board. */
const terminus: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 4.2;
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.1,
    H,
    r.h - 0.3,
    r.cx,
    0,
    r.cz - 0.2,
    pick([0xe4dcc0, 0xdcd4b8, 0xe8e0c8], r.v + n),
  );
  cbox(k, g, k.paint, r.w, 0.2, r.h, r.cx, H - 0.6, r.cz, 0x2a6a64);
  for (const sgn of [-1, 1])
    cbox(
      k,
      g,
      k.paint,
      r.w + 0.4,
      0.07,
      (r.h + 0.6) / 2,
      r.cx,
      H + 0.2,
      r.cz + (sgn * (r.h + 0.6)) / 4,
      0x8a4a30,
      0,
      0,
      -sgn * 0.26,
    );
  cbox(k, g, k.concrete, r.w, 0.2, 1.1, r.cx, 2.5, zf + 0.5, 0xf4f0e0); // veranda roof
  for (let x = r.x; x <= r.x + r.w; x += 2) {
    ccyl(k, g, k.concrete, 0.14, 0.14, 2.5, k.wx(Math.min(x, r.x + r.w - 1)) - 0.5, 0, zf + 0.9, 0xf8f4e8, 8);
    ccyl(k, g, k.paint, 0.18, 0.18, 0.5, k.wx(Math.min(x, r.x + r.w - 1)) - 0.5, 0, zf + 0.9, 0x2a6a64, 8);
  }
  for (let x = r.x; x < r.x + r.w; x++) cbox(k, g, k.paint, 0.6, 1.5, 0.05, k.wx(x), 0.1, zf, 0x4a3a2a);
  board(
    k,
    g,
    k.atlas.board(`term${(r.v + n) % 2}`, 256, 40, {
      bg: '#e8e0c8',
      fg: '#16604a',
      lines: [[['EBUTE-METTA JUNCTION', 'EBUTE-METTA  •  LAGOS DISTRICT'][(r.v + n) % 2]!, 22]],
      border: '#16604a',
    }),
    Math.min(5, r.w - 0.5),
    0.55,
    r.cx,
    3.1,
    zf + 1.06,
  );
};

/** The weatherboard heritage house: white boards, a glazing strip, ochre columns, a hipped grey roof and a water tank. */
const heritageHouse: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 3.4;
  cbox(k, g, k.concrete, r.w - 0.2, H, r.h - 0.2, r.cx, 0, r.cz, 0xf0ece0);
  for (let y = 0.4; y < H; y += 0.28)
    cbox(k, g, k.paint, r.w - 0.18, 0.025, 0.02, r.cx, y, zf - 0.1, 0xd8d4c4);
  cbox(k, g, k.glow, r.w - 0.8, 0.5, 0.05, r.cx, 2.2, zf - 0.08, 0xa8c4cc);
  for (const sgn of [-1, 1])
    cbox(
      k,
      g,
      k.paint,
      r.w + 0.4,
      0.07,
      (r.h + 0.5) / 2,
      r.cx,
      H + 0.3,
      r.cz + (sgn * (r.h + 0.5)) / 4,
      0x6a6e72,
      0,
      0,
      -sgn * 0.3,
    );
  for (let x = r.x; x < r.x + r.w; x += 2)
    ccyl(k, g, k.paint, 0.14, 0.14, 2.3, k.wx(x), 0, zf + 0.3, 0xb88a2a, 8);
  cbox(k, g, k.paint, r.w - 1.4, 0.1, 0.9, r.cx, 2.4, zf + 0.35, 0xe8e0c8);
  ccyl(k, g, k.paint, 0.35, 0.35, 0.8, r.cx + r.w / 2 - 0.9, H + 0.8, r.cz - 0.4, 0x1a1a1c, 10);
  void n;
};

/** The modern station hall: a glass-and-steel multi-storey front and a long sweeping cantilever roof over the forecourt. */
const stationHall: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 5.4;
  cbox(k, g, k.concrete, r.w - 0.2, H, r.h - 0.2, r.cx, 0, r.cz, 0xcfd6d8);
  for (let f = 0; f < 4; f++) cbox(k, g, k.glow, r.w - 0.6, 0.7, 0.05, r.cx, 0.7 + f * 1.15, zf, 0x7ab0cc);
  // the canopy: two long slabs sweeping over the front, thin white edges
  cbox(k, g, k.paint, r.w + 0.6, 0.22, r.h * 0.5 + 1.2, r.cx, H, r.cz + r.h * 0.2, 0xe8eceb, 0, -0.16, 0);
  cbox(
    k,
    g,
    k.paint,
    r.w + 0.6,
    0.14,
    r.h * 0.5 + 0.6,
    r.cx,
    H + 0.55,
    r.cz - r.h * 0.1,
    0xd8dcda,
    0,
    -0.1,
    0,
  );
  for (let x = r.x; x < r.x + r.w; x += 2)
    ccyl(k, g, k.paint, 0.1, 0.1, H, k.wx(x) + 0.5, 0, zf + 0.7, 0xd0d4d6, 6);
  board(
    k,
    g,
    k.atlas.board('stn', 256, 40, {
      bg: '#1d6a40',
      fg: '#f6f2e4',
      lines: [['EBUTE-METTA STATION', 24]],
      border: '#f6f2e4',
    }),
    Math.min(4, r.w - 0.4),
    0.5,
    r.cx,
    H - 0.5,
    zf + 0.08,
  );
  void n;
};

/** A rail-bridge portal: a concrete abutment with an arched mouth facing the tracks and a danger board. */
const portal: Family = (k, g, r) => {
  const north = r.y < 16; // the north portal faces south, the south portal faces north
  cbox(k, g, k.concrete, r.w - 0.04, 3.2, r.h - 0.04, r.cx, 0, r.cz, 0x8a867c);
  const zf = north ? k.wz(r.y1) + 0.5 : k.wz(r.y) - 0.5;
  cbox(k, g, k.paint, r.w - 0.5, 2.2, 0.06, r.cx, 0.05, zf, 0x14181c);
  cbox(k, g, k.paint, r.w - 0.3, 0.3, 0.1, r.cx, 2.3, zf + (north ? 0.03 : -0.03), 0xa8a49a);
  cbox(k, g, k.paint, r.w - 0.7, 0.3, 0.05, r.cx, 3.25, zf + (north ? 0.05 : -0.05), 0xe0b020);
};

/** A platform canopy post with its roof slab over the platform. */
const platformPost: Family = (k, g, r) => {
  ccyl(k, g, k.metal, 0.08, 0.08, 3.0, r.cx, 0, r.cz, 0x4a4e52, 6);
  cbox(k, g, k.paint, 2.4, 0.12, 1.4, r.cx + (r.x < 27 ? 0.6 : -0.6), 3.0, r.cz, 0xd8dcda);
};

/** Freight wagons on a siding: boxcars in rust brown and faded blue on black bogies. */
const wagon: Family = (k, g, r, n) => {
  for (let j = 0; j < r.h; j++)
    for (let i = 0; i < r.w; i += 4) {
      const x = k.wx(r.x + i) + 1.5;
      const z = k.wz(r.y + j);
      cbox(k, g, k.paint, 3.7, 0.3, 0.9, x, 0.2, z, 0x1a1a1c);
      cbox(
        k,
        g,
        k.paint,
        3.6,
        1.6,
        0.95,
        x,
        0.5,
        z,
        pick([0x7a4a30, 0x4a6a86, 0x8a6a3a, 0x5a5a56], i + j + n + r.v),
      );
      cbox(k, g, k.paint, 3.6, 0.1, 0.99, x, 1.4, z, 0x3a3a38);
    }
};

/** The signal cabin: a small brick room with a window band, a pitched roof and relay cabinets. */
const cabin: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  cbox(k, g, k.concrete, r.w - 0.2, 2.4, r.h - 0.2, r.cx, 0, r.cz, 0xa05a3a);
  cbox(k, g, k.glow, r.w - 0.8, 0.5, 0.05, r.cx, 1.4, zf, 0xe6c880);
  cbox(k, g, k.zinc, r.w + 0.2, 0.06, r.h + 0.3, r.cx, 2.4, r.cz, 0x7a8a8e, 0, -0.1);
  void n;
};

/** The Oyingbo market arcade: a tan multi-storey block with arched bays and red balustrades, shop signs below. */
const marketArcade: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 5.6;
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.1,
    H,
    r.h - 0.1,
    r.cx,
    0,
    r.cz,
    pick([0xd8c4a0, 0xe0c8a4, 0xd2bc98], r.v + n),
  );
  for (let f = 0; f < 3; f++) {
    cbox(k, g, k.paint, r.w, 0.35, 0.14, r.cx, 1.0 + f * 1.5, zf + 0.07, 0xb83a2a); // red balustrade
    for (let x = r.x; x < r.x + r.w; x++)
      cbox(k, g, k.paint, 0.5, 0.8, 0.05, k.wx(x), 1.25 + f * 1.5, zf, 0x2a1e18);
  }
  cbox(k, g, k.concrete, r.w + 0.1, 0.3, r.h + 0.1, r.cx, H, r.cz, 0xa89878);
  for (let x = r.x; x < r.x + r.w; x++) cbox(k, g, k.paint, 0.8, 0.9, 0.05, k.wx(x), 0.1, zf, 0x16120e);
  board(
    k,
    g,
    k.atlas.board('oyb', 256, 40, {
      bg: '#7a1e1e',
      fg: '#f2e6c8',
      lines: [['OYINGBO MARKET', 26]],
      border: '#f2e6c8',
    }),
    Math.min(4, r.w - 0.5),
    0.42,
    r.cx,
    2.0,
    zf + 0.1,
  );
};

/** A tree of the garden / boulevard (trunk and a rounded crown). */
const tree: Family = (k, g, r, n) => {
  for (let j = 0; j < r.h; j++)
    for (let i = 0; i < r.w; i++) {
      const x = k.wx(r.x + i);
      const z = k.wz(r.y + j);
      ccyl(k, g, k.paint, 0.12, 0.18, 1.8, x, 0, z, 0x6a4a30, 6);
      for (let t = 0; t < 3; t++)
        ccyl(
          k,
          g,
          k.paint,
          0.5 - t * 0.12,
          0.95 - t * 0.14,
          0.7,
          x,
          1.4 + t * 0.55,
          z,
          pick([0x3a7a3a, 0x4a8a3a, 0x2f6a34], r.v + n + t),
          9,
        );
    }
};

/** Timber stacks on the foreshore (a transition landscape: stacks, planks and cut logs, not a full sawmill). */
const timberStack: Family = (k, g, r, n) => {
  const woods = [0xb98c5a, 0xa77a4a, 0xc99a68, 0x8a6a46];
  for (let j = 0; j < r.h; j++)
    for (let layer = 0; layer < 4; layer++)
      cbox(
        k,
        g,
        k.paint,
        r.w - 0.2,
        0.2,
        0.82,
        r.cx,
        layer * 0.22,
        k.wz(r.y + j),
        pick(woods, layer + j + n + r.v),
      );
  cbox(k, g, k.paint, r.w - 0.3, 0.05, r.h - 0.3, r.cx, 0.95, r.cz, pick(k.theme.tarps, r.v + n), 0, 0, 0.05);
};

/** Utility cabinets and a transformer on a plinth at the water edge. */
const utility: Family = (k, g, r, n) => {
  cbox(k, g, k.concrete, r.w - 0.2, 0.3, r.h - 0.2, r.cx, 0, r.cz, 0x8a867c);
  cbox(
    k,
    g,
    k.paint,
    r.w - 0.6,
    1.5,
    r.h - 0.6,
    r.cx,
    0.3,
    r.cz,
    pick([0x7a8a8e, 0x5a6a66, 0x8a8a72], r.v + n),
  );
  cbox(k, g, k.paint, r.w - 0.5, 0.1, r.h - 0.5, r.cx, 1.8, r.cz, 0x3a3e42);
};

const FAMILIES: Record<string, Family> = {
  building,
  shop,
  lockup,
  kiosk,
  stall,
  house,
  shelter,
  terminus,
  heritageHouse,
  stationHall,
  portal,
  platformPost,
  wagon,
  cabin,
  marketArcade,
  tree,
  timberStack,
  utility,
};
const REACH: Record<string, number> = {
  building: 3,
  shop: 3,
  lockup: 1,
  kiosk: 2,
  stall: 1,
  house: 2,
  shelter: 2,
  terminus: 3,
  heritageHouse: 2,
  stationHall: 3,
  portal: 3,
  platformPost: 2,
  wagon: 2,
  cabin: 2,
  marketArcade: 3,
  tree: 2,
  timberStack: 1,
  utility: 2,
};
export const RUMBLE_EBUTE_METTA_COVER: CoverFactory = communityCover({
  arenaId: ID,
  theme: THEME,
  families: FAMILIES,
  reach: REACH,
});

export const RUMBLE_EBUTE_METTA_LOOK: ArenaLook = {
  // warm hazy afternoon over rail steel, old brick and the lagoon: long shadows, a copper cast in the haze
  sky: 0xb0a48c,
  fog: { color: 0xa89c84, near: 34, far: 118 },
  sun: { color: 0xffd8a8, intensity: 4.4, position: [-9, 21, 12] },
  hemi: { sky: 0xe4d6bc, ground: 0x6a5a48, intensity: 1.4 },
  envIntensity: 0.55,
  exposure: 1.12,
  floorTint: 0xc8b49c,
  pillarTint: 0xdcd0bc,
  softTint: 0xc8b8a0,
  slab: 0x6a5a48,
  street: 0x3a3c3e,
  grit: { tone: 0x7a604a, dirt: 0x543e2e, dust: 0x8a6e54 },
  lamps: [
    [-27.4, 2.4, -6, 0xffb868],
    [27.4, 2.4, 8, 0xffb868],
  ],
};
export const RUMBLE_EBUTE_METTA_NIGHT_LOOK: ArenaLook = nightLookOf(RUMBLE_EBUTE_METTA_LOOK, [
  [-27.4, 2.6, -6, 0xffb868],
  [27.4, 2.6, 8, 0xffb868],
  [-27.4, 2.6, 12, 0xffa850],
  [27.4, 2.6, -12, 0xffa850],
  [-2, 2.6, -19.4, 0xe8f4ff],
  [3, 2.6, -19.4, 0xe8f4ff],
  [0, 2.6, 19.4, 0xffa850],
]);

export const RUMBLE_EBUTE_METTA_FLOOR: FloorDrawer = communityFloor(ID, {
  seed: 3411,
  base: [168, 144, 118],
  dust: 'rgba(150,100,60,',
  road: [60, 58, 56],
  pavers: [172, 156, 136],
  tint: {
    heritage: 'rgba(90,130,80,0.18)',
    station: 'rgba(170,170,160,0.16)',
    oyingbo: 'rgba(150,80,50,0.10)',
    residential: 'rgba(120,100,80,0.12)',
    railYard: 'rgba(60,56,52,0.22)',
    foreshore: 'rgba(110,100,80,0.16)',
  },
  extra: (g, rg, layout) => {
    // ballast, sleepers and shining rails on the two track lanes; the level crossing across the road; platform edge lines
    const ty0 = 10;
    const ty1 = 26;
    g.fillStyle = 'rgba(96,90,84,0.95)';
    g.fillRect(26 * T, ty0 * T, 2 * T, (ty1 - ty0 + 1) * T);
    for (let y = ty0 * 4; y < (ty1 + 1) * 4; y++) {
      g.fillStyle = 'rgba(54,40,30,0.9)';
      g.fillRect(26 * T + 6, (y / 4) * T + 4, 2 * T - 12, 12);
    }
    g.fillStyle = 'rgba(190,194,198,0.95)';
    for (const x of [26.2, 26.8, 27.2, 27.8]) g.fillRect(x * T - 3, ty0 * T, 6, (ty1 - ty0 + 1) * T);
    for (let y = 16; y <= 19; y++)
      for (const x of [26, 27]) {
        g.fillStyle = 'rgba(70,66,62,0.8)';
        g.fillRect(x * T, y * T, T, T);
        g.fillStyle = 'rgba(190,194,198,0.9)';
        for (const rx of [0.2, 0.8]) g.fillRect(x * T + rx * T - 3, y * T, 6, T);
      }
    g.fillStyle = 'rgba(232,206,60,0.8)';
    for (const x of [23.9, 28.95]) g.fillRect(x * T, 10 * T, 6, 6 * T);
    void rg;
    void layout;
  },
});

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const tod = timeOfDay();
  const { wz, wx } = tileWorld(W, H);
  const north = -H / 2;
  const south = H / 2;
  const roadGap = (c: number): boolean => c > wz(15.5) && c < wz(20);

  shophouseRows(ctx, { north: true, east: true, west: true, seed: 17, close: 0.5, scale: 1.25 });
  skyline(ctx, tod, {
    edge: 'north',
    off: 15,
    depth: 7,
    hMin: 7,
    hMax: 13,
    tints: ['#8a7a6a', '#7a8286', '#9a7a5a', '#8a8a78'],
    seed: 17,
  });
  skyline(ctx, tod, {
    edge: 'east',
    off: 8,
    depth: 6,
    hMin: 5,
    hMax: 9,
    tints: ['#8a7a6a', '#9a7a5a'],
    gap: roadGap,
    seed: 19,
    step: 5.6,
  });
  skyline(ctx, tod, {
    edge: 'west',
    off: 8,
    depth: 6,
    hMin: 5,
    hMax: 9,
    tints: ['#9a7a5a', '#7a8286'],
    gap: roadGap,
    seed: 23,
    step: 5.6,
  });

  // the rail viaduct behind the terminus with a green-and-white commuter train, the station footbridge sign
  const zv = north - 10;
  viaduct(ctx, { z: zv, x0: -W / 2 - 24, x1: W / 2 + 24, deck: 6.2, width: 5.4, pier: 10, track: true });
  railcars(ctx, { x: wx(30), z: zv, y: 6.3, cars: 3, body: 0xe8ece6, stripe: 0x2a8a4a });
  plaque(
    ctx,
    'cr:ebute:viaduct',
    6.2,
    0.9,
    wx(40),
    9.6,
    zv + 2.9,
    0,
    lettered('EBUTE-METTA  ←  IDDO', '#1d6a40', '#f6f2e4'),
  );

  // the lagoon on the south side (low, flat), timber piles and a moored boat at the foreshore; the far bridge
  streetPlane(
    ctx,
    'cr:ebute:lagoon',
    { x: 0, z: south + 22, w: W + 100, d: 40, ppm: 5, y: STREET - 0.12 },
    (g, _px, s, r) => {
      g.fillStyle = '#4a6a74';
      g.fillRect(0, 0, 9999, 9999);
      for (let i = 0; i < 600; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(200,226,236,0.18)' : 'rgba(20,44,56,0.22)';
        g.fillRect(r() * 9999, r() * 9999, s * (0.6 + r() * 1.6), 2);
      }
    },
  );
  ctx.statics.add(box(W + 100, 0.5, 0.5, mat(0x7a766c, { roughness: 1 }), 0, STREET - 0.1, south + 1.8));
  for (let x = -20; x < 24; x += 4.6)
    ctx.statics.add(
      box(
        0.28,
        1.1,
        0.28,
        mat(0x5a4a38, { roughness: 1 }),
        x,
        STREET + 0.1,
        south + 2.6 + ((x * 7) % 3) * 0.4,
      ),
    );
  const hull = box(1.2, 0.5, 3.6, mat(0x8a4a2a, { roughness: 0.7 }), wx(44), STREET + 0.1, south + 7);
  hull.rotation.y = 0.5;
  ctx.statics.add(hull);
  viaduct(ctx, { z: south + 50, x0: wx(30), x1: wx(30) + 90, deck: 9, width: 8, pier: 14, color: 0x8a8e90 }); // the far bridge across the lagoon

  const tarp = THEME.tarps.map((c) => mat(c, { roughness: 0.88 }));
  [-26, -12, 10, 24].forEach((x, i) =>
    setUmbrella(ctx, x, north - 2.4, 0.95, tarp[i % 6]!, tarp[(i + 2) % 6]!, { h: 1.95 }),
  );
  for (const x of [-W / 2 - 4, W / 2 + 4]) lampPost(ctx, x, wz(14), Math.PI / 2, 0xffb868);
  mouthTraffic(ctx, layoutOf(ID), { kinds: ['danfo', 'keke', 'taxi', 'danfo'], depth: 3 });
  const L = ctx.life;
  L.add({ kind: 'onlooker', x: -W / 2 - 1.8, y: STREET, z: wz(14), yaw: 1.5 });
  L.add({ kind: 'seller', x: W / 2 + 1.8, y: STREET, z: wz(12), yaw: -1.5 });
  L.add({ kind: 'walker', x: -14, y: STREET, z: north - 0.8, yaw: 0, toX: 14, toZ: north - 0.8 });
  ctx.ambient.dust(0, north - 1.4, 18, 1);
  ctx.ambient.smokeColumn(-W / 2 - 6, 6, north - 9, { shade: 0.55, size: 1.2, rate: 2 });
}

export const RUMBLE_EBUTE_METTA_SET: ArenaSet = {
  build,
  crowd: 0.25,
  crowdEdges: { north: false, east: true, west: true, south: false },
};

export function ebuteMettaEnv(board: { cols: number; rows: number }): StageEnvironment {
  const { cols } = board;
  return communityEnv(ID, board, {
    seed: 0x0341,
    kinds: ['danfo', 'bus', 'keke', 'car', 'truck'],
    routes: [
      // the commuter viaduct behind the terminus (deck 6.6 above the street), both ways
      {
        id: 'railWest',
        kinds: ['bus', 'danfo'],
        path: [
          [-cols / 2 - 30, -10.6],
          [cols * 0.3, -10.6],
        ],
        count: 2,
        speed: 3.4,
        spacing: 7,
        elevation: 6.6,
        priority: 1,
        fade: 2.5,
        minQuality: 'medium',
      },
    ],
    crowds: [
      {
        id: 'platformWest',
        rect: { x0: 22.2, y0: -4, x1: 25.6, y1: -1.8 },
        count: 6,
        mood: 'waiting',
        facing: 0,
        priority: 2,
      },
      {
        id: 'marketEast',
        rect: { x0: cols + 1.8, y0: 3, x1: cols + 5.5, y1: 13 },
        count: 8,
        mood: 'trading',
        priority: 2,
      },
      { id: 'westWaiters', rect: { x0: -5.5, y0: 20, x1: -2, y1: 29 }, count: 5, mood: 'waiting' },
    ],
    lights: [
      { at: [-3, 14], height: 2.6, color: 0xffb868, size: 1.0, strength: 0.55, flicker: 'sodium', pool: 2.4 },
      {
        at: [cols + 3, 24],
        height: 2.6,
        color: 0xffb868,
        size: 1.0,
        strength: 0.55,
        flicker: 'sodium',
        pool: 2.4,
      },
    ],
    beds: ['crowd_loop', 'buspark_loop'],
  });
}
