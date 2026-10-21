import type { ArenaDef } from './types';

/** Geometry an arena definition must satisfy so matches, bots, vehicles and Crush all work on it. */
export interface ArenaRules {
  /** Starting flame reach in tiles (spawn escape check). */
  baseRange: number;
  /** Shortest straight route a Danfo/taxi may take (vehicle lane check). */
  minRouteTiles: number;
  /** Fewest legal straight vehicle entries on an empty board. */
  minLanes: number;
}

/**
 * Returns every problem found with an arena definition (empty = valid). Checks: a rectangular board,
 * spawns on open, distinct tiles, mirror symmetry when soft blocks are mirrored, one connected open
 * area, a guaranteed escape from each spawn's own first generator, enough vehicle lanes, and floor
 * hazards only on open tiles.
 */
export function validateArena(arena: ArenaDef, rules: ArenaRules): string[] {
  const problems: string[] = [];
  const rows = arena.layout;
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (h < 5 || w < 5) return [`${arena.id}: board too small (${w}x${h})`];
  if (rows.some((r) => r.length !== w)) problems.push(`${arena.id}: rows have different lengths`);
  const hard = (x: number, y: number): boolean => x < 0 || y < 0 || x >= w || y >= h || rows[y]![x] === '#';

  const seen = new Set<string>();
  for (const s of arena.spawns) {
    if (hard(s.x, s.y)) problems.push(`${arena.id}: spawn ${s.x},${s.y} is blocked`);
    const key = `${s.x},${s.y}`;
    if (seen.has(key)) problems.push(`${arena.id}: duplicate spawn ${key}`);
    seen.add(key);
  }

  if (arena.mirrorSoftBlocks) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (hard(x, y) !== hard(w - 1 - x, y) || hard(x, y) !== hard(x, h - 1 - y)) {
          problems.push(`${arena.id}: layout is not mirror-symmetric at ${x},${y}`);
          y = h;
          break;
        }
  }

  // one connected open area
  let open = 0;
  let start: [number, number] | null = null;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!hard(x, y)) {
        open++;
        start ??= [x, y];
      }
  if (start) {
    const reached = new Set<number>([start[1] * w + start[0]]);
    const queue = [start];
    while (queue.length > 0) {
      const [x, y] = queue.pop()!;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (!hard(nx, ny) && !reached.has(ny * w + nx)) {
          reached.add(ny * w + nx);
          queue.push([nx, ny]);
        }
      }
    }
    if (reached.size !== open)
      problems.push(`${arena.id}: ${open - reached.size} open tiles are unreachable`);
  }

  // each spawn can walk, through its own cleared tiles, out of the cross of a generator dropped at the spawn
  for (const s of arena.spawns) {
    const sx = s.x < w / 2 ? 1 : -1;
    const sy = s.y < h / 2 ? 1 : -1;
    const clear = new Set(
      arena.spawnClearance
        .map((o) => [s.x + o.x * sx, s.y + o.y * sy] as const)
        .filter(([x, y]) => !hard(x, y))
        .map(([x, y]) => y * w + x),
    );
    const inBlast = (x: number, y: number): boolean =>
      (x === s.x && Math.abs(y - s.y) <= rules.baseRange) ||
      (y === s.y && Math.abs(x - s.x) <= rules.baseRange);
    let safe = false;
    const queue: [number, number][] = [[s.x, s.y]];
    const visited = new Set<number>([s.y * w + s.x]);
    while (queue.length > 0 && !safe) {
      const [x, y] = queue.shift()!;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        const i = ny * w + nx;
        if (hard(nx, ny) || !clear.has(i) || visited.has(i)) continue;
        if (!inBlast(nx, ny)) safe = true;
        visited.add(i);
        queue.push([nx, ny]);
      }
    }
    if (!safe) problems.push(`${arena.id}: spawn ${s.x},${s.y} has no cleared escape from its own blast`);
  }

  // straight vehicle lanes from the border (soft blocks do not stop vehicles)
  let lanes = 0;
  const leg = (x: number, y: number, dx: number, dy: number): number => {
    let n = 0;
    while (!hard(x, y)) {
      n++;
      x += dx;
      y += dy;
    }
    return n;
  };
  for (let x = 0; x < w; x++) {
    if (leg(x, 0, 0, 1) >= rules.minRouteTiles) lanes++;
    if (leg(x, h - 1, 0, -1) >= rules.minRouteTiles) lanes++;
  }
  for (let y = 0; y < h; y++) {
    if (leg(0, y, 1, 0) >= rules.minRouteTiles) lanes++;
    if (leg(w - 1, y, -1, 0) >= rules.minRouteTiles) lanes++;
  }
  if (lanes < rules.minLanes)
    problems.push(`${arena.id}: only ${lanes} vehicle lanes (need ${rules.minLanes})`);

  if (arena.hazardLayout) {
    if (arena.hazardLayout.length !== h || arena.hazardLayout.some((r) => r.length !== w))
      problems.push(`${arena.id}: hazard layout size differs from the board`);
    arena.hazardLayout.forEach((row, y) => {
      for (let x = 0; x < row.length; x++)
        if (row[x] !== '.' && hard(x, y)) problems.push(`${arena.id}: hazard on concrete at ${x},${y}`);
    });
  }
  return problems;
}
