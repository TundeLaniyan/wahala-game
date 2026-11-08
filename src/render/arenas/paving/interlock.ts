/**
 * Interlocking concrete road pavers: the block geometry and the texture pixels (pure: no DOM, no Three, deterministic).
 * docs/LEKKI_INTERLOCK_ROADS.md.
 *
 * The block is the I-shaped ("dog-bone", double-T) road paver of the founder's close-up references: a 2:1 block whose
 * two ends are flared and whose middle is waisted. Blocks are laid end to end in courses, every second course shifted by
 * half a block, so the flared end of one block sits in the waist of the two blocks beside it in the next course. With one
 * shape for every block, that is exactly a wavy boundary between two courses: it dips towards the lower course under the
 * ends of the upper course's blocks and rises under their middles. Joints between blocks of one course are straight.
 *
 * The texture is SEAMLESS (whole blocks and an even number of courses across it, every random value taken modulo the
 * repeat), mip-mapped by the GPU, and carries the material's small-scale depth baked in: a narrow sand-filled joint, a
 * soft chamfer that darkens each block edge, a little aggregate speckle and mottling inside a block, and a restrained
 * tone difference from block to block. Large-scale variation (so the repeat never shows) is added in the shader in
 * world space (`material.ts`).
 */

export interface InterlockSpec {
  /** Texture edge in texels (power of two: mip-mapped). */
  size: number;
  /** Whole blocks along a course across the texture. */
  blocksAcross: number;
  /** Courses down the texture (even: alternate courses are offset by half a block). */
  courses: number;
  /** How far (fraction of the course height) each flare and waist departs from a straight joint. */
  notch: number;
  /** Along a block (0..1 from one end): the flare ends at `flare`, the waist is flat from `waist` to 1 - `waist`. */
  flare: number;
  waist: number;
  /** Joint (sand-filled gap) width in texels. */
  joint: number;
  /** Chamfer width in texels: the block edge darkens over it (the small bevel of a real paver). */
  bevel: number;
  /** Mean block colour (sRGB 0-255). */
  tone: readonly [number, number, number];
  /** Block-to-block lightness spread (fraction, +/-). */
  blockVariation: number;
  /** Joint colour as a fraction of the block colour (1 = invisible joint). */
  jointShade: number;
  /** Darkening at the bottom of the chamfer (fraction). */
  bevelShade: number;
  /** Aggregate speckle and fine grain strength (fraction). */
  grain: number;
  seed: number;
}

/** The Lekki Phase 1 road paver (decision LI2): pale-to-medium grey I-blocks, thin joints, a soft chamfer. */
export const LEKKI_INTERLOCK: InterlockSpec = {
  size: 512,
  blocksAcross: 12,
  courses: 24,
  notch: 0.1,
  flare: 0.22,
  waist: 0.36,
  joint: 1.15,
  bevel: 1.7,
  tone: [118, 120, 122],
  blockVariation: 0.065,
  jointShade: 0.66,
  bevelShade: 0.12,
  grain: 0.045,
  seed: 2611,
};

/** Block length and course height in texels. */
export function blockSize(s: InterlockSpec): { L: number; H: number } {
  return { L: s.size / s.blocksAcross, H: s.size / s.courses };
}

/** Course `k`'s offset along x (texels): alternate courses are shifted by half a block. */
const offsetOf = (k: number, L: number): number => (((k % 2) + 2) % 2) * L * 0.5;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The profile along the block of the course ABOVE a boundary (t = 0..1 from its left end): +1 under its flared ends
 * (the boundary dips, the upper block reaches down), -1 under its waist (the boundary rises), smooth steps between.
 */
export function profile(t: number, s: Pick<InterlockSpec, 'flare' | 'waist'>): number {
  const u = t - Math.floor(t);
  const e = Math.min(u, 1 - u); // distance from the nearest end, 0..0.5
  return 1 - 2 * smooth(s.flare, s.waist, e);
}

/** The y (texels) of the joint between course k-1 (above) and course k at x. */
export function boundaryY(k: number, x: number, s: InterlockSpec): number {
  const { L, H } = blockSize(s);
  const t = (x - offsetOf(k - 1, L)) / L;
  return k * H + s.notch * H * profile(t, s);
}

/** Which block a point (texels) belongs to, and its distance (texels) to the nearest joint centre line. */
export function locate(
  x: number,
  y: number,
  s: InterlockSpec,
): { course: number; block: number; edge: number } {
  const { L, H } = blockSize(s);
  const k0 = Math.floor(y / H);
  const top0 = boundaryY(k0, x, s);
  const bot0 = boundaryY(k0 + 1, x, s);
  const course = y < top0 ? k0 - 1 : y >= bot0 ? k0 + 1 : k0;
  const off = offsetOf(course, L);
  const block = Math.floor((x - off) / L);
  const xl = off + block * L;
  // distance to the two wavy course joints, corrected for their slope (a numeric derivative)
  const dist = (k: number): number => {
    const dy = Math.abs(y - boundaryY(k, x, s));
    const slope = (boundaryY(k, x + 0.5, s) - boundaryY(k, x - 0.5, s)) / 1;
    return dy / Math.sqrt(1 + slope * slope);
  };
  const edge = Math.min(dist(course), dist(course + 1), x - xl, xl + L - x);
  return { course, block, edge };
}

/** A small integer hash (deterministic, no Math.random). */
export function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Periodic value noise over the texture (period = `cells` cells across it): seamless mottling. */
function periodicNoise(x: number, y: number, size: number, cells: number, seed: number): number {
  const fx = (x / size) * cells;
  const fy = (y / size) * cells;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const ux = smooth(0, 1, fx - ix);
  const uy = smooth(0, 1, fy - iy);
  const v = (i: number, j: number): number =>
    hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * ux;
  const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * ux;
  return a + (b - a) * uy;
}

/** The block's own tone factor (1 +/- variation), the same for every texel of the block and periodic over the texture. */
export function blockTone(course: number, block: number, s: InterlockSpec): number {
  const c = ((course % s.courses) + s.courses) % s.courses;
  const b = ((block % s.blocksAcross) + s.blocksAcross) % s.blocksAcross;
  // a gentle bell: most blocks near the mean, a few a little lighter or darker (never a checkerboard)
  const u = (hash(c, b, s.seed) + hash(b, c, s.seed + 7)) * 0.5;
  return 1 + (u - 0.5) * 2 * s.blockVariation;
}

/** The RGBA texels (sRGB, row 0 first) of the seamless paver texture. */
export function interlockPixels(s: InterlockSpec = LEKKI_INTERLOCK): Uint8Array {
  const n = s.size;
  const out = new Uint8Array(n * n * 4);
  const half = s.joint / 2;
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const x = px + 0.5;
      const y = py + 0.5;
      const { course, block, edge } = locate(x, y, s);
      // inside the block: its tone, a soft mottling, the aggregate grain, and the chamfer darkening its edge
      const tone = blockTone(course, block, s);
      const mottle = (periodicNoise(x, y, n, 32, s.seed + 11) - 0.5) * 0.05;
      const g = hash(px, py, s.seed + 3);
      const speck = g > 0.985 ? 0.09 : g < 0.012 ? -0.1 : (g - 0.5) * s.grain;
      const bevel = 1 - s.bevelShade * (1 - smooth(half, half + s.bevel, edge));
      const body = tone * (1 + mottle + speck) * bevel;
      // the joint: sand-coloured and darker, anti-aliased over one texel
      const inJoint = 1 - smooth(half - 0.5, half + 0.5, edge);
      const f = body + (s.jointShade * (1 + speck * 0.5) - body) * inJoint;
      const i = (py * n + px) * 4;
      out[i] = Math.max(0, Math.min(255, Math.round(s.tone[0] * f + inJoint * 4)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(s.tone[1] * f + inJoint * 3)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(s.tone[2] * f)));
      out[i + 3] = 255;
    }
  }
  return out;
}
