/** Read-only lookups over GameState shared by the systems. */
import { Tile } from '../types';
import type { GameState, Generator, Player, Pickup, Vehicle } from '../types';
import { tileAt } from '../grid';

export function getPlayer(state: GameState, id: number): Player | undefined {
  return state.players[id];
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive);
}

export function playersAt(state: GameState, x: number, y: number): Player[] {
  return state.players.filter((p) => p.alive && p.x === x && p.y === y);
}

/** True when a generator is resting on the ground (not carried and not airborne). */
export function isGrounded(g: Generator): boolean {
  return g.carriedBy === null && g.flight === null;
}

export function groundedGeneratorAt(state: GameState, x: number, y: number): Generator | undefined {
  return state.generators.find((g) => isGrounded(g) && g.x === x && g.y === y);
}

/** Generators that are physically on a tile for the purposes of being set off (grounded or carried there). */
export function triggerableGeneratorsAt(state: GameState, x: number, y: number): Generator[] {
  return state.generators.filter((g) => g.flight === null && g.x === x && g.y === y);
}

export function pickupAt(state: GameState, x: number, y: number): Pickup | undefined {
  return state.pickups.find((p) => p.x === x && p.y === y);
}

export function activeGeneratorCount(state: GameState, ownerId: number): number {
  return state.generators.filter((g) => g.ownerId === ownerId && g.mode !== 'disabled').length;
}

export function isFloor(state: GameState, x: number, y: number): boolean {
  return tileAt(state, x, y) === Tile.Empty;
}

export function flameAt(state: GameState, x: number, y: number): boolean {
  return state.flames.some((f) => f.x === x && f.y === y);
}

export function vehiclesOf(state: GameState, ownerId: number): Vehicle[] {
  return state.vehicles.filter((v) => v.ownerId === ownerId);
}

/** Ticks per tile for a player, honouring Roller Skates, Okada and the slow curse. */
export function playerStepTicks(state: GameState, p: Player): number {
  const m = state.config.movement;
  const levels = m.stepTicksBySpeedLevel;
  let ticks = levels[Math.min(p.speedLevel, levels.length - 1)]!;
  if (p.mounted) ticks -= m.okadaStepBonus;
  if (p.curse?.kind === 'slow' && state.tick < p.curse.until) ticks += m.slowCurseExtraTicks;
  return Math.max(m.minStepTicks, ticks);
}

export function isActing(state: GameState, p: Player): boolean {
  return p.alive && state.match.phase === 'playing' && state.tick >= p.dazedUntil;
}
