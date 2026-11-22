/**
 * The Test Lab's City Rumble set-up (docs/TEST_LAB.md, decision TL6). A lab City Rumble is the normal match: same
 * `commands.start`, same `buildMatchOptions`; the only thing that can differ is the SETTINGS it starts with. The first lab
 * entry mapped Easy / Normal / Hard to Beginner / Casual / Standard bots, while a normal match defaults to Rookie, which
 * is why the lab felt much harder. Now the lab holds the same fields a normal match reads (`RumbleLabConfig`), can copy
 * them from the player's real saved settings ("Use Current Rumble Settings") and shows exactly what it will start.
 * Pure and unit-tested: no store, no DOM.
 */
import { DEFAULT_GAME_SETTINGS, RUMBLE_SIZES, parseSettings } from '../app/settings';
import type { GameSettings } from '../app/settings';
import { botDifficulty, competitorCount, matchArenaId } from '../app/names';
import { RUMBLE_MODE_INFO, difficultyLabel, setupSummary } from '../app/setupSummary';
import { CHARACTERS, DIFFICULTIES, RUMBLE_ARENA_IDS, getArena } from '../sim';

/** The match-defining fields of a City Rumble (what the normal menu's Arena, Fighter and Settings screens edit). */
export const RUMBLE_MATCH_KEYS = [
  'rumbleArenaId',
  'rumbleCompetitors',
  'difficulty',
  'rumbleMixed',
  'rumbleMode',
  'rumbleMinutes',
  'friendlyFire',
  'crowdThrows',
  'character',
] as const;

/** Presentation and control fields that change how a Rumble PLAYS for the person holding the phone (never its rules). */
export const RUMBLE_FEEL_KEYS = ['cameraView', 'moveAssist', 'moveStyle', 'controlSize'] as const;

export type RumbleLabConfig = Pick<GameSettings, (typeof RUMBLE_MATCH_KEYS)[number]> &
  Pick<GameSettings, (typeof RUMBLE_FEEL_KEYS)[number]>;

const KEYS = [...RUMBLE_MATCH_KEYS, ...RUMBLE_FEEL_KEYS] as const;

/** Where the lab's current set-up came from. */
export type RumbleSource = 'current' | 'defaults' | 'custom';

/** The Rumble fields of `settings` (a copy). */
export function rumbleConfigOf(settings: GameSettings): RumbleLabConfig {
  const out = {} as Record<string, unknown>;
  for (const k of KEYS) out[k] = settings[k];
  return out as unknown as RumbleLabConfig;
}

/** `base` with the Rumble set-up applied and City Rumble chosen (everything else - audio, quality - stays as it is). */
export function applyRumbleConfig(base: GameSettings, config: RumbleLabConfig): GameSettings {
  return { ...base, ...config, play: 'rumble' };
}

export function sameRumbleConfig(a: RumbleLabConfig, b: RumbleLabConfig): boolean {
  return KEYS.every((k) => a[k] === b[k]);
}

/** What the player's real saved settings were when the lab opened (null: none saved, or the storage was unreadable). */
export function realSettingsFrom(text: string | null): GameSettings | null {
  return text === null ? null : parseSettings(text);
}

export function defaultRumbleConfig(): RumbleLabConfig {
  return rumbleConfigOf(DEFAULT_GAME_SETTINGS);
}

/** The levels the bots of this set-up actually get (the preset, or its spread with the mixed roster). */
export function botLevels(config: RumbleLabConfig): { lowest: string; highest: string } {
  const settings = applyRumbleConfig(DEFAULT_GAME_SETTINGS, config);
  const levels = Array.from({ length: competitorCount(settings) - 1 }, (_, i) =>
    DIFFICULTIES.indexOf(botDifficulty(settings, i + 1)),
  );
  return {
    lowest: difficultyLabel(DIFFICULTIES[Math.min(...levels)]!),
    highest: difficultyLabel(DIFFICULTIES[Math.max(...levels)]!),
  };
}

export interface ConfigLine {
  label: string;
  value: string;
}

/** The exact configuration, line by line (shown before Start, and nothing is hidden or defaulted behind it). */
export function describeRumbleConfig(config: RumbleLabConfig): ConfigLine[] {
  const settings = applyRumbleConfig(DEFAULT_GAME_SETTINGS, config);
  const arena = getArena(matchArenaId(settings));
  const n = competitorCount(settings);
  const mode = RUMBLE_MODE_INFO.find((m) => m.id === config.rumbleMode)!;
  const bots = botLevels(config);
  const levels =
    bots.lowest === bots.highest
      ? `${bots.lowest}${config.rumbleMixed ? ' (mixed roster)' : ''}`
      : `${bots.lowest} to ${bots.highest} (mixed roster around ${difficultyLabel(config.difficulty)})`;
  const lines: ConfigLine[] = [
    { label: 'Mode', value: mode.name },
    { label: 'Stage', value: arena.name.replace(/^WAHALA! /, '') },
    {
      label: 'Fighters',
      value:
        config.rumbleMode === 'team'
          ? `${n} (${Math.floor(n / 2)} v ${n - Math.floor(n / 2)}, you and ${n - 1} bots)`
          : `${n} (you and ${n - 1} bots)`,
    },
    { label: 'Bot level', value: levels },
    {
      label: 'Duration',
      value:
        config.rumbleMode === 'survival' ? 'No clock (last one standing)' : `${config.rumbleMinutes} min`,
    },
    { label: 'Your fighter', value: CHARACTERS[config.character].name },
  ];
  if (config.rumbleMode === 'team')
    lines.push({ label: 'Friendly fire', value: config.friendlyFire ? 'On' : 'Off' });
  if (config.crowdThrows) lines.push({ label: 'Crowd throws', value: 'On' });
  lines.push(
    {
      label: 'Camera and controls',
      value: `${config.cameraView === 'overview' ? 'whole stage' : 'follow camera'}, assist ${config.moveAssist}, ${config.moveStyle} movement, ${config.controlSize} buttons`,
    },
    { label: 'Seed', value: 'random each start (the normal game does the same; ?seed=N fixes it)' },
  );
  return lines;
}

/** One line for feedback and the card title, the same text the normal menu shows under Play. */
export function rumbleSummaryLine(config: RumbleLabConfig): string {
  return setupSummary(applyRumbleConfig(DEFAULT_GAME_SETTINGS, config));
}

export const RUMBLE_LAB_SIZES = RUMBLE_SIZES;
export const RUMBLE_LAB_LEVELS = DIFFICULTIES;
export const RUMBLE_LAB_ARENAS = RUMBLE_ARENA_IDS;
export const RUMBLE_LAB_MODES = RUMBLE_MODE_INFO;
