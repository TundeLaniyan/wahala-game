/**
 * The victory presentation (presentation only, pure; decision SU2). A Rumble result is decided by credited eliminations
 * (decisions SD1, SD4, AS6a), so the winner can be a fighter who is down when the match ends: one who fell earlier
 * with the highest total, or one who fell in the very blast that ended the sudden-death round with the lead. The
 * simulation never revives them (the rules stand: no resurrection, no health bars). The picture must not contradict
 * the result, though: a winner lying dead on the victory screen reads as a bug. So when the match has ended, a winner who
 * is down is DRAWN standing in the victory pose on the tile where they fell (a revived figure in the results view,
 * exactly like the respawn modes' `revive`), and nobody else's pose changes.
 *
 *  - a solo winner: that fighter;
 *  - a team win: the winning team's members who are standing already celebrate; only when none of them stands, the last
 *    members to fall (the latest elimination tick) are shown up, so the winning team is never drawn as a row of the dead;
 *  - a draw, or a result that is not out yet: nobody.
 */
import type { GameState, MatchResult, Player } from '../../sim';
import { Tile, tileAt } from '../../sim';

/** Whether the result names this fighter (or their team) the winner. */
export function isWinner(result: MatchResult | null, p: Pick<Player, 'id' | 'team'>): boolean {
  if (!result) return false;
  if (result.kind === 'win') return p.id === result.winnerId;
  if (result.kind === 'teamWin') return p.team === result.team;
  return false;
}

/** The fighters to draw standing in the victory pose although the simulation has them down. */
export function winnersShownStanding(state: GameState): number[] {
  const result = state.match.result;
  if (state.match.phase !== 'ended' || !result) return [];
  const winners = state.players.filter((p) => isWinner(result, p));
  if (winners.length === 0 || winners.some((p) => p.alive)) return [];
  if (result.kind === 'win') return winners.map((p) => p.id);
  // a team with nobody standing: the last of them to fall
  const last = Math.max(...winners.map((p) => p.eliminatedTick ?? -1));
  return winners.filter((p) => (p.eliminatedTick ?? -1) === last).map((p) => p.id);
}

/** Whether the fighter is drawn standing and celebrating although it is down in the simulation. */
export function shownStanding(state: GameState, p: Pick<Player, 'id'>): boolean {
  return winnersShownStanding(state).includes(p.id);
}

const RING = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

/**
 * Where a revived winner stands: the tile where they fell, or the nearest open floor within three tiles when that tile is
 * now a block (a crush block landed there). Never moves anyone onto a block; falls back to the fall tile.
 */
export function victoryTile(state: GameState, p: Pick<Player, 'x' | 'y'>): { x: number; y: number } {
  const open = (x: number, y: number): boolean => {
    const t = tileAt(state, x, y);
    return t !== Tile.Hard && t !== Tile.Soft;
  };
  if (open(p.x, p.y)) return { x: p.x, y: p.y };
  for (let r = 1; r <= 3; r++)
    for (const [dx, dy] of RING) {
      const x = p.x + dx * r;
      const y = p.y + dy * r;
      if (open(x, y)) return { x, y };
    }
  return { x: p.x, y: p.y };
}
