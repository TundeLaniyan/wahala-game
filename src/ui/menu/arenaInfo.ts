/**
 * Arena facts for the menus, read from the simulation's arena registry (never a hand-copied list): the
 * stages offered for the chosen game, their preview pictures (public/previews, rendered from the real
 * arenas by scripts/arena-previews.mjs) and a mood gradient while a preview loads or if it is missing.
 */
import { ARENAS, EXPERIMENTAL_ARENA_IDS, RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS } from '../../sim';
import type { ArenaDef } from '../../sim';
import type { GameSettings } from '../../app/settings';

const MOOD: Record<string, [string, string]> = {
  danfoBusPark: ['#c9822e', '#3a2414'],
  balogunMarket: ['#d6a24a', '#5a2e1c'],
  lekkiRoadworks: ['#2a3a52', '#07090d'],
  oshodiInterchange: ['#b8a07a', '#3d3a36'],
  ajegunleBackstreets: ['#7d7a72', '#2a2724'],
  lagoonJetty: ['#9fb8c0', '#2a4048'],
  surulerePowerYard: ['#e8d27a', '#4a4030'],
  yabaAfterDark: ['#7a2a8a', '#0a0612'],
  thirdMainland: ['#f0a050', '#3a2440'],
  rumbleLagosIsland: ['#d89a4a', '#4a2414'],
  rumbleOjuelegba: ['#8a7a66', '#1e1a18'],
  rumbleApapa: ['#6a8aa0', '#24323c'],
  rumbleLekkiNight: ['#2a3a52', '#07090d'],
  rumbleOshodi: ['#9fb0b8', '#1a2430'],
  cityRumble: ['#ff6a2a', '#1a0f08'],
};

/** Base-path-safe URL of an arena's preview picture (GitHub Pages serves the game under /wahala-game/). */
export function stagePreviewUrl(id: string): string {
  return `${import.meta.env.BASE_URL}previews/${id}.jpg`;
}

export function moodGradient(id: string): string {
  const [a, b] = MOOD[id] ?? ['#3a3f4a', '#0b0e14'];
  return `linear-gradient(160deg, ${a}, ${b})`;
}

/** "41 x 31" */
export function boardSize(a: ArenaDef): string {
  return `${a.layout[0]!.length} x ${a.layout.length}`;
}

export interface ArenaGroup {
  title: string;
  ids: readonly string[];
}

/** The arenas offered for the chosen game: Rumble stages, or the standard arenas plus the test ones. */
export function arenaGroups(play: GameSettings['play']): ArenaGroup[] {
  if (play === 'rumble') return [{ title: 'City Rumble stages', ids: RUMBLE_ARENA_IDS }];
  const experimental = EXPERIMENTAL_ARENA_IDS.filter((id) => id in ARENAS);
  const groups: ArenaGroup[] = [
    { title: 'Classic arenas', ids: STANDARD_ARENA_IDS.filter((id) => !experimental.includes(id)) },
  ];
  if (experimental.length) groups.push({ title: 'Test / experimental', ids: experimental });
  return groups;
}

/** The arena the next match uses for the chosen game (an unknown saved id falls back to the first). */
export function selectedArenaId(s: GameSettings): string {
  const ids = arenaGroups(s.play).flatMap((g) => g.ids);
  const id = s.play === 'rumble' ? s.rumbleArenaId : s.arenaId;
  return ids.includes(id) ? id : ids[0]!;
}

/** The settings patch that selects arena `id` for the chosen game. */
export function arenaPatch(play: GameSettings['play'], id: string): Partial<GameSettings> {
  return play === 'rumble' ? { rumbleArenaId: id } : { arenaId: id };
}

/** Experimental arenas have no rendered preview picture. */
export const hasPreview = (id: string): boolean => !EXPERIMENTAL_ARENA_IDS.includes(id);
