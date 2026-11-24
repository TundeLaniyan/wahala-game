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
        mode: 'ffa',
        autoStartSec: 30,
        settings: {
          arenaId: 'rumbleOshodi',
          game: 'deathmatch',
          durationSec: 300,
          botDifficulty: 'standard',
          friendlyFire: false,
        },
      },
    });
    expect(parseRoomOptions(undefined, DEFAULT_RUNTIME).ok).toBe(true);
    expect(parseRoomOptions({ name: 'Ada', characterId: 'x' }, DEFAULT_RUNTIME).ok).toBe(true); // join fields ignored
  });

  it('accepts valid choices', () => {
    const raw = { private: true, game: 'team', durationSec: 180, botDifficulty: 'expert', autoStartSec: 5 };
    // production: the public wait is the server's rule (30 s), whatever a client asks for
    const r = parseRoomOptions(raw, DEFAULT_RUNTIME);
    expect(r.ok && r.value).toMatchObject({ private: true, autoStartSec: 30 });
    // only the test-fast mode honours a client's value
    expect(
      parseRoomOptions(raw, FAST).ok && (parseRoomOptions(raw, FAST) as { value: unknown }).value,
    ).toMatchObject({
      autoStartSec: 5,
    });
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
      defaultAutoStartSec: 30,
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

describe('disconnect policy configuration (ON8)', () => {
  it('defaults: 5 s grace, 30 s window, bot policy', () => {
    expect(DEFAULT_RUNTIME).toMatchObject({ graceSeconds: 5, reconnectSeconds: 30, dropPolicy: 'bot' });
    expect(loadRuntimeConfig({})).toMatchObject({ graceSeconds: 5, reconnectSeconds: 30, dropPolicy: 'bot' });
  });

  it('RUMBLE_GRACE_SECONDS takes 0..60 (also outside test-fast mode), anything else falls back to 5', () => {
    const grace = (v: string | undefined, fast = false): number =>
      loadRuntimeConfig({ RUMBLE_GRACE_SECONDS: v, ...(fast ? { RUMBLE_TEST_FAST: '1' } : {}) }).graceSeconds;
    expect(grace('0')).toBe(0);
    expect(grace('12')).toBe(12);
    expect(grace('2.5')).toBe(2.5);
    expect(grace('60')).toBe(60);
    expect(grace('0.2', true)).toBe(0.2);
    for (const bad of ['-1', '61', '1e9', 'abc', '', '  ', 'NaN', 'Infinity', undefined]) {
      expect(grace(bad), String(bad)).toBe(5);
    }
  });

  it('RUMBLE_DROP_POLICY is bot or idle (case-insensitive), anything else falls back to bot', () => {
    const policy = (v: string | undefined): string => loadRuntimeConfig({ RUMBLE_DROP_POLICY: v }).dropPolicy;
    expect(policy('bot')).toBe('bot');
    expect(policy('idle')).toBe('idle');
    expect(policy(' IDLE ')).toBe('idle');
    for (const bad of ['autopilot', 'kick', 'pause', '', undefined])
      expect(policy(bad), String(bad)).toBe('bot');
  });

  it('the reconnection window is validated as before and independent of the grace period', () => {
    const c = loadRuntimeConfig({
      RUMBLE_RECONNECT_SECONDS: '45',
      RUMBLE_GRACE_SECONDS: '10',
      RUMBLE_DROP_POLICY: 'idle',
    });
    expect(c).toMatchObject({ reconnectSeconds: 45, graceSeconds: 10, dropPolicy: 'idle' });
    expect(loadRuntimeConfig({ RUMBLE_RECONNECT_SECONDS: '0.5' }).reconnectSeconds).toBe(30); // fast mode only
    expect(
      loadRuntimeConfig({ RUMBLE_RECONNECT_SECONDS: '0.5', RUMBLE_TEST_FAST: '1' }).reconnectSeconds,
    ).toBe(0.5);
  });
});

describe('connection liveness tolerance (ping)', () => {
  it('defaults to 3 s x 4 and reads RUMBLE_PING_INTERVAL_MS / RUMBLE_PING_MAX_RETRIES within bounds', () => {
    const d = loadRuntimeConfig({});
    expect([d.pingIntervalMs, d.pingMaxRetries]).toEqual([3000, 4]);
    const c = loadRuntimeConfig({ RUMBLE_PING_INTERVAL_MS: '5000', RUMBLE_PING_MAX_RETRIES: '10' });
    expect([c.pingIntervalMs, c.pingMaxRetries]).toEqual([5000, 10]);
  });
  it('falls back to the defaults for values that are out of range or not numbers', () => {
    for (const bad of ['0', '-3', 'abc', '1e9', '']) {
      const c = loadRuntimeConfig({ RUMBLE_PING_INTERVAL_MS: bad, RUMBLE_PING_MAX_RETRIES: bad });
      expect([c.pingIntervalMs, c.pingMaxRetries], bad).toEqual([3000, 4]);
    }
  });
});
