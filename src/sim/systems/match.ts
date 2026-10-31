/**
 * Match flow: countdown, timer, win / draw detection.
 *
 * Classic: last standing; a timeout with several standing, or everybody falling together, is a draw
 * (unchanged). City Rumble (decision SD1): a unique credited-kill leader wins at time up, and a final contest
 * that takes the last fighters down together goes to the highest kill total among them. Equal kill totals
 * never end in a draw: the tied contenders play sudden death (systems/suddenDeath.ts). Deathmatch and Team
 * Rumble are decided by the clock (`timedResult` ranks the board; the kill count decides the match).
 */
import type { GameState, MatchResult, Player, SimEvent } from '../types';
import { isRespawnMode, isTeamMode } from '../modes';
import { endMatch, leadingSides, sideKills, sideOf, winFor } from './matchResult';
import { alivePlayers } from './queries';
import { enterSuddenDeath, evaluateSuddenDeath } from './suddenDeath';

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
    if (timeUp) resolveTimeout(state, state.players, events);
    return;
  }
  const alive = alivePlayers(state);
  if (alive.length === 0) {
    if (rumble) resolveSimultaneous(state, events);
    else endMatch(state, { kind: 'draw', reason: 'simultaneous' }, events);
  } else if (alive.length === 1) endMatch(state, { kind: 'win', winnerId: alive[0]!.id }, events);
  else if (timeUp) {
    if (rumble) resolveTimeout(state, alive, events);
    else endMatch(state, { kind: 'draw', reason: 'timeout' }, events);
  }
}

/** Time up: the eligible fighters' credited kills decide; a shared lead plays sudden death. */
function resolveTimeout(state: GameState, eligible: readonly Player[], events: SimEvent[]): void {
  const lead = leadingSides(sideKills(state, eligible));
  if (lead.length === 1) endMatch(state, winFor(state, lead[0]!, 'timeoutKills'), events);
  else {
    const tied = eligible.filter((p) => lead.includes(sideOf(state, p)));
    enterSuddenDeath(state, tied, 'timeout', events);
  }
}

/** Nobody is left standing: the fighters eliminated together in this final contest are compared. */
function resolveSimultaneous(state: GameState, events: SimEvent[]): void {
  const involved = state.players.filter((p) => !p.alive && p.eliminatedTick === state.tick);
  if (involved.length < 2) {
    endMatch(state, { kind: 'draw', reason: 'simultaneous' }, events);
    return;
  }
  const lead = leadingSides(sideKills(state, involved));
  if (lead.length === 1) endMatch(state, winFor(state, lead[0]!, 'simultaneousKills'), events);
  else
    enterSuddenDeath(
      state,
      involved.filter((p) => lead.includes(sideOf(state, p))),
      'simultaneous',
      events,
    );
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
