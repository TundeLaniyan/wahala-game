import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, normalizeRoomCode, validatePlayerName } from '../../src/net/protocol';
import {
  DEFAULT_RUNTIME,
  loadRuntimeConfig,
  makeRoomCode,
  parseJoinOptions,
  parseRoomOptions,
  parseSettingsPatch,
} from '../src/core/options';
import { createOriginPolicy } from '../src/core/origins';

const FAST = { ...DEFAULT_RUNTIME, fast: true };

describe('player names', () => {
  it("accepts 2-24 letters, digits, spaces and _ . ' -, trimmed", () => {
    expect(validatePlayerName('  Ada  ')).toBe('Ada');
    expect(validatePlayerName("Mr. O'Neil-2_x")).toBe("Mr. O'Neil-2_x");
    expect(validatePlayerName('Ọlá Adébáyọ̀')).toBe('Ọlá Adébáyọ̀');
    expect(validatePlayerName('a'.repeat(24))).toBe('a'.repeat(24));
    expect(validatePlayerName('Bola  Tinubu')).toBe('Bola Tinubu'); // runs of spaces collapse
  });

  it.each([
    ['too short', 'A'],
    ['empty after trim', '   '],
    ['too long', 'a'.repeat(25)],
    ['html', '<b>x</b>'],
    ['emoji', 'Ada 😀'],
    ['control char', 'Ada\u0000x'],
    ['newline', 'Ada\nBayo'],
    ['zero width', 'Ada​x'],
    ['punctuation only', '...'],
    ['not a string', 42],
    ['null', null],
    ['stacked marks', 'á́́́́́́b'],
  ])('rejects %s', (_label, raw) => {
    expect(validatePlayerName(raw)).toBeNull();
  });
});

describe('room options', () => {
  it('defaults: Oshodi, deathmatch, 300 s, standard bots', () => {
    const r = parseRoomOptions({}, DEFAULT_RUNTIME);
    expect(r).toEqual({
      ok: true,
      value: {
        private: false,
        autoStartSec: 20,
        settings: {
          arenaId: 'rumbleOshodi',
          game: 'deathmatch',
          durationSec: 300,
          botDifficulty: 'standard',
        },
      },
    });
    expect(parseRoomOptions(undefined, DEFAULT_RUNTIME).ok).toBe(true);
    expect(parseRoomOptions({ name: 'Ada', characterId: 'x' }, DEFAULT_RUNTIME).ok).toBe(true); // join fields ignored
  });

  it('accepts valid choices', () => {
    const r = parseRoomOptions(
      { private: true, game: 'team', durationSec: 180, botDifficulty: 'expert', autoStartSec: 5 },
      DEFAULT_RUNTIME,
    );
    expect(r.ok && r.value).toMatchObject({ private: true, autoStartSec: 5 });
  });

  it.each([
    [{ arenaId: 'nope' }],
    [{ arenaId: 7 }],
    [{ game: 'chess' }],
    [{ durationSec: 10 }],
    [{ durationSec: 240 }],
    [{ durationSec: '300' }],
    [{ botDifficulty: 'impossible' }],
    [{ private: 'yes' }],
    [{ autoStartSec: -1 }],
    [{ autoStartSec: 1e9 }],
    [{ autoStartSec: NaN }],
  ])('rejects %j', (raw) => {
    expect(parseRoomOptions(raw, DEFAULT_RUNTIME).ok).toBe(false);
  });

  it('short durations need the test-only fast mode', () => {
    expect(parseSettingsPatch({ durationSec: 10 }, DEFAULT_RUNTIME).ok).toBe(false);
    expect(parseSettingsPatch({ durationSec: 10 }, FAST).ok).toBe(true);
    expect(parseSettingsPatch({ durationSec: 4 }, FAST).ok).toBe(false);
    expect(parseSettingsPatch({ durationSec: 301 }, FAST).ok).toBe(false);
  });

  it('only RUMBLE_TEST_FAST=1 relaxes the config', () => {
    expect(loadRuntimeConfig({ RUMBLE_COUNTDOWN_MS: '10', RUMBLE_AUTOSTART_SEC: '0' })).toMatchObject({
      fast: false,
      countdownMs: 3000,
      defaultAutoStartSec: 20,
    });
    expect(
      loadRuntimeConfig({ RUMBLE_TEST_FAST: '1', RUMBLE_COUNTDOWN_MS: '10', RUMBLE_AUTOSTART_SEC: '0' }),
    ).toMatchObject({ fast: true, countdownMs: 10, defaultAutoStartSec: 0 });
    expect(loadRuntimeConfig({ RUMBLE_RECONNECT_SECONDS: '12' }).reconnectSeconds).toBe(12);
    expect(loadRuntimeConfig({ RUMBLE_RECONNECT_SECONDS: 'abc' }).reconnectSeconds).toBe(30);
    expect(loadRuntimeConfig({ RUMBLE_RECONNECT_SECONDS: '0' }).reconnectSeconds).toBe(30);
  });
});

describe('join options', () => {
  it('validates the name and falls back on the character', () => {
    expect(parseJoinOptions({ name: 'Ada', characterId: 'nope' })).toMatchObject({
      ok: true,
      value: { name: 'Ada' },
    });
    expect(parseJoinOptions({ name: 'x' }).ok).toBe(false);
    expect(parseJoinOptions({}).ok).toBe(false);
    expect(parseJoinOptions(null).ok).toBe(false);
  });
});

describe('room codes', () => {
  it('uses the 31-character alphabet without 0 O 1 I L', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
    for (const bad of '01OIL') expect(ROOM_CODE_ALPHABET).not.toContain(bad);
    for (let n = 0; n < 200; n++) {
      expect(makeRoomCode((m) => Math.floor(Math.random() * m))).toMatch(
        /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/,
      );
    }
  });

  it('normalises what players type', () => {
    expect(normalizeRoomCode(' abc234 ')).toBe('ABC234');
    expect(normalizeRoomCode('ABC10O')).toBeNull();
    expect(normalizeRoomCode('ABC23')).toBeNull();
    expect(normalizeRoomCode(5)).toBeNull();
  });
});

describe('origin policy', () => {
  it('allows localhost in development and nothing in production by default', () => {
    const dev = createOriginPolicy(undefined, true);
    expect(dev.allows('http://localhost:5173')).toBe(true);
    expect(dev.allows('http://127.0.0.1:8080')).toBe(true);
    expect(dev.allows('http://localhost.evil.com')).toBe(false);
    expect(dev.allows('https://evil.example')).toBe(false);
    expect(dev.allows(null)).toBe(true); // not a browser
    const prod = createOriginPolicy(undefined, false);
    expect(prod.allows('http://localhost:5173')).toBe(false);
  });

  it('takes an explicit comma list with exact origins and wildcards', () => {
    const p = createOriginPolicy('https://play.example.com, https://*.pages.dev ,http://localhost:*', false);
    expect(p.allows('https://play.example.com')).toBe(true);
    expect(p.allows('https://wahala.pages.dev')).toBe(true);
    expect(p.allows('https://play.example.com.evil.io')).toBe(false);
    expect(p.allows('http://localhost:3000')).toBe(true);
    expect(p.allows('http://example.com')).toBe(false);
  });
});
