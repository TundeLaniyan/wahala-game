import { create } from 'zustand';
import type { InputSourceName } from '../input';
import type { CharacterId } from '../sim';
import type { CameraMode, RenderStats } from '../render';
import type { HudSnapshot } from './hud';
import { loadSettings } from './settings';
import type { GameSettings } from './settings';
import type { Subtitle } from './subtitles';

export type Screen = 'title' | 'playing' | 'results';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
  expires: number;
}

/** A screen point in CSS pixels. */
export interface ScreenPoint {
  x: number;
  y: number;
}

export interface MatchSummary {
  /** Index = player id. */
  eliminations: number[];
  survivedSeconds: number;
  localWon: boolean;
}

/** What the How to Play screen shows (null when the tutorial is closed). */
export interface TutorialView {
  /** Index into the tutorial's chapter list. */
  chapter: number;
  mode: 'demo' | 'practice';
  caption: string;
  step: string | null;
  beat: number;
  beats: number;
  /** The demo script has played to the end. */
  finished: boolean;
  practice: {
    goal: string;
    hint: string;
    checks: { label: string; done: boolean }[];
    complete: boolean;
    character: CharacterId;
    characterChoice: boolean;
  } | null;
  /** A short message, e.g. why a practice restarted. */
  notice: string | null;
  /** Bumped on every (re)load so the UI can restart its animations. */
  run: number;
}

export interface UiState {
  screen: Screen;
  settings: GameSettings;
  hud: HudSnapshot | null;
  paused: boolean;
  toasts: Toast[];
  /** The voice line playing now, for the optional subtitles (shown only when settings.subtitles is on). */
  subtitle: Subtitle | null;
  /**
   * The playable board's corners on screen (far-left, far-right, near-right, near-left; renderer
   * `boardScreenCorners`), so the HUD keeps its notices beside the board. Null outside a match.
   */
  board: ScreenPoint[] | null;
  summary: MatchSummary | null;
  device: InputSourceName;
  touchCapable: boolean;
  portrait: boolean;
  stats: RenderStats | null;
  showStats: boolean;
  audioReady: boolean;
  /** Set when the game cannot run at all (e.g. WebGL unavailable). */
  fatal: string | null;
  /** 3D asset preload progress; null once finished or when not applicable. */
  loading: { done: number; total: number } | null;
  /** Bumped when the rendered 3D portraits become available so the UI re-reads them. */
  portraitsVersion: number;
  /** Debug `?cam=stadium`: forces the stadium follow camera; null = chosen per arena. */
  cameraOverride: CameraMode | null;
  /** City Rumble: fast-forwarding to the results after the local player went out. */
  skipping: boolean;
  /** How to Play (tutorial) state; null when it is closed. Never touches `settings`. */
  tutorial: TutorialView | null;
}

/** UI-facing state. The simulation state itself is deliberately NOT stored in React state. */
export const useGameStore = create<UiState>(() => ({
  screen: 'title',
  settings: loadSettings(),
  hud: null,
  paused: false,
  toasts: [],
  subtitle: null,
  board: null,
  summary: null,
  device: 'keyboard',
  touchCapable: false,
  portrait: false,
  stats: null,
  showStats: false,
  audioReady: false,
  fatal: null,
  loading: { done: 0, total: 1 },
  portraitsVersion: 0,
  cameraOverride: null,
  skipping: false,
  tutorial: null,
}));

export const patch = (p: Partial<UiState>): void => useGameStore.setState(p);
