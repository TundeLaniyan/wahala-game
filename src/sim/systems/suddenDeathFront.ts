/**
 * Sudden Death TEST match: a blast that travels instead of landing everywhere on one tick. It leaves the middle of the
 * area and crosses the floor one square ring (Chebyshev distance) per `ticksPerRing`; a contender is struck by the
 * ordinary sudden-death lethal hit on the first tick the front has reached the ring they stand in. A contender the
 * front has not reached yet is untouched, and once it has crossed the whole board every contender still standing
 * has been struck (the blast is still "full area"). The renderer draws these same rings from `SuddenDeathFront`.
 */
import { Tile } from '../types';
import type { GameState, SimEvent, SuddenDeathFront, SuddenDeathState } from '../types';
import type { LethalHit } from './lethality';

/** Square ring of a tile around the front's origin. */
export const frontRing = (f: Pick<SuddenDeathFront, 'x' | 'y'>, x: number, y: number): number =>
  Math.max(Math.abs(x - f.x), Math.abs(y - f.y));

/** The ring the front has reached at `tick` (0 = just the origin tile). */
export const frontRadius = (f: Pick<SuddenDeathFront, 'startTick' | 'ticksPerRing'>, tick: number): number =>
  Math.floor((tick - f.startTick) / f.ticksPerRing);

/**
 * The ring of the farthest tile the blast has to cross: the open floor (not concrete) and any fighter still standing.
 * On a stage that has closed in this is the open area, so the front ends when it has covered the whole playable space.
 */
function farthestRing(state: GameState, ox: number, oy: number): number {
  let far = 0;
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] === Tile.Hard) continue;
    far = Math.max(far, frontRing({ x: ox, y: oy }, i % state.width, Math.floor(i / state.width)));
  }
  for (const p of state.players) if (p.alive) far = Math.max(far, frontRing({ x: ox, y: oy }, p.x, p.y));
  return far;
}

export function startFront(
  state: GameState,
  sd: SuddenDeathState,
  ticksPerRing: number,
  hits: LethalHit[],
  events: SimEvent[],
): void {
  const x = Math.floor((sd.area.x0 + sd.area.x1) / 2);
  const y = Math.floor((sd.area.y0 + sd.area.y1) / 2);
  const front: SuddenDeathFront = {
    blast: sd.blastsFired + 1,
    eventId: state.nextEventId++,
    x,
    y,
    startTick: state.tick,
    ticksPerRing,
    maxRing: farthestRing(state, x, y),
    hit: [],
  };
  sd.front = front;
  sd.blastsFired++;
  sd.lastBlastTick = state.tick;
  sd.nextBlastTick = Infinity;
  sd.blastResolving = true;
  events.push({
    type: 'suddenDeathFront',
    blast: front.blast,
    x,
    y,
    startTick: front.startTick,
    ticksPerRing,
    maxRing: front.maxRing,
  });
  advanceFront(state, sd, front, hits);
}

export function advanceFront(
  state: GameState,
  sd: SuddenDeathState,
  front: SuddenDeathFront,
  hits: LethalHit[],
): void {
  const radius = frontRadius(front, state.tick);
  const done = radius >= front.maxRing;
  for (const c of sd.contenders) {
    const p = state.players[c.playerId]!;
    if (!p.alive || front.hit.includes(p.id)) continue;
    if (!done && frontRing(front, p.x, p.y) > radius) continue;
    front.hit.push(p.id);
    hits.push({
      playerId: p.id,
      eventId: front.eventId,
      cause: { kind: 'suddenDeath', eventId: front.eventId },
      graceUntil: state.tick,
      // the final blast of the round ignores every protection layer (decision AS6)
      ...(sd.finalPhase ? { terminal: true } : {}),
    });
  }
  if (done) sd.front = null;
}
