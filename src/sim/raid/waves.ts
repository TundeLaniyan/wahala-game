/**
 * Enemy waves. Every enemy of the raid is a pre-allocated seat that is NOT alive until its wave: a wave starts when its
 * trigger is met (`raidWaveStarted`, the spawn spots are shown as a warning for `spawnWarnTicks`), then its enemies
 * appear on their spots with a moment of protection. A wave is cleared when all of its enemies are down. Side-room
 * groups work the same way (their trigger is their door) but do not count in the wave numbers.
 */
import { tileAt } from '../grid';
import { Tile } from '../types';
import type { GameState, SimEvent } from '../types';
import { RAID_TUNING } from './tuning';
import { addEnemyMind, callEnemyIn } from '../systems/territory';
import { raidRoute, raidTerritory } from './routes';
import type { RaidState, RaidWaveState } from './types';

export function mainWaves(r: RaidState): RaidWaveState[] {
  return r.waves.filter((w) => w.room === undefined);
}

function markedDestroyed(r: RaidState): number {
  return r.cargo.filter((c) => c.marked && c.destroyed).length;
}

function triggerMet(state: GameState, r: RaidState, w: RaidWaveState): boolean {
  const t = w.trigger;
  switch (t.kind) {
    case 'start':
      return true;
    case 'ticks':
      return state.match.playTicks >= t.after;
    case 'cargoDestroyed':
      return markedDestroyed(r) >= t.count;
    case 'waveCleared':
      return r.waves[t.wave]?.clearedTick != null;
    case 'doorOpened':
      return r.doors.find((d) => d.id === t.door)?.open === true;
  }
}

export function updateWaves(state: GameState, events: SimEvent[]): void {
  const r = state.raid!;
  const main = mainWaves(r);
  r.waves.forEach((w) => {
    if (w.startedTick === null && triggerMet(state, r, w)) {
      w.startedTick = state.tick;
      if (w.room === undefined)
        events.push({ type: 'raidWaveStarted', index: main.indexOf(w) + 1, total: main.length });
    }
    if (w.startedTick !== null && !w.activated && state.tick >= w.startedTick + RAID_TUNING.spawnWarnTicks) {
      activate(state, r, w, events);
    }
    if (w.activated && w.clearedTick === null && w.seatIds.every((id) => !state.players[id]!.alive)) {
      w.clearedTick = state.tick;
    }
  });
}

/** True while something stands, burns or is armed on the tile. */
function blocked(state: GameState, x: number, y: number): boolean {
  return (
    tileAt(state, x, y) !== Tile.Empty ||
    state.players.some((p) => p.alive && p.x === x && p.y === y) ||
    state.flames.some((f) => f.x === x && f.y === y) ||
    state.generators.some((g) => g.x === x && g.y === y)
  );
}

/** Decision RA6: waves the player's own action brings (a crate, a door, a cleared wave) come in hunting him. */
function calledIn(w: RaidWaveState): boolean {
  return w.trigger.kind !== 'start' && w.trigger.kind !== 'ticks';
}

function activate(state: GameState, r: RaidState, w: RaidWaveState, events: SimEvent[]): void {
  const waited = state.tick - (w.startedTick! + RAID_TUNING.spawnWarnTicks);
  for (const id of w.seatIds) {
    const seat = r.seats.find((s) => s.playerId === id)!;
    if (seat.active) continue;
    const p = state.players[id]!;
    let { x, y } = seat.spot;
    if (blocked(state, x, y)) {
      if (waited < RAID_TUNING.spawnRetryTicks) continue; // try again next tick
      const near = nearestFree(state, x, y);
      if (!near) continue;
      ({ x, y } = near);
    }
    p.x = p.stepFromX = x;
    p.y = p.stepFromY = y;
    p.stepRemaining = 0;
    p.alive = true;
    p.protectedUntil = state.tick + RAID_TUNING.enemyAppearProtectTicks;
    p.facing = x < state.width / 2 ? 'right' : 'left';
    seat.active = true;
    // decision RA2: it wakes into its territory, a readable route derived from the board round where it stands
    const tactics = state.config.campaignTactics?.classicRaid;
    if (tactics) {
      const route = raidRoute(state, seat.kind, id, { x, y }, tactics);
      p.facing = route.facing;
      addEnemyMind(state, id, { x, y }, raidTerritory(route));
      if (calledIn(w) && tactics.calledChaseTicks > 0)
        callEnemyIn(state, id, state.tick + tactics.calledChaseTicks, events);
    }
  }
  w.activated = w.seatIds.every((id) => r.seats.find((s) => s.playerId === id)!.active);
  if (w.room !== undefined && w.activated) {
    const room = r.rooms.find((q) => q.id === w.room);
    if (room) room.activated = true;
  }
}

function nearestFree(state: GameState, x: number, y: number): { x: number; y: number } | null {
  for (let radius = 1; radius <= 4; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
        if (!blocked(state, x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}
