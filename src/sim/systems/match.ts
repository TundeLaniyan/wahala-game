/** Match flow: countdown, two-minute timer, win / draw detection. */
import type { GameState, SimEvent } from '../types';
import { alivePlayers } from './queries';

function end(state: GameState, result: NonNullable<GameState['match']['result']>, events: SimEvent[]): void {
  state.match.phase = 'ended';
  state.match.result = result;
  state.match.endedTick = state.tick;
  events.push({ type: 'matchEnded', result });
}

/**
 * Called once per playing tick AFTER all eliminations of the tick have been applied, so every
 * elimination in the same tick is seen together: nobody left means a draw, never an arbitrary winner.
 */
export function evaluateMatchEnd(state: GameState, events: SimEvent[]): void {
  if (state.match.phase !== 'playing' || state.players.length < 2) return;
  const alive = alivePlayers(state);
  if (alive.length === 0) end(state, { kind: 'draw', reason: 'simultaneous' }, events);
  else if (alive.length === 1) end(state, { kind: 'win', winnerId: alive[0]!.id }, events);
  else if (state.match.playTicks >= state.config.match.durationTicks)
    end(state, { kind: 'draw', reason: 'timeout' }, events);
}

export function secondsRemaining(state: GameState): number {
  return Math.max(0, Math.ceil((state.config.match.durationTicks - state.match.playTicks) / 60));
}
