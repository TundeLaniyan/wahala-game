/**
 * Occlusion readability (presentation only, pure; decisions OX1-OX6): what a structure that dissolves because it hides
 * the followed fighter must still tell the player.
 *
 * The collision never changes: a faded building is as solid as a visible one. So while it is faded, the picture must
 * not lie about it. Three things come from here:
 *
 *  1. a RESTRAINED dither cap (`hideFor`): a faded structure keeps a ghost of itself (never close to invisible), and
 *     keeps a little more of it while the fighter is next to it or pushing at it;
 *  2. a FOOTPRINT: the exact tiles the structure blocks, drawn on the ground as a faint rim (`footprintShapes`,
 *     `outlineStrength`), stronger as the fighter gets near, strongest while it pushes into it;
 *  3. a smooth `ease`, so neither the dither nor the rim ever pops.
 *
 * Nothing here knows about Three.js, the camera or the simulation: tile coordinates in, numbers and rectangles out.
 */

export interface OcclusionLook {
  /** Highest share of the structure's pixels removed (0..1) while the fighter is not near. Never close to 1. */
  farHide: number;
  /** The same cap while the fighter touches it / pushes at it: the structure shows more of itself. */
  nearHide: number;
  /** Distance (tiles, from the fighter to the closest blocked tile's edge) at which "near" begins (prox 0) ... */
  nearStart: number;
  /** ... and the distance at which it is complete (prox 1). */
  nearFull: number;
  /** Footprint rim strength (0..1 of its maximum) at full fade and prox 0; it rises to 1 with proximity. */
  rimFar: number;
  /** Rim width inside the blocked tile along its west / east edges (tiles). */
  rimWidth: number;
  /** The same along its north / south edges: wider, because the camera looks at the floor at a slant and squeezes them. */
  rimDepth: number;
  /** Dark line just outside the rim (west / east edges), so the rim reads on a bright floor as well as a dark one (tiles). */
  outerWidth: number;
  /** The same along the north / south edges. */
  outerDepth: number;
  /** Seconds the dither / rim takes to come in (time constant of an exponential ease) ... */
  tauIn: number;
  /** ... and to go back out. */
  tauOut: number;
}

export const OCCLUSION_LOOK: OcclusionLook = {
  farHide: 0.76,
  nearHide: 0.62,
  nearStart: 2.2,
  nearFull: 0.7,
  rimFar: 0.62,
  rimWidth: 0.1,
  rimDepth: 0.17,
  outerWidth: 0.05,
  outerDepth: 0.085,
  tauIn: 0.16,
  tauOut: 0.1,
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smoothstep of `x` between `a` and `b` (a may be larger than b: the ramp is then reversed). */
export function smooth(a: number, b: number, x: number): number {
  if (a === b) return x >= b ? 1 : 0;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Distance in tiles from a fighter at tile coordinates (px, py) (a tile centre is an integer, as `playerGridPos` gives
 * it) to the nearest edge of the blocked tiles `tiles` (row-major indices on a board `width` wide). 0 when the fighter
 * stands inside the footprint. Infinity for an empty footprint.
 */
export function footprintDistance(tiles: readonly number[], width: number, px: number, py: number): number {
  let best = Infinity;
  for (const t of tiles) {
    const tx = t % width;
    const ty = Math.floor(t / width);
    const dx = Math.max(Math.abs(px - tx) - 0.5, 0);
    const dy = Math.max(Math.abs(py - ty) - 0.5, 0);
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}

/** 0 (far) .. 1 (touching) from the distance to the footprint. */
export function proximity(distance: number, look: OcclusionLook = OCCLUSION_LOOK): number {
  return 1 - smooth(look.nearFull, look.nearStart, distance);
}

export type Facing = 'up' | 'down' | 'left' | 'right';

/**
 * Whether the fighter stands still next to the footprint, facing a blocked tile: it is pushing into it (or about
 * to). `px, py` is the fighter's logical tile; `settled` = no step in progress.
 */
export function isPushing(
  tiles: readonly number[],
  width: number,
  px: number,
  py: number,
  facing: Facing,
  settled: boolean,
): boolean {
  if (!settled) return false;
  const fx = Math.round(px) + (facing === 'left' ? -1 : facing === 'right' ? 1 : 0);
  const fy = Math.round(py) + (facing === 'up' ? -1 : facing === 'down' ? 1 : 0);
  if (fx < 0 || fy < 0 || fx >= width) return false;
  return tiles.includes(fy * width + fx);
}

/** Dither cap (0..1) of a faded structure: the restrained far value, easing to the near value as the fighter closes in. */
export function hideFor(prox: number, look: OcclusionLook = OCCLUSION_LOOK): number {
  const k = clamp01(prox);
  return look.farHide + (look.nearHide - look.farHide) * k;
}

/**
 * Footprint rim strength 0..1: how far the structure has faded (`hide` of `hideFor`'s cap, so it follows the dither
 * and is 0 while the structure is solid) times a share that rises with proximity; pushing at it is always 1 at full fade.
 */
export function outlineStrength(
  hide: number,
  prox: number,
  pushing: boolean,
  look: OcclusionLook = OCCLUSION_LOOK,
): number {
  const faded = clamp01(hide / look.farHide);
  const near = pushing ? 1 : clamp01(prox);
  return faded * (look.rimFar + (1 - look.rimFar) * near);
}

/** One step of an exponential ease of `cur` towards `target` over `dt` seconds (framerate independent). */
export function ease(cur: number, target: number, dt: number, look: OcclusionLook = OCCLUSION_LOOK): number {
  if (Math.abs(target - cur) < 0.005) return target;
  const tau = target > cur ? look.tauIn : look.tauOut;
  const k = 1 - Math.exp(-Math.max(0, dt) / Math.max(1e-4, tau));
  return cur + (target - cur) * k;
}

/** An axis-aligned rectangle on the floor, in tile coordinates (a tile centre is an integer). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FootprintShapes {
  /** One rectangle per blocked tile: the faint dark patch. */
  fill: Rect[];
  /** Dark line just outside the footprint's outer boundary. */
  outer: Rect[];
  /** Light rim just inside the footprint's outer boundary. */
  rim: Rect[];
}

/**
 * The rectangles that draw a footprint: a patch on every blocked tile, and a rim only along the OUTER boundary (an
 * edge shared by two blocked tiles of the same structure has no line, so a building reads as one object, not as a grid).
 */
export function footprintShapes(
  tiles: readonly number[],
  width: number,
  look: OcclusionLook = OCCLUSION_LOOK,
): FootprintShapes {
  const set = new Set(tiles);
  const fill: Rect[] = [];
  const outer: Rect[] = [];
  const rim: Rect[] = [];
  const rx = look.rimWidth;
  const ry = look.rimDepth;
  const ox = look.outerWidth;
  const oy = look.outerDepth;
  const has = (x: number, y: number): boolean => x >= 0 && x < width && y >= 0 && set.has(y * width + x);
  for (const t of tiles) {
    const x = t % width;
    const y = Math.floor(t / width);
    const x0 = x - 0.5;
    const x1 = x + 0.5;
    const y0 = y - 0.5;
    const y1 = y + 0.5;
    fill.push({ x0, y0, x1, y1 });
    // an edge row only runs over the corner when the neighbour along it is open, so the two rows never overlap
    const west = !has(x - 1, y);
    const east = !has(x + 1, y);
    const north = !has(x, y - 1);
    const south = !has(x, y + 1);
    if (north) {
      rim.push({ x0, y0, x1, y1: y0 + ry });
      outer.push({ x0: x0 - ox, y0: y0 - oy, x1: x1 + ox, y1: y0 });
    }
    if (south) {
      rim.push({ x0, y0: y1 - ry, x1, y1 });
      outer.push({ x0: x0 - ox, y0: y1, x1: x1 + ox, y1: y1 + oy });
    }
    if (west) {
      rim.push({ x0, y0: north ? y0 + ry : y0, x1: x0 + rx, y1: south ? y1 - ry : y1 });
      outer.push({ x0: x0 - ox, y0, x1: x0, y1 });
    }
    if (east) {
      rim.push({ x0: x1 - rx, y0: north ? y0 + ry : y0, x1, y1: south ? y1 - ry : y1 });
      outer.push({ x0: x1, y0, x1: x1 + ox, y1 });
    }
  }
  return { fill, outer, rim };
}

/**
 * Combined readability of several faded structures at once: each one keeps its own cap (a structure further back
 * sits behind the others and, drawn with the same screen-door pattern, is seen through the same holes), but when a
 * crowd of them fades together the far ones are held a little more solid so a whole street does not vanish: the
 * `rank`-th nearest structure (0 = the nearest to the fighter) gets `hideFor` less `0.04 * min(rank, 4)` of its cap.
 */
export function stackedHide(cap: number, rank: number): number {
  return Math.max(0.3, cap - 0.04 * Math.min(Math.max(0, rank), 4));
}
