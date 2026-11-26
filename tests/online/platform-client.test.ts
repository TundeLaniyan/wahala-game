/**
 * The player-platform HTTP client (src/online/platform/client.ts, tokens.ts) against an in-memory platform: guest sign-in,
 * ROTATING refresh (one refresh for concurrent 401s, an old refresh token never presented again), the error envelope,
 * timeouts and a platform that is down, and storage that throws (private mode keeps the session in memory).
 */
import { describe, expect, it } from 'vitest';
import { PlatformClient, isOutage } from '../../src/online/platform/client';
import { PLATFORM_STORAGE_KEY, createTokenStore, parseSession } from '../../src/online/platform/tokens';
import { FakePlatform, memStorage } from './fakePlatform';

const BASE = 'http://platform.test:4567';

function setup(storage = memStorage()) {
  const fake = new FakePlatform();
  const tokens = createTokenStore(() => storage);
  const client = new PlatformClient({ baseUrl: BASE, tokens, fetch: fake.fetch, timeoutMs: 200 });
  return { fake, tokens, client, storage };
}

describe('guest sign-in and the stored session', () => {
  it('nothing is requested until a call is made (constructing the client is free)', () => {
    const { fake } = setup();
    expect(fake.requests).toEqual([]);
  });

  it('ensureGuest creates ONE guest, stores the tokens under wahala.platform.v1 and reuses them afterwards', async () => {
    const { fake, client, storage } = setup();
    const first = await client.ensureGuest('Ada');
    expect(first.ok && first.value.displayName).toBe('Ada');
    const stored = parseSession(storage.map.get(PLATFORM_STORAGE_KEY) ?? null);
    expect(stored?.accessToken).toMatch(/^acc-/);
    expect(stored?.refreshToken).toMatch(/^ref-/);
    const again = await client.ensureGuest('Ada');
    expect(again.ok && again.value.id).toBe(first.ok && first.value.id);
    expect(fake.requests.filter((r) => r.path === '/v1/auth/guest')).toHaveLength(1);
    expect(fake.requests.at(-1)).toMatchObject({ method: 'GET', path: '/v1/me' });
    expect(fake.requests.at(-1)!.auth).toBe(`Bearer ${stored!.accessToken}`);
  });

  it('a taken or refused first nickname falls back to a platform-picked one', async () => {
    const { fake, client } = setup();
    fake.addPlayer('Ada');
    const r = await client.ensureGuest('Ada');
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.displayName).not.toBe('Ada');
    const guests = fake.requests.filter((q) => q.path === '/v1/auth/guest');
    expect(guests.map((q) => q.body)).toEqual([{ platform: 'web', nickname: 'Ada' }, { platform: 'web' }]);
  });

  it('a session the platform no longer knows is replaced by a new guest', async () => {
    const { fake, client } = setup();
    await client.ensureGuest();
    for (const s of fake.sessions) s.revoked = true;
    const r = await client.ensureGuest();
    expect(r.ok).toBe(true);
    expect(fake.requests.filter((q) => q.path === '/v1/auth/guest')).toHaveLength(2);
  });
});

describe('refresh rotation (the platform rotates BOTH tokens and revokes a session whose old refresh token comes back)', () => {
  it('a 401 refreshes once and repeats the request with the new access token', async () => {
    const { fake, client, tokens } = setup();
    await client.ensureGuest();
    const before = tokens.get()!;
    fake.expireAccess();
    const me = await client.me();
    expect(me.ok).toBe(true);
    const after = tokens.get()!;
    expect(after.refreshToken).not.toBe(before.refreshToken);
    expect(after.accessToken).not.toBe(before.accessToken);
    expect(fake.refreshTokensSent()).toEqual([before.refreshToken]);
  });

  it('concurrent 401s share ONE refresh; every request then succeeds', async () => {
    const { fake, client } = setup();
    await client.ensureGuest();
    fake.expireAccess();
    const results = await Promise.all([
      client.me(),
      client.friends(),
      client.blocks(),
      client.mutes(),
      client.invites(),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fake.refreshTokensSent()).toHaveLength(1);
    expect(fake.sessions.every((s) => !s.revoked)).toBe(true);
  });

  it('never presents a refresh token twice, over many expiries', async () => {
    const { fake, client } = setup();
    await client.ensureGuest();
    for (let i = 0; i < 5; i++) {
      fake.expireAccess();
      await Promise.all([client.me(), client.friends()]);
    }
    const sent = fake.refreshTokensSent();
    expect(sent).toHaveLength(5);
    expect(new Set(sent).size).toBe(sent.length);
    expect(fake.sessions.some((s) => s.revoked)).toBe(false);
  });

  it('a request made with an old access token after another call already refreshed uses the new tokens (no second refresh)', async () => {
    const { fake, client, tokens } = setup();
    await client.ensureGuest();
    const old = tokens.get()!;
    fake.expireAccess();
    await client.me(); // refreshes
    // simulate a call that read the session before the refresh and got a 401 now: the stored session is already newer
    tokens.set({ ...tokens.get()!, sessionId: 's' });
    expect(tokens.get()!.accessToken).not.toBe(old.accessToken);
    await client.friends();
    expect(fake.refreshTokensSent()).toHaveLength(1);
  });

  it('a refused refresh forgets the session (it is never sent again) and reports unauthenticated', async () => {
    const { fake, client, tokens } = setup();
    await client.ensureGuest();
    for (const s of fake.sessions) s.revoked = true;
    fake.expireAccess();
    const r = await client.me();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('unauthenticated');
    expect(tokens.get()).toBeNull();
    const sentBefore = fake.refreshTokensSent().length;
    await client.friends();
    expect(fake.refreshTokensSent()).toHaveLength(sentBefore);
  });

  it('a session rotated by ANOTHER TAB is picked up from storage instead of refreshing again', async () => {
    const storage = memStorage();
    const a = setup(storage);
    await a.client.ensureGuest();
    const tabB = new PlatformClient({
      baseUrl: BASE,
      tokens: createTokenStore(() => storage),
      fetch: a.fake.fetch,
    });
    a.fake.expireAccess();
    await a.client.me(); // tab A rotates; tab B reads storage on its next call
    const r = await tabB.me();
    expect(r.ok).toBe(true);
    expect(a.fake.refreshTokensSent()).toHaveLength(1);
  });
});

describe('errors, timeouts and a platform that is down', () => {
  it('parses the error envelope { error: { code, message, requestId, retryAfterMs } }', async () => {
    const { client } = setup();
    await client.ensureGuest();
    await client.setNickname('Bisi');
    const r = await client.setNickname('Bisi 2');
    expect(r).toEqual({
      ok: false,
      error: {
        code: 'rate_limited',
        message: 'You can change your name once a day.',
        status: 429,
        requestId: 'req-1',
        retryAfterMs: 20 * 3600_000,
      },
    });
  });

  it('a platform that is down is an outage error value, never a throw', async () => {
    const { fake, client } = setup();
    fake.down = true;
    const r = await client.ensureGuest();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('network');
    expect(!r.ok && isOutage(r.error)).toBe(true);
    fake.down = false;
    fake.failStatus = 503;
    const s = await client.ensureGuest();
    expect(!s.ok && s.error.status).toBe(503);
    expect(!s.ok && isOutage(s.error)).toBe(true);
  });

  it('a request that never answers times out as a network error', async () => {
    const hang = (_u: string, init: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        ),
      );
    const client = new PlatformClient({
      baseUrl: BASE,
      tokens: createTokenStore(() => memStorage()),
      fetch: hang,
      timeoutMs: 20,
    });
    const r = await client.ensureGuest();
    expect(!r.ok && r.error.code).toBe('network');
    expect(!r.ok && r.error.message).toMatch(/did not answer in time/);
  });

  it('a body never carries a player id, status or owner field (identity is the token): only route keys', async () => {
    const { fake, client } = setup();
    const other = fake.addPlayer('Bisi');
    await client.ensureGuest('Ada');
    await client.sendFriendRequest(other.friendCode);
    const party = await client.createParty('team');
    if (!party.ok) throw new Error('party');
    await client.setPartyMode(party.value.id, 'ffa');
    await client.setReady(party.value.id, true);
    await client.ticket(party.value.id);
    await client.openMatch(party.value.id, 'K7M3QX');
    await client.mute(other.id);
    await client.block(other.id);
    await client.report({
      reportedId: other.id,
      category: 'spam',
      context: 'profile',
      contextRef: null,
      note: null,
    });
    await client.heartbeat();
    const keys = new Set(fake.requests.flatMap((r) => Object.keys(r.body ?? {})));
    for (const k of ['playerId', 'owner', 'ownerId', 'leaderId', 'id', 'kind'])
      expect(keys.has(k), k).toBe(false);
    // only report targets name a player in a body (the route's own field)
    expect([...keys].sort()).toEqual(
      [
        'category',
        'code',
        'context',
        'mode',
        'nickname',
        'platform',
        'ready',
        'reportedId',
        'roomCode',
        'status',
      ].sort(),
    );
    // `status` here is the presence heartbeat's own field ("online"), never an account status
    expect(fake.requests.find((r) => r.body && 'status' in r.body)?.path).toBe('/v1/presence');
  });

  it('every request goes to the configured platform base URL only, without cookies', async () => {
    const urls: string[] = [];
    const creds: (RequestCredentials | undefined)[] = [];
    const fake = new FakePlatform();
    const storage = memStorage();
    const client = new PlatformClient({
      baseUrl: BASE,
      tokens: createTokenStore(() => storage),
      fetch: (u, i) => {
        urls.push(u);
        creds.push(i.credentials);
        return fake.fetch(u, i);
      },
    });
    await client.ensureGuest();
    expect((await client.friends()).ok).toBe(true);
    expect(urls.every((u) => u.startsWith(`${BASE}/v1/`))).toBe(true);
    expect(creds.every((c) => c === 'omit')).toBe(true);
  });
});

describe('storage that throws or is missing (private mode)', () => {
  it('a store whose storage throws keeps the session in memory and the client still works', async () => {
    const { client, tokens, fake } = setup(memStorage(true));
    const r = await client.ensureGuest();
    expect(r.ok).toBe(true);
    expect(tokens.memoryOnly).toBe(true);
    expect(tokens.get()?.accessToken).toMatch(/^acc-/);
    fake.expireAccess();
    expect((await client.me()).ok).toBe(true);
  });

  it('no storage object at all (and a getter that throws) is the same', async () => {
    const fake = new FakePlatform();
    for (const getter of [
      () => null,
      () => {
        throw new Error('denied');
      },
    ]) {
      const client = new PlatformClient({
        baseUrl: BASE,
        tokens: createTokenStore(getter),
        fetch: fake.fetch,
      });
      expect((await client.ensureGuest()).ok).toBe(true);
      expect((await client.friends()).ok).toBe(true);
    }
  });

  it('malformed stored data reads as "no session"', () => {
    expect(parseSession('not json')).toBeNull();
    expect(parseSession('{"v":2,"accessToken":"a","refreshToken":"b"}')).toBeNull();
    expect(
      parseSession(
        JSON.stringify({
          v: 1,
          accessToken: 'a',
          refreshToken: 'b',
          accessExpiresAt: 'x',
          refreshExpiresAt: 'y',
        }),
      ),
    ).toMatchObject({ accessToken: 'a', refreshToken: 'b' });
  });
});
