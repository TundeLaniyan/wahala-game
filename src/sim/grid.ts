/** Pure grid helpers shared by every system. No game rules here, only geometry. */
import { Tile } from './types';
import type { Dir, TilePos } from './types';

/** The part of a state needed for geometry; read-only so an Observation qualifies too. */
export interface GridView {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly number[];
}

export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];
export const DIR_VEC: Readonly<Record<Dir, { dx: number; dy: number }>> = {
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
};

export const OPPOSITE: Readonly<Record<Dir, Dir>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function perpendiculars(dir: Dir): [Dir, Dir] {
  return dir === 'up' || dir === 'down' ? ['left', 'right'] : ['up', 'down'];
}

export const tileIndex = (grid: { width: number }, x: number, y: number): number => y * grid.width + x;
export const tileX = (grid: { width: number }, index: number): number => index % grid.width;
export const tileY = (grid: { width: number }, index: number): number => Math.floor(index / grid.width);

export function inBounds(grid: GridView, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

/** Out-of-bounds tiles behave as indestructible walls. */
export function tileAt(grid: GridView, x: number, y: number): number {
  return inBounds(grid, x, y) ? grid.tiles[y * grid.width + x]! : Tile.Hard;
}

export function stepPos(x: number, y: number, dir: Dir, distance = 1): TilePos {
  const v = DIR_VEC[dir];
  return { x: x + v.dx * distance, y: y + v.dy * distance };
}

export function dirBetween(from: TilePos, to: TilePos): Dir | null {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx === 0 && dy === -1) return 'up';
  if (dx === 1 && dy === 0) return 'right';
  if (dx === 0 && dy === 1) return 'down';
  if (dx === -1 && dy === 0) return 'left';
  return null;
}

export const manhattan = (a: TilePos, b: TilePos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
