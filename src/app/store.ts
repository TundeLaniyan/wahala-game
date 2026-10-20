import { create } from 'zustand';
import type { InputSourceName } from '../input';
import type { RenderStats } from '../render';
import type { HudSnapshot } from './hud';
import type { CrowdCaptionLine } from './ports';
import { loadSettings } from './settings';
import type { GameSettings } from './settings';

export type Screen = 'title' | 'playing' | 'results';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
  expires: number;
}

export interface Caption extends CrowdCaptionLine {
  id: number;
  expires: number;
}

export interface MatchSummary {
  /** Index = player id. */
  eliminations: number[];
  survivedSeconds: number;
  localWon: boolean;
}

export interface UiState {
  screen: Screen;
  settings: GameSettings;
  hud: HudSnapshot | null;
  paused: boolean;
  toasts: Toast[];
  captions: Caption[];
  summary: MatchSummary | null;
  device: InputSourceName;
  touchCapable: boolean;
  portrait: boolean;
  stats: RenderStats | null;
  showStats: boolean;
  audioReady: boolean;
  /** Set when the game cannot run at all (e.g. WebGL unavailable). */
  fatal: string | null;
}

/** UI-facing state. The simulation state itself is deliberately NOT stored in React state. */
export const useGameStore = create<UiState>(() => ({
  screen: 'title',
  settings: loadSettings(),
  hud: null,
  paused: false,
  toasts: [],
  captions: [],
  summary: null,
  device: 'keyboard',
  touchCapable: false,
  portrait: false,
  stats: null,
  showStats: false,
  audioReady: false,
  fatal: null,
}));

export const patch = (p: Partial<UiState>): void => useGameStore.setState(p);
