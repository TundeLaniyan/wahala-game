/** Shared helpers for ending a match and comparing credited kill totals (match.ts, suddenDeath.ts). */
import { isTeamMode } from '../modes';
import type { GameState, MatchResult, Player, SimEvent, WinReason } from '../types';

export function endMatch(state: GameState, result: MatchResult, events: SimEvent[]): void {
  state.match.phase = 'ended';
  state.match.result = result;
  state.match.endedTick = state.tick;
  events.push({ type: 'matchEnded', result });
}

/** The unit that wins: the team in Team Rumble, otherwise the fighter. */
export function sideOf(state: GameState, p: Pick<Player, 'id' | 'team'>): number {
  return isTeamMode(state.settings.game) ? p.team : p.id;
}

/** Credited kill totals per side over exactly `players` (a team adds up its members' eliminations). */
export function sideKills(state: GameState, players: readonly Player[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const p of players) {
    const side = sideOf(state, p);
    totals.set(side, (totals.get(side) ?? 0) + p.stats.kills);
  }
  return totals;
}

/** The sides sharing the highest total (one entry = a unique leader). Never ordered by id: callers use a set. */
export function leadingSides(totals: ReadonlyMap<number, number>): number[] {
  let top = -Infinity;
  for (const kills of totals.values()) top = Math.max(top, kills);
  return [...totals].filter(([, kills]) => kills === top).map(([side]) => side);
}

export function winFor(state: GameState, side: number, decidedBy: WinReason): MatchResult {
  return isTeamMode(state.settings.game)
    ? { kind: 'teamWin', team: side, decidedBy }
    : { kind: 'win', winnerId: side, decidedBy };
}
