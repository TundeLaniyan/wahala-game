/**
 * XP, level and rank tables. PLACEHOLDER TUNING: every number here is a first guess that exercises the data model;
 * none of it has been balanced against real play (there are no real players). Change them here only.
 */
import type { MatchOutcome, MatchResultInput, RankInfo } from './types';

export const XP_TABLE = {
  participation: 20,
  win: 50,
  draw: 20,
  perKill: 8,
  perAssist: 4,
  /** Per full minute survived / played, capped. */
  perMinute: 2,
  maxMinutes: 10,
  perStreakReward: 10,
  /** Per win already in the streak (before this one), capped at `maxStreakSteps`. */
  perWinStreakStep: 5,
  maxStreakSteps: 5,
  perMissionStar: 15,
  /** Matches against bots only pay this fraction of the kill / assist XP. */
  botKillFraction: 0.5,
} as const;

export const MAX_LEVEL = 100;

/** Cumulative XP needed to BE at `level` (level 1 = 0 XP): 100, 250, 450 ... (each level costs 50 more). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) - 1;
  return 100 * n + 25 * n * (n - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Rank tiers, lowest first. The top tier has no divisions. */
export const RANK_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'] as const;
/** Rank points per division (three divisions per tier, III -> I) - PLACEHOLDER. */
export const POINTS_PER_DIVISION = 100;
export const DIVISIONS_PER_TIER = 3;
export const POINTS_PER_TIER = POINTS_PER_DIVISION * DIVISIONS_PER_TIER;
export const MAX_RANK_POINTS = POINTS_PER_TIER * (RANK_TIERS.length - 1);

export function rankInfo(points: number): RankInfo {
  const p = Math.max(0, Math.floor(points));
  if (p >= MAX_RANK_POINTS) {
    const top = RANK_TIERS.length - 1;
    return { tierIndex: top, tier: RANK_TIERS[top]!, division: 0, progress: p - MAX_RANK_POINTS, toNext: null, label: RANK_TIERS[top]! };
  }
  const tierIndex = Math.floor(p / POINTS_PER_TIER);
  const within = p - tierIndex * POINTS_PER_TIER;
  const step = Math.floor(within / POINTS_PER_DIVISION);
  const division = DIVISIONS_PER_TIER - step;
  const tier = RANK_TIERS[tierIndex]!;
  return {
    tierIndex,
    tier,
    division,
    progress: within - step * POINTS_PER_DIVISION,
    toNext: POINTS_PER_DIVISION - (within - step * POINTS_PER_DIVISION),
    label: `${tier} ${'I'.repeat(division)}`,
  };
}

/** Rank-point change of a RATED match: placement-based, win bonus, small draw value, clamped - PLACEHOLDER. */
export function rankDelta(i: Pick<MatchResultInput, 'outcome' | 'placement' | 'competitors' | 'rated'>): number {
  if (!i.rated) return 0;
  if (i.outcome === 'draw') return 0;
  const n = Math.max(2, i.competitors);
  const spread = (n + 1 - 2 * Math.min(Math.max(1, i.placement), n)) / (n - 1); // +1 first .. -1 last
  const raw = Math.round(spread * 20) + (i.outcome === 'win' ? 5 : 0);
  return Math.max(-15, Math.min(25, raw));
}

export const outcomeIsWin = (o: MatchOutcome): boolean => o === 'win';

/** Season points for one match (only counted while a season is live). */
export const SEASON_POINTS = { win: 20, draw: 10, loss: 8 } as const;
