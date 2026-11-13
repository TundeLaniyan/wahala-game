/**
 * View-clear test (presentation only, pure): which scenery hides the followed fighter from the camera.
 *
 * `occlusionFade.ts` dissolves the obstacle on the tile directly south of anything worth seeing, to a fixed
 * reach. That misses a tall building whose column is not the fighter's (the perspective follow camera looks
 * across several columns), or one taller than its declared reach. This module asks the real question instead:
 * does the line from the camera to the fighter pass through an object's bounding box? Only objects that do
 * (with a margin) are returned, so nothing fades while the fighter is in the clear.
 *
 * Hysteresis: an object already fading is kept while the line passes within the larger EXIT pad; a new one
 * must come within the smaller ENTER pad. A fighter stepping along a wall edge therefore never flickers it.
 */

export interface Pt {
  x: number;
  y: number;
  z: number;
}

/** World-space axis-aligned box (y up). */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ViewClearConfig {
  /** Horizontal / top margin (world units) for an object to START fading. */
  enterPad: number;
  /** Larger margin that KEEPS an already fading object fading (hysteresis). */
  exitPad: number;
  /** Heights of the fighter points tested (feet, torso, head): any one hidden counts. */
  heights: readonly number[];
  /**
   * The last stretch of the line (world units) that does not count: an object right beside the fighter is
   * not "in front" of it unless the line really crosses it earlier.
   */
  tail: number;
  /** The ground corridor searched for tile obstacles, from the fighter towards the camera (world units). */
  reach: number;
}

export const VIEW_CLEAR: ViewClearConfig = {
  enterPad: 0.1,
  exitPad: 0.3,
  heights: [0.3, 0.85, 1.4],
  tail: 0.6,
  reach: 12,
};

/** Nominal heights of the per-tile obstacles that are not part of a board cover (pillars, breakables). */
export const PILLAR_HEIGHT = 1.6;
export const SOFT_HEIGHT = 1.1;

/**
 * Whether the segment a -> b passes through `box` grown by `pad` (sideways and on top; the floor stays the
 * floor), ignoring the final `tail` units before b. Slab test, no allocation.
 */
export function segmentEnters(a: Pt, b: Pt, box: Aabb, pad: number, tail: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  let t0 = 0;
  let t1 = Math.max(0, 1 - tail / len);
  const lo = [box.minX - pad, box.minY, box.minZ - pad];
  const hi = [box.maxX + pad, box.maxY + pad, box.maxZ + pad];
  const o = [a.x, a.y, a.z];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    const oi = o[i]!;
    const di = d[i]!;
    if (Math.abs(di) < 1e-9) {
      if (oi < lo[i]! || oi > hi[i]!) return false;
      continue;
    }
    let ta = (lo[i]! - oi) / di;
    let tb = (hi[i]! - oi) / di;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

/** Whether `box` stands between the camera and any tested point of the fighter at ground point (x, z). */
export function hidesFighter(
  camera: Pt,
  fighter: { x: number; z: number },
  box: Aabb,
  pad: number,
  config: ViewClearConfig = VIEW_CLEAR,
): boolean {
  const target: Pt = { x: fighter.x, y: 0, z: fighter.z };
  for (const h of config.heights) {
    target.y = h;
    if (segmentEnters(camera, target, box, pad, config.tail)) return true;
  }
  return false;
}

/**
 * Indices (into `boxes`) of the objects between the camera and the fighter standing at ground point
 * (x, z). `active` = the indices fading right now (they use the wider exit pad).
 */
export function pickOccluders(
  camera: Pt,
  fighter: { x: number; z: number },
  boxes: readonly Aabb[],
  active: ReadonlySet<number> | null,
  config: ViewClearConfig = VIEW_CLEAR,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < boxes.length; i++)
    if (hidesFighter(camera, fighter, boxes[i]!, active?.has(i) ? config.exitPad : config.enterPad, config))
      out.push(i);
  return out;
}

/**
 * Tile indices (row-major, `width` x `height`) whose cell lies within `pad` of the ground line from the
 * fighter towards the camera, up to `config.reach` away: the candidates for per-tile obstacles.
 * `wx` / `wz` convert a tile to its world centre; `tileOf` the other way.
 */
export function corridorTiles(
  fighter: { x: number; z: number },
  camera: { x: number; z: number },
  tileOf: (wx: number, wz: number) => number,
  config: ViewClearConfig = VIEW_CLEAR,
  out: Set<number> = new Set(),
): Set<number> {
  const dx = camera.x - fighter.x;
  const dz = camera.z - fighter.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return out;
  const ux = dx / len;
  const uz = dz / len;
  const span = Math.min(len, config.reach);
  const side = config.exitPad * 0.5;
  for (let s = 0.4; s <= span; s += 0.5)
    for (const k of [-side, 0, side]) {
      const t = tileOf(fighter.x + ux * s - uz * k, fighter.z + uz * s + ux * k);
      if (t >= 0) out.add(t);
    }
  return out;
}
