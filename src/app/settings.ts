import { ARENAS, DEFAULT_ARENA_ID } from '../sim';
import type { CharacterId, Difficulty, MatchMode } from '../sim';
import type { QualityLevel } from '../render';

export interface GameSettings {
  competitors: 2 | 3 | 4;
  difficulty: Difficulty;
  character: CharacterId;
  mode: MatchMode;
  arenaId: string;
  crowdThrows: boolean;
  floorHazards: boolean;
  quality: QualityLevel | 'auto';
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  touchControls: 'auto' | 'on' | 'off';
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  competitors: 4,
  difficulty: 'medium',
  character: 'streetBaller',
  mode: 'classic',
  arenaId: 'danfoBusPark',
  crowdThrows: false,
  floorHazards: false,
  quality: 'auto',
  musicVolume: 0.7,
  sfxVolume: 0.9,
  muted: false,
  touchControls: 'auto',
};

const KEY = 'wahala.settings.v1';

export function loadSettings(): GameSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    return migrateSettings({ ...DEFAULT_GAME_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) });
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

/**
 * Repairs stored settings from older builds. "Lekki Roadworks" used to be listed as its own arena but was
 * the bus park layout with floor traps; the trap arena is now Balogun Market, so it maps there with the
 * traps option on. Unknown arenas fall back to the default.
 */
export function migrateSettings(settings: GameSettings): GameSettings {
  if (settings.arenaId === 'lekkiRoadworks')
    return { ...settings, arenaId: 'balogunMarket', floorHazards: true };
  if (!(settings.arenaId in ARENAS)) return { ...settings, arenaId: DEFAULT_ARENA_ID };
  return settings;
}

export function saveSettings(settings: GameSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode): settings simply do not persist */
  }
}
