/**
 * The build-time guard: vite.config.ts defines `__WAHALA_SERVER_ONLINE__` with the same rule the app's flags use
 * (WAHALA_ONLINE_ENABLED and an endpoint), and never in test mode.
 */
import { afterEach, describe, expect, it } from 'vitest';
import config from '../../vite.config';
import { resolveFlags } from '../../src/platform';

type ConfigFn = (env: { command: 'build' | 'serve'; mode: string; isPreview?: boolean }) => {
  define: Record<string, string>;
};

const SAVED = { e: process.env.WAHALA_ONLINE_ENABLED, u: process.env.WAHALA_ONLINE_URL };
afterEach(() => {
  for (const [k, v] of [
    ['WAHALA_ONLINE_ENABLED', SAVED.e],
    ['WAHALA_ONLINE_URL', SAVED.u],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function defineFor(enabled: string | undefined, url: string | undefined, mode = 'production'): string {
  if (enabled === undefined) delete process.env.WAHALA_ONLINE_ENABLED;
  else process.env.WAHALA_ONLINE_ENABLED = enabled;
  if (url === undefined) delete process.env.WAHALA_ONLINE_URL;
  else process.env.WAHALA_ONLINE_URL = url;
  return (config as unknown as ConfigFn)({ command: 'build', mode }).define.__WAHALA_SERVER_ONLINE__!;
}

describe('__WAHALA_SERVER_ONLINE__', () => {
  const cases: [string | undefined, string | undefined][] = [
    [undefined, undefined],
    ['true', undefined],
    [undefined, 'https://api.example.invalid'],
    ['false', 'https://api.example.invalid'],
    ['true', ''],
    ['true', 'https://api.example.invalid'],
    ['yes', 'https://api.example.invalid'],
    ['1', 'https://api.example.invalid'],
  ];
  for (const [enabled, url] of cases) {
    it(`WAHALA_ONLINE_ENABLED=${enabled} WAHALA_ONLINE_URL=${url}: same answer as the runtime flags`, () => {
      const env: Record<string, string> = {};
      if (enabled !== undefined) env.WAHALA_ONLINE_ENABLED = enabled;
      if (url !== undefined) env.WAHALA_ONLINE_URL = url;
      const expected = resolveFlags(env).onlineMode === 'server';
      expect(defineFor(enabled, url)).toBe(JSON.stringify(expected));
    });
  }

  it('is false by default and in test mode even with the opt-in variables', () => {
    expect(defineFor(undefined, undefined)).toBe('false');
    expect(defineFor('true', 'https://api.example.invalid', 'test')).toBe('false');
    expect(defineFor('true', 'https://api.example.invalid')).toBe('true');
  });
});

describe('__WAHALA_PLATFORM__ (docs/PLATFORM_CLIENT.md)', () => {
  const SAVED_P = process.env.WAHALA_PLATFORM_URL;
  afterEach(() => {
    if (SAVED_P === undefined) delete process.env.WAHALA_PLATFORM_URL;
    else process.env.WAHALA_PLATFORM_URL = SAVED_P;
  });
  const platformDefine = (
    enabled: string | undefined,
    url: string | undefined,
    platform: string | undefined,
    mode = 'production',
  ): string => {
    if (platform === undefined) delete process.env.WAHALA_PLATFORM_URL;
    else process.env.WAHALA_PLATFORM_URL = platform;
    if (enabled === undefined) delete process.env.WAHALA_ONLINE_ENABLED;
    else process.env.WAHALA_ONLINE_ENABLED = enabled;
    if (url === undefined) delete process.env.WAHALA_ONLINE_URL;
    else process.env.WAHALA_ONLINE_URL = url;
    return (config as unknown as ConfigFn)({ command: 'build', mode }).define.__WAHALA_PLATFORM__!;
  };
  const cases: [string | undefined, string | undefined, string | undefined][] = [
    [undefined, undefined, undefined],
    [undefined, undefined, 'http://{host}:4567'],
    ['true', undefined, 'http://{host}:4567'],
    [undefined, 'ws://{host}:2567', 'http://{host}:4567'],
    ['true', 'ws://{host}:2567', undefined],
    ['true', 'ws://{host}:2567', ''],
    ['true', 'ws://{host}:2567', 'ws://{host}:4567'],
    ['true', 'ws://{host}:2567', 'api.invalid'],
    ['true', 'ws://{host}:2567', 'http://{host}:4567'],
    ['true', 'ws://{host}:2567', 'https://api.example.invalid'],
  ];
  for (const [enabled, url, platform] of cases) {
    it(`ONLINE_ENABLED=${enabled} ONLINE_URL=${url} PLATFORM_URL=${platform}: same answer as the runtime flags`, () => {
      const env: Record<string, string> = {};
      if (enabled !== undefined) env.WAHALA_ONLINE_ENABLED = enabled;
      if (url !== undefined) env.WAHALA_ONLINE_URL = url;
      if (platform !== undefined) env.WAHALA_PLATFORM_URL = platform;
      const expected = resolveFlags(env, '?online', 'example.test').platformEndpoint !== null;
      expect(platformDefine(enabled, url, platform)).toBe(JSON.stringify(expected));
    });
  }
  it('is false in test mode even with every variable set', () => {
    expect(platformDefine('true', 'ws://{host}:2567', 'http://{host}:4567', 'test')).toBe('false');
  });
});

describe('__WAHALA_PRIVATE_BETA__ (docs/ops/BETA_FRONTEND.md)', () => {
  const saved = process.env.WAHALA_PRIVATE_BETA;
  const savedP = process.env.WAHALA_PLATFORM_URL;
  afterEach(() => {
    for (const [k, v] of [
      ['WAHALA_PRIVATE_BETA', saved],
      ['WAHALA_PLATFORM_URL', savedP],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  function beta(over: Record<string, string | undefined>, mode = 'production'): string {
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return (config as unknown as ConfigFn)({ command: 'build', mode }).define.__WAHALA_PRIVATE_BETA__!;
  }
  const ON = {
    WAHALA_ONLINE_ENABLED: 'true',
    WAHALA_ONLINE_URL: 'wss://play.example.invalid',
    WAHALA_PLATFORM_URL: 'https://play.example.invalid',
  };

  it('is false by default, with only the beta switch, and in test mode', () => {
    expect(
      beta({
        WAHALA_ONLINE_ENABLED: undefined,
        WAHALA_ONLINE_URL: undefined,
        WAHALA_PLATFORM_URL: undefined,
        WAHALA_PRIVATE_BETA: undefined,
      }),
    ).toBe('false');
    expect(
      beta({
        WAHALA_ONLINE_ENABLED: undefined,
        WAHALA_ONLINE_URL: undefined,
        WAHALA_PLATFORM_URL: undefined,
        WAHALA_PRIVATE_BETA: '1',
      }),
    ).toBe('false');
    expect(beta({ ...ON, WAHALA_PRIVATE_BETA: '1' }, 'test')).toBe('false');
  });

  it('is true only for a platform build that also asks for the beta; a platform build without the switch stays a normal online client', () => {
    expect(beta({ ...ON, WAHALA_PRIVATE_BETA: undefined })).toBe('false');
    expect(beta({ ...ON, WAHALA_PRIVATE_BETA: '1' })).toBe('true');
    expect(beta({ ...ON, WAHALA_PRIVATE_BETA: 'true', WAHALA_PLATFORM_URL: undefined })).toBe('false');
  });
});
