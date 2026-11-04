/**
 * Builds a `MatchResultInput` from a finished simulation state. Pure: reads the state only. Works for standard,
 * City Rumble and campaign mission matches (a mission carries its own outcome).
 */
import { isTeamMode, rankPlayers, teamStandings } from '../sim';
import type { GameState } from '../sim';
import type { MatchOutcome, MatchResultInput } from './types';

export interface MatchResultMeta {
  /** Default: a deterministic id from the seed, the final tick and the player. */
  matchId?: string;
  /** Wall-clock ms (the sim has none). Default 0. */
  endedAt?: number;
  /** A ranked online match (changes rank points). Default false. */
  rated?: boolean;
}

function outcomeOf(state: GameState, playerId: number): MatchOutcome {
  const me = state.players[playerId];
  const mission = state.mission?.outcome;
  if (mission) return mission.result === 'won' ? 'win' : mission.result === 'timeout' ? 'draw' : 'loss';
  const r = state.match.result;
  if (!r || !me) return 'loss';
  if (r.kind === 'draw') return 'draw';
  if (r.kind === 'win') return r.winnerId === playerId ? 'win' : 'loss';
  return isTeamMode(state.settings.game) && me.team === r.team ? 'win' : 'loss';
}

/** 1-based finishing position: team standing in team games, kills ranking in respawn games, else survival order. */
function placementOf(state: GameState, playerId: number, outcome: MatchOutcome): number {
  const me = state.players[playerId]!;
  if (state.mission) return outcome === 'win' ? 1 : state.players.length;
  if (isTeamMode(state.settings.game) && me.team >= 0) {
    return Math.max(1, teamStandings(state).findIndex((t) => t.team === me.team) + 1);
  }
  if (state.settings.game === 'deathmatch') return rankPlayers(state).findIndex((p) => p.id === playerId) + 1;
  if (outcome === 'win') return 1;
  // last standing: alive first, then the latest eliminated, ties by id
  const order = [...state.players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return (b.eliminatedTick ?? 0) - (a.eliminatedTick ?? 0) || a.id - b.id;
  });
  return order.findIndex((p) => p.id === playerId) + 1;
}

export function matchResultFrom(state: GameState, playerId: number, meta: MatchResultMeta = {}): MatchResultInput {
  const me = state.players[playerId];
  if (!me) throw new Error(`no player ${playerId} in this match`);
  const outcome = outcomeOf(state, playerId);
  const mo = state.mission?.outcome ?? null;
  return {
    matchId: meta.matchId ?? `local-${state.seed}-${state.tick}-${playerId}`,
    game: state.settings.game,
    arenaId: state.arenaId,
    outcome,
    placement: placementOf(state, playerId, outcome),
    competitors: state.players.length,
    kills: me.stats.kills,
    deaths: me.stats.deaths,
    assists: me.stats.assists,
    durationSec: Math.round(state.match.playTicks / 60),
    streakRewards: me.streakRewards.earned.length,
    vsBots: state.players.every((p) => p.id === playerId || p.isBot),
    rated: meta.rated ?? false,
    mission: mo ? { missionId: mo.missionId, result: mo.result, stars: mo.stars } : null,
    endedAt: meta.endedAt ?? 0,
  };
}
