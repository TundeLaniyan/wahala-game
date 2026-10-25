/**
 * Match flow: countdown, timer, win / draw detection. Classic and Survival: last standing (a timeout
 * with several standing is a draw). Deathmatch and Team Rumble: the clock decides (`timedResult`).
 */
import type { GameState, MatchResult, Player, SimEvent } from '../types';
import { isRespawnMode, isTeamMode } from '../modes';
import { alivePlayers } from './queries';

function end(state: GameState, result: NonNullable<GameState['match']['result']>, events: SimEvent[]): void {
  state.match.phase = 'ended';
  state.match.result = result;
  state.match.endedTick = state.tick;
  events.push({ type: 'matchEnded', result });
}

/**
 * Called once per playing tick AFTER all eliminations of the tick have been applied, so every
 * elimination in the same tick is seen together: nobody left means a draw, never an arbitrary winner.
 */
export function evaluateMatchEnd(state: GameState, events: SimEvent[]): void {
  if (state.match.phase !== 'playing' || state.players.length < 2) return;
  if (isRespawnMode(state.settings.game)) {
    if (state.match.playTicks >= state.config.match.durationTicks) end(state, timedResult(state), events);
    return;
  }
  const alive = alivePlayers(state);
  if (alive.length === 0) end(state, { kind: 'draw', reason: 'simultaneous' }, events);
  else if (alive.length === 1) end(state, { kind: 'win', winnerId: alive[0]!.id }, events);
  else if (state.match.playTicks >= state.config.match.durationTicks)
    end(state, { kind: 'draw', reason: 'timeout' }, events);
}

/**
 * Deathmatch: most credited eliminations; ties broken by fewer deaths, then more assists, then whoever
 * reached the score first (the earlier last elimination). Still identical at the top = draw ('tie').
 * Team Rumble: most team eliminations (credited eliminations of enemies: a friendly-fire or accidental
 * death is nobody's point but still counts as a death), then fewer team deaths; identical = draw.
 * Assists never decide a team match (they are not eliminations).
 */
export function timedResult(state: GameState): MatchResult {
  if (isTeamMode(state.settings.game)) {
    const standings = teamStandings(state);
    const [a, b] = standings;
    if (!a) return { kind: 'draw', reason: 'tie' };
    if (b && a.kills === b.kills && a.deaths === b.deaths) return { kind: 'draw', reason: 'tie' };
    return { kind: 'teamWin', team: a.team };
  }
  const [first, second] = rankPlayers(state);
  if (!first) return { kind: 'draw', reason: 'tie' };
  if (second && compareStats(first, second) === 0) return { kind: 'draw', reason: 'tie' };
  return { kind: 'win', winnerId: first.id };
}

function compareStats(a: Player, b: Player): number {
  return (
    b.stats.kills - a.stats.kills ||
    a.stats.deaths - b.stats.deaths ||
    b.stats.assists - a.stats.assists ||
    (a.stats.lastKillTick < 0 ? Infinity : a.stats.lastKillTick) -
      (b.stats.lastKillTick < 0 ? Infinity : b.stats.lastKillTick) ||
    0
  );
}

/** Players best first by the Deathmatch ranking (stable on id). */
export function rankPlayers(state: GameState): Player[] {
  return [...state.players].sort((a, b) => compareStats(a, b) || a.id - b.id);
}

export interface TeamStanding {
  team: number;
  kills: number;
  deaths: number;
  assists: number;
  members: number;
}

/** Teams best first: most eliminations, then fewest deaths, then lower team index. */
export function teamStandings(state: GameState): TeamStanding[] {
  const map = new Map<number, TeamStanding>();
  for (const p of state.players) {
    if (p.team < 0) continue;
    const t = map.get(p.team) ?? { team: p.team, kills: 0, deaths: 0, assists: 0, members: 0 };
    t.kills += p.stats.kills;
    t.deaths += p.stats.deaths;
    t.assists += p.stats.assists;
    t.members++;
    map.set(p.team, t);
  }
  return [...map.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.team - b.team);
}

export function secondsRemaining(state: GameState): number {
  return Math.max(0, Math.ceil((state.config.match.durationTicks - state.match.playTicks) / 60));
}
