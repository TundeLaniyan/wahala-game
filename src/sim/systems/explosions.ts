/**
 * Explosion resolution.
 *
 * All generators flagged `triggered` this tick explode together. Chain reactions are resolved in
 * rounds ordered by generator id, each generator exploding exactly once. Flames are computed
 * against the tile map as it stood at the START of resolution: soft blocks hit this tick are only
 * removed afterwards, so two simultaneous blasts can never disagree about what blocks what.
 */
import { DIRS, DIR_VEC, tileAt, tileIndex } from '../grid';
import { Tile } from '../types';
import type { BlastEvent, Flame, GameState, Generator, SimEvent } from '../types';
import { revealPickupAt } from './pickups';
import { triggerableGeneratorsAt } from './queries';

export function resolveExplosions(state: GameState, events: SimEvent[]): void {
  const seeds = state.generators.filter((g) => g.triggered).sort((a, b) => a.id - b.id);
  if (seeds.length === 0) return;

  const exploded = new Set<number>();
  const softHit = new Map<number, number>(); // tile index -> event id that hit it first
  const explodedGens: Generator[] = [];

  for (const seed of seeds) {
    if (exploded.has(seed.id)) continue;
    const eventId = state.nextEventId++;
    const tiles = new Set<number>();
    let round: Generator[] = [seed];
    while (round.length > 0) {
      const next = new Map<number, Generator>();
      for (const gen of round.sort((a, b) => a.id - b.id)) {
        if (exploded.has(gen.id)) continue;
        exploded.add(gen.id);
        explodedGens.push(gen);
        events.push({
          type: 'generatorExploded',
          generatorId: gen.id,
          ownerId: gen.ownerId,
          x: gen.x,
          y: gen.y,
          eventId,
        });
        for (const flame of buildFlames(state, gen, eventId, softHit)) {
          state.flames.push(flame);
          tiles.add(tileIndex(state, flame.x, flame.y));
          for (const other of triggerableGeneratorsAt(state, flame.x, flame.y)) {
            if (!exploded.has(other.id)) next.set(other.id, other);
          }
        }
      }
      round = [...next.values()];
    }
    const blast: BlastEvent = {
      id: eventId,
      tiles: [...tiles],
      endTick: state.tick + state.config.generator.flameTicks,
    };
    state.blasts.push(blast);
  }

  for (const gen of explodedGens) {
    if (gen.carriedBy !== null) state.players[gen.carriedBy]!.carrying = null;
    state.generators.splice(state.generators.indexOf(gen), 1);
  }

  destroySoftBlocks(state, softHit, 'flame', events);
}

/** Plus-shaped flame set for one generator. Never diagonal; concrete stops it; the first soft block absorbs it. */
function buildFlames(
  state: GameState,
  gen: Generator,
  eventId: number,
  softHit: Map<number, number>,
): Flame[] {
  const startTick = state.tick;
  const endTick = state.tick + state.config.generator.flameTicks;
  const base = { genId: gen.id, ownerId: gen.ownerId, eventId, startTick, endTick };
  const flames: Flame[] = [{ ...base, x: gen.x, y: gen.y, dir: null, tip: false }];

  for (const dir of DIRS) {
    const v = DIR_VEC[dir];
    let last: Flame | null = null;
    let pierced = false;
    for (let i = 1; i <= gen.range; i++) {
      const x = gen.x + v.dx * i;
      const y = gen.y + v.dy * i;
      const kind = tileAt(state, x, y);
      if (kind === Tile.Hard) break;
      last = { ...base, x, y, dir, tip: false };
      flames.push(last);
      if (kind === Tile.Soft) {
        const idx = tileIndex(state, x, y);
        if (!softHit.has(idx)) softHit.set(idx, eventId);
        if (gen.pierce && !pierced) {
          pierced = true; // Hot Fuel burns through exactly one soft block per arm
          continue;
        }
        break;
      }
      // A neighbouring generator absorbs the arm; it explodes in the next chain round.
      if (triggerableGeneratorsAt(state, x, y).some((o) => o.id !== gen.id)) break;
    }
    if (last) last.tip = true;
  }
  return flames;
}

/** Removes soft blocks, revealing whatever pickup was hidden underneath. */
export function destroySoftBlocks(
  state: GameState,
  hits: Map<number, number>,
  by: 'flame' | 'vehicle' | 'crush',
  events: SimEvent[],
): void {
  for (const [idx, eventId] of [...hits.entries()].sort((a, b) => a[0] - b[0])) {
    if (state.tiles[idx] !== Tile.Soft) continue;
    state.tiles[idx] = Tile.Empty;
    const x = idx % state.width;
    const y = Math.floor(idx / state.width);
    events.push({ type: 'blockDestroyed', x, y, by });
    revealPickupAt(state, idx, by === 'flame' ? eventId : null, events);
  }
}
