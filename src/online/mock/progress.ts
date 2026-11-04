/**
 * Mock progression and ranking services. The SERVER derives a player's result from the match it ran
 * (`matchResultFrom` over the authoritative state) and applies the pure reducers from src/progression; the
 * client can only ask it to settle a match, never supply the result.
 */
import {
  applyMatchResult,
  loadProgression,
  matchResultFrom,
  rankBoard,
  rankInfo,
  saveProgression,
  seedLeaderboard,
} from '../../progression';
import type { ProgressionProfile } from '../../progression';
import { SEASONS, currentSeason } from '../../seasons';
import type { ProgressionService, RankingService } from '../contracts';
import { E } from '../errors';
import { nextMatchPhase } from '../lifecycle';
import { err, ok } from '../result';
import { fnv1a } from '../util';
import type { MockCtx } from './context';

const keyFor = (accountId: string): string => `wahala.online.mock.progression.v1.${accountId}`;

/** The signed-in account's profile (loaded from the injected store on first use). */
export function profileOf(ctx: MockCtx, accountId: string): ProgressionProfile {
  const cached = ctx.state.progression;
  if (cached && cached.accountId === accountId) return cached.profile;
  const profile = loadProgression(ctx.opts.progressStore, keyFor(accountId));
  ctx.state.progression = { accountId, profile };
  return profile;
}

function store(ctx: MockCtx, accountId: string, profile: ProgressionProfile): void {
  ctx.state.progression = { accountId, profile };
  saveProgression(ctx.opts.progressStore, profile, keyFor(accountId));
}

export function createProgressionService(ctx: MockCtx): ProgressionService {
  return {
    get: () =>
      ctx.call('progression', 'get', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const profile = profileOf(ctx, u.value.id);
        return ok({ profile: structuredClone(profile), rank: rankInfo(profile.rankPoints) });
      }),
    settle: (matchId) =>
      ctx.call('progression', 'settle', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const rec = ctx.state.matches.get(matchId);
        if (!rec) return err(E.notFound('No such match.'));
        const seat = rec.seats.findIndex((s) => s.accountId === u.value.id && !s.isBot);
        if (seat < 0) return err(E.forbidden('You were not in this match.'));
        if (rec.phase !== 'ended' && rec.phase !== 'resultsPosted') {
          return err(E.invalidState(rec.phase, 'The match has not ended.'));
        }
        const input = matchResultFrom(rec.state, seat, { matchId: rec.id, endedAt: ctx.now(), rated: true });
        const before = profileOf(ctx, u.value.id);
        const applied = applyMatchResult(before, input, currentSeason(ctx.now()));
        store(ctx, u.value.id, applied.profile);
        const next = nextMatchPhase(rec.phase, 'resultsPosted');
        if (next) rec.phase = next;
        ctx.events.emit({ type: 'progress.update', update: applied.update, profile: structuredClone(applied.profile) });
        return ok(applied.update);
      }),
  };
}

export function createRankingService(ctx: MockCtx): RankingService {
  return {
    rating: () =>
      ctx.call('ranking', 'rating', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const p = profileOf(ctx, u.value.id);
        return ok({ points: p.rankPoints, rank: rankInfo(p.rankPoints) });
      }),
    leaderboard: (boardId, limit = 10) =>
      ctx.call('ranking', 'leaderboard', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const season = SEASONS.find((s) => s.leaderboardId === boardId);
        if (boardId !== 'global' && !season) return err(E.notFound('No such leaderboard.'));
        const p = profileOf(ctx, u.value.id);
        const points = season ? (p.season.seasonId === season.id ? p.season.points : 0) : p.rankPoints;
        const base = seedLeaderboard(fnv1a(boardId), 40);
        const rows = rankBoard(base, { accountId: u.value.id, displayName: u.value.displayName, points }, Math.max(1, Math.min(50, limit)));
        return ok({ boardId, rows, total: base.length + 1 });
      }),
  };
}
