/**
 * READABLE PATROL ROUTES of Classic raid enemies (decision RA2, docs/CLASSIC_RAID_AI.md). A raid enemy gets its
 * territory when it wakes (`waves.ts`), derived here from the board round its spot, deterministically (no RNG: the same
 * board and spot always give the same route):
 *
 *   loop   (agbero, guard, lieutenant) the rectangle of open floor round one to four pillar blocks that passes through
 *          its spot, walked one way round (clockwise for an odd seat, anticlockwise for an even one), its four corners
 *          the waypoints: a straight run along each side and a short look at each corner. An agbero or guard prefers
 *          a loop of 12 tiles (round two pillars: a lap longer than the fuse, so a player can lay a generator round a
 *          corner while it is on the far side), the lieutenant a wider one (16-20 tiles). No loop fits
 *          (crates, belts, the board edge) -> a corridor run;
 *   run    the longest straight open run through its spot (at most `runTiles` tiles), walked end to end and back;
 *   beat   (heavy) the same with a short run: a slow back-and-forth in front of its spot;
 *   post   (thrower, boss) it holds its spot facing down its longest open lane and sweeps its view.
 *
 * A route tile is open floor at the moment it wakes, never a belt, never within `entranceClearTiles` of the entrance.
 * Crates blasted later only open more floor; a lane closed later is skipped by the territory's `patrolStuckTicks`.
 */
import type { ClassicRaidTactics } from '../config';
import type { EnemyKind, TerritoryDef } from '../campaign/types';
import { DIRS, DIR_VEC } from '../grid';
import { Tile } from '../types';
import type { Dir, GameState, TilePos } from '../types';

export interface RaidRoute {
  /** `loop` / `run` / `beat` walk the waypoints; `post` holds its spot. */
  style: 'loop' | 'run' | 'beat' | 'post';
  /** The waypoints in walking order (empty for a post). */
  waypoints: TilePos[];
  /** The direction it faces when it wakes (along its first leg, or down its lane). */
  facing: Dir;
}

const key = (x: number, y: number): string => `${x},${y}`;

/** The tiles a route may use: open floor now, not a belt, not by the entrance. */
function routeFloor(state: GameState, cfg: ClassicRaidTactics): (x: number, y: number) => boolean {
  const belts = new Set<string>();
  if (cfg.avoidBelts)
    for (const b of state.raid?.belts ?? []) for (const t of b.tiles) belts.add(key(t.x, t.y));
  const ent = state.raid?.entrance;
  return (x, y) => {
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
    if (state.tiles[y * state.width + x] !== Tile.Empty) return false;
    if (belts.has(key(x, y))) return false;
    if (ent && Math.abs(ent.x - x) + Math.abs(ent.y - y) <= cfg.entranceClearTiles) return false;
    return true;
  };
}

/** The perimeter tiles of the rectangle (x0, y0)-(x1, y1), clockwise from its top-left corner. */
function perimeter(x0: number, y0: number, x1: number, y1: number): TilePos[] {
  const out: TilePos[] = [];
  for (let x = x0; x < x1; x++) out.push({ x, y: y0 });
  for (let y = y0; y < y1; y++) out.push({ x: x1, y });
  for (let x = x1; x > x0; x--) out.push({ x, y: y1 });
  for (let y = y1; y > y0; y--) out.push({ x: x0, y });
  return out;
}

const dirOf = (a: TilePos, b: TilePos): Dir =>
  b.x > a.x ? 'right' : b.x < a.x ? 'left' : b.y > a.y ? 'down' : 'up';

/**
 * The loop through `spot`: every rectangle 3 x 3 to 7 x 7 (perimeter 8 to 24) whose whole perimeter is route floor,
 * with `spot` on it and at least one solid tile inside (it goes ROUND something), within `maxTiles`. The one nearest
 * `prefer` tiles wins, then the most solid inside, then the top-most, left-most (deterministic).
 */
function findLoop(
  state: GameState,
  spot: TilePos,
  prefer: number,
  maxTiles: number,
  ok: (x: number, y: number) => boolean,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let best: { x0: number; y0: number; x1: number; y1: number; score: number[] } | null = null;
  for (let w = 2; w <= 6; w++)
    for (let h = 2; h <= 6; h++) {
      const tiles = 2 * (w + h);
      if (tiles > maxTiles) continue;
      for (let x0 = spot.x - w; x0 <= spot.x; x0++)
        for (let y0 = spot.y - h; y0 <= spot.y; y0++) {
          const x1 = x0 + w;
          const y1 = y0 + h;
          const onEdge = spot.x === x0 || spot.x === x1 || spot.y === y0 || spot.y === y1;
          if (!onEdge) continue;
          const ring = perimeter(x0, y0, x1, y1);
          if (!ring.every((t) => ok(t.x, t.y))) continue;
          let solid = 0;
          for (let y = y0 + 1; y < y1; y++)
            for (let x = x0 + 1; x < x1; x++) if (state.tiles[y * state.width + x] !== Tile.Empty) solid++;
          if (solid === 0) continue;
          const score = [Math.abs(tiles - prefer), -solid, y0, x0, w, h];
          if (!best || less(score, best.score)) best = { x0, y0, x1, y1, score };
        }
    }
  return best;
}

function less(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

/** Open route tiles from `spot` straight along `dir` (not counting the spot), at most `max`. */
function reach(spot: TilePos, dir: Dir, max: number, ok: (x: number, y: number) => boolean): number {
  let n = 0;
  while (n < max && ok(spot.x + DIR_VEC[dir].dx * (n + 1), spot.y + DIR_VEC[dir].dy * (n + 1))) n++;
  return n;
}

/** The straight run of at most `tiles` tiles through `spot` along its more open axis (its two ends), or null. */
function findRun(
  spot: TilePos,
  tiles: number,
  ok: (x: number, y: number) => boolean,
): [TilePos, TilePos] | null {
  let best: [TilePos, TilePos] | null = null;
  let bestLen = 0;
  for (const [a, b] of [
    ['left', 'right'],
    ['up', 'down'],
  ] as const) {
    let na = reach(spot, a, tiles - 1, ok);
    let nb = reach(spot, b, tiles - 1, ok);
    // keep the spot inside the run, the run at most `tiles` long: trim the longer side first
    while (na + nb + 1 > tiles) {
      if (na >= nb) na--;
      else nb--;
    }
    if (na + nb < 1 || na + nb + 1 <= bestLen) continue;
    bestLen = na + nb + 1;
    best = [
      { x: spot.x + DIR_VEC[a].dx * na, y: spot.y + DIR_VEC[a].dy * na },
      { x: spot.x + DIR_VEC[b].dx * nb, y: spot.y + DIR_VEC[b].dy * nb },
    ];
  }
  return best;
}

/** The direction of the longest open lane from `spot` (ties in DIRS order). */
function laneDir(spot: TilePos, ok: (x: number, y: number) => boolean): Dir {
  let best: Dir = DIRS[0]!;
  let n = -1;
  for (const d of DIRS) {
    const r = reach(spot, d, 99, ok);
    if (r > n) {
      n = r;
      best = d;
    }
  }
  return best;
}

/** The tiles walked between consecutive waypoints (straight legs; a loop closes back to its first waypoint). */
export function routeTiles(waypoints: readonly TilePos[]): TilePos[] {
  const out: TilePos[] = [];
  const legs = waypoints.length >= 3 ? waypoints.length : waypoints.length - 1;
  for (let i = 0; i < legs; i++) {
    const a = waypoints[i]!;
    const b = waypoints[(i + 1) % waypoints.length]!;
    const n = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (let k = 0; k < n; k++)
      out.push({ x: a.x + Math.sign(b.x - a.x) * k, y: a.y + Math.sign(b.y - a.y) * k });
  }
  if (waypoints.length === 2) out.push({ ...waypoints[1]! });
  return out;
}

/** The route tiles of the other enemies already on the board (a new route keeps off them: no two patrols collide). */
function takenTiles(state: GameState, seatId: number): Set<string> {
  const out = new Set<string>();
  for (const [id, m] of Object.entries(state.territory?.minds ?? {})) {
    if (Number(id) === seatId || !state.players[Number(id)]?.alive) continue;
    for (const t of m.spec.patrol.length > 0 ? routeTiles(m.spec.patrol) : [m.spec.centre])
      out.add(key(t.x, t.y));
  }
  return out;
}

/** Tiles within `depth` steps of `spot` over `ok` floor, nearest first (the spot itself first). Deterministic order. */
function origins(
  spot: TilePos,
  depth: number,
  ok: (x: number, y: number) => boolean,
): { t: TilePos; d: number }[] {
  const out = [{ t: spot, d: 0 }];
  const seen = new Set([key(spot.x, spot.y)]);
  for (let head = 0; head < out.length; head++) {
    const { t, d } = out[head]!;
    if (d >= depth) continue;
    for (const dir of DIRS) {
      const x = t.x + DIR_VEC[dir].dx;
      const y = t.y + DIR_VEC[dir].dy;
      if (seen.has(key(x, y)) || !ok(x, y)) continue;
      seen.add(key(x, y));
      out.push({ t: { x, y }, d: d + 1 });
    }
  }
  return out;
}

/** The shortest run a corridor run or a beat may be (shorter = it holds a post instead). */
const MIN_RUN_TILES = 3;
/** A spot in an alcove (a pocket off a corridor) takes its route from a tile at most this many steps away. */
const ORIGIN_STEPS = 2;

/** The route of an enemy of `kind` in seat `seatId` waking on `spot` (pure, deterministic). */
export function raidRoute(
  state: GameState,
  kind: EnemyKind,
  seatId: number,
  spot: TilePos,
  cfg: ClassicRaidTactics,
): RaidRoute {
  const style = cfg.routes[kind];
  const floorOk = routeFloor(state, cfg);
  const taken = takenTiles(state, seatId);
  // the spot itself may sit beside the entrance or on a belt: the route is still measured from it; a tile another
  // route walks is never part of this one (the spot included), but an alcove's way out may cross it
  const isSpot = (x: number, y: number): boolean => x === spot.x && y === spot.y;
  const ok = (x: number, y: number): boolean => (isSpot(x, y) || floorOk(x, y)) && !taken.has(key(x, y));
  const starts = origins(spot, ORIGIN_STEPS, (x, y) => isSpot(x, y) || floorOk(x, y)).filter((o) =>
    ok(o.t.x, o.t.y),
  );
  if (style.style === 'loop') {
    for (const { t: o } of starts) {
      const r = findLoop(state, o, style.loopTiles, style.maxLoopTiles, ok);
      if (!r) continue;
      const corners: TilePos[] = [
        { x: r.x0, y: r.y0 },
        { x: r.x1, y: r.y0 },
        { x: r.x1, y: r.y1 },
        { x: r.x0, y: r.y1 },
      ];
      const ring = perimeter(r.x0, r.y0, r.x1, r.y1);
      const clockwise = seatId % 2 === 1;
      const order = clockwise ? corners : [corners[0]!, corners[3]!, corners[2]!, corners[1]!];
      const walk = clockwise ? ring : [ring[0]!, ...ring.slice(1).reverse()];
      // the first waypoint is the next corner ahead of where it joins the loop, along the walking direction
      const at = walk.findIndex((t) => t.x === o.x && t.y === o.y);
      let first = 0;
      for (let k = 1; k <= walk.length; k++) {
        const t = walk[(at + k) % walk.length]!;
        const i = order.findIndex((c) => c.x === t.x && c.y === t.y);
        if (i >= 0) {
          first = i;
          break;
        }
      }
      const waypoints = [...order.slice(first), ...order.slice(0, first)];
      const next = o.x === spot.x && o.y === spot.y ? walk[(at + 1) % walk.length]! : o;
      return { style: 'loop', waypoints, facing: dirOf(spot, next) };
    }
  }
  if (style.style === 'loop' || style.style === 'beat') {
    let best: [TilePos, TilePos] | null = null;
    let bestD = Infinity;
    let bestLen = 0;
    for (const { t: o, d } of starts) {
      if (d > bestD) break;
      const run = findRun(o, style.runTiles, ok);
      if (!run) continue;
      const len = Math.abs(run[0].x - run[1].x) + Math.abs(run[0].y - run[1].y) + 1;
      if (len < MIN_RUN_TILES || len <= bestLen) continue;
      best = run;
      bestD = d;
      bestLen = len;
    }
    if (best) {
      // it sets off toward the farther end
      const [a, b] = best;
      const da = Math.abs(a.x - spot.x) + Math.abs(a.y - spot.y);
      const db = Math.abs(b.x - spot.x) + Math.abs(b.y - spot.y);
      const waypoints = db > da ? [b, a] : [a, b];
      const head = waypoints[0]!.x === spot.x && waypoints[0]!.y === spot.y ? waypoints[1]! : waypoints[0]!;
      return { style: style.style === 'beat' ? 'beat' : 'run', waypoints, facing: dirOf(spot, head) };
    }
  }
  // a post faces down its longest open lane (floor it can see along, whatever walks there)
  const sightFloor = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < state.width &&
    y < state.height &&
    state.tiles[y * state.width + x] === Tile.Empty;
  return { style: 'post', waypoints: [], facing: laneDir(spot, sightFloor) };
}

/** The territory a raid enemy plays (the route as patrol waypoints; a post has none and watches its spot). */
export function raidTerritory(route: RaidRoute): TerritoryDef {
  return {
    patrol: route.waypoints.map((t) => [t.x, t.y] as const),
    radius: route.style === 'post' ? 1 : 2,
  };
}
