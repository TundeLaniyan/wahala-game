/** Static grid topology, cached per arena size so the per-tick code never allocates it. */
import { DIRS, DIR_VEC } from '../sim';
import type { Dir } from '../sim';

export interface Board {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  /** `size * 4` neighbour tile indices in DIRS order (up, right, down, left); -1 when off the arena. */
  readonly neighbor: Int16Array;
}

const cache = new Map<number, Board>();

export const DIR_COUNT = 4;

export function getBoard(width: number, height: number): Board {
  const key = width * 1000 + height;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = width * height;
  const neighbor = new Int16Array(size * DIR_COUNT).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      DIRS.forEach((d, i) => {
        const nx = x + DIR_VEC[d].dx;
        const ny = y + DIR_VEC[d].dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height)
          neighbor[(y * width + x) * DIR_COUNT + i] = ny * width + nx;
      });
    }
  }
  const board = { width, height, size, neighbor };
  cache.set(key, board);
  return board;
}

export const dirIndex = (d: Dir): number => DIRS.indexOf(d);

/** Direction that leads from tile `a` to the adjacent tile `b`, or null if they are not neighbours. */
export function dirBetweenTiles(board: Board, a: number, b: number): Dir | null {
  for (let i = 0; i < DIR_COUNT; i++) if (board.neighbor[a * DIR_COUNT + i] === b) return DIRS[i]!;
  return null;
}

export const manhattanTiles = (board: Board, a: number, b: number): number =>
  Math.abs((a % board.width) - (b % board.width)) +
  Math.abs(Math.floor(a / board.width) - Math.floor(b / board.width));
