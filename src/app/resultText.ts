import { CHARACTERS } from '../sim';
import type { WinReason } from '../sim';
import type { HudSnapshot } from './hud';

/** How a Rumble result was decided when it was not plain last-standing (empty when it was). */
function decidedByText(by: WinReason | undefined): string {
  switch (by) {
    case 'timeoutKills':
      return 'Most eliminations at time up';
    case 'simultaneousKills':
      return 'Most eliminations when the last fighters fell together';
    case 'suddenDeath':
      return 'Won in sudden death';
    default:
      return '';
  }
}

/** Title and one line for the results card, per game and outcome (pure; unit-tested). */
export function resultText(hud: HudSnapshot, won: boolean): { title: string; detail: string } {
  const r = hud.result!;
  const rumble = hud.rumble;
  if (r.kind === 'teamWin') {
    const team = rumble?.teams.find((t) => t.team === r.team);
    const name = (team?.name ?? 'Team').toUpperCase();
    const other = rumble?.teams.find((t) => t.team !== r.team);
    const score = team && other ? ` ${team.kills} – ${other.kills}` : '';
    const how = r.decidedBy ? ` ${decidedByText(r.decidedBy).toLowerCase()}.` : '';
    return won
      ? { title: `${name} WINS!`, detail: `Your team took it${score}.${how} Na una run am!` }
      : { title: `${name} WINS`, detail: `Your team fell short${score}.${how} Next time!` };
  }
  if (r.kind === 'draw') {
    if (r.reason === 'suddenDeathExhausted')
      return {
        title: 'DRAW!',
        detail: 'Sudden death: every blast fell and more than one fighter is still standing.',
      };
    if (r.reason === 'suddenDeathMutual')
      return {
        title: 'DRAW!',
        detail: 'Sudden death: the last fighters fell together, level on eliminations.',
      };
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
  if (r.decidedBy) {
    const how = decidedByText(r.decidedBy);
    return won
      ? { title: 'YOU WIN!', detail: `${how}. Oga at the top!` }
      : { title: 'ELIMINATED', detail: `${winner?.name ?? 'A bot'} took it. ${how}.` };
  }
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
