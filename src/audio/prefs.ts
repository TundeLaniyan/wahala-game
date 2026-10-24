/**
 * Persistent audio preferences: four independent volumes plus the spoken-Pidgin switch.
 *
 * Mute is deliberately NOT stored here: it already lives in the app's `GameSettings.muted` (shared
 * with the HUD mute button), and the app forwards it to `AudioEngine.setMuted`.
 *
 * The store is framework-free (a tiny observable) so the engine, the React settings panel and the
 * tests can all use it. Storage access is injected and every read/write is guarded: private mode,
 * disabled storage or corrupt JSON all fall back to the defaults without throwing.
 *
 * The defaults are the music-first "recommended mix" (decision M8). Players who never touched the sliders
 * have nothing stored and simply get it. Settings saved under the old key are migrated once: a mix that
 * still equals the old defaults becomes the recommended mix; a mix the player changed is kept, with its
 * music level converted so it sounds exactly as loud as before the music bus changed (LEGACY_MUSIC_BASE).
 * `reset()` restores the recommended mix at any time (the "Recommended mix" button).
 */
import { LEGACY_MUSIC_BASE, MUSIC_BASE } from './buses';

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

/** The recommended, music-first mix (founder: music 90, effects 50, ambience and voices 45, master 85). */
export const DEFAULT_AUDIO_PREFS: Readonly<AudioPrefs> = {
  master: 0.85,
  music: 0.9,
  ambience: 0.45,
  sfx: 0.5,
  voices: true,
};

/** The defaults before the music-first mix; a saved mix equal to these was never really chosen. */
export const LEGACY_DEFAULT_AUDIO_PREFS: Readonly<AudioPrefs> = {
  master: 0.8,
  music: 0.45,
  ambience: 0.65,
  sfx: 0.85,
  voices: true,
};

export const PREFS_KEY = 'wahala.audio.v2';
/** Where the old mix was saved (read once for migration, never written). */
export const LEGACY_PREFS_KEY = 'wahala.audio.v1';

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

const SLIDER_STEP = 0.05;
const sameVolumes = (a: AudioPrefs, b: Readonly<AudioPrefs>): boolean =>
  (['master', 'music', 'ambience', 'sfx'] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

/** Converts a mix saved under the old key (untrusted JSON) to the current meaning of the sliders. */
export function migrateLegacyPrefs(raw: unknown): AudioPrefs {
  const old = sanitizePrefs({
    ...LEGACY_DEFAULT_AUDIO_PREFS,
    ...(typeof raw === 'object' && raw ? raw : {}),
  });
  if (sameVolumes(old, LEGACY_DEFAULT_AUDIO_PREFS)) return { ...DEFAULT_AUDIO_PREFS, voices: old.voices };
  const music = Math.round((old.music * LEGACY_MUSIC_BASE) / MUSIC_BASE / SLIDER_STEP) * SLIDER_STEP;
  return { ...old, music: Math.min(1, Number(music.toFixed(2))) };
}

/** Whether `p` is the recommended mix (voices may be either way). */
export const isRecommendedMix = (p: AudioPrefs): boolean => sameVolumes(p, DEFAULT_AUDIO_PREFS);

export function createPrefsStore(getStorage: () => StorageLike | null | undefined): PrefsStore {
  const read = (): AudioPrefs => {
    try {
      const raw = getStorage()?.getItem(PREFS_KEY);
      return raw ? sanitizePrefs(JSON.parse(raw)) : { ...DEFAULT_AUDIO_PREFS };
    } catch {
      return { ...DEFAULT_AUDIO_PREFS };
    }
  };
  /** The old key's mix, converted, or null when there is none (or no usable storage). */
  const readLegacy = (): AudioPrefs | null => {
    try {
      const storage = getStorage();
      if (!storage || storage.getItem(PREFS_KEY) !== null) return null;
      const raw = storage.getItem(LEGACY_PREFS_KEY);
      return raw ? migrateLegacyPrefs(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  };
  const migrated = readLegacy();
  let current = migrated ?? read();
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
  if (migrated) commit(migrated); // once: from now on the new key is the record
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
