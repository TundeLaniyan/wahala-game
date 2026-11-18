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

/**
 * A lethal event reached the boss while he is EXPOSED (decisions BX1-BX3): does it cost him one hit instead of his life?
 * True while he has more than one hit left - the hit is recorded for the runtime (one per window: the first lethal event
 * of the window counts, the rest of that tick is absorbed with it) and lethality skips the elimination. False for the
 * last hit (he is eliminated as before), outside boss missions, and for anyone else.
 */
export function missionBossAbsorbs(state: GameState, p: Pick<Player, 'id'>, byId: number | null): boolean {
  const m = state.mission;
  if (!m || m.field || p.id !== m.bossId || m.boss.shielded || m.boss.defeated) return false;
  if (m.boss.hp === undefined) return false;
  if (byId === m.bossId) return true; // his own generator never costs him a hit (it is absorbed)
  if (m.boss.hp <= 1) return false;
  m.boss.pendingHit ??= { byId };
  return true;
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
