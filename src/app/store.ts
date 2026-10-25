import { create } from 'zustand';
import type { InputSourceName } from '../input';
import type { CharacterId } from '../sim';
import type { CameraMode, RenderStats } from '../render';
import type { HudSnapshot } from './hud';
import { MENU_HOME } from './menu';
import type { MenuState } from './menu';
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
  /** Credited eliminations (sim `player.stats.kills`), index = player id. */
  eliminations: number[];
  /** The local player's deaths and assists (respawn modes show them). */
  deaths: number;
  assists: number;
  /** Seconds survived (respawn modes: the seconds played). */
  survivedSeconds: number;
  /** The local player won, or (Team Rumble) the local player's team won. */
  localWon: boolean;
}

/** What the Training Academy screen shows (null when it is closed). Owned by app/TutorialController. */
export interface TutorialView {
  /** Index into the Academy's lesson list. */
  lesson: number;
  lessonId: string;
  /** 'demo' = step 2 (the demonstration plays by itself); 'practice' = the human's attempt. */
  mode: 'demo' | 'practice';
  caption: string;
  step: string | null;
  beat: number;
  beats: number;
  /** The demo script has played to the end. */
  finished: boolean;
  practice: {
    tasks: { id: string; label: string; done: boolean }[];
    /** Index of the active task (== tasks.length once complete). */
    current: number;
    /** The active task's instruction, with device tokens ({A}, {B}, {holdB}, {move}) still to fill in. */
    instruction: string;
    /** Controls the active task is about (legend / touch highlights). */
    controls: string[];
    /** The latest corrective tip, or why the attempt failed. */
    guidance: string | null;
    /** The attempt failed and is about to restart from the latest checkpoint. */
    failed: boolean;
    /** Retries so far. */
    attempts: number;
    complete: boolean;
    character: CharacterId;
    characterChoice: boolean;
  } | null;
  /** A short message (praise for a finished task, lesson complete ...). */
  notice: string | null;
  /** Bumped on every (re)load so the UI can restart its animations. */
  run: number;
  /** Lesson ids completed / explicitly skipped on this device. */
  completed: string[];
  skipped: string[];
  /** The current lesson may be left forwards (completed or explicitly skipped). */
  canAdvance: boolean;
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
  /** Main-menu navigation (app/menu.ts): which menu screen shows while `screen` is 'title'. */
  menu: MenuState;
  /** The pause menu's Settings panel is open (Esc / Start close it instead of resuming). */
  pauseSettings: boolean;
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
  menu: MENU_HOME,
  pauseSettings: false,
}));

export const patch = (p: Partial<UiState>): void => useGameStore.setState(p);
