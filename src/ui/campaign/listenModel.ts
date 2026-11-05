/**
 * Pure logic behind a story card's Listen button and Skip / Continue control (unit-tested without React).
 * Narration is optional and fails safely: with no recording the button is disabled and says so, pressing it
 * never errors, the text stays, and Continue / Skip ends the scene even while a clip is "playing".
 */
import type { NarrationProvider, PlayResult } from '../../campaign/narration/types';

export const NOT_RECORDED = 'Narration not recorded yet';

export interface ListenInput {
  /** The `campaignListen` setting: false hides the button. */
  show: boolean;
  /** The provider has a playable clip for this card. */
  available: boolean;
  playing: boolean;
  /** The result of the last press, if any. */
  last: PlayResult | null;
}

export interface ListenView {
  visible: boolean;
  disabled: boolean;
  label: 'Listen' | 'Stop';
  /** A short line beside the button (why it is disabled, or what went wrong); null when there is nothing to say. */
  note: string | null;
  playing: boolean;
}

export function listenView(i: ListenInput): ListenView {
  if (!i.show) return { visible: false, disabled: true, label: 'Listen', note: null, playing: false };
  if (i.playing) return { visible: true, disabled: false, label: 'Stop', note: null, playing: true };
  if (!i.available)
    return {
      visible: true,
      disabled: true,
      label: 'Listen',
      note: i.last?.status === 'locked' ? 'This narration is not unlocked' : NOT_RECORDED,
      playing: false,
    };
  const note =
    i.last?.status === 'failed'
      ? 'The narration could not play. The text is all here.'
      : i.last?.status === 'locked'
        ? 'This narration is not unlocked'
        : null;
  return { visible: true, disabled: false, label: 'Listen', note, playing: false };
}

export interface ListenState {
  playing: boolean;
  last: PlayResult | null;
}

export interface ListenControl {
  state(): ListenState;
  /** Listen / Stop. Never throws and never rejects. */
  press(): Promise<void>;
  /** Stops the clip (leaving the card). */
  stop(): void;
  subscribe(fn: () => void): () => void;
}

/** Plays through a provider that may misbehave: anything it throws or rejects becomes a `failed` result. */
export async function safePlay(provider: NarrationProvider, cardId: string): Promise<PlayResult> {
  try {
    return await provider.play(cardId);
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'narration failed' };
  }
}

const safeAvailable = (provider: NarrationProvider, cardId: string): boolean => {
  try {
    return provider.available(cardId) === true;
  } catch {
    return false;
  }
};

export function createListenControl(provider: NarrationProvider, cardId: string): ListenControl {
  let state: ListenState = { playing: false, last: null };
  let run = 0;
  const listeners = new Set<() => void>();
  const set = (next: ListenState): void => {
    state = next;
    for (const fn of [...listeners]) fn();
  };
  const stopProvider = (): void => {
    try {
      provider.stop();
    } catch {
      /* stopping is always safe */
    }
  };
  return {
    state: () => state,
    async press() {
      if (state.playing) {
        run++;
        stopProvider();
        set({ playing: false, last: { status: 'stopped' } });
        return;
      }
      if (!safeAvailable(provider, cardId)) {
        set({ playing: false, last: { status: 'unavailable', reason: 'no-clip' } });
        return;
      }
      const mine = ++run;
      set({ playing: true, last: null });
      const result = await safePlay(provider, cardId);
      if (mine === run) set({ playing: false, last: result });
    },
    stop() {
      run++;
      stopProvider();
      if (state.playing) set({ playing: false, last: { status: 'stopped' } });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export interface SceneControl {
  /** Ends the scene (Skip / Continue / Enter): stops any narration first. True the first time only. */
  finish(): boolean;
  done(): boolean;
}

/** The scene's exit: always works, fires `onDone` exactly once, and never waits for narration. */
export function createSceneControl(deps: { stopNarration: () => void; onDone: () => void }): SceneControl {
  let done = false;
  return {
    finish() {
      if (done) return false;
      done = true;
      try {
        deps.stopNarration();
      } catch {
        /* narration must never block the scene */
      }
      deps.onDone();
      return true;
    },
    done: () => done,
  };
}
