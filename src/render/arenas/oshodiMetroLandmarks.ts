/**
 * Oshodi Transport Metropolis - the landmarks that make the stage read as a layered transport nexus
 * (presentation only; the grid is `src/sim/arenas/rumbleOshodi.ts`). Everything here stands OFF the board,
 * north of it or beyond its side streets, and the camera (south) side stays low:
 *
 * - the interchange's terminal canopy and hall north of the plaza: a deep concrete canopy slab on tall columns
 *   over the bus queues, a lit glass hall behind it and the big INTERCHANGE name on the fascia;
 * - the elevated expressway behind it: a box-girder deck on twin-column bents with barriers, lamp standards, a
 *   green direction gantry and a billboard (its traffic is the living environment, `render/env`);
 * - two covered skywalk spans linking the terminal to a station tower over the north edge, on round piers;
 * - the commuter-rail viaduct: the railway leaves the board's north portal and runs on north on a viaduct,
 *   with the station tower and its forecourt canopy to the east;
 * - the skyline: a row of towers of different heights with window grids and red mast lights;
 * - the Cappa Ground's floodlight masts on the east side (lit at night, a soft glow by day).
 *
 * Boards say place names and plain station / terminal wording only; every other name is fictional and no real
 * brand, bank, telco, operator or logo appears. Static pieces go into `ctx.statics` (baked into a few merged
 * meshes); textures are cached canvases, and without a DOM (tests) the boards are left out.
 */
import { BoxGeometry, DoubleSide, PlaneGeometry } from 'three';
import type { CanvasTexture } from 'three';
import { concreteTexture } from '../textures';
import { box, cyl, mat, mesh, uniqueMat } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import { painted } from './oshodiKit';
import type { SiteLights } from './roadworksKit';
import { tileWorld } from './rumbleV2Kit';
import type { TimeOfDay } from '../timeOfDay';

const hasDom = (): boolean => typeof document !== 'undefined';
/** Deck surface of the elevated expressway above street level (the living environment's traffic rides on it). */
const DECK_TOP = 7.4;
const DECK_SOFFIT = 5.9;

function palette() {
  const conc = hasDom() ? concreteTexture() : undefined;
  return {
    concrete: mat(0xa4a09a, { map: conc, roughness: 1, flat: false }),
    concreteLight: mat(0xc2beb4, { map: conc, roughness: 1, flat: false }),
    concreteDark: mat(0x6a6660, { map: conc, roughness: 1, flat: false }),
    white: mat(0xdedacd, { roughness: 0.8 }),
    black: mat(0x1c1c1c, { roughness: 0.75 }),
    steel: mat(0x50524e, { roughness: 0.55, metalness: 0.6 }),
    steelLight: mat(0x8c8e8a, { roughness: 0.5, metalness: 0.55 }),
    yellow: mat(0xe0ae28, { roughness: 0.65 }),
    blue: mat(0x16304e, { roughness: 0.6, metalness: 0.3 }),
    glass: mat(0x5a8ab0, { roughness: 0.2, metalness: 0.5, emissive: 0x1a3a58, emissiveIntensity: 0.55 }),
    rail: mat(0x7a7e82, { roughness: 0.4, metalness: 0.7 }),
    red: mat(0xb83a2a, { roughness: 0.6 }),
  };
}
type Pal = ReturnType<typeof palette>;

/** A grid of lit and dark windows on a plain facade (night lights more of them). */
function facadeTexture(key: string, tod: TimeOfDay, seed: number, tint: string): CanvasTexture {
  return painted(
    `oshodi:${key}:${tod}`,
    128,
    256,
    (g, r) => {
      g.fillStyle = tint;
      g.fillRect(0, 0, 128, 256);
      const lit = tod === 'night' ? 0.5 : 0.14;
      for (let y = 8; y < 248; y += 16)
        for (let x = 8; x < 120; x += 14) {
          const on = r() < lit;
          g.fillStyle = on ? (r() < 0.5 ? '#f6dc9a' : '#cfe4f4') : 'rgba(18,28,40,0.78)';
          g.fillRect(x, y, 8, 10);
        }
      for (let i = 0; i < 140; i++) {
        g.fillStyle = r() < 0.6 ? `rgba(20,18,14,${r() * 0.16})` : `rgba(235,226,200,${r() * 0.1})`;
        g.fillRect(r() * 128, r() * 256, 2 + r() * 8, 2 + r() * 14);
      }
    },
    true,
    seed,
  );
}

/** A plain painted fascia board (bold lettering on a flat colour, weathered). */
function fasciaTexture(
  key: string,
  w: number,
  h: number,
  bg: string,
  fg: string,
  lines: string[],
): CanvasTexture {
  return painted(
    `oshodi:fascia:${key}`,
    w,
    h,
    (g, r) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const size = (h / lines.length) * 0.58;
      g.font = `bold ${Math.round(size)}px system-ui, sans-serif`;
      lines.forEach((t, i) => g.fillText(t, w / 2, ((i + 0.5) * h) / lines.length + 2, w * 0.94));
      for (let i = 0; i < 120; i++) {
        g.fillStyle = r() < 0.6 ? `rgba(24,20,14,${r() * 0.2})` : `rgba(235,226,200,${r() * 0.14})`;
        g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 4);
      }
    },
    false,
    31,
  );
}

function board(
  ctx: SetContext,
  map: CanvasTexture | null,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
): void {
  if (!map) return;
  const m = uniqueMat(0xffffff, { map, roughness: 0.82, flat: false });
  m.side = DoubleSide;
  ctx.own(m);
  const p = mesh(new PlaneGeometry(w, h), m, x, y, z);
  p.rotation.y = ry;
  ctx.statics.add(p);
}

// -------------------------------------------------------------------------------------- terminal

/**
 * The terminal canopy and hall north of the plaza (tile columns 9-21 -> world x -13 .. -1): a deep slab on tall
 * columns over the bus queues with the INTERCHANGE fascia, and a lit glass hall behind it.
 */
export function terminalCanopy(ctx: SetContext, L: SiteLights, tod: TimeOfDay): void {
  const { H } = ctx;
  const P = palette();
  const s = ctx.statics;
  const north = -H / 2;
  const x0 = -15.5;
  const x1 = -0.5;
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  const zf = north - 1.6; // front edge of the canopy
  const zb = north - 8.2; // back wall of the hall
  const zc = (zf + zb) / 2;
  const deep = zf - zb;
  const roofY = 5.3;
  s.add(box(w, 0.4, deep, P.concreteDark, cx, roofY, zc)); // the canopy slab
  s.add(box(w, 0.26, 0.5, P.concreteLight, cx, roofY + 0.02, zf + 0.1)); // fascia edge
  for (let x = x0 + 0.5; x <= x1 - 0.4; x += 3)
    s.add(box(0.5, 0.5, deep - 0.3, P.concrete, x, roofY - 0.4, zc)); // soffit ribs
  // tall columns along the front edge and a row behind, with painted base bands
  for (const z of [zf - 0.4, zf - 3.6])
    for (let x = x0 + 1; x <= x1 - 0.5; x += 3.5) {
      s.add(cyl(0.34, 0.4, roofY - 0.2 - STREET, P.concrete, x, STREET + (roofY - 0.2 - STREET) / 2, z, 8));
      s.add(cyl(0.43, 0.43, 0.24, P.black, x, STREET + 0.12, z, 8));
      s.add(cyl(0.43, 0.43, 0.24, P.white, x, STREET + 0.36, z, 8));
    }
  // the lit glass hall behind it: a long low block with a glazed front and a plant deck
  s.add(box(w - 1.2, 3.4, 3.4, P.concrete, cx, 1.7, zb + 1.7));
  s.add(box(w - 2.0, 1.5, 0.12, P.glass, cx, 1.9, zb + 3.45));
  for (let x = x0 + 1; x < x1; x += 1.6) s.add(box(0.07, 1.6, 0.1, P.steel, x, 1.9, zb + 3.5));
  s.add(box(w - 1.6, 0.9, 1.2, P.concreteLight, cx, 3.85, zb + 1.7)); // plant deck
  // the big name on the fascia, facing the camera
  if (hasDom()) {
    const tex = fasciaTexture('interchange', 1024, 192, '#12304e', '#f4f2ea', [
      'INTERCHANGE  ·  TERMINALS 1 2 3',
    ]);
    board(ctx, tex, w - 1.0, (w - 1.0) * (192 / 1024), cx, roofY + 0.9, zf + 0.42);
    const gates = fasciaTexture('bays', 512, 96, '#e8b82a', '#16140f', ['BUS BAYS 1 – 12']);
    board(ctx, gates, 4.2, 0.8, x0 + 3.6, 3.3, zf + 0.28);
  }
  // roof mast and a red warning light
  s.add(cyl(0.05, 0.08, 4.2, P.steel, x1 - 1.4, roofY + 2.4, zb + 1.2, 6));
  L.glow(x1 - 1.4, roofY + 4.55, zb + 1.2, 0.7, 0xff3a2a, tod === 'night' ? 0.9 : 0.4);
  L.glow(cx - 3, roofY - 0.5, zf - 0.6, 2.0, 0xe8f4ff, tod === 'night' ? 0.55 : 0.28);
  L.glow(cx + 3, roofY - 0.5, zf - 0.6, 2.0, 0xe8f4ff, tod === 'night' ? 0.55 : 0.28);
}

// ------------------------------------------------------------------------------------ expressway

/** The elevated expressway running east-west behind the terminal (deck centre z = north - 12.2). */
export function expressway(ctx: SetContext, L: SiteLights): void {
  const { W, H } = ctx;
  const P = palette();
  const s = ctx.statics;
  const north = -H / 2;
  const zc = north - 12.2;
  const width = 6.6;
  const len = W + 110;
  const cx = 0;
  const at = (
    w: number,
    h: number,
    d: number,
    m: Pal[keyof Pal],
    x: number,
    yBottom: number,
    z: number,
  ): void => {
    s.add(box(w, h, d, m, x, yBottom + h / 2, z));
  };
  at(len, 0.42, width, P.concrete, cx, DECK_TOP - 0.42, zc);
  for (const dz of [-2.4, 0, 2.4]) at(len, 0.9, 0.9, P.concreteDark, cx, DECK_SOFFIT, zc + dz);
  for (const side of [-1, 1]) {
    const ez = zc + side * (width / 2 - 0.25);
    at(len, 0.7, 0.5, P.concreteLight, cx, DECK_TOP, ez);
    for (let x = -len / 2 + 1; x < len / 2; x += 2.4) at(1.1, 0.74, 0.54, P.black, x, DECK_TOP, ez);
    at(len, 0.09, 0.09, P.steel, cx, DECK_TOP + 1.0, ez);
    for (let x = -len / 2 + 4; x < len / 2 - 2; x += 10) {
      s.add(cyl(0.06, 0.09, 3.6, P.steel, x, DECK_TOP + 1.8, ez, 6));
      at(0.07, 0.07, 1.4, P.steel, x, DECK_TOP + 3.55, ez - side * 0.7);
      at(0.26, 0.1, 0.5, P.white, x, DECK_TOP + 3.48, ez - side * 1.4);
    }
  }
  // twin-column bents every 10 m with a deep crosshead and black-and-white footings
  for (let x = -len / 2 + 6; x < len / 2 - 3; x += 10) {
    for (const dz of [-2.1, 2.1]) {
      const z = zc + dz;
      s.add(cyl(0.7, 0.8, DECK_SOFFIT - STREET, P.concrete, x, STREET + (DECK_SOFFIT - STREET) / 2, z, 8));
      s.add(cyl(0.86, 0.86, 0.3, P.black, x, STREET + 0.15, z, 8));
      s.add(cyl(0.86, 0.86, 0.3, P.white, x, STREET + 0.45, z, 8));
    }
    at(0.9, 0.9, width - 1.2, P.concreteDark, x, DECK_SOFFIT - 0.7, zc);
  }
  // the direction gantry over the carriageway and a billboard, facing the camera
  const gx = -9;
  for (const side of [-1, 1])
    s.add(cyl(0.11, 0.13, 5.4, P.steel, gx + side * 6.2, DECK_TOP + 2.7, zc + 2.6, 8));
  at(12.6, 0.12, 0.12, P.steel, gx, DECK_TOP + 5.1, zc + 2.6);
  at(12.6, 0.12, 0.12, P.steel, gx, DECK_TOP + 3.3, zc + 2.6);
  if (hasDom()) {
    const tex = fasciaTexture('gantry', 1024, 160, '#17674a', '#f4f2ea', ['IKEJA   ←   OSHODI   →   APAPA']);
    board(ctx, tex, 12.0, 12.0 * (160 / 1024), gx, DECK_TOP + 4.2, zc + 2.66);
  }
  L.glow(gx - 5.5, DECK_TOP + 3.9, zc + 2.4, 1.6, 0xe8f4ff, 0.45);
  L.glow(gx + 5.5, DECK_TOP + 3.9, zc + 2.4, 1.6, 0xe8f4ff, 0.45);
}

// --------------------------------------------------------------------------------------- skywalks

/** Two covered skywalk spans linking the terminal to the station tower over the north edge, on round piers. */
export function skywalks(ctx: SetContext): void {
  const { H } = ctx;
  const P = palette();
  const s = ctx.statics;
  const z = -H / 2 - 2.6; // just beyond the north edge
  const y = 5.0;
  const spans: [number, number][] = [
    [-0.5, 13.2],
    [15.8, 29.6],
  ];
  for (const [xa, xb] of spans) {
    const cx = (xa + xb) / 2;
    const len = xb - xa;
    s.add(box(len, 0.3, 1.9, P.concreteDark, cx, y, z)); // floor
    s.add(box(len, 0.1, 2.1, P.steelLight, cx, y + 2.35, z)); // roof
    s.add(box(len - 0.4, 1.3, 0.1, P.glass, cx, y + 1.05, z + 0.93)); // glazed side towards the camera
    s.add(box(len - 0.4, 1.3, 0.1, P.glass, cx, y + 1.05, z - 0.93));
    for (let x = xa + 0.4; x <= xb - 0.3; x += 1.6) s.add(box(0.1, 2.1, 0.1, P.steel, x, y + 1.3, z + 0.96));
    for (let x = xa + 2; x < xb - 1; x += 6) {
      s.add(cyl(0.32, 0.38, y - STREET, P.concrete, x, STREET + (y - STREET) / 2, z, 8));
      s.add(box(1.3, 0.3, 1.3, P.concreteDark, x, y - 0.3, z));
    }
  }
}

// ----------------------------------------------------------------------- station tower and viaduct

/**
 * The commuter-rail viaduct leaving the board's north portal (tile columns 36-37 -> world x 14-15) and running
 * on north, the station tower it serves and the forecourt canopy east of the board.
 */
export function railViaduct(ctx: SetContext, L: SiteLights, tod: TimeOfDay): void {
  const { W, H } = ctx;
  const P = palette();
  const s = ctx.statics;
  const { wx } = tileWorld(W, H);
  const north = -H / 2;
  const x = (wx(36) + wx(37)) / 2;
  const top = 5.4;
  const z0 = north - 0.6; // clear of the board's edge: nothing stands over the playfield
  const z1 = north - 70;
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  s.add(box(3.8, 0.5, len, P.concrete, x, top - 0.25, zc)); // viaduct deck
  s.add(box(3.8, 0.9, len, P.concreteDark, x, top - 1.0, zc));
  for (const dx of [-0.85, 0.85]) {
    s.add(box(0.12, 0.16, len, P.rail, x + dx - 0.7, top + 0.1, zc));
    s.add(box(0.12, 0.16, len, P.rail, x + dx + 0.7, top + 0.1, zc));
  }
  for (let z = z0 - 0.5; z > z1; z -= 0.8) s.add(box(3.0, 0.1, 0.22, P.black, x, top + 0.02, z)); // sleepers
  for (const side of [-1, 1]) {
    s.add(box(0.16, 0.9, len, P.concreteLight, x + side * 1.8, top + 0.2, zc)); // parapets
    for (let z = z0 - 4; z > z1; z -= 8) {
      s.add(cyl(0.05, 0.07, 3.2, P.steel, x + side * 1.5, top + 1.6, z, 6)); // catenary-style mast
      s.add(box(0.07, 0.07, 3.0, P.steel, x, top + 3.1, z));
    }
  }
  for (let z = z0 - 5; z > z1 + 2; z -= 10) {
    for (const dx of [-1.1, 1.1])
      s.add(cyl(0.55, 0.65, top - 1.4 - STREET, P.concrete, x + dx, STREET + (top - 1.4 - STREET) / 2, z, 8));
    s.add(box(3.4, 0.8, 1.4, P.concreteDark, x, top - 1.4, z));
  }
  // the station tower east of the viaduct with its name, and a lit clock-less stair core
  const tx = x + 7.5;
  const tz = north - 7.4;
  s.add(box(6, 9.2, 5, P.concrete, tx, 4.6, tz));
  s.add(box(6.3, 0.4, 5.3, P.concreteDark, tx, 9.4, tz));
  s.add(box(5.4, 1.2, 0.1, P.glass, tx, 5.2, tz + 2.55));
  s.add(box(5.4, 1.2, 0.1, P.glass, tx, 7.4, tz + 2.55));
  if (hasDom()) {
    const tex = fasciaTexture('station', 512, 128, '#16212c', '#f4f2ea', ['OSHODI STATION', 'COMMUTER RAIL']);
    board(ctx, tex, 5.2, 1.3, tx, 3.0, tz + 2.58);
  }
  L.glow(tx, 9.9, tz + 2.6, 1.0, 0xff3a2a, tod === 'night' ? 0.9 : 0.4);
  // the forecourt canopy east of the board: a deep slab on columns (the passenger zone stands under it)
  const fx = W / 2 + 3.4;
  s.add(box(5.4, 0.3, 8.2, P.concreteDark, fx, 3.7, -4.4));
  for (const dz of [-8, -1.2])
    for (const dx of [-2, 2])
      s.add(cyl(0.2, 0.24, 3.6 - STREET, P.steel, fx + dx, STREET + (3.6 - STREET) / 2, dz, 8));
  L.glow(fx, 3.4, -4.4, 1.6, 0x9ec8ff, tod === 'night' ? 0.6 : 0.3);
}

// ----------------------------------------------------------------------------------------- skyline

/** A row of towers of different heights behind the expressway (window grids, red mast lights). */
export function skyline(ctx: SetContext, L: SiteLights, tod: TimeOfDay): void {
  const { H } = ctx;
  const P = palette();
  const s = ctx.statics;
  const north = -H / 2;
  const towers: [number, number, number, number, number][] = [
    // x, depth z offset, width, height, seed
    [-40, 30, 8, 24, 1],
    [-26, 34, 9, 18, 2],
    [-10, 30, 7, 30, 3],
    [6, 36, 10, 21, 4],
    [24, 32, 8, 27, 5],
    [40, 30, 9, 19, 6],
    [-52, 26, 7, 15, 7],
    [54, 28, 8, 16, 8],
  ];
  for (const [x, dz, w, h, seed] of towers) {
    const tex = hasDom()
      ? facadeTexture(`tower${seed % 3}`, tod, 40 + (seed % 3), ['#7f8a96', '#8c8a80', '#6e7c86'][seed % 3]!)
      : undefined;
    const tm = uniqueMat(0xffffff, { map: tex, roughness: 0.9, flat: false });
    if (tex) {
      const map = tex.clone();
      map.needsUpdate = true;
      map.repeat.set(w / 7, h / 14);
      tm.map = map;
      ctx.own(map);
    }
    ctx.own(tm);
    s.add(mesh(new BoxGeometry(w, h, w * 0.8), tm, x, h / 2, north - dz));
    s.add(box(w + 0.3, 0.4, w * 0.8 + 0.3, P.concreteDark, x, h + 0.2, north - dz));
    s.add(cyl(0.05, 0.08, 3, P.steel, x, h + 1.9, north - dz, 6));
    L.glow(x, h + 3.4, north - dz + 0.6, 0.8, 0xff3a2a, tod === 'night' ? 0.8 : 0.35);
  }
}

// -------------------------------------------------------------------------------------- floodlights

/** The Cappa Ground's floodlight masts on the east side (the lamps themselves are practical lights in the env). */
export function floodlights(ctx: SetContext, L: SiteLights, tod: TimeOfDay): void {
  const { W, H } = ctx;
  const P = palette();
  const s = ctx.statics;
  const { wz } = tileWorld(W, H);
  for (const ty of [26, 31]) {
    const x = W / 2 + 3.2;
    const z = wz(ty);
    s.add(cyl(0.1, 0.16, 8.4 - STREET, P.steel, x, STREET + (8.4 - STREET) / 2, z, 8));
    s.add(box(0.2, 0.7, 2.0, P.black, x - 0.2, 8.6, z));
    for (const dz of [-0.7, 0, 0.7]) s.add(box(0.12, 0.32, 0.4, P.white, x - 0.34, 8.7, z + dz));
    L.glow(x - 0.5, 8.7, z, tod === 'night' ? 2.4 : 1.2, 0xe8f4ff, tod === 'night' ? 0.95 : 0.35);
  }
}
