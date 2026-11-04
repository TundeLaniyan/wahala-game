import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  MAX_LEVEL,
  PROGRESSION_KEY,
  RANK_TIERS,
  applyMatchResult,
  clearProgression,
  completeChallenge,
  createProfile,
  levelForXp,
  linkCampaignRewards,
  loadProgression,
  matchResultFrom,
  rankBoard,
  rankDelta,
  rankInfo,
  repairProfile,
  saveProgression,
  seedLeaderboard,
  xpBreakdown,
  xpForLevel,
} from '../../src/progression';
import type { MatchResultInput } from '../../src/progression';
import { memoryStore } from '../../src/platform';
import { SEASONS } from '../../src/seasons';
import { createGame, tick } from '../../src/sim';
import { sandbox } from '../helpers';

const input = (over: Partial<MatchResultInput> = {}): MatchResultInput => ({
  matchId: 'm1',
  game: 'classic',
  arenaId: 'danfoBusPark',
  outcome: 'win',
  placement: 1,
  competitors: 4,
  kills: 2,
  deaths: 0,
  assists: 1,
  durationSec: 125,
  streakRewards: 0,
  vsBots: false,
  rated: true,
  mission: null,
  endedAt: 1000,
  ...over,
});

describe('XP and level tables (placeholder tuning)', () => {
  it('the level curve is strictly increasing and invertible', () => {
    expect(xpForLevel(1)).toBe(0);
    for (let l = 2; l <= MAX_LEVEL; l++) expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    for (const l of [1, 2, 7, 25, 99, MAX_LEVEL]) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      if (l > 1) expect(levelForXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
    expect(levelForXp(1e12)).toBe(MAX_LEVEL);
    expect(levelForXp(-5)).toBe(1);
  });

  it('rank info maps points to tier, division and progress', () => {
    expect(rankInfo(0)).toMatchObject({
      tier: 'Bronze',
      division: 3,
      progress: 0,
      toNext: 100,
      label: 'Bronze III',
    });
    expect(rankInfo(99).label).toBe('Bronze III');
    expect(rankInfo(100).label).toBe('Bronze II');
    expect(rankInfo(299).label).toBe('Bronze I');
    expect(rankInfo(300).label).toBe('Silver III');
    expect(rankInfo(1500)).toMatchObject({ tier: 'Legend', division: 0, toNext: null });
    expect(rankInfo(-40).label).toBe('Bronze III');
    expect(RANK_TIERS).toHaveLength(6);
  });

  it('the rank delta rewards winning and placement, never moves in unrated games, clamps', () => {
    expect(rankDelta(input())).toBe(25);
    expect(rankDelta(input({ outcome: 'loss', placement: 4 }))).toBe(-15);
    expect(rankDelta(input({ outcome: 'loss', placement: 2 }))).toBeGreaterThan(-15);
    expect(rankDelta(input({ outcome: 'draw' }))).toBe(0);
    expect(rankDelta(input({ rated: false }))).toBe(0);
    for (let n = 2; n <= 32; n++) {
      for (let p = 1; p <= n; p++) {
        const d = rankDelta(input({ competitors: n, placement: p, outcome: p === 1 ? 'win' : 'loss' }));
        expect(d).toBeGreaterThanOrEqual(-15);
        expect(d).toBeLessThanOrEqual(25);
      }
    }
  });

  it('XP is itemised; bots-only opponents pay half the kill XP; a win streak pays a capped bonus', () => {
    const a = xpBreakdown(input(), 0);
    expect(a).toMatchObject({ participation: 20, win: 50, kills: 16, assists: 4, time: 4 });
    expect(xpBreakdown(input({ vsBots: true }), 0).kills).toBe(8);
    expect(xpBreakdown(input(), 3).winStreak).toBe(15);
    expect(xpBreakdown(input(), 99).winStreak).toBe(25);
    expect(xpBreakdown(input({ outcome: 'loss' }), 3).winStreak).toBeUndefined();
    expect(xpBreakdown(input({ outcome: 'draw' }), 0).draw).toBe(20);
    expect(xpBreakdown(input({ mission: { missionId: 'x', result: 'won', stars: 3 } }), 0).missionStars).toBe(
      45,
    );
    expect(
      xpBreakdown(input({ mission: { missionId: 'x', result: 'lost', stars: 0 } }), 0).missionStars,
    ).toBeUndefined();
  });
});

describe('applyMatchResult', () => {
  it('records totals, xp, level, rank, streaks and history', () => {
    const p0 = createProfile();
    expect(p0).toMatchObject({ xp: 0, level: 1, rankPoints: 0, winStreak: 0 });
    const { profile: p1, update } = applyMatchResult(p0, input());
    expect(p1.totals).toMatchObject({
      matches: 1,
      wins: 1,
      losses: 0,
      kills: 2,
      assists: 1,
      timePlayedSec: 125,
    });
    expect(p1.xp).toBe(update.xpGained);
    expect(update.xpGained).toBe(Object.values(update.xpParts).reduce((a, b) => a + b, 0));
    expect(p1.rankPoints).toBe(25);
    expect(p1.winStreak).toBe(1);
    expect(p1.history[0]).toMatchObject({ matchId: 'm1', outcome: 'win', xp: update.xpGained });
    expect(update).toMatchObject({ duplicate: false, rankDelta: 25, winStreak: 1 });
    const { profile: p2 } = applyMatchResult(
      p1,
      input({ matchId: 'm2', outcome: 'loss', placement: 4, kills: 0 }),
    );
    expect(p2.winStreak).toBe(0);
    expect(p2.bestWinStreak).toBe(1);
    expect(p2.totals).toMatchObject({ matches: 2, wins: 1, losses: 1 });
    const { profile: p3 } = applyMatchResult(p2, input({ matchId: 'm3', outcome: 'draw' }));
    expect(p3.totals.draws).toBe(1);
    expect(p3.winStreak).toBe(0);
  });

  it('is pure (inputs untouched) and idempotent per match id', () => {
    const p0 = createProfile();
    const frozen = JSON.stringify(p0);
    const { profile: p1 } = applyMatchResult(p0, input());
    expect(JSON.stringify(p0)).toBe(frozen);
    const again = applyMatchResult(p1, input());
    expect(again.update).toMatchObject({ duplicate: true, xpGained: 0 });
    expect(again.profile).toBe(p1);
  });

  it('levels up and reports it; rank never drops below the floor; the peak rank is kept', () => {
    let p = createProfile();
    for (let i = 0; i < 12; i++) p = applyMatchResult(p, input({ matchId: `w${i}` })).profile;
    expect(p.level).toBeGreaterThan(2);
    const peak = p.peakRankPoints;
    expect(peak).toBe(p.rankPoints);
    let low = p;
    for (let i = 0; i < 40; i++)
      low = applyMatchResult(low, input({ matchId: `l${i}`, outcome: 'loss', placement: 4 })).profile;
    expect(low.rankPoints).toBe(0);
    expect(low.peakRankPoints).toBe(peak);
    expect(low.bestWinStreak).toBe(12);
  });

  it('clamps nonsense input instead of corrupting the profile', () => {
    const { profile } = applyMatchResult(
      createProfile(),
      input({ kills: -5, assists: NaN, durationSec: Infinity, placement: 0, competitors: -1 }),
    );
    expect(profile.totals.kills).toBe(0);
    expect(Number.isFinite(profile.xp)).toBe(true);
    expect(profile.history[0]!.placement).toBeGreaterThanOrEqual(1);
  });

  it('keeps a bounded history, newest first', () => {
    let p = createProfile();
    for (let i = 0; i < HISTORY_LIMIT + 8; i++) p = applyMatchResult(p, input({ matchId: `h${i}` })).profile;
    expect(p.history).toHaveLength(HISTORY_LIMIT);
    expect(p.history[0]!.matchId).toBe(`h${HISTORY_LIMIT + 7}`);
  });

  it('unrated matches change XP but never rank points', () => {
    const { profile } = applyMatchResult(createProfile(), input({ rated: false }));
    expect(profile.xp).toBeGreaterThan(0);
    expect(profile.rankPoints).toBe(0);
  });
});

describe('seasons, campaign link and cosmetic unlocks', () => {
  it('season points accumulate per season, reset when the season changes, and unlock tier rewards', () => {
    const s1 = SEASONS[0]!;
    let p = createProfile();
    for (let i = 0; i < 20; i++) p = applyMatchResult(p, input({ matchId: `s${i}` }), s1).profile;
    expect(p.season).toMatchObject({ seasonId: s1.id, points: 400 });
    expect(p.season.tier).toBeGreaterThanOrEqual(3);
    expect(p.seasonTiers[s1.id]).toBe(p.season.tier);
    expect(p.eventThemes).toEqual(['christmas']);
    expect(p.unlocked).toContain('banner-christmas-lights'); // tier 2
    const next = applyMatchResult(p, input({ matchId: 'n1' }), SEASONS[1]!).profile;
    expect(next.season).toMatchObject({ seasonId: SEASONS[1]!.id, points: 20 });
    expect(next.seasonTiers[s1.id]).toBe(p.season.tier); // earlier seasons keep their unlocks
    expect(next.unlocked).toContain('banner-christmas-lights');
    // no live season: no season points
    expect(applyMatchResult(createProfile(), input(), null).profile.season.seasonId).toBeNull();
  });

  it('challenges complete once and grant points', () => {
    const s = SEASONS[0]!;
    const p = completeChallenge(createProfile(), 'd-win-1', 20, s);
    expect(p.season).toMatchObject({ seasonId: s.id, points: 20, challengesDone: ['d-win-1'] });
    expect(completeChallenge(p, 'd-win-1', 20, s).season.points).toBe(20);
  });

  it('campaign rewards are a read-only mirror: they unlock catalogue items and never write anywhere', () => {
    const save = { rewards: ['reward-b', 'reward-a', 'reward-a'] };
    const frozen = JSON.stringify(save);
    const p = linkCampaignRewards(createProfile(), save.rewards);
    expect(p.campaignRewards).toEqual(['reward-a', 'reward-b']);
    expect(JSON.stringify(save)).toBe(frozen);
    expect(linkCampaignRewards(p, ['reward-b', 'reward-a'])).toBe(p);
  });

  it('level / wins / rank unlock cosmetics by rule', () => {
    let p = createProfile();
    expect(p.unlocked).toEqual(expect.arrayContaining(['skin-default', 'emote-wave', 'banner-default']));
    expect(p.unlocked).not.toContain('banner-level-10');
    p = { ...p, xp: 99999, level: levelForXp(99999) };
    const q = applyMatchResult(p, input()).profile;
    expect(q.unlocked).toContain('banner-level-10');
    expect(q.unlocked).toContain('finisher-spark');
  });
});

describe('matchResultFrom: derived from a finished simulation state', () => {
  function finished(winner: number | null) {
    const state = sandbox({ players: 3 });
    state.players[0]!.stats.kills = 2;
    state.players[0]!.stats.assists = 1;
    state.players[1]!.alive = false;
    state.players[1]!.eliminatedTick = 600;
    state.players[2]!.alive = false;
    state.players[2]!.eliminatedTick = 900;
    state.match.phase = 'ended';
    state.match.playTicks = 60 * 95;
    state.match.result =
      winner === null ? { kind: 'draw', reason: 'simultaneous' } : { kind: 'win', winnerId: winner };
    return state;
  }

  it('a win, a loss and a draw; placement by survival; kills and time from the sim', () => {
    const w = matchResultFrom(finished(0), 0);
    expect(w).toMatchObject({
      outcome: 'win',
      placement: 1,
      kills: 2,
      assists: 1,
      durationSec: 95,
      competitors: 3,
      game: 'classic',
    });
    const l = matchResultFrom(finished(0), 2);
    expect(l).toMatchObject({ outcome: 'loss', placement: 2 }); // lasted longer than player 1
    expect(matchResultFrom(finished(0), 1).placement).toBe(3);
    expect(matchResultFrom(finished(null), 0).outcome).toBe('draw');
  });

  it('vsBots, a deterministic default id, and caller-supplied id / time / rating flag', () => {
    const s = finished(0);
    expect(matchResultFrom(s, 0).vsBots).toBe(false);
    s.players.forEach((p, i) => (p.isBot = i > 0));
    expect(matchResultFrom(s, 0).vsBots).toBe(true);
    expect(matchResultFrom(s, 0).matchId).toBe(matchResultFrom(s, 0).matchId);
    expect(matchResultFrom(s, 0, { matchId: 'srv-9', endedAt: 5, rated: true })).toMatchObject({
      matchId: 'srv-9',
      endedAt: 5,
      rated: true,
    });
    expect(() => matchResultFrom(s, 9)).toThrow();
  });

  it('team games use the team result and standing', () => {
    const s = createGame({
      seed: 3,
      arenaId: 'rumbleOshodi',
      players: [0, 1, 2, 3].map((i) => ({
        name: `T${i}`,
        characterId: 'streetBaller' as const,
        isBot: i > 0,
      })),
      settings: { game: 'team', mode: 'crush', durationSec: 180 },
    });
    s.match.phase = 'ended';
    s.match.result = { kind: 'teamWin', team: s.players[0]!.team };
    expect(matchResultFrom(s, 0)).toMatchObject({ outcome: 'win', placement: 1, game: 'team' });
    const other = s.players.find((p) => p.team !== s.players[0]!.team)!;
    expect(matchResultFrom(s, other.id).outcome).toBe('loss');
  });

  it('a campaign mission match carries its own outcome', () => {
    const s = finished(1); // the boss seat "won" the match...
    (s as { mission?: unknown }).mission = {
      outcome: {
        result: 'won',
        missionId: 'oshodi',
        modifiers: [],
        seconds: 100,
        livesUsed: 0,
        phasesCleared: 3,
        defeat: 'eliminated',
        stars: 3,
        creditedKills: 4,
      },
    };
    expect(matchResultFrom(s, 0)).toMatchObject({
      outcome: 'win',
      placement: 1,
      mission: { missionId: 'oshodi', result: 'won', stars: 3 },
    });
  });

  it('works on a real finished match', () => {
    const s = createGame({
      seed: 9,
      players: [0, 1].map((i) => ({ name: `R${i}`, characterId: 'streetBaller' as const, isBot: i > 0 })),
    });
    s.match.phase = 'playing';
    s.match.countdownRemaining = 0;
    for (let i = 0; i < 60 * 300 && (s.match.phase as string) !== 'ended'; i++) tick(s, {});
    const r = matchResultFrom(s, 0);
    expect(['win', 'loss', 'draw']).toContain(r.outcome);
    expect(applyMatchResult(createProfile(), r).profile.totals.matches).toBe(1);
  });
});

describe('persistence through the KeyValueStore port', () => {
  it('round-trips and survives missing, blocked or corrupt storage', () => {
    const store = memoryStore();
    const p = applyMatchResult(createProfile(), input()).profile;
    expect(saveProgression(store, p)).toBe(true);
    expect(loadProgression(store)).toEqual(p);
    expect(loadProgression(null)).toEqual(createProfile());
    expect(saveProgression(null, p)).toBe(false);
    store.setItem(PROGRESSION_KEY, '{oops');
    expect(loadProgression(store)).toEqual(createProfile());
    expect(store.getItem(`${PROGRESSION_KEY}.corrupt`)).toBe('{oops');
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(loadProgression(broken)).toEqual(createProfile());
    expect(saveProgression(broken, p)).toBe(false);
    expect(() => clearProgression(broken)).not.toThrow();
    clearProgression(store);
    expect(store.getItem(PROGRESSION_KEY)).toBeNull();
  });

  it('repairs a tampered record: types, ranges, level from xp, unknown fields dropped', () => {
    const r = repairProfile({
      xp: 450,
      level: 99,
      rankPoints: -3,
      totals: { wins: 'lots', matches: 4 },
      history: [{ matchId: 'a' }, 7],
      unlocked: ['admin-skin'],
      evil: 1,
      winStreak: 2,
    });
    expect(r.level).toBe(levelForXp(450));
    expect(r.rankPoints).toBe(0);
    expect(r.totals).toMatchObject({ wins: 0, matches: 4 });
    expect(r.history).toHaveLength(1);
    expect(r.unlocked).not.toContain('admin-skin');
    expect(r.bestWinStreak).toBe(2);
    expect('evil' in r).toBe(false);
    expect(repairProfile(null)).toEqual(createProfile());
    expect(repairProfile('x')).toEqual(createProfile());
  });
});

describe('leaderboards (local mock data)', () => {
  it('seeded, fictional, deterministic, unique names', () => {
    const a = seedLeaderboard(7, 40);
    expect(a).toEqual(seedLeaderboard(7, 40));
    expect(a).not.toEqual(seedLeaderboard(8, 40));
    expect(a).toHaveLength(40);
    expect(new Set(a.map((x) => x.displayName)).size).toBe(40);
    expect(a.every((x) => /^[A-Za-z]+_[A-Za-z]+\d+$/.test(x.displayName))).toBe(true);
  });

  it('ranks with ties, merges you in, and always shows your row', () => {
    const base = seedLeaderboard(7, 40);
    const rows = rankBoard(base, { accountId: 'me', displayName: 'Me', points: 0 }, 10);
    expect(rows).toHaveLength(10);
    expect(rows.at(-1)).toMatchObject({ accountId: 'me', isYou: true });
    expect(rows.at(-1)!.rank).toBe(41);
    const top = rankBoard(base, { accountId: 'me', displayName: 'Me', points: 99999 }, 10);
    expect(top[0]).toMatchObject({ isYou: true, rank: 1 });
    const tie = rankBoard(
      [
        { accountId: 'a', displayName: 'A', points: 5 },
        { accountId: 'b', displayName: 'B', points: 5 },
        { accountId: 'c', displayName: 'C', points: 1 },
      ],
      null,
      10,
    );
    expect(tie.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rankBoard(base, null, 5)).toHaveLength(5);
  });
});
