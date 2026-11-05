/**
 * Marked cargo, sturdy crates and barrels (docs/CLASSIC_RAIDS.md). They are soft tiles of the arena (they block
 * walking, absorb a flame arm and are only ever damaged by flames, exactly like a crate) that carry hit points:
 *
 *   - `explosions.ts` asks `raidOnSoftHit` for every soft tile a blast reaches. A tile with cargo loses one hit point
 *     per SEPARATE blast (a chain counts once, like vehicle damage) and stays standing until it has none; a plain crate
 *     (no entity) breaks as ever.
 *   - A barrel that is destroyed explodes `barrelFuseTicks` later: a small plus of flames (`barrelReach`), stopped by
 *     walls, that damages players, other barrels and cargo through the same rules, so a row of barrels chains tile by
 *     tile.
 */
import { DIRS, DIR_VEC, tileAt, tileIndex } from '../grid';
import { Tile } from '../types';
import type { BlastEvent, Flame, GameState, SimEvent } from '../types';
import { triggerableGeneratorsAt } from '../systems/queries';
import { RAID_TUNING } from './tuning';
import type { RaidCargoState } from './types';

export function cargoAt(state: GameState, x: number, y: number): RaidCargoState | undefined {
  return state.raid?.cargo.find((c) => !c.destroyed && c.x === x && c.y === y);
}

/** Who gets the credit for a blast: whoever set the chain off. */
function instigatorOf(state: GameState, eventId: number): number | null {
  const blast = state.blasts.find((b) => b.id === eventId);
  return blast ? blast.instigatorId : null;
}

/**
 * `explosions.ts` hook (`destroySoftBlocks`): a flame reached the soft tile `idx`. Returns true when the tile belongs to
 * raid cargo (hit points, a barrel ...) and was handled here; false for an ordinary crate.
 */
export function raidOnSoftHit(
  state: GameState,
  idx: number,
  by: 'flame' | 'vehicle' | 'crush',
  eventId: number,
  events: SimEvent[],
): boolean {
  const x = idx % state.width;
  const y = Math.floor(idx / state.width);
  const cargo = cargoAt(state, x, y);
  if (!cargo) return false;
  hitCargo(
    state,
    cargo,
    by === 'flame' ? 1 : cargo.hp,
    by === 'flame' ? instigatorOf(state, eventId) : null,
    events,
  );
  return true;
}

/** Takes `damage` hit points off cargo; destroys it at zero. */
export function hitCargo(
  state: GameState,
  cargo: RaidCargoState,
  damage: number,
  byId: number | null,
  events: SimEvent[],
): void {
  if (cargo.destroyed) return;
  cargo.hp = Math.max(0, cargo.hp - damage);
  if (cargo.hp > 0) {
    events.push({
      type: 'cargoHit',
      id: cargo.id,
      x: cargo.x,
      y: cargo.y,
      hpAfter: cargo.hp,
      maxHp: cargo.maxHp,
      byId,
    });
    return;
  }
  cargo.destroyed = true;
  state.tiles[tileIndex(state, cargo.x, cargo.y)] = Tile.Empty;
  events.push({
    type: 'cargoDestroyed',
    id: cargo.id,
    kind: cargo.kind,
    x: cargo.x,
    y: cargo.y,
    marked: cargo.marked,
    byId,
  });
  if (cargo.kind === 'barrel') {
    state.raid!.barrelBlasts.push({
      x: cargo.x,
      y: cargo.y,
      atTick: state.tick + RAID_TUNING.barrelFuseTicks,
      ownerId: byId ?? 0,
    });
  }
}

/** Explodes every barrel whose fuse is up. Called once per tick before the explosions are resolved. */
export function updateBarrels(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  if (r.barrelBlasts.length === 0) return;
  const due = r.barrelBlasts.filter((b) => state.tick >= b.atTick);
  if (due.length === 0) return;
  r.barrelBlasts = r.barrelBlasts.filter((b) => state.tick < b.atTick);
  for (const b of due) detonateBarrel(state, b, events);
}

function detonateBarrel(
  state: GameState,
  b: { x: number; y: number; ownerId: number },
  events: SimEvent[],
): void {
  const eventId = state.nextEventId++;
  const endTick = state.tick + RAID_TUNING.barrelFlameTicks;
  const base = { genId: -1, ownerId: b.ownerId, eventId, startTick: state.tick, endTick };
  const tiles: number[] = [tileIndex(state, b.x, b.y)];
  const flames: Flame[] = [{ ...base, x: b.x, y: b.y, dir: null, tip: false }];
  const soft: number[] = [];
  for (const dir of DIRS) {
    const v = DIR_VEC[dir];
    let last: Flame | null = null;
    for (let i = 1; i <= RAID_TUNING.barrelReach; i++) {
      const x = b.x + v.dx * i;
      const y = b.y + v.dy * i;
      const kind = tileAt(state, x, y);
      if (kind === Tile.Hard) break;
      last = { ...base, x, y, dir, tip: false };
      flames.push(last);
      tiles.push(tileIndex(state, x, y));
      if (kind === Tile.Soft) {
        soft.push(tileIndex(state, x, y));
        break;
      }
    }
    if (last) last.tip = true;
  }
  state.flames.push(...flames);
  const blast: BlastEvent = { id: eventId, tiles, seedOwnerId: b.ownerId, instigatorId: b.ownerId, endTick };
  state.blasts.push(blast);
  // generators standing in the flames go off with it
  for (const f of flames) for (const g of triggerableGeneratorsAt(state, f.x, f.y)) g.triggered = true;
  for (const idx of soft) {
    if (state.tiles[idx] !== Tile.Soft) continue;
    const cargo = cargoAt(state, idx % state.width, Math.floor(idx / state.width));
    if (cargo) hitCargo(state, cargo, 1, b.ownerId, events);
    else {
      state.tiles[idx] = Tile.Empty;
      delete state.hidden[idx];
      events.push({
        type: 'blockDestroyed',
        x: idx % state.width,
        y: Math.floor(idx / state.width),
        by: 'flame',
      });
    }
  }
}
