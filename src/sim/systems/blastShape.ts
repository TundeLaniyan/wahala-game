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
 * `radialOffsets` compiled for the footprint loop (an internal speed-up, the output is unchanged): typed
 * arrays of the offsets, the wave-buffer index of each offset and of its two wave predecessors (one step
 * closer along x / along y, -1 = none), and the centre-line tiles flattened. Cached per shape.
 */
interface CompiledShape {
  size: number;
  count: number;
  dx: Int8Array;
  dy: Int8Array;
  self: Int16Array;
  predX: Int16Array;
  predY: Int16Array;
  /** Line tiles of offset i are bdx/bdy[bStart[i] .. bStart[i + 1] - 1]. */
  bStart: Int32Array;
  bdx: Int8Array;
  bdy: Int8Array;
}

/** Indexed by 2 * r + (square ? 1 : 0). */
const compiled: (CompiledShape | undefined)[] = [];

function compiledShape(r: number, square: boolean): CompiledShape {
  const key = 2 * r + (square ? 1 : 0);
  const hit = compiled[key];
  if (hit) return hit;
  const offs = radialOffsets(r, square);
  const size = 2 * r + 1;
  const at = (dx: number, dy: number): number => (dy + r) * size + (dx + r);
  const count = offs.length;
  let lineTiles = 0;
  for (const o of offs) lineTiles += o.between.length;
  const shape: CompiledShape = {
    size,
    count,
    dx: new Int8Array(count),
    dy: new Int8Array(count),
    self: new Int16Array(count),
    predX: new Int16Array(count),
    predY: new Int16Array(count),
    bStart: new Int32Array(count + 1),
    bdx: new Int8Array(lineTiles),
    bdy: new Int8Array(lineTiles),
  };
  let b = 0;
  offs.forEach((o, i) => {
    shape.dx[i] = o.dx;
    shape.dy[i] = o.dy;
    shape.self[i] = at(o.dx, o.dy);
    shape.predX[i] = o.dx !== 0 ? at(o.dx - Math.sign(o.dx), o.dy) : -1;
    shape.predY[i] = o.dy !== 0 ? at(o.dx, o.dy - Math.sign(o.dy)) : -1;
    shape.bStart[i] = b;
    for (const [bx, by] of o.between) {
      shape.bdx[b] = bx;
      shape.bdy[b] = by;
      b++;
    }
  });
  shape.bStart[count] = b;
  compiled[key] = shape;
  return shape;
}

/** Wave buffer shared by every call (radialFootprint never re-enters itself; `blocksWave` must not call it). */
let passScratch = new Uint8Array(0);
const neverBlocks = (): boolean => false;

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
  const shape = compiledShape(r, squareR > 0);
  const pierce = opts.pierce === true;
  const limit = pierce ? 1 : 0;
  const blocks = opts.blocksWave ?? neverBlocks;
  const { width, height, tiles } = grid;
  const cells = shape.size * shape.size;
  if (passScratch.length < cells) passScratch = new Uint8Array(cells);
  // 0 = not passing on, 1 = passes (fresh), 2 = passes having used the Hot Fuel crate
  const pass = passScratch;
  pass.fill(0, 0, cells);
  pass[r * shape.size + r] = 1;
  const { dx, dy, self, predX, predY, bStart, bdx, bdy } = shape;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < shape.count; i++) {
    const x = cx + dx[i]!;
    const y = cy + dy[i]!;
    // out of bounds behaves as concrete (tileAt)
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const kind = tiles[y * width + x]!;
    if (kind === Tile.Hard) continue;
    // 1. the wave: a predecessor one step closer along x or along y passes it on
    const px = predX[i]! >= 0 ? pass[predX[i]!]! : 0;
    const py = predY[i]! >= 0 ? pass[predY[i]!]! : 0;
    const best = px === 1 || py === 1 ? 1 : px === 2 || py === 2 ? 2 : 0;
    if (best === 0) continue;
    // 2. the line of sight: open floor without a generator costs 0, a crate 1 (Hot Fuel passes one)
    let crates = 0;
    for (let j = bStart[i]!, e = bStart[i + 1]!; j < e; j++) {
      const bx = cx + bdx[j]!;
      const by = cy + bdy[j]!;
      const k = bx < 0 || by < 0 || bx >= width || by >= height ? Tile.Hard : tiles[by * width + bx]!;
      crates += k === Tile.Hard ? 99 : k === Tile.Soft ? 1 : blocks(bx, by) ? 99 : 0;
      if (crates > limit) break;
    }
    if (crates > limit) continue;
    out.push({ x, y });
    if (kind === Tile.Empty && !blocks(x, y)) pass[self[i]!] = best;
    else if (kind === Tile.Soft && pierce && best === 1 && !blocks(x, y)) pass[self[i]!] = 2;
  }
  return out;
}
