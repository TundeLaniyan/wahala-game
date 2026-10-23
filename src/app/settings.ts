import type { CharacterId, Difficulty, MatchMode } from '../sim';
import type { CameraView, QualityLevel } from '../render';

export interface GameSettings {
  /** Standard arenas: 2-4 competitors (one human). */
  competitors: 2 | 3 | 4;
  /** City Rumble: total competitors (one human plus bots). */
  rumbleCompetitors: 8 | 16 | 24 | 32;
  difficulty: Difficulty;
  character: CharacterId;
  mode: MatchMode;
  arenaId: string;
  crowdThrows: boolean;
  quality: QualityLevel | 'auto';
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  touchControls: 'auto' | 'on' | 'off';
  /** Stadium-mode camera only: the follow camera, or the whole arena. Standard matches ignore it. */
  cameraView: CameraView;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  competitors: 4,
  rumbleCompetitors: 16,
  difficulty: 'medium',
  character: 'streetBaller',
  mode: 'classic',
  arenaId: 'danfoBusPark',
  crowdThrows: false,
  quality: 'auto',
  musicVolume: 0.7,
  sfxVolume: 0.9,
  muted: false,
  touchControls: 'auto',
  cameraView: 'action',
};

const KEY = 'wahala.settings.v1';

export function loadSettings(): GameSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    return { ...DEFAULT_GAME_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) };
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
