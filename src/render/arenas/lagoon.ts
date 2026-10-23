/**
 * Lagos Lagoon Jetty: a waterfront loading jetty at a misty sunrise.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (LAGOON_LOOK), its surroundings (LAGOON_SET) and its playfield floor (LAGOON_FLOOR).
 *
 * The board is the jetty deck itself, with the lagoon right against its north edge and a narrow
 * creek along the south (camera) edge, kept low: only moored canoes and fender posts there. North,
 * a timber pier on piles runs out into the water with plank canoes tied alongside; a fisherman
 * hauls his net from a canoe; a covered ferry idles further out; a rusted lighter and Makoko-style
 * stilt houses fade into the morning mist. The west wharf is the fish market: an open shed of fish
 * baskets and basins, women traders, drum kilns smoking the catch, nets drying on a line and heaped
 * with their floats. The east wharf is cargo: faded, rusting shipping containers, sacks on pallets,
 * drums, a push-truck, a keke loading, porters. A low sun burns through the haze from the east,
 * throwing long shadows across the wet deck; two sodium lamps are still on from the night.
 */
import { CanvasTexture, DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping } from 'three';
import type { Object3D } from 'three';
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import type { FloorDrawer } from './floorKit';
import { SiteLights } from './roadworksKit';
import { StreetKit, frame, v3 } from './ajegunleKit';
import type { SignSpec } from './ajegunleKit';
import { basin, bucket, drum, jerrycan } from './ajegunleProps';
import {
  Swell,
  WATER,
  canoe,
  canoeHull,
  ferry,
  flotsam,
  lighter,
  stiltHouse,
  waterSheet,
} from './lagoonWater';
import { drawLagoonFloor } from './lagoonFloor';
import { Kit } from './marketKit';
import { pushTruck } from './marketStalls';

/** Top of the side wharves (a little under the arena slab, ~0.2 m above the water). */
const Q = -0.07;

export const LAGOON_LOOK: ArenaLook = {
  // misty sunrise over the lagoon: pale warm haze, a low orange sun from the east, long shadows
  sky: 0xd2c6b2,
  fog: { color: 0xcabda8, near: 13, far: 40 },
  sun: { color: 0xffc890, intensity: 3.6, position: [12, 9, 8] },
  hemi: { sky: 0xe2d8ca, ground: 0x5e564a, intensity: 1.6 },
  envIntensity: 0.65,
  exposure: 1.12,
  floorTint: 0xbcb0a0,
  pillarTint: 0xb6b0a6,
  softTint: 0xbcae9a,
  slab: 0x56544e,
  street: 0x27302c,
  grit: { tone: 0x6c6a5e, dirt: 0x3e443a, dust: 0x868478 },
  // two sodium lamps still burning from the night shift on the wharves
  lamps: [
    [-9.9, 3.1, -5.7, 0xffa850],
    [9.9, 3.1, -5.7, 0xffa850],
  ],
};

const SIGNS: SignSpec[] = [
  { text: 'IKORODU • CMS • MILE 2', bg: '#2a5a8a', ink: '#efe8d8', font: 'sans' },
  { text: 'TGHU 418 220 1', sub: '22G1  MAX GROSS 30,480 KG', bg: '#3a5a6a', ink: '#e6e2d8', font: 'sans' },
  { text: 'MSKU 702 554 8', sub: '45G1  TARE 3,900 KG', bg: '#8a4a2a', ink: '#ece4d4', font: 'sans' },
  { text: 'CAIU 291 007 3', sub: '22G1', bg: '#4a5a3a', ink: '#e6e2d8', font: 'sans' },
  { text: 'ALHAJA BOLA FRESH & SMOKED FISH', sub: 'BONGA • SHAWA • CATFISH', bg: '#c8b48a', ink: '#2a2a3a' },
  { text: 'NO SMOKING ON JETTY', bg: '#a82a22', ink: '#f0e8d8', font: 'sans' },
  { text: 'LIFE JACKET IS COMPULSORY', bg: '#d8b030', ink: '#1a1a1a', font: 'sans' },
];

/** A fishing-net texture (knotted mesh with holes, alpha), tinted by the material colour. */
function netMaterial(ctx: SetContext): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0x4a7a6a, roughness: 0.95, side: DoubleSide, alphaTest: 0.4 });
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#d8d8d8';
    g.lineWidth = 3;
    for (let k = -128; k < 256; k += 16) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 128, 128);
      g.moveTo(k + 128, 0);
      g.lineTo(k, 128);
      g.stroke();
    }
    const tex = new CanvasTexture(c);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    m.map = tex;
    ctx.own(tex);
  }
  ctx.own(m);
  return m;
}

/** A steel shipping container (corrugated walls, doors at the -z end), long axis along z. */
function container(
  kit: StreetKit,
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  color: number,
  mark: number,
  open = false,
): void {
  const g = frame(parent, x, y, z, ry);
  const L = 6.06;
  const B = 2.44;
  const Hc = 2.59;
  // side walls: vertical corrugations (a sheet stood on its edge)
  // walls: corrugated sheets stood on edge (ridges vertical), facing out
  for (const s of [-1, 1])
    kit.sheet(g, L - 0.2, Hc - 0.2, color, (s * B) / 2, Hc / 2, 0, -Math.PI / 2, (-s * Math.PI) / 2);
  kit.sheet(g, B - 0.2, Hc - 0.2, color, 0, Hc / 2, L / 2, -Math.PI / 2, Math.PI);
  kit.box(g, B, 0.08, L, color, 0, Hc - 0.04, 0, 'metal'); // roof
  kit.box(g, B - 0.1, 0.1, L - 0.1, 0x2a2622, 0, 0.05, 0, 'metal'); // floor
  // corner posts and rails, a darker paint, rust on the lower rail
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      kit.box(g, 0.14, Hc, 0.14, 0x2e2a26, (sx * B) / 2, Hc / 2, (sz * L) / 2, 'metal');
  for (const sx of [-1, 1]) {
    kit.box(g, 0.1, 0.16, L, 0x5a3a24, (sx * B) / 2, 0.1, 0, 'metal');
    kit.box(g, 0.1, 0.1, L, 0x2e2a26, (sx * B) / 2, Hc - 0.05, 0, 'metal');
  }
  // doors with locking bars
  if (open) {
    kit.box(g, B / 2, Hc - 0.2, 0.05, color, -B / 2 - 0.55, Hc / 2, -L / 2 - 0.65, 'metal', {
      ry: Math.PI / 2 - 0.3,
    });
    kit.box(g, B / 2, Hc - 0.2, 0.05, color, B / 2 + 0.55, Hc / 2, -L / 2 - 0.65, 'metal', {
      ry: -Math.PI / 2 + 0.3,
    });
    kit.box(g, B - 0.2, Hc - 0.3, 0.02, 0x16130f, 0, Hc / 2, -L / 2 + 0.05, 'matte');
  } else {
    kit.box(g, B - 0.1, Hc - 0.2, 0.05, color, 0, Hc / 2, -L / 2, 'metal');
    for (const bx of [-0.8, -0.35, 0.35, 0.8])
      kit.box(g, 0.04, Hc - 0.3, 0.04, 0x3a3632, bx, Hc / 2, -L / 2 - 0.04, 'metal');
  }
  // stencilled marking on the long side facing the board
  kit.sign(g, mark, 1.9, 0.42, -B / 2 - 0.03, Hc - 0.5, 0.8, false, { ry: -Math.PI / 2 });
}

/** A drum kiln for smoking fish: a cut oil drum on bricks, a grill of fish, a glowing fire door. */
function kiln(kit: StreetKit, parent: Object3D, x: number, z: number, ry: number): void {
  const g = frame(parent, x, Q, z, ry);
  for (const s of [-1, 1]) kit.box(g, 0.2, 0.16, 0.5, 0x7a4a36, s * 0.22, 0.08, 0);
  kit.cyl(g, 0.34, 0.34, 0.62, 0x3a2e26, 0, 0.47, 0, 'metal', 14);
  kit.box(g, 0.22, 0.14, 0.04, 0xff7a2a, 0, 0.3, 0.33, 'glow');
  kit.cyl(g, 0.36, 0.36, 0.03, 0x1a1816, 0, 0.79, 0, 'metal', 14);
  const r = kit.rng;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = i % 3 === 0 ? 0.05 : 0.2;
    kit.box(
      g,
      0.2,
      0.05,
      0.08,
      r() < 0.5 ? 0x6a4628 : 0x4e3420,
      Math.cos(a) * d,
      0.83,
      Math.sin(a) * d,
      'wood',
      { ry: a },
    );
  }
}

/** A woven basket of fish (bonga) on the ground or a table. */
function fishBasket(kit: StreetKit, parent: Object3D, x: number, y: number, z: number, big = false): void {
  const rr = big ? 0.32 : 0.24;
  kit.cyl(parent, rr, rr * 0.75, rr * 0.9, 0x8a6a42, x, y + rr * 0.45, z, 'wood', 12);
  kit.cyl(parent, rr * 1.04, rr * 1.04, 0.04, 0x6a4e30, x, y + rr * 0.9, z, 'wood', 12);
  const r = kit.rng;
  for (let i = 0; i < (big ? 9 : 6); i++)
    kit.box(
      parent,
      0.16,
      0.04,
      0.06,
      r() < 0.6 ? 0xa8acaa : 0x7a6a50,
      x + (r() - 0.5) * rr,
      y + rr * 0.92,
      z + (r() - 0.5) * rr,
      'metal',
      { ry: r() * 3 },
    );
}

/** An iron mooring bollard. */
function bollard(kit: StreetKit, parent: Object3D, x: number, y: number, z: number): void {
  kit.cyl(parent, 0.13, 0.15, 0.32, 0x1e1e1e, x, y + 0.16, z, 'metal', 10);
  kit.cyl(parent, 0.18, 0.18, 0.06, 0x1e1e1e, x, y + 0.34, z, 'metal', 10);
}

/** Timber fender posts and hanging tyres along a quay face (along x at z, facing `dir` = ±1). */
function fenders(
  kit: StreetKit,
  parent: Object3D,
  x0: number,
  x1: number,
  z: number,
  dir: number,
  top: number,
): void {
  for (let x = x0; x <= x1; x += 1.25) {
    kit.box(
      parent,
      0.14,
      top - WATER + 0.3,
      0.14,
      0x3a2e22,
      x,
      (top + WATER - 0.3) / 2,
      z + dir * 0.08,
      'wood',
    );
    if (kit.rng() < 0.55)
      kit.cyl(parent, 0.26, 0.26, 0.16, 0x161514, x + 0.62, top - 0.22, z + dir * 0.12, 'matte', 12, {
        rx: Math.PI / 2,
      });
  }
}

/** The side wharves: concrete aprons with timber edging, puddles and the quay faces. */
function wharves(kit: StreetKit, W: number, H: number): void {
  const p = kit.statics;
  for (const s of [-1, 1]) {
    const cx = s * (W / 2 + 0.8 + 8);
    kit.box(p, 16, Q + 0.31, H + 1.6, 0x6a6862, cx, (Q - 0.31) / 2, 0);
    // timber capping along the water edges
    for (const ez of [-1, 1]) kit.box(p, 16, 0.08, 0.3, 0x4a3a2a, cx, Q + 0.04, ez * (H / 2 + 0.65), 'wood');
    // wet patches and standing water (glossy)
    for (let i = 0; i < 6; i++)
      kit
        .cyl(
          p,
          1,
          1,
          0.006,
          0x5a5a56,
          cx + (kit.rng() - 0.5) * 12,
          Q + 0.004,
          (kit.rng() - 0.5) * 10,
          'metal',
          12,
        )
        .scale.set(0.5 + kit.rng(), 1, 0.3 + kit.rng() * 0.5);
  }
  // the quay faces along the lagoon (north) and the creek (south)
  fenders(kit, p, -W / 2 - 0.6, W / 2 + 0.6, -H / 2 - 0.8, -1, 0);
  fenders(kit, p, -W / 2 - 0.6, W / 2 + 0.6, H / 2 + 0.8, 1, 0);
  fenders(kit, p, W / 2 + 1.2, W / 2 + 12, -H / 2 - 0.8, -1, Q);
  fenders(kit, p, -W / 2 - 12, -W / 2 - 1.2, -H / 2 - 0.8, -1, Q);
  fenders(kit, p, W / 2 + 1.2, W / 2 + 12, H / 2 + 0.8, 1, Q);
  fenders(kit, p, -W / 2 - 12, -W / 2 - 1.2, H / 2 + 0.8, 1, Q);
  for (const x of [-6.2, -2.4, 2.4, 6.2]) {
    bollard(kit, p, x, 0, -H / 2 - 0.55);
    bollard(kit, p, x, 0, H / 2 + 0.55);
  }
  for (const x of [-10.5, -13.5, 10.5, 13.6]) bollard(kit, p, x, Q, -H / 2 - 0.5);
}

/** The timber pier running out into the lagoon. */
function pier(kit: StreetKit, x: number, z0: number, len: number): void {
  const p = kit.statics;
  const w = 1.8;
  const zc = z0 - len / 2;
  kit.box(p, w, 0.1, len, 0x5e4a36, x, Q - 0.05, zc, 'wood');
  for (let k = 0; k < len / 0.25; k++)
    kit.box(
      p,
      w,
      0.012,
      0.21,
      kit.rng() < 0.2 ? 0x4a3a2a : 0x6e5a44,
      x,
      Q + 0.006,
      z0 - 0.12 - k * 0.25,
      'wood',
    );
  for (const s of [-1, 1]) kit.box(p, 0.12, 0.2, len, 0x3e3024, x + (s * w) / 2, Q - 0.12, zc, 'wood');
  for (let k = 0; k <= Math.floor(len / 1.4); k++) {
    const pz = z0 - 0.4 - k * 1.4;
    for (const s of [-1, 1]) {
      const tall = k === Math.floor(len / 1.4) || k % 2 === 1;
      const top = tall ? Q + 0.7 : Q - 0.02;
      kit.cyl(
        p,
        0.1,
        0.12,
        top - (WATER - 0.5),
        0x3a2e22,
        x + s * (w / 2 + 0.05),
        (top + WATER - 0.5) / 2,
        pz,
        'wood',
        7,
      );
    }
  }
  // a ladder down at the end and a lamp post
  for (let k = 0; k < 4; k++)
    kit.box(p, 0.5, 0.04, 0.05, 0x6a6a64, x + 0.3, Q - 0.12 - k * 0.12, z0 - len - 0.05, 'metal');
  kit.cyl(p, 0.05, 0.06, 3.2, 0x4a4a46, x - 0.75, Q + 1.6, z0 - len + 0.3, 'metal', 6);
}

function attachHeadLoad(kit: StreetKit, actor: Object3D | undefined, kind: 'basin' | 'basket'): void {
  if (!actor) return;
  if (kind === 'basin') basin(kit, actor, 0, 1.78, 0, 0xb8b0a0, 0.3, 0x8a9088);
  else fishBasket(kit, actor, 0, 1.76, 0);
  // the cloth pad (osuka) between head and load
  kit.cyl(actor, 0.12, 0.12, 0.05, 0x8a3a2a, 0, 1.76, 0, 'cloth', 8);
}

function build(ctx: SetContext): void {
  const { W, H } = ctx;
  const kit = new StreetKit(ctx, SIGNS, 7301);
  const mk = new Kit(ctx);
  const p = kit.statics;
  const swell = new Swell();
  const L = new SiteLights();

  // ---------------------------------------------------------------- water
  const lagoon = waterSheet(ctx, 0, -H / 2 - 0.8 - 30, 120, 60);
  waterSheet(ctx, 0, H / 2 + 0.8 + 16, 120, 32);
  wharves(kit, W, H);
  flotsam(kit, p, -1.5, -H / 2 - 1.6, 18, 1.2, 34);
  flotsam(kit, p, 9, -H / 2 - 3.5, 8, 3, 14);
  flotsam(kit, p, 0, H / 2 + 1.6, 22, 0.9, 16);

  // ---------------------------------------------------------------- north: pier, canoes, ferry, mist
  pier(kit, -3.6, -H / 2 - 0.8, 5.6);
  canoe(kit, ctx, swell, -5.25, -9.5, 0.03, { len: 6.6, paint: 0x2a5a8a, stripe: 0xd8d0b8, nets: true });
  canoe(kit, ctx, swell, -1.95, -9.2, Math.PI - 0.04, {
    len: 5.6,
    paint: 0x8a2a24,
    stripe: 0xe0d4a0,
    motor: true,
  });
  canoe(kit, ctx, swell, 2.1, -7.15, Math.PI / 2 + 0.02, {
    len: 7.2,
    paint: 0x3a6a4a,
    stripe: 0xd8c860,
    cargo: true,
  });
  canoe(kit, ctx, swell, 6.9, -7.2, -Math.PI / 2 + 0.05, {
    len: 6.0,
    paint: 0x1e1e20,
    stripe: 0xb8b0a0,
    nets: true,
    motor: true,
  });
  canoe(kit, ctx, swell, 2.6, -10.6, 0.45, { len: 5.4, paint: 0x6a7a8a, stripe: 0xa83a2a, nets: true });
  canoe(kit, ctx, swell, -9.6, -10.8, 1.2, { len: 6.0, paint: 0x5a4a3a, stripe: 0x2a6a8a, cargo: true });
  canoe(kit, ctx, swell, 12.6, -10.2, -1.1, { len: 5.0, paint: 0x2a5a8a, stripe: 0xc8b84a });
  ferry(kit, ctx, swell, 7.8, -12.9, Math.PI / 2 + 0.12);
  lighter(kit, ctx, swell, -12.0, -16.5, 0.25);
  const stilts: [number, number, number, number][] = [
    [-22, -19, 0.2, 1],
    [-15.5, -22, -0.1, 1],
    [-6.5, -20.5, 0.15, 0.95],
    [1.5, -23, -0.2, 1],
    [9.5, -19.5, 0.1, 1],
    [16.5, -22.5, -0.15, 1],
    [23.5, -18.5, 0.25, 0.95],
    [-1.5, -28, 0, 1.1],
    [12.5, -29, 0.2, 1.1],
    [-19, -29, -0.2, 1.1],
  ];
  for (const [x, z, ry, s] of stilts) stiltHouse(kit, p, x, z, ry, s);
  canoe(kit, ctx, swell, -12.5, -19.5, 0.6, { len: 5.0, paint: 0x4a3a2a, stripe: 0x8a8a7a });
  canoe(kit, ctx, swell, 5.5, -21.0, -0.4, { len: 5.0, paint: 0x3a4a5a, stripe: 0xa8a090 });

  // ---------------------------------------------------------------- south creek (low only)
  canoe(kit, ctx, swell, -4.4, H / 2 + 1.55, Math.PI / 2 + 0.03, {
    len: 6.4,
    paint: 0x2a5a8a,
    stripe: 0xd8d0b8,
  });
  canoe(kit, ctx, swell, 5.9, H / 2 + 1.6, -Math.PI / 2 - 0.04, {
    len: 5.2,
    paint: 0x8a3a24,
    stripe: 0xe0d4a0,
    nets: true,
  });
  canoe(kit, ctx, swell, 13.5, H / 2 + 2.4, 0.3, { len: 5.0, paint: 0x3a6a4a, stripe: 0xd8c860 });

  // ---------------------------------------------------------------- west wharf: the fish market
  const shed = frame(p, -13.3, Q, -0.6, Math.PI / 2);
  for (const lx of [-3.0, 0, 3.0])
    for (const lz of [-1.4, 1.3])
      kit.box(shed, 0.12, lz > 0 ? 2.4 : 2.9, 0.12, 0x4a3a2a, lx, lz > 0 ? 1.2 : 1.45, lz, 'wood');
  kit.sheet(shed, 6.8, 3.4, 0x9a6a46, 0, 2.7, -0.05, 0.16);
  for (const lz of [-0.6, 0.55]) {
    kit.box(shed, 5.4, 0.06, 0.8, 0x6a5440, 0, 0.82, lz, 'wood');
    for (const lx of [-2.5, 0, 2.5]) kit.box(shed, 0.06, 0.8, 0.7, 0x4a3a2a, lx, 0.4, lz, 'wood');
  }
  for (let k = 0; k < 6; k++) fishBasket(kit, shed, -2.4 + k * 0.95, 0.85, 0.55, k % 2 === 0);
  for (let k = 0; k < 5; k++)
    basin(
      kit,
      shed,
      -2.2 + k * 1.1,
      0.85,
      -0.6,
      [0xb8b0a0, 0x3a6a9a, 0xa83a2a, 0xd8d0c0, 0x4a7a4a][k]!,
      0.3,
      0x9aa0a0,
    );
  kit.sign(shed, 4, 3.2, 0.55, 0, 2.45, 1.38, false);
  // drum kilns smoking the catch
  for (let k = 0; k < 5; k++) kiln(kit, p, -9.7 - (k % 2) * 0.85, 2.0 + k * 0.85, k * 0.7);
  ctx.ambient.smokeColumn(-9.9, Q + 0.9, 2.8, { shade: 0.62, size: 0.9, rate: 5 });
  ctx.ambient.smokeColumn(-10.3, Q + 0.9, 4.6, { shade: 0.62, size: 0.8, rate: 4 });
  ctx.ambient.fire(-9.7, Q + 0.3, 3.7, 0.25);
  for (let k = 0; k < 3; k++) {
    kit.box(p, 0.5, 0.35, 0.5, 0x6a5038, -11.2, Q + 0.18 + k * 0.36, 3.4 + (k % 2) * 0.05, 'wood', {
      ry: 0.2 * k,
    }); // firewood crates
  }
  for (let k = 0; k < 6; k++)
    kit.cyl(
      p,
      0.07,
      0.07,
      0.9,
      0x5a3e26,
      -11.6,
      Q + 0.07 + (k % 3) * 0.13,
      4.6 + Math.floor(k / 3) * 0.14,
      'wood',
      6,
      { rx: Math.PI / 2 },
    );
  // nets drying on a line and heaped with their floats
  const net = netMaterial(ctx);
  for (const [x0, x1, z] of [
    [-12.6, -9.4, -5.2],
    [-15.6, -12.9, -5.6],
  ] as const) {
    for (const x of [x0, x1]) kit.cyl(p, 0.05, 0.06, 2.3, 0x3a2e22, x, Q + 1.15, z, 'wood', 6);
    kit.bar(p, v3(x0, Q + 2.2, z), v3(x1, Q + 2.2, z), 0.01, 0x2a2622, 'matte', 3);
    const geo = new PlaneGeometry(x1 - x0 - 0.2, 1.9, 8, 4);
    const pos = geo.attributes.position!;
    for (let i = 0; i < pos.count; i++)
      pos.setZ(i, Math.sin(pos.getX(i) * 2.4) * 0.12 + (pos.getY(i) < -0.7 ? 0.1 : 0));
    const uv = geo.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / 0.6, (uv.getY(i) * 1.9) / 0.6);
    geo.computeVertexNormals();
    const m = new Mesh(geo, net);
    m.position.set((x0 + x1) / 2, Q + 1.22, z);
    m.castShadow = true;
    m.receiveShadow = true;
    p.add(m);
  }
  for (const [x, z, c] of [
    [-10.2, -3.6, 0x2a4a3e],
    [-11.0, -2.9, 0x3a5a7a],
    [-9.3, 0.6, 0x2a4a3e],
  ] as const) {
    kit.box(p, 1.0, 0.32, 0.8, c, x, Q + 0.16, z, 'cloth', { ry: kit.rng() });
    for (let k = 0; k < 5; k++)
      kit.cyl(
        p,
        0.07,
        0.07,
        0.12,
        k % 2 ? 0xd8d0c0 : 0xc85a2a,
        x + (kit.rng() - 0.5) * 0.8,
        Q + 0.34,
        z + (kit.rng() - 0.5) * 0.6,
        'plastic',
        6,
      );
  }
  for (let k = 0; k < 4; k++)
    fishBasket(kit, p, -9.2 + (k % 2) * 0.55, Q, -1.6 - Math.floor(k / 2) * 0.55, k === 0);
  drum(kit, p, -15.4, Q, 2.6, 0x2a5a8a);
  // a canoe hauled out on trestles for caulking, its paint scraped back
  const hull = frame(p, -12.6, Q, 5.0, Math.PI / 2 + 0.08);
  for (const lz of [-1.6, 1.6]) {
    kit.box(hull, 1.0, 0.08, 0.12, 0x4a3a2a, 0, 0.55, lz, 'wood');
    for (const lx of [-0.4, 0.4]) kit.box(hull, 0.08, 0.55, 0.08, 0x4a3a2a, lx, 0.27, lz, 'wood');
  }
  const hm = new Mesh(canoeHull(5.6, 0.8, 0.4, 0x8a8478, 0xa83a2a), kit.material('wood'));
  hm.position.y = 0.6;
  hm.castShadow = hm.receiveShadow = true;
  hull.add(hm);
  bucket(kit, p, -11.7, Q, 5.6, 0x1a1a1a);
  // coils of mooring rope and stacked fish crates along the waterline
  for (const [x, z] of [
    [-10.2, -5.6],
    [-14.4, -5.9],
    [-9.0, 5.7],
  ] as const) {
    kit.cyl(p, 0.32, 0.34, 0.12, 0x8a7a5a, x, Q + 0.06, z, 'cloth', 14);
    kit.cyl(p, 0.24, 0.26, 0.1, 0x7a6a4a, x, Q + 0.16, z, 'cloth', 14);
  }
  for (let k = 0; k < 6; k++)
    kit.box(
      p,
      0.55,
      0.26,
      0.4,
      k % 3 === 1 ? 0x2a5a8a : 0x8a2a22,
      -15.0 + (k % 3) * 0.6,
      Q + 0.13 + Math.floor(k / 3) * 0.27,
      -2.8,
      'plastic',
    );
  for (let k = 0; k < 5; k++) fishBasket(kit, p, -14.6 + k * 0.55, Q, 3.8 + (k % 2) * 0.45, k % 2 === 0);
  bucket(kit, p, -9.1, Q, -0.9, 0xd8d0c0);
  kit.sign(p, 5, 1.6, 0.36, -9.15, Q + 1.9, -5.2, false);

  // ---------------------------------------------------------------- east wharf: cargo
  container(kit, p, 12.4, Q, -3.2, Math.PI, 0x3a5a6a, 1);
  container(kit, p, 12.9, Q, 3.4, Math.PI, 0x8a4a2a, 2, true);
  container(kit, p, 16.0, Q, -2.4, Math.PI, 0x4a5a3a, 3);
  container(kit, p, 16.0, Q + 2.59, -1.9, Math.PI + 0.03, 0x7a2a26, 2);
  container(kit, p, 18.6, Q, 2.8, Math.PI, 0x5a6a7a, 1);
  mk.bag.put('prop_soft_sacks', { x: 10.0, y: Q, z: -1.2, ry: 0.3 });
  mk.bag.put('prop_soft_sacks', { x: 10.1, y: Q + 0.55, z: -1.15, ry: -0.4, sx: 0.9, sy: 0.9, sz: 0.9 });
  mk.bag.put('prop_soft_sacks', { x: 10.4, y: Q, z: -0.25, ry: 1.2 });
  mk.bag.put('prop_soft_crates', { x: 12.8, y: Q, z: -0.1, ry: 0.2, sx: 0.85, sy: 0.85, sz: 0.85 });
  mk.bag.put('prop_soft_kegs', { x: 9.7, y: Q, z: 5.2, ry: 0.5 });
  mk.bag.put('env_barrel', { x: 11.0, y: Q, z: -5.6, ry: 0.4 });
  mk.bag.put('env_barrel', { x: 11.5, y: Q, z: -5.75, ry: 1.4 });
  mk.bag.put('env_barrel', { x: 11.25, y: Q, z: -5.2, ry: 2.2 });
  pushTruck(mk, { x: 10.0, y: Q, z: 2.6, ry: 0.15 }, 'sacks', 4);
  ctx.vehicles('keke', [{ x: 10.2, y: Q, z: -3.6, ry: Math.PI - 0.2 }], { idle: true });
  for (let k = 0; k < 4; k++)
    jerrycan(kit, p, 14.6 + k * 0.3, Q, 0.4, k * 0.3, k === 2 ? 0x2a5a8a : 0xc8a020);
  kit.sign(p, 6, 2.0, 0.34, 9.4, Q + 1.9, -5.2, false);

  // ---------------------------------------------------------------- lamps: steel posts with sodium heads
  for (const s of [-1, 1]) {
    const x = s * 9.9;
    kit.cyl(p, 0.06, 0.08, 3.4, 0x4a4a46, x, Q + 1.7, -5.5, 'metal', 6);
    kit.box(p, 0.4, 0.12, 0.26, 0x1e1e1e, x, Q + 3.35, -5.75, 'metal');
    kit.box(p, 0.34, 0.03, 0.2, 0xffb060, x, Q + 3.28, -5.75, 'glow');
    L.glow(x, Q + 3.2, -5.75, 2.0, 0xff9a40, 0.65);
  }
  L.glow(-3.6 - 0.75, Q + 3.15, -H / 2 - 0.8 - 5.6 + 0.3, 1.2, 0xffd0a0, 0.4);
  L.build(ctx);
  swell.attach(lagoon);
  mk.finish();
  kit.finish();

  // ---------------------------------------------------------------- the morning's work
  const life = ctx.life;
  const last = (): Object3D | undefined => life.group.children[life.group.children.length - 1];
  const add = (v: Parameters<typeof life.add>[0], load?: 'basin' | 'basket'): void => {
    const n = life.count;
    life.add(v);
    if (load && life.count > n) attachHeadLoad(kit, last(), load);
  };
  add({ kind: 'worker', x: 2.6, y: -0.3, z: -10.6, yaw: 1.9 }); // hauling his net from the canoe
  add({ kind: 'seller', x: -12.3, y: Q, z: -0.6, yaw: Math.PI / 2 });
  add({ kind: 'walker', x: -9.3, y: Q, z: -4.6, yaw: 0, toX: -9.0, toZ: 5.4 }, 'basin');
  add({ kind: 'worker', x: 9.6, y: Q, z: -5.6, yaw: 0, toX: 10.8, toZ: 1.2 }); // porter between canoe and containers
  add({ kind: 'argue', x: 11.0, y: Q, z: 5.4, yaw: 0.4 });
  add({ kind: 'onlooker', x: -3.4, y: Q, z: -11.6, yaw: Math.PI - 0.3 });
  add({ kind: 'seller', x: -11.0, y: Q, z: 2.4, yaw: Math.PI / 2 + 0.2 });
  add({ kind: 'worker', x: -3.5, y: Q, z: -7.0, yaw: Math.PI, toX: -3.7, toZ: -10.6 });
  add({ kind: 'walker', x: -11.2, y: Q, z: 5.6, yaw: Math.PI, toX: -11.4, toZ: -4.8 }, 'basket');
  add({ kind: 'onlooker', x: 9.3, y: Q, z: 1.6, yaw: -Math.PI / 2 });
  add({ kind: 'walker', x: 14.6, y: Q, z: -5.2, yaw: 0, toX: 14.4, toZ: 5.4 });
  add({ kind: 'worker', x: 2.0, y: -0.3, z: -7.15, yaw: 0.2 }); // unloading the cargo canoe
  add({ kind: 'onlooker', x: -9.2, y: Q, z: -2.6, yaw: -1.4 });
  add({ kind: 'onlooker', x: 9.4, y: Q, z: 4.0, yaw: -2.0 });

  // ---------------------------------------------------------------- haze
  ctx.ambient.dust(0, -H / 2 - 4, 26, 3);
  ctx.ambient.smokeColumn(-18, 0.5, -26, { shade: 0.7, size: 1.5, rate: 1.5 });
}

export const LAGOON_SET: ArenaSet = {
  build,
  // a working waterfront: no spectator stands, the traders, porters and fishermen carry the scene
  crowd: 0,
  crowdEdges: { north: false, east: false, west: false, south: false },
};

export const LAGOON_FLOOR: FloorDrawer = drawLagoonFloor;
