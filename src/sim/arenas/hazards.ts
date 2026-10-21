/** Builds a 4-fold mirror-symmetric floor-hazard layout ('o' pothole, '~' oil) for a cols x rows arena. */
export function mirroredHazards(cols: number, rows: number, marks: [number, number, 'o' | '~'][]): string[] {
  const grid = Array.from({ length: rows }, () => '.'.repeat(cols).split(''));
  for (const [x, y, c] of marks) {
    grid[y]![x] = c;
    grid[y]![cols - 1 - x] = c;
    grid[rows - 1 - y]![x] = c;
    grid[rows - 1 - y]![cols - 1 - x] = c;
  }
  return grid.map((r) => r.join(''));
}
