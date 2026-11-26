/* eslint-disable @typescript-eslint/no-explicit-any -- test code reads JSON bodies of many shapes */
import { describe, expect, it } from 'vitest';
import { loadConfig, validateConfig } from '../src/config';
import { REDACTED, createLogger, scrub } from '../src/logger';

const prodEnv = {
  PLATFORM_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@db:5432/wahala',
  PLATFORM_ALLOWED_ORIGINS: 'https://play.example.test',
  PLATFORM_PUBLIC_WEB_URL: 'https://play.example.test',
  PLATFORM_HANDOFF_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----',
  PLATFORM_GOOGLE_CLIENT_IDS: 'abc.apps.googleusercontent.com',
  PLATFORM_MATCH_SERVER_SECRET: 's'.repeat(40),
  PLATFORM_ADMIN_TOKEN: 'a'.repeat(40),
};

describe('configuration validation', () => {
  it('a development default is valid', () => {
    expect(validateConfig(loadConfig({}))).toEqual([]);
  });

  it('a complete production configuration is valid', () => {
    expect(validateConfig(loadConfig(prodEnv))).toEqual([]);
  });

  it('production refuses every development-only switch and reports ALL problems at once', () => {
    const problems = validateConfig(
      loadConfig({
        PLATFORM_ENV: 'production',
        PLATFORM_MOCK_IDP: '1',
        PLATFORM_MOCK_CHECKOUT: '1',
        PLATFORM_DEV_TEXT_CHAT: '1',
        PLATFORM_ALLOWED_ORIGINS: 'http://localhost:5173',
      }),
    );
    const text = problems.join('\n');
    for (const needle of [
      'DATABASE_URL',
      'PLATFORM_MOCK_IDP',
      'PLATFORM_MOCK_CHECKOUT',
      'PLATFORM_DEV_TEXT_CHAT',
      'HANDOFF_PRIVATE_KEY',
      'localhost',
      'https',
      'identity provider',
    ])
      expect(text, needle).toContain(needle);
  });

  it('refuses wildcard origins and short secrets in any environment', () => {
    expect(validateConfig(loadConfig({ PLATFORM_ALLOWED_ORIGINS: '*' })).join()).toMatch(/exact origin/);
    expect(validateConfig(loadConfig({ PLATFORM_ALLOWED_ORIGINS: 'https://*.example.test' })).join()).toMatch(
      /exact origin/,
    );
    expect(validateConfig(loadConfig({ PLATFORM_ADMIN_TOKEN: 'short' })).join()).toMatch(/ADMIN_TOKEN/);
    expect(validateConfig(loadConfig({ PLATFORM_MATCH_SERVER_SECRET: 'short' })).join()).toMatch(
      /MATCH_SERVER_SECRET/,
    );
  });

  it('problem messages never contain a secret value', () => {
    const text = validateConfig(
      loadConfig({
        ...prodEnv,
        PLATFORM_MATCH_SERVER_SECRET: 'tooshort-secret',
        PLATFORM_ADMIN_TOKEN: 'tooshort-admin',
      }),
    ).join();
    expect(text).not.toContain('tooshort-secret');
    expect(text).not.toContain('tooshort-admin');
  });

  it('ignores nonsense numbers instead of trusting them', () => {
    const c = loadConfig({ PORT: 'abc', PLATFORM_PARTY_MAX_SIZE: '9999', PLATFORM_REFRESH_DAYS: '-5' });
    expect(c.partyMaxSize).toBe(8);
    expect(c.refreshDays).toBe(30);
    expect(c.port).toBe(4567);
  });
});

describe('structured logging', () => {
  const capture = () => {
    const out: string[] = [];
    return {
      out,
      log: createLogger(
        (l) => out.push(l),
        'debug',
        () => new Date('2026-01-01T00:00:00Z'),
      ),
    };
  };

  it('writes one JSON object per line with a timestamp and level', () => {
    const { out, log } = capture();
    log.info('hello', { a: 1 });
    expect(JSON.parse(out[0]!)).toEqual({ t: '2026-01-01T00:00:00.000Z', level: 'info', msg: 'hello', a: 1 });
  });

  it('redacts sensitive field names and token-shaped values wherever they appear', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
    const s = scrub({
      accessToken: 'x',
      refresh_token: 'x',
      authorization: 'Bearer abc',
      email: 'a@b.c',
      password: 'p',
      partyCode: 'ABCDEFGH',
      nested: { note: `got ${jwt} and wa_${'a'.repeat(43)}`, apiKey: 'k' },
      fine: 'visible',
    }) as Record<string, any>;
    expect(s.accessToken).toBe(REDACTED);
    expect(s.refresh_token).toBe(REDACTED);
    expect(s.authorization).toBe(REDACTED);
    expect(s.email).toBe(REDACTED);
    expect(s.password).toBe(REDACTED);
    expect(s.partyCode).toBe(REDACTED);
    expect(s.nested.apiKey).toBe(REDACTED);
    expect(s.nested.note).not.toContain('eyJ');
    expect(s.nested.note).not.toContain('wa_aaaa');
    expect(s.fine).toBe('visible');
  });

  it('respects the minimum level and bounds depth and size', () => {
    const out: string[] = [];
    const log = createLogger((l) => out.push(l), 'warn');
    log.info('no');
    log.warn('yes');
    expect(out).toHaveLength(1);
    expect(JSON.stringify(scrub({ big: 'x'.repeat(10_000) }))).toHaveLength(
      JSON.stringify({ big: 'x'.repeat(500) }).length,
    );
  });
});
