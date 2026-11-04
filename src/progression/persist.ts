/**
 * Persistence over the KeyValueStore port. Never throws: missing / blocked storage keeps the profile in memory,
 * a corrupt record is repaired field by field (the broken text is kept under a `.corrupt` key once).
 */
import type { KeyValueStore } from '../platform';
import { createProfile, progressView } from './reducers';
import { levelForXp } from './tables';
import { PROGRESSION_KEY, PROGRESSION_VERSION } from './types';
import type { ProgressionProfile } from './types';
import { unlockedCosmetics } from '../cosmetics';

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];

/** Rebuilds a valid profile from anything (unknown shapes keep only what can be trusted). */
export function repairProfile(raw: unknown): ProgressionProfile {
  const base = createProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const t = (r.totals && typeof r.totals === 'object' ? r.totals : {}) as Record<string, unknown>;
  const s = (r.season && typeof r.season === 'object' ? r.season : {}) as Record<string, unknown>;
  const st =
    r.seasonTiers && typeof r.seasonTiers === 'object' ? (r.seasonTiers as Record<string, unknown>) : {};
  const xp = Math.floor(num(r.xp));
  const rankPoints = Math.floor(num(r.rankPoints));
  const p: ProgressionProfile = {
    ...base,
    version: PROGRESSION_VERSION,
    xp,
    level: levelForXp(xp),
    rankPoints,
    peakRankPoints: Math.max(rankPoints, Math.floor(num(r.peakRankPoints))),
    eventThemes: strs(r.eventThemes),
    seasonTiers: Object.fromEntries(
      Object.entries(st)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => [k, num(v)]),
    ),
    totals: {
      matches: num(t.matches),
      wins: num(t.wins),
      losses: num(t.losses),
      draws: num(t.draws),
      kills: num(t.kills),
      deaths: num(t.deaths),
      assists: num(t.assists),
      timePlayedSec: num(t.timePlayedSec),
      streakRewards: num(t.streakRewards),
    },
    winStreak: num(r.winStreak),
    bestWinStreak: num(r.bestWinStreak),
    season: {
      seasonId: typeof s.seasonId === 'string' ? s.seasonId : null,
      points: num(s.points),
      tier: num(s.tier),
      challengesDone: strs(s.challengesDone),
    },
    campaignRewards: strs(r.campaignRewards),
    history: Array.isArray(r.history)
      ? (r.history
          .filter(
            (h) => h && typeof h === 'object' && typeof (h as { matchId?: unknown }).matchId === 'string',
          )
          .slice(0, 20) as ProgressionProfile['history'])
      : [],
  };
  return {
    ...p,
    bestWinStreak: Math.max(p.bestWinStreak, p.winStreak),
    unlocked: unlockedCosmetics(progressView(p)),
  };
}

export function loadProgression(store: KeyValueStore | null, key = PROGRESSION_KEY): ProgressionProfile {
  if (!store) return createProfile();
  let text: string | null;
  try {
    text = store.getItem(key);
  } catch {
    return createProfile();
  }
  if (!text) return createProfile();
  try {
    return repairProfile(JSON.parse(text));
  } catch {
    try {
      store.setItem(`${key}.corrupt`, text);
    } catch {
      /* nothing to keep it in */
    }
    return createProfile();
  }
}

export function saveProgression(
  store: KeyValueStore | null,
  profile: ProgressionProfile,
  key = PROGRESSION_KEY,
): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearProgression(store: KeyValueStore | null, key = PROGRESSION_KEY): void {
  try {
    store?.removeItem(key);
  } catch {
    /* ignore */
  }
}
