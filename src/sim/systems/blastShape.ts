/**
 * Radial blast geometry (City Rumble Evolution, decisions RE-B1..B6 in docs/DECISIONS.md).
 *
 * Classic keeps the plus (and the Power Yard full line) in `explosions.ts`; this module is the shape
 * `generator.blastMode = 'radial'` uses, and the ONE implementation every consumer shares: the simulation's
 * flames, the renderer's danger footprint (`previewBlast`) and the bots' danger maps all call
 * `radialFootprint`. Pure and deterministic (integer arithmetic only).
 *
 * The footprint of a generator with radius R:
 *  - the disc: every tile (dx, dy) with dx^2 + dy^2 <= R^2 + R (R 1 = the 3 x 3 square, R 2 = 21 tiles,
 *    R 3 = 37, R 4 = 69, R 5 = 97). Diagonal neighbours are always inside it;
 *  - Square Blast tier t > 0 in radial mode turns the disc into the full square of radius
 *    `min(R + t - 1, radial.maxSquareRadius)` (the successor of the V2 Square Blast, decision RE-B4);
 *  - a tile is reached when BOTH:
 *      1. the blast wave can walk there: it spreads out one tile at a time, only ever moving away from the
 *         centre (the V2 Square Blast wave rule), never into concrete or the arena edge; a crate or another
 *         generator is hit (it breaks / chains) but passes nothing on - so no blast squeezes diagonally
 *         between two blocked corners;
 *      2. the straight line from the generator's centre to the tile's centre is clear: every tile the line
 *         crosses before the target (an exact corner crossing touches neither side) is open floor with no
 *         generator. So permanent walls and crates cast a real shadow behind them, not just along the axis.
 *  - Hot Fuel (`pierce`): the wave and the line may pass through ONE crate on the way (it still breaks).
 *  - Concrete is never hit. A crate destroyed by an earlier explosion is open floor for every later one;
 *    crates hit in the same tick all block (explosions.ts resolves against the tile map at the start of the
 *    tick).
 */
import { tileAt } from '../grid';
import type { GridView } from '../grid';
import { Tile } from '../types';

export interface RadialOffset {
  dx: number;
  dy: number;
  /** Tiles the centre-to-centre line crosses strictly between the generator and this tile. */
  between: readonly (readonly [number, number])[];
}

/** Is (dx, dy) inside the radial disc of radius `r`? */
export const inDisc = (dx: number, dy: number, r: number): boolean => dx * dx + dy * dy <= r * r + r;

/** Tiles the centre-to-centre line from (0, 0) to (dx, dy) crosses, excluding both ends (exact corners go diagonal). */
export function lineBetween(dx: number, dy: number): [number, number][] {
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      x += sx;
      y += sy;
      ix++;
      iy++;
    } else if (decision < 0) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    if (ix < nx || iy < ny) out.push([x, y]);
  }
  return out;
}

const tables = new Map<string, readonly RadialOffset[]>();

/**
 * Offsets of the disc (`square` false) or full square of radius `r`, in wave order: by Manhattan ring, then
 * dx, then dy (centre excluded). Cached per shape; callers must not mutate it.
 */
export function radialOffsets(r: number, square = false): readonly RadialOffset[] {
  const key = `${r}:${square ? 's' : 'd'}`;
  const hit = tables.get(key);
  if (hit) return hit;
  const out: RadialOffset[] = [];
  for (let ring = 1; ring <= 2 * r; ring++) {
    for (let dx = -r; dx <= r; dx++) {
      const dyAbs = ring - Math.abs(dx);
      if (dyAbs < 0 || dyAbs > r) continue;
      for (const dy of dyAbs === 0 ? [0] : [-dyAbs, dyAbs]) {
        if (!square && !inDisc(dx, dy, r)) continue;
        out.push({ dx, dy, between: lineBetween(dx, dy) });
      }
    }
  }
  tables.set(key, out);
  return out;
}

/** Radius of a radial blast: the generator's range (Petrol Top-Up raises it), capped by `generator.maxRange`. */
export function radialRadius(range: number, maxRange: number): number {
  return Math.max(1, Math.min(range, maxRange));
}

/** Radius of the square a Square Blast tier makes of a radial blast (0 = keep the disc). */
export function radialSquareRadius(radius: number, squareTier: number, maxSquareRadius: number): number {
  if (squareTier <= 0) return 0;
  return Math.max(radius, Math.min(radius + squareTier - 1, maxSquareRadius));
}

export interface RadialOptions {
  /** Hot Fuel: the wave and the line may pass one crate. */
  pierce?: boolean;
  /** Use the full square of this radius instead of the disc (Square Blast successor); 0 = disc. */
  squareRadius?: number;
  /** A tile holding another generator: it is hit (chains) but passes nothing on. */
  blocksWave?: (x: number, y: number) => boolean;
}

/**
 * Every tile a radial blast centred on (cx, cy) reaches, the centre excluded, in deterministic wave order.
 * `grid` is the tile map the blast is resolved against (an Observation qualifies).
 */
export function radialFootprint(
  grid: GridView,
  cx: number,
  cy: number,
  radius: number,
  opts: RadialOptions = {},
): { x: number; y: number }[] {
  const squareR = opts.squareRadius ?? 0;
  const r = squareR > 0 ? squareR : radius;
  const square = squareR > 0;
  const pierce = opts.pierce === true;
  const blocks = opts.blocksWave ?? ((): boolean => false);
  const size = 2 * r + 1;
  // 0 = not passing on, 1 = passes (fresh), 2 = passes having used the Hot Fuel crate
  const pass = new Uint8Array(size * size);
  const at = (dx: number, dy: number): number => (dy + r) * size + (dx + r);
  pass[at(0, 0)] = 1;
  // a tile the line may cross: open floor without a generator (or one crate with Hot Fuel)
  const lineCost = (x: number, y: number): number => {
    const k = tileAt(grid, x, y);
    if (k === Tile.Hard) return 99;
    if (k === Tile.Soft) return 1;
    return blocks(x, y) ? 99 : 0;
  };
  const out: { x: number; y: number }[] = [];
  for (const o of radialOffsets(r, square)) {
    const x = cx + o.dx;
    const y = cy + o.dy;
    const kind = tileAt(grid, x, y);
    if (kind === Tile.Hard) continue;
    // 1. the wave: a predecessor one step closer along x or along y passes it on
    const px = o.dx !== 0 ? pass[at(o.dx - Math.sign(o.dx), o.dy)]! : 0;
    const py = o.dy !== 0 ? pass[at(o.dx, o.dy - Math.sign(o.dy))]! : 0;
    const best = px === 1 || py === 1 ? 1 : px === 2 || py === 2 ? 2 : 0;
    if (best === 0) continue;
    // 2. the line of sight
    let crates = 0;
    for (const [bx, by] of o.between) {
      crates += lineCost(cx + bx, cy + by);
      if (crates > (pierce ? 1 : 0)) break;
    }
    if (crates > (pierce ? 1 : 0)) continue;
    out.push({ x, y });
    if (kind === Tile.Empty && !blocks(x, y)) pass[at(o.dx, o.dy)] = best;
    else if (kind === Tile.Soft && pierce && best === 1 && !blocks(x, y)) pass[at(o.dx, o.dy)] = 2;
  }
  return out;
}
