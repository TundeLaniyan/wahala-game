/**
 * V2 City Rumble elimination economy: the credited eliminator is granted equipment IMMEDIATELY (nothing is
 * dropped for a camper to steal). Rewards follow `config.rewards.ladder` by the eliminator's credited
 * elimination count; past its end the entries from `repeatFrom` cycle, so a fighter keeps growing.
 * Survival keeps everything (snowballing is intended); respawn modes reset on death (respawn.ts).
 */
import type { GameState, PickupKind, SimEvent } from '../types';
import { applyPickup } from './pickups';

export function rewardsFor(state: GameState, kills: number): PickupKind[] {
  const { ladder, repeatFrom } = state.config.rewards;
  if (kills <= 0 || ladder.length === 0) return [];
  if (kills <= ladder.length) return ladder[kills - 1]!;
  const from = Math.min(Math.max(0, repeatFrom), ladder.length - 1);
  const cycle = ladder.length - from;
  return ladder[from + ((kills - 1 - ladder.length) % cycle)]!;
}

/** Grants the rewards of every credited elimination in this tick's events (eliminator must be alive). */
export function grantRewards(state: GameState, events: SimEvent[]): void {
  if (!state.config.rewards.enabled) return;
  for (const e of [...events]) {
    if (e.type !== 'playerEliminated' || e.creditId === null) continue;
    const killer = state.players[e.creditId];
    if (!killer || !killer.alive) continue;
    for (const kind of rewardsFor(state, killer.stats.kills)) {
      if (applyPickup(state, killer, kind, events))
        events.push({ type: 'rewardGranted', playerId: killer.id, kind, kills: killer.stats.kills });
    }
  }
}
