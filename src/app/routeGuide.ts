/**
 * The direction indicator of the objective guidance (docs/MISSION_GUIDANCE.md, decision MG6): which way to walk to
 * reach the current objective, following the WALKABLE route over the board's tiles (a breadth-first search), never a
 * straight line through a wall. The arrow shows the direction of the first few steps of that route and the distance is
 * the route's length in steps. Presentation only: it reads the tiles the way the minimap does and decides nothing.
 *
 *   1. a route over open floor (`via: 'walk'`);
 *   2. none: a route that needs crates blasted out of the way (`via: 'blast'`, the text says so);
 *   3. none at all (sealed by walls): the plain direction with no distance (`via: 'none'`), so it never implies a route.
 *
 * A target that stands on a solid tile (a crate, a piece of equipment) is reached from any of its four neighbours: that is
 * where a generator is laid next to it. `RouteCache` recomputes only when the human's tile, the target or the board's
 * revision changes (a few BFS runs per second at most; measured in tests/app/routeGuide.test.ts).
 */
import { Tile } from '../sim/types';

export interface RouteGrid {
  width: number;
  height: number;
  /** One `Tile` value per cell, row-major (`GameState.tiles`). */
  tiles: ArrayLike<number>;
}

export interface TilePoint {
  x: number;
  y: number;
}

export type RouteVia = 'walk' | 'blast' | 'none';

export interface RouteCue {
  /** "↑" ... one of eight arrows ("•" when standing on it). */
  arrow: string;
  /** The same in words ("UP-RIGHT", "HERE"): screen readers and tests. */
  word: string;
  /** Steps along the route (0 when there; the straight grid distance when there is no route). */
  tiles: number;
  via: RouteVia;
  /** "↑ 6 TILES", "↑ 6 TILES · BLAST A PATH", "↗ NO OPEN ROUTE", "HERE". */
  text: string;
  /** The first steps of the route (at most `LOOK_STEPS`), not including the start tile. */
  steps: TilePoint[];
}

const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'] as const;
const WORDS = ['RIGHT', 'DOWN-RIGHT', 'DOWN', 'DOWN-LEFT', 'LEFT', 'UP-LEFT', 'UP', 'UP-RIGHT'] as const;
/** The arrow follows this many steps of the route (a bend later on does not turn it yet). */
export const LOOK_STEPS = 3;

/** Eight-way direction of a grid vector (y grows downwards, as on the board and the screen). */
export function arrowOf(dx: number, dy: number): { arrow: string; word: string } {
  if (dx === 0 && dy === 0) return { arrow: '•', word: 'HERE' };
  const i = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  return { arrow: ARROWS[i]!, word: WORDS[i]! };
}

const plural = (n: number): string => `${n} ${n === 1 ? 'TILE' : 'TILES'}`;

/**
 * Shortest route from `from` to `to` (or to a neighbour of `to` when it is solid), over tiles that `open` allows.
 * Returns the tiles walked (start excluded), or null when there is none.
 */
function bfs(
  grid: RouteGrid,
  from: TilePoint,
  to: TilePoint,
  open: (t: number) => boolean,
  scratch: Int32Array,
): TilePoint[] | null {
  const { width: w, height: h, tiles } = grid;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h;
  if (!inside(from.x, from.y) || !inside(to.x, to.y)) return null;
  const targetIdx = to.y * w + to.x;
  const targetOpen = open(tiles[targetIdx]!);
  const isGoal = (i: number): boolean => {
    if (i === targetIdx) return true;
    if (targetOpen) return false;
    const x = i % w;
    const y = (i - x) / w;
    return Math.abs(x - to.x) + Math.abs(y - to.y) === 1;
  };
  const start = from.y * w + from.x;
  const prev = scratch;
  prev.fill(-2, 0, w * h);
  prev[start] = -1;
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  let found = -1;
  if (isGoal(start)) found = start;
  while (found < 0 && head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    const y = (i - x) / w;
    // a fixed neighbour order (up, right, down, left) keeps the route the same from the same board
    const next = [y > 0 ? i - w : -1, x < w - 1 ? i + 1 : -1, y < h - 1 ? i + w : -1, x > 0 ? i - 1 : -1];
    for (const n of next) {
      if (n < 0 || prev[n] !== -2) continue;
      if (!open(tiles[n]!)) continue;
      prev[n] = i;
      if (isGoal(n)) {
        found = n;
        break;
      }
      queue[tail++] = n;
    }
  }
  if (found < 0) return null;
  const path: TilePoint[] = [];
  for (let i = found; i !== start; i = prev[i]!) path.push({ x: i % w, y: Math.floor(i / w) });
  return path.reverse();
}

let scratchBuf = new Int32Array(0);
function scratchFor(n: number): Int32Array {
  if (scratchBuf.length < n) scratchBuf = new Int32Array(n);
  return scratchBuf;
}

const walkable = (t: number): boolean => t === Tile.Empty;
const blastable = (t: number): boolean => t === Tile.Empty || t === Tile.Soft;

/** The cue towards `to`: along the open route, else a route through crates, else the plain direction. */
export function routeCue(grid: RouteGrid, from: TilePoint, to: TilePoint): RouteCue {
  const straight = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  if (straight === 0) return { arrow: '•', word: 'HERE', tiles: 0, via: 'walk', text: 'HERE', steps: [] };
  const scratch = scratchFor(grid.width * grid.height);
  let via: RouteVia = 'walk';
  let path = bfs(grid, from, to, walkable, scratch);
  if (!path) {
    via = 'blast';
    path = bfs(grid, from, to, blastable, scratch);
  }
  if (!path) {
    const a = arrowOf(to.x - from.x, to.y - from.y);
    return { ...a, tiles: straight, via: 'none', text: `${a.arrow} NO OPEN ROUTE`, steps: [] };
  }
  if (path.length === 0) return { arrow: '•', word: 'HERE', tiles: 0, via, text: 'HERE', steps: [] };
  const steps = path.slice(0, LOOK_STEPS);
  const ahead = steps[steps.length - 1]!;
  const a = arrowOf(ahead.x - from.x, ahead.y - from.y);
  const text = `${a.arrow} ${plural(path.length)}${via === 'blast' ? ' · BLAST A PATH' : ''}`;
  return { ...a, tiles: path.length, via, text, steps };
}

/**
 * Remembers the last cue and recomputes only when the human's tile, the target or `revision` changes (the caller bumps
 * the revision when the board can have changed, e.g. every half second of play). Cheap enough for every HUD publish.
 */
export class RouteCache {
  private key = '';
  private cue: RouteCue | null = null;
  /** BFS runs so far (tests and the performance note). */
  runs = 0;

  get(grid: RouteGrid, from: TilePoint, to: TilePoint, revision: number): RouteCue {
    const key = `${grid.width}x${grid.height}:${from.x},${from.y}>${to.x},${to.y}#${revision}`;
    if (this.cue && key === this.key) return this.cue;
    this.key = key;
    this.runs++;
    this.cue = routeCue(grid, from, to);
    return this.cue;
  }
}
