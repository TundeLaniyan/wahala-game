/**
 * Small Lagos street props for the Ajegunle, Lagoon Jetty and Yaba sets (presentation only):
 * monobloc chairs, benches, jerrycans, water drums, basins and buckets, beer crates, coolers,
 * wooden poles with sagging service cables, coal stoves, open gutters with plank crossings, shade
 * trees. All built from the StreetKit (vertex-coloured, baked with the statics).
 */
import { IcosahedronGeometry } from 'three';
import type { Object3D } from 'three';
import { frame, v3 } from './ajegunleKit';
import type { StreetKit } from './ajegunleKit';

/**
 * A street shade tree (almond / mango): a leaning trunk forking into limbs, a canopy of lumpy
 * leaf clumps in a few greens, a whitewashed band round the foot of the trunk.
 */
export function shadeTree(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  h = 4.6,
  spread = 2.2,
): void {
  const r = kit.rng;
  const lean = v3(x + (r() - 0.5) * 0.4, y + h * 0.55, z + (r() - 0.5) * 0.4);
  kit.bar(p, v3(x, y, z), lean, 0.17, 0x4a3a2e, 'wood', 7);
  kit.cyl(p, 0.19, 0.2, 0.7, 0xd8d4c8, x, y + 0.35, z, 'matte', 8); // whitewash
  const greens = [0x3e5a2a, 0x4e6a30, 0x34502a, 0x5a7234];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + r();
    const end = v3(
      lean.x + Math.cos(a) * spread * 0.55,
      y + h * (0.75 + r() * 0.15),
      lean.z + Math.sin(a) * spread * 0.45,
    );
    kit.bar(p, lean, end, 0.08, 0x4a3a2e, 'wood', 5);
  }
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2;
    const d = r() * spread * 0.7;
    const s = 0.8 + r() * 0.7;
    const m = kit.add(
      new IcosahedronGeometry(1, 1),
      greens[k % greens.length]!,
      'matte',
      lean.x + Math.cos(a) * d,
      y + h * (0.82 + r() * 0.22),
      lean.z + Math.sin(a) * d * 0.8,
      { ry: r() * 3 },
      p,
    );
    m.scale.set(s, s * 0.62, s);
  }
}

/** A white / red / blue monobloc plastic chair facing +z of its frame. */
export function chair(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  color = 0xd8d4c8,
): void {
  const g = frame(p, x, y, z, ry);
  kit.box(g, 0.44, 0.04, 0.42, color, 0, 0.44, 0, 'plastic');
  kit.box(g, 0.44, 0.46, 0.04, color, 0, 0.68, -0.2, 'plastic', { rx: -0.12 });
  for (const [lx, lz] of [
    [-0.19, -0.18],
    [0.19, -0.18],
    [-0.19, 0.18],
    [0.19, 0.18],
  ] as const)
    kit.box(g, 0.04, 0.44, 0.04, color, lx, 0.22, lz, 'plastic', { rx: lz * 0.3, rz: -lx * 0.3 });
}

/** A rough timber bench (planks on stakes). */
export function bench(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  len = 1.8,
): void {
  const g = frame(p, x, y, z, ry);
  kit.box(g, len, 0.05, 0.3, 0x5e4630, 0, 0.42, 0, 'wood');
  for (const s of [-1, 1]) kit.box(g, 0.07, 0.42, 0.24, 0x4a3624, (s * len) / 2 - s * 0.15, 0.21, 0, 'wood');
}

/** A yellow 25-litre jerrycan (the "kegs" every compound fetches water in). */
export function jerrycan(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  color = 0xc8a020,
): void {
  const g = frame(p, x, y, z, ry);
  kit.box(g, 0.26, 0.36, 0.17, color, 0, 0.18, 0, 'plastic');
  kit.box(g, 0.05, 0.06, 0.05, color, 0.08, 0.39, 0, 'plastic');
  kit.box(g, 0.14, 0.04, 0.04, color, -0.04, 0.42, 0, 'plastic');
}

/** A plastic water drum with its lid. */
export function drum(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  color = 0x2a5a8a,
  h = 0.9,
): void {
  kit.cyl(p, 0.3, 0.29, h, color, x, y + h / 2, z, 'plastic', 14);
  kit.cyl(p, 0.31, 0.31, 0.05, color, x, y + h * 0.33, z, 'plastic', 14);
  kit.cyl(p, 0.31, 0.31, 0.05, color, x, y + h * 0.66, z, 'plastic', 14);
  kit.cyl(p, 0.27, 0.27, 0.03, 0x1c1c1e, x, y + h + 0.01, z, 'plastic', 14);
}

/** An enamel / plastic basin (optionally holding water or washing). */
export function basin(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  color: number,
  r = 0.34,
  fill?: number,
): void {
  kit.cyl(p, r, r * 0.66, r * 0.45, color, x, y + r * 0.225, z, 'plastic', 14);
  if (fill !== undefined) kit.cyl(p, r * 0.92, r * 0.92, 0.01, fill, x, y + r * 0.38, z, 'metal', 14);
}

export function bucket(kit: StreetKit, p: Object3D, x: number, y: number, z: number, color: number): void {
  kit.cyl(p, 0.15, 0.12, 0.3, color, x, y + 0.15, z, 'plastic', 10);
  kit.bar(p, v3(x - 0.14, y + 0.3, z), v3(x + 0.14, y + 0.3, z), 0.006, 0x2a2622, 'metal', 3);
}

/** A crate of empty beer bottles (or minerals). */
export function bottleCrate(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  color = 0x8a2a22,
): void {
  const g = frame(p, x, y, z, ry);
  kit.box(g, 0.4, 0.28, 0.3, color, 0, 0.14, 0, 'plastic');
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++)
      kit.cyl(g, 0.03, 0.03, 0.12, 0x2a4a22, -0.15 + i * 0.1, 0.33, -0.1 + j * 0.1, 'metal', 5);
}

/** A cooler box (white body, coloured lid). */
export function cooler(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  lid = 0x2a5a9a,
): void {
  const g = frame(p, x, y, z, ry);
  kit.box(g, 0.7, 0.45, 0.42, 0xd0ccc0, 0, 0.225, 0, 'plastic');
  kit.box(g, 0.72, 0.08, 0.44, lid, 0, 0.49, 0, 'plastic');
}

/**
 * A creosoted timber utility pole with a crossarm and insulators; returns the cable anchor
 * points at the top (left, right).
 */
export function pole(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  ry: number,
  h = 7,
): [ReturnType<typeof v3>, ReturnType<typeof v3>] {
  kit.cyl(p, 0.1, 0.14, h, 0x3a2e24, x, y + h / 2, z, 'wood', 7);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const arm = (o: number) => v3(x + c * o, y + h - 0.4, z - s * o);
  kit.bar(p, arm(-0.8), arm(0.8), 0.05, 0x3a2e24, 'wood', 4);
  for (const o of [-0.7, -0.25, 0.25, 0.7]) {
    const a = arm(o);
    kit.cyl(p, 0.035, 0.05, 0.12, 0x8a8478, a.x, a.y + 0.1, a.z, 'plastic', 6);
  }
  return [arm(-0.7).setY(y + h - 0.25), arm(0.7).setY(y + h - 0.25)];
}

/** A charcoal stove (a cut-down drum on bricks) with a pot; `glowing` adds the embers. */
export function coalStove(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  pot = 0x2a2622,
): void {
  for (const [bx, bz] of [
    [-0.18, 0],
    [0.18, 0],
    [0, 0.18],
  ] as const)
    kit.box(p, 0.16, 0.18, 0.12, 0x7a4a36, x + bx, y + 0.09, z + bz);
  kit.cyl(p, 0.24, 0.2, 0.22, 0x3a3430, x, y + 0.29, z, 'metal', 12);
  kit.cyl(p, 0.18, 0.18, 0.02, 0xff7a2a, x, y + 0.41, z, 'glow', 10);
  kit.cyl(p, 0.26, 0.2, 0.22, pot, x, y + 0.52, z, 'metal', 12);
}

/**
 * An open concrete gutter (a dark channel of stagnant water between two lips) along x, with a
 * few plank crossings.
 */
export function gutter(
  kit: StreetKit,
  p: Object3D,
  x: number,
  y: number,
  z: number,
  len: number,
  ry = 0,
  planks = 3,
): void {
  const g = frame(p, x, y, z, ry);
  kit.box(g, len, 0.02, 0.36, 0x1c1e18, 0, 0.005, 0, 'metal');
  kit.box(g, len, 0.12, 0.1, 0x6e6a60, 0, 0.04, -0.23);
  kit.box(g, len, 0.12, 0.1, 0x6e6a60, 0, 0.04, 0.23);
  const r = kit.rng;
  for (let i = 0; i < planks; i++) {
    const px = -len / 2 + ((i + 0.5) * len) / planks + (r() - 0.5) * 0.8;
    kit.box(g, 0.3 + r() * 0.15, 0.04, 0.7, 0x5a4632, px, 0.12, 0, 'wood', { ry: (r() - 0.5) * 0.3 });
  }
  // sludge and rubbish caught in the channel
  for (let i = 0; i < len * 1.5; i++)
    kit.box(
      g,
      0.05 + r() * 0.12,
      0.03,
      0.05 + r() * 0.1,
      [0x3a3a2a, 0xa8a49a, 0x2a4a6a, 0x5a3a2a][i % 4]!,
      (r() - 0.5) * len,
      0.02,
      (r() - 0.5) * 0.25,
      'plastic',
    );
}
