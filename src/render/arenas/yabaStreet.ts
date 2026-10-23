/**
 * Yaba After Dark building blocks (presentation only): lit commercial frontages with lightbox signs
 * and neon outlines, a projecting pharmacy cross, festoon bulbs, a suya stand with its glowing grill
 * and smoke, a roasted-corn seller's brazier, a POS agent's umbrella stand, a pole transformer that
 * arcs, and the headlights of waiting vehicles. Light sources are unlit colour (`glow` / `lit`)
 * plus additive halos and beams from `SiteLights`, so the street glows without extra real lights.
 */
import type { Object3D } from 'three';
import type { SetContext } from './common';
import { STREET } from './common';
import type { SiteLights } from './roadworksKit';
import { frame, v3 } from './ajegunleKit';
import type { StreetKit } from './ajegunleKit';
import { house } from './ajegunleHouses';
import type { HouseOpts } from './ajegunleHouses';

export interface Frontage extends Partial<HouseOpts> {
  /** position along the street (x for the north row, z for the side rows) */
  at: number;
  w: number;
  /** sign atlas row of the lightbox over the shop */
  sign: number;
  /** neon outline colour around the sign (0 = none) */
  neon: number;
  /** colour of the light spilling from the shopfront */
  spill: number;
}

/** Local -> world for a frame placed at (x, z) facing `ry` (facade towards +z of the frame). */
function world(x: number, z: number, ry: number, lx: number, ly: number, lz: number) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return v3(x + c * lx + s * lz, ly, z - s * lx + c * lz);
}

/**
 * A lit two/three-storey commercial building: shops on the ground floor, a lightbox sign across the
 * frontage with a neon outline, light spilling onto the pavement.
 */
export function frontage(
  kit: StreetKit,
  L: SiteLights,
  x: number,
  z: number,
  ry: number,
  f: Frontage,
): Object3D {
  const g = house(kit, kit.statics, x, STREET, z, ry, {
    d: 6,
    storeys: 2,
    wall: 0x8a8278,
    roof: 0x5a5650,
    ground: 'S',
    lit: 0.45,
    ac: true,
    ...f,
    balcony: false, // the lightbox runs across the first-floor slab
  });
  const w = f.w;
  // the lightbox: a steel tray with the lit face, a neon tube round it
  kit.box(g, w - 0.3, 0.7, 0.18, 0x1e1c1e, 0, 3.4, 0.1, 'metal');
  kit.sign(g, f.sign, w - 0.42, 0.58, 0, 3.4, 0.21, true);
  if (f.neon) {
    const hw = (w - 0.2) / 2;
    kit.neon(
      g,
      [v3(-hw, 3.03, 0.26), v3(hw, 3.03, 0.26), v3(hw, 3.77, 0.26), v3(-hw, 3.77, 0.26), v3(-hw, 3.03, 0.26)],
      f.neon,
      0.022,
    );
    for (const lx of [-hw * 0.6, 0, hw * 0.6]) {
      const p = world(x, z, ry, lx, STREET + 3.4, 0.5);
      L.glow(p.x, p.y, p.z, 1.9, f.neon, 0.42);
    }
  }
  const sign = world(x, z, ry, 0, STREET + 3.4, 0.45);
  L.glow(sign.x, sign.y + 0.3, sign.z, w * 0.9, 0xfff0e0, 0.1);
  // light spilling out of the open shop onto the pavement
  const door = world(x, z, ry, 0, STREET + 1.5, 0.35);
  L.glow(door.x, door.y, door.z, w * 0.7, f.spill, 0.26);
  return g;
}

/** Festoon bulbs strung along a frontage (bar / buka). */
export function festoon(
  kit: StreetKit,
  L: SiteLights,
  a: ReturnType<typeof v3>,
  b: ReturnType<typeof v3>,
  colors: number[],
): void {
  const pts = kit.sag(kit.statics, a, b, 0.25, 0.008, 0x161414, 10);
  for (let i = 1; i < pts.length - 1; i++) {
    const c = colors[i % colors.length]!;
    const p = pts[i]!;
    kit.cyl(kit.statics, 0.05, 0.05, 0.09, c, p.x, p.y - 0.07, p.z, 'glow', 6);
    if (i % 2) L.glow(p.x, p.y - 0.07, p.z, 0.5, c, 0.5);
  }
}

/** A projecting pharmacy cross (green lightbox on a bracket), facing along the facade. */
export function pharmacyCross(
  kit: StreetKit,
  L: SiteLights,
  x: number,
  y: number,
  z: number,
  ry: number,
): void {
  const g = frame(kit.statics, x, y, z, ry);
  kit.box(g, 0.06, 0.06, 0.5, 0x2a2a2a, 0, 0, -0.25, 'metal');
  kit.box(g, 0.12, 0.78, 0.78, 0x1a1a1a, 0, 0, 0.3, 'metal');
  kit.box(g, 0.14, 0.62, 0.2, 0x3cf08a, 0, 0, 0.3, 'glow');
  kit.box(g, 0.14, 0.2, 0.62, 0x3cf08a, 0, 0, 0.3, 'glow');
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  L.glow(x + s * 0.3, y, z + c * 0.3, 2.0, 0x3cf08a, 0.6);
}

/**
 * The suya stand: a lit glass display box of skewered beef on a table, the grill tray of glowing
 * charcoal, a hanging bulb, onions and pepper in basins. Smoke drifts from the grill.
 */
export function suyaStand(
  kit: StreetKit,
  ctx: SetContext,
  L: SiteLights,
  x: number,
  z: number,
  ry: number,
): void {
  const S = STREET;
  const g = frame(kit.statics, x, S, z, ry);
  kit.box(g, 1.4, 0.06, 0.7, 0x5a4632, 0, 0.82, 0, 'wood');
  for (const [lx, lz] of [
    [-0.62, -0.28],
    [0.62, -0.28],
    [-0.62, 0.28],
    [0.62, 0.28],
  ] as const)
    kit.box(g, 0.05, 0.82, 0.05, 0x3a2a1e, lx, 0.41, lz, 'wood');
  // display case: glass sides (dark), lit inside, skewers of suya
  kit.box(g, 0.9, 0.5, 0.5, 0xf0c890, -0.15, 1.1, 0, 'glow');
  kit.box(g, 0.94, 0.04, 0.54, 0x2a2a2a, -0.15, 1.37, 0, 'metal');
  for (let k = 0; k < 7; k++)
    kit.box(g, 0.05, 0.05, 0.42, 0x5a2a16, -0.5 + k * 0.11, 1.0 + (k % 2) * 0.12, 0, 'wood');
  // the grill: a tray of coals on legs beside the table
  kit.box(g, 0.8, 0.12, 0.45, 0x2a2622, 1.05, 0.72, 0, 'metal');
  kit.box(g, 0.72, 0.02, 0.38, 0xff6a20, 1.05, 0.79, 0, 'glow');
  for (let k = 0; k < 6; k++) kit.box(g, 0.04, 0.03, 0.5, 0x4a2414, 0.78 + k * 0.11, 0.82, 0, 'wood');
  for (const lx of [0.7, 1.4]) kit.box(g, 0.04, 0.66, 0.04, 0x2a2622, lx, 0.33, 0, 'metal');
  // a bare bulb on a pole over the stand
  kit.box(g, 0.04, 1.2, 0.04, 0x3a2a1e, -0.68, 1.45, -0.3, 'wood');
  kit.box(g, 0.6, 0.03, 0.03, 0x3a2a1e, -0.4, 2.05, -0.3, 'wood');
  kit.cyl(g, 0.06, 0.06, 0.11, 0xfff0c8, -0.15, 1.95, -0.3, 'glow', 8);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx: number, ly: number, lz: number) => v3(x + c * lx + s * lz, S + ly, z - s * lx + c * lz);
  const bulb = at(-0.15, 1.95, -0.3);
  L.glow(bulb.x, bulb.y, bulb.z, 1.3, 0xffe0a0, 0.8);
  const grill = at(1.05, 0.85, 0);
  L.glow(grill.x, grill.y, grill.z, 1.1, 0xff6a20, 0.7);
  ctx.ambient.smokeColumn(grill.x, grill.y + 0.2, grill.z, { shade: 0.55, size: 0.75, rate: 5 });
}

/** A roasted-corn seller's brazier (a cut drum of coals with cobs on the grate). */
export function cornBrazier(kit: StreetKit, ctx: SetContext, L: SiteLights, x: number, z: number): void {
  const S = STREET;
  const p = kit.statics;
  kit.cyl(p, 0.3, 0.26, 0.5, 0x2e2622, x, S + 0.25, z, 'metal', 12);
  kit.cyl(p, 0.27, 0.27, 0.02, 0xff7020, x, S + 0.5, z, 'glow', 12);
  const r = kit.rng;
  for (let k = 0; k < 6; k++)
    kit.cyl(
      p,
      0.045,
      0.045,
      0.22,
      r() < 0.5 ? 0xd0a040 : 0x6a4a1a,
      x - 0.18 + k * 0.07,
      S + 0.54,
      z + (r() - 0.5) * 0.1,
      'wood',
      6,
      { rx: Math.PI / 2 },
    );
  L.glow(x, S + 0.6, z, 0.9, 0xff7020, 0.7);
  ctx.ambient.smokeColumn(x, S + 0.6, z, { shade: 0.6, size: 0.55, rate: 3 });
}

/** A POS agent's stand: a big umbrella over a small table with the card machine. */
export function posStand(kit: StreetKit, L: SiteLights, x: number, z: number, canopy: number): void {
  const S = STREET;
  const p = kit.statics;
  kit.cyl(p, 0.03, 0.03, 2.2, 0x6a6a64, x, S + 1.1, z, 'metal', 6);
  kit.cyl(p, 0.05, 1.15, 0.35, canopy, x, S + 2.2, z, 'cloth', 10);
  kit.box(p, 0.7, 0.05, 0.5, 0xd8d4c8, x + 0.3, S + 0.74, z, 'plastic');
  kit.box(p, 0.05, 0.72, 0.42, 0xd8d4c8, x + 0.3, S + 0.37, z, 'plastic');
  kit.box(p, 0.08, 0.04, 0.14, 0x1a1a1a, x + 0.3, S + 0.79, z, 'metal');
  kit.box(p, 0.06, 0.005, 0.06, 0x7ad0ff, x + 0.3, S + 0.81, z - 0.02, 'glow');
  // a rechargeable lamp clipped to the pole
  kit.box(p, 0.12, 0.08, 0.05, 0xf4f8ff, x + 0.06, S + 1.7, z, 'glow');
  L.glow(x + 0.06, S + 1.7, z, 0.9, 0xe8f0ff, 0.6);
}

/**
 * A wooden pole with a pole-mount transformer and its tangle of cables; the bushing arcs now and
 * then (the street's power is as unreliable as the arena's).
 */
export function transformerPole(kit: StreetKit, L: SiteLights, x: number, z: number): ReturnType<typeof v3> {
  const S = STREET;
  const p = kit.statics;
  kit.cyl(p, 0.11, 0.15, 7.6, 0x3a2e24, x, S + 3.8, z, 'wood', 7);
  kit.box(p, 1.8, 0.1, 0.1, 0x3a2e24, x, S + 7.2, z, 'wood');
  kit.box(p, 0.7, 0.9, 0.6, 0x5a5e5a, x, S + 5.6, z + 0.35, 'metal');
  kit.cyl(p, 0.36, 0.36, 0.95, 0x4e524e, x, S + 5.6, z + 0.35, 'metal', 12);
  for (const o of [-0.2, 0, 0.2])
    kit.cyl(p, 0.04, 0.06, 0.3, 0x8a7a6a, x + o, S + 6.2, z + 0.35, 'plastic', 6);
  kit.box(p, 0.5, 0.6, 0.25, 0x6a6a64, x, S + 2.4, z + 0.2, 'metal'); // fuse box
  L.beacon(x + 0.2, S + 6.3, z + 0.35, 0xbfe8ff, 1.2, 'arc');
  return v3(x, S + 7.1, z);
}

/** Headlights (two lamps and their beams) of a vehicle at (x, z) facing `ry`. */
export function headlights(
  L: SiteLights,
  x: number,
  z: number,
  ry: number,
  front: number,
  half: number,
  y: number,
  color = 0xfff2d8,
): void {
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  for (const s of half > 0 ? [-1, 1] : [0]) {
    const hx = x + fx * front + fz * half * s;
    const hz = z + fz * front - fx * half * s;
    L.glow(hx, STREET + y, hz, 0.5, color, 0.9);
    L.beam(v3(hx, STREET + y, hz), v3(hx + fx * 3.6, STREET, hz + fz * 3.6), 0.9, color, 0.022);
  }
}

/** Red tail lights. */
export function tailLights(
  kit: StreetKit,
  L: SiteLights,
  x: number,
  z: number,
  ry: number,
  back: number,
  half: number,
  y: number,
): void {
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  for (const s of [-1, 1]) {
    const hx = x - fx * back + fz * half * s;
    const hz = z - fz * back - fx * half * s;
    L.glow(hx, STREET + y, hz, 0.45, 0xff2a20, 0.8);
    kit.box(kit.statics, 0.08, 0.06, 0.03, 0xff3a2a, hx, STREET + y, hz, 'glow', { ry });
  }
}
