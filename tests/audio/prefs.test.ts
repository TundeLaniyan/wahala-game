import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AUDIO_PREFS, PREFS_KEY, createPrefsStore, sanitizePrefs } from '../../src/audio/prefs';
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
  it('defaults to master 80 / music 45 / ambience 65 / effects 85 with voices on', () => {
    expect(DEFAULT_AUDIO_PREFS).toEqual({
      master: 0.8,
      music: 0.45,
      ambience: 0.65,
      sfx: 0.85,
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
});
