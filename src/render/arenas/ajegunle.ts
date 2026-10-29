/**
 * Ajegunle Backstreets: tight residential lanes under an overcast afternoon sky.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (AJEGUNLE_LOOK), its surroundings (AJEGUNLE_SET) and its playfield floor (AJEGUNLE_FLOOR).
 *
 * The arena is a lane hemmed in by weathered compound houses: face-me-I-face-you bungalows and
 * two-storey blocks in faded green, cream, dusty pink and ochre render, painted dado bands, louvres
 * behind burglar bars, curtains in the doorways, rusted roofs weighed down with blocks and tyres,
 * black water tanks and satellite dishes, and a tangle of service cables between timber poles. The
 * north-west corner is the compound's washing area (lines of washing, basins, a blue water drum,
 * yellow jerrycans, two women at the basins); boys play street football between stacked-block goal
 * posts on the east street while neighbours watch; on the west street men argue over a game of
 * draughts under a rusty lean-to beer parlour while a woman fries akara on a coal stove. A newer
 * row of houses closes the view behind. The camera (south) side keeps only the open gutter, a low
 * broken block fence and buckets. Every set follows the rules in `common.ts`.
 */
import type { Object3D } from 'three';
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { STREET } from './common';
import type { FloorDrawer } from './floorKit';
import { CHECK, PLAIN, PRINT, STRIPE, StreetKit, frame, v3 } from './ajegunleKit';
import type { SignSpec } from './ajegunleKit';
import { compoundWall, house } from './ajegunleHouses';
import type { HouseOpts } from './ajegunleHouses';
import {
  basin,
  bench,
  bottleCrate,
  bucket,
  chair,
  coalStove,
  drum,
  gutter,
  jerrycan,
  pole,
  shadeTree,
} from './ajegunleProps';
import { drawAjegunleFloor } from './ajegunleFloor';

export const AJEGUNLE_LOOK: ArenaLook = {
  // flat, humid overcast: a white-grey sky, soft but present shadows, damp grey-green air
  sky: 0xaaa69a,
  fog: { color: 0xa29c8e, near: 14, far: 52 },
  sun: { color: 0xf6ecdc, intensity: 3.0, position: [-6, 16, 7] },
  hemi: { sky: 0xdcd8ce, ground: 0x76685a, intensity: 1.85 },
  envIntensity: 0.45,
  exposure: 1.1,
  floorTint: 0xa8a298,
  pillarTint: 0xb4aca0,
  softTint: 0xbcae9c,
  slab: 0x5c5850,
  street: 0x3a3630,
  grit: { tone: 0x7a7266, dirt: 0x4e463a, dust: 0x8e887a },
  // daylight: no lamps (low quality gets no stronger fill either; the overcast sky carries it)
  lamps: [],
};

const SIGNS: SignSpec[] = [
  { text: 'THIS HOUSE IS NOT FOR SALE', sub: 'BEWARE OF 419', bg: '#b8aa8c', ink: '#5a1e16', font: 'brush' },
  { text: 'POST NO BILL', bg: '#9ca4a8', ink: '#1e1e1c', font: 'brush' },
  { text: "GOD'S GRACE BARBING SALON", sub: 'LOW CUT • GALAXY • DYE', bg: '#2a4a6a', ink: '#e8e0c8' },
  { text: 'IYA RUKAYAT AKARA', sub: 'EVERY EVENING', bg: '#c8b48a', ink: '#3a1e12' },
  { text: 'CHARGING POINT', sub: 'PHONE ₦200', bg: '#6a2a24', ink: '#efe6d0', font: 'sans' },
];

/**
 * Front-row houses north of the lane (facades at z = -8.2, west to east). Paints are chosen strong:
 * the weathering pass halves their saturation, leaving the faded pastel of old Lagos emulsion.
 */
const NORTH: (Partial<HouseOpts> & { x: number })[] = [
  {
    x: -14.4,
    w: 4.6,
    storeys: 2,
    wall: 0x84b08a,
    band: 0x1e4a6e,
    roof: 0xa8643a,
    ground: 'wdw',
    balcony: true,
    tank: true,
    weights: true,
  },
  {
    x: -8.1,
    w: 5.6,
    storeys: 1,
    wall: 0xe6d29a,
    band: 0x8a2a1e,
    roof: 0xb07448,
    ground: 'wdwdw',
    verandah: 0.95,
    weights: true,
    dish: true,
  },
  {
    x: -2.7,
    w: 4.8,
    storeys: 2,
    wall: 0xd89a92,
    band: 0x3a3a46,
    roof: 0x9a968c,
    ground: 'wmw',
    roofKind: 'flat',
    tank: true,
    ac: true,
  },
  {
    x: 4.1,
    w: 5.4,
    storeys: 1,
    wall: 0x8ab0cc,
    band: 0x1e3a6a,
    roof: 0xa05a32,
    ground: 'w..d',
    verandah: 0.9,
    weights: true,
  },
  {
    x: 8.9,
    w: 4.0,
    storeys: 2,
    wall: 0xe0b46a,
    band: 0x5a3a22,
    roof: 0x9a7a62,
    ground: 'dw',
    balcony: true,
    dish: true,
  },
];

/** The newer, taller row behind (only roofs and upper floors show). */
const BACK: (Partial<HouseOpts> & { x: number; z: number })[] = [
  {
    x: -13.0,
    z: -15.8,
    w: 6,
    storeys: 3,
    wall: 0xd8cca8,
    roof: 0x9a968c,
    ground: 'wwww',
    roofKind: 'flat',
    tank: true,
  },
  {
    x: -6.0,
    z: -15.0,
    w: 6,
    storeys: 2,
    wall: 0x9cc0a0,
    roof: 0xa8643a,
    ground: 'wwwww',
    weights: true,
    dish: true,
  },
  {
    x: 0.8,
    z: -15.6,
    w: 6.4,
    storeys: 3,
    wall: 0xe8dcc0,
    roof: 0x9a968c,
    ground: 'wwww',
    roofKind: 'flat',
    tank: true,
    ac: true,
  },
  { x: 7.8, z: -15.0, w: 6, storeys: 2, wall: 0xd8a08a, roof: 0xb07448, ground: 'wwww', weights: true },
  {
    x: 14.6,
    z: -15.8,
    w: 6,
    storeys: 3,
    wall: 0xa8bcd0,
    roof: 0x9a968c,
    ground: 'wwww',
    roofKind: 'flat',
    tank: true,
  },
];

/** Side-street houses: [along z, opts]. East faces west, west faces east. */
const EAST: (Partial<HouseOpts> & { z: number })[] = [
  {
    z: -6.9,
    w: 4.8,
    storeys: 2,
    wall: 0xe2c68a,
    band: 0x6a2a1e,
    roof: 0xa8643a,
    ground: 'wdw',
    balcony: true,
    tank: true,
  },
  {
    z: -1.7,
    w: 5.2,
    storeys: 1,
    wall: 0x9cc4b0,
    band: 0x1e4a3a,
    roof: 0xb07448,
    ground: 'wdwd',
    verandah: 0.8,
    weights: true,
  },
  {
    z: 3.6,
    w: 5.0,
    storeys: 2,
    wall: 0xd8b0a8,
    band: 0x2a3a5a,
    roof: 0x9a968c,
    ground: 'dww',
    ac: true,
    tank: true,
    dish: true,
  },
];
const WEST: (Partial<HouseOpts> & { z: number })[] = [
  {
    z: -6.9,
    w: 4.8,
    storeys: 2,
    wall: 0x9ab8d0,
    band: 0x1e3a5a,
    roof: 0xa05a32,
    ground: 'wdw',
    tank: true,
    dish: true,
  },
  {
    z: -1.6,
    w: 5.2,
    storeys: 1,
    wall: 0xe8d8b0,
    band: 0x7a2a22,
    roof: 0xb07448,
    ground: 'wdwd',
    weights: true,
  },
  {
    z: 3.6,
    w: 5.0,
    storeys: 2,
    wall: 0xb8c890,
    band: 0x3a4a22,
    roof: 0x9a968c,
    ground: 'wwd',
    balcony: true,
  },
];

const DEFAULTS: HouseOpts = { w: 5, d: 6, storeys: 1, wall: 0xc8c0b0, roof: 0x8e6e56, ground: 'wdw' };

/** A washing line between two points with a row of clothes pegged along it. */
function washingLine(kit: StreetKit, a: ReturnType<typeof v3>, b: ReturnType<typeof v3>, seed: number): void {
  const pts = kit.sag(kit.statics, a, b, 0.18, 0.008, 0x2a2622, 8);
  const r = kit.rng;
  const len = a.distanceTo(b);
  const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
  const colors = [0xa83a2a, 0x2a4a7a, 0xd8d0b8, 0x4a6a3a, 0x8a5a9a, 0xc8a040, 0x2a2a2e, 0xb06a4a, 0x5a8aa8];
  for (let s = 0.4; s < len - 0.3; s += 0.45 + r() * 0.3) {
    const t = s / len;
    const i = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
    const f = t * (pts.length - 1) - i;
    const p = pts[i]!.clone().lerp(pts[i + 1]!, f);
    const big = r() < 0.3;
    kit.cloth(
      kit.statics,
      big ? 0.7 + r() * 0.3 : 0.32 + r() * 0.2,
      big ? 0.9 + r() * 0.3 : 0.4 + r() * 0.3,
      colors[Math.floor(r() * colors.length)]!,
      [PRINT, STRIPE, CHECK, PLAIN][(seed + Math.floor(r() * 4)) % 4]!,
      p.x,
      p.y,
      p.z,
      { ry },
    );
  }
}

/** Sandcrete blocks stacked as football goal posts. */
function goalPosts(kit: StreetKit, x: number, z: number, gap: number): void {
  for (const s of [-1, 1]) {
    kit.box(kit.statics, 0.4, 0.2, 0.2, 0x8a867a, x + (s * gap) / 2, STREET + 0.1, z, 'matte', {
      ry: 0.1 * s,
    });
    kit.box(kit.statics, 0.4, 0.2, 0.2, 0x7e7a70, x + (s * gap) / 2, STREET + 0.3, z, 'matte', {
      ry: -0.15 * s,
    });
  }
}

/** The compound washing area in the north-west corner. */
function washingArea(kit: StreetKit): void {
  const S = STREET;
  const p = kit.statics;
  // a cracked concrete washing slab with a standpipe
  kit.box(p, 3.2, 0.08, 1.5, 0x7e7a72, -10.6, S + 0.04, -7.3);
  kit.bar(p, v3(-12.0, S, -7.9), v3(-12.0, S + 0.9, -7.9), 0.03, 0x5a5a56, 'metal', 5);
  kit.bar(p, v3(-12.0, S + 0.9, -7.9), v3(-11.8, S + 0.9, -7.9), 0.025, 0x5a5a56, 'metal', 5);
  drum(kit, p, -12.2, S + 0.08, -7.2, 0x2a5a8a);
  drum(kit, p, -11.6, S + 0.08, -7.75, 0x2a5a8a, 0.8);
  basin(kit, p, -10.6, S + 0.08, -7.05, 0xb8b0a0, 0.38, 0x8a9088);
  basin(kit, p, -9.8, S + 0.08, -7.4, 0x3a6a9a, 0.34, 0x9aa098);
  basin(kit, p, -11.0, S + 0.08, -7.65, 0xa83a2a, 0.3);
  basin(kit, p, -9.3, S + 0.08, -6.95, 0x4a7a4a, 0.26);
  bucket(kit, p, -9.0, S, -7.6, 0xc8b8a0);
  bucket(kit, p, -12.6, S, -6.8, 0x3a3a3e);
  for (let k = 0; k < 5; k++)
    jerrycan(kit, p, -12.9 + k * 0.3, S, -6.55, 0.2 * k, k === 3 ? 0x3a6a4a : 0xc8a020);
  // washing lines from the corner house to timber props at the lane edge
  for (const [x, z] of [
    [-12.8, -6.6],
    [-8.4, -6.6],
    [-12.8, -7.9],
  ] as const)
    kit.cyl(p, 0.05, 0.06, 2.1, 0x4a3a2a, x, S + 1.05, z, 'wood', 6);
  washingLine(kit, v3(-12.8, S + 2.0, -6.6), v3(-8.4, S + 2.0, -6.6), 1);
  washingLine(kit, v3(-12.8, S + 2.0, -7.9), v3(-8.4, S + 2.1, -7.75), 2);
  kit.cyl(p, 0.05, 0.06, 2.2, 0x4a3a2a, -8.4, S + 1.1, -7.75, 'wood', 6);
  // more washing hung across the alley between the first two houses
  washingLine(kit, v3(-11.8, S + 2.3, -8.6), v3(-10.6, S + 2.3, -11.5), 3);
  // and lines strung right across both side streets, house front to timber prop
  for (const [z0, z1, s] of [
    [-4.7, -4.3, -1],
    [-3.3, -3.0, -1],
    [-1.9, -1.6, 1],
    [-0.5, -0.2, 1],
  ] as const) {
    kit.cyl(p, 0.05, 0.06, 2.7, 0x4a3a2a, s * 8.75, S + 1.35, z1, 'wood', 6);
    washingLine(kit, v3(s * 13.35, S + 2.9, z0), v3(s * 8.75, S + 2.65, z1), z0 > -4 ? 4 : 5);
  }
}

/** The draughts players' lean-to beer parlour on the west street and the akara stove. */
function westGathering(kit: StreetKit, ctx: SetContext): void {
  const S = STREET;
  const p = kit.statics;
  // rusty lean-to off the west houses on timber posts
  kit.sheet(p, 4.0, 2.4, 0x9a7458, -12.1, S + 2.45, 0.2, 0.14, -Math.PI / 2);
  for (const z of [-1.6, 2.0]) kit.box(p, 0.09, 2.3, 0.09, 0x4a3a2a, -11.0, S + 1.15, z, 'wood');
  kit.box(p, 0.08, 0.08, 3.8, 0x4a3a2a, -11.0, S + 2.3, 0.2, 'wood');
  // the draughts table, chairs and a bench, crates of empties, a cooler
  const t = frame(p, -11.5, S, 0.4, 0);
  kit.box(t, 0.7, 0.05, 0.7, 0x6a5a44, 0, 0.62, 0, 'wood');
  kit.box(t, 0.5, 0.02, 0.5, 0xd0c4a0, 0, 0.655, 0, 'wood');
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      if ((i + j) % 2)
        kit.box(t, 0.125, 0.01, 0.125, 0x2a2018, -0.1875 + i * 0.125, 0.668, -0.1875 + j * 0.125, 'wood');
  for (const [lx, lz] of [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ] as const)
    kit.box(t, 0.05, 0.6, 0.05, 0x4a3a2a, lx, 0.3, lz, 'wood');
  chair(kit, p, -11.5, S, -0.35, 0, 0xd8d4c8);
  chair(kit, p, -11.5, S, 1.15, Math.PI, 0xa83a2a);
  chair(kit, p, -12.4, S, 0.5, Math.PI / 2, 0x2a5a9a);
  bench(kit, p, -12.85, S, -1.0, Math.PI / 2, 1.6);
  for (let k = 0; k < 3; k++)
    bottleCrate(kit, p, -12.9, S + k * 0.28, 1.7, 0.1 * k, k === 1 ? 0x2a5a3a : 0x8a2a22);
  bottleCrate(kit, p, -12.45, S, 1.75, -0.2, 0x8a2a22);
  // the akara seller's stove and pot of oil, her basin of batter and a stool
  coalStove(kit, p, -9.5, S, 3.3, 0x1a1816);
  basin(kit, p, -9.95, S, 3.85, 0xb8b0a0, 0.3, 0xd8c890);
  kit.box(p, 0.3, 0.3, 0.3, 0x5a4632, -9.0, S + 0.15, 3.75, 'wood');
  ctx.ambient.smokeColumn(-9.5, S + 0.7, 3.3, { shade: 0.8, size: 0.6, rate: 4 });
  // the barber's signboard on the corner house and the phone charging point
  kit.sign(p, 2, 2.4, 0.5, -13.2, S + 3.0, -5.9, false, { ry: Math.PI / 2 });
  kit.sign(p, 4, 1.2, 0.45, -11.1, S + 1.9, -1.62, false, { ry: 0 });
  kit.sign(p, 3, 1.4, 0.4, -10.95, S + 2.0, 2.05, false, { ry: Math.PI / 2 });
}

/** Timber poles and the tangle of service cables over the lanes. */
function cables(kit: StreetKit): void {
  const S = STREET;
  const p = kit.statics;
  const nw = pole(kit, p, -9.1, S, -7.3, 0, 7.2);
  const ne = pole(kit, p, 8.9, S, -7.4, 0, 7.0);
  const w2 = pole(kit, p, -9.2, S, -0.6, Math.PI / 2, 6.6);
  const e2 = pole(kit, p, 9.1, S, 0.6, Math.PI / 2, 6.6);
  const black = 0x161412;
  kit.sag(p, nw[1], ne[0], 0.9, 0.014, black, 14);
  kit.sag(p, nw[0], ne[1], 1.1, 0.012, black, 14);
  kit.sag(p, nw[0], w2[0], 0.6, 0.012, black, 8);
  kit.sag(p, ne[1], e2[1], 0.6, 0.012, black, 8);
  // service drops to the houses (and a few illegal tap-offs)
  const drops: [ReturnType<typeof v3>, ReturnType<typeof v3>][] = [
    [nw[1], v3(-10.2, S + 3.4, -8.25)],
    [nw[1], v3(-6.0, S + 2.9, -8.25)],
    [ne[0], v3(2.2, S + 3.0, -8.25)],
    [ne[0], v3(8.2, S + 5.4, -8.25)],
    [ne[1], v3(13.3, S + 5.0, -8.0)],
    [w2[1], v3(-13.3, S + 2.9, -2.4)],
    [w2[0], v3(-13.3, S + 5.2, 3.0)],
    [e2[0], v3(13.3, S + 2.9, -1.0)],
    [e2[1], v3(13.3, S + 5.4, -6.0)],
  ];
  drops.forEach(([a, b], i) => kit.sag(p, a, b, 0.35 + (i % 3) * 0.15, 0.01, black, 6));
  // a sagging transformer-less junction box on the north-east pole
  kit.box(p, 0.4, 0.5, 0.25, 0x5a5a52, 8.9, S + 3.0, -7.15, 'metal');
}

/** The low camera-side sliver: the open gutter, a broken block fence, buckets and jerrycans. */
function southSide(kit: StreetKit, W: number, H: number): void {
  const S = STREET;
  const p = kit.statics;
  gutter(kit, p, 0, S, H / 2 + 0.75, W + 10, 0, 5);
  // a low, broken sandcrete fence (never above 0.75 m)
  const r = kit.rng;
  for (let x = -W / 2 - 4.5; x < W / 2 + 4.5; x += 0.42) {
    if (Math.abs(x) < 1.4 || (x > 3.2 && x < 4.4)) continue; // gaps
    const h = 0.38 + Math.round(r() * 2) * 0.19;
    kit.box(p, 0.4, h, 0.2, r() < 0.15 ? 0x6e6a62 : 0x8a867c, x, S + h / 2, H / 2 + 1.95, 'matte', {
      rz: (r() - 0.5) * 0.04,
    });
  }
  basin(kit, p, -6.4, S, H / 2 + 1.35, 0x3a6a9a, 0.3);
  bucket(kit, p, -5.8, S, H / 2 + 1.5, 0xc8b8a0);
  jerrycan(kit, p, 5.2, S, H / 2 + 1.4, 0.4);
  jerrycan(kit, p, 5.55, S, H / 2 + 1.45, -0.2);
  bottleCrate(kit, p, -2.6, S, H / 2 + 1.45, 0.3);
}

function attachBall(ctx: SetContext, actor: Object3D | undefined, kit: StreetKit): void {
  if (!actor) return;
  const ball = kit.cyl(actor, 0.11, 0.11, 0.2, 0xd8d4c8, 0, 0.11, 0.42, 'plastic', 10, { rz: Math.PI / 2 });
  const spot = kit.box(actor, 0.12, 0.12, 0.215, 0x1a1a1a, 0, 0.11, 0.42, 'plastic');
  ball.castShadow = true;
  // dribbled: rolls forward, nudged ahead and back with each touch
  ball.onBeforeRender = () => {
    const t = performance.now() / 1000;
    const touch = Math.abs(Math.sin(t * 3.2));
    ball.position.z = 0.32 + touch * 0.28;
    spot.position.z = ball.position.z;
    ball.rotation.x = t * 9;
    spot.rotation.x = t * 9;
  };
  void ctx;
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const S = STREET;
  const kit = new StreetKit(ctx, SIGNS, 7201);
  const p = kit.statics;

  // ground: the lanes are packed earth and broken concrete, darker than the arena slab
  kit.box(p, 60, 0.02, 40, 0x8e877a, 0, S + 0.005, -6);
  for (let i = 0; i < 26; i++) {
    const x = (kit.rng() - 0.5) * 34;
    const z = -16 + kit.rng() * 26;
    if (Math.abs(x) < 8.6 && Math.abs(z) < 6.6) continue;
    kit.box(
      p,
      1 + kit.rng() * 3,
      0.03,
      0.8 + kit.rng() * 2,
      kit.rng() < 0.5 ? 0x8a867c : 0x6a5a48,
      x,
      S + 0.012,
      z,
      'matte',
      { ry: kit.rng() },
    );
  }

  // houses
  for (const o of NORTH) house(kit, p, o.x, S, -8.2, 0, { ...DEFAULTS, ...o });
  for (const o of BACK) house(kit, p, o.x, S, o.z, 0, { ...DEFAULTS, ...o, d: 6 });
  for (const o of EAST) house(kit, p, 13.4, S, o.z, -Math.PI / 2, { ...DEFAULTS, ...o, d: 5.5 });
  for (const o of WEST) house(kit, p, -13.4, S, o.z, Math.PI / 2, { ...DEFAULTS, ...o, d: 5.5 });
  // a compound wall and gate closing the alley between the two-storey block and its neighbour
  compoundWall(kit, p, 0.55, S, -9.0, 0, 1.7, 2.0, 0xa8a090, 0, 0x4a3426, 1.3);
  // painted warnings on the walls
  kit.sign(p, 0, 2.5, 0.58, 4.2, S + 1.75, -8.15);
  kit.sign(p, 1, 0.6, 0.17, 0.23, S + 1.4, -8.95);

  washingArea(kit);
  westGathering(kit, ctx);
  // shade trees: the elders' almond tree over the draughts table, a mango in the north lane
  shadeTree(kit, p, -10.8, S, -0.6, 4.9, 1.8);
  shadeTree(kit, p, 6.3, S, -8.0, 5.4, 1.6);
  cables(kit);
  southSide(kit, W, H);

  // the football street: block goal posts, a bench of spectators against the houses
  goalPosts(kit, 10.6, -3.2, 1.5);
  goalPosts(kit, 10.6, 4.3, 1.5);
  bench(kit, p, 12.75, S, -0.4, -Math.PI / 2, 2.0);
  chair(kit, p, 12.7, S, 2.0, -Math.PI / 2 - 0.3, 0xa83a2a);
  for (let k = 0; k < 3; k++) jerrycan(kit, p, 12.95, S, -3.4 + k * 0.32, 0, 0xc8a020);
  // a lane-side sitting spot by the north-east house, plastic chairs, drums
  chair(kit, p, 7.2, S, -7.2, 0.4, 0xd8d4c8);
  drum(kit, p, 5.9, S, -7.5, 0x8a3a2a, 0.8);
  basin(kit, p, 1.3, S, -7.0, 0xb8b0a0, 0.3);
  bucket(kit, p, -4.2, S, -7.0, 0x2a5a8a);
  // a yellow taxi parked nose-in at the end of the east street, okadas on the west street
  ctx.vehicles('taxi', [{ x: 12.15, y: S, z: -6.9, ry: Math.PI + 0.04 }]);
  ctx.vehicles('okada', [
    { x: -9.6, y: S, z: -3.6, ry: 0.3 },
    { x: -9.7, y: S, z: 5.2, ry: Math.PI - 0.4 },
  ]);
  if (ctx.quality.level === 'medium' || ctx.quality.level === 'high')
    ctx.instance('env_kiosk', [{ x: -9.8, y: S, z: -5.4, ry: Math.PI / 2, sx: 0.8, sy: 0.8, sz: 0.8 }]);
  ctx.instance('env_tyrestack', [{ x: 12.6, y: S, z: 5.6, ry: 0.4, sx: 0.8, sy: 0.6, sz: 0.8 }]);
  ctx.instance('env_barrel', [{ x: -12.9, y: S, z: -3.4, ry: 0.6 }]);
  kit.finish();

  // --- street life (most important first: the quality budget drops the tail)
  const L = ctx.life;
  const last = (): Object3D | undefined => L.group.children[L.group.children.length - 1];
  const before = L.count;
  L.add({ kind: 'walker', x: 10.4, y: S, z: -2.3, yaw: 0, toX: 10.7, toZ: 3.4 }); // the dribbler
  if (L.count > before) attachBall(ctx, last(), kit);
  L.add({ kind: 'walker', x: 11.2, y: S, z: 2.8, yaw: Math.PI, toX: 10.9, toZ: -2.2 }); // chasing back
  L.add({ kind: 'onlooker', x: 10.6, y: S, z: -3.55, yaw: 0.1 }); // keeper
  L.add({ kind: 'seller', x: -10.5, y: S, z: -7.25, yaw: Math.PI / 2 }); // two women at the basins
  L.add({ kind: 'argue', x: -11.5, y: S, z: 0.4, yaw: 0 }); // over the draughts board
  L.add({ kind: 'onlooker', x: 12.6, y: S, z: 0.6, yaw: -Math.PI / 2 - 0.2 });
  L.add({ kind: 'onlooker', x: -10.4, y: S, z: 1.6, yaw: -2.2 });
  L.add({ kind: 'walker', x: -6.5, y: S, z: -7.0, yaw: Math.PI / 2, toX: 6.0, toZ: -7.0 });
  L.add({ kind: 'onlooker', x: 12.7, y: S, z: 2.6, yaw: -Math.PI / 2 + 0.3 });
  L.add({ kind: 'onlooker', x: -9.0, y: S, z: 3.9, yaw: -0.6 }); // the akara seller
  L.add({ kind: 'walker', x: -9.8, y: S, z: -2.4, yaw: 0, toX: -9.9, toZ: 4.6 });
  L.add({ kind: 'onlooker', x: 3.3, y: S, z: -7.45, yaw: 0.2 }); // at her door
  L.add({ kind: 'onlooker', x: -12.3, y: S, z: -1.4, yaw: 1.2 });
  L.add({ kind: 'walker', x: 9.4, y: S, z: 5.0, yaw: 0, toX: 9.4, toZ: -6.0 });

  // atmosphere: dust kicked up by the football, akara smoke, refuse smouldering beyond the roofs
  ctx.ambient.dust(10.9, 0, 2.2, 8);
  ctx.ambient.dust(0, -7.0, 14, 1.2);
  ctx.ambient.smokeColumn(5.5, S + 1.5, -19, { shade: 0.45, size: 1.6, rate: 2 });
}

export const AJEGUNLE_SET: ArenaSet = {
  build,
  // the neighbourhood carries the scene (StreetLife); a few neighbours watch from the camera side
  crowd: 0.3,
  crowdEdges: { north: false, east: false, west: false, south: true },
};

export const AJEGUNLE_FLOOR: FloorDrawer = drawAjegunleFloor;
