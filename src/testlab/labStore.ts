/**
 * The Test Lab's own UI state (a small zustand store, apart from the game's `UiState`): which screen of the lab shows,
 * the level chosen per test, the feedback, the test that is running and the player-marker style.
 */
import { create } from 'zustand';
import { DEFAULT_PLAYER_MARKER } from '../render/playerMarker';
import type { PlayerMarkerMode } from '../render/playerMarker';
import { loadFeedback } from './feedback';
import type { FeedbackMap, LabLevel } from './feedback';

export interface LabRun {
  entryId: string;
  level: LabLevel;
}

export interface LabState {
  view: 'home' | 'entry';
  entryId: string | null;
  /** The level picked per test (absent = Normal). */
  levels: Record<string, LabLevel>;
  feedback: FeedbackMap;
  /** The test started last. Stays set after it ends (the results panel needs it); cleared by "Return to Test Lab". */
  run: LabRun | null;
  marker: PlayerMarkerMode;
  /** The browser refused to keep the feedback (it still lives in this page). */
  feedbackUnsaved: boolean;
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const useLab = create<LabState>(() => ({
  view: 'home',
  entryId: null,
  levels: {},
  feedback: loadFeedback(storage()),
  run: null,
  marker: DEFAULT_PLAYER_MARKER,
  feedbackUnsaved: false,
}));

export const labPatch = (p: Partial<LabState>): void => useLab.setState(p);

export const levelOf = (s: Pick<LabState, 'levels'>, entryId: string): LabLevel =>
  s.levels[entryId] ?? 'normal';
