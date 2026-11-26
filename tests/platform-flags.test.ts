import { describe, expect, it } from 'vitest';
import { FLAG_DEFAULTS, resolveEndpoint, resolveFlags, resolvePlatformEndpoint } from '../src/platform/flags';

describe('feature flags', () => {
  it('defaults: online and voice off, campaign on, experimental off', () => {
    expect(resolveFlags({}, '')).toEqual({ ...FLAG_DEFAULTS });
    expect(FLAG_DEFAULTS).toMatchObject({
      online: false,
      onlineMode: 'off',
      voice: false,
      campaign: true,
      experimentalContent: false,
      rumbleOnline: false,
      onlineEndpoint: null,
    });
  });

  it('the URL can never turn on the server transport or voice', () => {
    const f = resolveFlags({}, '?online=1&server=1&voice=1&WAHALA_ONLINE_ENABLED=true');
    expect(f.onlineMode).toBe('off');
    expect(f.voice).toBe(false);
  });

  it('?mockonline selects the local mock adapters only', () => {
    expect(resolveFlags({}, '?mockonline')).toMatchObject({ online: true, onlineMode: 'mock', voice: false });
  });

  it('the server transport needs the build flag AND an endpoint', () => {
    expect(resolveFlags({ WAHALA_ONLINE_ENABLED: 'true' }).onlineMode).toBe('mock');
    expect(
      resolveFlags({ WAHALA_ONLINE_ENABLED: 'true', WAHALA_ONLINE_URL: 'wss://example.invalid' }).onlineMode,
    ).toBe('server');
    expect(resolveFlags({ WAHALA_ONLINE_URL: 'wss://example.invalid' }).onlineMode).toBe('off');
  });

  it('campaign can be switched off; experimental content on', () => {
    expect(resolveFlags({ WAHALA_CAMPAIGN_ENABLED: 'false' }).campaign).toBe(false);
    expect(resolveFlags({}, '?campaign=0').campaign).toBe(false);
    expect(resolveFlags({ WAHALA_EXPERIMENTAL_CONTENT: 'true' }).experimentalContent).toBe(true);
  });

  it('?mockonline=0 is "not set"; a bare ?mockonline still selects the mock', () => {
    expect(resolveFlags({}, '?mockonline=0').onlineMode).toBe('off');
    expect(resolveFlags({}, '?online&mockonline=off').online).toBe(false);
    expect(resolveFlags({}, '?mockonline=1').onlineMode).toBe('mock');
  });
});

describe('rumbleOnline and the endpoint: two independent switches (decision ON1)', () => {
  const SERVER = { WAHALA_ONLINE_ENABLED: 'true', WAHALA_ONLINE_URL: 'ws://{host}:2567' };

  // [what the BUILD has, the page URL query, rumbleOnline, endpoint for hostname 192.0.2.7]
  const table: [string, Record<string, string>, string, boolean, string | null][] = [
    ['default build, no query', {}, '', false, null],
    ['default build, ?online', {}, '?online', false, null],
    ['default build, ?online=1', {}, '?online=1', false, null],
    ['default build, ?mockonline', {}, '?mockonline', false, null],
    ['default build, ?online&mockonline', {}, '?online&mockonline', false, null],
    ['default build, ?server=ws://x', {}, '?server=ws://x', false, null],
    ['default build, ?online&server=ws://x', {}, '?online&server=ws://x', false, null],
    [
      'default build, ?online&endpoint=ws://10.0.0.5:2567',
      {},
      '?online&endpoint=ws://10.0.0.5:2567',
      false,
      null,
    ],
    [
      'default build, ?online&WAHALA_ONLINE_URL=ws://evil',
      {},
      '?online&WAHALA_ONLINE_URL=ws://evil',
      false,
      null,
    ],
    [
      'default build, ?online&WAHALA_ONLINE_ENABLED=true',
      {},
      '?online&WAHALA_ONLINE_ENABLED=true',
      false,
      null,
    ],
    ['build switch without an endpoint, ?online', { WAHALA_ONLINE_ENABLED: 'true' }, '?online', false, null],
    [
      'endpoint without the build switch, ?online',
      { WAHALA_ONLINE_URL: 'ws://{host}:2567' },
      '?online',
      false,
      null,
    ],
    [
      'enabled=false with an endpoint, ?online',
      { ...SERVER, WAHALA_ONLINE_ENABLED: 'false' },
      '?online',
      false,
      null,
    ],
    ['server build, no query', SERVER, '', false, 'ws://192.0.2.7:2567'],
    ['server build, ?mockonline only', SERVER, '?mockonline', false, 'ws://192.0.2.7:2567'],
    ['server build, ?server=ws://x only', SERVER, '?server=ws://x', false, 'ws://192.0.2.7:2567'],
    ['server build, ?online', SERVER, '?online', true, 'ws://192.0.2.7:2567'],
    ['server build, ?online=1', SERVER, '?online=1', true, 'ws://192.0.2.7:2567'],
    ['server build, ?online&mockonline=0', SERVER, '?online&mockonline=0', true, 'ws://192.0.2.7:2567'],
    [
      'server build, ?online&endpoint=ws://evil:1 (ignored)',
      SERVER,
      '?online&endpoint=ws://evil:1',
      true,
      'ws://192.0.2.7:2567',
    ],
    [
      'server build, ?online&server=ws://evil:1 (ignored)',
      SERVER,
      '?online&server=ws://evil:1',
      true,
      'ws://192.0.2.7:2567',
    ],
    [
      'fixed https endpoint',
      { ...SERVER, WAHALA_ONLINE_URL: 'https://play.example.invalid/rumble' },
      '?online',
      true,
      'https://play.example.invalid/rumble',
    ],
    [
      'fixed wss endpoint',
      { ...SERVER, WAHALA_ONLINE_URL: 'wss://rumble.example.invalid' },
      '?online',
      true,
      'wss://rumble.example.invalid',
    ],
  ];
  for (const [name, env, search, rumbleOnline, endpoint] of table) {
    it(name, () => {
      const f = resolveFlags(env, search, '192.0.2.7');
      expect(f.rumbleOnline).toBe(rumbleOnline);
      expect(f.onlineEndpoint).toBe(endpoint);
    });
  }

  it('{host} is replaced by the page hostname (every occurrence); IPv4, DNS and bracketed IPv6 are accepted', () => {
    for (const host of ['192.168.1.20', 'laptop.local', 'localhost', '[fe80::1]']) {
      expect(resolveFlags(SERVER, '?online', host).onlineEndpoint).toBe(`ws://${host}:2567`);
    }
    expect(resolveEndpoint('ws://{host}:2567/{host}', 'a.b')).toBe('ws://a.b:2567/a.b');
  });

  it('a malformed or missing hostname makes the endpoint unusable (never a half-filled URL)', () => {
    for (const host of ['', 'a b', 'x/evil', 'x@evil', 'a:2567', 'host{host}']) {
      const f = resolveFlags(SERVER, '?online', host);
      expect(f.onlineEndpoint).toBeNull();
      expect(f.rumbleOnline).toBe(false);
    }
    // a fixed endpoint does not need a hostname
    expect(
      resolveFlags({ ...SERVER, WAHALA_ONLINE_URL: 'wss://x.invalid' }, '?online', '').rumbleOnline,
    ).toBe(true);
  });

  it('only ws:// wss:// http:// https:// endpoints are accepted', () => {
    for (const bad of [
      'ftp://x.invalid',
      'javascript:alert(1)',
      'data:text/plain,x',
      'file:///etc/passwd',
      '//x.invalid',
      'x.invalid:2567',
      'ws:/x',
      'ws://',
      'ws://a b',
      'ws://{host}:{port}',
      'tcp://{host}:2567',
    ]) {
      const f = resolveFlags({ ...SERVER, WAHALA_ONLINE_URL: bad }, '?online', 'h.example');
      expect(f.onlineEndpoint, bad).toBeNull();
      expect(f.rumbleOnline, bad).toBe(false);
    }
    for (const good of ['ws://a:1', 'WSS://a', 'http://a', 'https://a/b?c=d']) {
      expect(resolveEndpoint(good, '')).toBe(good);
    }
    expect(resolveEndpoint(undefined, 'x')).toBeNull();
    expect(resolveEndpoint('', 'x')).toBeNull();
  });

  it('the legacy flags keep their behaviour in a server build (online / onlineMode do not depend on ?online)', () => {
    expect(resolveFlags(SERVER, '', 'h').onlineMode).toBe('server');
    expect(resolveFlags(SERVER, '?online', 'h')).toMatchObject({
      online: true,
      onlineMode: 'server',
      voice: false,
    });
  });

  it('the source defaults hold no endpoint, host or address (nothing to leak into a public build)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/platform/flags.ts', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168|ngrok|trycloudflare|loca\.lt/i);
    expect(src).not.toMatch(/wss?:\/\/[a-z0-9{]/i);
  });
});

describe('platform and platformEndpoint: only inside a server build that names a platform API (docs/PLATFORM_CLIENT.md)', () => {
  const SERVER = { WAHALA_ONLINE_ENABLED: 'true', WAHALA_ONLINE_URL: 'ws://{host}:2567' };
  const PF = { ...SERVER, WAHALA_PLATFORM_URL: 'http://{host}:4567' };

  // [what the BUILD has, the page URL query, platform, platformEndpoint for hostname 192.0.2.7]
  const table: [string, Record<string, string>, string, boolean, string | null][] = [
    ['default build, no query', {}, '', false, null],
    ['default build, ?online&platform=http://x', {}, '?online&platform=http://x', false, null],
    [
      'default build, ?online&WAHALA_PLATFORM_URL=http://evil',
      {},
      '?online&WAHALA_PLATFORM_URL=http://evil',
      false,
      null,
    ],
    [
      'platform URL without the online build',
      { WAHALA_PLATFORM_URL: 'http://{host}:4567' },
      '?online',
      false,
      null,
    ],
    [
      'platform URL with only the build switch',
      { WAHALA_ONLINE_ENABLED: 'true', WAHALA_PLATFORM_URL: 'http://{host}:4567' },
      '?online',
      false,
      null,
    ],
    [
      'platform URL with only the online endpoint',
      { WAHALA_ONLINE_URL: 'ws://{host}:2567', WAHALA_PLATFORM_URL: 'http://{host}:4567' },
      '?online',
      false,
      null,
    ],
    ['server build without a platform URL, ?online', SERVER, '?online', false, null],
    ['server + platform build, no query', PF, '', false, 'http://192.0.2.7:4567'],
    ['server + platform build, ?online', PF, '?online', true, 'http://192.0.2.7:4567'],
    [
      'server + platform build, ?online&platform=http://evil (ignored)',
      PF,
      '?online&platform=http://evil:1',
      true,
      'http://192.0.2.7:4567',
    ],
    [
      'fixed https platform, trailing slash trimmed',
      { ...SERVER, WAHALA_PLATFORM_URL: 'https://api.example.invalid/' },
      '?online',
      true,
      'https://api.example.invalid',
    ],
    [
      'a ws:// platform URL is refused',
      { ...SERVER, WAHALA_PLATFORM_URL: 'ws://{host}:4567' },
      '?online',
      false,
      null,
    ],
    [
      'a malformed platform URL is refused',
      { ...SERVER, WAHALA_PLATFORM_URL: 'api.invalid' },
      '?online',
      false,
      null,
    ],
    ['an empty platform URL is nothing', { ...SERVER, WAHALA_PLATFORM_URL: '' }, '?online', false, null],
  ];
  for (const [name, env, search, platform, endpoint] of table) {
    it(name, () => {
      const f = resolveFlags(env, search, '192.0.2.7');
      expect(f.platform).toBe(platform);
      expect(f.platformEndpoint).toBe(endpoint);
      // the platform never turns online on by itself, and never changes the online endpoint
      if (f.platform) expect(f.rumbleOnline).toBe(true);
    });
  }

  it('a malformed hostname makes a {host} platform URL unusable', () => {
    for (const host of ['', 'a b', 'x/evil']) expect(resolveFlags(PF, '?online', host).platform).toBe(false);
    expect(resolvePlatformEndpoint('https://p.invalid', '')).toBe('https://p.invalid');
    expect(resolvePlatformEndpoint('wss://p.invalid', '')).toBeNull();
  });

  it('the defaults are off', () => {
    expect(FLAG_DEFAULTS.platform).toBe(false);
    expect(FLAG_DEFAULTS.platformEndpoint).toBeNull();
  });
});
