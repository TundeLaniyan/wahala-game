/**
 * Layout helpers for arena data. A standard arena is 15 x 11 tiles with 4-fold mirror symmetry so
 * every corner spawn faces exactly the same board. Authoring happens in the top-left quadrant
 * (x 0..7, y 0..5) and is mirrored into the other three.
 */
import type { TilePos } from '../types';

export const COLS = 15;
export const ROWS = 11;

export type XY = readonly [x: number, y: number];

/** Every mirror image of the marks (deduplicated, in a stable order). */
export function mirror4(marks: readonly XY[], cols = COLS, rows = ROWS): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<string>();
  for (const [x, y] of marks) {
    for (const [mx, my] of [
      [x, y],
      [cols - 1 - x, y],
      [x, rows - 1 - y],
      [cols - 1 - x, rows - 1 - y],
    ] as const) {
      const k = `${mx},${my}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([mx, my]);
    }
  }
  return out;
}

export interface LayoutSpec {
  cols?: number;
  rows?: number;
  /** Default concrete pattern (default: every odd/odd tile). */
  pillar?: (x: number, y: number) => boolean;
  /** Extra concrete (already mirrored or not: pass through `mirror4` yourself). */
  addHard?: readonly XY[];
  /** Pillars removed. */
  removeHard?: readonly XY[];
  /** Road tiles: open floor that never gets a soft block. */
  roads?: readonly XY[];
}

/** Builds layout rows ('#' concrete, '=' road, '.' floor). */
export function makeLayout(spec: LayoutSpec = {}): string[] {
  const cols = spec.cols ?? COLS;
  const rows = spec.rows ?? ROWS;
  const pillar = spec.pillar ?? ((x: number, y: number) => x % 2 === 1 && y % 2 === 1);
  const grid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x): string => (pillar(x, y) ? '#' : '.')),
  );
  for (const [x, y] of spec.removeHard ?? []) grid[y]![x] = '.';
  for (const [x, y] of spec.addHard ?? []) grid[y]![x] = '#';
  for (const [x, y] of spec.roads ?? []) if (grid[y]![x] !== '#') grid[y]![x] = '=';
  return grid.map((r) => r.join(''));
}

/** Inclusive straight run of tiles from `a` to `b` (same row or column). */
export function line(a: XY, b: XY): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  if (dx !== 0 && dy !== 0) throw new Error('line() needs a row or a column');
  let x = a[0];
  let y = a[1];
  out.push([x, y]);
  while (x !== b[0] || y !== b[1]) {
    x += dx;
    y += dy;
    out.push([x, y]);
  }
  return out;
}

/** A route that drives in along `a -> b` and reverses back out to `a`. */
export function inAndOut(a: XY, b: XY): [number, number][] {
  const there = line(a, b);
  return [...there, ...there.slice(0, -1).reverse()];
}

/** Trap rows from marks in the top-left quadrant, mirrored. 'o' pothole, '~' oil. */
export function trapRows(marks: readonly (readonly [number, number, 'o' | '~'])[], cols = COLS, rows = ROWS): string[] {
  const grid = Array.from({ length: rows }, () => '.'.repeat(cols).split(''));
  for (const [x, y, c] of marks) for (const [mx, my] of mirror4([[x, y]], cols, rows)) grid[my]![mx] = c;
  return grid.map((r) => r.join(''));
}

/** The four corners, human bottom-left first, then the opposite corner (2-player games are diagonal). */
export const CORNER_SPAWNS: TilePos[] = [
  { x: 0, y: ROWS - 1 },
  { x: COLS - 1, y: 0 },
  { x: 0, y: 0 },
  { x: COLS - 1, y: ROWS - 1 },
];

/** The L of three tiles plus the two corner-turn tiles: a safe way out of the first blast. */
export const CORNER_CLEARANCE: TilePos[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: 2 },
  { x: 2, y: 1 },
  { x: 1, y: 2 },
];
