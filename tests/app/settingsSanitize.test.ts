import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS,
  PREFERENCE_KEYS,
  SETTINGS_KEY,
  loadSettings,
  preferenceDefaults,
  sanitizeSettings,
} from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { EXPERIMENTAL_ARENA_IDS, RUMBLE_ARENA_IDS } from '../../src/sim';
import { QUALITY_SETTINGS } from '../../src/render/quality';

function withStorage(value: string | null) {
  const data = new Map<string, string>();
  if (value !== null) data.set(SETTINGS_KEY, value);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('settings repair (invalid saves can never block a match)', () => {
  it('keeps every valid choice', () => {
    const s: GameSettings = {
      ...DEFAULT_GAME_SETTINGS,
      play: 'classic',
      competitors: 3,
      rumbleCompetitors: 32,
      rumbleMode: 'team',
      rumbleMinutes: 10,
      friendlyFire: true,
      rumbleArenaId: RUMBLE_ARENA_IDS[3]!,
      arenaId: EXPERIMENTAL_ARENA_IDS[0]!,
      character: 'campusQueen',
      quality: 'high',
      subtitles: 'large',
      shake: 'off',
      rumbleBlast: 'cross',
    };
    expect(sanitizeSettings(s)).toEqual(s);
  });

  it('replaces values the menu could not have produced with defaults', () => {
    const bad = {
      ...DEFAULT_GAME_SETTINGS,
      play: 'pvp',
      competitors: 9,
      rumbleCompetitors: 31,
      rumbleMode: 'battleRoyale',
      rumbleMinutes: 7,
      rumbleArenaId: 'danfoBusPark',
      arenaId: 'rumbleOshodi',
      character: 'areaBoss',
      quality: 'ultra',
      touchControls: 'maybe',
      cameraView: 'drone',
      shake: 'max',
      rumbleBlast: 'square',
      difficulty: 'hard',
      botDifficulties: ['easy', 'god'],
      friendlyFire: 'yes',
    } as unknown as GameSettings;
    const s = sanitizeSettings(bad);
    expect(s.play).toBe('rumble');
    expect(s.competitors).toBe(4);
    expect(s.rumbleCompetitors).toBe(16);
    expect(s.rumbleMode).toBe('survival');
    expect(s.rumbleMinutes).toBe(5);
    expect(s.rumbleArenaId).toBe(RUMBLE_ARENA_IDS[0]);
    expect(s.arenaId).toBe(DEFAULT_GAME_SETTINGS.arenaId);
    expect(s.character).toBe('streetBaller');
    expect(s.quality).toBe('auto');
    expect(s.touchControls).toBe('auto');
    expect(s.cameraView).toBe('action');
    expect(s.shake).toBe('auto');
    expect(s.friendlyFire).toBe(false);
    expect(s.rumbleBlast).toBe('radial');
    // legacy level names still migrate to the nearest V2 level
    expect(s.difficulty).toBe('expert');
    expect(s.botDifficulties).toEqual(['beginner', 'expert', 'expert']);
  });

  it('loadSettings repairs a corrupted save and keeps the pre-V2 migration', () => {
    withStorage(
      JSON.stringify({ character: 'ghost', rumbleCompetitors: 100, arenaId: 'cityRumble', mode: 'timer' }),
    );
    const s = loadSettings();
    expect(s.character).toBe('streetBaller');
    expect(s.rumbleCompetitors).toBe(16);
    expect(s.play).toBe('rumble');
    expect(s.arenaId).toBe(DEFAULT_GAME_SETTINGS.arenaId);
    expect('mode' in s).toBe(false);
  });

  it('"Restore defaults" covers only device preferences, never the match setup', () => {
    const d = preferenceDefaults();
    expect(Object.keys(d).sort()).toEqual([...PREFERENCE_KEYS].sort());
    for (const k of ['play', 'character', 'arenaId', 'rumbleArenaId', 'difficulty', 'competitors'])
      expect(k in d).toBe(false);
    expect(d).toMatchObject({
      quality: 'auto',
      subtitles: 'off',
      shake: 'auto',
      touchControls: 'auto',
      muted: false,
    });
  });

  describe('graphics quality setting', () => {
    it('is Auto by default', () => {
      expect(DEFAULT_GAME_SETTINGS.quality).toBe('auto');
      withStorage(null);
      expect(loadSettings().quality).toBe('auto');
    });
    it('keeps Auto and every manual preset through a save and a reload', () => {
      for (const q of QUALITY_SETTINGS) {
        withStorage(JSON.stringify({ quality: q }));
        expect(loadSettings().quality).toBe(q);
        expect(sanitizeSettings({ ...DEFAULT_GAME_SETTINGS, quality: q }).quality).toBe(q);
      }
      expect(QUALITY_SETTINGS).toEqual([
        'auto',
        'veryLow',
        'low',
        'mediumLow',
        'medium',
        'mediumHigh',
        'high',
      ]);
    });
    it('older saves with low / medium / high still load; unknown values fall back to Auto', () => {
      for (const q of ['low', 'medium', 'high'] as const) {
        withStorage(JSON.stringify({ quality: q }));
        expect(loadSettings().quality).toBe(q);
      }
      for (const bad of ['ultra', 5, null, '']) {
        withStorage(JSON.stringify({ quality: bad }));
        expect(loadSettings().quality).toBe('auto');
      }
    });
    it('"Restore defaults" puts the graphics back to Auto', () => {
      expect(preferenceDefaults().quality).toBe('auto');
    });
  });
});
