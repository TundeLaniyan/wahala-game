/**
 * The pure helpers of the founder-laptop tunnel launcher (scripts/beta-tunnel/lib.mjs): the address cloudflared prints, tester emails, the
 * generated nginx files (nothing but hex and a safe host name can reach them), versions, and the edge log summary.
 */
import { describe, expect, it } from 'vitest';
import {
  extractTunnelUrl,
  helpMentionsAllowedMail,
  isInviteCode,
  isSafeHost,
  isToken,
  newInviteCode,
  newToken,
  parseEmails,
  parseVersion,
  renderGateConf,
  renderHostConf,
  renderTunnelEnv,
  summariseEdge,
  testerLink,
  versionAtLeast,
  // @ts-expect-error plain ESM without types
} from '../../scripts/beta-tunnel/lib.mjs';

describe('cloudflared output', () => {
  it('finds the quick tunnel address in the box cloudflared prints, lower-cased', () => {
    const text =
      '2026-11-28 INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):\n2026 INF |  https://Rapid-Fox-Lagos-Demo.trycloudflare.com  |\n';
    expect(extractTunnelUrl(text)).toEqual({
      url: 'https://rapid-fox-lagos-demo.trycloudflare.com',
      host: 'rapid-fox-lagos-demo.trycloudflare.com',
    });
  });
  it('ignores everything else, including look-alike hosts and other schemes', () => {
    for (const t of [
      '',
      'nothing here',
      'http://a-b.trycloudflare.com',
      'https://trycloudflare.com',
      'https://a-b.trycloudflare.com.evil.example',
      'https://api.trycloudflare.com/tunnel',
    ]) {
      expect(extractTunnelUrl(t), t).toBeNull();
    }
  });
});

describe('testers and tokens', () => {
  it('parses emails from commas, spaces and lines, lower-cases, removes duplicates and reports the bad ones', () => {
    const r = parseEmails('Ada@Example.com, bayo@example.com\n  ada@example.com; nope ; c@d');
    expect(r.good).toEqual(['ada@example.com', 'bayo@example.com']);
    expect(r.bad).toEqual(['nope', 'c@d']);
  });
  it('tokens are 128 random bits of hex; invite codes follow the platform format', () => {
    const t = newToken();
    expect(isToken(t)).toBe(true);
    expect(newToken()).not.toBe(t);
    expect(isToken('xyz')).toBe(false);
    expect(isToken(`${t}\n`)).toBe(false);
    const c = newInviteCode();
    expect(c).toMatch(/^wb-[0-9a-f]{16}$/);
    expect(isInviteCode(c)).toBe(true);
    expect(isInviteCode('short')).toBe(false);
    expect(isInviteCode('has space in it ok')).toBe(false);
  });
  it('a tester link opens the gate on the tunnel address', () => {
    expect(testerLink('https://a-b.trycloudflare.com', 'f'.repeat(32))).toBe(
      `https://a-b.trycloudflare.com/__enter?k=${'f'.repeat(32)}`,
    );
  });
});

describe('the generated nginx files', () => {
  it('the gate lists exactly the given tokens in both maps and denies everyone else by default', () => {
    const a = newToken();
    const b = newToken();
    const conf = renderGateConf([a, b]);
    expect(conf).toContain('map $cookie_wahala_gate $gate_ok {\n  default 0;');
    expect(conf).toContain('map $arg_k $enter_ok {\n  default 0;');
    expect(conf.split(`"${a}" 1;`)).toHaveLength(3); // once in each map
    expect(conf.split(`"${b}" 1;`)).toHaveLength(3);
    // nobody listed: both maps are empty and refuse everyone
    expect(renderGateConf([])).not.toMatch(/ 1;/);
  });
  it('refuses to write anything but a hex token or a safe host name (no nginx syntax can be injected)', () => {
    for (const bad of ['"; deny all; "', 'abc', 'g'.repeat(32), `${'a'.repeat(31)}\n`])
      expect(() => renderGateConf([bad])).toThrow();
    expect(() => renderHostConf('a-b.trycloudflare.com')).not.toThrow();
    for (const bad of ['', 'a b.com', 'a.com"; return 200; "', 'a.com/', '-a.com', 'localhost'])
      expect(() => renderHostConf(bad), bad).toThrow();
    expect(renderHostConf('a-b.trycloudflare.com')).toContain('"a-b.trycloudflare.com" 1;');
    expect(isSafeHost('127.0.0.1')).toBe(true); // an address is a legal host name in this file (the launcher only ever passes the tunnel's)
  });
  it('the settings file carries the tunnel origin to both servers, the 2-match limit, invite-only, and refuses odd input', () => {
    const env = renderTunnelEnv({
      origin: 'https://a-b.trycloudflare.com',
      port: 18080,
      stateDir: '/s',
      distDir: '/d',
      uid: 501,
      gid: 20,
    });
    expect(env).toContain('GAME_ORIGINS=https://a-b.trycloudflare.com\n');
    expect(env).toContain('PUBLIC_WEB_URL=https://a-b.trycloudflare.com\n');
    expect(env).toContain('INVITE_ONLY=1');
    expect(env).toContain('RUMBLE_MAX_PLAYING_ROOMS=2');
    expect(env).toContain('PLATFORM_GUEST_ONLY=1');
    expect(() =>
      renderTunnelEnv({ origin: 'http://a.com', port: 18080, stateDir: '/s', distDir: '/d', uid: 1, gid: 1 }),
    ).toThrow();
    expect(() =>
      renderTunnelEnv({
        origin: 'https://a.com/x',
        port: 18080,
        stateDir: '/s',
        distDir: '/d',
        uid: 1,
        gid: 1,
      }),
    ).toThrow();
    expect(() =>
      renderTunnelEnv({ origin: 'https://a.com', port: 80, stateDir: '/s', distDir: '/d', uid: 1, gid: 1 }),
    ).toThrow();
  });
});

describe('versions and cloudflared options', () => {
  it('reads the versions Docker and cloudflared print', () => {
    expect(parseVersion('Docker Compose version v5.6.1')).toEqual([5, 6, 1]);
    expect(parseVersion('v2.29.1-desktop.1')).toEqual([2, 29, 1]);
    expect(parseVersion('cloudflared version 2025.11.1 (built 2025-11-07)')).toEqual([2025, 11, 1]);
    expect(parseVersion('no digits')).toBeNull();
    expect(versionAtLeast([2, 24, 0], [2, 24, 0])).toBe(true);
    expect(versionAtLeast([2, 23, 9], [2, 24, 0])).toBe(false);
    expect(versionAtLeast([5, 0, 0], [2, 24, 0])).toBe(true);
    expect(versionAtLeast(null, [2, 24, 0])).toBe(false);
  });
  it('detects the --allowed-mail option only when the help text really lists it', () => {
    expect(
      helpMentionsAllowedMail('OPTIONS:\n   --url value\n   --allowed-mail value  only these emails'),
    ).toBe(true);
    expect(helpMentionsAllowedMail('OPTIONS:\n   --url value\n   --protocol value')).toBe(false);
    expect(helpMentionsAllowedMail(undefined)).toBe(false);
  });
});

describe('edge log summary', () => {
  it('counts requests per route and the refusals, from the lines the tunnel edge writes', () => {
    const lines = [
      '2026-11-28T10:00:00+00:00 41.58.1.2 "GET page_or_ws" 200 0.001 up=- bytes=1200',
      '2026-11-28T10:00:01+00:00 41.58.1.2 "POST matchmake" 403 0.004 up=0.003 bytes=200',
      '2026-11-28T10:00:02+00:00 8.8.8.8 "GET page_or_ws" 403 0.000 up=- bytes=500',
      '2026-11-28T10:00:03+00:00 8.8.8.8 "GET page_or_ws" 421 0.000 up=- bytes=20',
      '2026-11-28T10:00:04+00:00 8.8.8.8 "POST matchmake" 429 0.000 up=- bytes=80',
      '2026-11-28T10:00:05+00:00 8.8.8.8 "GET metrics" 404 0.000 up=- bytes=10',
      '2026-11-28T10:00:06+00:00 41.58.1.2 "GET platform_api" 502 0.100 up=- bytes=10',
      'wahala-tunnel-edge-1  | 2026-11-28T10:00:07+00:00 41.58.1.2 "GET static" 200 0.001 up=- bytes=1',
      'not a log line',
    ];
    const s = summariseEdge(lines);
    expect(s.total).toBe(8);
    expect(s.byRoute).toMatchObject({ page_or_ws: 3, matchmake: 2, metrics: 1, platform_api: 1, static: 1 });
    expect(s.refused).toEqual({ gate403: 2, wrongHost421: 1, limited429: 1, notFound404: 1 });
    expect(s.serverErrors).toBe(1);
  });
});
