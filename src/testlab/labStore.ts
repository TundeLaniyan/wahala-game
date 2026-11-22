/**
 * The Test Lab's own UI state (a small zustand store, apart from the game's `UiState`): which screen of the lab shows,
 * the level chosen per test, the feedback, the test that is running and the player-marker style.
 */
import { create } from 'zustand';
import { DEFAULT_PLAYER_MARKER } from '../render/playerMarker';
import type { PlayerMarkerMode } from '../render/playerMarker';
import type { GameSettings } from '../app/settings';
import { loadFeedback } from './feedback';
import type { FeedbackMap, LabLevel } from './feedback';
import { realSettingsText } from './realSnapshot';
import { defaultRumbleConfig, realSettingsFrom, rumbleConfigOf } from './rumbleSetup';
import type { RumbleLabConfig, RumbleSource } from './rumbleSetup';

export interface LabRun {
  entryId: string;
  level: LabLevel;
}

export interface LabState {
  view: 'home' | 'entry';
  entryId: string | null;
  /** The level picked per test (absent = Normal). */
  levels: Record<string, LabLevel>;
  /** The set-up picked per test that offers several (absent = the first). */
  variants: Record<string, string>;
  feedback: FeedbackMap;
  /** The test started last. Stays set after it ends (the results panel needs it); cleared by "Return to Test Lab". */
  run: LabRun | null;
  marker: PlayerMarkerMode;
  /** The browser refused to keep the feedback (it still lives in this page). */
  feedbackUnsaved: boolean;
  /** The player's real saved settings, read once when the lab opened (null: none saved). Never written back. */
  realSettings: GameSettings | null;
  /** The City Rumble test's set-up (what a normal match would read from the settings). */
  rumble: RumbleLabConfig;
  rumbleSource: RumbleSource;
  /** The Completed Tests list on Home is expanded. */
  completedOpen: boolean;
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The initial lab state (a function: the real-settings snapshot is read when the store is created). */
function initialLab(): LabState {
  const realSettings = realSettingsFrom(realSettingsText());
  return {
    view: 'home',
    entryId: null,
    levels: {},
    variants: {},
    feedback: loadFeedback(storage()),
    run: null,
    marker: DEFAULT_PLAYER_MARKER,
    feedbackUnsaved: false,
    realSettings,
    // parity with a normal match: start from what the player really plays with, else from the game's own defaults
    rumble: realSettings ? rumbleConfigOf(realSettings) : defaultRumbleConfig(),
    rumbleSource: realSettings ? 'current' : 'defaults',
    completedOpen: false,
  };
}

export const useLab = create<LabState>(initialLab);

export const labPatch = (p: Partial<LabState>): void => useLab.setState(p);

export const levelOf = (s: Pick<LabState, 'levels'>, entryId: string): LabLevel =>
  s.levels[entryId] ?? 'normal';

export const variantOf = (s: Pick<LabState, 'variants'>, entryId: string): string | undefined =>
  s.variants[entryId];
