/**
 * City Rumble - MUSHIN (presentation only; the board and hazards are `src/sim/arenas/rumbleMushin.ts`), built from
 * the Bible's Mushin section and the reference pack: Ladipo-style auto-parts stalls under bright umbrellas, heaps
 * of tyres, rims and exhaust pipes, rust-red corrugated roofs over timber-framed shopfronts, the Idi-Oro food hall
 * with its green produce crates and painted vegetable mural, grain warehouses and sack stalls, timber yards and
 * residential courtyards; beyond the north edge the green-roofed Red Line station on its viaduct above the mainland
 * rooftops. Every name on a board is FICTIONAL.
 *
 * Floor: laterite dust over worn concrete, darker foot-polished aisles, paver plazas, a patched four-lane road.
 */
import type { ArenaLook } from '../arenaLook';
import { timeOfDay } from '../timeOfDay';
import { box, cyl, mat } from '../assets/helpers';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import type { FloorDrawer } from './floorKit';
import type { CoverFactory } from './boardCover';
import { communityCover } from './community/factory';
import {
  building,
  house,
  kiosk,
  lockup,
  shelter,
  shop,
  stall,
  wall,
  warehouse,
  workshop,
  umbrella,
} from './community/families';
import type { Family, Theme } from './community/kit';
import { board, box as cbox, cyl as ccyl, drum, pick, smallBoard } from './community/kit';
import { communityFloor } from './community/floor';
import { communityEnv } from './community/env';
import { nightLookOf } from './community/looks';
import {
  edgeStalls,
  streetLife,
  lampPost,
  lettered,
  plaque,
  railcars,
  skyline,
  viaduct,
} from './community/setKit';
import { sign, signTexture, umbrella as setUmbrella } from './oshodiKit';
import { shophouseRows } from './shared';
import { layoutOf, mouthTraffic, tileWorld } from './rumbleV2Kit';
import type { StageEnvironment } from '../env/types';

const ID = 'rumbleMushin';
const cream = '#efe6d0';

// ------------------------------------------------------------------------------------------ theme

const THEME: Theme = {
  plaster: [0xc8b48e, 0xb89a78, 0x9fb0a6, 0xd2c6a6, 0xb88a64, 0xcfa88a, 0xa6a07c, 0x8ea0b4],
  far: [0xb5654a, 0x4a8a8c, 0xd0a040, 0xe4ddd0, 0x7a8aa0, 0x9a4a32, 0x8aa070, 0xc89a78],
  tarps: [0xc83a2a, 0xe0b020, 0x2a6aa8, 0x2f8a4a, 0xe07a20, 0x7a3a8a, 0xd8d0b8],
  roofs: [0xa05a3a, 0x8a4a30, 0xb8742e, 0x7a8a8e, 0x9a6a4a, 0x6a7a6a],
  accent: [0x2e5a8e, 0x3a7a46, 0xc8a02a, 0x9a2e22, 0xd8d0bc, 0x2a6a74],
  shops: [
    { bg: '#16140f', fg: '#f2c21a', lines: [['OLUWASEUN MOTOR SPARES', 26]] },
    { bg: '#a8241c', fg: cream, lines: [['BOLA TYRE CENTRE', 30]], border: cream },
    { bg: '#2f6e3c', fg: '#f4f0e0', lines: [['MAMA NGOZI PROVISIONS', 26]] },
    { bg: '#1f5a8a', fg: cream, lines: [['ADEBAYO PLANKS & BOARDS', 26]], border: cream },
    { bg: '#e0b020', fg: '#1c1608', lines: [['TEMI ELECTRICALS', 30]] },
    { bg: cream, fg: '#8a1e18', lines: [['IYA SIKIRU BUKA', 32]], border: '#8a1e18' },
    { bg: '#4a2a5a', fg: cream, lines: [['EKO BATTERY WORLD', 28]] },
    { bg: '#16140f', fg: '#e8e0c8', lines: [['SUNDAY & SONS ENGINES', 24]] },
  ],
  small: [
    { bg: '#e0b020', fg: '#1c1608', lines: [['RECHARGE CARDS', 20]] },
    { bg: '#2f6e3c', fg: cream, lines: [['PURE WATER', 24]] },
    { bg: '#a8241c', fg: cream, lines: [['GAS REFILL', 24]] },
    { bg: '#1f5a8a', fg: cream, lines: [['PHONE REPAIR', 22]] },
  ],
  seed: 301,
};

// ----------------------------------------------------------------------------------- families

/** Auto-parts stall: counter of rims, stacked tyres, exhaust pipes on a rack, an umbrella and a painted board. */
const partsStall: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  for (const x of Array.from({ length: r.w }, (_, i) => k.wx(r.x + i))) {
    cbox(k, g, k.paint, 0.9, 0.7, 0.8, x, 0, r.cz, pick([0x6e5440, 0x5a4636, 0x3a3a3c], Math.floor(x) + n));
    // two rims on the counter, a tyre stack on the floor beside it
    for (let i = 0; i < 2; i++)
      drum(k, g, k.metal, 0.22, 0.08, x - 0.2 + i * 0.4, 0.78 + i * 0.09, r.cz, 0xb8bcc0, Math.PI / 2, 0, 12);
    for (let t = 0; t < 3; t++)
      drum(k, g, k.paint, 0.3, 0.2, x + 0.28, 0.12 + t * 0.2, zf - 0.28, 0x1a1a1c, Math.PI / 2, 0, 12);
    // exhaust pipes laid along the back
    ccyl(
      k,
      g,
      k.metal,
      0.045,
      0.045,
      0.9,
      x,
      0.95,
      r.cz - 0.25,
      pick([0x9a9a96, 0x7a5a44, 0xb0aaa0], Math.floor(x) + n),
      6,
      0,
      Math.PI / 2,
    );
  }
  const nu = Math.max(1, Math.ceil(r.w / 2));
  for (let i = 0; i < nu; i++) {
    const x = r.cx - r.w / 2 + (i + 0.5) * (r.w / nu);
    umbrella(
      k,
      g,
      x,
      r.cz - 0.05,
      Math.min(1.3, r.w / nu / 2 + 0.4),
      pick(k.theme.tarps, r.v * 2 + i + n),
      2.1,
    );
  }
  board(k, g, smallBoard(k, r.g + n), Math.min(1.4, r.w - 0.2), 0.3, r.cx, 1.55, zf + 0.04);
};

/** A heap of tyres, rims and bumpers at the edge of the parts market. */
const heap: Family = (k, g, r, n) => {
  let seed = r.g * 31 + n * 7;
  const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const count = r.w * r.h * 4;
  for (let i = 0; i < count; i++) {
    const x = r.cx + (rnd() - 0.5) * (r.w - 0.5);
    const z = r.cz + (rnd() - 0.5) * (r.h - 0.5);
    const tall = Math.floor(rnd() * 4);
    for (let t = 0; t <= tall; t++)
      drum(
        k,
        g,
        k.paint,
        0.28 + rnd() * 0.06,
        0.2,
        x,
        0.12 + t * 0.2,
        z,
        rnd() < 0.8 ? 0x1c1c1e : 0x33302c,
        Math.PI / 2,
        0,
        10,
      );
  }
  for (let i = 0; i < 4; i++)
    drum(
      k,
      g,
      k.metal,
      0.22,
      0.07,
      r.cx + (rnd() - 0.5) * r.w * 0.8,
      0.9 + rnd() * 0.3,
      r.cz + (rnd() - 0.5) * r.h * 0.6,
      0xb0b4b8,
      Math.PI / 2 + (rnd() - 0.5),
      0,
      12,
    );
  cbox(k, g, k.paint, 0.9, 0.18, 0.3, r.cx + 0.2, 0.9, r.cz - 0.1, 0x8a4a2a, 0.4, 0.2, 0.3); // a rusted bumper
};

/** Timber yard: layered stacks of planks, a tarp over one, props and a board. */
const timber: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const woods = [0xb98c5a, 0xa77a4a, 0xc99a68, 0x9a6e42];
  for (let j = 0; j < r.h; j++)
    for (let layer = 0; layer < 5; layer++)
      cbox(
        k,
        g,
        k.paint,
        r.w - 0.18,
        0.2,
        0.82,
        r.cx,
        layer * 0.22,
        k.wz(r.y + j),
        pick(woods, layer + j + n + r.v),
        0,
        0,
        (layer % 2) * 0.01,
      );
  cbox(
    k,
    g,
    k.paint,
    r.w - 0.1,
    0.06,
    r.h - 0.2,
    r.cx + (r.v % 2) * 0.1,
    1.12,
    r.cz,
    pick(k.theme.tarps, r.v + n),
    0,
    0,
    0.06,
  ); // tarp slung over the top
  for (const x of [r.cx - r.w / 2 + 0.15, r.cx + r.w / 2 - 0.15])
    ccyl(k, g, k.metal, 0.05, 0.05, 1.5, x, 0, zf - 0.1, 0x6a4a30, 6);
  board(k, g, smallBoard(k, r.g + n * 3), Math.min(1.6, r.w - 0.2), 0.3, r.cx, 1.35, zf + 0.04);
};

/** Idi-Oro food hall: a long hall under a green zinc roof, columns, a painted produce mural, crates of vegetables out front. */
const foodHall: Family = (k, g, r, n) => {
  const zf = k.wz(r.y1) + 0.5;
  const H = 3.6;
  cbox(k, g, k.concrete, r.w - 0.2, H, r.h - 0.2, r.cx, 0, r.cz, 0xd8d0b8);
  cbox(k, g, k.concrete, r.w + 0.1, 0.4, r.h + 0.1, r.cx, 0, r.cz, 0x8a867c);
  // barrel-ish roof: three tilted green slabs
  for (let i = 0; i < 3; i++) {
    const x = r.cx + (i - 1) * (r.w / 3);
    cbox(k, g, k.zinc, r.w / 3 + 0.08, 0.07, r.h + 0.5, x, H + 0.35, r.cz, 0x3f9a5a, 0, 0, (i - 1) * -0.22);
  }
  cbox(k, g, k.paint, r.w + 0.3, 0.3, r.h + 0.6, r.cx, H - 0.1, r.cz, 0x2a6a40); // fascia
  for (let x = r.x + 0.5; x < r.x + r.w; x += 2)
    ccyl(k, g, k.concrete, 0.16, 0.16, H - 0.4, k.wx(Math.floor(x)), 0, zf + 0.15, 0xe4dcc4, 8); // columns
  cbox(k, g, k.glow, r.w - 1.2, 1.2, 0.04, r.cx, 1.0, zf + 0.02, 0xe8f0c8); // lit hall opening
  board(
    k,
    g,
    k.atlas.board('idioro', 256, 48, {
      bg: '#2f8a4a',
      fg: '#fff6d8',
      lines: [['IDI-ORO FRESH FOOD HUB', 28]],
      border: '#fff6d8',
    }),
    Math.min(6.4, r.w - 1),
    0.7,
    r.cx,
    H - 0.25,
    zf + 0.22,
  );
  // crates of vegetables on the south apron (green, orange, yellow)
  const veg = [0x5aa83a, 0xe08a1e, 0xe8c83a, 0xc83a2a, 0x4a9a4a];
  for (let i = 0; i < r.w * 1.4; i++)
    cbox(k, g, k.paint, 0.42, 0.3, 0.36, r.x ? k.wx(r.x) + i * 0.6 : 0, 0, zf + 0.7, pick(veg, i + n));
};

const FAMILIES: Record<string, Family> = {
  building,
  shop,
  lockup,
  stall,
  kiosk,
  wall,
  house,
  shelter,
  warehouse,
  workshop,
  partsStall,
  heap,
  timber,
  foodHall,
};
const REACH: Record<string, number> = {
  building: 3,
  shop: 3,
  lockup: 1,
  stall: 1,
  kiosk: 2,
  wall: 2,
  house: 2,
  shelter: 2,
  warehouse: 3,
  workshop: 2,
  partsStall: 1,
  heap: 1,
  timber: 2,
  foodHall: 3,
};
export const RUMBLE_MUSHIN_COVER: CoverFactory = communityCover({
  arenaId: ID,
  theme: THEME,
  families: FAMILIES,
  reach: REACH,
});

// ------------------------------------------------------------------------------------------ look

export const RUMBLE_MUSHIN_LOOK: ArenaLook = {
  // hot hazy mainland afternoon: warm ochre light through dust, generator exhaust and cooking smoke
  sky: 0xaa9a84,
  fog: { color: 0x9a8a74, near: 32, far: 112 },
  sun: { color: 0xffd9a8, intensity: 4.4, position: [8, 22, 12] },
  hemi: { sky: 0xe0cdb0, ground: 0x6a5240, intensity: 1.38 },
  envIntensity: 0.5,
  exposure: 1.12,
  floorTint: 0xcfb298,
  pillarTint: 0xe0d0bc,
  softTint: 0xcab8a4,
  slab: 0x6a5242,
  street: 0x3a2a20,
  grit: { tone: 0x7c5a44, dirt: 0x5a3e2e, dust: 0x8e6c54 },
  lamps: [
    [-26.4, 2.4, -8, 0xffb060],
    [26.4, 2.4, 6, 0xffb060],
    [-9, 2.4, -19.4, 0xffaa55],
    [10, 2.4, -19.4, 0xffaa55],
  ],
};
export const RUMBLE_MUSHIN_NIGHT_LOOK: ArenaLook = nightLookOf(RUMBLE_MUSHIN_LOOK, [
  [-26.4, 2.6, -8, 0xffa850],
  [26.4, 2.6, 6, 0xffa850],
  [-26.4, 2.6, 14, 0xffa040],
  [26.4, 2.6, -12, 0xffa040],
  [-9, 2.6, -19.4, 0xffaa55],
  [10, 2.6, -19.4, 0xffaa55],
  [0, 2.6, 19.4, 0xff9a36],
  [-12, 2.6, 19.4, 0xff9a36],
]);

// ------------------------------------------------------------------------------------------ floor

export const RUMBLE_MUSHIN_FLOOR: FloorDrawer = communityFloor(ID, {
  seed: 3101,
  base: [170, 138, 112],
  dust: 'rgba(150,74,40,',
  road: [58, 54, 50],
  pavers: [150, 136, 118],
  tint: {
    ladipo: 'rgba(60,50,48,0.16)',
    ojuwoye: 'rgba(120,70,40,0.10)',
    idiOro: 'rgba(80,120,70,0.07)',
    daleko: 'rgba(170,150,90,0.12)',
    timberRow: 'rgba(140,100,60,0.14)',
    courtyards: 'rgba(110,130,110,0.10)',
  },
});

// ---------------------------------------------------------------------------------------- the set

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const tod = timeOfDay();
  const { wz } = tileWorld(W, H);
  const north = -H / 2;
  const roadGap = (c: number): boolean => Math.abs(c - wz(17.5)) < 3.4;

  // mainland rooftops pressing in on three sides, a tower layer behind them
  shophouseRows(ctx, { north: true, east: true, west: true, seed: 3, close: 0.45, scale: 1.25 });
  skyline(ctx, tod, {
    edge: 'north',
    off: 17,
    depth: 7,
    hMin: 7,
    hMax: 14,
    tints: ['#8a6a50', '#6a7a82', '#9a7a58', '#7a6a6a', '#8a8a74'],
    seed: 3,
  });
  skyline(ctx, tod, {
    edge: 'east',
    off: 9,
    depth: 6,
    hMin: 6,
    hMax: 11,
    tints: ['#8a6a50', '#7a7a6a', '#9a7a58'],
    gap: roadGap,
    seed: 5,
    step: 5.6,
  });
  skyline(ctx, tod, {
    edge: 'west',
    off: 9,
    depth: 6,
    hMin: 6,
    hMax: 11,
    tints: ['#7a6a6a', '#8a8a74', '#8a6a50'],
    gap: roadGap,
    seed: 7,
    step: 5.6,
  });

  // the Red Line: a viaduct behind the north edge, a white-and-red train on it, the green-roofed station
  const zv = north - 11.5;
  viaduct(ctx, { z: zv, x0: -W / 2 - 24, x1: W / 2 + 24, deck: 6.6, width: 5.2, pier: 10, track: true });
  railcars(ctx, { x: -16, z: zv, y: 6.7, cars: 3, body: 0xe8e8e2, stripe: 0xb8322a });
  const sx = 12;
  ctx.statics.add(box(17, 0.4, 7.2, mat(0x2f7a4a, { roughness: 0.6, metalness: 0.2 }), sx, 10.1, zv + 0.4)); // the green roof
  ctx.statics.add(box(17.2, 0.5, 7.4, mat(0xb8322a, { roughness: 0.6 }), sx, 9.7, zv + 0.4)); // red fascia
  ctx.statics.add(box(17, 0.12, 7.2, mat(0xe8e8e2, { roughness: 0.6 }), sx, 9.42, zv + 0.4)); // white band
  for (const dx of [-7.5, -2.5, 2.5, 7.5])
    ctx.statics.add(cyl(0.22, 0.22, 3.2, mat(0xc8c4b8, { roughness: 0.8 }), sx + dx, 8.2, zv + 3.6, 8));
  ctx.statics.add(
    box(
      14,
      2.6,
      0.2,
      mat(0x5a8ab0, { roughness: 0.2, metalness: 0.4, emissive: 0x1a3a58, emissiveIntensity: 0.4 }),
      sx,
      7.9,
      zv - 2.6,
    ),
  ); // glazing
  plaque(ctx, 'cr:mushin:stn', 5.4, 0.9, sx, 9.1, zv + 4.1, 0, lettered('MUSHIN', '#1d6a40', '#f6f2e4'));

  // spill-over of the market beyond the walls: umbrellas, tyre stacks, barrels, a few stalls under tarpaulins
  const tarp = THEME.tarps.map((c) => mat(c, { roughness: 0.88 }));
  [-22, -14, 6, 17, 24].forEach((x, i) =>
    setUmbrella(ctx, x, north - 2.4 - (i % 2) * 0.6, 0.95, tarp[i % 7]!, tarp[(i + 3) % 7]!, { h: 1.95 }),
  );
  [-W / 2 - 2.5, W / 2 + 2.5].forEach((x, side) =>
    [-12, -6, 8, 13].forEach((z, i) =>
      setUmbrella(ctx, x, z + i, 0.9, tarp[(i + side) % 7]!, tarp[(i + 2) % 7]!, { h: 1.95 }),
    ),
  );
  ctx.instance(
    'env_tyrestack',
    [-24, -19, -8, 3, 14, 21].map((x, i) => ({ x, y: STREET, z: north - 1.4 - (i % 3) * 0.3, ry: i * 0.7 })),
  );
  ctx.instance(
    'env_barrel',
    [-W / 2 - 1.3, W / 2 + 1.3].flatMap((x) => [-3, 5, 12].map((z, i) => ({ x, y: STREET, z, ry: i * 1.1 }))),
  );

  // name boards over the pavements (fictional)
  const mk = (key: string, text: string, bg: string, fg: string) =>
    signTexture(key, 512, 128, { bg, fg, lines: [[text, 42]], border: fg, wear: 1.1 }, 71);
  sign(
    ctx,
    mk('mus:a', 'OJUWOYE TRADERS ASSOCIATION', '#2a5a8a', '#f2e6c8'),
    -9,
    3.6,
    north - 3.9,
    4,
    0.9,
    0,
  );
  sign(
    ctx,
    mk('mus:b', 'GRAIN & PROVISIONS  •  DALEKO', '#8a4a1e', '#f2e6c8'),
    14,
    3.6,
    north - 3.9,
    4,
    0.9,
    0,
  );

  lampPost(ctx, -W / 2 - 3.2, -10, Math.PI / 2, 0xffb060);
  lampPost(ctx, W / 2 + 3.2, 9, -Math.PI / 2, 0xffb060);
  mouthTraffic(ctx, layoutOf(ID), { kinds: ['danfo', 'keke', 'taxi', 'danfo'], depth: 3 });
  const streetGap = (z: number): boolean => Math.abs(z - wz(17.5)) < 3.4;
  edgeStalls(ctx, {
    north: true,
    east: true,
    west: true,
    goods: ['grain', 'provisions', 'basins', 'cloth'],
    gap: streetGap,
    seed: 3,
  });
  streetLife(ctx, { n: 14, gap: streetGap });
  ctx.ambient.dust(0, north - 1.4, 18, 1.2);
  ctx.ambient.smokeColumn(-W / 2 - 6, 6, north - 9, { shade: 0.55, size: 1.4, rate: 2.5 });
}

export const RUMBLE_MUSHIN_SET: ArenaSet = {
  build,
  crowd: 0.3,
  crowdEdges: { north: false, east: true, west: true, south: true },
};

// ------------------------------------------------------------------------------------- environment

export function mushinEnv(board: { cols: number; rows: number }): StageEnvironment {
  const { cols, rows } = board;
  return communityEnv(ID, board, {
    seed: 0x0301,
    kinds: ['danfo', 'bus', 'keke', 'car', 'truck'],
    crowds: [
      {
        id: 'westTraders',
        rect: { x0: -5, y0: 4, x1: -1.6, y1: 12 },
        count: 8,
        mood: 'trading',
        priority: 2,
      },
      {
        id: 'eastTraders',
        rect: { x0: cols + 1.6, y0: 22, x1: cols + 5, y1: 32 },
        count: 8,
        mood: 'trading',
        priority: 2,
      },
      {
        id: 'northHagglers',
        rect: { x0: cols * 0.2, y0: -4, x1: cols * 0.45, y1: -1.8 },
        count: 6,
        mood: 'trading',
        facing: 0,
      },
      {
        id: 'stopWaiters',
        rect: { x0: -5.5, y0: rows * 0.5 - 3, x1: -2, y1: rows * 0.5 - 0.5 },
        count: 5,
        mood: 'waiting',
      },
    ],
    lights: [
      {
        at: [-3, rows * 0.3],
        height: 2.4,
        color: 0xffb060,
        size: 1.0,
        strength: 0.6,
        flicker: 'sodium',
        pool: 2.4,
      },
      {
        at: [cols + 3, rows * 0.7],
        height: 2.4,
        color: 0xffb060,
        size: 1.0,
        strength: 0.6,
        flicker: 'sodium',
        pool: 2.4,
      },
      {
        at: [cols * 0.3, -3],
        height: 2.2,
        color: 0xe8f4ff,
        size: 0.7,
        strength: 0.5,
        flicker: 'fluorescent',
        minQuality: 'medium',
      },
    ],
    beds: ['crowd_loop', 'buspark_loop'],
  });
}
