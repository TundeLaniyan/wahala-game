/**
 * Lekki Roadworks structures (presentation only): the half-built concrete frame with exposed
 * rebar, formwork and blockwork; scaffolding with torn debris netting; corrugated site hoarding;
 * open trenches with shoring; the tower crane; the site office container; the Lekki skyline.
 */
import { DoubleSide, Group, LatheGeometry, Mesh, PlaneGeometry, Vector2 } from 'three';
import type { Material, MeshStandardMaterial } from 'three';
import { artRng, corrugatedTexture, towerWindowsTexture } from '../textures';
import { box, cyl, mat, mesh, uniqueMat } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import type { SitePalette, SiteLights } from './roadworksKit';
import { bar, beam, lampMat, mound, tiltedBox, uvScale, v3 } from './roadworksKit';
import { blockworkTexture, nettingTexture, siteBoardTexture } from './roadworksTextures';

const FLOOR = 2.4;

/** Sandcrete blockwork (shared material; the geometry's UVs are scaled to 1 repeat per metre). */
function blockWall(m: Material, w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
  const b = box(w, h, d, m, x, y, z);
  uvScale(b.geometry, w, h);
  return b;
}

/** Four starter bars sticking out of a column head, slightly splayed and bent. */
function starters(g: Group, m: Material, x: number, y: number, z: number, len = 0.9): void {
  for (const [dx, dz] of [
    [-0.09, -0.09],
    [0.09, -0.09],
    [-0.09, 0.09],
    [0.09, 0.09],
  ] as const) {
    const top = v3(x + dx * 1.6, y + len, z + dz * 1.6);
    g.add(bar(v3(x + dx, y, z + dz), top, 0.016, m, 4));
    if (dx > 0 && dz > 0) g.add(bar(top, top.clone().add(v3(0.18, -0.08, 0)), 0.016, m, 4));
  }
}

/**
 * A reinforced-concrete frame under construction from x0 to x1, front face at zFront, `bays`
 * deep: two finished floors, the third floor's columns half cast with their rebar cages and the
 * deck still on formwork and props; blockwork infill going up on the ground floor.
 */
export function concreteFrame(
  ctx: SetContext,
  P: SitePalette,
  L: SiteLights,
  at: { x: number; z: number; ry: number },
  len: number,
  depth: number,
): void {
  const g = new Group();
  // built in a local frame: front face at z = 0 (facing +Z), x from -len/2 to len/2
  const x0 = -len / 2;
  const x1 = len / 2;
  const zFront = 0;
  const blocks = mat(0x9a968e, { map: blockworkTexture(), roughness: 1, flat: false });
  const nx = Math.max(2, Math.round((x1 - x0) / 2.3));
  const xs = Array.from({ length: nx + 1 }, (_, i) => x0 + ((x1 - x0) * i) / nx);
  const zs = [zFront, zFront - depth / 2, zFront - depth];
  const cx = (x0 + x1) / 2;
  for (let level = 0; level < 2; level++) {
    const y0 = STREET + level * FLOOR;
    for (const x of xs)
      for (const z of zs) g.add(box(0.3, FLOOR - 0.22, 0.3, P.concrete, x, y0 + FLOOR / 2 - 0.11, z));
    // slab with a downstand edge beam; the second deck stops short of the east bay
    const short = level === 1 ? (x1 - x0) / nx : 0;
    const sw = x1 - x0 + 0.5 - short;
    g.add(box(sw, 0.2, depth + 0.5, P.concrete, cx - short / 2, y0 + FLOOR - 0.1, zFront - depth / 2));
    g.add(box(sw, 0.36, 0.3, P.concreteDark, cx - short / 2, y0 + FLOOR - 0.28, zFront + 0.1));
    // slab-edge bars left for the next pour
    for (let x = x0 - 0.1; x < x1 - short; x += 0.3)
      g.add(
        bar(
          v3(x, y0 + FLOOR - 0.05, zFront + 0.25),
          v3(x + 0.04, y0 + FLOOR - 0.1, zFront + 0.75),
          0.012,
          P.rebar,
          4,
        ),
      );
  }
  // ground-floor blockwork: two bays walled, one half-built (stepped courses), one open
  const gy = STREET;
  g.add(blockWall(blocks, xs[1]! - xs[0]! - 0.3, 2.0, 0.2, (xs[0]! + xs[1]!) / 2, gy + 1.0, zFront - depth));
  g.add(blockWall(blocks, xs[1]! - xs[0]! - 0.3, 1.2, 0.2, (xs[0]! + xs[1]!) / 2, gy + 0.6, zFront));
  if (xs.length > 3) {
    g.add(blockWall(blocks, 1.4, 0.8, 0.2, xs[2]! - 0.8, gy + 0.4, zFront));
    g.add(blockWall(blocks, 0.9, 0.4, 0.2, xs[2]! + 0.35, gy + 0.2, zFront));
  }
  // third floor: stub columns with rebar cages, plywood deck on props over two bays
  const top = STREET + FLOOR * 2;
  for (const x of xs) {
    for (const z of [zs[0]!, zs[2]!]) {
      const stub = x < cx ? 1.1 : 0.3;
      g.add(box(0.3, stub, 0.3, P.concreteFresh, x, top + stub / 2, z));
      starters(g, P.rebar, x, top + stub, z, x < cx ? 0.8 : 1.6);
    }
  }
  g.add(
    box(
      xs[2]! - xs[0]! + 0.3,
      0.05,
      depth + 0.3,
      P.ply,
      (xs[0]! + xs[2]!) / 2,
      top + 2.0,
      zFront - depth / 2,
    ),
  );
  for (let x = xs[0]! + 0.5; x < xs[2]!; x += 0.9)
    for (const z of [zFront - 0.4, zFront - depth + 0.4])
      g.add(cyl(0.03, 0.03, 1.95, P.tube, x, top + 1.0, z, 5)); // acrow props
  // a rebar mat being tied on the deck: a grid of bars
  for (let k = 0; k < 9; k++) {
    const x = xs[0]! + 0.2 + k * ((xs[2]! - xs[0]! - 0.4) / 8);
    g.add(bar(v3(x, top + 2.06, zFront + 0.1), v3(x, top + 2.06, zFront - depth - 0.1), 0.01, P.rebar, 3));
  }
  for (let k = 0; k < 6; k++) {
    const z = zFront - (k * depth) / 5;
    g.add(bar(v3(xs[0]!, top + 2.08, z), v3(xs[2]!, top + 2.08, z), 0.01, P.rebar, 3));
  }
  // materials stored on the decks
  g.add(blockWall(blocks, 0.9, 0.6, 0.7, xs[1]! + 0.4, STREET + FLOOR + 0.3, zFront - depth + 0.6));
  g.add(box(1.8, 0.08, 0.4, P.ply, xs[0]! + 1.2, STREET + FLOOR + 0.04, zFront - 0.6));

  // a bare work lamp hanging under the first deck, a welder on the second
  const lx = (xs[1]! + xs[2]!) / 2;
  const ly = STREET + FLOOR - 0.55;
  g.add(box(0.012, 0.35, 0.012, P.black, lx, ly + 0.2, zFront - depth / 2));
  g.add(box(0.14, 0.12, 0.14, lampMat(0xffb060, 2.4), lx, ly, zFront - depth / 2));
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.ry;
  ctx.statics.add(g);
  g.updateMatrixWorld(true);
  const w = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(g.matrixWorld);
  const lamp = w(lx, ly, zFront - depth / 2 + 0.2);
  L.glow(lamp.x, lamp.y, lamp.z, 1.8, 0xff9a40, 0.8);
  L.beam(w(lx, ly, zFront - depth / 2), w(lx, STREET, zFront - depth / 2), 1.3, 0xffa050, 0.035);
  const arc = w(xs[3] ?? xs[2]!, STREET + FLOOR + 0.45, zFront - 0.3);
  L.beacon(arc.x, arc.y, arc.z, 0xcfe0ff, 1.2, 'arc');
}

/**
 * A scaffold run `len` long (along local X) and `w` deep, `lifts` boarded lifts high, with ledgers,
 * transoms, zig-zag face bracing, toe boards, a ladder and torn debris netting on part of the face.
 */
export function scaffold(
  ctx: SetContext,
  P: SitePalette,
  x: number,
  z: number,
  len: number,
  w: number,
  lifts: number,
  ry: number,
  netFrom = 0.45,
): void {
  const g = new Group();
  const lift = 1.6;
  const h = lifts * lift + 0.9;
  const n = Math.max(1, Math.round(len / 1.8));
  const step = len / n;
  for (let i = 0; i <= n; i++) {
    const sx = -len / 2 + i * step;
    for (const sz of [0, -w]) g.add(box(0.05, h, 0.05, P.tube, sx, STREET + h / 2, sz));
    g.add(box(0.14, 0.03, 0.14, P.steel, sx, STREET + 0.015, 0)); // base plates
  }
  for (let l = 1; l <= lifts; l++) {
    const y = STREET + l * lift;
    for (const sz of [0, -w]) {
      g.add(box(len, 0.045, 0.045, P.tube, 0, y, sz));
      g.add(box(len, 0.045, 0.045, P.tube, 0, y + 0.95, sz)); // guard rail
    }
    for (let i = 0; i <= n; i++) g.add(box(0.045, 0.045, w + 0.2, P.tube, -len / 2 + i * step, y, -w / 2));
    g.add(box(len, 0.04, w - 0.06, P.timber, 0, y + 0.04, -w / 2));
    g.add(box(len, 0.15, 0.025, P.timber, 0, y + 0.12, 0.03));
    // face brace across each bay, alternating
    for (let i = 0; i < n; i++) {
      const a = -len / 2 + i * step;
      const up = (i + l) % 2 === 0;
      g.add(
        bar(
          v3(a, y - lift + (up ? 0 : lift), 0.05),
          v3(a + step, y - (up ? 0 : lift), 0.05),
          0.022,
          P.tube,
          4,
        ),
      );
    }
  }
  // ladder between lifts at the west end
  const lxp = -len / 2 + step * 0.5;
  for (const lx of [lxp - 0.2, lxp + 0.2])
    g.add(box(0.04, lifts * lift, 0.04, P.rust, lx, STREET + (lifts * lift) / 2, -w * 0.3));
  for (let y = 0.3; y < lifts * lift; y += 0.3)
    g.add(box(0.4, 0.03, 0.03, P.rust, lxp, STREET + y, -w * 0.3));
  // debris netting: hung on the face from netFrom along the run, torn and sagging
  const netM = uniqueMat(0xffffff, { map: nettingTexture(), roughness: 1, flat: false });
  netM.alphaTest = 0.45;
  netM.side = DoubleSide;
  ctx.own(netM);
  const nw = len * (1 - netFrom);
  const net = new Mesh(uvScale(new PlaneGeometry(nw, h - 0.3, 6, 4), nw / 2.4, (h - 0.3) / 2.4), netM);
  const pos = net.geometry.attributes.position!;
  for (let i = 0; i < pos.count; i++)
    pos.setZ(i, 0.08 * Math.sin(pos.getX(i) * 2.1) + 0.04 * Math.cos(pos.getY(i) * 3));
  net.position.set(len / 2 - nw / 2, STREET + (h - 0.3) / 2 + 0.3, 0.1);
  net.castShadow = true;
  net.receiveShadow = true;
  g.add(net);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

/**
 * Corrugated site hoarding from (x0, z0) to (x1, z1): sheets on timber posts, faded paint, a sheet
 * missing here and there, a red-and-white band at the foot.
 */
export function hoarding(
  ctx: SetContext,
  P: SitePalette,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  paint: number,
  seed = 1,
): void {
  const map = corrugatedTexture();
  const sheet = mat(paint, { map, roughness: 0.7, metalness: 0.45, flat: false });
  const galv = mat(0x8a8a84, { map, roughness: 0.55, metalness: 0.6, flat: false });
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.2));
  const g = new Group();
  const r = artRng(seed);
  for (let i = 0; i < n; i++) {
    const roll = r();
    if (roll < 0.07) continue; // a gap where a sheet was stolen
    const sx = -len / 2 + (i + 0.5) * (len / n);
    const sh = h - (roll < 0.2 ? 0.25 : 0);
    const s = box(len / n + 0.04, sh, 0.03, roll < 0.25 ? galv : sheet, sx, STREET + sh / 2, 0);
    uvScale(s.geometry, 1, sh / 1.2);
    s.rotation.y = (r() - 0.5) * 0.04;
    s.rotation.z = (r() - 0.5) * 0.02;
    g.add(s);
  }
  for (let i = 0; i <= n; i += 2)
    g.add(box(0.1, h + 0.1, 0.1, P.timber, -len / 2 + i * (len / n), STREET + h / 2, -0.07));
  g.add(box(len, 0.06, 0.08, P.timber, 0, STREET + h - 0.2, -0.07));
  g.add(box(len, 0.22, 0.035, P.red, 0, STREET + 0.25, 0.02));
  g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  g.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
  ctx.statics.add(g);
}

/** The contractor's safety board on two posts, facing +Z after `ry`. */
export function siteBoard(ctx: SetContext, P: SitePalette, x: number, z: number, ry: number, w = 1.6): void {
  const m = mat(0xffffff, { map: siteBoardTexture(), roughness: 0.85, flat: false });
  const g = new Group();
  const board = new Mesh(new PlaneGeometry(w, w / 2), m);
  board.position.set(0, STREET + 1.25, 0.04);
  board.castShadow = true;
  g.add(board, box(w + 0.06, w / 2 + 0.06, 0.04, P.steel, 0, STREET + 1.25, 0));
  for (const sx of [-w / 2 + 0.1, w / 2 - 0.1])
    g.add(box(0.08, 1.5, 0.08, P.steel, sx, STREET + 0.75, -0.05));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

/**
 * An open service trench (length along local X, `w` wide) centred at (x, z): a black wet floor
 * with standing water, the far cut face in red earth, timber shoring with steel struts, a broken
 * asphalt lip, a spoil berm and, optionally, a run of concrete pipe waiting in the cut.
 */
export function trench(
  ctx: SetContext,
  P: SitePalette,
  x: number,
  z: number,
  len: number,
  w: number,
  ry: number,
  seed = 0,
): void {
  const g = new Group();
  const y = STREET;
  g.add(box(len, 0.02, w, P.mud, 0, y + 0.01, 0));
  g.add(box(len * 0.55, 0.012, w * 0.6, P.water, len * 0.1, y + 0.024, 0.05));
  // far face (seen by the camera) rising to the berm, then the spoil heap behind it
  g.add(tiltedBox(len, 0.62, 0.06, P.laterite, 0, y + 0.24, -w / 2 - 0.08, -0.62));
  g.add(box(len + 0.2, 0.06, 0.26, P.concrete, 0, y + 0.47, -w / 2 - 0.32));
  const r = artRng(55 + seed);
  // the spoil berm: one long heap of dug red earth with a few slumped lumps of sand on it
  g.add(mound(P.laterite, 0, y + 0.05, -w / 2 - 0.62, 0.75, 0.48, seed, len / 1.6));
  for (let k = 0; k < Math.max(1, Math.round(len / 3)); k++)
    g.add(
      mound(
        P.sand,
        -len / 2 + 1.2 + k * 2.9 + r() * 0.5,
        y + 0.1,
        -w / 2 - 0.8,
        0.6,
        0.42,
        seed + k + 7,
        1.6,
      ),
    );
  // near lip: cut asphalt edge, slightly lifted and broken
  for (let k = 0; k < Math.round(len / 0.8); k++)
    g.add(
      tiltedBox(
        0.78,
        0.08,
        0.22,
        P.concreteDark,
        -len / 2 + 0.4 + k * 0.8,
        y + 0.04,
        w / 2 + 0.1,
        (r() - 0.5) * 0.12,
        (r() - 0.5) * 0.08,
        (r() - 0.5) * 0.1,
      ),
    );
  // shoring: vertical boards on the far face, a waler, steel struts across
  for (let sx = -len / 2 + 0.4; sx < len / 2; sx += 0.9) {
    g.add(tiltedBox(0.22, 0.45, 0.03, P.timber, sx, y + 0.2, -w / 2 + 0.07, -0.45));
    g.add(bar(v3(sx, y + 0.14, -w / 2 + 0.12), v3(sx, y + 0.12, w / 2 - 0.04), 0.025, P.tube, 5));
  }
  g.add(tiltedBox(len - 0.4, 0.08, 0.05, P.timber, 0, y + 0.24, -w / 2 + 0.11, -0.45));
  // pipe sections waiting in the cut, and a ladder out
  const pipe = new LatheGeometry(
    [
      new Vector2(0.2, -0.55),
      new Vector2(0.26, -0.55),
      new Vector2(0.26, 0.55),
      new Vector2(0.2, 0.55),
      new Vector2(0.2, -0.55),
    ],
    18,
  );
  const p1 = mesh(pipe, P.pipe, -len / 4, y + 0.27, 0);
  p1.rotation.z = Math.PI / 2;
  g.add(p1);
  for (const lx of [len / 2 - 0.6, len / 2 - 0.25])
    g.add(tiltedBox(0.04, 1.1, 0.04, P.rust, lx, y + 0.4, 0.05, -0.35));
  for (let k = 0; k < 4; k++)
    g.add(box(0.36, 0.03, 0.03, P.rust, len / 2 - 0.42, y + 0.12 + k * 0.24, 0.07 + k * 0.08));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

/** A luffing-free hammerhead tower crane: lattice mast, slewing cab, jib, counter-jib and weights. */
export function towerCrane(
  ctx: SetContext,
  P: SitePalette,
  L: SiteLights,
  x: number,
  z: number,
  ry: number,
): void {
  const g = new Group();
  const H = 17;
  const s = 0.42;
  for (const [cx, cz] of [
    [-s, -s],
    [s, -s],
    [-s, s],
    [s, s],
  ] as const)
    g.add(box(0.08, H, 0.08, P.plant, cx, STREET + H / 2, cz));
  for (let yy = 0; yy < H - 1; yy += 1.4) {
    g.add(beam(v3(-s, STREET + yy, s), v3(s, STREET + yy + 1.4, s), 0.04, 0.04, P.plant));
    g.add(beam(v3(s, STREET + yy, -s), v3(s, STREET + yy + 1.4, s), 0.04, 0.04, P.plant));
    g.add(beam(v3(-s, STREET + yy, -s), v3(-s, STREET + yy + 1.4, s), 0.04, 0.04, P.plant));
  }
  g.add(box(1.2, 0.4, 1.2, P.concrete, 0, STREET + 0.2, 0));
  const top = STREET + H;
  g.add(box(1.1, 0.5, 1.1, P.plant, 0, top + 0.25, 0));
  g.add(box(0.9, 0.9, 0.9, P.glass, 0.75, top - 0.1, 0.4));
  // jib (towards +X) and counter-jib with concrete weights
  const jl = 15;
  g.add(
    box(jl, 0.08, 0.08, P.plant, jl / 2, top + 0.5, -0.3),
    box(jl, 0.08, 0.08, P.plant, jl / 2, top + 0.5, 0.3),
  );
  g.add(box(jl, 0.08, 0.08, P.plant, jl / 2, top + 1.3, 0));
  for (let k = 0; k < jl; k += 1.2)
    g.add(beam(v3(k, top + 0.5, 0), v3(k + 0.6, top + 1.3, 0), 0.04, 0.04, P.plant));
  g.add(box(5, 0.35, 0.8, P.plant, -2.5, top + 0.55, 0));
  g.add(box(1.4, 1.3, 0.9, P.concreteDark, -4.2, top + 0.0, 0));
  g.add(box(0.2, 3.0, 0.2, P.plant, 0, top + 1.9, 0));
  g.add(bar(v3(0, top + 3.4, 0), v3(jl * 0.8, top + 1.3, 0), 0.02, P.black, 4));
  g.add(bar(v3(0, top + 3.4, 0), v3(-4.5, top + 0.7, 0), 0.02, P.black, 4));
  // trolley, hook and hanging load: a rebar bundle on slings
  const hx = 7.5;
  g.add(box(0.5, 0.2, 0.7, P.black, hx, top + 0.35, 0));
  g.add(bar(v3(hx, top + 0.3, 0), v3(hx, top - 8.5, 0), 0.012, P.black, 3));
  g.add(box(0.3, 0.35, 0.2, P.plant, hx, top - 8.7, 0));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
  // red aviation light on the apex
  g.updateMatrixWorld(true);
  const apex = v3(0, top + 3.5, 0).applyMatrix4(g.matrixWorld);
  L.glow(apex.x, apex.y, apex.z, 1.2, 0xff2a1a, 1);
  const tip = v3(jl, top + 0.6, 0).applyMatrix4(g.matrixWorld);
  L.glow(tip.x, tip.y, tip.z, 0.9, 0xff2a1a, 0.9);
}

/** A converted shipping container used as the site office: ribbed walls, door, lit window, AC unit. */
export function siteOffice(
  ctx: SetContext,
  P: SitePalette,
  L: SiteLights,
  x: number,
  z: number,
  ry: number,
): void {
  const g = new Group();
  const W = 4.2;
  const H = 2.1;
  const D = 2.0;
  const steel = mat(0x4a5a64, { map: corrugatedTexture(), roughness: 0.7, metalness: 0.45, flat: false });
  const body = box(W, H, D, steel, 0, STREET + H / 2 + 0.15, 0);
  uvScale(body.geometry, 4, 1);
  g.add(body);
  g.add(box(W + 0.1, 0.1, D + 0.1, P.rust, 0, STREET + H + 0.2, 0));
  for (const sx of [-W / 2 + 0.5, W / 2 - 0.5]) g.add(box(0.45, 0.15, D, P.timber, sx, STREET + 0.075, 0)); // blocks under it
  // facing +Z: door, window with a warm light behind dirty glass, AC unit, steps
  g.add(box(0.8, 1.7, 0.04, P.steel, -1.2, STREET + 1.05, D / 2 + 0.02));
  g.add(box(1.2, 0.6, 0.03, lampMat(0xffb868, 1.2), 0.6, STREET + 1.45, D / 2 + 0.02));
  for (let k = 0; k < 4; k++)
    g.add(box(1.2, 0.025, 0.04, P.black, 0.6, STREET + 1.2 + k * 0.16, D / 2 + 0.04)); // burglary bars
  g.add(box(0.7, 0.45, 0.4, P.white, 1.6, STREET + 1.75, D / 2 + 0.2));
  g.add(box(0.9, 0.2, 0.6, P.timber, -1.2, STREET + 0.1, D / 2 + 0.35));
  g.add(box(0.24, 0.1, 0.12, lampMat(0xfff0d0, 2.2), -1.2, STREET + 2.0, D / 2 + 0.08));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
  g.updateMatrixWorld(true);
  const win = v3(0.6, STREET + 1.45, D / 2 + 0.2).applyMatrix4(g.matrixWorld);
  L.glow(win.x, win.y, win.z, 1.6, 0xffa050, 0.55);
  const door = v3(-1.2, STREET + 2.0, D / 2 + 0.2).applyMatrix4(g.matrixWorld);
  L.glow(door.x, door.y, door.z, 1.1, 0xfff0d0, 0.8);
  L.beam(door, v3(-1.2, STREET, D / 2 + 1.0).applyMatrix4(g.matrixWorld), 1.0, 0xfff0d0, 0.03);
}

/** The Lekki skyline far behind the works: glass towers with lit offices (fog blues them). */
export function skyline(ctx: SetContext, P: SitePalette, north: number): void {
  const facades: MeshStandardMaterial[] = [0, 1, 2, 3].map((k) => {
    const map = towerWindowsTexture(k);
    const m = mat(0x9fb6d8, {
      map,
      emissive: 0xffffff,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.4,
      flat: false,
    });
    m.emissiveMap = map;
    return m;
  });
  const r = artRng(909);
  for (let i = 0; i < 10; i++) {
    const w = 3 + r() * 3;
    const d = 3 + r() * 2;
    const h = 12 + r() * 18;
    const x = -38 + i * 8.5 + (r() - 0.5) * 3;
    const z = north - 24 - r() * 14;
    const tower = box(w, h, d, facades[i % 4]!, x, h / 2 - 0.3, z);
    uvScale(tower.geometry, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 6)));
    tower.castShadow = false;
    ctx.statics.add(tower);
    ctx.statics.add(box(w * 0.6, 0.8, d * 0.6, P.black, x, h + 0.1, z));
  }
}
