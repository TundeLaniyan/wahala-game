/**
 * Floor-trap layouts for the 15 x 11 arenas. Every layout is 4-fold mirror symmetric so each spawn
 * faces the same traps. 'o' = pothole (a short stumble), '~' = oil (a predictable slide).
 */
export type TrapMark = readonly [x: number, y: number, kind: 'o' | '~'];

export const ARENA_COLS = 15;
export const ARENA_ROWS = 11;

/** Builds layout rows from marks in the top-left quadrant, mirrored into the other three. */
export function mirroredTraps(marks: readonly TrapMark[], cols = ARENA_COLS, rows = ARENA_ROWS): string[] {
  const grid = Array.from({ length: rows }, () => '.'.repeat(cols).split(''));
  for (const [x, y, c] of marks) {
    grid[y]![x] = c;
    grid[y]![cols - 1 - x] = c;
    grid[rows - 1 - y]![x] = c;
    grid[rows - 1 - y]![cols - 1 - x] = c;
  }
  return grid.map((r) => r.join(''));
}
