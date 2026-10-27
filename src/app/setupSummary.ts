/**
 * Main-menu copy: the one-line summary under the Play button and the Rumble mode descriptions. Pure
 * (unit-tested); the rules themselves live in `src/sim/modes.ts`.
 */
import { DIFFICULTIES, getArena } from '../sim';
import type { Difficulty } from '../sim';
import { competitorCount, matchArenaId } from './names';
import type { GameSettings, RumbleModeSetting } from './settings';

export interface RumbleModeInfo {
  id: RumbleModeSetting;
  name: string;
  /** One line on the mode card. */
  blurb: string;
  /** Short facts (chips) on the mode card. */
  facts: string[];
}

export const RUMBLE_MODE_INFO: readonly RumbleModeInfo[] = [
  {
    id: 'survival',
    name: 'Survival',
    blurb: 'Last one standing. The city closes in street by street.',
    facts: ['One life', 'Eliminations power you up', 'Up to 32'],
  },
  {
    id: 'deathmatch',
    name: 'Deathmatch',
    blurb: 'Timed free-for-all. Fall, respawn, go again. Most eliminations wins.',
    facts: ['Respawns', 'Spawn protection', '5 or 10 min'],
  },
  {
    id: 'team',
    name: 'Team Rumble',
    blurb: 'Green v White. You and your bot squad against the other side.',
    facts: ['Teams', 'Respawns', 'Most team eliminations'],
  },
];

export const difficultyLabel = (d: Difficulty): string => d.charAt(0).toUpperCase() + d.slice(1);

/** "Rookie" / "Rookie (mixed)" / per-bot range "Rookie-Expert". */
function botsLabel(s: GameSettings): string {
  if (s.play === 'rumble') return `${difficultyLabel(s.difficulty)} bots${s.rumbleMixed ? ' (mixed)' : ''}`;
  const levels = s.botDifficulties.slice(0, s.competitors - 1);
  const idx = levels.map((d) => DIFFICULTIES.indexOf(d));
  const lo = DIFFICULTIES[Math.min(...idx)] ?? s.difficulty;
  const hi = DIFFICULTIES[Math.max(...idx)] ?? s.difficulty;
  return lo === hi ? `${difficultyLabel(lo)} bots` : `${difficultyLabel(lo)}-${difficultyLabel(hi)} bots`;
}

/** e.g. "Team Rumble · 8 v 8 · 10 min · City Rumble · Rookie bots". */
export function setupSummary(s: GameSettings): string {
  const arena = getArena(matchArenaId(s));
  const n = competitorCount(s);
  if (s.play === 'classic') return [`Classic Battle`, `${n} players`, arena.name, botsLabel(s)].join(' · ');
  const mode = RUMBLE_MODE_INFO.find((m) => m.id === s.rumbleMode)!;
  const parts = [mode.name];
  if (s.rumbleMode === 'team') parts.push(`${Math.floor(n / 2)} v ${n - Math.floor(n / 2)}`);
  else parts.push(`${n} fighters`);
  if (s.rumbleMode !== 'survival') parts.push(`${s.rumbleMinutes} min`);
  if (s.rumbleMode === 'team' && s.friendlyFire) parts.push('friendly fire');
  if (s.rumbleBlast === 'cross') parts.push('cross blasts');
  parts.push(arena.name.replace(/^WAHALA! /, ''), botsLabel(s));
  return parts.join(' · ');
}
