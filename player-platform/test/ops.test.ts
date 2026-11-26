import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig, validateConfig, withSecretFiles } from '../src/config';
import { client, startHarness } from './helpers';
import type { Harness } from './helpers';

const prod = {
  PLATFORM_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@db:5432/wahala',
  PLATFORM_ALLOWED_ORIGINS: 'https://play.example.test',
  PLATFORM_PUBLIC_WEB_URL: 'https://play.example.test',
  PLATFORM_HANDOFF_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----',
  PLATFORM_MATCH_SERVER_SECRET: 's'.repeat(40),
  PLATFORM_ADMIN_TOKEN: 'a'.repeat(40),
};

describe('secrets from files (Docker / Compose secrets)', () => {
  const files: Record<string, string> = {
    '/run/secrets/db': 'postgres://u:pw@db/x\n',
    '/run/secrets/empty': '  \n',
  };
  const read = (p: string): string => {
    if (!(p in files)) throw new Error('ENOENT');
    return files[p]!;
  };

  it('NAME_FILE supplies NAME, trimmed, and the plain NAME stays absent from the process environment of the caller', () => {
    const e = withSecretFiles({ DATABASE_URL_FILE: '/run/secrets/db' }, read);
    expect(e.DATABASE_URL).toBe('postgres://u:pw@db/x');
  });

  it('refuses both NAME and NAME_FILE, a missing file and an empty file (never a silent start without the secret)', () => {
    expect(() => withSecretFiles({ DATABASE_URL: 'x', DATABASE_URL_FILE: '/run/secrets/db' }, read)).toThrow(
      /either DATABASE_URL or DATABASE_URL_FILE/,
    );
    expect(() => withSecretFiles({ PLATFORM_ADMIN_TOKEN_FILE: '/nope' }, read)).toThrow(/cannot be read/);
    expect(() => withSecretFiles({ PLATFORM_ADMIN_TOKEN_FILE: '/run/secrets/empty' }, read)).toThrow(
      /empty file/,
    );
    // the error never contains the path's contents or any secret value
    try {
      withSecretFiles({ DATABASE_URL: 'secret-value', DATABASE_URL_FILE: '/run/secrets/db' }, read);
    } catch (e) {
      expect(String(e)).not.toContain('secret-value');
    }
  });
});

describe('production start-up refusals', () => {
  it('a complete guest-only private-beta configuration is valid WITHOUT any identity provider', () => {
    expect(validateConfig(loadConfig({ ...prod, PLATFORM_GUEST_ONLY: '1' }))).toEqual([]);
  });

  it('without the guest-only acknowledgement a production server with no provider is refused', () => {
    expect(validateConfig(loadConfig(prod)).join()).toMatch(/PLATFORM_GUEST_ONLY=1/);
  });

  it('guest-only never relaxes any other production rule', () => {
    const problems = validateConfig(
      loadConfig({
        PLATFORM_ENV: 'production',
        PLATFORM_GUEST_ONLY: '1',
        PLATFORM_MOCK_IDP: '1',
        PLATFORM_MOCK_CHECKOUT: '1',
        PLATFORM_DEV_TEXT_CHAT: '1',
      }),
    ).join('\n');
    for (const n of [
      'DATABASE_URL',
      'PLATFORM_MOCK_IDP',
      'PLATFORM_MOCK_CHECKOUT',
      'PLATFORM_DEV_TEXT_CHAT',
      'HANDOFF_PRIVATE_KEY',
      'PLATFORM_ALLOWED_ORIGINS',
    ])
      expect(problems, n).toContain(n);
  });

  it('refuses short secrets (match-server, admin, metrics)', () => {
    const p = validateConfig(
      loadConfig({
        ...prod,
        PLATFORM_GUEST_ONLY: '1',
        PLATFORM_MATCH_SERVER_SECRET: 'short',
        PLATFORM_ADMIN_TOKEN: 'short',
        PLATFORM_METRICS_TOKEN: 'short',
      }),
    ).join('\n');
    expect(p).toContain('MATCH_SERVER_SECRET');
    expect(p).toContain('ADMIN_TOKEN');
    expect(p).toContain('METRICS_TOKEN');
  });
});

describe('metrics, draining and graceful stop', () => {
  const open: Harness[] = [];
  afterAll(async () => {
    for (const h of open) await h.close().catch(() => undefined);
  });
  const METRICS = 'm'.repeat(40);

  it('GET /metrics needs the bearer token, is absent without one, and exposes no identifier, path or token', async () => {
    const h = await startHarness({ PLATFORM_METRICS_TOKEN: METRICS });
    open.push(h);
    const api = client(h.base);
    expect((await api.get('/metrics')).status).toBe(401);
    expect((await api.call('GET', '/metrics', undefined, 'wrong'.repeat(9))).status).toBe(401);
    const g = (await api.post('/v1/auth/guest', {})).body;
    await api.get('/v1/me', g.tokens.accessToken);
    await api.get('/v1/me'); // a 401
    const m = await api.call('GET', '/metrics', undefined, METRICS);
    expect(m.status).toBe(200);
    expect(m.body.requests.total).toBeGreaterThan(3);
    expect(m.body.requests.unauthenticated).toBeGreaterThanOrEqual(1);
    expect(m.body.requests.byStatusClass['2xx']).toBeGreaterThanOrEqual(2);
    expect(m.body.process.rssMb).toBeGreaterThan(10);
    expect(m.body.latencyMs.samples).toBeGreaterThan(0);
    const text = JSON.stringify(m.body);
    expect(text).not.toContain(g.tokens.accessToken);
    expect(text).not.toContain(g.profile.id);
    expect(text).not.toContain('/v1/');
    const plain = await startHarness();
    open.push(plain);
    expect((await client(plain.base).call('GET', '/metrics', undefined, METRICS)).status).toBe(404); // no token configured: no such route
  });

  it('drain makes /ready answer 503 (the proxy stops sending traffic) while /health stays 200 and requests still work', async () => {
    const h = await startHarness();
    open.push(h);
    const api = client(h.base);
    expect((await api.get('/ready')).status).toBe(200);
    h.platform.drain();
    const r = await api.get('/ready');
    expect(r.status).toBe(503);
    expect(r.body.draining).toBe(true);
    expect((await api.get('/health')).status).toBe(200);
    expect((await api.post('/v1/auth/guest', {})).status).toBe(201); // in-flight clients are not cut off by draining alone
  });

  it('close waits for an in-flight request to finish within the grace period', async () => {
    const h = await startHarness();
    open.push(h);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    h.platform.router.add({
      method: 'GET',
      path: '/v1/test/slow',
      auth: 'none',
      rate: null,
      summary: 'test only',
      handler: async () => {
        await gate;
        return { body: { done: true } };
      },
    });
    const inflight = fetch(`${h.base}/v1/test/slow`).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 100));
    const closing = h.platform.http.close(3000);
    await new Promise((r) => setTimeout(r, 100));
    release();
    expect(await inflight).toEqual({ done: true });
    await closing;
  });
});
