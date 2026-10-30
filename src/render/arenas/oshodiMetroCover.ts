/**
 * Oshodi Transport Metropolis - the board's permanent cover drawn as the real things it is (presentation only;
 * which tile is what comes from `oshodiMetroCoverMap.ts`, collision from the sim layout). Twenty-three families:
 *
 *   interchange   terminal wings with glass bands and a big name board, the ticket hall, parked buses in the
 *                 bays, bay shelters, the huge canopy columns of the plaza
 *   skywalk       round piers with a flared head, a landing and a stair stub; the stair tower up to the walkway
 *   junction      kerb islands carrying the big direction sign, the signal gantries with their cabinets
 *   railway       the rail-bridge abutments the two track lanes run in and out of (arch openings, danger
 *                 boards), the signal cabin, platform posts, the commuter-rail station concourse
 *   trading       shopfronts with fascias, shutters and awnings, ticket kiosks, market stalls, container shops,
 *                 occupied buildings (tall on the far perimeter), low lock-ups on the camera edge
 *   cappa works   workshops with roller shutters, skips, the generator house, the Ground's pavilion, a wall
 *
 * Everything is baked by `CoverBuilder` into a few merged meshes (vertex colours on shared materials, one sign
 * atlas), so the whole board's cover costs about a dozen draw calls per visible chunk. A group fades as a whole
 * when anything worth seeing stands behind it (the same dither as the pillars).
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import { assets } from '../assets/library';
import { createVehicleModel } from '../assets/vehicles';
import { artRng, concreteTexture, corrugatedTexture } from '../textures';
import type { BoardCover } from './boardCover';
import { CoverBuilder } from './boardCover';
import { OSHODI_COVER_REACH, oshodiCoverGroups } from './oshodiMetroCoverMap';
import type { OshodiCoverGroup } from './oshodiMetroCoverMap';
import {
  CABIN_BOARD,
  CONTAINER_BOARDS,
  GEN_HOUSE_BOARD,
  KIOSK_BOARDS,
  PAVILION_BOARD,
  PLATFORM_BOARD,
  PORTAL_BOARD,
  POSTERS,
  ROUTE_CARDS,
  SHOP_NAMES,
  SIGN_TOWER_BOARD,
  SignAtlas,
  STATION_BOARD,
  TERMINAL_BOARD,
  TERMINAL_GATES,
  TICKET_HALL,
  WORKSHOP_BOARDS,
} from './oshodiMetroSigns';
import type { UvRect } from './oshodiMetroSigns';

const VEHICLE_SCALE = 1.32;
const PLASTER = [0xc8b48e, 0x9fb0a6, 0xd2c6a6, 0xb88a64, 0x8ea0b4, 0xcfa88a, 0xa6a07c];
const KIOSK_PAINT = [0x2e5a8e, 0x3a7a46, 0xc8a02a, 0x9a2e22, 0xd8d0bc, 0x2a6a74];
const CONTAINER_PAINT = [0x5a8aaa, 0xb2583a, 0x6a9a6a, 0xc0ae78];
const TARP = [0xa8442e, 0xc8a844, 0x2e5a86, 0x3a744a, 0xd2ccb8];
const CONCRETE = 0xb6b2a8;
const CONCRETE_DARK = 0x8a867c;
const STEEL = 0x4a4e52;
const YELLOW = 0xe0ae28;
const RAIL_BLUE = 0x16212c;

interface Kit {
  b: CoverBuilder;
  atlas: SignAtlas;
  paint: Material;
  metal: Material;
  concrete: Material;
  zinc: Material;
  signs: Material;
  glow: Material;
  wx: (x: number) => number;
  wz: (y: number) => number;
  r: () => number;
}

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const s = new Vector3(1, 1, 1);

function at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): Matrix4 {
  q.setFromEuler(e.set(rx, ry, rz, 'YXZ'));
  return m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz));
}

/** A box whose UVs tile once per world unit (textured materials do not stretch). */
function bx(w: number, h: number, d: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const uv = g.attributes.uv!;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f]![0], uv.getY(i) * dims[f]![1]);
    }
  return g;
}

/** Box with its BOTTOM at y0. */
function box(
  k: Kit,
  g: number,
  material: Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y0: number,
  z: number,
  color: number,
  ry = 0,
  rx = 0,
): void {
  k.b.add(g, bx(w, h, d), material, at(x, y0 + h / 2, z, ry, rx), color);
}

function cyl(
  k: Kit,
  g: number,
  material: Material,
  rt: number,
  rb: number,
  h: number,
  x: number,
  y0: number,
  z: number,
  color: number,
  seg = 10,
  zs = 1,
): void {
  k.b.add(g, new CylinderGeometry(rt, rb, h, seg), material, at(x, y0 + h / 2, z, 0, 0, 0, 1, 1, zs), color);
}

/** A sign board (atlas rectangle) facing direction `ry` (0 = south, towards the camera). */
function board(
  k: Kit,
  g: number,
  uv: UvRect,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
): void {
  const geo = new PlaneGeometry(w, h);
  const a = geo.attributes.uv!;
  for (let i = 0; i < a.count; i++)
    a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  k.b.add(g, geo, k.signs, at(x, y, z, ry), 0xffffff);
}

const pick = <T>(list: readonly T[], i: number): T => list[((i % list.length) + list.length) % list.length]!;
const centre = (k: Kit, grp: OshodiCoverGroup): { cx: number; cz: number; w: number; d: number } => ({
  cx: (k.wx(grp.x0) + k.wx(grp.x1)) / 2,
  cz: (k.wz(grp.y0) + k.wz(grp.y1)) / 2,
  w: grp.x1 - grp.x0 + 1,
  d: grp.y1 - grp.y0 + 1,
});
const hasOf = (grp: OshodiCoverGroup): Set<string> => new Set(grp.tiles.map(([x, y]) => `${x},${y}`));

// ---------------------------------------------------------------------------------------- trading

/** Far-frontage palette: stronger and more varied than the street plaster, so the skyline is not one grey wall. */
const FAR_PALETTE = [0xb5654a, 0x4a8a8c, 0xd0a040, 0xe4ddd0, 0x7a8aa0, 0x9a4a32, 0x8aa070, 0xc89a78];
type FarStyle = 'plaster' | 'glass' | 'balcony' | 'billboard';
const FAR_STYLES: readonly FarStyle[] = [
  'plaster',
  'balcony',
  'glass',
  'billboard',
  'balcony',
  'plaster',
  'glass',
];

/**
 * Occupied buildings. The far north perimeter is the skyline's first layer: every three or four tiles a different
 * house with its own height (4.2 to 8 m, some stepping back at the top), colour and character - plastered blocks
 * with window grids, balcony-slab blocks with railings, blue glass curtain-wall blocks, and blocks carrying a
 * rooftop billboard. The side edges are lower, plainer houses.
 */
function building(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  const has = hasOf(grp);
  const far = grp.y0 === 0;
  for (const [x, y] of grp.tiles) {
    const house = Math.floor((x + (far ? 0 : y)) / (far ? 4 : 3));
    const style: FarStyle = far ? FAR_STYLES[(house * 3 + n) % FAR_STYLES.length]! : 'plaster';
    const c = far ? pick(FAR_PALETTE, house * 5 + n * 3) : pick(PLASTER, house * 5 + n);
    const h = far ? 4.2 + ((house * 7 + n) % 5) * 0.8 : 3.0 + (house % 3) * 0.35;
    const body = style === 'glass' ? 0x486a86 : c;
    const setback = far && h > 6.6; // the tall ones step back at the top
    const hb = setback ? h - 1.4 : h;
    box(k, g, k.concrete, 1, hb, 1, k.wx(x), 0, k.wz(y), body);
    if (setback) box(k, g, k.concrete, 0.8, 1.4, 0.8, k.wx(x), hb, k.wz(y) - 0.08, body);
    box(k, g, k.concrete, 1.0, 0.16, 1.0, k.wx(x), hb + (setback ? 1.4 : 0), k.wz(y), 0x7a7468);
    if (!has.has(`${x},${y + 1}`)) {
      const zf = k.wz(y) + 0.5;
      const floors = Math.floor(hb / 1.4);
      for (let fl = 0; fl < floors; fl++) {
        const y0 = 0.9 + fl * 1.4;
        if (style === 'glass') {
          box(k, g, k.glow, 0.96, 0.62, 0.03, k.wx(x), y0 - 0.05, zf, 0x6c9cc0); // lit glass band
          box(k, g, k.metal, 0.06, 0.7, 0.05, k.wx(x) - 0.48, y0 - 0.1, zf + 0.01, STEEL); // mullion
        } else if (style === 'balcony') {
          box(k, g, k.concrete, 1.0, 0.1, 0.28, k.wx(x), y0 - 0.55, zf + 0.14, 0xd8d2c4); // slab
          box(k, g, k.metal, 1.0, 0.34, 0.03, k.wx(x), y0 - 0.45, zf + 0.28, 0x3a3a38); // railing
          box(k, g, k.paint, 0.4, 0.78, 0.03, k.wx(x), y0 - 0.5, zf, 0x1c1a18); // doorway behind it
        } else {
          box(k, g, k.paint, 0.46, 0.5, 0.04, k.wx(x), y0, zf, 0x1c1a18); // window
          box(k, g, k.metal, 0.5, 0.06, 0.12, k.wx(x), y0 - 0.05, zf + 0.04, 0x6a6a66); // sill and bars
        }
      }
      if ((x * 7 + y) % 5 === 0)
        box(k, g, k.metal, 0.34, 0.26, 0.2, k.wx(x) + 0.2, hb - 0.6, zf + 0.1, 0xb8b4aa);
    }
    if (far && style === 'billboard' && x % 3 === 0 && !has.has(`${x},${y + 1}`)) {
      // a rooftop billboard on two posts, facing the camera
      const top = hb + (setback ? 1.4 : 0) + 0.16;
      for (const dx of [-0.3, 0.3])
        cyl(k, g, k.metal, 0.03, 0.03, 0.9, k.wx(x) + dx, top, k.wz(y) + 0.3, STEEL, 6);
      box(k, g, k.paint, 1.0, 0.62, 0.05, k.wx(x), top + 0.9, k.wz(y) + 0.3, 0x16140f);
      board(
        k,
        g,
        k.atlas.board(`poster${(x + n) % POSTERS.length}`, 96, 120, pick(POSTERS, x + n)),
        0.9,
        0.55,
        k.wx(x),
        top + 0.9,
        k.wz(y) + 0.34,
      );
    } else if (far && (x * 3 + n) % 7 === 0) {
      cyl(k, g, k.paint, 0.3, 0.3, 0.55, k.wx(x), hb + (setback ? 1.4 : 0) + 0.16, k.wz(y), 0x1a1a1c, 12); // water tank
    }
  }
}

function lockup(k: Kit, g: number, grp: OshodiCoverGroup): void {
  for (const [x, y] of grp.tiles) {
    box(
      k,
      g,
      k.concrete,
      1,
      1.05,
      1,
      k.wx(x),
      0,
      k.wz(y),
      pick([0x8a7a64, 0x7a8478, 0x9a8466, 0x6e6a60], Math.floor(x / 3)),
    );
    box(
      k,
      g,
      k.zinc,
      1.04,
      0.05,
      1.08,
      k.wx(x),
      1.05,
      k.wz(y),
      pick([0x8a6a52, 0x7a7a74, 0x6a5444], x + y),
      0,
      -0.1,
    );
  }
}

function shop(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  const has = hasOf(grp);
  const wallC = pick(PLASTER, n * 2 + 3);
  const H = 2.6;
  for (const [x, y] of grp.tiles) {
    box(k, g, k.concrete, 1, H, 1, k.wx(x), 0, k.wz(y), wallC);
    box(k, g, k.concrete, 1.0, 0.16, 1.0, k.wx(x), H, k.wz(y), 0x8a8276);
  }
  const runs: { y: number; x0: number; x1: number }[] = [];
  for (let y = grp.y0; y <= grp.y1; y++) {
    let start = -1;
    for (let x = grp.x0; x <= grp.x1 + 1; x++) {
      const front = has.has(`${x},${y}`) && !has.has(`${x},${y + 1}`);
      if (front && start < 0) start = x;
      if (!front && start >= 0) {
        runs.push({ y, x0: start, x1: x - 1 });
        start = -1;
      }
    }
  }
  runs.forEach((run, i) => {
    const w = run.x1 - run.x0 + 1;
    const cx = (k.wx(run.x0) + k.wx(run.x1)) / 2;
    const zf = k.wz(run.y) + 0.5;
    for (let x = run.x0; x <= run.x1; x++) {
      box(k, g, k.paint, 0.8, 1.6, 0.04, k.wx(x), 0.02, zf, 0x16120e);
      box(k, g, k.zinc, 0.84, 0.5 + ((x * 5 + n) % 3) * 0.12, 0.05, k.wx(x), 1.12, zf + 0.02, 0x7a8288);
      box(k, g, k.paint, 0.18, 0.5, 0.05, k.wx(x) - 0.25, 0.55, zf + 0.04, pick(KIOSK_PAINT, x + n));
    }
    box(k, g, k.paint, w - 0.04, 0.5, 0.05, cx, 1.96, zf + 0.03, 0x2a2420);
    board(
      k,
      g,
      k.atlas.board(`shop${(n * 3 + i) % SHOP_NAMES.length}`, 508, 96, pick(SHOP_NAMES, n * 3 + i)),
      w - 0.1,
      Math.min(0.46, (w - 0.1) * 0.19 + 0.12),
      cx,
      2.21,
      zf + 0.06,
    );
    box(k, g, k.zinc, w, 0.04, 0.42, cx, 1.86, zf + 0.15, 0x8a7a6a, 0, 0.18);
  });
}

function kiosk(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  for (const [x, y] of grp.tiles) {
    const c = pick(KIOSK_PAINT, x + y + n);
    const cx = k.wx(x);
    const cz = k.wz(y);
    box(k, g, k.paint, 0.86, 1.9, 0.86, cx, 0, cz, c);
    box(k, g, k.paint, 0.9, 0.08, 0.9, cx, 1.9, cz, 0x2a2824);
    box(k, g, k.paint, 0.6, 0.5, 0.04, cx, 0.95, cz + 0.45, 0x14110e); // the serving window
    box(k, g, k.metal, 0.7, 0.05, 0.3, cx, 0.92, cz + 0.55, 0xb8b0a0); // counter
    board(
      k,
      g,
      k.atlas.board(`kiosk${(x + n) % KIOSK_BOARDS.length}`, 256, 64, pick(KIOSK_BOARDS, x + n)),
      0.8,
      0.22,
      cx,
      1.62,
      cz + 0.455,
    );
  }
}

function stall(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  for (const [x, y] of grp.tiles) {
    const cx = k.wx(x);
    const cz = k.wz(y);
    box(k, g, k.paint, 0.88, 0.85, 0.7, cx, 0, cz + 0.08, 0x6e5440);
    for (let i = 0; i < 4; i++)
      box(
        k,
        g,
        k.paint,
        0.18,
        0.16,
        0.18,
        cx - 0.3 + i * 0.2,
        0.85,
        cz + 0.1,
        pick([0xd0442a, 0xe8c82a, 0x3a8a46, 0x2e5a8e], i + x),
      );
    for (const [dx, dz] of [
      [-0.42, -0.34],
      [0.42, -0.34],
      [-0.42, 0.42],
      [0.42, 0.42],
    ] as const)
      cyl(k, g, k.metal, 0.025, 0.025, 1.6, cx + dx, 0, cz + dz, 0x5a5a56, 6);
    box(k, g, k.paint, 1.0, 0.04, 1.0, cx, 1.6, cz + 0.04, pick(TARP, x * 3 + y + n), 0, -0.12);
  }
}

function container(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  const { cx, w } = centre(k, grp);
  for (let y = grp.y0; y <= grp.y1; y++) {
    const cz = k.wz(y);
    const tint = pick(CONTAINER_PAINT, n + y);
    box(k, g, k.zinc, w - 0.08, 1.3, 0.92, cx, 0.08, cz, tint);
    box(
      k,
      g,
      k.paint,
      Math.min(0.9, w - 0.2),
      1.0,
      0.04,
      cx + w / 2 - Math.min(0.75, w / 2),
      0.1,
      cz + 0.46,
      0x14110e,
    );
    box(k, g, k.metal, w - 0.04, 0.05, 1.12, cx, 1.38, cz + 0.08, 0x6a5e52);
    board(
      k,
      g,
      k.atlas.board(`cont${(n + y) % CONTAINER_BOARDS.length}`, 256, 80, pick(CONTAINER_BOARDS, n + y)),
      Math.min(1.5, w - 0.3),
      0.42,
      cx - (w > 1 ? 0.1 : 0),
      0.8,
      cz + 0.47,
    );
  }
}

// ------------------------------------------------------------------------------------ interchange

/** A terminal wing: a hall with a lit glass band, a deep concrete canopy edge and the big name board. */
function terminal(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  const { cx, cz, w, d } = centre(k, grp);
  const annex = d >= 3; // the back-of-house annex is plain; the wings and the ticket hall face the plaza
  const H = annex ? 3.8 : 3.5;
  const zf = k.wz(grp.y1) + 0.5;
  box(k, g, k.concrete, w - 0.04, H, d - 0.04, cx, 0, cz, annex ? 0xa8a49a : CONCRETE);
  box(k, g, k.concrete, w, 0.2, d, cx, H, cz, CONCRETE_DARK); // roof slab
  if (annex) {
    for (let i = 0; i < Math.floor(w); i++)
      box(k, g, k.paint, 0.5, 0.7, 0.04, cx - w / 2 + 0.5 + i, 2.0, zf, 0x1c1a18);
    for (let i = 0; i < 3; i++)
      box(k, g, k.metal, 0.8, 0.5, 0.7, cx - w / 2 + 1.2 + i * 1.8, H + 0.2, cz, 0xb8b4aa); // roof plant
    return;
  }
  box(k, g, k.glow, w - 0.3, 1.1, 0.05, cx, 1.0, zf + 0.0, 0x7aa6c8); // lit glass band
  for (let i = 0; i <= Math.floor(w); i++)
    box(k, g, k.metal, 0.07, 1.2, 0.08, cx - w / 2 + i, 1.0, zf + 0.03, STEEL); // mullions
  box(k, g, k.concrete, w + 0.1, 0.22, 0.4, cx, 2.55, zf + 0.2, CONCRETE_DARK); // canopy edge (a shallow overhang)
  if (d === 1) {
    board(
      k,
      g,
      k.atlas.board('ticketHall', 320, 96, TICKET_HALL),
      Math.min(2.4, w - 0.3),
      0.7,
      cx,
      3.05,
      zf + 0.04,
    );
    return;
  }
  board(
    k,
    g,
    k.atlas.board('terminal', 512, 144, TERMINAL_BOARD),
    w - 0.3,
    (w - 0.3) * 0.28,
    cx,
    3.0,
    zf + 0.04,
  );
  board(k, g, k.atlas.board('gates', 320, 80, TERMINAL_GATES), w - 1.2, 0.5, cx, 2.1, zf + 0.06, 0);
  if (n % 2 === 0) cyl(k, g, k.paint, 0.35, 0.35, 0.7, cx - w / 2 + 0.8, H + 0.2, cz, 0x1a1a1c, 12); // roof tank
}

/** Parked buses in the bays: a bus is two tiles long (the GLB Danfo, scaled to the playable size). */
function buses(
  k: Kit,
  g: number,
  grp: OshodiCoverGroup,
  n: number,
  bus: ReturnType<typeof createVehicleModel> | null,
): void {
  const root = bus?.root;
  let i = 0;
  for (let y = grp.y0; y <= grp.y1; y++)
    for (let x = grp.x0; x + 1 <= grp.x1; x += 2) {
      const cx = (k.wx(x) + k.wx(x + 1)) / 2 + (k.r() - 0.5) * 0.06;
      const cz = k.wz(y) + (k.r() - 0.5) * 0.06;
      const ry = (x + y + n) % 3 === 0 ? Math.PI : 0;
      if (root) {
        root.position.set(cx, 0, cz);
        root.rotation.set(0, ry, 0);
        root.scale.setScalar(VEHICLE_SCALE);
        k.b.addObject(g, root);
      } else {
        k.b.add(g, bx(2.0, 0.75, 1.04), k.paint, at(cx, 0.575, cz, ry), YELLOW);
        k.b.add(g, bx(1.6, 0.48, 1.0), k.paint, at(cx, 1.19, cz, ry), YELLOW);
      }
      const fx = Math.cos(ry);
      const fz = -Math.sin(ry);
      board(
        k,
        g,
        k.atlas.board(`route${(n + i) % ROUTE_CARDS.length}`, 128, 48, pick(ROUTE_CARDS, n + i)),
        0.42,
        0.15,
        cx + fx * 1.0,
        0.98,
        cz + fz * 1.0,
        ry + Math.PI / 2,
      );
      i++;
    }
}

function shelter(k: Kit, g: number, grp: OshodiCoverGroup): void {
  for (const [x, y] of grp.tiles) {
    const cx = k.wx(x);
    const cz = k.wz(y);
    for (const dx of [-0.42, 0.42]) cyl(k, g, k.metal, 0.04, 0.04, 2.1, cx + dx, 0, cz - 0.38, YELLOW, 6);
    box(k, g, k.metal, 1.0, 0.08, 0.95, cx, 2.1, cz - 0.05, YELLOW, 0, -0.06);
    for (let i = 0; i < 5; i++)
      box(k, g, k.paint, 0.2, 0.18, 0.05, cx - 0.4 + i * 0.2, 1.92, cz + 0.4, i % 2 ? 0x1c1c1c : YELLOW);
    box(k, g, k.metal, 0.9, 1.2, 0.05, cx, 0.5, cz - 0.42, 0x2a3036);
    box(k, g, k.paint, 0.8, 0.06, 0.3, cx, 0.42, cz - 0.2, 0x6e5440);
    board(
      k,
      g,
      k.atlas.board(`poster${(x + y) % POSTERS.length}`, 96, 120, pick(POSTERS, x + y)),
      0.5,
      0.62,
      cx,
      1.2,
      cz - 0.39,
    );
  }
}

/** The huge canopy columns of the plaza: an octagonal shaft, a flared capital that carries the canopy, a ring lamp. */
function column(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  for (const [x, y] of grp.tiles) {
    const cx = k.wx(x);
    const cz = k.wz(y);
    box(k, g, k.concrete, 1.0, 0.3, 1.0, cx, 0, cz, CONCRETE_DARK);
    k.b.add(
      g,
      new CylinderGeometry(0.42, 0.48, 4.0, 8),
      k.concrete,
      at(cx, 2.3, cz, Math.PI / 8),
      pick([0xcac6ba, 0xbcb8ac], n + x),
    );
    for (let i = 0; i < 2; i++)
      k.b.add(
        g,
        new CylinderGeometry(0.49, 0.49, 0.18, 8),
        k.paint,
        at(cx, 0.45 + i * 0.36, cz, Math.PI / 8),
        i ? 0xd8d4c8 : 0x1c1c1c,
      );
    box(k, g, k.concrete, 1.35, 0.34, 1.35, cx, 4.3, cz, CONCRETE_DARK); // capital carrying the canopy
    box(k, g, k.concrete, 1.2, 0.2, 1.2, cx, 4.64, cz, CONCRETE);
    box(k, g, k.glow, 0.7, 0.05, 0.05, cx, 3.6, cz + 0.5, 0xe8f4ff); // a tube on the south face
  }
}

// -------------------------------------------------------------------------------------- skywalk

/** A skywalk pier: a round shaft with painted bands, a flared head, a walkway landing and a short stair stub. */
function skyPier(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  const { cx, cz, w, d } = centre(k, grp);
  box(k, g, k.concrete, w - 0.06, 0.2, d - 0.06, cx, 0, cz, 0x7e786e); // footing
  k.b.add(
    g,
    new CylinderGeometry(0.62, 0.7, 4.4, 10),
    k.concrete,
    at(cx, 2.4, cz, Math.PI / 10),
    pick([0xd0cabc, 0xc2bcb0, 0xdad6ca], n),
  );
  for (let i = 0; i < 3; i++)
    k.b.add(
      g,
      new CylinderGeometry(0.71, 0.71, 0.2, 10),
      k.paint,
      at(cx, 0.3 + i * 0.2, cz, Math.PI / 10),
      i % 2 ? 0xd8d4c8 : 0x1c1c1c,
    );
  box(k, g, k.concrete, w + 0.3, 0.45, d + 0.2, cx, 4.6, cz, CONCRETE_DARK); // flared head
  box(k, g, k.concrete, w + 0.5, 0.2, 1.3, cx, 5.05, cz, CONCRETE); // the walkway landing it carries
  box(k, g, k.metal, w + 0.5, 0.07, 0.07, cx, 5.9, cz + 0.62, STEEL); // handrail
  for (let i = 0; i <= 4; i++)
    box(
      k,
      g,
      k.metal,
      0.05,
      0.85,
      0.05,
      cx - (w + 0.5) / 2 + 0.05 + (i * (w + 0.4)) / 4,
      5.1,
      cz + 0.62,
      STEEL,
    );
  box(k, g, k.glow, 0.6, 0.05, 0.05, cx, 3.0, cz + 0.72, 0xe8f4ff);
  // a stair on the south face: eight treads climbing from west to east towards the landing
  for (let i = 0; i < 8; i++)
    box(
      k,
      g,
      k.concrete,
      (w - 0.3) / 8,
      0.25 + i * 0.5,
      0.3,
      cx - (w - 0.3) / 2 + ((i + 0.5) * (w - 0.3)) / 8,
      0,
      cz + d / 2 - 0.1,
      0xa8a49a,
    );
}

/** The stair tower: a concrete core with an external flight, a landing and a glazed cap, a name board on the front. */
function stairTower(k: Kit, g: number, grp: OshodiCoverGroup): void {
  const { cx, cz, w, d } = centre(k, grp);
  const zf = cz + d / 2;
  box(k, g, k.concrete, w - 0.2, 3.9, d - 0.2, cx, 0, cz, 0xb0aca2);
  box(k, g, k.concrete, w + 0.1, 0.2, d + 0.1, cx, 3.9, cz, CONCRETE_DARK);
  // flights climbing the west and east faces
  for (const side of [-1, 1])
    for (let i = 0; i < 12; i++)
      box(
        k,
        g,
        k.concrete,
        0.34,
        0.3 + i * 0.3,
        0.7,
        cx + side * (w / 2 + 0.05),
        0,
        cz + d / 2 - 0.5 - i * ((d - 1) / 12),
        0x9a968c,
      );
  box(k, g, k.paint, 0.9, 1.7, 0.05, cx, 0.02, zf - 0.08, 0x16120e); // doorway
  for (let i = 0; i < 4; i++)
    box(
      k,
      g,
      k.glow,
      0.45,
      0.5,
      0.05,
      cx - 1.0 + (i % 2) * 2.0,
      1.9 + Math.floor(i / 2) * 1.0,
      zf - 0.08,
      0x7aa6c8,
    );
  box(k, g, k.metal, w + 0.3, 0.08, d + 0.3, cx, 4.5, cz, YELLOW, 0, -0.04); // cap roof
  for (const dx of [-1, 1])
    for (const dz of [-1, 1])
      cyl(k, g, k.metal, 0.04, 0.04, 0.6, cx + dx * (w / 2), 3.9, cz + dz * (d / 2 - 0.2), STEEL, 6);
  board(
    k,
    g,
    k.atlas.board('tower', 320, 96, {
      bg: '#12304e',
      fg: '#f4f2ea',
      lines: [['SKYWALK ↑', 40]],
      border: '#e8b82a',
    }),
    1.9,
    0.55,
    cx,
    3.35,
    zf - 0.04,
  );
}

// --------------------------------------------------------------------------------------- junction

/** A kerb island with a post and the big direction sign, black-and-white kerb, a bollard. */
function island(k: Kit, g: number, grp: OshodiCoverGroup): void {
  const { cx, cz, w, d } = centre(k, grp);
  box(k, g, k.concrete, w - 0.08, 0.26, d - 0.08, cx, 0, cz, 0x9a968c);
  const segs = Math.round(w * 3);
  for (let i = 0; i < segs; i++)
    box(
      k,
      g,
      k.paint,
      w / segs - 0.01,
      0.22,
      0.03,
      cx - w / 2 + (i + 0.5) * (w / segs),
      0.02,
      cz + (d - 0.08) / 2,
      i % 2 ? 0x1a1a1a : 0xe8e4da,
    );
  for (const dx of [-0.5, 0.5]) cyl(k, g, k.metal, 0.05, 0.05, 3.0, cx + dx, 0.26, cz, STEEL, 6);
  box(k, g, k.paint, 1.7, 0.95, 0.07, cx, 2.5, cz + 0.12, 0x16140f);
  board(k, g, k.atlas.board('signTower', 320, 128, SIGN_TOWER_BOARD), 1.6, 0.85, cx, 2.5, cz + 0.17);
  cyl(k, g, k.paint, 0.12, 0.14, 0.7, cx - 0.7, 0.26, cz + 0.45, 0xd8d2c4, 8);
}

/** A signal gantry foot: a cabinet and a mast carrying a signal head and a short cantilever. */
function gantry(k: Kit, g: number, grp: OshodiCoverGroup): void {
  const { cx, cz, w, d } = centre(k, grp);
  box(k, g, k.concrete, w - 0.1, 0.3, d - 0.1, cx, 0, cz, 0x7e786e);
  box(k, g, k.metal, 0.9, 1.3, 0.6, cx - w / 2 + 0.6, 0.3, cz - d / 2 + 0.5, 0x6a7a6a); // cabinet
  cyl(k, g, k.metal, 0.1, 0.13, 5.4, cx + w / 2 - 0.5, 0.3, cz + d / 2 - 0.5, STEEL, 8);
  box(k, g, k.paint, 0.34, 0.95, 0.22, cx + w / 2 - 0.5, 3.6, cz + d / 2 - 0.1, 0x16140f); // signal head on the mast
  for (const [i, c] of [0xd02a1a, 0xe8a820, 0x2aa84a].entries())
    k.b.add(
      g,
      new CylinderGeometry(0.1, 0.1, 0.05, 10),
      k.glow,
      at(cx + w / 2 - 0.5, 4.3 - i * 0.28, cz + d / 2 + 0.03, 0, Math.PI / 2),
      c,
    );
}

// ----------------------------------------------------------------------------------------- railway

/** The rail-bridge abutment the track lanes run in and out of: a deep block with an arch opening on both faces. */
function portal(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  const { cx, cz, w, d } = centre(k, grp);
  const H = 2.3;
  const zs = cz + d / 2;
  const zn = cz - d / 2;
  box(k, g, k.concrete, w - 0.04, H, d - 0.04, cx, 0, cz, 0xa8a49a);
  box(k, g, k.concrete, w + 0.1, 0.28, d + 0.1, cx, H, cz, CONCRETE_DARK); // coping
  for (const [z, ry] of [
    [zs, 0],
    [zn, Math.PI],
  ] as const) {
    const f = z + (ry === 0 ? 0.01 : -0.01);
    for (const tx of [cx - w / 4, cx + w / 4]) {
      box(k, g, k.paint, 0.74, 1.55, 0.05, tx, 0.0, f, 0x0a0a0c, ry); // the dark arch opening (flat)
      box(k, g, k.paint, 0.52, 0.28, 0.05, tx, 1.5, f, 0x0a0a0c, ry);
    }
    // black-and-white painted wing ends and a red signal lamp head above each track mouth
    for (let i = 0; i < 6; i++)
      box(
        k,
        g,
        k.paint,
        w / 6,
        0.2,
        0.04,
        cx - w / 2 + (i + 0.5) * (w / 6),
        H - 0.2,
        f,
        i % 2 ? 0x1c1c1c : 0xe0ae28,
        ry,
      );
    for (const tx of [cx - w / 4, cx + w / 4])
      box(k, g, k.glow, 0.16, 0.16, 0.05, tx, 2.0, f + (ry === 0 ? 0.03 : -0.03), 0xb83a2a, ry);
  }
  board(k, g, k.atlas.board('portal', 320, 128, PORTAL_BOARD), w - 0.3, 0.7, cx, 1.95, zs + 0.04);
  if (n % 2 === 0)
    board(k, g, k.atlas.board('portalS', 320, 128, PORTAL_BOARD), w - 0.3, 0.7, cx, 1.95, zn - 0.04, Math.PI);
}

function platformPost(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  for (const [x, y] of grp.tiles) {
    const cx = k.wx(x);
    const cz = k.wz(y);
    box(k, g, k.concrete, 0.7, 0.2, 0.7, cx, 0, cz, CONCRETE_DARK);
    cyl(k, g, k.metal, 0.09, 0.11, 3.2, cx, 0.2, cz, STEEL, 8);
    box(k, g, k.metal, 1.0, 0.1, 0.9, cx, 3.4, cz, RAIL_BLUE, 0, -0.05); // a canopy bracket
    board(k, g, k.atlas.board('platform', 256, 80, PLATFORM_BOARD), 0.9, 0.3, cx, 2.5, cz + 0.12);
    box(k, g, k.glow, 0.5, 0.05, 0.05, cx, 3.3, cz + 0.3, 0xe8f4ff);
    void n;
  }
}

function cabin(k: Kit, g: number, grp: OshodiCoverGroup): void {
  const { cx, cz, w, d } = centre(k, grp);
  const zs = cz + d / 2;
  box(k, g, k.concrete, w - 0.12, 2.3, d - 0.12, cx, 0, cz, 0xcfc4a6);
  box(k, g, k.zinc, w + 0.2, 0.08, d + 0.2, cx, 2.3, cz, 0x7a7e84, 0, -0.1);
  box(k, g, k.paint, 0.7, 1.7, 0.04, cx - 0.4, 0.02, zs - 0.07, 0x2a4a32); // door
  box(k, g, k.glow, 0.6, 0.5, 0.04, cx + 0.5, 1.2, zs - 0.07, 0x7aa6c8); // window
  board(k, g, k.atlas.board('cabin', 256, 64, CABIN_BOARD), 1.2, 0.3, cx, 2.0, zs - 0.04);
  for (const dx of [-0.5, 0.5]) box(k, g, k.metal, 0.4, 0.8, 0.3, cx + dx, 0, cz - d / 2 - 0.05, 0x6a7a6a); // relay cabinets
}

/** The commuter-rail station concourse: a long low hall, lit glazing, a deep canopy and the station name. */
function station(k: Kit, g: number, grp: OshodiCoverGroup): void {
  const { cx, cz, w, d } = centre(k, grp);
  const H = 3.4;
  const zs = cz + d / 2;
  box(k, g, k.concrete, w - 0.06, H, d - 0.06, cx, 0, cz, 0xb4b0a4);
  box(k, g, k.concrete, w + 0.2, 0.22, d + 0.2, cx, H, cz, CONCRETE_DARK);
  for (let i = 0; i < Math.floor(d); i++) {
    const zz = k.wz(grp.y0 + i);
    box(k, g, k.glow, 0.05, 1.5, 0.7, cx - w / 2 - 0.01, 0.9, zz, 0x7aa6c8); // glazing on the west (platform) face
    box(k, g, k.metal, 0.08, 1.6, 0.06, cx - w / 2 - 0.02, 0.9, zz + 0.35, STEEL);
  }
  box(k, g, k.concrete, 0.4, 0.2, d, cx - w / 2 - 0.2, 2.6, cz, CONCRETE_DARK); // the platform-side canopy edge
  box(k, g, k.glow, w - 0.4, 0.9, 0.05, cx, 1.0, zs - 0.04, 0x7aa6c8);
  board(
    k,
    g,
    k.atlas.board('station', 512, 128, STATION_BOARD),
    Math.min(w - 0.3, 3.4),
    Math.min(w - 0.3, 3.4) * 0.25,
    cx,
    2.95,
    zs - 0.04,
  );
  for (let i = 0; i < 3; i++)
    box(k, g, k.paint, 0.5, 0.28, 0.5, cx - w / 2 + 0.8 + i * 1.0, H + 0.22, cz, 0xb8b4aa); // roof plant
}

// -------------------------------------------------------------------------------------- cappa works

function workshop(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  const has = hasOf(grp);
  for (const [x, y] of grp.tiles) {
    box(k, g, k.concrete, 1, 2.4, 1, k.wx(x), 0, k.wz(y), pick([0xb8a88a, 0xa8b0a4], n));
    box(k, g, k.zinc, 1.04, 0.06, 1.1, k.wx(x), 2.4, k.wz(y) + 0.04, 0x8a6e58, 0, 0.12);
    if (!has.has(`${x},${y + 1}`)) {
      const up = (x + n) % 3 === 0;
      box(
        k,
        g,
        up ? k.paint : k.zinc,
        0.86,
        up ? 1.5 : 1.6,
        0.05,
        k.wx(x),
        0.02,
        k.wz(y) + 0.5,
        up ? 0x15120f : 0x7c8488,
      );
    }
  }
  const { cx, w } = centre(k, grp);
  const zf = k.wz(grp.y1) + 0.5;
  for (let i = 0; i < Math.floor(w / 2); i++)
    board(
      k,
      g,
      k.atlas.board(`wk${(n * 2 + i) % WORKSHOP_BOARDS.length}`, 256, 80, pick(WORKSHOP_BOARDS, n * 2 + i)),
      1.7,
      0.45,
      cx - w / 2 + 1 + i * 2,
      2.0,
      zf + 0.04,
    );
}

function skip(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  const { cx, cz, w, d } = centre(k, grp);
  for (let i = 0; i < Math.floor(w); i++) {
    const x = cx - w / 2 + 0.5 + i;
    box(k, g, k.metal, 0.96, 0.9, d - 0.1, x, 0.06, cz, pick([0x2e5a3a, 0x8a3a22, 0x3a4a6a], n + i), 0, 0);
    box(k, g, k.paint, 0.8, 0.12, d - 0.4, x, 0.96, cz, 0x3a3228); // scrap heaped above the rim
  }
}

function pavilion(k: Kit, g: number, grp: OshodiCoverGroup): void {
  const { cx, cz, w, d } = centre(k, grp);
  const zs = cz + d / 2;
  box(k, g, k.concrete, w - 0.08, 2.5, d - 0.08, cx, 0, cz, 0xd2caa8);
  box(k, g, k.concrete, w + 0.2, 0.18, d + 0.2, cx, 2.5, cz, CONCRETE_DARK);
  for (let i = 0; i < Math.floor(w) + 1; i++)
    box(k, g, k.paint, 0.5, 0.5, 0.04, k.wx(grp.x0) - 0.5 + i * 1.0 + 0.5, 1.4, zs - 0.04, 0x1c1a18);
  box(k, g, k.paint, 0.6, 1.5, 0.04, cx, 0.02, zs - 0.04, 0x2a6a3a);
  board(k, g, k.atlas.board('pavilion', 384, 96, PAVILION_BOARD), w - 0.2, 0.45, cx, 2.0, zs - 0.03);
}

function genHouse(k: Kit, g: number, grp: OshodiCoverGroup): void {
  const { cx, cz, w, d } = centre(k, grp);
  const zs = cz + d / 2;
  box(k, g, k.concrete, w - 0.1, 1.9, d - 0.1, cx, 0, cz, 0xa8a49a);
  box(k, g, k.zinc, w + 0.1, 0.06, d + 0.1, cx, 1.9, cz, 0x7a7a74, 0, -0.08);
  for (let i = 0; i < Math.floor(w); i++)
    box(k, g, k.paint, 0.5, 0.7, 0.04, cx - w / 2 + 0.5 + i, 0.6, zs - 0.06, 0x16120e);
  cyl(k, g, k.metal, 0.1, 0.1, 1.1, cx + w / 2 - 0.4, 1.9, cz, STEEL, 8); // exhaust stack
  board(k, g, k.atlas.board('genHouse', 256, 96, GEN_HOUSE_BOARD), 1.3, 0.45, cx - 0.4, 1.4, zs - 0.03);
}

function wall(k: Kit, g: number, grp: OshodiCoverGroup, n: number): void {
  grp.tiles.forEach(([x, y], i) => {
    const h = 1.42 - (i % 4 === 3 ? 0.1 : 0);
    box(k, g, k.concrete, 1, h, 1, k.wx(x), 0, k.wz(y), pick(PLASTER, n * 3 + 1));
    box(k, g, k.paint, 1.01, 0.32, 1.01, k.wx(x), 0, k.wz(y), 0x5e5040);
    box(k, g, k.concrete, 1.0, 0.08, 1.06, k.wx(x), h, k.wz(y), 0x8a8478);
  });
}

// ---------------------------------------------------------------------------------------- the build

/** Builds the whole board's cover (null if the board is not the 45 x 33 Oshodi grid). */
export function buildOshodiMetroCover(board: { width: number; height: number }): BoardCover | null {
  const groups = oshodiCoverGroups();
  const W = board.width;
  const H = board.height;
  const b = new CoverBuilder(W, H);
  const dom = typeof document !== 'undefined';
  const atlas = new SignAtlas(77);
  const paint = b.own(
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.03, flatShading: true }),
  );
  const concrete = b.own(
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      map: dom ? concreteTexture() : null,
    }),
  );
  const zinc = b.own(
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.35,
      map: dom ? corrugatedTexture() : null,
    }),
  );
  const signs = b.own(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  const glow = b.own(new MeshBasicMaterial({ vertexColors: true }));
  const k: Kit = {
    b,
    atlas,
    paint,
    metal: paint,
    concrete,
    zinc,
    signs,
    glow,
    wx: (x) => x - W / 2 + 0.5,
    wz: (y) => y - H / 2 + 0.5,
    r: artRng(6203),
  };
  const bus = assets.has('veh_danfo') || dom ? createVehicleModel('danfo') : null;
  const counts = new Map<string, number>();
  for (const grp of groups) {
    const n = counts.get(grp.kind) ?? 0;
    counts.set(grp.kind, n + 1);
    // long objects fade in sections of four columns (a bus is never split: buses start on even columns of
    // their group), so one fighter behind a long building does not dissolve the whole row
    const sections = new Map<number, [number, number][]>();
    for (const t of grp.tiles) {
      const key = Math.floor((t[0] - grp.x0) / 4);
      sections.set(key, [...(sections.get(key) ?? []), t]);
    }
    const ids = [...sections.values()].map((tiles) => b.group(tiles, OSHODI_COVER_REACH[grp.kind]));
    const g = ids[0]!;
    switch (grp.kind) {
      case 'building':
        building(k, g, grp, n);
        break;
      case 'lockup':
        lockup(k, g, grp);
        break;
      case 'shop':
        shop(k, g, grp, n);
        break;
      case 'kiosk':
        kiosk(k, g, grp, n);
        break;
      case 'stall':
        stall(k, g, grp, n);
        break;
      case 'container':
        container(k, g, grp, n);
        break;
      case 'terminal':
        terminal(k, g, grp, n);
        break;
      case 'bus':
        buses(k, g, grp, n, bus);
        break;
      case 'shelter':
        shelter(k, g, grp);
        break;
      case 'column':
        column(k, g, grp, n);
        break;
      case 'skyPier':
        skyPier(k, g, grp, n);
        break;
      case 'stairTower':
        stairTower(k, g, grp);
        break;
      case 'island':
        island(k, g, grp);
        break;
      case 'gantry':
        gantry(k, g, grp);
        break;
      case 'portal':
        portal(k, g, grp, n);
        break;
      case 'platformPost':
        platformPost(k, g, grp, n);
        break;
      case 'cabin':
        cabin(k, g, grp);
        break;
      case 'station':
        station(k, g, grp);
        break;
      case 'workshop':
        workshop(k, g, grp, n);
        break;
      case 'skip':
        skip(k, g, grp, n);
        break;
      case 'pavilion':
        pavilion(k, g, grp);
        break;
      case 'genHouse':
        genHouse(k, g, grp);
        break;
      case 'wall':
        wall(k, g, grp, n);
        break;
    }
  }
  const t = atlas.texture();
  if (t) {
    signs.map = t;
    b.own(t);
  }
  bus?.root.traverse((o) => {
    const mm = (o as { material?: Material | Material[] }).material;
    if (mm) for (const x of Array.isArray(mm) ? mm : [mm]) b.grit(x, 'paint');
  });
  return b.build();
}
