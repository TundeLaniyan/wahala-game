/**
 * Explosion resolution.
 *
 * All generators flagged `triggered` this tick explode together. Chain reactions are resolved in
 * rounds ordered by generator id, each generator exploding exactly once. Flames are computed
 * against the tile map as it stood at the START of resolution: soft blocks hit this tick are only
 * removed afterwards, so two simultaneous blasts can never disagree about what blocks what.
 */
import { DIRS, DIR_VEC, tileAt, tileIndex } from '../grid';
import type { GridView } from '../grid';
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
          range: gen.range,
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
      seedOwnerId: seed.ownerId,
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
  const base = {
    genId: gen.id,
    ownerId: gen.ownerId,
    eventId,
    startTick,
    endTick,
    ...(gen.fromSpectator ? { fromSpectator: true } : {}),
  };
  const flames: Flame[] = [{ ...base, x: gen.x, y: gen.y, dir: null, tip: false }];

  if (state.config.generator.blastMode === 'fullLine') {
    // Power Yard: the whole row and column to the arena edge, straight through pillars, crates and
    // other generators (crates in the line break; generators in it chain).
    for (const dir of DIRS) {
      const v = DIR_VEC[dir];
      let last: Flame | null = null;
      for (let x = gen.x + v.dx, y = gen.y + v.dy; x >= 0 && y >= 0 && x < state.width && y < state.height; x += v.dx, y += v.dy) {
        const kind = tileAt(state, x, y);
        if (kind === Tile.Hard) continue;
        last = { ...base, x, y, dir, tip: false };
        flames.push(last);
        const idx = tileIndex(state, x, y);
        if (kind === Tile.Soft && !softHit.has(idx)) softHit.set(idx, eventId);
      }
      if (last) last.tip = true;
    }
    return flames;
  }

  if (gen.square > 0) {
    // V2 Square Blast: the plus arms below, plus every square tile the blast wave reaches
    for (const t of squareFootprint(state, gen.x, gen.y, gen.square, (x, y) =>
      triggerableGeneratorsAt(state, x, y).some((o) => o.id !== gen.id),
    )) {
      if (t.x === gen.x || t.y === gen.y) continue; // the centre row / column belong to the plus arms
      flames.push({ ...base, x: t.x, y: t.y, dir: null, tip: false });
      if (tileAt(state, t.x, t.y) === Tile.Soft) {
        const idx = tileIndex(state, t.x, t.y);
        if (!softHit.has(idx)) softHit.set(idx, eventId);
      }
    }
  }

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

/**
 * V2 Square Blast propagation rule (documented in docs/GAMEPLAY_V2.md): the blast spreads out from the
 * generator one tile at a time, ONLY ever moving away from it (each step increases |dx| or |dy| and never
 * decreases the other), up to `radius` in both axes (a (2r+1) x (2r+1) square). Concrete and the arena
 * edge are never entered; a crate is hit (it breaks) but the wave does not continue beyond it; a tile
 * holding another generator is hit (that generator chains) but does not pass the wave on. So a square
 * blast never reaches through concrete: a diagonal tile is only hit when one of the two tiles between it
 * and the centre lets the wave through. Pure; the AI uses the same function for its danger map.
 */
export function squareFootprint(
  grid: GridView,
  cx: number,
  cy: number,
  radius: number,
  blocksWave: (x: number, y: number) => boolean = () => false,
): { x: number; y: number }[] {
  const size = 2 * radius + 1;
  const reached = new Uint8Array(size * size);
  const passes = new Uint8Array(size * size);
  const at = (dx: number, dy: number): number => (dy + radius) * size + (dx + radius);
  reached[at(0, 0)] = 1;
  passes[at(0, 0)] = 1;
  const out: { x: number; y: number }[] = [];
  for (let ring = 1; ring <= 2 * radius; ring++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dyAbs = ring - Math.abs(dx);
      if (dyAbs < 0 || dyAbs > radius) continue;
      for (const dy of dyAbs === 0 ? [0] : [-dyAbs, dyAbs]) {
        const x = cx + dx;
        const y = cy + dy;
        if (tileAt(grid, x, y) === Tile.Hard) continue;
        // predecessors one step closer: towards the centre along x or along y
        const fromX = dx !== 0 && passes[at(dx - Math.sign(dx), dy)] === 1;
        const fromY = dy !== 0 && passes[at(dx, dy - Math.sign(dy))] === 1;
        if (!fromX && !fromY) continue;
        reached[at(dx, dy)] = 1;
        out.push({ x, y });
        if (tileAt(grid, x, y) === Tile.Empty && !blocksWave(x, y)) passes[at(dx, dy)] = 1;
      }
    }
  }
  return out;
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

/**
 * Read-only prediction of every tile a generator's blast (including chain reactions it would
 * set off) will cover if it exploded right now. Used by the renderer to show danger lanes.
 */
export function previewBlast(state: GameState, gen: Generator): Set<number> {
  const tiles = new Set<number>();
  const seen = new Set<number>([gen.id]);
  const queue: Generator[] = [gen];
  const scratch = new Map<number, number>();
  for (let head = 0; head < queue.length; head++) {
    const g = queue[head]!;
    for (const flame of buildFlames(state, g, 0, scratch)) {
      tiles.add(tileIndex(state, flame.x, flame.y));
      for (const other of triggerableGeneratorsAt(state, flame.x, flame.y)) {
        if (!seen.has(other.id)) {
          seen.add(other.id);
          queue.push(other);
        }
      }
    }
  }
  return tiles;
}
