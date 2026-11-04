import { describe, expect, it } from 'vitest';
import {
  COSMETICS,
  EMPTY_LOADOUT,
  cosmeticById,
  ruleMet,
  sanitizeLoadout,
  unlockedCosmetics,
} from '../../src/cosmetics';
import type { CosmeticKind, ProgressView } from '../../src/cosmetics';
import {
  CHALLENGE_POOL,
  DAY_MS,
  SEASONS,
  WEEK_MS,
  challengesFor,
  currentSeason,
  nextSeason,
  seasonWeeks,
  tierReached,
  weekStart,
} from '../../src/seasons';

const view = (over: Partial<ProgressView> = {}): ProgressView => ({
  level: 1,
  rankTierIndex: 0,
  wins: 0,
  seasonTiers: {},
  eventThemes: [],
  campaignRewards: [],
  ...over,
});

describe('seasons', () => {
  it('every season lasts six to eight weeks, does not overlap another, and has ordered tiers', () => {
    for (const s of SEASONS) {
      expect(seasonWeeks(s)).toBeGreaterThanOrEqual(6);
      expect(seasonWeeks(s)).toBeLessThanOrEqual(8);
      expect(s.endsAt).toBeGreaterThan(s.startsAt);
      expect(s.leaderboardId).toBeTruthy();
      expect(s.tiers.map((t) => t.tier)).toEqual(s.tiers.map((_, i) => i + 1));
      for (let i = 1; i < s.tiers.length; i++)
        expect(s.tiers[i]!.pointsRequired).toBeGreaterThan(s.tiers[i - 1]!.pointsRequired);
    }
    const sorted = [...SEASONS].sort((a, b) => a.startsAt - b.startsAt);
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i]!.startsAt).toBeGreaterThanOrEqual(sorted[i - 1]!.endsAt);
    expect(new Set(SEASONS.map((s) => s.id)).size).toBe(SEASONS.length);
    expect(new Set(SEASONS.map((s) => s.leaderboardId)).size).toBe(SEASONS.length);
  });

  it('event themes are data: Christmas and Eid are present', () => {
    expect(SEASONS.map((s) => s.theme)).toEqual(expect.arrayContaining(['christmas', 'eid']));
  });

  it('currentSeason is pure: start inclusive, end exclusive, null between seasons', () => {
    const s = SEASONS[0]!;
    expect(currentSeason(s.startsAt)).toBe(s);
    expect(currentSeason(s.endsAt - 1)).toBe(s);
    expect(currentSeason(s.startsAt - 1)).toBeNull();
    expect(currentSeason(0)).toBeNull();
    expect(currentSeason(s.startsAt + 1, [])).toBeNull();
    expect(nextSeason(0)?.id).toBe(SEASONS[0]!.id);
    expect(nextSeason(s.startsAt)?.id).toBe(SEASONS[1]!.id);
    expect(nextSeason(SEASONS.at(-1)!.endsAt)).toBeNull();
  });

  it('tierReached counts the highest tier whose points are met', () => {
    const s = SEASONS[0]!;
    expect(tierReached(s, 0)).toBe(0);
    expect(tierReached(s, s.tiers[2]!.pointsRequired)).toBe(3);
    expect(tierReached(s, 1e9)).toBe(s.tiers.length);
  });

  it('every tier reward is a real catalogue entry of the right season', () => {
    for (const s of SEASONS) {
      for (const t of s.tiers) {
        if (!t.rewardId) continue;
        const c = cosmeticById(t.rewardId);
        expect(c, `${s.id} tier ${t.tier} ${t.rewardId}`).not.toBeNull();
      }
    }
  });
});

describe('challenges rotate deterministically', () => {
  const now = Date.UTC(2026, 11, 9, 15, 30); // a Wednesday

  it('same day + seed = same daily set; the next day (or another seed) usually differs', () => {
    const a = challengesFor(now, 5);
    expect(challengesFor(now + 3600_000, 5)).toEqual(a);
    expect(a.daily.challenges).toHaveLength(3);
    expect(a.weekly.challenges).toHaveLength(3);
    expect(a.daily.challenges.every((c) => c.kind === 'daily')).toBe(true);
    expect(a.weekly.challenges.every((c) => c.kind === 'weekly')).toBe(true);
    const days = new Set(
      Array.from({ length: 10 }, (_, i) =>
        challengesFor(now + i * DAY_MS, 5)
          .daily.challenges.map((c) => c.id)
          .join(),
      ),
    );
    expect(days.size).toBeGreaterThan(2);
    const seeds = new Set(
      Array.from({ length: 10 }, (_, i) =>
        challengesFor(now, i)
          .daily.challenges.map((c) => c.id)
          .join(),
      ),
    );
    expect(seeds.size).toBeGreaterThan(2);
  });

  it('the weekly set holds for the whole Monday-Sunday week and rotates on Monday', () => {
    const monday = weekStart(now);
    expect(new Date(monday).getUTCDay()).toBe(1);
    expect(monday).toBeLessThanOrEqual(now);
    const w = challengesFor(monday, 1).weekly;
    for (const d of [0, 2, 6]) expect(challengesFor(monday + d * DAY_MS + 5000, 1).weekly).toEqual(w);
    expect(w.endsAt).toBe(monday + WEEK_MS);
    expect(w.key).toBe(new Date(monday).toISOString().slice(0, 10));
    expect(challengesFor(monday + WEEK_MS, 1).weekly.key).not.toBe(w.key);
  });

  it('the daily set rotates at 00:00 UTC and picks distinct challenges from the pool', () => {
    const d = challengesFor(now, 1).daily;
    expect(d.endsAt % DAY_MS).toBe(0);
    expect(new Set(d.challenges.map((c) => c.id)).size).toBe(3);
    for (const c of CHALLENGE_POOL) {
      expect(c.target).toBeGreaterThan(0);
      expect(c.points).toBeGreaterThan(0);
    }
  });
});

describe('cosmetic catalogue (fictional)', () => {
  it('has unique ids, every kind, every rarity, and a default for each kind', () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    const kinds: CosmeticKind[] = ['fighterSkin', 'vehicleCosmetic', 'finisher', 'emote', 'banner'];
    for (const k of kinds) expect(COSMETICS.some((c) => c.kind === k)).toBe(true);
    for (const r of ['common', 'rare', 'epic', 'legendary'])
      expect(COSMETICS.some((c) => c.rarity === r)).toBe(true);
    for (const k of ['fighterSkin', 'vehicleCosmetic', 'emote', 'banner'] as CosmeticKind[]) {
      expect(COSMETICS.some((c) => c.kind === k && c.unlock.kind === 'default')).toBe(true);
    }
  });

  it('no real brand or person: names are plain invented words', () => {
    for (const c of COSMETICS)
      expect(c.name + c.description).not.toMatch(/nike|adidas|coca|fifa|dangote|davido|wizkid|burna/i);
  });

  it('unlock rules are evaluated purely', () => {
    expect(ruleMet({ kind: 'default' }, view())).toBe(true);
    expect(ruleMet({ kind: 'level', level: 5 }, view({ level: 4 }))).toBe(false);
    expect(ruleMet({ kind: 'level', level: 5 }, view({ level: 5 }))).toBe(true);
    expect(ruleMet({ kind: 'rank', tierIndex: 2 }, view({ rankTierIndex: 2 }))).toBe(true);
    expect(ruleMet({ kind: 'wins', count: 3 }, view({ wins: 2 }))).toBe(false);
    expect(ruleMet({ kind: 'seasonTier', seasonId: 's', tier: 2 }, view({ seasonTiers: { s: 2 } }))).toBe(
      true,
    );
    expect(ruleMet({ kind: 'seasonTier', seasonId: 's', tier: 2 }, view({ seasonTiers: { other: 9 } }))).toBe(
      false,
    );
    expect(ruleMet({ kind: 'event', theme: 'eid' }, view({ eventThemes: ['eid'] }))).toBe(true);
    expect(ruleMet({ kind: 'campaignReward', rewardId: 'r' }, view({ campaignRewards: ['r'] }))).toBe(true);
    expect(unlockedCosmetics(view())).toEqual(
      COSMETICS.filter((c) => c.unlock.kind === 'default').map((c) => c.id),
    );
  });

  it('a loadout can only equip owned items of the right kind', () => {
    const owned = ['skin-default', 'emote-wave'];
    expect(
      sanitizeLoadout(
        { fighterSkin: 'skin-default', emote: 'skin-default', banner: 'banner-gold-tier', finisher: 'x' },
        owned,
      ),
    ).toEqual({
      ...EMPTY_LOADOUT,
      fighterSkin: 'skin-default',
    });
    expect(sanitizeLoadout(null, owned)).toEqual(EMPTY_LOADOUT);
    expect(sanitizeLoadout({ emote: 'emote-wave' }, owned).emote).toBe('emote-wave');
  });
});
