/* eslint-disable @typescript-eslint/no-explicit-any -- test code reads JSON bodies of many shapes */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createPgDb } from '../src/db/pg';
import { createPgliteDb } from '../src/db/pglite';
import type { Db } from '../src/db/types';
import { createPlatform } from '../src/app';
import type { Platform, PlatformOverrides } from '../src/app';
import { loadConfig } from '../src/config';
import type { PlatformConfig } from '../src/config';
import type { RateLimiter } from '../src/http/rateLimit';
import { signServiceRequest } from '../src/http/serviceAuth';
import { silentLogger } from '../src/logger';

export const TEST_SECRET = 'm'.repeat(40);
export const TEST_ADMIN = 'a'.repeat(40);

export interface FakeClock {
  now: Date;
  clock: () => Date;
  advance(ms: number): void;
}

export function fakeClock(start = '2026-11-25T10:00:00.000Z'): FakeClock {
  const c: FakeClock = {
    now: new Date(start),
    clock: () => new Date(c.now.getTime()),
    advance(ms) {
      c.now = new Date(c.now.getTime() + ms);
    },
  };
  return c;
}

export const unlimited: RateLimiter = { take: () => ({ ok: true }) };

/**
 * The database under test. Default: PGlite (real Postgres engine in-process, hermetic). With PLATFORM_TEST_DATABASE_URL set
 * (a real Postgres server, e.g. the Docker one) every harness gets its own throw-away SCHEMA on that server instead, so the
 * very same suite proves the SQL on the production engine.
 */
export async function makeTestDb(): Promise<Db> {
  const url = process.env.PLATFORM_TEST_DATABASE_URL;
  if (!url) return createPgliteDb();
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const sep = url.includes('?') ? '&' : '?';
  const db = createPgDb(`${url}${sep}options=${encodeURIComponent(`-c search_path=${schema}`)}`, { max: 4 });
  const close = db.close.bind(db);
  return {
    ...db,
    close: async () => {
      await close();
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      await c.query(`DROP SCHEMA ${schema} CASCADE`);
      await c.end();
    },
  };
}

export interface Harness {
  platform: Platform;
  clock: FakeClock;
  base: string;
  close(): Promise<void>;
}

export async function startHarness(
  env: Record<string, string | undefined> = {},
  o: PlatformOverrides & { config?: Partial<PlatformConfig> } = {},
): Promise<Harness> {
  const clock = fakeClock();
  const config: PlatformConfig = {
    ...loadConfig({
      PLATFORM_ENV: 'test',
      PLATFORM_MOCK_IDP: '1',
      PORT: '0',
      PLATFORM_GOOGLE_CLIENT_IDS: '',
      PLATFORM_MATCH_SERVER_SECRET: TEST_SECRET,
      PLATFORM_ADMIN_TOKEN: TEST_ADMIN,
      ...env,
    }),
    ...o.config,
  };
  const platform = await createPlatform(config, await makeTestDb(), {
    clock: clock.clock,
    logger: silentLogger,
    limiter: unlimited,
    ...o,
  });
  const port = await platform.start();
  return { platform, clock, base: `http://127.0.0.1:${port}`, close: () => platform.close() };
}

export interface Reply<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export function client(base: string) {
  async function call<T = any>(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
    headers: Record<string, string> = {},
  ): Promise<Reply<T>> {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  }
  return {
    call,
    get: <T = any>(p: string, t?: string) => call<T>('GET', p, undefined, t),
    post: <T = any>(p: string, b?: unknown, t?: string) => call<T>('POST', p, b ?? {}, t),
    patch: <T = any>(p: string, b: unknown, t?: string) => call<T>('PATCH', p, b, t),
    del: <T = any>(p: string, t?: string) => call<T>('DELETE', p, undefined, t),
  };
}

export type Api = ReturnType<typeof client>;

/** A guest with a session, the way a real client starts. */
export async function newGuest(api: Api, nickname?: string) {
  const r = await api.post('/v1/auth/guest', nickname ? { nickname, platform: 'dev' } : { platform: 'dev' });
  if (r.status !== 201) throw new Error(`guest failed: ${r.status} ${JSON.stringify(r.body)}`);
  return {
    id: r.body.profile.id as string,
    name: r.body.profile.displayName as string,
    friendCode: r.body.profile.friendCode as string,
    access: r.body.tokens.accessToken as string,
    refresh: r.body.tokens.refreshToken as string,
    profile: r.body.profile,
  };
}

/** A registered player through the mock identity provider (server-verified id token with a server-issued nonce). */
export async function mockCredential(api: Api, subject: string, email?: string) {
  const n = await api.post('/v1/auth/nonce');
  const t = await api.post('/v1/dev/mock-idp/token', {
    subject,
    nonce: n.body.nonce,
    ...(email ? { email } : {}),
  });
  return t.body.credential as string;
}

export async function newRegistered(api: Api, subject: string, nickname?: string) {
  const credential = await mockCredential(api, subject, `${subject}@example.test`);
  const r = await api.post('/v1/auth/signin', {
    provider: 'mock',
    credential,
    platform: 'dev',
    ...(nickname ? { nickname } : {}),
  });
  if (r.status !== 201 && r.status !== 200)
    throw new Error(`signin failed: ${r.status} ${JSON.stringify(r.body)}`);
  return {
    id: r.body.profile.id as string,
    name: r.body.profile.displayName as string,
    friendCode: r.body.profile.friendCode as string,
    access: r.body.tokens.accessToken as string,
    refresh: r.body.tokens.refreshToken as string,
    profile: r.body.profile,
  };
}

/** A call as the MATCH SERVER makes it: HMAC-signed with the shared secret. */
export async function internalCall(
  base: string,
  clock: FakeClock,
  path: string,
  body: unknown,
  opts: { secret?: string; ts?: number; method?: string } = {},
): Promise<Reply> {
  const method = opts.method ?? 'POST';
  const raw = JSON.stringify(body);
  const ts = opts.ts ?? clock.now.getTime();
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-wahala-timestamp': String(ts),
      'x-wahala-signature': signServiceRequest(opts.secret ?? TEST_SECRET, ts, method, path, raw),
    },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
}

/** Two or more guests that are friends with each other (through the real friend-code flow). */
export async function befriend(api: Api, a: { access: string }, b: { friendCode: string; access: string }) {
  const sent = await api.post('/v1/friends/requests', { code: b.friendCode }, a.access);
  if (sent.status !== 201 && sent.status !== 200)
    throw new Error(`friend request failed: ${sent.status} ${JSON.stringify(sent.body)}`);
  const incoming = await api.get('/v1/friends/requests', b.access);
  const id = incoming.body.incoming[0].id as string;
  const acc = await api.post(`/v1/friends/requests/${id}/accept`, {}, b.access);
  if (acc.status !== 200) throw new Error(`accept failed: ${acc.status}`);
}
