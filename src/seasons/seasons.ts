/**
 * Season definitions and the pure schedule functions. PLACEHOLDER CONTENT: names, dates, tiers and challenge pools
 * are invented to exercise the data model; no season is live (the feature is off by default and the menu shows none).
 */
import { createRng, shuffle } from '../sim';
import { DAY_MS, WEEK_MS } from './types';
import type { ChallengeDef, ChallengeSet, SeasonDef, SeasonTier } from './types';

const utc = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);

/** Evenly spaced tiers: 10 tiers, `step` points apart, with a cosmetic reward on every other tier. */
function tiers(step: number, rewards: readonly string[]): SeasonTier[] {
  return Array.from({ length: 10 }, (_, i) => ({
    tier: i + 1,
    pointsRequired: step * (i + 1),
    rewardId: (i + 1) % 2 === 0 ? (rewards[(i + 1) / 2 - 1] ?? null) : null,
  }));
}

export const SEASONS: readonly SeasonDef[] = [
  {
    id: 'season-1',
    name: 'Christmas Rush',
    theme: 'christmas',
    startsAt: utc(2026, 12, 7),
    endsAt: utc(2027, 1, 31), // 8 weeks
    tiers: tiers(120, ['banner-christmas-lights', 'emote-jingle-dance', 'skin-ankara-festive', 'finisher-fireworks', 'banner-season-1-gold']),
    leaderboardId: 'season-1',
    blurb: 'Placeholder season: festive lights on the board and a faster climb.',
  },
  {
    id: 'season-2',
    name: 'Eid Lights',
    theme: 'eid',
    startsAt: utc(2027, 2, 1),
    endsAt: utc(2027, 3, 14), // 6 weeks
    tiers: tiers(120, ['banner-eid-crescent', 'emote-greeting-wave', 'skin-agbada-gold', 'vehicle-danfo-lanterns', 'banner-season-2-gold']),
    leaderboardId: 'season-2',
    blurb: 'Placeholder season: lantern-lit stages.',
  },
  {
    id: 'season-3',
    name: 'Harmattan Run',
    theme: 'harmattan',
    startsAt: utc(2027, 3, 15),
    endsAt: utc(2027, 5, 9), // 8 weeks
    tiers: tiers(130, ['banner-dust-haze', 'emote-scarf-wrap', 'skin-dust-runner', 'vehicle-keke-dust', 'banner-season-3-gold']),
    leaderboardId: 'season-3',
    blurb: 'Placeholder season: dusty orange haze.',
  },
];

/** The season running at `now` (UTC ms), or null between seasons. */
export function currentSeason(now: number, defs: readonly SeasonDef[] = SEASONS): SeasonDef | null {
  return defs.find((s) => now >= s.startsAt && now < s.endsAt) ?? null;
}

/** The next season to start after `now`, or null. */
export function nextSeason(now: number, defs: readonly SeasonDef[] = SEASONS): SeasonDef | null {
  return [...defs].filter((s) => s.startsAt > now).sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;
}

/** Whole weeks a season lasts (rounded to the nearest week). */
export const seasonWeeks = (s: SeasonDef): number => Math.round((s.endsAt - s.startsAt) / WEEK_MS);

/** Highest tier reached with `points` (0 = none yet). */
export function tierReached(season: SeasonDef, points: number): number {
  return season.tiers.reduce((best, t) => (points >= t.pointsRequired ? t.tier : best), 0);
}

// ---------------------------------------------------------------- challenges

export const CHALLENGE_POOL: readonly ChallengeDef[] = [
  { id: 'd-play-3', name: 'Warm up', description: 'Play 3 matches', kind: 'daily', metric: 'matches', target: 3, points: 15 },
  { id: 'd-win-1', name: 'Take one', description: 'Win a match', kind: 'daily', metric: 'wins', target: 1, points: 20 },
  { id: 'd-kill-5', name: 'Small wahala', description: 'Credit 5 eliminations', kind: 'daily', metric: 'kills', target: 5, points: 20 },
  { id: 'd-assist-3', name: 'Team spirit', description: 'Get 3 assists', kind: 'daily', metric: 'assists', target: 3, points: 15 },
  { id: 'd-survive-120', name: 'Hold on', description: 'Survive 120 seconds in total', kind: 'daily', metric: 'survivalSeconds', target: 120, points: 15 },
  { id: 'd-streak-1', name: 'Hot streak', description: 'Earn a kill-streak reward', kind: 'daily', metric: 'streakRewards', target: 1, points: 20 },
  { id: 'w-play-15', name: 'Regular', description: 'Play 15 matches', kind: 'weekly', metric: 'matches', target: 15, points: 60 },
  { id: 'w-win-7', name: 'Winner winner', description: 'Win 7 matches', kind: 'weekly', metric: 'wins', target: 7, points: 80 },
  { id: 'w-kill-40', name: 'Big wahala', description: 'Credit 40 eliminations', kind: 'weekly', metric: 'kills', target: 40, points: 80 },
  { id: 'w-assist-20', name: 'Good neighbour', description: 'Get 20 assists', kind: 'weekly', metric: 'assists', target: 20, points: 60 },
  { id: 'w-survive-900', name: 'Long day', description: 'Survive 900 seconds in total', kind: 'weekly', metric: 'survivalSeconds', target: 900, points: 60 },
];

const dayKey = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** Monday 00:00 UTC of the week containing `now` (1970-01-01 was a Thursday, so shift by 3 days). */
export const weekStart = (now: number): number => Math.floor((now - 3 * DAY_MS) / WEEK_MS) * WEEK_MS + 3 * DAY_MS;

/** Deterministic hash of a string/number pair into a 32-bit seed. */
function mix(seed: number, salt: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}

function pickSet(kind: 'daily' | 'weekly', key: string, endsAt: number, seed: number, count: number): ChallengeSet {
  const pool = CHALLENGE_POOL.filter((c) => c.kind === kind);
  const rng = createRng(mix(seed, `${kind}:${key}`));
  return { key, endsAt, challenges: shuffle(rng, pool).slice(0, count) };
}

/**
 * Today's daily challenges and this week's weekly ones. Pure and deterministic: the same `now` day / week and
 * `seed` always give the same sets (a server would use its own seed so every player sees the same challenges).
 */
export function challengesFor(now: number, seed: number): { daily: ChallengeSet; weekly: ChallengeSet } {
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const wk = weekStart(now);
  return {
    daily: pickSet('daily', dayKey(dayStart), dayStart + DAY_MS, seed, 3),
    weekly: pickSet('weekly', dayKey(wk), wk + WEEK_MS, seed, 3),
  };
}
