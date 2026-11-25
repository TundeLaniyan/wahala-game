/**
 * The local service-to-match-server handshake, against the REAL, UNMODIFIED City Rumble server (Colyseus rooms, 32 seats,
 * the server's own lobby): two platform accounts become a party, the leader opens a private room on the match server, the
 * member joins that same room with a platform ticket, and the match server's signed-call contract records the result.
 *
 * Needs the match server's own dependencies (`cd server && npm ci`); skipped with a clear reason when they are absent so the
 * hermetic suite still runs anywhere.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLocalJWKSet } from 'jose';
import type * as ServerApp from '../../server/src/app';
import type * as ServerOptions from '../../server/src/core/options';
import type * as ServerLimits from '../../server/src/core/limits';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyHandoffTicket } from '../src/handoff/verify';
import { client, internalCall, newGuest, startHarness } from './helpers';
import type { Harness } from './helpers';

const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const haveServer = existsSync(`${serverDir}node_modules/@colyseus/core`);

describe.skipIf(!haveServer)('platform <-> real match server handshake', () => {
  let h: Harness;
  let matchServer: { port: number; close(): Promise<void> };
  let sdk: new (url: string) => {
    create(room: string, opts: unknown): Promise<SdkRoom>;
    joinById(id: string, opts: unknown): Promise<SdkRoom>;
  };

  interface SdkRoom {
    roomId: string;
    onMessage(type: string, cb: (m: never) => void): void;
    leave(consented?: boolean): Promise<void>;
  }
  interface Lobby {
    code: string;
    private: boolean;
    members: { name: string; isHost: boolean }[];
    phase: string;
  }

  beforeAll(async () => {
    h = await startHarness();
    const { startRumbleServer } = (await import(
      pathToFileURL(`${serverDir}src/app.ts`).href
    )) as typeof ServerApp;
    const { DEFAULT_RUNTIME } = (await import(
      pathToFileURL(`${serverDir}src/core/options.ts`).href
    )) as typeof ServerOptions;
    const { UNLIMITED_LIMITS } = (await import(
      pathToFileURL(`${serverDir}src/core/limits.ts`).href
    )) as typeof ServerLimits;
    matchServer = await startRumbleServer({
      port: 0,
      host: '127.0.0.1',
      development: true,
      runtime: {
        ...DEFAULT_RUNTIME,
        fast: true,
        countdownMs: 150,
        reconnectSeconds: 5,
        limits: UNLIMITED_LIMITS,
      },
    });
    const require = createRequire(`${serverDir}package.json`);
    sdk = ((await import(pathToFileURL(require.resolve('@colyseus/sdk')).href)) as { Client: typeof sdk })
      .Client;
  });
  afterAll(async () => {
    await matchServer?.close();
    await h?.close();
  });

  const until = async (what: string, cond: () => boolean, ms = 10_000) => {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) throw new Error(`timed out: ${what}`);
      await new Promise((r) => setTimeout(r, 15));
    }
  };

  it('a party plays in ONE private room: leader creates it, member joins with a ticket, results are recorded', async () => {
    const api = client(h.base);
    const lead = await newGuest(api, 'Lead Lagos');
    const member = await newGuest(api, 'Member Abuja');

    // 1. party (platform)
    const party = (await api.post('/v1/parties', { mode: 'ffa' }, lead.access)).body.party;
    await api.post('/v1/parties/join', { code: party.code }, member.access);

    // 2. the LEADER asks for a HOST ticket (the room code does not exist yet), then creates a private room on the real match
    //    server with its own client, exactly as a guest does today (the unmodified server ignores the extra `ticket` option)
    const hostTicket = await api.post(`/v1/parties/${party.id}/match/ticket`, {}, lead.access);
    expect(hostTicket.body).toMatchObject({ host: true, roomCode: null });
    expect((await api.post(`/v1/parties/${party.id}/match/ticket`, {}, member.access)).status).toBe(409); // members wait for the code
    const keys = createLocalJWKSet((await api.get('/.well-known/jwks.json')).body);
    expect(
      (
        await verifyHandoffTicket(hostTicket.body.ticket, {
          keys,
          audience: 'wahala-rumble',
          roomCode: null,
          now: h.clock.now,
        })
      ).ok,
    ).toBe(true);
    const msClient = new sdk(`http://127.0.0.1:${matchServer.port}`);
    const leadLobbies: Lobby[] = [];
    const leadRoom = await msClient.create('rumble', {
      private: true,
      name: lead.name,
      characterId: lead.profile.selectedCharacter,
      ticket: hostTicket.body.ticket,
    });
    leadRoom.onMessage('lobby', (m) => leadLobbies.push(m as unknown as Lobby));
    const roomCode = leadRoom.roomId;
    expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);

    // 3. the leader tells the platform the code; the platform now carries it to the party
    const opened = await api.post(`/v1/parties/${party.id}/match`, { roomCode }, lead.access);
    expect(opened.status).toBe(200);
    expect((await api.get(`/v1/parties/${party.id}`, member.access)).body.party.match.roomCode).toBe(
      roomCode,
    );

    // 4. the member asks for a ticket and joins the SAME room (the unmodified server ignores the extra `ticket` option)
    const t = await api.post(`/v1/parties/${party.id}/match/ticket`, {}, member.access);
    const verified = await verifyHandoffTicket(t.body.ticket, {
      keys,
      audience: 'wahala-rumble',
      roomCode,
      now: h.clock.now,
    });
    expect(verified.ok).toBe(true);
    const memberLobbies: Lobby[] = [];
    const memberRoom = await new sdk(`http://127.0.0.1:${matchServer.port}`).joinById(roomCode, {
      name: member.name,
      characterId: member.profile.selectedCharacter,
      ticket: t.body.ticket,
    });
    memberRoom.onMessage('lobby', (m) => memberLobbies.push(m as unknown as Lobby));

    // 5. both are in the same real lobby, the leader is host, it is private
    await until(
      'both humans listed',
      () =>
        (memberLobbies.at(-1)?.members.length ?? 0) === 2 && (leadLobbies.at(-1)?.members.length ?? 0) === 2,
    );
    const lobby = memberLobbies.at(-1)!;
    expect(lobby).toMatchObject({ code: roomCode, private: true, phase: 'lobby' });
    expect(lobby.members.map((m) => m.name).sort()).toEqual(['Lead Lagos', 'Member Abuja']);
    expect(lobby.members.find((m) => m.isHost)?.name).toBe('Lead Lagos');

    // 6. the match server reports the match with the ticketed player ids (signed call), then its end
    const participants = [
      { seat: 0, playerId: lead.id, name: lead.name, isBot: false, team: null },
      { seat: 1, playerId: member.id, name: member.name, isBot: false, team: null },
      { seat: 2, playerId: null, name: 'BOT Emeka', isBot: true, team: null },
    ];
    const base = {
      matchId: 'real-handshake-1',
      game: 'deathmatch',
      arenaId: 'rumbleOshodi',
      roomCode,
      seats: 32,
      participants,
    };
    expect(
      (
        await internalCall(h.base, h.clock, '/internal/v1/matches/started', {
          ...base,
          startedAt: h.clock.now.toISOString(),
        })
      ).status,
    ).toBe(201);
    const fin = await internalCall(h.base, h.clock, '/internal/v1/matches/finished', {
      ...base,
      startedAt: h.clock.now.toISOString(),
      endedAt: new Date(h.clock.now.getTime() + 300_000).toISOString(),
      durationSec: 300,
      results: [
        {
          seat: 0,
          placement: 2,
          kills: 4,
          deaths: 1,
          assists: 1,
          botKills: 0,
          botDeaths: 0,
          botAssists: 0,
          controlledByBotAtEnd: false,
        },
        {
          seat: 1,
          placement: 1,
          kills: 6,
          deaths: 0,
          assists: 0,
          botKills: 1,
          botDeaths: 0,
          botAssists: 0,
          controlledByBotAtEnd: false,
        },
        {
          seat: 2,
          placement: 3,
          kills: 0,
          deaths: 5,
          assists: 0,
          botKills: null,
          botDeaths: null,
          botAssists: null,
          controlledByBotAtEnd: null,
        },
      ],
    });
    expect(fin.status).toBe(201);
    expect((await api.get('/v1/me/matches', member.access)).body.matches[0]).toMatchObject({
      matchId: 'real-handshake-1',
      you: { placement: 1, kills: 6, botKills: 1 },
      humans: 2,
    });
    expect((await api.get('/v1/me/matches', lead.access)).body.matches[0].you.placement).toBe(2);
    expect((await api.get(`/v1/parties/${party.id}`, lead.access)).body.party).toMatchObject({
      status: 'open',
      match: null,
    });

    await memberRoom.leave();
    await leadRoom.leave();
  });

  it('the match server keeps its own rules: a stranger with the room code still gets the server’s answer, never the platform’s', async () => {
    const c = new sdk(`http://127.0.0.1:${matchServer.port}`);
    const err = await c.joinById('ZZZZZZ', { name: 'Nobody Here' }).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err).not.toBeNull();
    expect(String((err as Error).message)).toMatch(/not open|room_unavailable/);
  });
});
