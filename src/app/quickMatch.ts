/**
 * Quick Start (Choose How to Play, "START HERE"): an offline CITY RUMBLE Free-for-All in one tap (founder instruction,
 * decision FU2-1, which replaced the beginner Classic match of SX11): 16 fighters including the human, Rookie bots, the
 * three-minute clock, on one existing verified Rumble stage. Pure data (unit-tested): it only sets the real
 * `GameSettings` an ordinary City Rumble Free-for-All already reads, so the match is the same ruleset, HUD, crowd and
 * stadium camera as choosing City Rumble from the menu, with no special rules.
 *
 * The player's fighter, audio, controls (movement, touch layout, camera, shake) and graphics-quality preferences are never
 * touched, and neither are their saved match preferences: the values below are TEMPORARY (decision SX11, kept). `session.ts`
 * holds them over the saved settings only until the player is back at the menu, and never writes them to storage
 * (`splitQuickWrite` keeps them out of every save made meanwhile). The regular City Rumble setup is unchanged and still
 * offers up to 32 fighters.
 */
import type { GameSettings } from './settings';

/**
 * The stage: Ojuelegba Underbridge, the smallest and quietest of the seven verified Rumble boards (decision FU2-2): 45 x 33
 * tiles (1,485, half of Oshodi's 2,961), three stage hazards (the fewest) and 33 floor traps. 16 fighters meet often on it
 * (a rival within 6 tiles in about 85 % of alive samples, against 72 % on Oshodi), which suits a three-minute first match.
 */
export const QUICK_MATCH_ARENA_ID = 'rumbleOjuelegba';

/** Total fighters including the human (15 Rookie bots). */
export const QUICK_MATCH_FIGHTERS = 16;
/** The match length in minutes: the shorter of the two lengths the Free-for-All offers. */
export const QUICK_MATCH_MINUTES = 3;

export const QUICK_MATCH: Pick<
  GameSettings,
  | 'play'
  | 'rumbleMode'
  | 'rumbleCompetitors'
  | 'rumbleMinutes'
  | 'difficulty'
  | 'rumbleMixed'
  | 'rumbleArenaId'
> = {
  play: 'rumble',
  rumbleMode: 'deathmatch', // the sim's id for the player-facing "Free-for-All"
  rumbleCompetitors: QUICK_MATCH_FIGHTERS,
  rumbleMinutes: QUICK_MATCH_MINUTES,
  difficulty: 'rookie',
  rumbleMixed: false, // every bot at Rookie, never a spread around it
  rumbleArenaId: QUICK_MATCH_ARENA_ID,
};

export const quickMatchPatch = (): Partial<GameSettings> => ({ ...QUICK_MATCH });

/** The settings a Quick Start overrides for its own match only. */
export const QUICK_MATCH_KEYS = Object.keys(QUICK_MATCH) as (keyof typeof QUICK_MATCH)[];

/**
 * A settings write made while a Quick Start is on: `live` is what the running game shows (everything asked for), `saved`
 * is what may reach the player's saved preferences (the same without the Quick Start's own keys, so those keep the
 * player's own values; anything else, such as sound or camera, is saved as usual).
 */
export function splitQuickWrite(patch: Partial<GameSettings>): {
  live: Partial<GameSettings>;
  saved: Partial<GameSettings>;
} {
  const saved: Partial<GameSettings> = { ...patch };
  for (const k of QUICK_MATCH_KEYS) delete saved[k];
  return { live: patch, saved };
}
