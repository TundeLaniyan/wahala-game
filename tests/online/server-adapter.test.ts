/**
 * The REAL adapter skeleton, exercised only with fake transports: no socket and no fetch is ever created here.
 * (Importing it directly is fine; what must not happen is a default build reaching it: tests/platform-static.test.ts.)
 */
import { describe, expect, it, vi } from 'vitest';
import { createServerOnline, streamUrl } from '../../src/online/server/adapter';
import { createHttp, errorFromStatus } from '../../src/online/server/http';
import { DEFAULT_BACKOFF, ManagedSocket, backoffDelay } from '../../src/online/server/socket';
import type { SocketLike } from '../../src/online/server/socket';
import { PROTOCOL_VERSION, toWire } from '../../src/online/schema';
import { makeOpaqueToken } from '../../src/online/util';
import { ok } from '../../src/online/result';

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((t: string) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(t: string) {
    this.sent.push(t);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const posts: { path: string; body: unknown }[] = [];
  const responses: Record<string, unknown> = {
    '/v1/auth/guest': {
      profile: { id: 'a1', displayName: 'Guest', guest: true, createdAt: 1 },
      token: 'tok-secret-123',
      expiresAt: 9e12,
    },
  };
  const client = createServerOnline(
    { url: 'https://api.example.invalid/game' },
    {
      http: {
        async post(path, body) {
          posts.push({ path, body });
          return ok(responses[path] ?? {});
        },
      },
      socket: {
        factory: () => {
          const s = new FakeSocket();
          sockets.push(s);
          return s;
        },
        random: () => 0.5,
        setTimer: (fn, ms) => {
          timers.push({ fn, ms });
          return timers.length;
        },
        clearTimer: () => undefined,
      },
    },
  );
  return { client, sockets, timers, posts, responses };
}

describe('server adapter: transport mapping', () => {
  it('derives a secure stream URL from the API URL (scheme from the config, never from input)', () => {
    expect(streamUrl('https://api.example.invalid/game/')).toBe('wss://api.example.invalid/game/v1/stream');
    expect(streamUrl('http://localhost:8080')).toBe('ws://localhost:8080/v1/stream');
    expect(streamUrl('https://h.invalid/x?token=1#frag')).toBe('wss://h.invalid/x/v1/stream');
  });

  it('maps HTTP statuses to the shared error union', () => {
    expect(errorFromStatus(401).code).toBe('unauthenticated');
    expect(errorFromStatus(403).code).toBe('forbidden');
    expect(errorFromStatus(404).code).toBe('notFound');
    expect(errorFromStatus(409).code).toBe('conflict');
    expect(errorFromStatus(422).code).toBe('invalidMessage');
    expect(errorFromStatus(426).code).toBe('versionMismatch');
    expect(errorFromStatus(429, 3)).toMatchObject({ code: 'rateLimited', retryAfterMs: 3000 });
    expect(errorFromStatus(503).code).toBe('serverUnavailable');
    expect(errorFromStatus(418).code).toBe('internal');
  });

  it('the HTTP client never throws: network failure, timeout and bad status become results; the token goes in the header only', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const token = makeOpaqueToken('tok-secret-xyz', 9e12);
    const okFetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"a":1}', { status: 200 });
    });
    const http = createHttp('https://api.example.invalid/', () => token, { fetch: okFetch as never });
    expect(await http.post('/v1/x', { q: 1 })).toMatchObject({ ok: true, value: { a: 1 } });
    expect(calls[0]!.url).toBe('https://api.example.invalid/v1/x');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer tok-secret-xyz');
    expect(calls[0]!.url).not.toContain('tok-secret');
    expect(String(calls[0]!.init.body)).not.toContain('tok-secret');
    expect(calls[0]!.init.credentials).toBe('omit');

    const down = createHttp('https://x.invalid', () => null, {
      fetch: (async () => Promise.reject(new TypeError('offline'))) as never,
    });
    expect(await down.post('/v1/x')).toMatchObject({ ok: false, error: { code: 'serverUnavailable' } });
    const slow = createHttp('https://x.invalid', () => null, {
      timeoutMs: 5,
      fetch: ((_: string, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal?.addEventListener('abort', () =>
            rej(Object.assign(new Error('a'), { name: 'AbortError' })),
          ),
        )) as never,
    });
    expect(await slow.post('/v1/x')).toMatchObject({ ok: false, error: { code: 'timeout' } });
    const bad = createHttp('https://x.invalid', () => null, {
      fetch: (async () => new Response('', { status: 429, headers: { 'retry-after': '2' } })) as never,
    });
    expect(await bad.post('/v1/x')).toMatchObject({ error: { code: 'rateLimited', retryAfterMs: 2000 } });
  });
});

describe('server adapter: reconnecting socket', () => {
  it('backoff is exponential, capped and jittered; pure given the random source', () => {
    const d = (n: number, r = 1) => backoffDelay(n, () => r);
    expect(d(0)).toBe(500);
    expect(d(1)).toBe(1000);
    expect(d(2)).toBe(2000);
    expect(d(20)).toBe(DEFAULT_BACKOFF.maxMs);
    expect(backoffDelay(3, () => 0)).toBe(Math.round(4000 * 0.7));
    for (let i = 0; i < 10; i++) {
      expect(backoffDelay(i, () => 0.37)).toBeLessThanOrEqual(DEFAULT_BACKOFF.maxMs);
    }
  });

  it('reconnects after a drop with growing delays, resets after a successful open, stops on close', () => {
    const sockets: FakeSocket[] = [];
    const timers: { fn: () => void; ms: number }[] = [];
    const states: string[] = [];
    let opens = 0;
    const ms = new ManagedSocket(
      'wss://x.invalid',
      { onOpen: () => void opens++, onText: () => undefined, onState: (s) => states.push(s) },
      {
        factory: () => {
          const s = new FakeSocket();
          sockets.push(s);
          return s;
        },
        random: () => 1,
        setTimer: (fn, delay) => {
          timers.push({ fn, ms: delay });
          return timers.length;
        },
        clearTimer: () => undefined,
      },
    );
    ms.connect();
    sockets[0]!.onopen?.();
    expect(ms.state).toBe('open');
    expect(ms.send('hi')).toBe(true);
    sockets[0]!.onclose?.(); // dropped
    expect(ms.state).toBe('reconnecting');
    timers.pop()!.fn();
    sockets[1]!.onclose?.(); // the retry failed
    expect(timers.at(-1)!.ms).toBe(1000);
    timers.pop()!.fn();
    sockets[2]!.onopen?.();
    expect(opens).toBe(2);
    expect(ms.attempts).toBe(0);
    ms.close();
    expect(ms.state).toBe('closed');
    expect(ms.send('x')).toBe(false);
    expect(states).toContain('reconnecting');
    sockets[2]!.onclose?.();
    expect(timers).toHaveLength(0); // no retry after an intentional close
  });

  it('a factory that throws is retried, not propagated', () => {
    const timers: number[] = [];
    const ms = new ManagedSocket(
      'wss://x.invalid',
      { onOpen: () => undefined, onText: () => undefined, onState: () => undefined },
      {
        factory: () => {
          throw new Error('blocked');
        },
        setTimer: (_fn, delay) => timers.push(delay),
      },
    );
    expect(() => ms.connect()).not.toThrow();
    expect(timers).toHaveLength(1);
  });
});

describe('server adapter: client', () => {
  it('sign-in keeps the token in memory, opens the stream and sends hello with it as the first frame', async () => {
    const h = harness();
    const s = await h.client.accounts.signInGuest('Guest');
    expect(s).toMatchObject({ ok: true });
    if (!s.ok) return;
    expect(JSON.stringify(s.value)).not.toContain('tok-secret');
    expect(h.sockets).toHaveLength(1);
    h.sockets[0]!.onopen?.();
    const hello = JSON.parse(h.sockets[0]!.sent[0]!);
    expect(hello).toMatchObject({
      type: 'hello',
      v: PROTOCOL_VERSION,
      client: 'wahala-web',
      token: 'tok-secret-123',
    });
    expect(h.client.connection()).toBe('connected');
  });

  it('server frames are validated: good ones reach subscribers, bad ones are dropped', async () => {
    const h = harness();
    await h.client.accounts.signInGuest();
    h.sockets[0]!.onopen?.();
    const seen: string[] = [];
    h.client.events.subscribe((e) => seen.push(e.type));
    h.sockets[0]!.onmessage?.(
      JSON.stringify(toWire({ type: 'match.countdown', matchId: 'm', secondsLeft: 2 })),
    );
    h.sockets[0]!.onmessage?.('{"v":1,"type":"room.update","room":"no"}');
    h.sockets[0]!.onmessage?.('not json');
    h.sockets[0]!.onmessage?.(JSON.stringify({ v: 99, type: 'pong', t: 1 }));
    h.sockets[0]!.onmessage?.(JSON.stringify({ v: 1, type: 'who.knows' }));
    expect(seen).toEqual(['match.countdown']);
  });

  it('input goes over the socket as a validated frame; commands go over HTTP', async () => {
    const h = harness();
    await h.client.accounts.signInGuest();
    h.sockets[0]!.onopen?.();
    expect(await h.client.matches.submitInput('m-1', 12, { move: 'up' })).toMatchObject({ ok: true });
    expect(JSON.parse(h.sockets[0]!.sent.at(-1)!)).toMatchObject({
      type: 'match.input',
      matchId: 'm-1',
      tick: 12,
      intent: { move: 'up' },
    });
    await h.client.parties.invite('p1', 'f1');
    expect(h.posts.at(-1)).toEqual({ path: '/v1/party/invite', body: { partyId: 'p1', friendId: 'f1' } });
    // not connected -> a clean error, never a throw
    h.sockets[0]!.onclose?.();
    expect(await h.client.matches.submitInput('m-1', 13, {})).toMatchObject({
      ok: false,
      error: { code: 'serverUnavailable' },
    });
  });

  it('sign-out and dispose forget the token and close the stream', async () => {
    const h = harness();
    await h.client.accounts.signInGuest();
    await h.client.accounts.signOut();
    expect(h.sockets[0]!.closed).toBe(true);
    expect(h.client.connection()).toBe('offline');
    h.client.dispose();
  });

  it('rejects a malformed sign-in response instead of trusting it', async () => {
    const h = harness();
    h.responses['/v1/auth/guest'] = { nope: true };
    expect(await h.client.accounts.signInGuest()).toMatchObject({ ok: false, error: { code: 'internal' } });
    expect(h.sockets).toHaveLength(0);
  });
});
