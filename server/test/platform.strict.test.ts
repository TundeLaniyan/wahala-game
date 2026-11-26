/**
 * Hosted private beta (`RUMBLE_REQUIRE_TICKET=1`, decision FC-1): the match server is not a way around the invite gate. The platform
 * only issues tickets to accounts that were created with an invite code, so a server that refuses every network matchmaking request
 * without a valid ticket admits invited players only, even to someone who talks to it directly (raw HTTP, the SDK, a script).
 * Real server, real sockets, real Ed25519 tickets from the platform's own signer. (One server per file: Colyseus' matchmaker is a
 * process singleton.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandoffSigner } from '../../player-platform/src/handoff/signer';
import { PlatformLink, loadPlatformConfig } from '../src/core/platform';
import type { PlatformConfig } from '../src/core/platform';
import { MSG } from '../../src/net/protocol';
import { create, dropSocket, joinById, joinOrCreate, until, startTestServer } from './helpers';
import type { TestServer } from './helpers';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

let signer: Awaited<ReturnType<typeof createHandoffSigner>>;
let attacker: Awaited<ReturnType<typeof createHandoffSigner>>;
let server: TestServer;
const cfg: PlatformConfig = {
  jwksUrl: 'http://platform.invalid/.well-known/jwks.json',
  audience: 'wahala-rumble',
  internalUrl: null,
  secret: null,
  requireTicket: true,
};

const ticket = async (sub: string, name: string, room: string): Promise<string> =>
  (await signer.sign({ sub, name, char: 'streetBaller', room, party: null, restricted: false })).token;

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as Error).message);
  }
  return 'accepted';
}

/** A hand-made request to the matchmaker, exactly what a script outside the game would send. */
async function raw(path: string, body: unknown): Promise<{ status: number; text: string }> {
  const r = await fetch(`${server.http}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, text: await r.text() };
}

beforeAll(async () => {
  signer = await createHandoffSigner({ audience: 'wahala-rumble', clock: () => new Date() });
  attacker = await createHandoffSigner({ audience: 'wahala-rumble', clock: () => new Date() });
  server = await startTestServer(
    { defaultAutoStartSec: 0.4 },
    { platform: new PlatformLink(cfg, { keys: signer.keys() }) },
  );
});
afterAll(async () => {
  await server.close();
});

describe('a server that requires tickets', () => {
  it('refuses a plain guest on every matchmaking entry point (create, join by code, quick play)', async () => {
    expect(await refusal(create(server, 'Gus', { private: true }))).toMatch(/invited players only/);
    expect(await refusal(joinOrCreate(server, 'Gus', { mode: 'ffa' }))).toMatch(/quick play is closed/);
    expect(await refusal(joinById(server, 'ABCDEF', 'Gus'))).toMatch(/invited players only/);
  });

  it('refuses raw HTTP matchmaking without a ticket: no browser, no SDK, no game client needed to be refused', async () => {
    for (const path of [
      '/matchmake/create/rumble',
      '/matchmake/joinOrCreate/rumble',
      '/matchmake/join/rumble',
      '/matchmake/joinById/ABCDEF',
    ]) {
      const r = await raw(path, { name: 'Mallory', private: true });
      expect(r.status, path).toBeGreaterThanOrEqual(400);
      expect(r.status, path).toBeLessThan(500);
      expect(r.text, path).not.toMatch(/sessionId|reservation/i);
    }
    // a wrong-typed ticket is a refusal, not a crash and not a seat
    for (const bad of [123, {}, [], '', 'a.b.c', 'not-a-jwt', null]) {
      const r = await raw('/matchmake/create/rumble', { name: 'Mallory', private: true, ticket: bad });
      expect(r.status, JSON.stringify(bad)).toBeGreaterThanOrEqual(400);
      expect(r.text).not.toMatch(/sessionId/);
    }
  });

  it('refuses a forged ticket (a well-formed one signed by another key) and a ticket aimed at a room it was not issued for', async () => {
    const forged = (
      await attacker.sign({
        sub: A,
        name: 'Ada',
        char: '',
        room: '*',
        party: null,
        restricted: false,
      })
    ).token;
    expect(await refusal(create(server, 'x', { private: true, ticket: forged }))).toMatch(/invalid ticket/);
    expect(await refusal(create(server, 'x', { private: true, ticket: await ticket(A, 'Ada', 'ZZZZZZ') }))).toMatch(
      /not valid for this room/,
    );
  });

  it('admits a platform-ticketed host and member to ONE room, with the platform names; a stranger with the code is still refused', async () => {
    const host = await create(server, 'typed-by-client', {
      private: true,
      durationSec: 10,
      ticket: await ticket(A, 'Ada', '*'),
    });
    await until('lobby', () => host.lobby !== null);
    const code = host.room.roomId;
    const member = await joinById(server, code, 'whatever', { ticket: await ticket(B, 'Bayo', code) });
    await until('both in', () => host.lobby?.members.length === 2);
    expect(host.lobby!.members.map((m) => m.name).sort()).toEqual(['Ada', 'Bayo']);
    expect(host.lobby!.members.every((m) => m.verified === true)).toBe(true);
    // somebody who learned the code (it is on screen, in a chat, in a URL) still cannot sit down
    expect(await refusal(joinById(server, code, 'Stranger'))).toMatch(/invited players only/);
    expect(await refusal(joinById(server, code, 'Stranger', { ticket: 'x.y.z' }))).toMatch(/invalid ticket/);
    expect(host.lobby!.members).toHaveLength(2);
    await member.leave();
    await host.leave();
  });

  it('a dropped seat still reconnects with the server\u2019s own reservation (reconnection is not matchmaking)', async () => {
    const host = await create(server, 'x', { private: true, durationSec: 30, ticket: await ticket(A, 'Ada', '*') });
    const code = host.room.roomId;
    const b = await joinById(server, code, 'xx', { ticket: await ticket(B, 'Bayo', code) });
    await until('two', () => host.lobby?.members.length === 2);
    host.room.send(MSG.start);
    await until('seats', () => host.seat !== null && b.seat !== null);
    const token = b.room.reconnectionToken;
    b.room.reconnection.enabled = false;
    dropSocket(code, b.room.sessionId);
    await until('host sees Bayo down', () => host.lobby?.members[1]?.connected === false);
    const room2 = await server.client().reconnect(token);
    b.attach(room2);
    await until('host sees Bayo back', () => host.lobby?.members[1]?.connected === true);
    expect(host.lobby!.members[1]).toMatchObject({ name: 'Bayo', verified: true, playerId: B });
    await b.leave();
    await host.leave();
  }, 60_000);
});

describe('configuration fails closed', () => {
  it('RUMBLE_REQUIRE_TICKET without the platform keys refuses to start', () => {
    expect(() => loadPlatformConfig({ RUMBLE_REQUIRE_TICKET: '1' })).toThrow(/PLATFORM_JWKS_URL/);
    const ok = loadPlatformConfig({ RUMBLE_REQUIRE_TICKET: '1', PLATFORM_JWKS_URL: 'http://p/jwks.json' });
    expect(ok.requireTicket).toBe(true);
    expect(loadPlatformConfig({}).requireTicket).toBe(false);
  });

  it('the match-server secret is read from the environment only (a secret FILE is turned into it by the container entrypoint, so the server imports no file system module)', () => {
    const cfg = loadPlatformConfig({
      PLATFORM_INTERNAL_URL: 'http://p:4567',
      PLATFORM_MATCH_SERVER_SECRET: 'env-secret-value',
    });
    expect(cfg.secret).toBe('env-secret-value');
    expect(loadPlatformConfig({ PLATFORM_INTERNAL_URL: 'http://p:4567' }).secret).toBeNull();
  });
});
