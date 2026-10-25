/**
 * V2 match rulesets. One simulation, configurable rules: every mode is a set of config overrides plus a
 * few switches read by the systems (respawn, rewards, scoring, teams). Nothing here is presentation.
 *
 * - classic:    the 2-4 player standard match. Last standing wins; Wahala Crush is mandatory (the app always
 *               asks for it; `settings.mode = 'classic'` remains only for tutorials and tests).
 * - survival:   City Rumble, last standing, the city closes in, power comes from eliminations (cumulative).
 * - deathmatch: City Rumble, 5 or 10 minutes, respawns with spawn protection, no closing, ranked by
 *               eliminations; elimination rewards last one life.
 * - team:       Deathmatch rules with teams (default Green v White) ranked by team eliminations.
 */
import type { DeepPartial, GameConfig } from './config';
import { ticks } from './config';
import type { ArenaDef } from './arenas/types';
import type { GameKind, MatchSettings } from './types';
import { NO_TEAM } from './types';

export const RUMBLE_MODES: readonly GameKind[] = ['survival', 'deathmatch', 'team'];

export const isRespawnMode = (game: GameKind): boolean => game === 'deathmatch' || game === 'team';
export const isTeamMode = (game: GameKind): boolean => game === 'team';

/** Default length of a respawn-mode match when the settings name none. */
export const DEFAULT_TIMED_SECONDS = 300;

/** Config overrides for a ruleset, merged over the arena's own config (tests may override on top). */
export function modeConfig(settings: MatchSettings, _arena: ArenaDef): DeepPartial<GameConfig> {
  switch (settings.game) {
    case 'classic':
      // eliminated players throw generators in from the sideline (systems/spectators.ts)
      return { spectator: { enabled: true } };
    case 'survival':
      return {
        // crates open routes; power comes from eliminations, credited straight to the eliminator
        pickups: { hiddenChance: 0 },
        drops: { maxDeathDrops: 0 },
        rewards: { enabled: true },
      };
    case 'deathmatch':
    case 'team':
      return {
        match: { durationTicks: ticks(settings.durationSec ?? DEFAULT_TIMED_SECONDS) },
        pickups: { hiddenChance: 0 },
        drops: { maxDeathDrops: 0 },
        rewards: { enabled: true },
        respawn: { enabled: true, resetOnDeath: true },
      };
  }
}

/** Whether the arena closes in under this ruleset (respawn modes never shrink permanently). */
export function modeShrinks(settings: MatchSettings): boolean {
  return !isRespawnMode(settings.game);
}

/** Team of player `id` when the setup names none. */
export function teamFor(settings: MatchSettings, id: number, _count: number): number {
  if (!isTeamMode(settings.game)) return NO_TEAM;
  return id % Math.max(2, settings.teamCount);
}
