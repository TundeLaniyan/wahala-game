/**
 * V2 standard-match sideline spectators (owned by workstream B). An eliminated player in a standard
 * match walks a lane just outside the board and can throw a generator in with button A, under a
 * cooldown, with a telegraphed landing tile. They never rejoin, cannot win and are never credited.
 * Disabled unless `config.spectator.enabled`.
 */
import type { GameState, Intents, SimEvent } from '../types';

/** Called once per playing tick after movement. */
export function updateSpectators(state: GameState, _intents: Intents, _events: SimEvent[]): void {
  if (!state.config.spectator.enabled) return;
}
