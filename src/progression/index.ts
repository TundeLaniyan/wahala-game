/**
 * Progression: XP, rank, totals, streaks, season progress, leaderboards. PURE and OPTIONAL: nothing in src/sim,
 * src/ai or the normal local match path imports this layer (tests/platform-static.test.ts enforces it).
 */
export * from './types';
export {
  DIVISIONS_PER_TIER,
  MAX_LEVEL,
  MAX_RANK_POINTS,
  POINTS_PER_DIVISION,
  POINTS_PER_TIER,
  RANK_TIERS,
  SEASON_POINTS,
  XP_TABLE,
  levelForXp,
  rankDelta,
  rankInfo,
  xpForLevel,
} from './tables';
export {
  HISTORY_LIMIT,
  applyMatchResult,
  completeChallenge,
  createProfile,
  linkCampaignRewards,
  progressView,
  xpBreakdown,
} from './reducers';
export { matchResultFrom } from './matchResult';
export type { MatchResultMeta } from './matchResult';
export { rankBoard, seedLeaderboard } from './leaderboard';
export type { BoardRow, BoardScore } from './leaderboard';
export { clearProgression, loadProgression, repairProfile, saveProgression } from './persist';
