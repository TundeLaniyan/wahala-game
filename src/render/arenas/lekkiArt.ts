/**
 * City Rumble - LEKKI, Phase 1 and Ikate (presentation only; the board and hazards are `src/sim/arenas/rumbleLekki.ts`),
 * built from the Bible's Lekki section and the reference pack: a wide paved lagoon promenade under palms with the
 * Link Bridge's single white pylon and radiating stay cables on the horizon, high plastered compound walls with
 * steel gates over green hedges, modern flat-roofed villas with balconies and glass, glass-and-plaster mixed-use
 * blocks, a painted construction hoarding, the Ikate arts-and-crafts market (rows of low corrugated sheds with
 * baskets, pots and cloth on display), a fuel canopy and the six-lane expressway. Every name on a board is FICTIONAL.
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
import { building, kiosk, lockup, shop, stall } from './community/families';
import type { Family, Theme } from './community/kit';
import { board, box as cbox, cyl as ccyl, drum, pick } from './community/kit';
import { communityFloor } from './community/floor';
import { communityEnv } from './community/env';
import { nightLookOf } from './community/looks';
import { edgeStalls, streetLife, lampPost, skyline } from './community/setKit';
import { streetPlane, umbrella as setUmbrella } from './oshodiKit';
import { layoutOf, mouthTraffic, tileWorld } from './rumbleV2Kit';
import type { StageEnvironment } from '../env/types';

const ID = 'rumbleLekki';
const cream = '#efe6d0';

const THEME: Theme = {
  plaster: [0xe4e0d4, 0xd8d0bc, 0xcfc8b8, 0xe8e0c8, 0xc8d0c8, 0xd4c4a8],
  far: [0xe4e0d4, 0x8aa0aa, 0xd8d0bc, 0x9ab0a0, 0xc8c0b0],
  tarps: [0x2a9a9a, 0xe0b020, 0xc83a2a, 0x2a6aa8, 0xe07a20],
  roofs: [0x8a8e90, 0x9a6a4a, 0xa05a3a],
  accent: [0x2a6a74, 0x2e5a8e, 0x3a7a46, 0xc8a02a, 0xd8d0bc],
  shops: [
    { bg: '#16304e', fg: cream, lines: [['ADMIRALTY CAFE & BAKERY', 24]], border: cream },
    { bg: '#e8e0c8', fg: '#16457a', lines: [['LAGOON MICROFINANCE', 26]], border: '#16457a' },
    { bg: '#2f6e3c', fg: '#f4f0e0', lines: [['ELEGANCE SALON & SPA', 26]] },
    { bg: '#16140f', fg: '#f2c21a', lines: [['IKATE AUTO CARE', 30]] },
    { bg: '#a8241c', fg: cream, lines: [['SUNSET SHAWARMA', 28]], border: cream },
    { bg: '#4a2a5a', fg: cream, lines: [['TECH HUB WORKSPACE', 24]] },
  ],
  small: [
    { bg: '#2f6e3c', fg: cream, lines: [['COCONUT WATER', 22]] },
    { bg: '#e0b020', fg: '#1c1608', lines: [['RIDE & DISPATCH', 22]] },
    { bg: '#1f5a8a', fg: cream, lines: [['ICE CREAM', 28]] },
  ],
  seed: 331,
};

/** Glass-and-plaster mixed-use block: a pale podium, a blue-green glass curtain, a roof terrace with a rail. */
const glassBlock: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 5.2 + ((r.v + n) % 3) * 0.9;
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
    pick([0xd8d4c4, 0xcfd4d0, 0xe0dccc], r.v + n),
  );
  cbox(k, g, k.glow, r.w - 0.5, H - 1.5, 0.05, r.cx, 1.2, zf, 0x7ab0c8);
  for (let f = 1; f < Math.floor(H / 1.2); f++)
    cbox(k, g, k.concrete, r.w - 0.3, 0.06, 0.07, r.cx, 0.9 + f * 1.2, zf + 0.04, 0xc8c4b4);
  cbox(k, g, k.concrete, r.w + 0.1, 0.25, r.h + 0.1, r.cx, H, r.cz, 0x8a867c);
  cbox(k, g, k.metal, r.w - 0.2, 0.4, 0.04, r.cx, H + 0.25, zf, 0x3a3e42);
  board(
    k,
    g,
    k.atlas.board(`gb${(r.v + n) % 3}`, 256, 40, {
      bg: '#16304e',
      fg: '#e8e0c8',
      lines: [[['PHASE ONE PLAZA', 'ADMIRALTY SQUARE', 'GATEWAY OFFICES'][(r.v + n) % 3]!, 22]],
      border: '#e8e0c8',
    }),
    Math.min(3.2, r.w - 0.5),
    0.42,
    r.cx,
    0.7,
    zf + 0.04,
  );
};

/** A high plastered compound wall with a steel gate, an electric fence on top and a hedge of green. */
const compoundWall: Family = (k, g, r, n) => {
  cbox(k, g, k.concrete, r.w - 0.04, 2.5, r.h - 0.04, r.cx, 0, r.cz, pick(k.theme.plaster, r.v + n));
  cbox(k, g, k.concrete, r.w, 0.14, r.h, r.cx, 2.5, r.cz, 0x9a968a);
  for (let x = r.x; x < r.x + r.w; x++)
    ccyl(k, g, k.metal, 0.02, 0.02, 0.5, k.wx(x), 2.64, r.cz, 0x2a2a2c, 4);
  cbox(k, g, k.metal, r.w, 0.03, 0.03, r.cx, 3.0, r.cz, 0x2a2a2c);
  const zf = k.wz(r.y1) + 0.5;
  cbox(k, g, k.metal, 1.6, 2.0, 0.06, r.cx, 0.05, zf + 0.02, 0x2a3036); // the gate
  cbox(k, g, k.paint, r.w - 0.2, 0.5, 0.3, r.cx, 0.1, zf + 0.2, 0x3a7a3a); // hedge
};

/** A modern villa: white flat-roofed boxes stepped back, balcony slabs, large glazing, a roof water tank. */
const villa: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 5.2;
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.1,
    2.6,
    r.h - 0.1,
    r.cx,
    0,
    r.cz,
    pick([0xeeeae0, 0xe4e0d4, 0xdcd8cc], r.v + n),
  );
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.9,
    2.6,
    r.h - 0.9,
    r.cx + 0.3,
    2.6,
    r.cz - 0.1,
    pick([0xe0dcd0, 0xcfd0cc], r.v + n),
  );
  cbox(k, g, k.concrete, r.w, 0.12, r.h, r.cx, 2.6, r.cz, 0xb8b4a8);
  cbox(k, g, k.glow, r.w - 1.2, 1.3, 0.05, r.cx - 0.3, 0.5, zf, 0x8ab8cc);
  cbox(k, g, k.metal, r.w - 0.9, 0.3, 0.04, r.cx + 0.3, 2.8, zf - 0.4, 0x3a3e42);
  cbox(k, g, k.glow, r.w - 1.6, 1.0, 0.05, r.cx + 0.3, 3.0, zf - 0.42, 0x8ab8cc);
  cbox(k, g, k.concrete, r.w - 0.8, 0.14, r.h - 0.8, r.cx + 0.3, H, r.cz - 0.1, 0xc8c4b8);
  if ((r.v + n) % 2 === 0)
    ccyl(k, g, k.paint, 0.3, 0.3, 0.6, r.cx - r.w / 2 + 0.7, H + 0.14, r.cz, 0x1a1a1c, 10);
};

/** Ikate arts-and-crafts market shed: a long low corrugated shed, posts, baskets / pots / hats / cloth on display. */
const artsShed: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.06,
    1.0,
    r.h - 0.1,
    r.cx,
    0,
    r.cz,
    pick([0x9a7a58, 0x8a6a4a, 0xa88a62], r.v + n),
  );
  cbox(
    k,
    g,
    k.zinc,
    r.w + 0.2,
    0.05,
    r.h + 0.5,
    r.cx,
    2.3,
    r.cz + 0.15,
    pick(k.theme.roofs, r.v + n),
    0,
    -0.18,
  );
  for (let x = r.x; x <= r.x + r.w; x += 2)
    ccyl(k, g, k.metal, 0.04, 0.04, 2.3, k.wx(x) - 0.5, 0, zf + 0.35, 0x5a4a38, 6);
  for (let x = r.x; x < r.x + r.w; x++) {
    drum(
      k,
      g,
      k.paint,
      0.22,
      0.4,
      k.wx(x) - 0.2,
      0.45,
      zf + 0.1,
      pick([0xb88a4a, 0xa8743a, 0xc89a5a], x + n),
      0,
      0,
      10,
    ); // baskets
    cbox(k, g, k.paint, 0.18, 0.5, 0.18, k.wx(x) + 0.25, 1.0, zf + 0.12, pick(k.theme.tarps, x + r.v)); // cloth / pots
  }
  board(
    k,
    g,
    k.atlas.board('arts', 256, 40, {
      bg: '#8a4a1e',
      fg: '#f2e6c8',
      lines: [['IKATE ARTS & CRAFTS', 24]],
      border: '#f2e6c8',
    }),
    Math.min(2.6, r.w - 0.5),
    0.34,
    r.cx,
    2.0,
    zf + 0.4,
  );
};

/** The construction site's painted hoarding: plywood panels in site colours, a gate, a crane counterweight behind. */
const hoarding: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  cbox(
    k,
    g,
    k.paint,
    r.w - 0.04,
    2.4,
    r.h - 0.2,
    r.cx,
    0,
    r.cz,
    pick([0x2a6aa8, 0xe07a20, 0xd8d0b8], r.v + n),
  );
  cbox(k, g, k.paint, r.w, 0.5, r.h - 0.1, r.cx, 2.3, r.cz, 0x16140f);
  board(
    k,
    g,
    k.atlas.board('hoard', 256, 40, {
      bg: '#e0b020',
      fg: '#16140f',
      lines: [['SITE WORKS  •  HARD HATS ONLY', 20]],
      border: '#16140f',
    }),
    Math.min(3.6, r.w - 0.4),
    0.4,
    r.cx,
    1.6,
    zf + 0.03,
  );
  cbox(k, g, k.metal, 0.9, 5.4, 0.9, r.cx, 2.7, r.cz - 0.2, 0xe0b020); // a crane mast behind the hoarding
};

/** A palm: a slim curved trunk and a crown of long fronds (flat boxes). */
const palm: Family = (k, g, r, n) => {
  const x = r.cx;
  const z = r.cz;
  ccyl(k, g, k.paint, 0.1, 0.16, 3.4, x, 0, z, 0x8a6a48, 6);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + n;
    cbox(
      k,
      g,
      k.paint,
      1.6,
      0.05,
      0.3,
      x + Math.cos(a) * 0.7,
      3.3,
      z + Math.sin(a) * 0.7,
      pick([0x3a7a3a, 0x4a8a3a, 0x2f6a34], i + n),
      -a,
      0,
      0.35,
    );
  }
};

/** The fuel canopy: a flat roof on columns over pumps, red-and-white fascia. */
const fuelCanopy: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  cbox(k, g, k.paint, r.w + 0.2, 0.5, r.h + 0.2, r.cx, 3.3, r.cz, 0xe8e4d8);
  cbox(k, g, k.paint, r.w + 0.24, 0.16, r.h + 0.24, r.cx, 3.3, r.cz, 0xc83a2a);
  for (let x = r.x + 1; x < r.x + r.w; x += 3)
    ccyl(k, g, k.concrete, 0.16, 0.16, 3.3, k.wx(x), 0, r.cz, 0xd8d4c4, 8);
  for (let x = r.x + 1; x < r.x + r.w; x += 3)
    cbox(k, g, k.paint, 0.5, 1.4, 0.4, k.wx(x) + 1, 0, zf - 0.3, 0xc83a2a); // pumps
  cbox(k, g, k.concrete, r.w - 1, 2.6, 1.1, r.cx, 0, r.cz - r.h / 2 + 0.6, 0xe4e0d4);
  void n;
};

/** The sports club frontage: a long white-and-teal block with big banner boards. */
const sportsClub: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 4.4;
  cbox(k, g, k.concrete, r.w - 0.1, H, r.h - 0.1, r.cx, 0, r.cz, 0xe8e4d6);
  cbox(k, g, k.paint, r.w, 0.6, r.h, r.cx, H - 0.6, r.cz, 0x2a8a8a);
  cbox(k, g, k.glow, r.w - 1.0, 1.4, 0.05, r.cx, 1.0, zf, 0x9cc8d8);
  board(
    k,
    g,
    k.atlas.board('club', 256, 40, {
      bg: '#2a8a8a',
      fg: '#ffffff',
      lines: [['IKATE SPORTS & LEISURE CLUB', 20]],
      border: '#ffffff',
    }),
    Math.min(5, r.w - 0.6),
    0.5,
    r.cx,
    H - 0.35,
    zf + 0.04,
  );
  void n;
};

const FAMILIES: Record<string, Family> = {
  building,
  shop,
  lockup,
  kiosk,
  stall,
  glassBlock,
  compoundWall,
  villa,
  artsShed,
  hoarding,
  palm,
  fuelCanopy,
  sportsClub,
};
const REACH: Record<string, number> = {
  building: 3,
  shop: 3,
  lockup: 1,
  kiosk: 2,
  stall: 1,
  glassBlock: 3,
  compoundWall: 2,
  villa: 3,
  artsShed: 1,
  hoarding: 3,
  palm: 2,
  fuelCanopy: 2,
  sportsClub: 3,
};
export const RUMBLE_LEKKI_COVER: CoverFactory = communityCover({
  arenaId: ID,
  theme: THEME,
  families: FAMILIES,
  reach: REACH,
});

export const RUMBLE_LEKKI_LOOK: ArenaLook = {
  // clear coastal afternoon: warm low sun, bluer haze over the lagoon, sharp shadows under the villa balconies
  sky: 0x9ab8cc,
  fog: { color: 0xa8c0cc, near: 36, far: 126 },
  sun: { color: 0xffe6c0, intensity: 4.6, position: [-9, 21, 11] },
  hemi: { sky: 0xdce8f0, ground: 0x7a7060, intensity: 1.42 },
  envIntensity: 0.62,
  exposure: 1.12,
  floorTint: 0xd0c8b4,
  pillarTint: 0xe8e2d4,
  softTint: 0xd0c8b4,
  slab: 0x7a7060,
  street: 0x3a3c3e,
  grit: { tone: 0x7a7060, dirt: 0x5a5244, dust: 0x9a9078 },
  lamps: [
    [-28.4, 2.4, 8, 0xffe0b0],
    [28.4, 2.4, -8, 0xffe0b0],
  ],
};
export const RUMBLE_LEKKI_NIGHT_LOOK: ArenaLook = nightLookOf(RUMBLE_LEKKI_LOOK, [
  [-28.4, 2.6, 8, 0xffe0b0],
  [28.4, 2.6, -8, 0xffe0b0],
  [-28.4, 2.6, -10, 0xffe0b0],
  [28.4, 2.6, 12, 0xffe0b0],
  [-10, 2.6, 19.4, 0xffd090],
  [10, 2.6, 19.4, 0xffd090],
  [0, 2.6, -19.4, 0xffd9a0],
]);

export const RUMBLE_LEKKI_FLOOR: FloorDrawer = communityFloor(ID, {
  seed: 3311,
  base: [176, 168, 150],
  dust: 'rgba(160,140,100,',
  road: [66, 66, 68],
  pavers: [186, 174, 154],
  tint: {
    promenade: 'rgba(230,214,170,0.20)',
    ikate: 'rgba(200,150,90,0.12)',
    admiralty: 'rgba(120,130,130,0.10)',
    coastal: 'rgba(222,200,150,0.22)',
    estates: 'rgba(90,130,90,0.12)',
  },
  extra: (g, _rg, layout) => {
    // interlocking paving on the promenade, the court's painted lines, sand drifting into the coastal lanes
    g.fillStyle = 'rgba(150,170,120,0.28)';
    for (let y = 2; y <= 3; y++)
      for (let x = 2; x <= 36; x++) if (layout[y]![x] === '.') g.fillRect(x * T, y * T, T, T);
    g.strokeStyle = 'rgba(240,240,226,0.6)';
    g.lineWidth = 6;
    g.strokeRect(42 * T, 8 * T, 7 * T, 5 * T);
    g.beginPath();
    g.moveTo(45.5 * T, 8 * T);
    g.lineTo(45.5 * T, 13 * T);
    g.stroke();
    g.fillStyle = 'rgba(40,36,30,0.55)';
    for (let x = 4; x < 36; x += 6) g.fillRect(x * T + 30, 3 * T + 96, 60, 14); // the drainage gutter along the lagoon wall
  },
});

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const tod = timeOfDay();
  const { wz, wx } = tileWorld(W, H);
  const north = -H / 2;
  const south = H / 2;
  const expGap = (c: number): boolean => c > wz(17.5) && c < wz(35);
  // the lagoon: open water north of the promenade, a seawall, the Link Bridge's single white pylon with its stays
  streetPlane(
    ctx,
    'cr:lekki:lagoon',
    { x: 0, z: north - 32, w: W + 120, d: 60, ppm: 4, y: STREET - 0.14 },
    (g, _px, s, r) => {
      g.fillStyle = '#4a7a8a';
      g.fillRect(0, 0, 9999, 9999);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(210,236,246,0.2)' : 'rgba(20,50,64,0.22)';
        g.fillRect(r() * 9999, r() * 9999, s * (0.6 + r() * 1.8), 2);
      }
    },
  );
  ctx.statics.add(box(W + 120, 0.7, 0.6, mat(0xa8a090, { roughness: 1 }), 0, STREET - 0.1, north - 1.3));
  const px = wx(10);
  const pz = north - 15;
  const white = mat(0xe8e8e2, { roughness: 0.6 });
  ctx.statics.add(box(60, 0.8, 4, mat(0x8a8e92, { roughness: 0.7 }), px + 10, 5.6, pz + 3)); // the bridge deck
  for (const dx of [-0.9, 0.9]) ctx.statics.add(box(0.7, 26, 1.4, white, px + dx, 6 + 13, pz + 3));
  ctx.statics.add(box(2.6, 0.9, 1.4, white, px, 6 + 14, pz + 3));
  ctx.statics.add(box(2.6, 0.9, 1.4, white, px, 6 + 9, pz + 3));
  // radiating stay cables: thin bars from the pylon head to the deck, both ways
  for (let i = 0; i < 9; i++) {
    const run = 6 + i * 3.6;
    const len = Math.hypot(run, 12);
    for (const sgn of [-1, 1]) {
      const bar = box(0.06, 0.06, len, mat(0xcfcfca), px + sgn * (run / 2 + 0.9), 6 + 14 - 6 + 0.4, pz + 3);
      bar.rotation.y = sgn > 0 ? -Math.atan2(12, run) + Math.PI / 2 : Math.atan2(12, run) - Math.PI / 2;
      bar.rotation.order = 'YXZ';
      ctx.statics.add(bar);
    }
  }

  skyline(ctx, tod, {
    edge: 'east',
    off: 6,
    depth: 6,
    hMin: 4,
    hMax: 7,
    tints: ['#a8a898', '#98a8a0', '#b0a890'],
    gap: expGap,
    seed: 7,
    step: 6,
  });
  skyline(ctx, tod, {
    edge: 'west',
    off: 6,
    depth: 6,
    hMin: 4,
    hMax: 7,
    tints: ['#b0a890', '#98a8a0', '#a8a898'],
    gap: expGap,
    seed: 11,
    step: 6,
  });
  void south;

  // lamp posts and palms along the promenade, parked cars and dispatch bikes at the expressway mouths
  for (const x of [-W / 2 - 4, W / 2 + 4]) lampPost(ctx, x, wz(24), Math.PI / 2, 0xffe0b0);
  const tarp = THEME.tarps.map((c) => mat(c, { roughness: 0.88 }));
  [-26, -12, 8, 22].forEach((x, i) =>
    setUmbrella(ctx, x, north - 2.4, 0.95, tarp[i % 5]!, tarp[(i + 2) % 5]!, { h: 1.95 }),
  );
  ctx.vehicles('okada', [
    { x: -W / 2 - 1.6, y: STREET, z: wz(22), ry: 0.4 },
    { x: W / 2 + 1.6, y: STREET, z: wz(8), ry: -0.4 },
  ]);
  mouthTraffic(ctx, layoutOf(ID), { kinds: ['taxi', 'danfo', 'taxi', 'keke'], depth: 3 });
  const streetGap = (z: number): boolean => z > wz(17.5) && z < wz(35);
  edgeStalls(ctx, {
    north: true,
    east: true,
    west: true,
    goods: ['provisions', 'basins', 'cloth'],
    gap: streetGap,
    seed: 3,
  });
  streetLife(ctx, { n: 14, gap: streetGap });
  ctx.ambient.dust(0, north - 1.4, 18, 0.8);
}

export const RUMBLE_LEKKI_SET: ArenaSet = {
  build,
  crowd: 0.25,
  crowdEdges: { north: false, east: true, west: true, south: false },
};

export function lekkiEnv(board: { cols: number; rows: number }): StageEnvironment {
  const { cols, rows } = board;
  return communityEnv(ID, board, {
    seed: 0x0331,
    kinds: ['car', 'bus', 'car', 'danfo', 'keke'],
    count: 4,
    speed: 4.4,
    crowds: [
      {
        id: 'westWaiters',
        rect: { x0: -5.5, y0: 22.5, x1: -2, y1: 29 },
        count: 6,
        mood: 'waiting',
        priority: 2,
      },
      {
        id: 'eastLeisure',
        rect: { x0: cols + 2, y0: 3, x1: cols + 5.5, y1: 12 },
        count: 6,
        mood: 'watching',
      },
      {
        id: 'promenadeStrollers',
        rect: { x0: cols * 0.3, y0: -5, x1: cols * 0.6, y1: -2 },
        count: 5,
        mood: 'waiting',
        facing: 0,
      },
    ],
    lights: [
      {
        at: [-3, rows * 0.6],
        height: 2.4,
        color: 0xffe0b0,
        size: 1.0,
        strength: 0.5,
        flicker: 'sodium',
        pool: 2.4,
      },
      {
        at: [cols + 3, rows * 0.25],
        height: 2.4,
        color: 0xffe0b0,
        size: 1.0,
        strength: 0.5,
        flicker: 'sodium',
        pool: 2.4,
      },
    ],
    beds: ['crowd_loop', 'buspark_loop'],
  });
}
