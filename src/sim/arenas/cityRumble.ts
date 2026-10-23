import { ticks } from '../config';
import type { TilePos } from '../types';
import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, line, mirror4, trapRows } from './build';

/**
 * WAHALA! City Rumble: one human against up to 31 bots on a 41 x 31 Lagos district grid.
 *
 * - Three-tile-wide avenues (rows 9-11 and 19-21, columns 9-11, 19-21 and 29-31) carry no pillars and
 *   no crates: they cut the city into twelve blocks and meet in open junction squares where fights
 *   happen. Inside each block the classic odd/odd pillar grid plus a solid building in the middle.
 * - 32 spawns spread by farthest-point order, so 8, 16 or 24 competitors are spread out too.
 * - The city closes in (Wahala Crush is always on here): from 2:00 left the outer streets fill with
 *   concrete ring by ring; a central 11 x 9 square never closes and is reached by 0:30, where the
 *   mandatory endgame trap waves land at 0:30 and 0:15. Three-minute match: headless batches of 8-32
 *   bots (`npm run simulate -- --arena cityRumble --players N`) end on their own after about a
 *   minute, so the closing starts at 1:00 of play and squeezes the long-tail matches into the core;
 *   a five-minute clock never reached the closing city.
 * - Buses cross the avenues (telegraphed) until the closing starts.
 */
export const RUMBLE_COLS = 41;
export const RUMBLE_ROWS = 31;
const W = RUMBLE_COLS;
const H = RUMBLE_ROWS;

const AVENUE_ROWS = [10, 20];
const AVENUE_COLS = [10, 20, 30];
const onAvenue = (x: number, y: number): boolean =>
  AVENUE_ROWS.some((r) => Math.abs(y - r) <= 1) || AVENUE_COLS.some((c) => Math.abs(x - c) <= 1);

/** Block (district) bounds between the avenues. */
const blockRanges = (cuts: number[], size: number): [number, number][] => {
  const out: [number, number][] = [];
  let start = 0;
  for (const c of cuts) {
    out.push([start, c - 2]);
    start = c + 2;
  }
  out.push([start, size - 1]);
  return out;
};
const X_BLOCKS = blockRanges(AVENUE_COLS, W);
const Y_BLOCKS = blockRanges(AVENUE_ROWS, H);

/** A solid building (3 x 3 concrete) in the middle of every block except the central ones. */
const buildings = new Set<string>();
for (const [x0, x1] of X_BLOCKS) {
  for (const [y0, y1] of Y_BLOCKS) {
    const cx = Math.round((x0 + x1) / 2) | 1;
    const cy = Math.round((y0 + y1) / 2) | 1;
    if (Math.abs(cx - (W - 1) / 2) < 8 && Math.abs(cy - (H - 1) / 2) < 6) continue; // keep the core open
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) buildings.add(`${cx + dx},${cy + dy}`);
  }
}

const rows: string[] = [];
for (let y = 0; y < H; y++) {
  let row = '';
  for (let x = 0; x < W; x++) {
    if (onAvenue(x, y)) row += '=';
    else if (buildings.has(`${x},${y}`) || (x % 2 === 1 && y % 2 === 1)) row += '#';
    else row += '.';
  }
  rows.push(row);
}

/** Even/even tiles inside blocks, clear of buildings, avenues and the spawn L of a corner. */
function spawnCandidates(): TilePos[] {
  const out: TilePos[] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const sx = x < W / 2 ? 1 : -1;
      const sy = y < H / 2 ? 1 : -1;
      const ok = CORNER_CLEARANCE.every((o) => {
        const tx = x + o.x * sx;
        const ty = y + o.y * sy;
        return tx >= 0 && ty >= 0 && tx < W && ty < H && rows[ty]![tx] === '.';
      });
      if (ok) out.push({ x, y });
    }
  }
  return out;
}

/** Farthest-point order from a south-west start, so any prefix is evenly spread. */
function spreadSpawns(count: number): TilePos[] {
  const cand = spawnCandidates();
  const first = cand.reduce((best, c) =>
    Math.hypot(c.x - 4, c.y - (H - 5)) < Math.hypot(best.x - 4, best.y - (H - 5)) ? c : best,
  );
  const chosen: TilePos[] = [first];
  while (chosen.length < count) {
    let best: TilePos | null = null;
    let bestD = -1;
    for (const c of cand) {
      const d = Math.min(...chosen.map((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y)));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    chosen.push(best!);
  }
  return chosen;
}

const CORE_W = 11;
const CORE_H = 9;
const coreX0 = (W - CORE_W) / 2; // 15
const coreY0 = (H - CORE_H) / 2; // 11

export const CITY_RUMBLE: ArenaDef = {
  id: 'cityRumble',
  name: 'WAHALA! City Rumble',
  kind: 'rumble',
  layout: rows,
  spawns: spreadSpawns(32),
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: {
    match: { durationTicks: ticks(180) },
    crush: {
      startRemainingTicks: ticks(120),
      keepCore: { w: CORE_W, h: CORE_H },
      coreClosedRemainingTicks: ticks(30),
      warnTicks: ticks(1.5),
    },
    arena: { softDensity: 0.5 },
  },
  // the mandatory endgame waves land inside the core that never closes
  endgameTraps: [
    trapRows(
      [
        [coreX0 + 1, coreY0 + 2, '~'],
        [coreX0 + 4, coreY0 + 1, 'o'],
        [coreX0 + 1, coreY0 + 4, 'o'],
      ],
      W,
      H,
    ),
    trapRows(
      [
        [coreX0 + 3, coreY0 + 3, 'o'],
        [coreX0 + 5, coreY0 + 1, '~'],
        [coreX0 + 2, coreY0 + 1, '~'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      kind: 'sweep',
      style: 'traffic',
      routes: [
        line([0, 10], [W - 1, 10]),
        line([W - 1, 20], [0, 20]),
        line([10, 0], [10, H - 1]),
        line([20, H - 1], [20, 0]),
        line([30, 0], [30, H - 1]),
      ],
      stepTicks: 5,
      firstAtSec: 20,
      everySec: [8, 14],
      warnSec: 2.5,
    },
  ],
  info: {
    tagline: 'One of you against up to 31 bots across a whole Lagos district. Last one standing.',
    lighting: 'Hazy afternoon over the city',
    hazards: [
      'Buses cross the avenues (the lane flashes 2.5 s before) until the city starts closing.',
      'From 2:00 left the outer streets fill with concrete; the central square never closes.',
    ],
  },
};

/** Used by tests: the four mirror images of the core's top-left quadrant marks. */
export const RUMBLE_CORE = { x0: coreX0, y0: coreY0, w: CORE_W, h: CORE_H, mirror: mirror4 };
