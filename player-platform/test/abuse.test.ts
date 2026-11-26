import { afterAll, describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/http/rateLimit';
import { client, newGuest, startHarness } from './helpers';
import type { Harness } from './helpers';

async function limited(env: Record<string, string> = {}, config = {}): Promise<Harness> {
  const ref: { h?: Harness } = {};
  const h = (ref.h = await startHarness(env, {
    limiter: createRateLimiter(() => new Date(ref.h!.clock.now)),
    config,
  }));
  return h;
}

const open: Harness[] = [];
afterAll(async () => {
  for (const h of open) await h.close();
});

describe('rate limiting and abuse', () => {
  it('limits anonymous guest creation per address and tells the client when to retry', async () => {
    const h = await limited();
    open.push(h);
    const api = client(h.base);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await api.post('/v1/auth/guest', {})).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429, 429]);
    const blocked = await api.post('/v1/auth/guest', {});
    expect(blocked.body.error.code).toBe('rate_limited');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(blocked.body.error.retryAfterMs).toBeGreaterThan(0);
    h.clock.advance(11_000); // 6 / minute: one token every 10 s
    expect((await api.post('/v1/auth/guest', {})).status).toBe(201);
  });

  it('a forged X-Forwarded-For does NOT buy a fresh bucket unless the peer is a trusted proxy', async () => {
    const h = await limited();
    open.push(h);
    const api = client(h.base);
    let blocked = 0;
    for (let i = 0; i < 9; i++) {
      const r = await api.call('POST', '/v1/auth/guest', {}, undefined, {
        'x-forwarded-for': `203.0.113.${i + 1}`,
      });
      if (r.status === 429) blocked++;
    }
    expect(blocked).toBe(4);
  });

  it('behind a configured proxy the forwarded address IS used (per real client, not per proxy)', async () => {
    const h = await limited({ PLATFORM_TRUSTED_PROXIES: '127.0.0.1' });
    open.push(h);
    const api = client(h.base);
    for (let i = 0; i < 8; i++) {
      const r = await api.call('POST', '/v1/auth/guest', {}, undefined, {
        'x-forwarded-for': `203.0.113.${i + 1}`,
      });
      expect(r.status).toBe(201); // each client address has its own bucket
    }
    // but one client cannot hide behind a hop it controls: the right-most untrusted address is the client
    let blocked = 0;
    for (let i = 0; i < 8; i++) {
      const r = await api.call('POST', '/v1/auth/guest', {}, undefined, {
        'x-forwarded-for': `198.51.100.${i + 1}, 203.0.113.99`,
      });
      if (r.status === 429) blocked++;
    }
    expect(blocked).toBe(3);
  });

  it('limits authenticated writes per player, and one player cannot exhaust another’s allowance', async () => {
    const h = await limited();
    open.push(h);
    const api = client(h.base);
    const a = await newGuest(api);
    const b = await newGuest(api);
    let blocked = 0;
    for (let i = 0; i < 40; i++)
      if (
        (await api.patch('/v1/me', { presenceVisibility: i % 2 ? 'friends' : 'nobody' }, a.access)).status ===
        429
      )
        blocked++;
    expect(blocked).toBeGreaterThan(5);
    expect((await api.patch('/v1/me', { presenceVisibility: 'nobody' }, b.access)).status).toBe(200);
  });

  it('throttles refresh-token guessing', async () => {
    const h = await limited();
    open.push(h);
    const api = client(h.base);
    const results: number[] = [];
    for (let i = 0; i < 30; i++)
      results.push((await api.post('/v1/auth/refresh', { refreshToken: `wr_${'a'.repeat(40)}${i}` })).status);
    expect(results.filter((s) => s === 401).length).toBe(20);
    expect(results.filter((s) => s === 429).length).toBe(10);
  });

  it('the in-memory limiter stays bounded under a flood of distinct keys', () => {
    let now = 0;
    const limiter = createRateLimiter(() => new Date(now), 1000);
    for (let i = 0; i < 50_000; i++) limiter.take(`ip:${i}`, { burst: 1, perMin: 1 });
    // still answers, did not grow without bound (no direct size probe: a second pass must not throw or hang)
    expect(limiter.take('ip:new', { burst: 1, perMin: 1 }).ok).toBe(true);
    expect(limiter.take('ip:new', { burst: 1, perMin: 1 }).ok).toBe(false);
    now += 120_000;
    expect(limiter.take('ip:new', { burst: 1, perMin: 1 }).ok).toBe(true);
  });
});
