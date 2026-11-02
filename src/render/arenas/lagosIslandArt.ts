/**
 * City Rumble - LAGOS ISLAND (presentation only; the board and hazards are `src/sim/arenas/rumbleLagosIsland.ts`),
 * built from the Bible's Lagos Island section and the reference pack: Balogun's textile stalls under bright canopies,
 * ageing plaster and warm masonry, curved-glass and slab office blocks of the Broad Street row, the cream colonial
 * bookshop-corner building with its veranda and hipped roof, a paved civic square, the whitewashed Freedom Park wall
 * with razor-wire coils (protected heritage), the harbour promenade with its sheds and jetty. Beyond the board: the
 * grey Gothic cathedral with its clock tower (a protected backdrop), the CBD skyline, an elevated bridge approach
 * and the harbour. Every name on a board is FICTIONAL.
 */
import type { ArenaLook } from '../arenaLook';
import { timeOfDay } from '../timeOfDay';
import { box, cyl, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import type { FloorDrawer } from './floorKit';
import { T } from './floorKit';
import type { CoverFactory } from './boardCover';
import { communityCover } from './community/factory';
import { building, kiosk, lockup, shop, stall, umbrella } from './community/families';
import type { Family, Theme } from './community/kit';
import { board, box as cbox, cyl as ccyl, pick } from './community/kit';
import { communityFloor } from './community/floor';
import { communityEnv } from './community/env';
import { nightLookOf } from './community/looks';
import { lampPost, lettered, plaque, skyline, viaduct } from './community/setKit';
import { streetPlane, umbrella as setUmbrella } from './oshodiKit';
import { shophouseRows } from './shared';
import { layoutOf, mouthTraffic, tileWorld } from './rumbleV2Kit';
import type { StageEnvironment } from '../env/types';

const ID = 'rumbleLagosIsland';
const cream = '#efe6d0';

const THEME: Theme = {
  plaster: [0xd8c8a4, 0xc8b48e, 0xe0d4b4, 0xb89a78, 0xcfa88a, 0xd2c6a6, 0xbfae8a],
  far: [0xd8c8a4, 0xb5654a, 0x9aa89a, 0xe4ddd0, 0xc89a78, 0x8aa0aa],
  tarps: [0xc83a2a, 0xe0b020, 0x2a6aa8, 0x2f8a4a, 0x7a3a8a, 0xe07a20, 0x2a9a9a],
  roofs: [0xa05a3a, 0x9a6a4a, 0x8a8e90, 0xb8742e],
  accent: [0x2e5a8e, 0x7a1e1e, 0x2e5a34, 0xc89a2a, 0x3a2a5a],
  shops: [
    { bg: '#7a1e1e', fg: '#f2e6c8', lines: [['IYA BOSE TEXTILES', 26]], border: '#f2e6c8' },
    { bg: '#1e3a6a', fg: '#f2e6c8', lines: [['ADUNNI LACE & GEORGE', 24]], border: '#f2e6c8' },
    { bg: '#2e5a34', fg: '#f6e9c6', lines: [['ALHAJI MUSA WAX PRINTS', 22]], border: '#f6e9c6' },
    { bg: '#c89a2a', fg: '#1c1a16', lines: [['MAMA CHIDI PROVISIONS', 24]] },
    { bg: '#3a2a5a', fg: '#f2e6c8', lines: [['OKONKWO SHOES & BAGS', 24]], border: '#f2e6c8' },
    { bg: '#8a4a1e', fg: '#f2e6c8', lines: [['ISALE EKO PLASTICS', 26]], border: '#f2e6c8' },
    { bg: cream, fg: '#6a1c16', lines: [['EKO BOOKS & STATIONERY', 24]], border: '#6a1c16' },
  ],
  small: [
    { bg: '#2f6e3c', fg: cream, lines: [['PURE WATER', 24]] },
    { bg: '#e0b020', fg: '#1c1608', lines: [['RECHARGE', 26]] },
    { bg: '#1f5a8a', fg: cream, lines: [['FERRY TICKETS', 20]] },
  ],
  seed: 321,
};

/** Office tower: a slab of blue-green glass bands over a pale podium, or a curved cream block with ribbon windows. */
const officeTower: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 4.6 + ((r.v * 3 + n * 2) % 4) * 0.9;
  const curved = (r.v + n) % 2 === 0;
  cbox(k, g, k.concrete, r.w, 1.8, r.h, r.cx, 0, r.cz, 0xcfc9b8); // podium
  cbox(k, g, k.concrete, r.w - 0.5, H, r.h - 0.5, r.cx, 1.8, r.cz, curved ? 0xd8d2c0 : 0x6a8a98);
  const floors = Math.floor(H / 1.1);
  for (let f = 0; f < floors; f++)
    cbox(k, g, k.glow, r.w - 0.7, 0.45, 0.04, r.cx, 2.3 + f * 1.1, zf - 0.28, curved ? 0x8aa0aa : 0x9cc4d8);
  cbox(k, g, k.concrete, r.w - 0.3, 0.4, r.h - 0.3, r.cx, H + 1.8, r.cz, 0x8a867c);
  if (curved) ccyl(k, g, k.paint, 0.5, 0.5, 0.6, r.cx, H + 2.2, r.cz, 0xc83a2a, 12);
  board(
    k,
    g,
    k.atlas.board(`office${(r.v + n) % 3}`, 256, 40, {
      bg: '#16304e',
      fg: '#e8e0c8',
      lines: [[['HARBOUR TRUST HOUSE', 'EKO PLAZA OFFICES', 'MARINA COURT'][(r.v + n) % 3]!, 22]],
      border: '#e8e0c8',
    }),
    Math.min(3.4, r.w - 0.6),
    0.45,
    r.cx,
    1.4,
    zf + 0.04,
  );
};

/** Colonial heritage block: cream masonry, arched veranda columns, a hipped tiled roof, a corner turret. */
const heritage: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 4.6;
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
    pick([0xe0d4b0, 0xd8c8a0, 0xcfc29a], r.v + n),
  );
  for (let x = r.x; x < r.x + r.w; x++) {
    ccyl(k, g, k.concrete, 0.14, 0.14, 2.4, k.wx(x) - 0.25, 0, zf + 0.35, 0xf2ecd8, 8);
    cbox(k, g, k.paint, 0.5, 0.9, 0.05, k.wx(x) + 0.1, 2.0, zf, 0x4a3a2a);
    cbox(k, g, k.paint, 0.5, 0.9, 0.05, k.wx(x) + 0.1, 0.35, zf, 0x4a3a2a);
  }
  cbox(k, g, k.concrete, r.w, 0.2, 0.7, r.cx, 2.4, zf + 0.35, 0xf2ecd8);
  for (const sgn of [-1, 1])
    cbox(
      k,
      g,
      k.paint,
      r.w + 0.3,
      0.07,
      (r.h + 0.5) / 2,
      r.cx,
      H + 0.4,
      r.cz + (sgn * (r.h + 0.5)) / 4,
      0x9a4a32,
      0,
      0,
      -sgn * 0.3,
    );
  if (r.w >= 3) ccyl(k, g, k.concrete, 0.4, 0.4, 1.6, k.wx(r.x) + 0.2, H, r.cz, 0xe0d4b0, 8);
};

/** The Freedom Park wall: a long whitewashed masonry wall, a mural strip, razor-wire coils along the top. */
const parkWall: Family = (k, g, r, n) => {
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.02,
    2.2,
    r.h - 0.04,
    r.cx,
    0,
    r.cz,
    pick([0xe4e0d0, 0xd8d4c4, 0xc8c4b4], r.v + n),
  );
  cbox(k, g, k.concrete, r.w, 0.14, r.h, r.cx, 2.2, r.cz, 0x9a968a);
  const zf = k.wz(r.y1) + 0.5;
  cbox(
    k,
    g,
    k.paint,
    Math.min(r.w - 0.3, 3.4),
    0.7,
    0.03,
    r.cx,
    0.9,
    zf,
    pick([0xc83a2a, 0xe0b020, 0x2a6aa8, 0x2f8a4a], r.v + n),
  ); // mural band
  for (let x = r.x; x < r.x + r.w; x++)
    ccyl(k, g, k.metal, 0.13, 0.13, 0.5, k.wx(x), 2.3, r.cz, 0x4a4e52, 8, 0, Math.PI / 2); // coils of wire
};

/** A civic-square tree: a trunk and a rounded green crown (cylinders), a shaded patch below. */
const tree: Family = (k, g, r, n) => {
  for (let j = 0; j < r.h; j++)
    for (let i = 0; i < r.w; i++) {
      const x = k.wx(r.x + i);
      const z = k.wz(r.y + j);
      ccyl(k, g, k.paint, 0.12, 0.18, 1.7, x, 0, z, 0x6a4a30, 6);
      for (let t = 0; t < 3; t++)
        ccyl(
          k,
          g,
          k.paint,
          0.5 - t * 0.12,
          0.9 - t * 0.14,
          0.7,
          x,
          1.3 + t * 0.55,
          z,
          pick([0x3a7a3a, 0x4a8a3a, 0x2f6a34], r.v + n + t),
          9,
        );
    }
};

/** Harbour shed on the quay: a long low corrugated hall with a roller door. */
const quayShed: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  cbox(
    k,
    g,
    k.concrete,
    r.w - 0.1,
    1.9,
    r.h - 0.1,
    r.cx,
    0,
    r.cz,
    pick([0xb8b8a8, 0xa8b0b0, 0xc4b8a0], r.v + n),
  );
  cbox(k, g, k.zinc, r.w + 0.2, 0.06, r.h + 0.2, r.cx, 1.9, r.cz, pick(k.theme.roofs, r.v + n), 0, -0.1);
  cbox(k, g, k.zinc, Math.min(1.8, r.w - 0.8), 1.3, 0.05, r.cx, 0.1, zf + 0.02, 0x7a8288);
  void n;
};

/** The civic-square monument: a stepped plinth and a slender obelisk with a gilded cap and lamps. */
const monument: Family = (k, g, r) => {
  cbox(k, g, k.concrete, r.w, 0.3, r.h, r.cx, 0, r.cz, 0xb6b2a8);
  cbox(k, g, k.concrete, r.w - 0.6, 0.3, r.h - 0.6, r.cx, 0.3, r.cz, 0xcac6ba);
  cbox(k, g, k.concrete, 0.8, 4.2, 0.8, r.cx, 0.6, r.cz, 0xd8d4c4);
  cbox(k, g, k.paint, 0.5, 0.7, 0.5, r.cx, 4.8, r.cz, 0xe0b020);
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    ccyl(
      k,
      g,
      k.metal,
      0.05,
      0.05,
      1.2,
      r.cx + dx * (r.w / 2 - 0.2),
      0.4,
      r.cz + dz * (r.h / 2 - 0.2),
      0x2a2a2c,
      5,
    );
};

/** A covered trading arcade: a plastered row on columns with striped awnings (low, so the square behind stays visible). */
const arcade: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  cbox(k, g, k.concrete, r.w - 0.04, 2.6, r.h - 0.04, r.cx, 0, r.cz, pick(k.theme.plaster, r.v + n));
  cbox(k, g, k.concrete, r.w + 0.06, 0.16, r.h + 0.06, r.cx, 2.6, r.cz, 0x8a8276);
  for (let x = r.x; x < r.x + r.w; x++) {
    cbox(k, g, k.paint, 0.8, 1.5, 0.04, k.wx(x), 0.05, zf, 0x2a2e32);
    cbox(k, g, k.paint, 1.0, 0.1, 0.5, k.wx(x), 1.9, zf + 0.25, pick(k.theme.tarps, x + n), 0, -0.2);
  }
};

const FAMILIES: Record<string, Family> = {
  building,
  shop,
  stall,
  lockup,
  kiosk,
  officeTower,
  heritage,
  parkWall,
  tree,
  quayShed,
  monument,
  arcade,
};
const REACH: Record<string, number> = {
  building: 3,
  shop: 3,
  stall: 1,
  lockup: 1,
  kiosk: 2,
  officeTower: 3,
  heritage: 3,
  parkWall: 2,
  tree: 2,
  quayShed: 2,
  monument: 3,
  arcade: 1,
};
export const RUMBLE_LAGOS_ISLAND_COVER: CoverFactory = communityCover({
  arenaId: ID,
  theme: THEME,
  families: FAMILIES,
  reach: REACH,
});
void umbrella;

export const RUMBLE_LAGOS_ISLAND_LOOK: ArenaLook = {
  // bright hazy island midday: warm masonry, harbour light, pale blue-grey haze
  sky: 0xb4c4cc,
  fog: { color: 0xb0bcc0, near: 34, far: 120 },
  sun: { color: 0xfff0d0, intensity: 4.5, position: [8, 24, 12] },
  hemi: { sky: 0xe4ecf0, ground: 0x7a6a58, intensity: 1.45 },
  envIntensity: 0.6,
  exposure: 1.12,
  floorTint: 0xd2c0a4,
  pillarTint: 0xe4d8c4,
  softTint: 0xcfc0a8,
  slab: 0x7a6a58,
  street: 0x3a3a3c,
  grit: { tone: 0x7c6a54, dirt: 0x5a4a3a, dust: 0x9a8668 },
  lamps: [
    [-27.4, 2.4, -6, 0xffd9a0],
    [27.4, 2.4, 6, 0xffd9a0],
  ],
};
export const RUMBLE_LAGOS_ISLAND_NIGHT_LOOK: ArenaLook = nightLookOf(RUMBLE_LAGOS_ISLAND_LOOK, [
  [-27.4, 2.6, -6, 0xffd9a0],
  [27.4, 2.6, 6, 0xffd9a0],
  [-27.4, 2.6, 12, 0xffd090],
  [27.4, 2.6, -12, 0xffd090],
  [0, 2.6, 19.4, 0xffc880],
  [-12, 2.6, -19.4, 0xffc880],
  [12, 2.6, -19.4, 0xffc880],
]);

export const RUMBLE_LAGOS_ISLAND_FLOOR: FloorDrawer = communityFloor(ID, {
  seed: 3211,
  base: [176, 150, 124],
  dust: 'rgba(150,110,70,',
  road: [62, 60, 58],
  pavers: [170, 160, 140],
  tint: {
    balogun: 'rgba(150,80,50,0.10)',
    idumota: 'rgba(110,100,90,0.10)',
    broadStreet: 'rgba(100,110,120,0.08)',
    civicSquare: 'rgba(210,200,170,0.18)',
    onikan: 'rgba(70,130,70,0.25)',
    marina: 'rgba(80,110,130,0.14)',
  },
  extra: (g, _rg, layout) => {
    // the park lawn under the Onikan trees, a worn football-ground circle, the harbour edge and its mooring bollards
    g.fillStyle = 'rgba(86,142,70,0.55)';
    for (let y = 19; y <= 28; y++)
      for (let x = 36; x <= 50; x++) if (layout[y]![x] === '_') g.fillRect(x * T, y * T, T, T);
    g.strokeStyle = 'rgba(240,240,226,0.5)';
    g.lineWidth = 6;
    g.strokeRect(38 * T, 20 * T, 11 * T, 7 * T);
    g.beginPath();
    g.arc(43.5 * T, 23.5 * T, 1.6 * T, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(40,36,30,0.7)';
    for (let x = 4; x < 52; x += 6) g.fillRect(x * T + 40, 36 * T + 96, 48, 20);
  },
});

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const tod = timeOfDay();
  const { wz, wx } = tileWorld(W, H);
  const north = -H / 2;
  const south = H / 2;
  const marinaGap = (c: number): boolean => c > wz(30.5) && c < wz(34);
  const boulevardGap = (c: number): boolean => c > wx(23) && c < wx(28);

  shophouseRows(ctx, { north: true, east: true, west: true, seed: 5, close: 0.4, scale: 1.3 });
  skyline(ctx, tod, {
    edge: 'north',
    off: 14,
    depth: 7,
    hMin: 8,
    hMax: 18,
    tints: ['#8a96a0', '#a08a70', '#6a7a86', '#9a9a90'],
    gap: boulevardGap,
    seed: 5,
  });
  skyline(ctx, tod, {
    edge: 'east',
    off: 6,
    depth: 6,
    hMin: 5,
    hMax: 10,
    tints: ['#a08a70', '#8a96a0'],
    gap: marinaGap,
    seed: 9,
    step: 5.6,
  });
  skyline(ctx, tod, {
    edge: 'west',
    off: 6,
    depth: 6,
    hMin: 5,
    hMax: 10,
    tints: ['#9a9a90', '#a08a70'],
    gap: marinaGap,
    seed: 13,
    step: 5.6,
  });

  // the cathedral: a grey Gothic nave and clock tower with pinnacles, behind the civic square (protected backdrop)
  const cx = wx(46);
  const cz = north - 13;
  const grey = mat(0x9a9a98, { roughness: 1, flat: false });
  const dark = mat(0x3a3e44, { roughness: 0.6 });
  ctx.statics.add(box(16, 8, 9, grey, cx, STREET + 4, cz));
  for (const sgn of [-1, 1])
    ctx.statics.add(box(16.4, 0.5, 4.8, mat(0x7a7a78), cx, STREET + 9, cz + sgn * 2.1));
  ctx.statics.add(box(16, 1.8, 9, mat(0x7a7a78, { roughness: 1, flat: false }), cx, STREET + 9.4, cz));
  for (let i = 0; i < 7; i++) {
    ctx.statics.add(box(0.9, 2.6, 0.12, dark, cx - 6.6 + i * 2.2, STREET + 4.2, cz + 4.55)); // pointed windows (blocks)
    ctx.statics.add(box(0.5, 0.5, 0.12, dark, cx - 6.6 + i * 2.2, STREET + 5.9, cz + 4.55));
    ctx.statics.add(cyl(0.12, 0.2, 5.4, grey, cx - 7.3 + i * 2.2, STREET + 5.2, cz + 4.9, 6)); // buttresses
  }
  const tx = cx + 10;
  ctx.statics.add(box(4.6, 24, 4.6, grey, tx, STREET + 12, cz));
  ctx.statics.add(box(5.0, 0.6, 5.0, mat(0x7a7a78), tx, STREET + 24.3, cz));
  for (const dx of [-2, 2])
    for (const dz of [-2, 2]) ctx.statics.add(cyl(0.12, 0.3, 3.2, grey, tx + dx, STREET + 26, cz + dz, 6)); // pinnacles
  ctx.statics.add(cyl(1.0, 1.0, 0.2, mat(0xf0ecdc, { roughness: 0.4 }), tx, STREET + 20.5, cz + 2.4, 20)); // the clock face (south)
  ctx.statics.add(box(1.4, 3.4, 0.14, dark, tx, STREET + 15, cz + 2.4));
  ctx.statics.add(box(1.2, 3.0, 0.14, dark, tx, STREET + 9.0, cz + 2.4));

  // the Idumota bridge approach: an elevated deck on piers beyond the north-west corner
  viaduct(ctx, {
    z: north - 9,
    x0: -W / 2 - 40,
    x1: wx(18),
    deck: 7.4,
    width: 7.4,
    pier: 10,
    color: 0xaaa69c,
  });
  plaque(
    ctx,
    'cr:lagos:gantry',
    6.4,
    1.0,
    wx(8),
    8.8,
    north - 5.3,
    0,
    lettered('IDUMOTA  ←  →  MARINA', '#17674a', '#f4f2ea'),
  );
  ctx.statics.add(box(0.2, 1.6, 0.2, mat(0x4a4a48), wx(8) - 3.1, 8.2, north - 5.4));
  ctx.statics.add(box(0.2, 1.6, 0.2, mat(0x4a4a48), wx(8) + 3.1, 8.2, north - 5.4));

  // the harbour: a quay edge, flat water, a jetty and moored boats (all low: the camera side stays clear)
  streetPlane(
    ctx,
    'cr:lagos:water',
    { x: 0, z: south + 22, w: W + 90, d: 40, ppm: 5, y: STREET - 0.12 },
    (g, _px, s, r) => {
      g.fillStyle = '#3d6c88';
      g.fillRect(0, 0, 9999, 9999);
      for (let i = 0; i < 600; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(200,228,240,0.18)' : 'rgba(20,50,70,0.2)';
        g.fillRect(r() * 9999, r() * 9999, s * (0.6 + r() * 1.6), 2);
      }
    },
  );
  ctx.statics.add(box(W + 90, 0.5, 0.5, mat(0x8a867c, { roughness: 1 }), 0, STREET - 0.1, south + 1.8));
  for (const x of [-9, 11])
    ctx.statics.add(box(1.6, 0.14, 9, mat(0x8a6a4a, { roughness: 0.9 }), x, STREET - 0.02, south + 6.2));
  [
    [-14, 8, 0.2],
    [4, 11, -0.4],
    [18, 7, 0.1],
    [-26, 12, 0.6],
  ].forEach(([x, z, ry]) => {
    const hull = box(1.0, 0.45, 3.2, mat(0xe8e4d6, { roughness: 0.6 }), x!, STREET + 0.1, south + z!);
    const band = box(1.04, 0.14, 3.24, mat(0x2a6aa8, { roughness: 0.6 }), x!, STREET + 0.4, south + z!);
    hull.rotation.y = band.rotation.y = ry!;
    ctx.statics.add(hull, band);
  });
  // a ferry pier crane and a far container ship on the horizon
  ctx.statics.add(box(60, 8, 12, mat(0x5a6a76, { roughness: 0.7 }), -10, STREET + 4, south + 62));

  // textile canopies beyond the market edges, the park's heritage trees, lamps
  const tarp = THEME.tarps.map((c) => mat(c, { roughness: 0.88 }));
  [-W / 2 - 2.5].forEach((x) =>
    [-14, -9, -3, 3, 9, 14].forEach((z, i) =>
      setUmbrella(ctx, x, z, 0.95, tarp[i % 7]!, tarp[(i + 2) % 7]!, { h: 1.95 }),
    ),
  );
  [-24, -10, 6, 18].forEach((x, i) =>
    setUmbrella(ctx, x, north - 2.4, 0.95, tarp[(i + 1) % 7]!, tarp[(i + 4) % 7]!, { h: 1.95 }),
  );
  for (const x of [-W / 2 - 4, W / 2 + 4]) lampPost(ctx, x, wz(12), Math.PI / 2, 0xffd9a0);
  mouthTraffic(ctx, layoutOf(ID), { kinds: ['danfo', 'keke', 'taxi', 'danfo'], depth: 3 });
  const L = ctx.life;
  L.add({ kind: 'seller', x: -W / 2 - 1.8, y: STREET, z: wz(9), yaw: 1.5 });
  L.add({ kind: 'argue', x: -W / 2 - 1.8, y: STREET, z: wz(18), yaw: 1.5 });
  L.add({ kind: 'walker', x: -14, y: STREET, z: north - 0.8, yaw: 0, toX: 14, toZ: north - 0.8 });
  L.add({ kind: 'onlooker', x: W / 2 + 1.8, y: STREET, z: wz(10), yaw: -1.5 });
  ctx.ambient.dust(0, north - 1.4, 18, 1);
}

export const RUMBLE_LAGOS_ISLAND_SET: ArenaSet = {
  build,
  crowd: 0.3,
  crowdEdges: { north: false, east: true, west: true, south: false },
};

export function lagosIslandEnv(board: { cols: number; rows: number }): StageEnvironment {
  const { cols } = board;
  return communityEnv(ID, board, {
    seed: 0x0321,
    kinds: ['danfo', 'bus', 'keke', 'car', 'bus'],
    routes: [
      // the elevated bridge approach north-west (deck 6.6 above the street), both ways
      {
        id: 'bridgeWest',
        kinds: ['bus', 'danfo', 'car'],
        path: [
          [-cols / 2 - 36, -9.5],
          [cols * 0.33, -9.5],
        ],
        count: 3,
        speed: 4.2,
        spacing: 5,
        elevation: 6.6,
        priority: 3,
        fade: 2.5,
      },
      {
        id: 'bridgeEast',
        kinds: ['danfo', 'car', 'bus'],
        path: [
          [cols * 0.33, -7.6],
          [-cols / 2 - 36, -7.6],
        ],
        count: 3,
        speed: 3.8,
        spacing: 5,
        elevation: 6.6,
        priority: 3,
        fade: 2.5,
      },
    ],
    crowds: [
      {
        id: 'westTraders',
        rect: { x0: -5.5, y0: 3, x1: -1.8, y1: 14 },
        count: 9,
        mood: 'trading',
        priority: 2,
      },
      {
        id: 'eastWatchers',
        rect: { x0: cols + 1.8, y0: 3, x1: cols + 5, y1: 13 },
        count: 6,
        mood: 'watching',
      },
      {
        id: 'quayStrollers',
        rect: { x0: cols * 0.3, y0: -5, x1: cols * 0.6, y1: -2 },
        count: 5,
        mood: 'waiting',
        facing: 0,
      },
    ],
    lights: [
      { at: [-3, 8], height: 2.4, color: 0xffd9a0, size: 1.0, strength: 0.55, flicker: 'sodium', pool: 2.4 },
      {
        at: [cols + 3, 20],
        height: 2.4,
        color: 0xffd9a0,
        size: 1.0,
        strength: 0.55,
        flicker: 'sodium',
        pool: 2.4,
      },
    ],
    cutaway: [{ x0: 0, y0: -20, x1: cols * 0.4, y1: -2 }],
    beds: ['crowd_loop', 'buspark_loop'],
  });
}
