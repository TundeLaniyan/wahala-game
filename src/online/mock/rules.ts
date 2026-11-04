/**
 * Which games run on which arenas, and how many seats a mock room has. Reads the sim's arena registry; the
 * server (not the client) decides all of this.
 */
import { ARENAS, MAX_PLAYERS } from '../../sim';
import type { MatchSettings } from '../../sim';
import { E } from '../errors';
import type { OnlineError } from '../errors';
import type { LobbySettings, OnlineGame } from '../types';

/** Classic = the standard arenas; the three Rumble rulesets = the City Rumble stages. */
export function checkLobby(s: LobbySettings): OnlineError | null {
  const arena = ARENAS[s.arenaId];
  if (!arena || arena.experimental) return E.notFound('Unknown arena.');
  const rumbleGame = s.game !== 'classic';
  if (rumbleGame !== (arena.kind === 'rumble')) return E.conflict('That game does not run on that arena.');
  return null;
}

/** Seats in a mock room: 4 for Classic, 6 for the Rumble rulesets, never more than the arena holds. */
export function roomSize(s: LobbySettings): number {
  const arena = ARENAS[s.arenaId]!;
  const want = s.game === 'classic' ? 4 : 6;
  return Math.max(2, Math.min(want, MAX_PLAYERS, arena.maxPlayers, arena.spawns.length));
}

export const teamCountFor = (game: OnlineGame): number => (game === 'team' ? 2 : 0);

/** The sim settings an online match uses (Wahala Crush on; the respawn modes get a 3-minute clock). */
export function matchSettingsFor(game: OnlineGame): Partial<MatchSettings> {
  const timed = game === 'deathmatch' || game === 'team';
  return { game, mode: 'crush', friendlyFire: false, teamCount: 2, durationSec: timed ? 180 : null };
}
