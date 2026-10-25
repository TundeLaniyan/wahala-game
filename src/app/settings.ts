import { DIFFICULTIES } from '../sim';
import type { CharacterId, Difficulty } from '../sim';
import type { CameraView, QualityLevel } from '../render';

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
  quality: QualityLevel | 'auto';
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
  rumbleArenaId: 'cityRumble',
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
};

const KEY = 'wahala.settings.v1';

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
    return merged;
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
