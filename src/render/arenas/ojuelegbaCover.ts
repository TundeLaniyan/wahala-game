/**
 * Ojuelegba Underbridge - the board's permanent cover drawn as the real things it is (presentation only;
 * which tile is what comes from `ojuelegbaCoverMap.ts`, collision from the sim layout). Every group is
 * one object: twin hammerhead piers on stained footings, whole parked Danfos (the GLB model, yellow with
 * the black band, fictional route cards in the windscreens), shop buildings with fascia boards, half-open
 * shutters and doorway recesses, container shops, compound walls, the park's block-and-zinc fence, the
 * jersey-barrier median, kiosks, lock-up stalls, sheds, a broken-down container lorry, the bus stop, the
 * generator house, skips and the loading dock.
 *
 * Everything is baked by `CoverBuilder` into a few merged meshes (vertex colours on shared materials,
 * one sign atlas), so the whole board's cover costs about a dozen draw calls per visible chunk.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  Euler,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import { assets } from '../assets/library';
import { createVehicleModel } from '../assets/vehicles';
import { artRng, concreteTexture, corrugatedTexture } from '../textures';
import type { BoardCover } from './boardCover';
import { CoverBuilder } from './boardCover';
import { COVER_REACH, coverGroups } from './ojuelegbaCoverMap';
import type { CoverGroup } from './ojuelegbaCoverMap';
import {
  BUS_STOP_BOARD,
  CONTAINER_BOARDS,
  GEN_HOUSE_BOARD,
  KIOSK_BOARDS,
  POSTERS,
  ROUTE_CARDS,
  SHED_BOARDS,
  SHOP_NAMES,
  SignAtlas,
} from './ojuelegbaSigns';
import type { UvRect } from './ojuelegbaSigns';

const VEHICLE_SCALE = 1.32;
const PLASTER = [0xc8b48e, 0x9fb0a6, 0xd2c6a6, 0xb88a64, 0x8ea0b4, 0xcfa88a, 0xa6a07c];
const KIOSK_PAINT = [0x2e5a8e, 0x3a7a46, 0xc8a02a, 0x9a2e22, 0xd8d0bc, 0x2a6a74];
const CONTAINER_PAINT = [0x2e5a7a, 0x8a3a26, 0x3e6a48, 0x9a8a5e];

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
  // face order +x, -x, +y, -y, +z, -z; four vertices each
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
  rx = 0,
  rz = 0,
): void {
  k.b.add(g, new CylinderGeometry(rt, rb, h, seg), material, at(x, y0 + h / 2, z, 0, rx, rz), color);
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

// ----------------------------------------------------------------------------------- linear cover

/**
 * Walls, fences and the median: from each tile centre a half segment towards every neighbour of the
 * same group, so runs and corners join up. `seg(len, along x?)` draws one piece centred at (x, z).
 */
function linear(
  grp: CoverGroup,
  draw: (x: number, z: number, len: number, alongX: boolean, tile: [number, number], i: number) => void,
  wx: (x: number) => number,
  wz: (y: number) => number,
): void {
  const has = new Set(grp.tiles.map(([x, y]) => `${x},${y}`));
  grp.tiles.forEach(([x, y], i) => {
    const e1 = has.has(`${x + 1},${y}`);
    const w1 = has.has(`${x - 1},${y}`);
    const n1 = has.has(`${x},${y - 1}`);
    const s1 = has.has(`${x},${y + 1}`);
    const cx = wx(x);
    const cz = wz(y);
    if (!e1 && !w1 && !n1 && !s1) {
      draw(cx, cz, 1, true, [x, y], i);
      return;
    }
    if (e1 || w1) {
      // one piece spanning the side(s) that continue, plus the centre
      const a = w1 ? -0.5 : -0.25;
      const b = e1 ? 0.5 : 0.25;
      draw(cx + (a + b) / 2, cz, b - a, true, [x, y], i);
    }
    if (n1 || s1) {
      const a = n1 ? -0.5 : -0.25;
      const b = s1 ? 0.5 : 0.25;
      draw(cx, cz + (a + b) / 2, b - a, false, [x, y], i);
    }
  });
}

function wall(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const plaster = pick(PLASTER, n * 3 + 1);
  const hgt = 1.3 + k.r() * 0.15;
  linear(
    grp,
    (x, z, len, alongX, tile, i) => {
      const w = alongX ? len : 0.5;
      const d = alongX ? 0.5 : len;
      const h = hgt - (i % 3 === 2 ? 0.12 : 0);
      box(k, g, k.concrete, w, h, d, x, 0, z, plaster);
      box(k, g, k.paint, w + 0.02, 0.32, d + 0.02, x, 0, z, 0x5e5040); // street dirt splashed up the base
      box(k, g, k.concrete, w + 0.06, 0.08, d + 0.06, x, h, z, 0x8a8478); // coping
      const pi = (i + n) % POSTERS.length;
      if (alongX && (tile[0] + tile[1]) % 3 === 0)
        board(k, g, k.atlas.board(`poster${pi}`, 96, 120, POSTERS[pi]!), 0.36, 0.46, x, 0.8, z + 0.26);
    },
    k.wx,
    k.wz,
  );
}

function fence(k: Kit, g: number, grp: CoverGroup): void {
  linear(
    grp,
    (x, z, len, alongX, tile) => {
      const w = alongX ? len : 0.44;
      const d = alongX ? 0.44 : len;
      box(k, g, k.concrete, w, 0.55, d, x, 0, z, 0x9a948a);
      const tint = pick([0x8a5a3e, 0x6e7a80, 0x9a8a72, 0x7a4a34], tile[0] * 7 + tile[1] * 3);
      box(k, g, k.zinc, alongX ? len : 0.06, 1.02, alongX ? 0.06 : len, x, 0.55, z, tint);
    },
    k.wx,
    k.wz,
  );
  for (const [x, y] of grp.tiles) {
    cyl(k, g, k.metal, 0.045, 0.05, 1.7, k.wx(x), 0, k.wz(y), 0x3a3834, 6);
  }
}

function median(k: Kit, g: number, grp: CoverGroup): void {
  linear(
    grp,
    (x, z, len, alongX, tile) => {
      const c = (tile[0] % 2 === 0 ? 0xd2ccbe : 0x2a2826) as number;
      const w = alongX ? len : 0.68;
      const d = alongX ? 0.68 : len;
      box(k, g, k.concrete, w, 0.22, d, x, 0, z, c);
      box(k, g, k.concrete, alongX ? len : 0.36, 0.48, alongX ? 0.36 : len, x, 0.22, z, c);
      box(k, g, k.concrete, alongX ? len : 0.26, 0.1, alongX ? 0.26 : len, x, 0.7, z, 0x8a8478);
    },
    k.wx,
    k.wz,
  );
}

// ------------------------------------------------------------------------------------ the bridge

function pier(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = (k.wz(grp.y0) + k.wz(grp.y1)) / 2;
  const tone = 0xb6ae9e;
  box(k, g, k.concrete, 1.94, 0.16, 1.94, cx, 0, cz, 0x7e786e); // footing, stained
  box(k, g, k.paint, 2.0, 0.03, 2.0, cx, 0, cz, 0x2e2a24); // the wet ring round it
  // the column: a chamfered (octagonal) blade
  k.b.add(
    g,
    new CylinderGeometry(0.74, 0.8, 1.78, 8),
    k.concrete,
    at(cx, 0.16 + 0.89, cz, Math.PI / 8, 0, 0, 1, 1, 0.82),
    tone,
  );
  // the hammerhead flaring out to carry the deck (cut at the deck soffit line)
  k.b.add(
    g,
    new CylinderGeometry(1.38, 0.82, 0.5, 4),
    k.concrete,
    at(cx, 1.94 + 0.25, cz, Math.PI / 4, 0, 0, 1, 1, 0.8),
    tone,
  );
  box(k, g, k.paint, 1.96, 0.1, 1.58, cx, 2.44, cz, 0x4a4640); // bearing plinth: the cut line
  // drainage stain down the south face and a band of bill posters
  box(k, g, k.paint, 0.16, 1.5, 0.02, cx + 0.32, 0.2, cz + 0.66, 0x3a3428);
  for (let i = 0; i < 2; i++)
    board(
      k,
      g,
      k.atlas.board(`poster${(n + i) % POSTERS.length}`, 96, 120, pick(POSTERS, n + i)),
      0.34,
      0.42,
      cx - 0.3 + i * 0.36,
      0.95,
      cz + 0.67,
    );
  // a fluorescent tube on the south face (the under-bridge light)
  box(k, g, k.glow, 0.62, 0.05, 0.05, cx, 1.62, cz + 0.68, 0xe8f4ff);
}

function busStop(k: Kit, g: number, grp: CoverGroup): void {
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = k.wz(grp.y0);
  const w = grp.x1 - grp.x0 + 1 - 0.1;
  for (const dx of [-w / 2 + 0.08, w / 2 - 0.08])
    for (const dz of [-0.4, 0.4]) cyl(k, g, k.metal, 0.04, 0.04, 1.95, cx + dx, 0, cz + dz, 0x6a6c68, 6);
  box(k, g, k.metal, w + 0.1, 0.07, 1.0, cx, 1.95, cz, 0x8a8c86, 0, -0.05);
  box(k, g, k.glow, w * 0.6, 0.04, 0.05, cx, 1.9, cz + 0.2, 0xe8f4ff);
  // back panel with an advert, and the bench
  box(k, g, k.metal, w - 0.2, 1.3, 0.05, cx, 0.45, cz - 0.42, 0x2a3036);
  board(k, g, k.atlas.board('poster3', 96, 120, pick(POSTERS, 3)), 0.7, 0.9, cx - 0.5, 1.1, cz - 0.39);
  board(k, g, k.atlas.board('poster1', 96, 120, pick(POSTERS, 1)), 0.7, 0.9, cx + 0.5, 1.1, cz - 0.39);
  box(k, g, k.paint, w - 0.6, 0.06, 0.34, cx, 0.42, cz - 0.15, 0x6e5440);
  for (const dx of [-w / 2 + 0.5, 0, w / 2 - 0.5])
    box(k, g, k.metal, 0.05, 0.42, 0.3, cx + dx, 0, cz - 0.15, 0x3a3a38);
  // the yellow board standing on the roof
  cyl(k, g, k.metal, 0.03, 0.03, 0.5, cx + 0.9, 2.0, cz + 0.3, 0x4a4a48, 6);
  board(k, g, k.atlas.board('busStop', 256, 128, BUS_STOP_BOARD), 1.0, 0.5, cx + 0.9, 2.4, cz + 0.33);
}

// ------------------------------------------------------------------------------------ the park

type VehicleModel = ReturnType<typeof createVehicleModel>;

/** A row of parked Danfos nose-in to the aisle; `bus` is one model, positioned per bus and baked. */
function danfos(
  k: Kit,
  g: number,
  grp: CoverGroup,
  n: number,
  aisleX: number,
  bus: VehicleModel | null,
): void {
  const root = bus?.root;
  const facesEast = grp.x0 < aisleX;
  for (let y = grp.y0; y <= grp.y1; y++) {
    const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2 + (k.r() - 0.5) * 0.08;
    const cz = k.wz(y) + (k.r() - 0.5) * 0.08;
    const ry = (facesEast ? 0 : Math.PI) + (k.r() - 0.5) * 0.06;
    if (root) {
      root.position.set(cx, 0, cz);
      root.rotation.set(0, ry, 0);
      root.scale.setScalar(VEHICLE_SCALE);
      k.b.addObject(g, root);
    } else blockDanfo(k, g, cx, cz, facesEast ? 1 : -1);
    // the route card propped in the windscreen
    const dir = facesEast ? 1 : -1;
    board(
      k,
      g,
      k.atlas.board(`route${(n + y) % ROUTE_CARDS.length}`, 128, 48, pick(ROUTE_CARDS, n + y)),
      0.42,
      0.15,
      cx + dir * 1.0,
      0.98,
      cz,
      dir * (Math.PI / 2),
    );
  }
}

/** Stand-in bus when neither the GLB nor a canvas is available (tests): yellow body, the black band. */
function blockDanfo(k: Kit, g: number, cx: number, cz: number, dir: number): void {
  box(k, g, k.paint, 2.0, 0.75, 1.04, cx, 0.2, cz, 0xf0b81a);
  box(k, g, k.paint, 1.6, 0.48, 1.0, cx - dir * 0.15, 0.95, cz, 0xf0b81a);
  box(k, g, k.paint, 2.02, 0.14, 1.06, cx, 0.62, cz, 0x141414);
  for (const dx of [-0.65, 0.65])
    for (const dz of [-0.48, 0.48])
      k.b.add(
        g,
        new CylinderGeometry(0.2, 0.2, 0.12, 10),
        k.paint,
        at(cx + dx, 0.2, cz + dz, 0, Math.PI / 2),
        0x151515,
      );
}

// ------------------------------------------------------------------------------------ buildings

function shop(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const has = new Set(grp.tiles.map(([x, y]) => `${x},${y}`));
  const wallC = pick(PLASTER, n * 2 + 3);
  const H = 2.45;
  for (const [x, y] of grp.tiles) {
    box(k, g, k.concrete, 1, H, 1, k.wx(x), 0, k.wz(y), wallC);
    box(k, g, k.concrete, 1.0, 0.16, 1.0, k.wx(x), H, k.wz(y), 0x8a8276);
  }
  // the fronts: every run of tiles facing south onto the lane (the doorway recess makes its own run)
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
      box(k, g, k.paint, 0.8, 1.6, 0.04, k.wx(x), 0.02, zf, 0x16120e); // the dark shop opening
      // a roller shutter pulled half down, some goods hanging in the doorway
      box(k, g, k.zinc, 0.84, 0.5 + ((x * 5 + n) % 3) * 0.12, 0.05, k.wx(x), 1.12, zf + 0.02, 0x7a8288);
      box(k, g, k.paint, 0.18, 0.5, 0.05, k.wx(x) - 0.25, 0.55, zf + 0.04, pick(KIOSK_PAINT, x + n));
    }
    box(k, g, k.paint, w - 0.04, 0.5, 0.05, cx, 1.86, zf + 0.03, 0x2a2420); // fascia backing
    board(
      k,
      g,
      k.atlas.board(`shop${(n * 3 + i) % SHOP_NAMES.length}`, 508, 96, pick(SHOP_NAMES, n * 3 + i)),
      w - 0.1,
      Math.min(0.46, (w - 0.1) * 0.19 + 0.12),
      cx,
      2.11,
      zf + 0.06,
    );
    box(k, g, k.zinc, w, 0.04, 0.42, cx, 1.76, zf + 0.15, 0x8a7a6a, 0, 0.18); // the zinc awning
  });
  // a black water tank on the roof of every other building
  if (n % 2 === 0) {
    const [tx, ty] = grp.tiles[Math.floor(grp.tiles.length / 3)]!;
    cyl(k, g, k.paint, 0.3, 0.3, 0.5, k.wx(tx), H + 0.16, k.wz(ty), 0x1a1a1c, 12);
  }
}

function container(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const w = grp.x1 - grp.x0 + 1;
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = k.wz(grp.y0);
  const tint = pick(CONTAINER_PAINT, n);
  for (const dx of [-w / 2 + 0.3, w / 2 - 0.3])
    box(k, g, k.concrete, 0.3, 0.08, 0.8, cx + dx, 0, cz, 0x6a645a);
  box(k, g, k.zinc, w - 0.08, 1.15, 0.92, cx, 0.08, cz, tint);
  box(k, g, k.paint, 0.9, 0.95, 0.04, cx + w / 2 - 0.75, 0.1, cz + 0.46, 0x14110e); // the cut-out door
  box(k, g, k.metal, w - 0.04, 0.05, 1.12, cx, 1.23, cz + 0.08, 0x6a5e52); // a sheet roof over the front
  board(
    k,
    g,
    k.atlas.board(`cont${n % CONTAINER_BOARDS.length}`, 256, 80, pick(CONTAINER_BOARDS, n)),
    1.5,
    0.42,
    cx - 0.4,
    0.75,
    cz + 0.47,
  );
}

function kiosk(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const w = grp.x1 - grp.x0 + 1 - 0.16;
  const d = grp.y1 - grp.y0 + 1 - 0.16;
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = (k.wz(grp.y0) + k.wz(grp.y1)) / 2;
  const c = pick(KIOSK_PAINT, n * 5 + 2);
  box(k, g, k.paint, w, 1.42, d, cx, 0, cz, c);
  box(k, g, k.paint, w + 0.02, 0.26, d + 0.02, cx, 0, cz, 0x4a4036);
  box(k, g, k.zinc, w + 0.2, 0.05, d + 0.22, cx, 1.44, cz + 0.04, 0x8a7e70, 0, 0.08);
  const zf = cz + d / 2;
  box(k, g, k.paint, Math.min(0.7, w * 0.6), 0.42, 0.04, cx, 0.78, zf, 0x18140f); // the serving hatch
  box(k, g, k.paint, Math.min(0.8, w * 0.7), 0.04, 0.16, cx, 0.76, zf + 0.06, 0x7a6248);
  box(k, g, k.glow, 0.08, 0.08, 0.08, cx, 1.16, zf + 0.04, 0xffd090);
  board(
    k,
    g,
    k.atlas.board(`kiosk${n % KIOSK_BOARDS.length}`, 256, 80, pick(KIOSK_BOARDS, n)),
    Math.min(w - 0.06, 1.3),
    0.26,
    cx,
    1.3,
    zf + 0.025,
  );
}

function stall(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const w = grp.x1 - grp.x0 + 1 - 0.1;
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = k.wz(grp.y0);
  box(k, g, k.paint, w, 1.05, 0.82, cx, 0, cz - 0.04, pick([0x6e5640, 0x5a6a5e, 0x7a5a3a], n));
  box(k, g, k.zinc, w + 0.16, 0.05, 1.05, cx, 1.18, cz + 0.02, 0x7a6a5c, 0, 0.22);
  box(k, g, k.paint, w, 0.05, 0.3, cx, 0.72, cz + 0.4, 0x8a6e4e); // the front counter
  for (let i = 0; i < Math.round(w * 4); i++)
    box(
      k,
      g,
      k.paint,
      0.14,
      0.12 + k.r() * 0.14,
      0.14,
      cx - w / 2 + 0.12 + i * 0.24,
      0.77,
      cz + 0.38,
      pick(KIOSK_PAINT, i + n * 3),
    );
}

function shed(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const w = grp.x1 - grp.x0 + 1 - 0.1;
  const d = grp.y1 - grp.y0 + 1 - 0.1;
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = (k.wz(grp.y0) + k.wz(grp.y1)) / 2;
  const back = d - 0.45; // a front apron inside the footprint for the tyres
  const bz = cz - 0.22;
  box(k, g, k.zinc, w, 1.5, back, cx, 0, bz, 0x8a5a3c);
  box(k, g, k.paint, w * 0.62, 1.2, 0.04, cx - w * 0.12, 0.02, bz + back / 2, 0x120f0c);
  box(k, g, k.zinc, w + 0.2, 0.05, back / 2 + 0.35, cx, 1.62, bz - back / 4, 0x6e6458, 0, -0.32);
  box(k, g, k.zinc, w + 0.2, 0.05, back / 2 + 0.45, cx, 1.62, bz + back / 4 + 0.12, 0x7a6e60, 0, 0.32);
  // tyres stacked in front, a compressor drum
  for (let i = 0; i < 4; i++)
    cyl(k, g, k.paint, 0.26, 0.26, 0.16, cx + w / 2 - 0.35, 0.02 + i * 0.17, cz + d / 2 - 0.25, 0x1a1a1a, 12);
  cyl(k, g, k.metal, 0.2, 0.2, 0.55, cx - w / 2 + 0.3, 0, cz + d / 2 - 0.22, 0x8a2e22, 10);
  board(
    k,
    g,
    k.atlas.board(`shed${n % SHED_BOARDS.length}`, 256, 80, pick(SHED_BOARDS, n)),
    Math.min(1.6, w - 0.2),
    0.42,
    cx,
    1.36,
    bz + back / 2 + 0.03,
  );
}

function lorry(k: Kit, g: number, grp: CoverGroup): void {
  const w = grp.x1 - grp.x0 + 1;
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = k.wz(grp.y0);
  // chassis, wheels, the cab at the east end (facing the traffic direction) and the container on the bed
  box(k, g, k.metal, w - 0.3, 0.16, 0.7, cx, 0.3, cz, 0x1e1e1e);
  for (const dx of [-w / 2 + 0.55, -w / 2 + 1.0, w / 2 - 0.65])
    for (const dz of [-0.36, 0.36])
      k.b.add(
        g,
        new CylinderGeometry(0.22, 0.22, 0.16, 12),
        k.paint,
        at(cx + dx, 0.22, cz + dz, 0, Math.PI / 2),
        0x151515,
      );
  box(k, g, k.paint, 0.85, 0.92, 0.92, cx + w / 2 - 0.55, 0.36, cz, 0x2e5a7a);
  box(k, g, k.metal, 0.05, 0.4, 0.8, cx + w / 2 - 0.12, 0.82, cz, 0x18222e); // windscreen
  box(k, g, k.paint, 0.86, 0.06, 0.94, cx + w / 2 - 0.55, 1.28, cz, 0x1a1a1a);
  box(k, g, k.zinc, w - 1.1, 1.05, 0.9, cx - 0.42, 0.46, cz, 0x8a3a26);
  // broken down: a jack under the bed, a red warning triangle behind it
  box(k, g, k.metal, 0.1, 0.25, 0.1, cx - 0.3, 0.05, cz + 0.2, 0xc02a1a);
  k.b.add(
    g,
    new CylinderGeometry(0.0, 0.16, 0.26, 3),
    k.glow,
    at(cx - w / 2 + 0.15, 0.13, cz + 0.3),
    0xd02010,
  );
}

function genHouse(k: Kit, g: number, grp: CoverGroup): void {
  const w = grp.x1 - grp.x0 + 1 - 0.12;
  const d = grp.y1 - grp.y0 + 1 - 0.12;
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = (k.wz(grp.y0) + k.wz(grp.y1)) / 2;
  box(k, g, k.concrete, w, 1.8, d, cx, 0, cz, 0xcfc4aa);
  box(k, g, k.paint, w + 0.01, 0.4, d + 0.01, cx, 1.4, cz, 0x4a4238); // soot along the top
  box(k, g, k.concrete, w + 0.16, 0.12, d + 0.16, cx, 1.8, cz, 0x8a8276);
  const zf = cz + d / 2;
  for (const dx of [-0.48, 0.48]) {
    box(k, g, k.metal, 0.82, 1.42, 0.04, cx + dx, 0.05, zf, 0x2e4a3a);
    for (let i = 0; i < 6; i++)
      box(k, g, k.paint, 0.66, 0.04, 0.03, cx + dx, 0.85 + i * 0.09, zf + 0.025, 0x141814);
  }
  board(
    k,
    g,
    k.atlas.board('gen', 256, 112, GEN_HOUSE_BOARD),
    0.95,
    0.42,
    cx + w / 2 - 0.6,
    1.62 - 0.2,
    zf + 0.04,
  );
  // the exhaust stack, sooted, and drums of diesel by the wall
  cyl(k, g, k.metal, 0.07, 0.07, 0.9, cx - w / 2 + 0.35, 1.8, cz - 0.2, 0x2a2622, 8);
  for (const [dx, c] of [
    [0.25, 0x8a2e22],
    [0.65, 0x2e4a7a],
  ] as const)
    cyl(k, g, k.metal, 0.2, 0.2, 0.58, cx - w / 2 + dx, 0, zf + 0.16, c, 10);
}

function skip(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const w = grp.x1 - grp.x0 + 1 - 0.12;
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = k.wz(grp.y0);
  const c = pick([0xc88a1c, 0x3a6a3a, 0x8a3a1e], n);
  box(k, g, k.metal, w - 0.4, 0.5, 0.66, cx, 0.06, cz, c);
  box(k, g, k.metal, w, 0.42, 0.86, cx, 0.5, cz, c);
  for (let i = 0; i < 6; i++)
    box(
      k,
      g,
      k.paint,
      0.3 + k.r() * 0.3,
      0.2 + k.r() * 0.2,
      0.3 + k.r() * 0.2,
      cx - w / 2 + 0.3 + i * (w / 6),
      0.82,
      cz + (k.r() - 0.5) * 0.4,
      pick([0x2a2622, 0x4a4a3a, 0x6a5a40, 0x1e2a3a, 0xd8d0c0], i + n),
    );
}

function dock(k: Kit, g: number, grp: CoverGroup): void {
  const d = grp.y1 - grp.y0 + 1;
  const cx = k.wx(grp.x0);
  const cz = (k.wz(grp.y0) + k.wz(grp.y1)) / 2;
  box(k, g, k.concrete, 0.96, 0.92, d - 0.04, cx, 0, cz, 0xa49c8e);
  // hazard stripes along the edge facing the bays (west) and rubber bumpers
  for (let i = 0; i < d * 4; i++)
    box(
      k,
      g,
      k.paint,
      0.02,
      0.14,
      0.24,
      cx - 0.49,
      0.74,
      cz - d / 2 + 0.12 + i * 0.25,
      i % 2 ? 0x1a1a1a : 0xe0b020,
    );
  for (let i = 0; i < d; i++)
    box(k, g, k.paint, 0.12, 0.3, 0.3, cx - 0.52, 0.3, cz - d / 2 + 0.5 + i, 0x141414);
  // sacks and cartons waiting on the dock
  for (let i = 0; i < 3; i++)
    box(
      k,
      g,
      k.paint,
      0.7,
      0.32 + i * 0.1,
      0.7,
      cx,
      0.92,
      cz - d / 2 + 0.8 + i * 1.6,
      pick([0xc8b48a, 0x8a6a46, 0xd8d0bc], i),
    );
}

/** Builds the whole board's cover (null if the board is not the 45 x 33 Ojuelegba grid). */
export function buildOjuelegbaCover(board: { width: number; height: number }): BoardCover | null {
  const groups = coverGroups();
  const W = board.width;
  const H = board.height;
  const b = new CoverBuilder(W, H);
  const dom = typeof document !== 'undefined';
  const atlas = new SignAtlas(51);
  const paint = b.own(
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.03, flatShading: true }),
  );
  const metal = b.own(
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45, flatShading: true }),
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
    metal,
    concrete,
    zinc,
    signs,
    glow,
    wx: (x) => x - W / 2 + 0.5,
    wz: (y) => y - H / 2 + 0.5,
    r: artRng(4517),
  };
  // one Danfo model (the GLB when loaded, else the procedural stand-in), baked once per bus
  const bus = assets.has('veh_danfo') || dom ? createVehicleModel('danfo') : null;
  const counts = new Map<string, number>();
  for (const grp of groups) {
    const n = counts.get(grp.kind) ?? 0;
    counts.set(grp.kind, n + 1);
    const g = b.group(grp.tiles, COVER_REACH[grp.kind]);
    switch (grp.kind) {
      case 'pier':
        pier(k, g, grp, n);
        break;
      case 'danfo':
        danfos(k, g, grp, n, 38, bus);
        break;
      case 'shop':
        shop(k, g, grp, n);
        break;
      case 'container':
        container(k, g, grp, n);
        break;
      case 'wall':
        wall(k, g, grp, n);
        break;
      case 'fence':
        fence(k, g, grp);
        break;
      case 'kiosk':
        kiosk(k, g, grp, n);
        break;
      case 'stall':
        stall(k, g, grp, n);
        break;
      case 'shed':
        shed(k, g, grp, n);
        break;
      case 'lorry':
        lorry(k, g, grp);
        break;
      case 'median':
        median(k, g, grp);
        break;
      case 'busStop':
        busStop(k, g, grp);
        break;
      case 'genHouse':
        genHouse(k, g, grp);
        break;
      case 'skip':
        skip(k, g, grp, n);
        break;
      case 'dock':
        dock(k, g, grp);
        break;
    }
  }
  const t = atlas.texture();
  if (t) {
    signs.map = t;
    b.own(t);
  }
  // the parked buses keep the vehicle weathering (paint, not plaster)
  bus?.root.traverse((o) => {
    const mm = (o as { material?: Material | Material[] }).material;
    if (mm) for (const x of Array.isArray(mm) ? mm : [mm]) b.grit(x, 'vehicle');
  });
  return b.build();
}
