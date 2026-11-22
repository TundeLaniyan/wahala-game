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

/**
 * Generators `p` may have down at once on top of his capacity rule (decision BB3): the EXPOSED boss of a fight with a
 * boss balance, on his way to or at his anchor, keeps at most `exposedGenerators` (the window is an opening). Infinity for everyone else, always outside
 * boss missions. The bot reads the same cap from its directive (`maxGenerators`).
 */
export function missionGeneratorCap(state: GameState, p: Pick<Player, 'id'>): number {
  const m = state.mission;
  if (!m || m.field || p.id !== m.bossId || m.boss.shielded || m.boss.defeated || !m.boss.anchor)
    return Infinity;
  return m.tuning.boss?.exposedGenerators ?? Infinity;
}

/**
 * Which hit decides whether an exposed boss absorbs a lethal event (decision BB4): a hit that is not his own when there
 * is one. His own generator never costs him a hit, but it must not swallow the player's flames that reach him in the
 * same tick (a chain his generator set off, or two blasts at once): before, only the first hit in the list was asked.
 */
export function bossHitOwner(owners: readonly (number | null)[], bossId: number): number | null {
  for (const o of owners) if (o !== bossId) return o;
  return owners[0] ?? null;
}

/**
 * Decision BB5: does a flame of a crew or boss generator burn the EXPOSED boss as the player's fire? Yes when the boss
 * fight's balance says so and the blast it belongs to was set off by the player's generator (the chain seed): the
 * player's blast set their generator off beside him. Returns the player's id (0) then, else null (no change).
 */
export function missionChainOwner(
  state: GameState,
  flame: { ownerId: number; eventId: number },
  victim: Pick<Player, 'id'>,
): number | null {
  const m = state.mission;
  if (!m || m.field || victim.id !== m.bossId || m.boss.shielded || m.boss.defeated) return null;
  if (!m.tuning.boss?.chainCarriesFire || flame.ownerId === 0) return null;
  const blast = state.blasts.find((b) => b.id === flame.eventId);
  return blast && blast.seedOwnerId === 0 ? 0 : null;
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
