/**
 * Pure reducers over `ProgressionProfile`. No clock, no storage, no randomness: callers pass everything in.
 */
import { unlockedCosmetics } from '../cosmetics';
import type { ProgressView } from '../cosmetics';
import { MAX_RANK_POINTS, SEASON_POINTS, XP_TABLE, levelForXp, rankDelta, rankInfo } from './tables';
import { PROGRESSION_VERSION } from './types';
import type {
  HistoryEntry,
  MatchResultInput,
  ProgressionProfile,
  ProgressionUpdate,
  SeasonContext,
} from './types';

export const HISTORY_LIMIT = 20;

/** A brand-new profile: level 1, Bronze III, only the default cosmetics. */
export function createProfile(): ProgressionProfile {
  const base: ProgressionProfile = {
    version: PROGRESSION_VERSION,
    xp: 0,
    level: 1,
    rankPoints: 0,
    peakRankPoints: 0,
    eventThemes: [],
    seasonTiers: {},
    totals: {
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      timePlayedSec: 0,
      streakRewards: 0,
    },
    winStreak: 0,
    bestWinStreak: 0,
    season: { seasonId: null, points: 0, tier: 0, challengesDone: [] },
    campaignRewards: [],
    unlocked: [],
    history: [],
  };
  return { ...base, unlocked: unlockedCosmetics(progressView(base)) };
}

/** The slice cosmetics evaluate their unlock rules against. */
export function progressView(p: ProgressionProfile): ProgressView {
  return {
    level: p.level,
    rankTierIndex: rankInfo(p.peakRankPoints).tierIndex,
    wins: p.totals.wins,
    seasonTiers: p.seasonTiers,
    eventThemes: p.eventThemes as ProgressView['eventThemes'],
    campaignRewards: p.campaignRewards,
  };
}

/** XP of one match, itemised (so the results screen can show where it came from). */
export function xpBreakdown(input: MatchResultInput, winStreakBefore: number): Record<string, number> {
  const t = XP_TABLE;
  const parts: Record<string, number> = { participation: t.participation };
  if (input.outcome === 'win') parts.win = t.win;
  if (input.outcome === 'draw') parts.draw = t.draw;
  const fraction = input.vsBots ? t.botKillFraction : 1;
  parts.kills = Math.round(input.kills * t.perKill * fraction);
  parts.assists = Math.round(input.assists * t.perAssist * fraction);
  parts.time = Math.min(t.maxMinutes, Math.floor(input.durationSec / 60)) * t.perMinute;
  if (input.streakRewards > 0) parts.streakRewards = input.streakRewards * t.perStreakReward;
  if (input.outcome === 'win' && winStreakBefore > 0) {
    parts.winStreak = Math.min(t.maxStreakSteps, winStreakBefore) * t.perWinStreakStep;
  }
  if (input.mission && input.mission.result === 'won')
    parts.missionStars = input.mission.stars * t.perMissionStar;
  for (const k of Object.keys(parts)) if (!parts[k]) delete parts[k];
  return parts;
}

const nonNeg = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** A defensive copy of the input with every number clamped (the input may come from anywhere). */
function cleanInput(i: MatchResultInput): MatchResultInput {
  return {
    ...i,
    placement: Math.max(1, nonNeg(i.placement) || 1),
    competitors: Math.max(1, nonNeg(i.competitors) || 1),
    kills: nonNeg(i.kills),
    deaths: nonNeg(i.deaths),
    assists: nonNeg(i.assists),
    durationSec: nonNeg(i.durationSec),
    streakRewards: nonNeg(i.streakRewards),
  };
}

function seasonTierOf(season: SeasonContext, points: number): number {
  return season.tiers.reduce((best, t) => (points >= t.pointsRequired ? Math.max(best, t.tier) : best), 0);
}

/**
 * Applies one finished match. Idempotent on `matchId` (a repeat returns the same profile and a `duplicate`
 * update). `season` is the live season at the time (null = none: no season points).
 */
export function applyMatchResult(
  profile: ProgressionProfile,
  rawInput: MatchResultInput,
  season: SeasonContext | null = null,
): { profile: ProgressionProfile; update: ProgressionUpdate } {
  const rankBefore = rankInfo(profile.rankPoints);
  if (profile.history.some((h) => h.matchId === rawInput.matchId)) {
    return {
      profile,
      update: {
        matchId: rawInput.matchId,
        duplicate: true,
        xpParts: {},
        xpGained: 0,
        levelBefore: profile.level,
        levelAfter: profile.level,
        rankBefore,
        rankAfter: rankBefore,
        rankDelta: 0,
        winStreak: profile.winStreak,
        seasonPointsGained: 0,
        newUnlocks: [],
      },
    };
  }
  const input = cleanInput(rawInput);
  const xpParts = xpBreakdown(input, profile.winStreak);
  const xpGained = Object.values(xpParts).reduce((a, b) => a + b, 0);
  const delta = rankDelta(input);
  const rankPoints = Math.max(0, Math.min(MAX_RANK_POINTS + 400, profile.rankPoints + delta));
  const win = input.outcome === 'win';
  const winStreak = win ? profile.winStreak + 1 : input.outcome === 'loss' ? 0 : profile.winStreak;
  const seasonPointsGained = season
    ? input.outcome === 'win'
      ? SEASON_POINTS.win
      : input.outcome === 'draw'
        ? SEASON_POINTS.draw
        : SEASON_POINTS.loss
    : 0;
  const sameSeason = season !== null && profile.season.seasonId === season.id;
  const seasonPoints = season
    ? (sameSeason ? profile.season.points : 0) + seasonPointsGained
    : profile.season.points;
  const seasonTier = season ? seasonTierOf(season, seasonPoints) : profile.season.tier;
  const entry: HistoryEntry = {
    matchId: input.matchId,
    game: input.game,
    arenaId: input.arenaId,
    outcome: input.outcome,
    placement: input.placement,
    kills: input.kills,
    xp: xpGained,
    rankDelta: delta,
    endedAt: input.endedAt,
  };
  const next: ProgressionProfile = {
    ...profile,
    xp: profile.xp + xpGained,
    level: levelForXp(profile.xp + xpGained),
    rankPoints,
    peakRankPoints: Math.max(profile.peakRankPoints, rankPoints),
    totals: {
      matches: profile.totals.matches + 1,
      wins: profile.totals.wins + (win ? 1 : 0),
      losses: profile.totals.losses + (input.outcome === 'loss' ? 1 : 0),
      draws: profile.totals.draws + (input.outcome === 'draw' ? 1 : 0),
      kills: profile.totals.kills + input.kills,
      deaths: profile.totals.deaths + input.deaths,
      assists: profile.totals.assists + input.assists,
      timePlayedSec: profile.totals.timePlayedSec + input.durationSec,
      streakRewards: profile.totals.streakRewards + input.streakRewards,
    },
    winStreak,
    bestWinStreak: Math.max(profile.bestWinStreak, winStreak),
    season: season
      ? {
          seasonId: season.id,
          points: seasonPoints,
          tier: seasonTier,
          challengesDone: sameSeason ? profile.season.challengesDone : [],
        }
      : profile.season,
    seasonTiers: season
      ? { ...profile.seasonTiers, [season.id]: Math.max(profile.seasonTiers[season.id] ?? 0, seasonTier) }
      : profile.seasonTiers,
    eventThemes:
      season?.theme && !profile.eventThemes.includes(season.theme)
        ? [...profile.eventThemes, season.theme]
        : profile.eventThemes,
    history: [entry, ...profile.history].slice(0, HISTORY_LIMIT),
  };
  const unlocked = unlockedCosmetics(progressView(next));
  const newUnlocks = unlocked.filter((id) => !profile.unlocked.includes(id));
  const finished = { ...next, unlocked };
  return {
    profile: finished,
    update: {
      matchId: input.matchId,
      duplicate: false,
      xpParts,
      xpGained,
      levelBefore: profile.level,
      levelAfter: finished.level,
      rankBefore,
      rankAfter: rankInfo(finished.rankPoints),
      rankDelta: delta,
      winStreak,
      seasonPointsGained,
      newUnlocks,
    },
  };
}

/** Mirrors the campaign save's reward ids into the profile (read-only link; the campaign save is never written). */
export function linkCampaignRewards(
  profile: ProgressionProfile,
  rewardIds: readonly string[],
): ProgressionProfile {
  const ids = [...new Set(rewardIds)].sort();
  if (ids.join('|') === [...profile.campaignRewards].sort().join('|')) return profile;
  const next = { ...profile, campaignRewards: ids };
  return { ...next, unlocked: unlockedCosmetics(progressView(next)) };
}

/** Marks a season challenge complete (once) and grants its points. */
export function completeChallenge(
  profile: ProgressionProfile,
  challengeId: string,
  points: number,
  season: SeasonContext,
): ProgressionProfile {
  if (profile.season.seasonId !== season.id) {
    profile = { ...profile, season: { seasonId: season.id, points: 0, tier: 0, challengesDone: [] } };
  }
  if (profile.season.challengesDone.includes(challengeId)) return profile;
  const total = profile.season.points + Math.max(0, Math.floor(points));
  const tier = seasonTierOf(season, total);
  const next: ProgressionProfile = {
    ...profile,
    season: {
      ...profile.season,
      points: total,
      tier,
      challengesDone: [...profile.season.challengesDone, challengeId],
    },
    seasonTiers: { ...profile.seasonTiers, [season.id]: Math.max(profile.seasonTiers[season.id] ?? 0, tier) },
  };
  return { ...next, unlocked: unlockedCosmetics(progressView(next)) };
}
