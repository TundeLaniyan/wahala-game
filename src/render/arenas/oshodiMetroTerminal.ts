/**
 * Oshodi Transport Metropolis - the interchange megastructures (presentation only, all OFF the board, north
 * and east of it; the camera side stays low). Shapes follow the visually inspected references:
 *
 * - TWO OPEN INTERCHANGE TERMINALS: deep black-steel roof truss frames on tall columns over painted bus bays,
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
import { BoxGeometry, DoubleSide, PlaneGeometry, Vector3 } from 'three';
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
    apron: mat(0x55564f, { roughness: 1 }),
    roofSkin: mat(0x6a7482, { roughness: 0.6, metalness: 0.4 }),
    black: mat(0x1a1a1c, { roughness: 0.8 }),
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

// ----------------------------------------------------------------------------- open interchange terminal

/**
 * A massive OPEN bus interchange (after the inspected terminal references): a deep black-steel roof truss frame
 * on tall columns over the bus bays, skylit roof panels with gaps so the interior depth shows from above, a lit
 * glass frontage at the back of the hall, painted bays with parked buses, and a lower blue bay canopy on the
 * board side. `zFront` is the front (board-side) edge of the roof; the hall runs `depth` metres north of it.
 */
function openTerminal(
  ctx: SetContext,
  P: Pal,
  x0: number,
  x1: number,
  zFront: number,
  depth: number,
  roofH: number,
): void {
  const s = ctx.statics;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const zBack = zFront - depth;
  const zc = (zFront + zBack) / 2;
  const bays = mat(0xe0ae28, { roughness: 0.8 });
  // the apron with painted bay lines, parked buses (blue BRT-style and yellow danfos) in most bays
  s.add(box(w, 0.1, depth, P.apron, cx, STREET + 0.05, zc));
  let i = 0;
  for (let x = x0 + 2.2; x < x1 - 1.4; x += 3.7) {
    s.add(box(0.12, 0.03, depth * 0.72, bays, x + 1.85, STREET + 0.12, zFront - depth * 0.38));
    if (i % 4 !== 3) {
      const body = i % 2 === 0 ? P.blue : P.yellow;
      const bz = zFront - 4.4 - (i % 3) * 0.6;
      s.add(box(2.35, 2.2, 7.2, body, x, STREET + 1.25, bz));
      s.add(box(2.4, 0.7, 7.0, P.steel, x, STREET + 1.7, bz)); // window band
      s.add(box(2.2, 0.12, 6.8, P.white, x, STREET + 2.4, bz)); // roof
    }
    i++;
  }
  // the lit glass frontage at the back of the hall, with mullions and a deep dark back wall behind it
  s.add(box(w, 7.4, 0.3, P.concrete, cx, 3.7, zBack - 0.2));
  s.add(box(w - 0.6, 5.6, 0.14, P.glass, cx, 3.3, zBack + 0.5));
  s.add(box(w - 1.0, 0.5, 2.2, P.glassWarm, cx, 6.5, zBack + 1.4)); // the lit ceiling band inside the hall
  for (let x = x0 + 0.3; x <= x1 - 0.2; x += 1.25) s.add(box(0.1, 5.8, 0.16, P.steel, x, 3.3, zBack + 0.6));
  // tall black columns with painted bases: a front row and a row inside the hall
  const colX: number[] = [];
  for (let x = x0 + 0.6; x <= x1 - 0.5; x += 6.2) colX.push(x);
  for (const x of colX)
    for (const z of [zFront - 0.4, zBack + 3.4]) {
      strut(ctx, V(x, 0, z), V(x, roofH - 1.0, z), 0.5, P.steel);
      s.add(cyl(0.55, 0.55, 0.3, P.black, x, STREET + 0.15, z, 8));
      s.add(cyl(0.55, 0.55, 0.3, P.white, x, STREET + 0.45, z, 8));
    }
  // the roof: two longitudinal trusses (front and rear), transverse Warren trusses over the bays between them
  const top = roofH;
  const bot = roofH - 1.5;
  for (const z of [zFront + 0.6, zBack + 1.2]) {
    strut(ctx, V(x0, top, z), V(x1, top, z), 0.34, P.steel);
    strut(ctx, V(x0, bot, z), V(x1, bot, z), 0.34, P.steel);
    for (let x = x0; x + 2.0 <= x1 + 0.01; x += 2.0) {
      const up = Math.round((x - x0) / 2.0) % 2 === 0;
      strut(ctx, V(x, up ? bot : top, z), V(x + 2.0, up ? top : bot, z), 0.14, P.steel);
    }
  }
  const tx: number[] = [];
  for (let x = x0; x <= x1 + 0.01; x += 3.1) tx.push(x);
  for (const x of tx) {
    strut(ctx, V(x, top, zFront + 0.6), V(x, top, zBack + 1.2), 0.2, P.steel);
    strut(ctx, V(x, bot, zFront + 0.6), V(x, bot, zBack + 1.2), 0.2, P.steel);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const za = zFront + 0.6 + (zBack + 1.2 - zFront - 0.6) * t0;
      const zb = zFront + 0.6 + (zBack + 1.2 - zFront - 0.6) * t1;
      strut(ctx, V(x, k % 2 === 0 ? bot : top, za), V(x, k % 2 === 0 ? top : bot, zb), 0.1, P.steel);
    }
  }
  // roof skin in panels with skylight gaps, so the depth of the hall reads from above
  for (let k = 0; k + 1 < tx.length; k++) {
    const pw = (tx[k + 1]! - tx[k]!) * 0.58;
    s.add(box(pw, 0.14, depth + 1.2, P.roofSkin, tx[k]! + pw / 2 + 0.15, top + 0.2, zc + 0.3));
  }
  // deep front fascia beam and the lower blue bay canopy on the board side
  s.add(box(w, 0.9, 0.35, P.steel, cx, top - 0.2, zFront + 0.9));
  s.add(box(w, 0.12, 2.4, P.blue, cx, 3.7, zFront + 0.9));
  for (const x of colX) strut(ctx, V(x, 0, zFront + 1.9), V(x, 3.65, zFront + 1.9), 0.12, P.steelGrey);
  // diagonal A-frame buttresses at both ends
  for (const [x, dx] of [
    [x0 - 0.2, -1.8],
    [x1 + 0.2, 1.8],
  ] as const) {
    strut(ctx, V(x + dx, 0, zFront + 0.4), V(x, roofH, zFront + 0.4), 0.45, P.steel);
    strut(ctx, V(x + dx, 0, zBack + 1.4), V(x, roofH, zBack + 1.4), 0.45, P.steel);
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
  openTerminal(ctx, P, -26, -1, north - 3, 9.5, 12);
  openTerminal(ctx, P, 1, 11, north - 3, 8, 10);
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
    plate(ctx, t2, 8, 1.45, V(-13.5, 12.9, north - 2.0));
    const t1 = sign('t1b', 512, 96, '#12304e', '#f4f2ea', ['BUS BAYS 1 – 12']);
    plate(ctx, t1, 5.2, 0.98, V(6, 10.9, north - 2.0));
  }
  // lit halls glow by night, and softly by day
  const k = night ? 1 : 0.45;
  L.glow(-19, 4.2, north - 8, 3.4, 0xffe2b0, 0.8 * k);
  L.glow(-8, 4.2, north - 8, 3.4, 0xffe2b0, 0.8 * k);
  L.glow(6, 4.0, north - 7, 3.0, 0xffe2b0, 0.7 * k);
  L.glow(35, 5.0, north - 0.4, 3.0, 0xffe2b0, 0.6 * k);
  L.glow(-1, 15.6, north - 16, 1.2, 0xff3a2a, night ? 0.9 : 0.4);
}
