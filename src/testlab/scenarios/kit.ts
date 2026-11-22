/**
 * Scenario SETUP helpers (docs/TEST_LAB.md): they only prepare a freshly created raid `GameState` (who stands where,
 * which seats take part). They never script an outcome: every enemy still wakes through the sim's own wave code (the
 * seat's `spot` is where it appears, its patrol route is derived from the board there) and decides with the real bots;
 * the player's controls are the real ones. Pure and deterministic (no RNG, no clock).
 */
import { DIRS, DIR_VEC, Tile, raidRoute, vitalsFor } from '../../sim';
import type { Dir, EnemyKind, GameState, RaidRoute, RaidSeat, TilePos } from '../../sim';

export const key = (p: TilePos): string => `${p.x},${p.y}`;

export function isOpen(state: GameState, x: number, y: number): boolean {
  return (
    x >= 0 && y >= 0 && x < state.width && y < state.height && state.tiles[y * state.width + x] === Tile.Empty
  );
}

export function seatOf(state: GameState, id: number): RaidSeat {
  const seat = state.raid?.seats.find((s) => s.playerId === id);
  if (!seat) throw new Error(`scenario: no raid seat ${id}`);
  return seat;
}

/**
 * Keeps only `keep` seats in play: every other enemy is marked as already woken and down, so no wave brings it in. The
 * waves of the kept seats start with the match (a scenario has no crate or door to wait for).
 */
export function keepEnemies(state: GameState, keep: readonly number[]): void {
  const r = state.raid!;
  for (const seat of r.seats) {
    if (keep.includes(seat.playerId)) continue;
    seat.active = true;
    state.players[seat.playerId]!.alive = false;
  }
  for (const w of r.waves) if (w.seatIds.some((id) => keep.includes(id))) w.trigger = { kind: 'start' };
}

/** Where a kept enemy appears (the sim wakes it there, with the route the board gives that tile). */
export function placeEnemy(state: GameState, id: number, spot: TilePos, kind?: EnemyKind): void {
  const seat = seatOf(state, id);
  seat.spot = { x: spot.x, y: spot.y };
  const p = state.players[id]!;
  p.x = p.stepFromX = spot.x;
  p.y = p.stepFromY = spot.y;
  if (kind && kind !== seat.kind) {
    seat.kind = kind;
    p.enemyKind = kind;
    p.vitals = vitalsFor({ enemyKind: kind }, state.config);
  }
}

/** Where the human stands when the countdown starts. */
export function placeHuman(state: GameState, at: TilePos, facing: Dir): void {
  const p = state.players[0]!;
  p.x = p.stepFromX = at.x;
  p.y = p.stepFromY = at.y;
  p.facing = facing;
}

/** The route the sim will give the enemy waking on `spot` as seat `id` (the same call `waves.ts` makes). */
export function routeFor(state: GameState, id: number, spot?: TilePos): RaidRoute {
  const tactics = state.config.campaignTactics?.classicRaid;
  if (!tactics) throw new Error('scenario: the raid has no tactics layer');
  const seat = seatOf(state, id);
  return raidRoute(state, seat.kind, id, spot ?? seat.spot, tactics);
}

export const behind = (facing: Dir, from: TilePos, tiles: number): TilePos => ({
  x: from.x - DIR_VEC[facing].dx * tiles,
  y: from.y - DIR_VEC[facing].dy * tiles,
});

/** Open floor tiles by walking distance from `from` (nearest first, then top-most, left-most): deterministic. */
export function floorByDistance(
  state: GameState,
  from: TilePos,
  maxSteps: number,
): { at: TilePos; d: number }[] {
  const out = [{ at: { x: from.x, y: from.y }, d: 0 }];
  const seen = new Set([key(from)]);
  for (let head = 0; head < out.length; head++) {
    const { at, d } = out[head]!;
    if (d >= maxSteps) continue;
    for (const dir of DIRS) {
      const next = { x: at.x + DIR_VEC[dir].dx, y: at.y + DIR_VEC[dir].dy };
      if (seen.has(key(next)) || !isOpen(state, next.x, next.y)) continue;
      seen.add(key(next));
      out.push({ at: next, d: d + 1 });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.at.y - b.at.y || a.at.x - b.at.x);
}

/** The `count` open tiles nearest to `from` that are at least `minSteps` away (not `from` itself). */
export function tilesAround(state: GameState, from: TilePos, count: number, minSteps: number): TilePos[] {
  return floorByDistance(state, from, 8)
    .filter((t) => t.d >= minSteps)
    .slice(0, count)
    .map((t) => t.at);
}
