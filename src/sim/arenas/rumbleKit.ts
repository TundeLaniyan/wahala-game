/**
 * Authoring helpers for the City Rumble V2 stages (large boards, up to 32 competitors).
 *
 * Every V2 stage is authored as its top-left quadrant and mirrored four ways, so each side of the board
 * faces exactly the same streets (fair for any spawn and for teams split east / west). Spawns are chosen
 * in mirrored pairs by farthest-point order: any prefix of the list is evenly spread, slot 2k sits on the
 * west half and slot 2k + 1 is its exact 180-degree mirror on the east half (so `id % 2` teams, and a
 * west-versus-east split, are balanced tile for tile).
 */
import { ticks } from '../config';
import type { DeepPartial, GameConfig } from '../config';
import type { TilePos } from '../types';
import { CORNER_CLEARANCE } from './build';

/**
 * Full layout rows from a quadrant: `quadrant` holds rows 0..ceil(H/2)-1, each ceil(W/2) wide (the last
 * column / row is the board's centre line). Throws on a malformed quadrant (authoring error).
 */
export function mirrorQuadrant(quadrant: readonly string[], cols: number, rows: number): string[] {
  const qw = Math.ceil(cols / 2);
  const qh = Math.ceil(rows / 2);
  if (quadrant.length !== qh) throw new Error(`quadrant needs ${qh} rows, has ${quadrant.length}`);
  quadrant.forEach((r, y) => {
    if (r.length !== qw) throw new Error(`quadrant row ${y} needs ${qw} tiles, has ${r.length}: "${r}"`);
    if (!/^[#=.]+$/.test(r)) throw new Error(`quadrant row ${y} has a tile other than # = .`);
  });
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    const q = quadrant[Math.min(y, rows - 1 - y)]!;
    let row = '';
    for (let x = 0; x < cols; x++) row += q[Math.min(x, cols - 1 - x)]!;
    out.push(row);
  }
  return out;
}

/** Same mirroring for a floor-trap quadrant ('o' pothole, '~' oil, anything else = none). */
export function mirrorTraps(quadrant: readonly string[], cols: number, rows: number): string[] {
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    const q = quadrant[Math.min(y, rows - 1 - y)] ?? '';
    let row = '';
    for (let x = 0; x < cols; x++) {
      const c = q[Math.min(x, cols - 1 - x)] ?? '.';
      row += c === 'o' || c === '~' ? c : '.';
    }
    out.push(row);
  }
  return out;
}

/** The four mirror images of a list of tiles (deduplicated, stable order). */
export function mirrorTiles(
  tiles: readonly (readonly [number, number])[],
  cols: number,
  rows: number,
): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const [x, y] of tiles)
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
  return out;
}

/** A zone (list of tiles) in each of its four mirror images, as separate zones. */
export function mirrorZones(
  zone: readonly (readonly [number, number])[],
  cols: number,
  rows: number,
): [number, number][][] {
  const flip = (fx: boolean, fy: boolean): [number, number][] =>
    zone.map(([x, y]) => [fx ? cols - 1 - x : x, fy ? rows - 1 - y : y]);
  return [flip(false, false), flip(true, false), flip(false, true), flip(true, true)];
}

/** Inclusive rectangle of tiles. */
export function rect(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]);
  return out;
}

/** The clearance a Rumble spawn needs (the corner L, pointed towards the board centre). */
export const RUMBLE_CLEARANCE: TilePos[] = CORNER_CLEARANCE;

/**
 * The clearance for one-tile market aisles: three tiles along the aisle and the turn into the cross
 * alley (the corner L does not fit between stall rows). Standing on the turn tile is out of the cross
 * of a generator dropped on the spawn tile.
 */
export const AISLE_CLEARANCE: TilePos[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 1 },
];

export function spawnCandidates(
  rows: readonly string[],
  clearance: readonly TilePos[] = RUMBLE_CLEARANCE,
  avoid: ReadonlySet<string> = new Set(),
): TilePos[] {
  const H = rows.length;
  const W = rows[0]!.length;
  const out: TilePos[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (rows[y]![x] !== '.') continue;
      // the centre lines are their own mirror: no pair partner there
      if (x === (W - 1) / 2 || y === (H - 1) / 2) continue;
      const sx = x < W / 2 ? 1 : -1;
      const sy = y < H / 2 ? 1 : -1;
      const ok = clearance.every((o) => {
        const tx = x + o.x * sx;
        const ty = y + o.y * sy;
        // a spawn's way out is open floor (never a traffic lane, never a stage hazard's strike zone)
        return tx >= 0 && ty >= 0 && tx < W && ty < H && rows[ty]![tx] === '.' && !avoid.has(`${tx},${ty}`);
      });
      if (ok) out.push({ x, y });
    }
  }
  return out;
}

/**
 * `count` spawns (even) in mirrored pairs, farthest-point order from the tile nearest `start`
 * (the human's slot 0). Slot 2k is on the west half, slot 2k + 1 its 180-degree mirror.
 */
export function pairedSpawns(
  rows: readonly string[],
  count: number,
  start: TilePos,
  clearance: readonly TilePos[] = RUMBLE_CLEARANCE,
  avoid: readonly (readonly [number, number])[] = [],
): TilePos[] {
  const H = rows.length;
  const W = rows[0]!.length;
  const cand = spawnCandidates(rows, clearance, new Set(avoid.map(([x, y]) => `${x},${y}`)));
  if (cand.length === 0) throw new Error('no spawn fits the layout');
  const mirror = (p: TilePos): TilePos => ({ x: W - 1 - p.x, y: H - 1 - p.y });
  const west = (p: TilePos): TilePos => (p.x < W / 2 ? p : mirror(p));
  const first = west(
    cand.reduce((best, c) =>
      Math.hypot(c.x - start.x, c.y - start.y) < Math.hypot(best.x - start.x, best.y - start.y) ? c : best,
    ),
  );
  const chosen: TilePos[] = [first, mirror(first)];
  const used = new Set(chosen.map((p) => `${p.x},${p.y}`));
  while (chosen.length < count) {
    let best: TilePos | null = null;
    let bestD = -1;
    for (const c of cand) {
      if (used.has(`${c.x},${c.y}`)) continue;
      // the chosen set is its own mirror image, so a pair is as far from it as either half; the two
      // halves of a pair near the centre are close to each other, which counts too
      const m = mirror(c);
      let d = Math.abs(m.x - c.x) + Math.abs(m.y - c.y);
      for (const s of chosen) d = Math.min(d, Math.abs(s.x - c.x) + Math.abs(s.y - c.y));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) throw new Error(`only ${chosen.length} spawns fit`);
    const a = west(best);
    const b = mirror(a);
    chosen.push(a, b);
    used.add(`${a.x},${a.y}`).add(`${b.x},${b.y}`);
  }
  return chosen.slice(0, count);
}

/**
 * The shared City Rumble V2 rules: a three-minute Survival clock, the city closing ring by ring from
 * 2:00 left around a core that never closes (reached by 0:30, where the mandatory trap waves land),
 * and up to two lethal stage events at once (the board is ~8x a standard arena; one at a time left
 * most of the city without a hazard for long stretches). Respawn rulesets override the clock and never
 * close the city (`sim/modes.ts`).
 */
export function rumbleStageConfig(o: {
  core: { w: number; h: number };
  softDensity: number;
  maxLethalEvents?: number;
}): DeepPartial<GameConfig> {
  return {
    match: { durationTicks: ticks(180) },
    crush: {
      startRemainingTicks: ticks(120),
      keepCore: o.core,
      coreClosedRemainingTicks: ticks(30),
      warnTicks: ticks(1.5),
    },
    arena: { softDensity: o.softDensity },
    stage: { maxLethalEvents: o.maxLethalEvents ?? 2 },
  };
}
