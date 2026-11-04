/**
 * Season and challenge data models (docs/ADS_AND_SEASONS.md). Pure data: no network, no clock reads (callers pass
 * `now`). All names, themes and dates are FICTIONAL placeholders, not a real event calendar.
 */

/** Event theme of a season; seasonal cosmetics and the menu dressing key off it. Data only in this branch. */
export type SeasonTheme = 'default' | 'christmas' | 'eid' | 'independence' | 'harmattan' | 'carnival';

export interface SeasonTier {
  /** 1-based tier number. */
  tier: number;
  /** Cumulative season points needed to reach it. */
  pointsRequired: number;
  /** Catalogue id of the reward (src/cosmetics), or null for a points-only tier. */
  rewardId: string | null;
}

export interface SeasonDef {
  id: string;
  name: string;
  theme: SeasonTheme;
  /** UTC milliseconds, inclusive start / exclusive end. A season lasts six to eight weeks. */
  startsAt: number;
  endsAt: number;
  tiers: SeasonTier[];
  /** Id of the season's leaderboard (online ranking service). */
  leaderboardId: string;
  blurb: string;
}

export type ChallengeMetric = 'matches' | 'wins' | 'kills' | 'assists' | 'survivalSeconds' | 'streakRewards';

export interface ChallengeDef {
  id: string;
  name: string;
  description: string;
  kind: 'daily' | 'weekly';
  metric: ChallengeMetric;
  target: number;
  /** Season points granted on completion. */
  points: number;
}

/** One day's or week's pick of the pool. */
export interface ChallengeSet {
  /** `YYYY-MM-DD` (UTC) of the day, or the Monday of the week (UTC). */
  key: string;
  /** Milliseconds (UTC) at which this set rotates out. */
  endsAt: number;
  challenges: ChallengeDef[];
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
