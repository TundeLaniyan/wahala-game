/**
 * V2 match rulesets. One simulation, configurable rules: every mode is a set of config overrides plus a
 * few switches read by the systems (respawn, rewards, scoring, teams). Nothing here is presentation.
 *
 * Player-facing names (decision MD1): deathmatch = Free-for-All (the default), team = Team Deathmatch,
 * survival = Last Player Standing. Capture the Flag and multi-team battles are planned modes only (docs).
 *
 * - classic:    the 2-4 player standard match. Last standing wins; Wahala Crush is mandatory (the app always
 *               asks for it; `settings.mode = 'classic'` remains only for tutorials and tests).
 * - survival:   City Rumble, last standing, the city closes in, power comes from eliminations (cumulative).
 * - deathmatch: City Rumble, 5 or 10 minutes, respawns with spawn protection, no closing, ranked by
 *               eliminations; elimination rewards last one life.
 * - team:       Deathmatch rules with teams (default Green v White) ranked by team eliminations.
 * - mission:    a campaign mission (src/sim/mission): the Rumble economy on a district stage, no closing, no hidden
 *               pickups, the human respawns until the mission's lives are spent, the crew never respawns; the
 *               end of the match belongs to the mission runtime (win / lose / timeout), not to kills or the clock.
 *
 * | rule              | classic | survival | deathmatch | team       |
 * | ----------------- | ------- | -------- | ---------- | ---------- |
 * | win               | last    | last     | most kills | team kills |
 * | respawn           | no      | no       | yes        | yes        |
 * | closing (crush)   | yes     | yes      | no         | no         |
 * | hidden pickups    | yes     | no       | no         | no         |
 * | elimination power | no      | kept     | per life   | per life   |
 * | teams             | no      | no       | no         | 2 (or more)|
 */
import type { DeepPartial, GameConfig } from './config';
import { CAMPAIGN_CONFIG, RUMBLE_ECONOMY, ticks } from './config';
import type { ArenaDef } from './arenas/types';
import type { GameKind, MatchSettings, TilePos } from './types';
import type { BombRule } from './campaign/types';
import { NO_TEAM } from './types';

export const RUMBLE_MODES: readonly GameKind[] = ['survival', 'deathmatch', 'team'];

/**
 * Bomb geometry by ruleset (docs/CAMPAIGN_EXPANSION_PLAN.md section 2). There is NO player-facing toggle: the ruleset
 * decides. Exhaustive on purpose: a new GameKind does not compile until it names its rule, so a future mission format
 * can never silently inherit the wrong bomb. Radial = the Rumble disc; cross = the classic plus.
 */
export const BLAST_RULE_BY_GAME: Readonly<Record<GameKind, BombRule>> = {
  classic: 'cross', // Classic Battle (standard arenas)
  survival: 'radial', // City Rumble and multiplayer
  deathmatch: 'radial',
  team: 'radial',
  mission: 'radial', // campaign field missions (the City Rumble district arenas)
  raid: 'cross', // classic raids (compact fixed-screen missions)
};

export const isRespawnMode = (game: GameKind): boolean => game === 'deathmatch' || game === 'team';
export const isTeamMode = (game: GameKind): boolean => game === 'team';

/** Default length of a respawn-mode match when the settings name none. */
export const DEFAULT_TIMED_SECONDS = 300;
/** The match lengths the menu offers for the respawn modes. */
export const TIMED_MINUTES: readonly number[] = [3, 5];

/** Team names in team-index order (0 = Green, 1 = White; more teams only for tests / future menus). */
export const TEAM_NAMES: readonly string[] = ['Green', 'White', 'Gold', 'Red'];

/**
 * The bomb geometry a ruleset plays with, as config overrides (decision CC2). Radial = the whole Rumble economy
 * (the disc, two starting generators, rewards ...), unchanged for Survival / Deathmatch / Team and field missions.
 * Cross = the classic plus: the config default, kept explicit here; an arena that widens the cross itself (the
 * Power Yard's full-line blast) keeps its own non-radial shape. Looked up in `BLAST_RULE_BY_GAME`, never a setting.
 */
export function blastConfig(game: GameKind, arena: ArenaDef): DeepPartial<GameConfig> {
  if (BLAST_RULE_BY_GAME[game] === 'radial') return RUMBLE_ECONOMY;
  const own = arena.config?.generator?.blastMode;
  return { generator: { blastMode: own === 'fullLine' ? 'fullLine' : 'plus' } };
}

/** Config overrides for a ruleset, merged over the arena's own config (tests may override on top). */
export function modeConfig(settings: MatchSettings, arena: ArenaDef): DeepPartial<GameConfig> {
  const blast = blastConfig(settings.game, arena);
  switch (settings.game) {
    case 'classic':
      // eliminated players throw generators in from the sideline (systems/spectators.ts)
      return { ...blast, spectator: { enabled: true } };
    case 'survival':
      return {
        // crates open routes; power comes from eliminations, credited straight to the eliminator
        ...blast,
        pickups: { hiddenChance: 0 },
        drops: { maxDeathDrops: 0 },
      };
    case 'deathmatch':
    case 'team':
      return {
        ...blast,
        match: { durationTicks: ticks(settings.durationSec ?? DEFAULT_TIMED_SECONDS) },
        pickups: { hiddenChance: 0 },
        drops: { maxDeathDrops: 0 },
        respawn: { enabled: true, resetOnDeath: true },
      };
    case 'mission':
      // the clock and the crate density come from the mission (mission/build.ts); who respawns is decided by
      // the mission runtime (the human only, while lives last)
      return {
        ...blast,
        campaign: CAMPAIGN_CONFIG,
        pickups: { hiddenChance: 0 },
        drops: { maxDeathDrops: 0 },
        respawn: { enabled: true, resetOnDeath: true },
      };
    case 'raid':
      // placeholder ruleset (raid-sim owns the real one): the classic plus (cross), no hidden pickups, no crush
      // (modeShrinks); the raid runtime decides lives and who respawns
      return { ...blast, campaign: CAMPAIGN_CONFIG, pickups: { hiddenChance: 0 }, drops: { maxDeathDrops: 0 } };
  }
}

/** Whether the arena closes in under this ruleset (respawn modes never shrink permanently). */
export function modeShrinks(settings: MatchSettings): boolean {
  return settings.game !== 'mission' && settings.game !== 'raid' && !isRespawnMode(settings.game);
}

/**
 * Team of every competitor (index = player id = spawn index), or NO_TEAM outside Team Rumble.
 *
 * Teams start apart: with two teams the competitors' spawn tiles are split down the middle of the map
 * (west half Green, east half White, ties by row then index); with more teams they are split into
 * angular sectors around the centre. Sizes differ by at most one. Player 0 (the human) spawns in the
 * south-west on every Rumble stage, so the human is Green by default.
 */
export function assignTeams(settings: MatchSettings, arena: ArenaDef, count: number): number[] {
  if (!isTeamMode(settings.game)) return Array.from({ length: count }, () => NO_TEAM);
  const teams = Math.max(2, Math.min(settings.teamCount, count));
  const spawns = arena.spawns.slice(0, count);
  const width = arena.layout[0]?.length ?? 0;
  const height = arena.layout.length;
  const order = spawns.map((_, i) => i);
  if (teams === 2) {
    order.sort((a, b) => spawns[a]!.x - spawns[b]!.x || spawns[a]!.y - spawns[b]!.y || a - b);
  } else {
    const angle = (s: TilePos): number => Math.atan2(s.y - (height - 1) / 2, s.x - (width - 1) / 2);
    order.sort((a, b) => angle(spawns[a]!) - angle(spawns[b]!) || a - b);
  }
  const out = Array.from({ length: count }, () => NO_TEAM);
  order.forEach((id, rank) => {
    out[id] = Math.min(teams - 1, Math.floor((rank * teams) / count));
  });
  return out;
}

/** Team of player `id` when the setup names none (see `assignTeams`). */
export function teamFor(settings: MatchSettings, id: number, count: number, arena: ArenaDef): number {
  return assignTeams(settings, arena, count)[id] ?? NO_TEAM;
}

/**
 * Home of a team: the centre of its members' starting spawns (respawns prefer this side). Null when the
 * team has nobody.
 */
export function teamHome(
  arena: ArenaDef,
  players: readonly { team: number }[],
  team: number,
): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let n = 0;
  players.forEach((p, i) => {
    const s = arena.spawns[i];
    if (p.team !== team || !s) return;
    x += s.x;
    y += s.y;
    n++;
  });
  return n > 0 ? { x: x / n, y: y / n } : null;
}
