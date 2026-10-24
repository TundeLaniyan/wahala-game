import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AUDIO_PREFS,
  LEGACY_DEFAULT_AUDIO_PREFS,
  LEGACY_PREFS_KEY,
  PREFS_KEY,
  createPrefsStore,
  isRecommendedMix,
  migrateLegacyPrefs,
  sanitizePrefs,
} from '../../src/audio/prefs';
import { LEGACY_MUSIC_BASE, MUSIC_BASE } from '../../src/audio/buses';
import type { StorageLike } from '../../src/audio/prefs';

const memory = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
};

describe('audio preferences', () => {
  it('a new player gets the music-first mix: master 85 / music 90 / ambience and voices 45 / effects 50', () => {
    expect(DEFAULT_AUDIO_PREFS).toEqual({
      master: 0.85,
      music: 0.9,
      ambience: 0.45,
      sfx: 0.5,
      voices: true,
    });
    expect(createPrefsStore(() => memory()).get()).toEqual(DEFAULT_AUDIO_PREFS);
  });

  it('every volume changes independently of the others', () => {
    const s = createPrefsStore(() => memory());
    s.set({ music: 0.1 });
    expect(s.get()).toEqual({ ...DEFAULT_AUDIO_PREFS, music: 0.1 });
    s.set({ sfx: 1 });
    s.set({ ambience: 0 });
    s.set({ master: 0.3 });
    expect(s.get()).toEqual({ master: 0.3, music: 0.1, ambience: 0, sfx: 1, voices: true });
  });

  it('remembers choices between visits (a new store over the same storage)', () => {
    const storage = memory();
    const first = createPrefsStore(() => storage);
    first.set({ master: 0.2, music: 0.9, ambience: 0.35, sfx: 0.55, voices: false });
    expect(JSON.parse(storage.data[PREFS_KEY]!)).toEqual({
      master: 0.2,
      music: 0.9,
      ambience: 0.35,
      sfx: 0.55,
      voices: false,
    });
    const later = createPrefsStore(() => storage);
    expect(later.get()).toEqual({ master: 0.2, music: 0.9, ambience: 0.35, sfx: 0.55, voices: false });
  });

  it('clamps out-of-range values and ignores junk', () => {
    expect(
      sanitizePrefs({ master: 5, music: -1, ambience: Number.NaN, sfx: '0.2', voices: 'yes', extra: 1 }),
    ).toEqual({
      master: 1,
      music: 0,
      ambience: DEFAULT_AUDIO_PREFS.ambience,
      sfx: DEFAULT_AUDIO_PREFS.sfx,
      voices: true,
    });
    expect(sanitizePrefs(null)).toEqual(DEFAULT_AUDIO_PREFS);
    expect(sanitizePrefs('nope')).toEqual(DEFAULT_AUDIO_PREFS);
  });

  it('survives corrupt JSON, unavailable storage and a storage that throws on write', () => {
    expect(createPrefsStore(() => memory({ [PREFS_KEY]: '{not json' })).get()).toEqual(DEFAULT_AUDIO_PREFS);
    expect(createPrefsStore(() => null).get()).toEqual(DEFAULT_AUDIO_PREFS);
    const full: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const s = createPrefsStore(() => full);
    expect(() => s.set({ music: 0.2 })).not.toThrow();
    expect(s.get().music).toBe(0.2); // still applies for this visit
  });

  it('notifies subscribers once per real change and stops after unsubscribe', () => {
    const s = createPrefsStore(() => memory());
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set({ music: 0.3 });
    s.set({ music: 0.3 }); // no change
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ music: 0.3 }));
    off();
    s.set({ music: 0.5 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reset restores the defaults and persists them', () => {
    const storage = memory();
    const s = createPrefsStore(() => storage);
    s.set({ master: 0.1, voices: false });
    s.reset();
    expect(s.get()).toEqual(DEFAULT_AUDIO_PREFS);
    expect(createPrefsStore(() => storage).get()).toEqual(DEFAULT_AUDIO_PREFS);
  });

  it('reset restores the recommended mix even over an explicitly saved one', () => {
    const storage = memory({
      [PREFS_KEY]: JSON.stringify({ master: 1, music: 0.1, ambience: 1, sfx: 1, voices: false }),
    });
    const s = createPrefsStore(() => storage);
    expect(isRecommendedMix(s.get())).toBe(false);
    s.reset();
    expect(isRecommendedMix(s.get())).toBe(true);
    expect(JSON.parse(storage.data[PREFS_KEY]!)).toEqual(DEFAULT_AUDIO_PREFS);
  });
});

describe('players with a mix saved by an older version', () => {
  it('an untouched old default mix becomes the recommended mix (voices choice kept), saved once under the new key', () => {
    const storage = memory({
      [LEGACY_PREFS_KEY]: JSON.stringify({ ...LEGACY_DEFAULT_AUDIO_PREFS, voices: false }),
    });
    const s = createPrefsStore(() => storage);
    expect(s.get()).toEqual({ ...DEFAULT_AUDIO_PREFS, voices: false });
    expect(JSON.parse(storage.data[PREFS_KEY]!)).toEqual({ ...DEFAULT_AUDIO_PREFS, voices: false });
    expect(storage.data[LEGACY_PREFS_KEY]).toBeDefined(); // the old record is left alone
  });

  it('an explicitly chosen mix is respected; its music level is converted so it sounds as loud as before', () => {
    const saved = { master: 0.6, music: 0.3, ambience: 0.2, sfx: 1, voices: true };
    const storage = memory({ [LEGACY_PREFS_KEY]: JSON.stringify(saved) });
    const s = createPrefsStore(() => storage);
    expect(s.get()).toEqual({ ...saved, music: 0.5 });
    // same music bus gain as before, to the slider step
    expect(Math.abs(s.get().music * MUSIC_BASE - saved.music * LEGACY_MUSIC_BASE)).toBeLessThan(0.05);
    expect(migrateLegacyPrefs({ ...saved, music: 0.8 }).music).toBe(1); // capped at 100 %
    expect(migrateLegacyPrefs({ ...saved, music: 0 }).music).toBe(0);
  });

  it('a mix already saved by this version wins over the old key, and a later visit does not migrate again', () => {
    const storage = memory({
      [LEGACY_PREFS_KEY]: JSON.stringify(LEGACY_DEFAULT_AUDIO_PREFS),
      [PREFS_KEY]: JSON.stringify({ master: 0.4, music: 0.7, ambience: 0.1, sfx: 0.3, voices: true }),
    });
    expect(createPrefsStore(() => storage).get()).toEqual({
      master: 0.4,
      music: 0.7,
      ambience: 0.1,
      sfx: 0.3,
      voices: true,
    });
    const fresh = memory({ [LEGACY_PREFS_KEY]: JSON.stringify({ ...LEGACY_DEFAULT_AUDIO_PREFS, sfx: 0.4 }) });
    const first = createPrefsStore(() => fresh);
    first.set({ sfx: 0.6 });
    expect(createPrefsStore(() => fresh).get().sfx).toBe(0.6);
  });

  it('corrupt old records fall back to the recommended mix', () => {
    expect(createPrefsStore(() => memory({ [LEGACY_PREFS_KEY]: '{oops' })).get()).toEqual(
      DEFAULT_AUDIO_PREFS,
    );
  });
});
