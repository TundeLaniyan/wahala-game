/**
 * Quick Match (Choose How to Play, "START HERE"): the safest beginner match the existing Classic Battle rules offer,
 * one human against two Rookie bots on the default standard arena. Pure data (unit-tested): it only sets the real
 * `GameSettings` a Classic match already reads, so the match is an ordinary Classic Battle with no special rules.
 * The player's fighter, audio and control preferences are never touched, and neither are their saved match preferences:
 * the defaults are TEMPORARY (decision SX11). `session.ts` holds them over the saved settings only until the player is
 * back at the menu, and never writes them to storage (`splitQuickWrite` keeps them out of every save made meanwhile).
 */
import type { GameSettings } from './settings';

export const QUICK_MATCH_ARENA_ID = 'danfoBusPark';

export const QUICK_MATCH: Pick<
  GameSettings,
  'play' | 'competitors' | 'difficulty' | 'botDifficulties' | 'arenaId' | 'crowdThrows'
> = {
  play: 'classic',
  competitors: 3,
  difficulty: 'rookie',
  botDifficulties: ['rookie', 'rookie', 'rookie'],
  arenaId: QUICK_MATCH_ARENA_ID,
  crowdThrows: false,
};

export const quickMatchPatch = (): Partial<GameSettings> => ({
  ...QUICK_MATCH,
  botDifficulties: [...QUICK_MATCH.botDifficulties],
});

/** The settings a Quick Match overrides for its own match only. */
export const QUICK_MATCH_KEYS = Object.keys(QUICK_MATCH) as (keyof typeof QUICK_MATCH)[];

/**
 * A settings write made while a Quick Match is on: `live` is what the running game shows (everything asked for), `saved`
 * is what may reach the player's saved preferences (the same without the Quick Match's own keys, so those keep the
 * player's own values; anything else, such as sound or camera, is saved as usual).
 */
export function splitQuickWrite(patch: Partial<GameSettings>): { live: Partial<GameSettings>; saved: Partial<GameSettings> } {
  const saved: Partial<GameSettings> = { ...patch };
  for (const k of QUICK_MATCH_KEYS) delete saved[k];
  return { live: patch, saved };
}
