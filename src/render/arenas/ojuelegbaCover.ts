/**
 * Ojuelegba Underbridge - the board's permanent cover drawn as the real things it is (presentation only;
 * which tile is what comes from `ojuelegbaCoverMap.ts`, collision from the sim layout). Every group is
 * one object: large hammerhead pier stubs with painted base bands (the overhead, `ojuelegbaDeck.ts`, carries
 * them on to the deck), whole parked Danfos packed nose-to-tail (the GLB model, yellow with the black band,
 * fictional route cards in the windscreens), shop buildings with fascia boards, half-open shutters and
 * doorway recesses, occupied buildings with windows, the repair workshops with roller shutters, the yard
 * wall, kerb islands and the railed refuge, kiosks, stalls, low lock-ups on the camera edge, tyre racks, the
 * bus stop, the generator house and a skip.
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
import { PIER_CUT, buildDeck } from './ojuelegbaDeck';
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
const CONTAINER_PAINT = [0x5a8aaa, 0xb2583a, 0x6a9a6a, 0xc0ae78];

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

function wall(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const has = new Set(grp.tiles.map(([x, y]) => `${x},${y}`));
  const plaster = pick(PLASTER, n * 3 + 1);
  grp.tiles.forEach(([x, y], i) => {
    const h = 1.42 - (i % 4 === 3 ? 0.1 : 0);
    box(k, g, k.concrete, 1, h, 1, k.wx(x), 0, k.wz(y), plaster);
    box(k, g, k.paint, 1.01, 0.32, 1.01, k.wx(x), 0, k.wz(y), 0x5e5040); // street dirt splashed up the base
    box(k, g, k.concrete, 1.0, 0.08, 1.06, k.wx(x), h, k.wz(y), 0x8a8478); // coping
    // bill posters on the faces the camera sees (south), every few blocks
    const pi = (i + n) % POSTERS.length;
    if (!has.has(`${x},${y + 1}`) && (x + y) % 3 === 0)
      board(
        k,
        g,
        k.atlas.board(`poster${pi}`, 96, 120, POSTERS[pi]!),
        0.4,
        0.5,
        k.wx(x),
        0.82,
        k.wz(y) + 0.51,
      );
  });
}

/** Occupied buildings: storeys by setting (tall on the far north perimeter), windows on the camera side. */
function building(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const has = new Set(grp.tiles.map(([x, y]) => `${x},${y}`));
  const far = grp.y0 === 0;
  for (const [x, y] of grp.tiles) {
    // every three or four tiles a different house: its own plaster, its own roofline
    const house = Math.floor((x + (far ? 0 : y)) / (far ? 4 : 3));
    const c = pick(PLASTER, house * 5 + n);
    const h = far ? 2.9 + (house % 2) * 0.2 : 2.3 + (house % 2) * 0.3;
    box(k, g, k.concrete, 1, h, 1, k.wx(x), 0, k.wz(y), c);
    box(k, g, k.concrete, 1.0, 0.14, 1.0, k.wx(x), h, k.wz(y), 0x7a7468);
    if (!has.has(`${x},${y + 1}`)) {
      const zf = k.wz(y) + 0.5;
      box(k, g, k.paint, 0.46, 0.5, 0.04, k.wx(x), h - 0.95, zf, 0x1c1a18); // window
      box(k, g, k.metal, 0.5, 0.06, 0.12, k.wx(x), h - 1.0, zf + 0.04, 0x6a6a66); // sill and burglar bars
      if (h > 2.8) box(k, g, k.paint, 0.46, 0.5, 0.04, k.wx(x), h - 1.95, zf, 0x1c1a18);
      if ((x * 7 + y) % 5 === 0)
        box(k, g, k.metal, 0.34, 0.26, 0.2, k.wx(x) + 0.2, h - 0.5, zf + 0.1, 0xb8b4aa); // AC unit
    }
  }
}

/** The repair workshops: a solid block with roller shutters and signboards facing the court (south). */
function workshop(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const has = new Set(grp.tiles.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of grp.tiles) {
    box(k, g, k.concrete, 1, 2.3, 1, k.wx(x), 0, k.wz(y), pick([0xb8a88a, 0xa8b0a4], n));
    box(k, g, k.zinc, 1.04, 0.06, 1.1, k.wx(x), 2.3, k.wz(y) + 0.04, 0x8a6e58, 0, 0.12);
    if (!has.has(`${x},${y + 1}`)) {
      const zf = k.wz(y) + 0.5;
      // roller shutters, some up (a dark bay), some down
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
        zf,
        up ? 0x15120f : 0x7c8488,
      );
    }
  }
  // the signboards along the front
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const zf = k.wz(grp.y1) + 0.5;
  const w = grp.x1 - grp.x0 + 1;
  for (let i = 0; i < Math.floor(w / 4); i++)
    board(
      k,
      g,
      k.atlas.board(`shed${(n * 2 + i) % SHED_BOARDS.length}`, 256, 80, pick(SHED_BOARDS, n * 2 + i)),
      2.2,
      0.5,
      cx - w / 2 + 2 + i * 4,
      1.9,
      zf + 0.04,
    );
}

/** Raised kerb islands (black-and-white kerbs, a bollard and a sign) and the railed crossing refuge. */
function island(k: Kit, g: number, grp: CoverGroup): void {
  const w = grp.x1 - grp.x0 + 1 - 0.08;
  const d = grp.y1 - grp.y0 + 1 - 0.08;
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = (k.wz(grp.y0) + k.wz(grp.y1)) / 2;
  box(k, g, k.concrete, w, 0.26, d, cx, 0, cz, 0x9a968c);
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
      cz + d / 2,
      i % 2 ? 0x1a1a1a : 0xe8e4da,
    );
  if (w > 2) {
    // the refuge: railings along both long sides
    for (const dz of [-d / 2 + 0.08, d / 2 - 0.08]) {
      box(k, g, k.metal, w - 0.1, 0.05, 0.05, cx, 0.95, cz + dz, 0xb8b0a0);
      for (let i = 0; i <= Math.round(w); i++)
        cyl(
          k,
          g,
          k.metal,
          0.03,
          0.03,
          0.72,
          cx - w / 2 + 0.05 + i * ((w - 0.1) / Math.round(w)),
          0.26,
          cz + dz,
          0xb8b0a0,
          6,
        );
    }
  } else {
    cyl(k, g, k.paint, 0.12, 0.14, 0.7, cx - 0.2, 0.26, cz, 0xd8d2c4, 8);
    cyl(k, g, k.metal, 0.03, 0.03, 1.4, cx + 0.25, 0.26, cz, 0x5a5a58, 6);
    box(k, g, k.paint, 0.4, 0.4, 0.03, cx + 0.25, 1.4, cz + 0.03, 0x1e4a8a);
  }
}

/** Low one-storey lock-ups along the near edge, kept under the fighters' eye line. */
function lockup(k: Kit, g: number, grp: CoverGroup): void {
  for (const [x, y] of grp.tiles) {
    const c = pick([0x8a7a64, 0x7a8478, 0x9a8466, 0x6e6a60], Math.floor(x / 3));
    box(k, g, k.concrete, 1, 1.05, 1, k.wx(x), 0, k.wz(y), c);
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

/** A tyre rack: a steel frame with used tyres stacked on it. */
function tyres(k: Kit, g: number, grp: CoverGroup): void {
  for (const [x, y] of grp.tiles) {
    box(k, g, k.metal, 0.9, 0.05, 0.6, k.wx(x), 0.5, k.wz(y), 0x3a3a38);
    for (const dx of [-0.42, 0.42]) box(k, g, k.metal, 0.05, 1.1, 0.6, k.wx(x) + dx, 0, k.wz(y), 0x3a3a38);
    for (let i = 0; i < 3; i++)
      for (const y0 of [0.3, 0.82])
        k.b.add(
          g,
          new CylinderGeometry(0.24, 0.24, 0.17, 12),
          k.paint,
          at(k.wx(x) - 0.25 + i * 0.25, y0, k.wz(y), 0, Math.PI / 2),
          0x181818,
        );
  }
}

// ------------------------------------------------------------------------------------ the bridge

function pier(k: Kit, g: number, grp: CoverGroup, n: number): void {
  const cx = (k.wx(grp.x0) + k.wx(grp.x1)) / 2;
  const cz = (k.wz(grp.y0) + k.wz(grp.y1)) / 2;
  const deep = grp.y1 - grp.y0 + 1;
  const zs = 0.82 * (deep > 2 ? 1.4 : 1);
  // tonal variation per pier: some recently repaired / painted, some weathered
  const tone = pick([0xb6ae9e, 0xa8a294, 0xc0b8a8], n);
  box(k, g, k.concrete, 1.94, 0.16, deep - 0.06, cx, 0, cz, 0x7e786e); // footing, stained
  box(k, g, k.paint, 2.0, 0.03, deep, cx, 0, cz, 0x2e2a24); // the wet ring round it
  // the column stub up to the cut (the overhead, ojuelegbaDeck.ts, carries it on to the deck)
  const shaft = PIER_CUT - 0.16;
  k.b.add(
    g,
    new CylinderGeometry(0.74, 0.8, shaft, 8),
    k.concrete,
    at(cx, 0.16 + shaft / 2, cz, Math.PI / 8, 0, 0, 1, 1, zs),
    tone,
  );
  // the painted base bands every Lagos bridge pier wears (black and white), worn
  for (let i = 0; i < 3; i++)
    k.b.add(
      g,
      new CylinderGeometry(0.815, 0.815, 0.2, 8),
      k.paint,
      at(cx, 0.2 + i * 0.2 + 0.1, cz, Math.PI / 8, 0, 0, 1, 1, zs),
      i % 2 ? 0xd8d4c8 : 0x1c1c1c,
    );
  // drainage stain down the south face and a band of bill posters
  const zf = cz + 0.74 * zs * 0.93;
  box(k, g, k.paint, 0.16, 1.4, 0.02, cx + 0.32, 0.8, zf, 0x3a3428);
  for (let i = 0; i < 2; i++)
    board(
      k,
      g,
      k.atlas.board(`poster${(n + i) % POSTERS.length}`, 96, 120, pick(POSTERS, n + i)),
      0.34,
      0.42,
      cx - 0.3 + i * 0.36,
      1.25,
      zf + 0.01,
    );
  // an LED tube on the south face (the under-bridge light)
  box(k, g, k.glow, 0.62, 0.05, 0.05, cx, 2.1, zf + 0.02, 0xe8f4ff);
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

/**
 * Parked Danfos: a 'D' group holds buses lying east-west (each row of the group packed nose-to-tail in
 * two-tile buses), an 'N' group buses lying north-south (each column packed nose-to-tail). `bus` is one
 * model, positioned per bus and baked.
 */
function danfos(k: Kit, g: number, grp: CoverGroup, n: number, ns: boolean, bus: VehicleModel | null): void {
  const root = bus?.root;
  const spots: { cx: number; cz: number; ry: number }[] = [];
  if (!ns)
    for (let y = grp.y0; y <= grp.y1; y++)
      for (let x = grp.x0; x + 1 <= grp.x1; x += 2)
        spots.push({ cx: (k.wx(x) + k.wx(x + 1)) / 2, cz: k.wz(y), ry: (x + y + n) % 3 === 0 ? Math.PI : 0 });
  else
    for (let x = grp.x0; x <= grp.x1; x++)
      for (let y = grp.y0; y + 1 <= grp.y1; y += 2)
        spots.push({
          cx: k.wx(x),
          cz: (k.wz(y) + k.wz(y + 1)) / 2,
          ry: (x + n) % 2 ? -Math.PI / 2 : Math.PI / 2,
        });
  spots.forEach((sp, i) => {
    const cx = sp.cx + (k.r() - 0.5) * 0.06;
    const cz = sp.cz + (k.r() - 0.5) * 0.06;
    const ry = sp.ry + (k.r() - 0.5) * 0.05;
    if (root) {
      root.position.set(cx, 0, cz);
      root.rotation.set(0, ry, 0);
      root.scale.setScalar(VEHICLE_SCALE);
      k.b.addObject(g, root);
    } else blockDanfo(k, g, cx, cz, ry);
    // the route card propped in the windscreen (the model faces +X before the turn)
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
  });
}

/** Stand-in bus when neither the GLB nor a canvas is available (tests): yellow body, the black band. */
function blockDanfo(k: Kit, g: number, cx: number, cz: number, ry: number): void {
  k.b.add(g, bx(2.0, 0.75, 1.04), k.paint, at(cx, 0.575, cz, ry), 0xf0b81a);
  k.b.add(g, bx(1.6, 0.48, 1.0), k.paint, at(cx, 1.19, cz, ry), 0xf0b81a);
  k.b.add(g, bx(2.02, 0.14, 1.06), k.paint, at(cx, 0.69, cz, ry), 0x141414);
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
  // steel shares the painted material (vertex colours): one draw call fewer per chunk and pass
  const metal = paint;
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
    // fade groups: long objects fade in sections of four columns (a bus is never split: buses start on even
    // columns of their group), so one fighter behind a long building does not dissolve the whole row
    const sections = new Map<number, [number, number][]>();
    for (const t of grp.tiles) {
      const key = Math.floor((t[0] - grp.x0) / 4);
      sections.set(key, [...(sections.get(key) ?? []), t]);
    }
    const ids = [...sections.values()].map((tiles) => b.group(tiles, COVER_REACH[grp.kind]));
    const g = ids[0]!;
    switch (grp.kind) {
      case 'pier':
        pier(k, g, grp, n);
        break;
      case 'shop':
        shop(k, g, grp, n);
        break;
      case 'building':
        building(k, g, grp, n);
        break;
      case 'workshop':
        workshop(k, g, grp, n);
        break;
      case 'container':
        container(k, g, grp, n);
        break;
      case 'wall':
        wall(k, g, grp, n);
        break;
      case 'island':
        island(k, g, grp);
        break;
      case 'kiosk':
        kiosk(k, g, grp, n);
        break;
      case 'stall':
        stall(k, g, grp, n);
        break;
      case 'lockup':
        lockup(k, g, grp);
        break;
      case 'shed':
        shed(k, g, grp, n);
        break;
      case 'tyres':
        tyres(k, g, grp);
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
      case 'danfo':
      case 'danfoNS':
        danfos(k, g, grp, n, grp.kind === 'danfoNS', bus);
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
  const cover = b.build();
  // the flyover's outer edges, crossheads and upper pier shafts overhead (cut away round the fighter)
  const deck = buildDeck(
    W,
    H,
    groups.filter((g) => g.kind === 'pier'),
  );
  cover.object.add(deck.object);
  const dispose = cover.dispose.bind(cover);
  return {
    ...cover,
    object: cover.object,
    dispose() {
      dispose();
      deck.dispose();
    },
  };
}
