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
 *
 * Decision VF-B: one line to the fighter is not enough. A building beside or in front of the fighter hides the
 * floor around it (rivals, flames, the blast lanes) and, from the real camera pose of a phone, the fighter itself.
 * The decision is therefore made in SCREEN space: `viewPoints` builds the points that must stay readable (the
 * fighter's feet / torso / head, a disc of walkable floor around it, live rivals and generators close by),
 * drops those that fall outside the frame (the real view-projection matrix), and `pickOccludersFor` fades every
 * box that stands between the camera and any of them, which is exactly "its projection overlaps the point and it
 * is nearer than the point". Bounding boxes and a few dozen points: no raycast against meshes.
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
  /** Radii (tiles) of the floor rings kept readable around the fighter; every ring has `ringSteps` points. */
  ringRadii: readonly number[];
  ringSteps: number;
  /** One more ring (tiles) that only keeps an object already fading (hysteresis of the disc; about the exit pad wide). */
  haloRadius: number;
  /** An object that leaves the picture stays faded for this many tests in a row without a hit (debounce, see `holdMisses`). */
  leaveTests: number;
  /** Boxes at least this tall protect the whole disc; lower ones (crates) only the rings up to `lowRing`. */
  tallHeight: number;
  lowRing: number;
  /** Live rivals / generators within this many tiles of the fighter are kept readable too (at most `maxExtras`). */
  extraNear: number;
  maxExtras: number;
  /** A point only counts while it projects inside |ndc| <= this (the halo / extras use the same bound). */
  screenMargin: number;
  /** The last stretch (world units) of a floor point's line that does not count. */
  floorTail: number;
  /**
   * Margins for the floor points. Tighter than the fighter's: a floor point sits right at the foot of the
   * building next to a lane, and a margin there would fade it for a fighter who merely walks along the wall.
   */
  floorEnterPad: number;
  floorExitPad: number;
  /**
   * Floor-disc points only count for an object that stands in front of the fighter: its footprint's closest point to
   * the camera is nearer than the fighter by at least this much (the value is negative: slack of -0.25 = 0.25 world
   * units nearer). A hut right behind the fighter hides the floor behind itself, which is not "in front of" the
   * fighter and stays solid; its group box may overhang by a few tenths (awnings), hence the margin.
   */
  nearerSlack: number;
}

export const VIEW_CLEAR: ViewClearConfig = {
  enterPad: 0.1,
  exitPad: 0.3,
  heights: [0.3, 0.85, 1.4],
  tail: 0.6,
  reach: 12,
  ringRadii: [0.9, 1.7, 2.5],
  ringSteps: 12,
  haloRadius: 2.8,
  leaveTests: 2,
  tallHeight: 1.5,
  lowRing: 1.0,
  extraNear: 4,
  maxExtras: 10,
  screenMargin: 1,
  floorTail: 0.3,
  floorEnterPad: 0,
  floorExitPad: 0.08,
  nearerSlack: -0.25,
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
  // slab test, unrolled over x / y / z (this runs thousands of times per test: no allocation)
  const loX = box.minX - pad;
  const hiX = box.maxX + pad;
  if (Math.abs(dx) < 1e-9) {
    if (a.x < loX || a.x > hiX) return false;
  } else {
    let ta = (loX - a.x) / dx;
    let tb = (hiX - a.x) / dx;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  const loY = box.minY;
  const hiY = box.maxY + pad;
  if (Math.abs(dy) < 1e-9) {
    if (a.y < loY || a.y > hiY) return false;
  } else {
    let ta = (loY - a.y) / dy;
    let tb = (hiY - a.y) / dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  const loZ = box.minZ - pad;
  const hiZ = box.maxZ + pad;
  if (Math.abs(dz) < 1e-9) {
    if (a.z < loZ || a.z > hiZ) return false;
  } else {
    let ta = (loZ - a.z) / dz;
    let tb = (hiZ - a.z) / dz;
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

/** A point of the picture that must stay readable. */
export interface ViewPoint extends Pt {
  /** The last stretch of its line that does not count (world units). */
  tail: number;
  /** Radius (tiles) of the floor ring it belongs to; 0 for the fighter and live extras. */
  ring: number;
  /** Outer ring: keeps an object that already fades, never starts one. */
  halo: boolean;
}

/** Normalised device coordinates of a world point under a column-major view-projection matrix (w <= 0: behind). */
export function projectNdc(
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; ahead: boolean } {
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  return { x: cx / (w || 1e-9), y: cy / (w || 1e-9), ahead: w > 1e-6 };
}

export interface ViewPointInput {
  /** The fighter's render position on the floor (world x, z). */
  fighter: { x: number; z: number };
  /** Column-major view-projection matrix of the camera that draws the frame. */
  viewProj: ArrayLike<number>;
  /** Is the floor at this world position walkable (not a block or a building)? */
  walkable: (x: number, z: number) => boolean;
  /** Live rivals / generators close to the fighter: world x, z and the height worth showing. */
  extras?: readonly { x: number; z: number; y: number }[];
}

/**
 * The points that must stay readable, already limited to what the frame shows. Floor points on a block or a
 * building are skipped (the object itself is not "hiding" its own footprint).
 */
export function viewPoints(input: ViewPointInput, config: ViewClearConfig = VIEW_CLEAR): ViewPoint[] {
  const { fighter, viewProj, walkable } = input;
  const out: ViewPoint[] = [];
  const shown = (x: number, y: number, z: number, margin: number): boolean => {
    const n = projectNdc(viewProj, x, y, z);
    return n.ahead && Math.abs(n.x) <= margin && Math.abs(n.y) <= margin;
  };
  // the fighter itself always counts, even half off screen: the camera follows it, so it is on screen
  for (const h of config.heights)
    out.push({ x: fighter.x, y: h, z: fighter.z, tail: config.tail, ring: 0, halo: false });
  const radii = [...config.ringRadii, config.haloRadius];
  radii.forEach((r, ri) => {
    const halo = ri === radii.length - 1;
    for (let k = 0; k < config.ringSteps; k++) {
      // a half step of phase per ring so the points do not line up into spokes
      const a = ((k + (ri % 2) * 0.5) / config.ringSteps) * Math.PI * 2;
      const x = fighter.x + Math.cos(a) * r;
      const z = fighter.z + Math.sin(a) * r;
      if (!walkable(x, z) || !shown(x, 0.15, z, config.screenMargin)) continue;
      out.push({ x, y: 0.15, z, tail: config.floorTail, ring: r, halo });
    }
  });
  let n = 0;
  for (const e of input.extras ?? []) {
    if (n >= config.maxExtras) break;
    if (!shown(e.x, e.y, e.z, config.screenMargin)) continue;
    out.push({ x: e.x, y: e.y, z: e.z, tail: config.tail, ring: 0, halo: false });
    out.push({ x: e.x, y: 0.15, z: e.z, tail: config.floorTail, ring: 0, halo: false });
    n++;
  }
  return out;
}

/**
 * Whether `box` stands between the camera and any point. `grown` (the box is already fading) widens the
 * margin to the exit pad and also counts the halo ring. Low boxes (crates) only protect the inner rings.
 */
export function hidesAny(
  camera: Pt,
  points: readonly ViewPoint[],
  box: Aabb,
  grown: boolean,
  config: ViewClearConfig = VIEW_CLEAR,
  fighter?: { x: number; z: number },
): boolean {
  const bodyPad = grown ? config.exitPad : config.enterPad;
  const floorPad = grown ? config.floorExitPad : config.floorEnterPad;
  const tall = box.maxY >= config.tallHeight;
  const target: Pt = { x: 0, y: 0, z: 0 };
  // the floor disc only counts for an object nearer to the camera than the fighter (see `nearerSlack`)
  const nearer = fighter === undefined || isNearerThan(camera, fighter, box, config.nearerSlack);
  for (const p of points) {
    if (p.halo && !grown) continue;
    if (!tall && p.ring > config.lowRing) continue;
    if (p.ring > 0 && !nearer) continue;
    target.x = p.x;
    target.y = p.y;
    target.z = p.z;
    if (segmentEnters(camera, target, box, p.y < 0.2 ? floorPad : bodyPad, p.tail)) return true;
  }
  return false;
}

/** Whether the closest point of the box's footprint is nearer to the camera than the fighter by more than `-slack`. */
export function isNearerThan(
  camera: { x: number; z: number },
  fighter: { x: number; z: number },
  box: Aabb,
  slack: number,
): boolean {
  const cx = Math.min(box.maxX, Math.max(box.minX, camera.x));
  const cz = Math.min(box.maxZ, Math.max(box.minZ, camera.z));
  return (
    Math.hypot(camera.x - cx, camera.z - cz) < Math.hypot(camera.x - fighter.x, camera.z - fighter.z) + slack
  );
}

/** Indices of the boxes between the camera and any readable point (see `hidesAny`); `active` = fading now. */
export function pickOccludersFor(
  camera: Pt,
  points: readonly ViewPoint[],
  boxes: readonly Aabb[],
  active: ReadonlySet<number> | null,
  config: ViewClearConfig = VIEW_CLEAR,
  fighter?: { x: number; z: number },
): number[] {
  const out: number[] = [];
  // every line runs from the camera to a point: a box outside the box around all of them cannot be crossed
  let minX = camera.x;
  let maxX = camera.x;
  let minZ = camera.z;
  let maxZ = camera.z;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const slack = config.exitPad + 0.01;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    if (b.maxX + slack < minX || b.minX - slack > maxX || b.maxZ + slack < minZ || b.minZ - slack > maxZ)
      continue;
    if (hidesAny(camera, points, b, active?.has(i) === true, config, fighter)) out.push(i);
  }
  return out;
}

/**
 * Tile indices (row-major) of the ground between the fighter and the camera, `side` tiles wide on both sides
 * of that line and up to `config.reach` away: the candidates for per-tile obstacles that can cover the disc.
 */
export function regionTiles(
  fighter: { x: number; z: number },
  camera: { x: number; z: number },
  tileOf: (wx: number, wz: number) => number,
  side: number,
  config: ViewClearConfig = VIEW_CLEAR,
  out: Set<number> = new Set(),
): Set<number> {
  const dx = camera.x - fighter.x;
  const dz = camera.z - fighter.z;
  const len = Math.hypot(dx, dz);
  // straight above the fighter (a top-down view): the disc around it is the whole region
  const ux = len < 1e-6 ? 0 : dx / len;
  const uz = len < 1e-6 ? 1 : dz / len;
  const span = Math.min(len, config.reach);
  for (let s = -side; s <= span + side; s += 0.5)
    for (let k = -side; k <= side + 1e-6; k += 0.5) {
      const t = tileOf(fighter.x + ux * s - uz * k, fighter.z + uz * s + ux * k);
      if (t >= 0) out.add(t);
    }
  return out;
}

/**
 * Debounce for objects leaving the picture. `fresh` holds the ids that stood in the way in this test; `previous`
 * the ids faded after the last one; `misses` counts, per id, the tests in a row without a hit. An id stays in the
 * result until it has missed `config.leaveTests` tests in a row, so a fighter jittering along the edge of an
 * object (a sub-tile step, a camera lead) never makes it blink, yet it is solid again within a couple of tests.
 * Mutates `misses`; returns the ids to keep faded.
 */
export function holdMisses(
  previous: ReadonlySet<number>,
  fresh: ReadonlySet<number>,
  misses: Map<number, number>,
  config: ViewClearConfig = VIEW_CLEAR,
): Set<number> {
  const out = new Set(fresh);
  for (const id of fresh) misses.delete(id);
  for (const id of previous) {
    if (fresh.has(id)) continue;
    const n = (misses.get(id) ?? 0) + 1;
    if (n < config.leaveTests) {
      misses.set(id, n);
      out.add(id);
    } else misses.delete(id);
  }
  for (const id of [...misses.keys()]) if (!out.has(id)) misses.delete(id);
  return out;
}
