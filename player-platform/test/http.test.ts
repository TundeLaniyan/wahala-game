import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors';
import { createLogger } from '../src/logger';
import { client, newGuest, startHarness } from './helpers';
import type { Api, Harness } from './helpers';

const lines: string[] = [];
let h: Harness;
let api: Api;
beforeAll(async () => {
  h = await startHarness(
    { PLATFORM_ALLOWED_ORIGINS: 'https://game.example.test' },
    { logger: createLogger((l) => lines.push(l), 'debug') },
  );
  api = client(h.base);
  h.platform.router.add({
    method: 'GET',
    path: '/v1/test/boom',
    auth: 'none',
    rate: null,
    summary: 'test only',
    handler: async () => {
      throw new Error('SELECT * FROM secrets WHERE token = wa_leakleakleakleakleakleak');
    },
  });
  h.platform.router.add({
    method: 'GET',
    path: '/v1/test/teapot',
    auth: 'none',
    rate: null,
    summary: 'test only',
    handler: async () => {
      throw new ApiError('conflict', 'a known error');
    },
  });
});
afterAll(() => h.close());

describe('HTTP shell', () => {
  it('health is liveness, ready proves the schema is current', async () => {
    expect((await api.get('/health')).body).toEqual({ ok: true });
    const r = await api.get('/ready');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.schema).toBe(r.body.expected);
  });

  it('sets no-store, nosniff, referrer and a request id on every answer; the id is echoed in errors', async () => {
    const r = await api.get('/v1/me');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-request-id')).toBe(r.body.error.requestId);
    expect(r.headers.get('x-powered-by')).toBeNull();
  });

  it('answers unknown paths 404 and wrong methods 405 with Allow', async () => {
    expect((await api.get('/v1/nothing')).status).toBe(404);
    const m = await api.call('PUT', '/v1/auth/guest', {});
    expect(m.status).toBe(405);
    expect(m.headers.get('allow')).toBe('POST');
  });

  it('refuses a body that is too large, malformed, or not JSON', async () => {
    const big = await api.post('/v1/auth/guest', { nickname: 'x'.repeat(40_000) });
    expect(big.status).toBe(413);
    expect((await api.call('POST', '/v1/auth/guest', '{not json')).status).toBe(400);
    const text = await fetch(`${h.base}/v1/auth/guest`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hi',
    });
    expect(text.status).toBe(400);
    expect((await api.call('POST', '/v1/auth/guest', '[]')).status).toBe(400);
    expect((await api.call('POST', '/v1/auth/guest', '"x"')).status).toBe(400);
  });

  it('does not let a prototype-pollution payload through (unknown field) and stays healthy', async () => {
    const r = await api.call(
      'POST',
      '/v1/auth/guest',
      '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{}}}',
    );
    expect(r.status).toBe(400);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect((await api.get('/health')).status).toBe(200);
  });

  it('turns an unexpected exception into a bare 500 that leaks nothing, and logs it scrubbed', async () => {
    const r = await api.get('/v1/test/boom');
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('internal');
    expect(JSON.stringify(r.body)).not.toMatch(/SELECT|secrets|wa_leak/);
    const logged = lines.filter((l) => l.includes('unhandled error')).join('\n');
    expect(logged).toContain('unhandled error');
    expect(logged).not.toMatch(/wa_leakleak/);
  });

  it('renders a known error with its status and code', async () => {
    const r = await api.get('/v1/test/teapot');
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'conflict', message: 'a known error' });
  });

  it('CORS: only an exact allowed origin is echoed; a preflight from another origin is refused', async () => {
    const ok = await fetch(`${h.base}/v1/auth/providers`, {
      headers: { origin: 'https://game.example.test' },
    });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://game.example.test');
    const no = await fetch(`${h.base}/v1/auth/providers`, { headers: { origin: 'https://evil.example' } });
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await fetch(`${h.base}/v1/me`, {
      method: 'OPTIONS',
      headers: { origin: 'https://game.example.test' },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(
      (await fetch(`${h.base}/v1/me`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }))
        .status,
    ).toBe(403);
    expect(ok.headers.get('access-control-allow-credentials')).toBeNull(); // bearer tokens, never cookies
  });

  it('never writes a token, an Authorization header, an address or a request body to the log', async () => {
    const g = await newGuest(api, 'Log Check');
    await api.get('/v1/me', g.access);
    await api.post('/v1/auth/refresh', { refreshToken: g.refresh });
    const all = lines.join('\n');
    expect(all).toContain('"route":"GET /v1/me"');
    expect(all).not.toContain(g.access);
    expect(all).not.toContain(g.refresh);
    expect(all).not.toMatch(/\bwa_[A-Za-z0-9_-]{20,}/);
    expect(all).not.toMatch(/\bwr_[A-Za-z0-9_-]{20,}/);
    expect(all).not.toContain('Log Check');
    expect(all).not.toContain('127.0.0.1');
    expect(all).not.toContain(g.friendCode);
  });
});
