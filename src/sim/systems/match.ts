/**
 * Match flow: countdown, timer, win / draw detection.
 *
 * Classic: last standing; a timeout with several standing, or everybody falling together, is a draw
 * (unchanged). City Rumble (decisions SD1-SD6): when the clock runs out, or a blast takes down everyone still
 * active, the credited kills of every player (the fallen included) decide: one clear leader wins at once, the
 * players tied on the highest total play sudden death (systems/suddenDeath.ts). Deathmatch and Team Rumble
 * are decided by the clock (`timedResult` ranks the board; the kill count decides the match).
 */
import type { GameState, MatchResult, Player, SimEvent } from '../types';
import { isRespawnMode, isTeamMode } from '../modes';
import { endMatch } from './matchResult';
import { alivePlayers } from './queries';
import { evaluateSuddenDeath, resolveByKills } from './suddenDeath';

/**
 * Called once per playing tick AFTER all eliminations of the tick have been applied, so every
 * elimination in the same tick is seen together: nobody left means the kill totals decide in a Rumble
 * and a draw in Classic, never an arbitrary winner.
 */
export function evaluateMatchEnd(state: GameState, events: SimEvent[]): void {
  if (state.match.phase !== 'playing' || state.players.length < 2) return;
  if (state.match.suddenDeath) {
    evaluateSuddenDeath(state, events);
    return;
  }
  const timeUp = state.match.playTicks >= state.config.match.durationTicks;
  const rumble = state.settings.game !== 'classic';
  if (isRespawnMode(state.settings.game)) {
    if (timeUp) resolveByKills(state, 'timeoutKills', events);
    return;
  }
  const alive = alivePlayers(state);
  if (alive.length === 0) {
    if (rumble) resolveByKills(state, 'simultaneousKills', events);
    else endMatch(state, { kind: 'draw', reason: 'simultaneous' }, events);
  } else if (alive.length === 1) endMatch(state, { kind: 'win', winnerId: alive[0]!.id }, events);
  else if (timeUp) {
    if (rumble) resolveByKills(state, 'timeoutKills', events);
    else endMatch(state, { kind: 'draw', reason: 'timeout' }, events);
  }
}

/**
 * The Deathmatch / Team Rumble scoreboard order: most credited eliminations, then fewer deaths, more assists
 * and whoever reached the score first (display only: the match itself is decided by the kill count alone, with
 * sudden death for a shared lead). Returns the board leader, or a 'tie' draw when the board is level on every count.
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
