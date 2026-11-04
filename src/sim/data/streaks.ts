import type { StreakRewardKind, StreakRewards } from '../types';

/** A fighter with no kill-streak rewards (a new life). */
export const freshStreakRewards = (): StreakRewards => ({
  earned: [],
  quickHandsUntil: 0,
  quickHandsBank: 0,
  quickHandsStart: 0,
  quickHandsExtra: 0,
  placeQueuedUntil: 0,
  vehicleGenerator: null,
  knockdown: false,
});

export interface StreakRewardDef {
  kind: StreakRewardKind;
  /** Player-facing name (HUD rail, action button). */
  name: string;
  /** Short label for a chip. */
  short: string;
}

export const STREAK_REWARD_DEFS: Readonly<Record<StreakRewardKind, StreakRewardDef>> = {
  quickHands: { kind: 'quickHands', name: 'QUICK HANDS', short: 'QUICK HANDS' },
  vehicleGenerator: { kind: 'vehicleGenerator', name: 'VEHICLE GENERATOR', short: 'VEHICLE GEN' },
  globalKnockdown: { kind: 'globalKnockdown', name: 'GLOBAL KNOCKDOWN', short: 'KNOCKDOWN' },
};

/** The unused one-use rewards a fighter holds, in the order B spends them (VEHICLE GENERATOR first). */
export function heldStreakRewards(r: Readonly<StreakRewards>): StreakRewardKind[] {
  const out: StreakRewardKind[] = [];
  if (r.quickHandsUntil > 0 || r.quickHandsBank > 0) out.push('quickHands'); // running, or stored through a death
  if (r.vehicleGenerator !== null) out.push('vehicleGenerator');
  if (r.knockdown) out.push('globalKnockdown');
  return out;
}
