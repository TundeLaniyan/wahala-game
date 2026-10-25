/**
 * Wahala Crush: the arena closes in with permanent concrete, one telegraphed tile at a time.
 * Everything under a landing tile is removed. A player caught there is eliminated, unless a protection
 * layer (Okada, then Armour) absorbs it, in which case they are shoved to the nearest free tile; with no
 * free tile left the landing kills through any protection (resolved in lethality.ts).
 */
import { DIRS, DIR_VEC, inBounds, tileAt } from '../grid';
import { Tile } from '../types';
import type { GameState, SimEvent } from '../types';
import { flameAt, pickupAt, groundedGeneratorAt } from './queries';
import type { LethalHit } from './lethality';

export function updateCrush(state: GameState, hits: LethalHit[], events: SimEvent[]): void {
  const crush = state.crush;
  if (!crush) return;
  const cfg = state.config.crush;

  while (state.match.playTicks >= crush.nextAtTick && crush.next < crush.order.length) {
    const index = crush.order[crush.next++]!;
    crush.nextAtTick = crush.warnAt[crush.next] ?? Infinity;
    if (state.tiles[index] === Tile.Hard) continue;
    const landTick = state.tick + cfg.warnTicks;
    crush.pending.push({ index, landTick });
    events.push({
      type: 'crushWarning',
      x: index % state.width,
      y: Math.floor(index / state.width),
      landTick,
    });
  }

  for (const entry of [...crush.pending]) {
    if (state.tick < entry.landTick) continue;
    crush.pending.splice(crush.pending.indexOf(entry), 1);
    land(state, entry.index, hits, events);
  }
}

function land(state: GameState, index: number, hits: LethalHit[], events: SimEvent[]): void {
  const x = index % state.width;
  const y = Math.floor(index / state.width);
  const wasSoft = state.tiles[index] === Tile.Soft;
  state.tiles[index] = Tile.Hard;
  delete state.hidden[index];
  events.push({ type: 'crushLanded', x, y });
  if (wasSoft) events.push({ type: 'blockDestroyed', x, y, by: 'crush' });

  for (const pickup of state.pickups.filter((u) => u.x === x && u.y === y)) {
    state.pickups.splice(state.pickups.indexOf(pickup), 1);
    events.push({ type: 'pickupBurned', pickupId: pickup.id, x, y });
  }
  for (const g of state.generators.filter((o) => o.x === x && o.y === y && o.carriedBy === null)) {
    state.generators.splice(state.generators.indexOf(g), 1);
    events.push({ type: 'generatorDudCleaned', generatorId: g.id, x, y });
  }

  const eventId = state.nextEventId++;
  for (const p of state.players) {
    if (!p.alive || p.x !== x || p.y !== y) continue;
    // A protection layer (Okada, then Armour) saves a caught player by shoving them to the nearest free
    // tile (lethality.ts); with no free tile left (the final closure) nothing can save them.
    const spot = nearestFree(state, x, y);
    hits.push({
      playerId: p.id,
      eventId,
      cause: { kind: 'crush', eventId },
      graceUntil: state.tick,
      ...(spot ? { relocate: spot } : { terminal: true }),
    });
  }
}

/** Nearest open tile (BFS over non-concrete), preferring one not burning or about to close. */
function nearestFree(state: GameState, fromX: number, fromY: number): { x: number; y: number } | null {
  return nearestOpen(state, fromX, fromY, true) ?? nearestOpen(state, fromX, fromY, false);
}

function nearestOpen(
  state: GameState,
  fromX: number,
  fromY: number,
  calm: boolean,
): { x: number; y: number } | null {
  const seen = new Set<number>([fromY * state.width + fromX]);
  const queue = [{ x: fromX, y: fromY }];
  const closing = new Set(state.crush?.pending.map((e) => e.index) ?? []);
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    if (
      tileAt(state, cur.x, cur.y) === Tile.Empty &&
      !groundedGeneratorAt(state, cur.x, cur.y) &&
      !pickupAt(state, cur.x, cur.y) &&
      (!calm || (!flameAt(state, cur.x, cur.y) && !closing.has(cur.y * state.width + cur.x)))
    ) {
      return cur;
    }
    for (const d of DIRS) {
      const nx = cur.x + DIR_VEC[d].dx;
      const ny = cur.y + DIR_VEC[d].dy;
      const key = ny * state.width + nx;
      if (!inBounds(state, nx, ny) || seen.has(key)) continue;
      seen.add(key);
      if (tileAt(state, nx, ny) !== Tile.Hard) queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
