/**
 * Progression data model (docs/PROGRESSION.md). Pure data: nothing here reads a clock, a network or the DOM, and
 * NOTHING in the simulation, the bots or the normal local match path imports it: the profile never changes how
 * the local game plays. It is recorded only when an online surface (mock or server) is active.
 */
import type { GameKind } from '../sim';

export const PROGRESSION_VERSION = 1;
export const PROGRESSION_KEY = 'wahala.progression.v1';

export type MatchOutcome = 'win' | 'loss' | 'draw';

/** Everything the reducers need to know about one finished match, from one player's point of view. */
export interface MatchResultInput {
  /** Idempotency key: the same id is never counted twice. */
  matchId: string;
  game: GameKind;
  arenaId: string;
  outcome: MatchOutcome;
  /** 1 = best. Team games: the player's team standing. */
  placement: number;
  competitors: number;
  kills: number;
  deaths: number;
  assists: number;
  durationSec: number;
  /** Kill-streak rewards held at the end (a lower bound: the sim keeps no per-match log of them). */
  streakRewards: number;
  /** Every opponent was a bot. */
  vsBots: boolean;
  /** Only a ranked online queue changes rank points. */
  rated: boolean;
  /** Campaign mission matches carry their outcome here. */
  mission: { missionId: string; result: 'won' | 'lost' | 'timeout'; stars: 0 | 1 | 2 | 3 } | null;
  /** Wall-clock end time (ms), supplied by the caller: the simulation has no clock. */
  endedAt: number;
}

export interface Totals {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  deaths: number;
  assists: number;
  timePlayedSec: number;
  streakRewards: number;
}

export interface SeasonProgress {
  seasonId: string | null;
  points: number;
  /** Highest tier reached. */
  tier: number;
  /** Challenge ids completed in this season. */
  challengesDone: string[];
}

export interface HistoryEntry {
  matchId: string;
  game: GameKind;
  arenaId: string;
  outcome: MatchOutcome;
  placement: number;
  kills: number;
  xp: number;
  rankDelta: number;
  endedAt: number;
}

export interface ProgressionProfile {
  version: typeof PROGRESSION_VERSION;
  xp: number;
  level: number;
  /** Rank points (`RANK_TIERS` turns them into a tier and division). */
  rankPoints: number;
  /** Highest rank points ever held (cosmetic unlocks use it, so a rank drop never takes an item away). */
  peakRankPoints: number;
  /** Event themes of the seasons the player has scored in. */
  eventThemes: string[];
  /** Highest season tier reached per season id (kept after the season ends). */
  seasonTiers: Record<string, number>;
  totals: Totals;
  winStreak: number;
  bestWinStreak: number;
  season: SeasonProgress;
  /** READ-ONLY mirror of the campaign save's reward ids (never written back to the campaign). */
  campaignRewards: string[];
  /** Cosmetic catalogue ids unlocked by the rules. */
  unlocked: string[];
  /** Most recent matches, newest first (capped). */
  history: HistoryEntry[];
}

export interface RankInfo {
  tierIndex: number;
  tier: string;
  /** 3 (lowest) .. 1 (highest); 0 for the top tier, which has no divisions. */
  division: number;
  /** Points into the current division / to the next one (null at the top). */
  progress: number;
  toNext: number | null;
  label: string;
}

/** What one recorded match changed (shown on the results screen). */
export interface ProgressionUpdate {
  matchId: string;
  /** The match was already counted: nothing changed. */
  duplicate: boolean;
  xpParts: Record<string, number>;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  rankBefore: RankInfo;
  rankAfter: RankInfo;
  rankDelta: number;
  winStreak: number;
  seasonPointsGained: number;
  newUnlocks: string[];
}

/** The season slice the reducers need (structural; a `SeasonDef` satisfies it). */
export interface SeasonContext {
  id: string;
  tiers: readonly { tier: number; pointsRequired: number }[];
  theme?: string;
}
