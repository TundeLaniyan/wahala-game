/**
 * Persistent audio preferences: four independent volumes plus the spoken-Pidgin switch.
 *
 * Mute is deliberately NOT stored here: it already lives in the app's `GameSettings.muted` (shared
 * with the HUD mute button), and the app forwards it to `AudioEngine.setMuted`.
 *
 * The store is framework-free (a tiny observable) so the engine, the React settings panel and the
 * tests can all use it. Storage access is injected and every read/write is guarded: private mode,
 * disabled storage or corrupt JSON all fall back to the defaults without throwing.
 */
export interface AudioPrefs {
  /** 0..1 */
  master: number;
  /** Afrobeats background music. */
  music: number;
  /** Lagos street ambience, crowd reactions and spoken Pidgin. */
  ambience: number;
  /** Gameplay sound effects and warnings. */
  sfx: number;
  /** Spoken Pidgin lines on/off (ambient chatter and gameplay reactions). */
  voices: boolean;
}

export const DEFAULT_AUDIO_PREFS: Readonly<AudioPrefs> = {
  master: 0.8,
  music: 0.45,
  ambience: 0.65,
  sfx: 0.85,
  voices: true,
};

export const PREFS_KEY = 'wahala.audio.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PrefsStore {
  get(): Readonly<AudioPrefs>;
  set(patch: Partial<AudioPrefs>): void;
  reset(): void;
  /** Calls `fn` after every change; returns the unsubscribe function. */
  subscribe(fn: (p: Readonly<AudioPrefs>) => void): () => void;
}

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** Validates untrusted (parsed JSON) input; unknown keys are dropped, bad values fall back to defaults. */
export function sanitizePrefs(raw: unknown): AudioPrefs {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AUDIO_PREFS;
  return {
    master: clamp01(o.master, d.master),
    music: clamp01(o.music, d.music),
    ambience: clamp01(o.ambience, d.ambience),
    sfx: clamp01(o.sfx, d.sfx),
    voices: typeof o.voices === 'boolean' ? o.voices : d.voices,
  };
}

export function createPrefsStore(getStorage: () => StorageLike | null | undefined): PrefsStore {
  const read = (): AudioPrefs => {
    try {
      const raw = getStorage()?.getItem(PREFS_KEY);
      return raw ? sanitizePrefs(JSON.parse(raw)) : { ...DEFAULT_AUDIO_PREFS };
    } catch {
      return { ...DEFAULT_AUDIO_PREFS };
    }
  };
  let current = read();
  const listeners = new Set<(p: Readonly<AudioPrefs>) => void>();
  const commit = (next: AudioPrefs): void => {
    current = next;
    try {
      getStorage()?.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable or full: the preference simply lasts for this visit */
    }
    for (const fn of [...listeners]) fn(current);
  };
  return {
    get: () => current,
    set(patch) {
      const next = sanitizePrefs({ ...current, ...patch });
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      commit(next);
    },
    reset: () => commit({ ...DEFAULT_AUDIO_PREFS }),
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

const browserStorage = (): StorageLike | null => {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null; // accessing localStorage can itself throw (sandboxed iframes, blocked cookies)
  }
};

/** The shared app-wide store (reads localStorage once, at first import). */
export const audioPrefs: PrefsStore = createPrefsStore(browserStorage);
