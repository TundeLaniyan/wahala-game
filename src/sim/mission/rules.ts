/**
 * The few mission rules the core systems ask about (lethality, respawn, rewards, movement). Kept free of imports from
 * the systems so they can import it without a cycle; every answer is "no change" when `state.mission` is absent.
 */
import type { GameState, Player } from '../types';

/** Is `p` the boss and still protected? (lethality.ts: a shielded boss cannot be eliminated.) */
export function isShieldedBoss(state: GameState, p: Pick<Player, 'id'>): boolean {
  const m = state.mission;
  return m !== undefined && p.id === m.bossId && m.boss.shielded;
}

/** May an eliminated player come back (respawn.ts)? Only the human, while lives are left; the crew never does. */
export function missionMayRespawn(state: GameState, id: number): boolean {
  const m = state.mission;
  return m !== undefined && id === 0 && m.outcome === null && m.livesUsed < m.livesMax;
}

/** Do elimination rewards (rewards.ts, streaks.ts) go to this fighter? Only the human earns power in a mission. */
export function missionRewardEligible(state: GameState, id: number): boolean {
  return state.mission === undefined || id === 0;
}

/** Extra ticks per step the human pays while carrying a ledger (queries.playerStepTicks). */
export function missionStepPenalty(state: GameState, p: Pick<Player, 'id'>): number {
  const m = state.mission;
  return m && m.carry && m.carry.playerId === p.id ? m.tuning.carrySlowTicks : 0;
}
