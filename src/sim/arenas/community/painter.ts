/**
 * Board painter for the researched City Rumble communities (Mushin, Fadeyi, Lagos Island, Lekki, Ebute-Metta).
 *
 * A board is composed from named structures instead of hand-typed rows: `solid()` stands a permanent object
 * (a shop, a stall block, a pier, a station hall) on '#' tiles and remembers WHAT it is, so the sim layout and
 * the renderer's cover list come from one source and cannot drift apart (tests/rumble-researched.test.ts also
 * re-checks the alignment). Everything here is pure data: rows of the layout characters documented on
 * `ArenaDef.layout` plus a list of `CoverRect`s.
 */
import type { CoverRect } from '../types';

type Key = string; // `${kind}:${group}`

export class Painter {
  private readonly g: string[][];
  private readonly c: (Key | null)[];
  private group = 0;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
    this.c = Array.from({ length: w * h }, () => null);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  at(x: number, y: number): string {
    return this.inside(x, y) ? this.g[y]![x]! : '#';
  }

  private set(x: number, y: number, ch: string, key: Key | null): void {
    if (!this.inside(x, y)) return;
    this.g[y]![x] = ch;
    this.c[y * this.w + x] = key;
  }

  /** Plain walkable floor (clears whatever stood there). */
  floor(x: number, y: number, w: number, h: number, ch: '.' | '_' | '=' = '.'): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch, null);
    return this;
  }

  road(x: number, y: number, w: number, h: number): this {
    return this.floor(x, y, w, h, '=');
  }

  plaza(x: number, y: number, w: number, h: number): this {
    return this.floor(x, y, w, h, '_');
  }

  /** A permanent object: `kind` is the renderer's family, `v` a variant (a palette / sign / height pick). */
  solid(x: number, y: number, w: number, h: number, kind: string, v = 0): this {
    const key = `${kind}:${v}:${this.group++}`;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, '#', key);
    return this;
  }

  /** A grid of identical blocks: `bw` x `bh` objects, `gx` / `gy` tiles of street between them. */
  blocks(
    x: number,
    y: number,
    w: number,
    h: number,
    o: {
      bw: number;
      bh: number;
      gx: number;
      gy: number;
      kind: string;
      /** shift every odd row of blocks by this many tiles (stagger so the cross alleys never line up) */
      stagger?: number;
      /** variant picker (block column, block row) */
      v?: (i: number, j: number) => number;
      /** drop some blocks (an opening in the grid): return true to skip */
      skip?: (i: number, j: number) => boolean;
      /** an alternative kind for some blocks */
      kindAt?: (i: number, j: number) => string | undefined;
    },
  ): this {
    let j = 0;
    for (let yy = y; yy + o.bh <= y + h; yy += o.bh + o.gy, j++) {
      const shift = j % 2 === 1 ? (o.stagger ?? 0) : 0;
      let i = 0;
      for (let xx = x + shift; xx + o.bw <= x + w; xx += o.bw + o.gx, i++) {
        if (o.skip?.(i, j)) continue;
        this.solid(xx, yy, o.bw, o.bh, o.kindAt?.(i, j) ?? o.kind, o.v ? o.v(i, j) : (i + j) % 4);
      }
    }
    return this;
  }

  /** Authored barrier crate ('x': always a crate, blasting it opens a shortcut). */
  barrier(x: number, y: number): this {
    this.set(x, y, 'x', null);
    return this;
  }

  /** Marked supply crate ('$'). */
  supply(x: number, y: number): this {
    this.set(x, y, '$', null);
    return this;
  }

  rows(): string[] {
    return this.g.map((r) => r.join(''));
  }

  /**
   * The cover objects: every group of one kind / variant / call, cut into rectangles (greedy: right, then
   * down). Rectangles of one call share a fade group in the renderer through `g`.
   */
  cover(): CoverRect[] {
    const out: CoverRect[] = [];
    const done = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const key = this.c[y * this.w + x];
        if (!key || done[y * this.w + x]) continue;
        let x1 = x;
        while (x1 + 1 < this.w && this.c[y * this.w + x1 + 1] === key && !done[y * this.w + x1 + 1]) x1++;
        let y1 = y;
        grow: for (;;) {
          const ny = y1 + 1;
          if (ny >= this.h) break;
          for (let i = x; i <= x1; i++)
            if (this.c[ny * this.w + i] !== key || done[ny * this.w + i]) break grow;
          y1 = ny;
        }
        for (let j = y; j <= y1; j++) for (let i = x; i <= x1; i++) done[j * this.w + i] = 1;
        const [kind, v, g] = key.split(':');
        out.push({ x, y, w: x1 - x + 1, h: y1 - y + 1, kind: kind!, v: Number(v), g: Number(g) });
      }
    return out;
  }
}

/** Open ('.' '_' '=' 'x' '$') tiles reachable from `from`, treating 'x' crates as walkable (they can be blasted). */
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
