import { CHARACTERS } from '../sim';
import type { HudSnapshot } from './hud';

/** Title and one line for the results card, per game and outcome (pure; unit-tested). */
export function resultText(hud: HudSnapshot, won: boolean): { title: string; detail: string } {
  const r = hud.result!;
  const rumble = hud.rumble;
  if (r.kind === 'teamWin') {
    const team = rumble?.teams.find((t) => t.team === r.team);
    const name = (team?.name ?? 'Team').toUpperCase();
    const other = rumble?.teams.find((t) => t.team !== r.team);
    const score = team && other ? ` ${team.kills} – ${other.kills}` : '';
    return won
      ? { title: `${name} WINS!`, detail: `Your team took it${score}. Na una run am!` }
      : { title: `${name} WINS`, detail: `Your team fell short${score}. Next time!` };
  }
  if (r.kind === 'draw') {
    if (r.reason === 'tie')
      return {
        title: 'DRAW!',
        detail: rumble?.mode === 'team' ? 'The teams finished level.' : 'Level at the top on every count.',
      };
    return {
      title: 'DRAW!',
      detail:
        r.reason === 'timeout'
          ? 'Time up with rivals still standing: nobody wins.'
          : 'Everybody went down together. Wahala!',
    };
  }
  const winner = hud.players[r.winnerId];
  if (rumble?.mode === 'deathmatch')
    return won
      ? { title: 'YOU WIN!', detail: `Most eliminations when the clock ran out. Oga at the top!` }
      : {
          title: 'TIME!',
          detail: `${winner?.name ?? 'A bot'} topped the board with ${rumble.leaderboard[0]?.kills ?? 0} elimination${rumble.leaderboard[0]?.kills === 1 ? '' : 's'}.`,
        };
  if (won)
    return {
      title: 'YOU WIN!',
      detail: rumble
        ? `Last one standing out of ${rumble.total}. Naija no dey carry last!`
        : 'Last one standing. Naija no dey carry last!',
    };
  return {
    title: 'ELIMINATED',
    detail: `${winner?.name ?? 'A bot'} (${winner ? CHARACTERS[winner.characterId].name : ''}) took it.`,
  };
}
