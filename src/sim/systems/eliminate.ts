/**
 * The one elimination path: credit, stats, perks and the `playerEliminated` event. Lives in its own module so both
 * the one-hit lethal rules (lethality.ts) and the campaign health rules (campaignDamage.ts) can use it without a cycle.
 */
import { endLifePerksOnDeath } from './lifePerks';
import type { EliminationCause, GameState, Player, SimEvent } from '../types';
import { creditFor } from './attribution';
import { clearStreakRewards } from './streaks';

/**
 * Eliminates `p` (once: callers only pass living players). Credit and stats per attribution.ts; the
 * credited eliminator's life streak only grows while they are alive (rewards.ts pays living fighters).
 */
export function eliminate(
  state: GameState,
  p: Player,
  causes: EliminationCause | readonly EliminationCause[],
  events: SimEvent[],
): void {
  const credit = creditFor(state, p, causes);
  const cause = credit.cause;
  p.alive = false;
  p.eliminatedTick = state.tick;
  p.elimination = cause;
  p.eliminatedBy = credit.creditId;
  p.stats.deaths++;
  p.stats.streak = 0;
  p.recentHits = [];
  if (credit.creditId !== null) {
    const killer = state.players[credit.creditId]!;
    killer.stats.kills++;
    killer.stats.lastKillTick = state.tick;
    if (killer.alive) killer.stats.streak++;
  }
  for (const id of credit.assistIds) state.players[id]!.stats.assists++;
  p.entryUntil = null;
  p.stepRemaining = 0;
  p.attack = null;
  p.knockedUntil = 0;
  // the streak is over, the rewards are not (decision AS7): QUICK HANDS is paused with its unspent time stored, the
  // one-use rewards stay; the match score stays
  clearStreakRewards(state, p);
  endLifePerksOnDeath(state, p);
  if (p.carrying !== null) {
    const gen = state.generators.find((g) => g.id === p.carrying);
    if (gen) {
      gen.carriedBy = null;
      gen.stepFromX = gen.x;
      gen.stepFromY = gen.y;
    }
    p.carrying = null;
  }
  events.push({
    type: 'playerEliminated',
    playerId: p.id,
    cause,
    x: p.x,
    y: p.y,
    creditId: credit.creditId,
    assistIds: credit.assistIds,
  });
}
