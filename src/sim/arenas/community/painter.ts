/**
 * Board painter for the researched City Rumble communities (Mushin, Fadeyi, Lagos Island, Lekki, Ebute-Metta).
 *
 * A board is drawn from named structures: `fill()` and `stamp()` put CHARACTERS on a canvas. Sim characters keep
 * their meaning ('.' open floor, '_' kept-clear plaza, '=' road / track, 'x' authored barrier, '$' supply crate);
 * every other UPPER-CASE letter is a permanent object whose meaning (`CoverLegend`) tells the renderer what it
 * is - a shopfront, a stall block, a station hall. The same canvas gives the simulation's layout ('#' under each
 * letter) and the renderer's `CoverRect` list, so the two cannot drift apart (tests/rumble-researched.test.ts
 * re-checks it). Pure data, no rules.
 */
import type { CoverRect } from '../types';

/** What each object letter is: the renderer family and, for long runs, the widest piece one object may be. */
export type CoverLegend = Readonly<Record<string, { kind: string; maxRun?: number }>>;

export class Board {
  private readonly g: string[][];

  constructor(
    readonly w: number,
    readonly h: number,
    ch = '.',
  ) {
    this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => ch));
  }

  /** Inclusive rectangle (x0, y0)-(x1, y1), the same convention as `DistrictDef.rects`. */
  fill(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.g[y]![x] = ch;
    return this;
  }

  /** Writes text rows with their top-left corner at (x, y); a space leaves the tile as it is. */
  stamp(x: number, y: number, rows: readonly string[]): this {
    rows.forEach((row, j) =>
      [...row].forEach((c, i) => {
        if (c !== ' ' && y + j >= 0 && y + j < this.h && x + i >= 0 && x + i < this.w)
          this.g[y + j]![x + i] = c;
      }),
    );
    return this;
  }

  /**
   * A grid of identical objects inside the inclusive rectangle: `bw` x `bh` tiles each, `gx` / `gy` tiles of street
   * between them, every odd row shifted by `stagger` (so the cross alleys never line up). `skip(i, j)` leaves a
   * gap (a yard, a junction); `ch` may be a function of the block (a mix of two object kinds).
   */
  blocks(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    o: {
      ch: string | ((i: number, j: number) => string);
      bw: number;
      bh: number;
      gx: number;
      gy: number;
      stagger?: number;
      skip?: (i: number, j: number) => boolean;
      /** deterministic irregularity (authoring time, seeded): block width / height up to -jw / -jh tiles (a block never
       * grows into its alley), and the
       * share `drop` (0..1) of blocks left out, so a grid reads as a grown neighbourhood and not a mesh */
      seed?: number;
      jw?: number;
      jh?: number;
      drop?: number;
    },
  ): this {
    const rnd = (a: number, b: number): number => {
      let t = ((o.seed ?? 0) + a * 374761393 + b * 668265263) | 0;
      t = Math.imul(t ^ (t >>> 15), 2246822519);
      t = Math.imul(t ^ (t >>> 13), 3266489917);
      return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
    };
    let j = 0;
    for (let y = y0; y + o.bh - 1 <= y1; y += o.bh + o.gy, j++) {
      const shift = j % 2 === 1 ? (o.stagger ?? 0) : 0;
      let i = 0;
      for (let x = x0 + shift; x + o.bw - 1 <= x1; x += o.bw + o.gx, i++) {
        if (o.skip?.(i, j) || (o.drop && rnd(i, j) < o.drop)) continue;
        const bw = Math.max(1, o.bw - (o.jw ? Math.floor(rnd(i + 11, j) * (o.jw + 1)) : 0));
        const bh = Math.max(1, o.bh - (o.jh ? Math.floor(rnd(i, j + 13) * (o.jh + 1)) : 0));
        this.fill(
          x,
          y,
          Math.min(x1, x + bw - 1),
          Math.min(y1, y + bh - 1),
          typeof o.ch === 'function' ? o.ch(i, j) : o.ch,
        );
      }
    }
    return this;
  }

  set(x: number, y: number, ch: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y]![x] = ch;
    return this;
  }

  get(x: number, y: number): string {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.g[y]![x]! : '#';
  }

  /** The simulation layout: every object letter becomes '#'. */
  layout(legend: CoverLegend): string[] {
    return this.g.map((row) => row.map((c) => (legend[c] ? '#' : c)).join(''));
  }

  /**
   * The objects: each connected run of one letter is cut into rectangles (greedy, right then down) no wider
   * than the letter's `maxRun`; every piece is one object (variants count up so neighbours differ).
   */
  cover(legend: CoverLegend): CoverRect[] {
    const out: CoverRect[] = [];
    const done = new Uint8Array(this.w * this.h);
    let n = 0;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.g[y]![x]!;
        const def = legend[c];
        if (!def || done[y * this.w + x]) continue;
        const cap = def.maxRun ?? 6;
        let x1 = x;
        while (x1 + 1 < this.w && x1 + 1 - x < cap && this.g[y]![x1 + 1] === c && !done[y * this.w + x1 + 1])
          x1++;
        let y1 = y;
        grow: for (;;) {
          const ny = y1 + 1;
          if (ny >= this.h || ny - y >= cap) break;
          for (let i = x; i <= x1; i++) if (this.g[ny]![i] !== c || done[ny * this.w + i]) break grow;
          y1 = ny;
        }
        for (let j = y; j <= y1; j++) for (let i = x; i <= x1; i++) done[j * this.w + i] = 1;
        out.push({ x, y, w: x1 - x + 1, h: y1 - y + 1, kind: def.kind, v: n % 7, g: n });
        n++;
      }
    return out;
  }
}

/** Open tiles reachable from `from` (crates count as walkable unless `blockCrates`: they can be blasted). */
export function flood(rows: readonly string[], from: [number, number], blockCrates = false): Set<number> {
  const h = rows.length;
  const w = rows[0]!.length;
  const seen = new Set<number>();
  const stack: [number, number][] = [from];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const ch = rows[y]![x]!;
    if (ch === '#' || (blockCrates && (ch === 'x' || ch === '$'))) continue;
    const k = y * w + x;
    if (seen.has(k)) continue;
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

/**
 * The nearest plain open floor tile ('.') to (x, y), by spiral search - authoring helper, so supply crates, trap
 * marks and strike zones are anchored by intent ("by the food hall") and stay on open floor when a board is
 * redrawn. `taken` tiles are skipped (two anchors never snap to the same tile).
 */
export function nearestOpen(
  rows: readonly string[],
  x: number,
  y: number,
  taken: ReadonlySet<string> = new Set(),
): [number, number] {
  const open = (i: number, j: number): boolean => rows[j]?.[i] === '.' && !taken.has(`${i},${j}`);
  for (let r = 0; r < 40; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (open(x + dx, y + dy)) return [x + dx, y + dy];
      }
  throw new Error(`no open floor near ${x},${y}`);
}

/** A two-tile strike zone anchored near (x, y): the nearest open tile and its open east (else south) neighbour. */
export function zoneNear(
  rows: readonly string[],
  x: number,
  y: number,
  taken: ReadonlySet<string> = new Set(),
): [number, number][] {
  const [a, b] = nearestOpen(rows, x, y, taken);
  const open = (i: number, j: number): boolean => rows[j]?.[i] === '.' && !taken.has(`${i},${j}`);
  return open(a + 1, b)
    ? [
        [a, b],
        [a + 1, b],
      ]
    : open(a, b + 1)
      ? [
          [a, b],
          [a, b + 1],
        ]
      : [[a, b]];
}
