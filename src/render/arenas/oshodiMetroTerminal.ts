/**
 * Oshodi Transport Metropolis - the interchange megastructures (presentation only, all OFF the board, north
 * and east of it; the camera side stays low). Shapes follow the visually inspected references:
 *
 * - TWO RING-FRAMED TERMINALS: oval drums whose glass core is caged by black steel ribs and horizontal rings,
 *   a flat roof, a blue bay skirt (aerial and night references of the round terminals);
 * - a TERMINAL 3 FRONTAGE: a tall glass wall under a sloping black truss roof;
 * - the TRUSS SKYWALK: a long covered black truss girder on cable-stayed lattice pylons, with a big truss
 *   portal frame over it;
 * - a FREIGHT SIDING on the east side: a rake of grain and container wagons beside the commuter viaduct;
 * - the MARKET EDGE: a sea of trader umbrellas and low stalls beyond the west edge.
 *
 * Boards say only plain terminal wording ("TERMINAL 2", "TERMINAL 3", "BUS BAYS"); no real brand, bank, telco,
 * operator or logo. Everything goes into `ctx.statics` (baked into a few merged meshes), so the extra pieces
 * cost triangles, not draw calls.
 */
import { BoxGeometry, CylinderGeometry, DoubleSide, PlaneGeometry, Vector3 } from 'three';
import type { CanvasTexture, Material, Mesh } from 'three';
import { box, cyl, mat, mesh, uniqueMat } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import { painted, umbrella } from './oshodiKit';
import type { SiteLights } from './roadworksKit';
import { tileWorld } from './rumbleV2Kit';
import type { TimeOfDay } from '../timeOfDay';

const hasDom = (): boolean => typeof document !== 'undefined';

function pal() {
  return {
    steel: mat(0x1d1f22, { roughness: 0.5, metalness: 0.65 }), // the black structural steel
    steelGrey: mat(0x4a4e52, { roughness: 0.5, metalness: 0.6 }),
    glass: mat(0x5f93b8, { roughness: 0.18, metalness: 0.5, emissive: 0x1d4a6e, emissiveIntensity: 0.6 }),
    glassWarm: mat(0xe8c27a, { roughness: 0.3, emissive: 0xf0b050, emissiveIntensity: 0.9 }),
    core: mat(0x1c2a36, { roughness: 0.3, metalness: 0.4, emissive: 0x8a6a30, emissiveIntensity: 0.55 }),
    asphalt: mat(0x2c2d30, { roughness: 1 }),
    paintWhite: mat(0xe4e0d0, { roughness: 0.9 }),
    blue: mat(0x2a7fb8, { roughness: 0.4, metalness: 0.2 }),
    roof: mat(0x8c8a82, { roughness: 0.9 }),
    concrete: mat(0xa4a09a, { roughness: 1 }),
    white: mat(0xdedacd, { roughness: 0.8 }),
    yellow: mat(0xe0ae28, { roughness: 0.65 }),
    cable: mat(0xb8b6ae, { roughness: 0.4, metalness: 0.5 }),
  };
}
type Pal = ReturnType<typeof pal>;

/** A beam of square section `t` from `a` to `b` (any orientation). */
function strut(ctx: SetContext, a: Vector3, b: Vector3, t: number, m: Material): void {
  const len = a.distanceTo(b);
  const g = new BoxGeometry(t, t, len);
  const o: Mesh = mesh(g, m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  o.lookAt(b);
  ctx.statics.add(o);
}
const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

function plate(ctx: SetContext, map: CanvasTexture | null, w: number, h: number, p: Vector3, ry = 0): void {
  if (!map) return;
  const m = uniqueMat(0xffffff, { map, roughness: 0.82, flat: false });
  m.side = DoubleSide;
  ctx.own(m);
  const o = mesh(new PlaneGeometry(w, h), m, p.x, p.y, p.z);
  o.rotation.y = ry;
  ctx.statics.add(o);
}

function sign(key: string, w: number, h: number, bg: string, fg: string, lines: string[]): CanvasTexture {
  return painted(
    `oshodi:term:${key}`,
    w,
    h,
    (g, r) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round((h / lines.length) * 0.6)}px system-ui, sans-serif`;
      lines.forEach((t, i) => g.fillText(t, w / 2, ((i + 0.5) * h) / lines.length + 2, w * 0.94));
      for (let i = 0; i < 80; i++) {
        g.fillStyle = `rgba(24,20,14,${r() * 0.18})`;
        g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 3);
      }
    },
    false,
    57,
  );
}

// ------------------------------------------------------------------------------------ ring terminal

/**
 * One ring-framed oval terminal: a glass drum (a stretched cylinder) caged by black ribs and three horizontal
 * rings, a flat roof with a parapet ring and a blue bay skirt on the camera side. Centre (cx, cz), radii (a, b).
 */
function ringTerminal(
  ctx: SetContext,
  P: Pal,
  cx: number,
  cz: number,
  a: number,
  b: number,
  h: number,
  ribs: number,
): void {
  const s = ctx.statics;
  const core = mesh(new CylinderGeometry(1, 1, h, 28), P.core, cx, h / 2, cz);
  core.scale.set(a * 0.94, 1, b * 0.94);
  s.add(core);
  const roof = mesh(new CylinderGeometry(1, 1, 0.5, 28), P.steelGrey, cx, h + 0.25, cz);
  roof.scale.set(a * 1.02, 1, b * 1.02);
  s.add(roof);
  const pt = (t: number, k = 1): [number, number] => [cx + Math.cos(t) * a * k, cz + Math.sin(t) * b * k];
  // vertical ribs and the diagonal bracing between neighbours
  for (let i = 0; i < ribs; i++) {
    const t0 = (i / ribs) * Math.PI * 2;
    const t1 = ((i + 1) / ribs) * Math.PI * 2;
    const [x0, z0] = pt(t0);
    const [x1, z1] = pt(t1);
    strut(ctx, V(x0, 0.2, z0), V(x0, h + 1.6, z0), 0.46, P.steel);
    strut(ctx, V(x0, 0.4, z0), V(x1, h * 0.55, z1), 0.2, P.steel);
    strut(ctx, V(x0, h * 0.55, z0), V(x1, h - 0.1, z1), 0.2, P.steel);
    for (const y of [h * 0.3, h * 0.62, h, h + 1.5]) strut(ctx, V(x0, y, z0), V(x1, y, z1), 0.3, P.steel);
  }
  // the parapet ring
  for (let i = 0; i < ribs; i++) {
    const [x0, z0] = pt((i / ribs) * Math.PI * 2, 1.02);
    const [x1, z1] = pt(((i + 1) / ribs) * Math.PI * 2, 1.02);
    strut(ctx, V(x0, h + 0.9, z0), V(x1, h + 0.9, z1), 0.14, P.steel);
  }
  // the blue bay skirt: a sloping canopy ring on the near (camera) half, on slim posts
  const skirt = 1.6;
  for (let i = 0; i < Math.floor(ribs / 2); i++) {
    const t0 = Math.PI * (i / (ribs / 2));
    const t1 = Math.PI * ((i + 1) / (ribs / 2));
    const [xi0, zi0] = pt(t0, 1.0);
    const [xi1, zi1] = pt(t1, 1.0);
    const [xo0, zo0] = [cx + Math.cos(t0) * (a + skirt), cz + Math.sin(t0) * (b + skirt)];
    const [xo1, zo1] = [cx + Math.cos(t1) * (a + skirt), cz + Math.sin(t1) * (b + skirt)];
    const mx = (xi0 + xi1 + xo0 + xo1) / 4;
    const mz = (zi0 + zi1 + zo0 + zo1) / 4;
    const seg = Math.hypot(xo1 - xo0, zo1 - zo0) + 0.15;
    const slab = mesh(new BoxGeometry(seg, 0.1, skirt), P.blue, mx, 3.3, mz);
    slab.rotation.y = -Math.atan2(zo1 - zo0, xo1 - xo0);
    s.add(slab);
    strut(ctx, V(xo0, STREET, zo0), V(xo0, 3.25, zo0), 0.1, P.steelGrey);
  }
}

// ------------------------------------------------------------------------------- terminal 3 frontage

/** A tall glass frontage under a sloping black truss roof (the roof rises towards the camera side). */
function frontage(ctx: SetContext, P: Pal, x0: number, x1: number, zFront: number, depth: number): void {
  const s = ctx.statics;
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  const wallH = 8.0;
  s.add(box(w, wallH, 0.2, P.glass, cx, wallH / 2, zFront - depth));
  s.add(box(0.2, wallH, depth, P.glass, x0, wallH / 2, zFront - depth / 2));
  s.add(box(0.2, wallH, depth, P.glass, x1, wallH / 2, zFront - depth / 2));
  s.add(box(w, 0.4, depth, P.concrete, cx, 0.2, zFront - depth / 2));
  // mullions
  for (let x = x0; x <= x1 + 0.01; x += 1.2)
    s.add(box(0.08, wallH, 0.12, P.steel, x, wallH / 2, zFront - depth + 0.12));
  // the sloping truss roof: a high back edge, a low front edge, three truss lines with zig-zag diagonals
  const yBack = wallH + 3.2;
  const yFront = wallH + 0.6;
  const zBack = zFront - depth - 0.6;
  const zF = zFront + 1.8;
  for (const f of [0, 0.5, 1]) {
    const x = x0 + w * f;
    strut(ctx, V(x, yBack, zBack), V(x, yFront, zF), 0.28, P.steel); // top chord
    strut(ctx, V(x, yBack - 1.3, zBack), V(x, yFront - 0.9, zF), 0.2, P.steel); // bottom chord
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const pa = (t: number, lo: boolean): Vector3 =>
        V(x, yBack + (yFront - yBack) * t - (lo ? 1.3 - 0.4 * t : 0), zBack + (zF - zBack) * t);
      strut(ctx, pa(t0, i % 2 === 0), pa(t1, i % 2 !== 0), 0.1, P.steel);
    }
  }
  // purlins and the roof skin
  for (let x = x0; x <= x1 + 0.01; x += w / 12)
    strut(ctx, V(x, yBack, zBack), V(x, yFront, zF), 0.09, P.steel);
  const skin = mesh(
    new BoxGeometry(w, 0.12, Math.hypot(zF - zBack, yBack - yFront)),
    P.roof,
    cx,
    (yBack + yFront) / 2 + 0.1,
    (zBack + zF) / 2,
  );
  skin.rotation.x = Math.atan2(yBack - yFront, zF - zBack) * -1;
  s.add(skin);
  // two A-frame end legs
  for (const x of [x0 - 0.4, x1 + 0.4]) {
    strut(ctx, V(x, 0, zF - 0.4), V(x, yFront, zF), 0.4, P.steel);
    strut(ctx, V(x, 0, zBack + 1.2), V(x, yBack, zBack), 0.4, P.steel);
  }
  if (hasDom()) {
    const t = sign('t3', 512, 96, '#e8b82a', '#16140f', ['TERMINAL 3']);
    plate(ctx, t, 7.5, 1.4, V(cx, wallH + 0.9, zFront + 1.95));
  }
}

// ------------------------------------------------------------------------------- truss skywalk + pylons

/** A lattice pylon (four legs narrowing to the head) with its cable fan to a girder. Returns the head. */
function pylon(
  ctx: SetContext,
  P: Pal,
  x: number,
  z: number,
  height: number,
  girder: { y: number; z: number },
  reach: number,
): void {
  const w0 = 2.4;
  const w1 = 0.7;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      strut(
        ctx,
        V(x + sx * w0, 0, z + sz * w0 * 0.6),
        V(x + sx * w1, height, z + sz * w1 * 0.6),
        0.34,
        P.steel,
      );
  for (let y = 2; y < height; y += 2.6) {
    const k = 1 - y / height;
    const w = w1 + (w0 - w1) * k;
    for (const sz of [-1, 1])
      strut(ctx, V(x - w, y, z + sz * w * 0.6), V(x + w, y, z + sz * w * 0.6), 0.16, P.steel);
    strut(ctx, V(x - w, y, z - w * 0.6), V(x + w, y + 1.3, z + w * 0.6), 0.1, P.steel);
  }
  // the cable fan to the girder on both sides
  for (let i = 1; i <= 5; i++) {
    for (const s of [-1, 1])
      strut(
        ctx,
        V(x, height - 0.4 * i, z),
        V(x + (s * reach * i) / 5, girder.y + 0.3, girder.z),
        0.06,
        P.cable,
      );
  }
}

/**
 * The long covered black truss skywalk along the north edge (z centre `z`), from x0 to x1 at deck height `y`,
 * on cable-stayed pylons, with a glazed side and a roof.
 */
function skywalk(ctx: SetContext, P: Pal, x0: number, x1: number, z: number, y: number): void {
  const s = ctx.statics;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  s.add(box(len, 0.35, 2.6, P.steelGrey, cx, y, z)); // deck
  s.add(box(len, 0.14, 3.0, P.steel, cx, y + 2.9, z)); // roof
  s.add(box(len, 0.7, 0.08, P.glass, cx, y + 0.65, z + 1.28));
  s.add(box(len, 0.7, 0.08, P.glass, cx, y + 0.65, z - 1.28));
  // truss girders under the deck and along the roof edge (zig-zag diagonals)
  for (const dz of [-1.3, 1.3]) {
    strut(ctx, V(x0, y - 0.9, z + dz), V(x1, y - 0.9, z + dz), 0.18, P.steel);
    strut(ctx, V(x0, y + 0.1, z + dz), V(x1, y + 0.1, z + dz), 0.18, P.steel);
    strut(ctx, V(x0, y + 2.9, z + dz), V(x1, y + 2.9, z + dz), 0.18, P.steel);
    const bay = 2.4;
    for (let x = x0; x + bay <= x1 + 0.01; x += bay) {
      const up = Math.round((x - x0) / bay) % 2 === 0;
      strut(
        ctx,
        V(x, up ? y - 0.9 : y + 0.1, z + dz),
        V(x + bay, up ? y + 0.1 : y - 0.9, z + dz),
        0.1,
        P.steel,
      );
      strut(ctx, V(x, y + 0.1, z + dz), V(x, y + 2.9, z + dz), 0.1, P.steel);
    }
  }
  // round piers under the span
  for (let x = x0 + 4; x < x1 - 2; x += 9) {
    s.add(cyl(0.45, 0.55, y - 0.9 - STREET, P.concrete, x, STREET + (y - 0.9 - STREET) / 2, z, 8));
  }
  // cable-stayed lattice pylons
  for (const px of [-7, 25]) pylon(ctx, P, px, z - 2.6, 19, { y, z }, 8);
}

/** The big truss portal: two lattice towers and a triangular-section truss over the skywalk, facing the camera. */
function trussPortal(ctx: SetContext, P: Pal, x: number, z: number, span: number, top: number): void {
  const half = span / 2;
  for (const sx of [-1, 1]) {
    const bx = x + sx * half;
    for (const dz of [-0.9, 0.9])
      strut(ctx, V(bx - 0.6 * sx, 0, z + dz), V(bx, top, z + dz * 0.6), 0.38, P.steel);
    for (let y = 1.5; y < top; y += 2.2)
      strut(ctx, V(bx - 0.5 * sx, y, z - 0.8), V(bx - 0.5 * sx, y + 1.1, z + 0.8), 0.12, P.steel);
  }
  for (const [dy, dz] of [
    [0, -0.9],
    [0, 0.9],
    [1.5, 0],
  ] as const)
    strut(ctx, V(x - half, top + dy, z + dz), V(x + half, top + dy, z + dz), 0.3, P.steel);
  const bay = 2.0;
  for (let px = x - half; px + bay <= x + half + 0.01; px += bay) {
    const k = Math.round((px - (x - half)) / bay) % 2 === 0;
    strut(ctx, V(px, top, z - 0.9), V(px + bay, top + 1.5, z), 0.1, P.steel);
    strut(ctx, V(px, top + 1.5, z), V(px + bay, top, z + 0.9), 0.1, P.steel);
    strut(ctx, V(px, top, k ? z + 0.9 : z - 0.9), V(px + bay, top, k ? z - 0.9 : z + 0.9), 0.08, P.steel);
  }
}

// -------------------------------------------------------------------------------------- freight + market

/** A rake of freight wagons (grain hoppers and containers) on a siding beside the east edge. */
function freightSiding(ctx: SetContext, P: Pal, x: number, z0: number, z1: number): void {
  const s = ctx.statics;
  const bed = mat(0x6a6a64, { roughness: 1 });
  s.add(box(3.4, 0.16, z1 - z0, bed, x, 0.08, (z0 + z1) / 2)); // ballast bed
  for (const dx of [-0.72, 0.72]) s.add(box(0.1, 0.18, z1 - z0, P.cable, x + dx, 0.22, (z0 + z1) / 2)); // rails
  for (let z = z0 + 0.4; z < z1; z += 0.7) s.add(box(2.2, 0.08, 0.2, P.steel, x, 0.2, z)); // sleepers
  const paints = [0x6a6a66, 0x8a5a3a, 0x5a6a7a, 0x7a7a52, 0x6a3a30];
  let z = z0 + 1.5;
  let i = 0;
  while (z + 6.4 < z1) {
    const len = 6.0;
    const zc = z + len / 2;
    const c = paints[i % paints.length]!;
    if (i % 3 === 2) {
      // a flat wagon carrying a shipping container
      s.add(box(2.4, 0.4, len, P.steelGrey, x, 0.65, zc));
      s.add(box(2.3, 2.5, len - 0.6, mat(c, { roughness: 0.8 }), x, 2.15, zc));
      for (let k = 0; k < 6; k++) s.add(box(0.06, 2.4, 0.08, P.steel, x - 1.16, 2.15, z + 0.9 + k * 0.9));
    } else {
      // a covered hopper: a tapering body with roof hatches
      s.add(box(2.5, 2.4, len, mat(c, { roughness: 0.85 }), x, 2.0, zc));
      s.add(box(2.3, 0.4, len - 1.0, mat(c, { roughness: 0.85 }), x, 3.4, zc));
      for (const dz of [-1.6, 0, 1.6]) s.add(cyl(0.4, 0.4, 0.3, P.steelGrey, x, 3.75, zc + dz, 8));
    }
    for (const dz of [-2.1, 2.1]) s.add(box(2.3, 0.5, 1.0, P.steel, x, 0.45, zc + dz)); // bogies
    z += len + 0.3;
    i++;
  }
}

/** The market edge: a sea of trader umbrellas and low table stalls beyond the west edge. */
function marketEdge(ctx: SetContext, P: Pal): void {
  const { W, H, rng } = ctx;
  const { wz } = tileWorld(W, H);
  const cols = [0xc8442e, 0xe0b020, 0x2a6aa8, 0x2e8a4a, 0xd8d2bc, 0x8a3a8a, 0xe07a2a];
  const mats = cols.map((c) => mat(c, { roughness: 0.8 }));
  const wood = mat(0x7a5a3a, { roughness: 0.9 });
  let n = 0;
  for (let ty = 1; ty < H - 1; ty += 1) {
    if (ty >= 14 && ty <= 19) continue; // the main road mouth stays clear
    for (let k = 0; k < 3; k++) {
      const x = -W / 2 - 2.2 - k * 2.0 - rng() * 0.9;
      const z = wz(ty) + (rng() - 0.5) * 0.7;
      if (rng() < 0.2) continue;
      umbrella(ctx, x, z, 0.95 + rng() * 0.2, mats[n % mats.length]!, mats[(n + 3) % mats.length]!, {
        tilt: (rng() - 0.5) * 0.2,
      });
      ctx.statics.add(box(1.0, 0.7, 0.7, wood, x, STREET + 0.35, z + 0.2));
      n++;
    }
  }
  void P;
}

// ------------------------------------------------------------------------------------- approach roads

/** The wide approach road beyond both mouths of the main road: asphalt, kerbs and lane dashes (rows 15-18). */
function approachRoads(ctx: SetContext, P: Pal): void {
  const { W, H } = ctx;
  const { wz } = tileWorld(W, H);
  const z0 = wz(15) - 0.5;
  const z1 = wz(18) + 0.5;
  const zc = (z0 + z1) / 2;
  const s = ctx.statics;
  for (const side of [-1, 1]) {
    const xa = (W / 2) * side;
    const xb = xa + side * 52;
    const cx = (xa + xb) / 2;
    s.add(box(52, 0.05, z1 - z0 + 3, P.asphalt, cx, STREET + 0.02, zc));
    for (const kz of [z0 - 0.1, z1 + 0.1]) s.add(box(52, 0.12, 0.3, P.paintWhite, cx, STREET + 0.06, kz));
    for (let x = Math.min(xa, xb) + 1; x < Math.max(xa, xb) - 1; x += 3.2)
      for (const dz of [-1, 0, 1]) s.add(box(1.4, 0.03, 0.1, P.paintWhite, x, STREET + 0.05, zc + dz));
  }
}

// ---------------------------------------------------------------------------------------- entry point

/**
 * All the megastructures. Positions are world metres; the board spans x +-W/2, z +-H/2 (tiles are 1 m).
 * The expressway deck (see `oshodiMetroLandmarks.ts`) runs behind at z = north - 12.2.
 */
export function interchangeMegastructures(ctx: SetContext, L: SiteLights, tod: TimeOfDay): void {
  const { W, H } = ctx;
  const P = pal();
  const north = -H / 2;
  const night = tod === 'night';
  // the two ring-framed terminals in front of the expressway (the rail viaduct passes between them at x 12-16)
  ringTerminal(ctx, P, -12.5, north - 8.6, 12, 4.3, 10, 28);
  ringTerminal(ctx, P, 6, north - 8.2, 5, 3.6, 8.5, 16);
  // the Terminal 3 frontage east of the station tower
  frontage(ctx, P, 26, 44, north - 2.4, 5.2);
  // the long truss skywalk behind the rings, its pylons, and the big portal frame over it
  skywalk(ctx, P, -24, 36, north - 16, 10);
  trussPortal(ctx, P, -1, north - 16, 22, 15);
  // freight siding beyond the east edge, from the viaduct south
  freightSiding(ctx, P, W / 2 + 10.5, north + 2, H / 2 - 2);
  marketEdge(ctx, P);
  approachRoads(ctx, P);
  if (hasDom()) {
    const t2 = sign('t2', 512, 96, '#12304e', '#f4f2ea', ['TERMINAL 2']);
    plate(ctx, t2, 7.2, 1.35, V(-12.5, 7.4, north - 4.3));
    const t1 = sign('t1b', 512, 96, '#12304e', '#f4f2ea', ['BUS BAYS 1 – 12']);
    plate(ctx, t1, 5.2, 0.98, V(6, 6.2, north - 4.5));
  }
  // lit cores glow by night, and softly by day
  const k = night ? 1 : 0.45;
  L.glow(-12.5, 3.6, north - 4.0, 3.2, 0x9ed0ff, 0.7 * k);
  L.glow(6, 3.2, north - 4.3, 2.8, 0x9ed0ff, 0.65 * k);
  L.glow(35, 5.0, north - 0.4, 3.0, 0xffe2b0, 0.6 * k);
  L.glow(-1, 15.6, north - 16, 1.2, 0xff3a2a, night ? 0.9 : 0.4);
}
