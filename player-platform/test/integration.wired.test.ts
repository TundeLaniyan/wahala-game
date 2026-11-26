/**
 * The WIRED integration (private multiplayer, decision MP-PLAT): the real platform (HTTP, real SQL engine) and the real City Rumble
 * server with its platform link switched on, talking to each other over HTTP exactly as in a local private test:
 *   guests -> party -> host ticket -> the leader creates the private room -> room code reported -> member ticket -> both in the
 *   SAME room as verified players -> the match is played to its end -> the SERVER (signed call) records the results -> match
 *   history, party back to the lobby. Also: a client-submitted result is refused, a guest cannot take a platform seat,
 *   a replayed ticket is refused, and a platform outage does not stop a match.
 *
 * (This replaces the earlier handshake against the UNMODIFIED server: a server that cannot verify tickets now refuses them.)
 *
 * Skipped (with a reason) when the match server's own dependencies are absent (`cd server && npm ci`).
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type * as ServerApp from '../../server/src/app';
import type * as ServerLimits from '../../server/src/core/limits';
import type * as ServerOptions from '../../server/src/core/options';
import type * as ServerPlatform from '../../server/src/core/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_SECRET, client, internalCall, newGuest, startHarness } from './helpers';
import type { Harness } from './helpers';

const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const haveServer = existsSync(`${serverDir}node_modules/@colyseus/core`);

interface SdkRoom {
  roomId: string;
  sessionId: string;
  send(type: string, msg?: unknown): void;
  onMessage(type: string, cb: (m: never) => void): void;
  leave(consented?: boolean): Promise<void>;
}
interface Lobby {
  code: string;
  phase: string;
  members: { name: string; isHost: boolean; verified?: boolean; playerId?: string }[];
}

describe.skipIf(!haveServer)('platform <-> match server, wired', () => {
  let h: Harness;
  let ms: { port: number; close(): Promise<void>; platform: ServerPlatform.PlatformLink };
  let Sdk: new (url: string) => {
    create(room: string, opts: unknown): Promise<SdkRoom>;
    joinById(id: string, opts: unknown): Promise<SdkRoom>;
  };
  let down = false;

  beforeAll(async () => {
    h = await startHarness();
    const imp = async <T>(rel: string): Promise<T> =>
      (await import(pathToFileURL(`${serverDir}${rel}`).href)) as T;
    const { startRumbleServer } = await imp<typeof ServerApp>('src/app.ts');
    const { DEFAULT_RUNTIME } = await imp<typeof ServerOptions>('src/core/options.ts');
    const { UNLIMITED_LIMITS } = await imp<typeof ServerLimits>('src/core/limits.ts');
    const { PlatformLink } = await imp<typeof ServerPlatform>('src/core/platform.ts');
    // the platform harness runs on a fake clock: the match server's link follows the same clock so tickets and signatures agree
    const link = new PlatformLink(
      {
        jwksUrl: `${h.base}/.well-known/jwks.json`,
        audience: 'wahala-rumble',
        internalUrl: h.base,
        secret: TEST_SECRET,
        requireTicket: false,
      },
      {
        now: () => h.clock.now.getTime(),
        fetch: (url, init) => {
          if (down) return Promise.reject(new Error('platform is down'));
          return fetch(url, init);
        },
      },
    );
    const server = await startRumbleServer({
      port: 0,
      host: '127.0.0.1',
      development: true,
      platform: link,
      runtime: {
        ...DEFAULT_RUNTIME,
        fast: true,
        countdownMs: 150,
        reconnectSeconds: 5,
        limits: UNLIMITED_LIMITS,
      },
    });
    ms = { port: server.port, close: () => server.close(), platform: link };
    const require = createRequire(`${serverDir}package.json`);
    Sdk = ((await import(pathToFileURL(require.resolve('@colyseus/sdk')).href)) as { Client: typeof Sdk })
      .Client;
  });
  afterAll(async () => {
    await ms?.close();
    await h?.close();
  });

  const until = async (what: string, cond: () => boolean, timeoutMs = 20_000) => {
    const end = Date.now() + timeoutMs;
    while (!cond()) {
      if (Date.now() > end) throw new Error(`timed out: ${what}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const sdk = () => new Sdk(`http://127.0.0.1:${ms.port}`);

  it('a party plays a real match; the SERVER records it; the client cannot', async () => {
    const api = client(h.base);
    const lead = await newGuest(api, 'Lead Lagos');
    const member = await newGuest(api, 'Member Abuja');
    const party = (await api.post('/v1/parties', { mode: 'ffa' }, lead.access)).body.party;
    await api.post('/v1/parties/join', { code: party.code }, member.access);

    // the leader: host ticket -> creates the private room on the match server -> reports the room code
    const host = (await api.post(`/v1/parties/${party.id}/match/ticket`, {}, lead.access)).body
      .ticket as string;
    const leadLobbies: Lobby[] = [];
    const leadRoom = await sdk().create('rumble', {
      private: true,
      game: 'deathmatch',
      durationSec: 5,
      name: lead.name,
      characterId: lead.profile.selectedCharacter,
      ticket: host,
    });
    leadRoom.onMessage('lobby', (m) => leadLobbies.push(m as unknown as Lobby));
    const roomCode = leadRoom.roomId;
    expect((await api.post(`/v1/parties/${party.id}/match`, { roomCode }, lead.access)).status).toBe(200);
    // the host ticket is single use: it cannot create a second room
    await expect(sdk().create('rumble', { private: true, name: 'Again', ticket: host })).rejects.toThrow(
      /ticket/,
    );

    // the member: ticket for THIS room -> joins it
    const mt = (await api.post(`/v1/parties/${party.id}/match/ticket`, {}, member.access)).body
      .ticket as string;
    const memberLobbies: Lobby[] = [];
    const memberRoom = await sdk().joinById(roomCode, {
      name: member.name,
      characterId: member.profile.selectedCharacter,
      ticket: mt,
    });
    memberRoom.onMessage('lobby', (m) => memberLobbies.push(m as unknown as Lobby));
    await expect(sdk().joinById(roomCode, { name: 'Replay', ticket: mt })).rejects.toThrow(/ticket/);

    // an impostor: a GUEST typing a verified player's name takes no platform seat and no badge
    const impostorLobbies: Lobby[] = [];
    const impostor = await sdk().joinById(roomCode, { name: lead.name });
    impostor.onMessage('lobby', (m) => impostorLobbies.push(m as unknown as Lobby));
    await until('three in the lobby', () => (leadLobbies.at(-1)?.members.length ?? 0) === 3);
    const members = leadLobbies.at(-1)!.members;
    expect(
      members
        .filter((m) => m.verified)
        .map((m) => m.playerId)
        .sort(),
    ).toEqual([lead.id, member.id].sort());
    const fake = members.find((m) => !m.verified)!;
    expect(fake.name).not.toBe(lead.name); // de-duplicated ("Lead Lagos 2"), and still unverified

    // play it to the end (5 s match; Free-for-All)
    const results: unknown[] = [];
    leadRoom.onMessage('results', (m) => results.push(m));
    leadRoom.send('start');
    await until('the match ended', () => results.length > 0, 120_000);

    // the SERVER reported it: both verified players have it in their history, the guest does not appear anywhere
    let mine: { matchId: string; you: { placement: number | null }; humans: number }[] = [];
    await until('platform has the match', () => {
      void api.get('/v1/me/matches', member.access).then((r) => (mine = r.body.matches));
      return mine.length === 1;
    });
    expect(mine[0]!.humans).toBe(2);
    expect(mine[0]!.matchId).toMatch(new RegExp(`^${roomCode}-1:[0-9a-f]{8}$`));
    const leadHistory = (await api.get('/v1/me/matches', lead.access)).body.matches;
    expect(leadHistory).toHaveLength(1);
    expect(leadHistory[0].you.placement).toBeGreaterThanOrEqual(1);

    // a client cannot record or alter a result: no player credential reaches the internal routes, and a forged signature is refused
    const bogus = {
      matchId: 'client-made-match',
      game: 'deathmatch',
      arenaId: 'rumbleOshodi',
      roomCode,
      seats: 32,
      startedAt: h.clock.now.toISOString(),
      participants: [],
    };
    expect((await api.post('/internal/v1/matches/started', bogus, member.access)).status).toBe(401);
    expect((await api.post('/internal/v1/matches/finished', bogus, member.access)).status).toBe(401);
    const wrongSecret = await internalCall(h.base, h.clock, '/internal/v1/matches/started', bogus, {
      secret: 'x'.repeat(40),
    });
    expect(wrongSecret.status).toBe(401);
    expect((await api.get('/v1/me/matches', member.access)).body.matches).toHaveLength(1);

    // a result naming a player the platform never ticketed for that room is refused (even with a valid signature)
    const stranger = await newGuest(api, 'Stranger Danger');
    const forged = await internalCall(h.base, h.clock, '/internal/v1/matches/started', {
      ...bogus,
      matchId: 'forged-by-server-bug',
      participants: [{ seat: 0, playerId: stranger.id, name: 'Stranger Danger', isBot: false, team: null }],
    });
    expect(forged.status).toBe(400);

    // REMATCH in the same, lingering room (the party was released when match 1 ended): the leader's host ticket is bound to this room
    // the first time it is accepted, so match 2 is recorded as well (found by the two-browser acceptance run)
    leadRoom.send('rematch');
    await until('back in the room lobby', () => leadLobbies.at(-1)?.phase === 'lobby', 30_000);
    results.length = 0;
    leadRoom.send('start');
    await until('the rematch ended', () => results.length > 0, 120_000);
    let again: unknown[] = [];
    await until('platform has both matches', () => {
      void api.get('/v1/me/matches', lead.access).then((r) => (again = r.body.matches));
      return again.length === 2;
    });
    expect(((await api.get('/v1/me/matches', member.access)).body.matches as unknown[]).length).toBe(2);

    await impostor.leave();
    await memberRoom.leave();
    await leadRoom.leave();
  }, 360_000);

  it('a platform outage never stops a ticketed match: it starts and ends, the result is simply not recorded', async () => {
    const api = client(h.base);
    const solo = await newGuest(api, 'Solo Lagos');
    const party = (await api.post('/v1/parties', { mode: 'ffa' }, solo.access)).body.party;
    const host = (await api.post(`/v1/parties/${party.id}/match/ticket`, {}, solo.access)).body
      .ticket as string;
    const results: unknown[] = [];
    const room = await sdk().create('rumble', {
      private: true,
      game: 'deathmatch',
      durationSec: 5,
      name: solo.name,
      ticket: host,
    });
    room.onMessage('results', (m) => results.push(m));
    const before = (await api.get('/v1/me/matches', solo.access)).body.matches.length;
    down = true;
    try {
      room.send('start');
      await until('match ended with the platform down', () => results.length > 0, 120_000);
    } finally {
      down = false;
    }
    await ms.platform.idle();
    expect((await api.get('/v1/me/matches', solo.access)).body.matches.length).toBe(before);
    await room.leave();
  }, 240_000);

  it('the match server keeps its own rules: a stranger with a wrong room code gets the server’s answer, never the platform’s', async () => {
    const err = await sdk()
      .joinById('ZZZZZZ', { name: 'Nobody Here' })
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    expect(String((err as Error).message)).toMatch(/not open|room_unavailable/);
  });
});
