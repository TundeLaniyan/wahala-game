import {
  CHARACTER_IDS,
  DIFFICULTIES,
  EXPERIMENTAL_ARENA_IDS,
  RUMBLE_ARENA_IDS,
  STANDARD_ARENA_IDS,
} from '../sim';
import type { CharacterId, Difficulty } from '../sim';
import { QUALITY_SETTINGS } from '../render/quality';
import type { CameraView, QualitySetting } from '../render';
import { MOVE_ASSIST_SETTINGS } from '../input/moveAssist';
import type { MoveAssistSetting } from '../input/moveAssist';

export type SubtitleMode = 'off' | 'on' | 'large';
export const SUBTITLE_MODES: readonly SubtitleMode[] = ['off', 'on', 'large'];

/** V2: which game the main menu starts. City Rumble is the flagship; Classic Battle the quick 4-player game. */
export type PlayKind = 'rumble' | 'classic';
export type RumbleModeSetting = 'survival' | 'deathmatch' | 'team';
/** V2 camera shake: 'auto' = off on touch devices, subtle on desktop. */
export type ShakeSetting = 'auto' | 'off' | 'subtle';

export interface GameSettings {
  /** V2: the game the Play button starts. */
  play: PlayKind;
  /** Standard arenas: 2-4 competitors (one human). */
  competitors: 2 | 3 | 4;
  /** City Rumble: total competitors (one human plus bots). */
  rumbleCompetitors: 8 | 16 | 24 | 32;
  /** Overall bot level (City Rumble preset; Classic default for every bot). Default Rookie. */
  difficulty: Difficulty;
  /** V2 Classic: the level of each bot (index 0 = bot slot 1); missing entries use `difficulty`. */
  botDifficulties: Difficulty[];
  /** V2 City Rumble: spread the roster around the preset level (mixed-difficulty roster). */
  rumbleMixed: boolean;
  /** V2 City Rumble mode, length (respawn modes) and friendly fire (Team Rumble). */
  rumbleMode: RumbleModeSetting;
  rumbleMinutes: 5 | 10;
  friendlyFire: boolean;
  /** V2 City Rumble stage. */
  rumbleArenaId: string;
  character: CharacterId;
  /** Classic Battle arena (one of the nine standard arenas, or the Mobile Test Arena). */
  arenaId: string;
  crowdThrows: boolean;
  /** Graphics: 'auto' (adaptive, default) or a fixed preset from Very Low to High (render/quality.ts). */
  quality: QualitySetting;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  touchControls: 'auto' | 'on' | 'off';
  /** Stadium-mode camera only: the follow camera, or the whole arena. Standard matches ignore it. */
  cameraView: CameraView;
  /** Subtitles for the voice line playing now (beside the board, never over it): off (default), on, or large text. */
  subtitles: SubtitleMode;
  /** V2: camera shake (mobile default off). */
  shake: ShakeSetting;
  /** V2: tutorial narration (approved voice clips) on/off. */
  narration: boolean;
  /** Rumble Evolution: assisted movement (decisions RE-A). Auto = on for touch, the plain corner buffer with keyboard / gamepad. */
  moveAssist: MoveAssistSetting;
  /** Rumble Evolution experiment (decision RE-L2): City Rumble blast shape, radial (default) or the Classic cross. */
  rumbleBlast: 'radial' | 'cross';
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  play: 'rumble',
  competitors: 4,
  rumbleCompetitors: 16,
  difficulty: 'rookie',
  botDifficulties: ['rookie', 'rookie', 'rookie'],
  rumbleMixed: false,
  rumbleMode: 'survival',
  rumbleMinutes: 5,
  friendlyFire: false,
  rumbleArenaId: 'rumbleOshodi',
  character: 'streetBaller',
  arenaId: 'danfoBusPark',
  crowdThrows: false,
  quality: 'auto',
  musicVolume: 0.7,
  sfxVolume: 0.9,
  muted: false,
  touchControls: 'auto',
  cameraView: 'action',
  subtitles: 'off',
  shake: 'auto',
  narration: true,
  moveAssist: 'auto',
  rumbleBlast: 'radial',
};

export const SETTINGS_KEY = 'wahala.settings.v1';
const KEY = SETTINGS_KEY;

/** City Rumble roster sizes offered by the menu. */
export const RUMBLE_SIZES = [8, 16, 24, 32] as const;

/**
 * The device / presentation preferences (Settings screen), as opposed to the match setup. "Restore
 * defaults" resets exactly these; the chosen game, fighter, arena and bots are never touched by it.
 */
export const PREFERENCE_KEYS = [
  'quality',
  'touchControls',
  'cameraView',
  'subtitles',
  'shake',
  'narration',
  'muted',
  'moveAssist',
] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export function preferenceDefaults(): Pick<GameSettings, PreferenceKey> {
  const d = DEFAULT_GAME_SETTINGS;
  return {
    quality: d.quality,
    touchControls: d.touchControls,
    cameraView: d.cameraView,
    subtitles: d.subtitles,
    shake: d.shake,
    narration: d.narration,
    muted: d.muted,
    moveAssist: d.moveAssist,
  };
}

const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/**
 * Repairs any value the menu could not have produced (an old or hand-edited save, a removed arena) so a
 * match can always start: each bad field falls back to its default, valid fields are kept.
 */
export function sanitizeSettings(s: GameSettings): GameSettings {
  const d = DEFAULT_GAME_SETTINGS;
  const classicArenas = [...STANDARD_ARENA_IDS, ...EXPERIMENTAL_ARENA_IDS];
  const difficulty = migrateDifficulty(s.difficulty, d.difficulty);
  const bots = Array.isArray(s.botDifficulties) ? s.botDifficulties : [];
  return {
    ...s,
    play: oneOf(s.play, ['rumble', 'classic'] as const, d.play),
    competitors: oneOf(s.competitors, [2, 3, 4] as const, d.competitors),
    rumbleCompetitors: oneOf(s.rumbleCompetitors, RUMBLE_SIZES, d.rumbleCompetitors),
    difficulty,
    botDifficulties: [0, 1, 2].map((i) => migrateDifficulty(bots[i], difficulty)),
    rumbleMixed: bool(s.rumbleMixed, d.rumbleMixed),
    rumbleMode: oneOf(s.rumbleMode, ['survival', 'deathmatch', 'team'] as const, d.rumbleMode),
    rumbleMinutes: oneOf(s.rumbleMinutes, [5, 10] as const, d.rumbleMinutes),
    friendlyFire: bool(s.friendlyFire, d.friendlyFire),
    rumbleArenaId: oneOf(s.rumbleArenaId, RUMBLE_ARENA_IDS, RUMBLE_ARENA_IDS[0] ?? d.rumbleArenaId),
    character: oneOf(s.character, CHARACTER_IDS, d.character),
    arenaId: oneOf(s.arenaId, classicArenas, d.arenaId),
    crowdThrows: bool(s.crowdThrows, d.crowdThrows),
    quality: oneOf(s.quality, QUALITY_SETTINGS, d.quality),
    muted: bool(s.muted, d.muted),
    touchControls: oneOf(s.touchControls, ['auto', 'on', 'off'] as const, d.touchControls),
    cameraView: oneOf(s.cameraView, ['action', 'overview'] as const, d.cameraView),
    subtitles: oneOf(s.subtitles, SUBTITLE_MODES, 'off'),
    shake: oneOf(s.shake, ['auto', 'off', 'subtle'] as const, d.shake),
    narration: bool(s.narration, d.narration),
    moveAssist: oneOf(s.moveAssist, MOVE_ASSIST_SETTINGS, d.moveAssist),
    rumbleBlast: oneOf(s.rumbleBlast, ['radial', 'cross'] as const, d.rumbleBlast),
  };
}

/** Whether a player has played or set something up before (offers the "Quick play" shortcut). */
export function hasSavedSettings(): boolean {
  try {
    return !!globalThis.localStorage?.getItem(KEY);
  } catch {
    return false;
  }
}

/** Pre-V2 saved levels map onto the nearest V2 level (never silently to Rookie). */
const LEGACY_DIFFICULTY: Readonly<Record<string, Difficulty>> = {
  easy: 'beginner',
  medium: 'standard',
  hard: 'expert',
};

export function migrateDifficulty(value: unknown, fallback: Difficulty): Difficulty {
  if (typeof value !== 'string') return fallback;
  if ((DIFFICULTIES as readonly string[]).includes(value)) return value as Difficulty;
  return LEGACY_DIFFICULTY[value] ?? fallback;
}

export function loadSettings(): GameSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    const saved = JSON.parse(raw) as Partial<GameSettings> & { mode?: unknown; arenaId?: string };
    const merged = { ...DEFAULT_GAME_SETTINGS, ...saved };
    if (!SUBTITLE_MODES.includes(merged.subtitles)) merged.subtitles = 'off';
    merged.difficulty = migrateDifficulty(saved.difficulty, DEFAULT_GAME_SETTINGS.difficulty);
    const bots = Array.isArray(saved.botDifficulties) ? saved.botDifficulties : [];
    merged.botDifficulties = [0, 1, 2].map((i) => migrateDifficulty(bots[i], merged.difficulty));
    // pre-V2 saves kept City Rumble in `arenaId` and a Classic Timer / Wahala Crush choice in `mode`
    if (saved.arenaId === 'cityRumble') {
      merged.arenaId = DEFAULT_GAME_SETTINGS.arenaId;
      merged.play = 'rumble';
    }
    delete (merged as { mode?: unknown }).mode;
    return sanitizeSettings(merged);
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode): settings simply do not persist */
  }
}
