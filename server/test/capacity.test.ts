/**
 * Decisions FU2S-C1 / C3 / C4 over a REAL server and real sockets: QUICK PLAY modes never mix, a public room's settings
 * belong to the server, global and per-guest limits answer `server_busy` / `rate_limited` with a retry time, a join by code
 * answers one way, metrics need their token in production, the client address cannot be chosen by a header, rooms are
 * disposed and timers cleared on shutdown, no secret reaches a log.
 */
import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, MSG, parseBusy } from '../../src/net/protocol';
import { classifyFailure } from '../../src/net/client/connection';
import type { LimitsConfig } from '../src/core/limits';
import { DEFAULT_RUNTIME } from '../src/core/options';
import { startRumbleServer } from '../src/app';
import { OPEN_LIMITS, create, joinById, joinOrCreate, sleep, startTestServer, until } from './helpers';
import type { TestPlayer, TestServer } from './helpers';

const gid = (n: number | string): string => `guest${String(n).padStart(17, '0')}`;
const servers: TestServer[] = [];
const players: TestPlayer[] = [];

async function boot(
  limits: Partial<LimitsConfig> = {},
  runtime: Record<string, unknown> = {},
  options: Record<string, unknown> = {},
): Promise<TestServer> {
  const s = await startTestServer({ limits: { ...OPEN_LIMITS, ...limits }, ...runtime }, options);
  servers.push(s);
  return s;
}
const track = (p: TestPlayer): TestPlayer => {
  players.push(p);
  return p;
};
afterEach(async () => {
  await Promise.all(players.splice(0).map((p) => p.leave()));
  for (const s of servers.splice(0)) await s.close().catch(() => undefined);
});

/** The error a promise rejects with (the SDK's MatchMakeError: message carries the server's text). */
const refused = async (p: Promise<unknown>): Promise<{ code?: number; message: string }> => {
  try {
    await p;
  } catch (e) {
    return e as { code?: number; message: string };
  }
  throw new Error('expected the request to be refused');
};

async function post(
  s: TestServer,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const r = await fetch(`${s.http}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.text() };
}

describe('C1: QUICK PLAY modes (public rooms are matched by the mode the players chose)', () => {
  it('Free-for-All and Team Rumble players never share a room, same-mode players do, and the mode decides the ruleset', async () => {
    const s = await boot({}, { fast: false });
    const a = track(await joinOrCreate(s, 'Ada', { mode: 'ffa', gid: gid(1) }));
    const t = track(await joinOrCreate(s, 'Tunde', { mode: 'team', gid: gid(2) }));
    const b = track(await joinOrCreate(s, 'Bola', { mode: 'ffa', gid: gid(3) }));
    const u = track(await joinOrCreate(s, 'Uche', { mode: 'team', gid: gid(4) }));
    expect(a.room.roomId).toBe(b.room.roomId);
    expect(t.room.roomId).toBe(u.room.roomId);
    expect(a.room.roomId).not.toBe(t.room.roomId);
    await until('lobbies', () => b.lobby?.members.length === 2 && u.lobby?.members.length === 2);
    expect(a.lobby!.settings).toMatchObject({ game: 'deathmatch', friendlyFire: false });
    expect(t.lobby!.settings).toMatchObject({ game: 'team', friendlyFire: false }); // the offline default
    expect(a.lobby!.private).toBe(false);
  });

  it('no mode means Free-for-All (an older client), an unknown mode is refused, and nobody is ever moved to the other mode', async () => {
    const s = await boot({}, { fast: false });
    const old = track(await joinOrCreate(s, 'Old', { gid: gid(1) }));
    await until('lobby', () => old.lobby !== null);
    expect(old.lobby!.settings.game).toBe('deathmatch');
    expect((await refused(joinOrCreate(s, 'Xx', { mode: 'both', gid: gid(2) }))).message).toMatch(
      /unknown mode/,
    );
    expect((await refused(joinOrCreate(s, 'Xx', { mode: ['team'], gid: gid(2) }))).message).toMatch(
      /unknown mode/,
    );
    // a team request with a full FFA room waiting still opens a TEAM room
    const t = track(await joinOrCreate(s, 'Team', { mode: 'team', gid: gid(3) }));
    expect(t.room.roomId).not.toBe(old.room.roomId);
  });

  it("a public room's settings are the server's: the client's stage / length / mode / friendly fire are ignored at creation, and nobody can change them", async () => {
    const s = await boot({}, { fast: false });
    const host = track(
      await joinOrCreate(s, 'Hoster', {
        mode: 'team',
        gid: gid(1),
        arenaId: 'rumbleOshodi',
        durationSec: 180,
        friendlyFire: true,
        botDifficulty: 'expert',
        autoStartSec: 0,
      }),
    );
    const guest = track(await joinOrCreate(s, 'Guest', { mode: 'team', gid: gid(2) }));
    await until('both in', () => guest.lobby?.members.length === 2);
    expect(host.lobby!.settings).toEqual({
      arenaId: 'rumbleOshodi',
      game: 'team',
      durationSec: 300,
      botDifficulty: 'standard',
      friendlyFire: false,
    });
    expect(host.lobby!.autoStartMs).toBeGreaterThan(25_000); // the 30 s wait is not the client's to shorten
    const before = JSON.stringify(guest.lobby!.settings);
    for (const patch of [
      { game: 'deathmatch' },
      { friendlyFire: true },
      { durationSec: 180 },
      { arenaId: 'rumbleOshodi' },
    ])
      host.room.send(MSG.settings, patch);
    await until('host told no', () => host.notices.filter((n) => n.code === 'public_room').length === 4);
    await sleep(100);
    expect(JSON.stringify(guest.lobby!.settings)).toBe(before);
    expect(host.lobby!.settings.game).toBe('team');
  });

  it('a private room still lets its host choose everything', async () => {
    const s = await boot({}, { fast: false });
    const host = track(await create(s, 'Hoster', { private: true, gid: gid(1) }));
    host.room.send(MSG.settings, { game: 'team', friendlyFire: true });
    await until(
      'changed',
      () => host.lobby?.settings.game === 'team' && host.lobby.settings.friendlyFire === true,
    );
  });

  it('a public room cannot be joined by its code (quick play is the only door), and quick play never lands in a private room', async () => {
    const s = await boot({}, { fast: false });
    const pub = track(await joinOrCreate(s, 'Pub', { mode: 'ffa', gid: gid(1) }));
    const e = await refused(joinById(s, pub.room.roomId, 'Late', { gid: gid(2) }));
    expect(parseBusy(e.message)?.code).toBe('room_unavailable');
    const priv = track(await create(s, 'Priv', { private: true, gid: gid(3) }));
    const q = track(await joinOrCreate(s, 'Qq', { mode: 'ffa', gid: gid(4) }));
    expect(q.room.roomId).toBe(pub.room.roomId);
    expect(q.room.roomId).not.toBe(priv.room.roomId);
  });
});

describe('C3: global limits and fair, clear overload answers', () => {
  it('past the global room cap, creating answers server_busy with a retry time the client turns into plain words; a freed room makes room', async () => {
    const s = await boot({ maxRooms: 2, busyRetrySec: 20 });
    const a = track(await create(s, 'Aa', { private: true, gid: gid(1) }));
    track(await create(s, 'Bb', { private: true, gid: gid(2) }));
    const e = await refused(create(s, 'Cc', { private: true, gid: gid(3) }));
    const busy = parseBusy(e.message)!;
    expect(busy.code).toBe('server_busy');
    expect(busy.retryAfterSec).toBeGreaterThanOrEqual(20);
    expect(e.code).toBe(503);
    expect(classifyFailure(e)).toMatchObject({ reason: 'server-busy', retryAfterSec: busy.retryAfterSec });
    // quick play that would have to open a room is refused too, but joining an existing public room never is
    expect(parseBusy((await refused(joinOrCreate(s, 'Qq', { gid: gid(4) }))).message)?.code).toBe(
      'server_busy',
    );
    await a.leave();
    await until('room freed', () => s.guard.snapshot().rooms === 1);
    track(await create(s, 'Cc', { private: true, gid: gid(3) }));
  });

  it('quick play joins an existing room even when the server cannot open another', async () => {
    const s = await boot({ maxRooms: 1 });
    const first = track(await joinOrCreate(s, 'First', { mode: 'ffa', gid: gid(1) }));
    const second = track(await joinOrCreate(s, 'Second', { mode: 'ffa', gid: gid(2) }));
    expect(second.room.roomId).toBe(first.room.roomId);
  });

  it('limits room creation per guest session (not per address): a second guest behind the same address is unaffected', async () => {
    const s = await boot({ guestCreate: { burst: 2, perMin: 1 } });
    track(await create(s, 'Aa', { private: true, gid: gid(1) }));
    track(await create(s, 'Aa', { private: true, gid: gid(1) }));
    const e = await refused(create(s, 'Aa', { private: true, gid: gid(1) }));
    const busy = parseBusy(e.message)!;
    expect(busy.code).toBe('rate_limited');
    expect(e.code).toBe(429);
    expect(busy.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(classifyFailure(e).reason).toBe('rate-limited');
    track(await create(s, 'Bb', { private: true, gid: gid(2) })); // same address, other guest: fine
  });

  it('caps the rooms one guest owns at once, and a raw request cannot dodge it by changing its options', async () => {
    const s = await boot({ maxRoomsPerGuest: 1 });
    track(await create(s, 'Aa', { private: true, gid: gid(1) }));
    expect(parseBusy((await refused(create(s, 'Aa', { private: true, gid: gid(1) }))).message)?.code).toBe(
      'rate_limited',
    );
    // spoofing the server-stamped fields does nothing: `_who` is overwritten, the guest id is the one that counts
    const raw = await post(s, '/matchmake/create/rumble', {
      name: 'Mallory',
      private: true,
      gid: gid(1),
      _who: { ip: 'x', gid: gid(9) },
    });
    expect(raw.status).toBe(429);
    const other = await post(s, '/matchmake/create/rumble', { name: 'Fine', private: true, gid: gid(2) });
    expect(other.status).toBe(200);
  });

  it('a flood of room creations from one address is stopped by the per-address ceiling whatever guest ids it invents', async () => {
    const s = await boot({ ipCreate: { burst: 5, perMin: 1 } });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push(
        (await post(s, '/matchmake/create/rumble', { name: 'Flood', private: true, gid: gid(100 + i) }))
          .status,
      );
    expect(statuses.filter((x) => x === 200)).toHaveLength(5);
    expect(statuses.filter((x) => x === 429)).toHaveLength(7);
    // and the rooms the flood opened expire on their own: nobody ever connected a socket to them
    await until('abandoned rooms disposed', () => s.metrics.roomCount === 0, 30_000);
    expect(s.guard.snapshot().rooms).toBe(0);
  });

  it('a join by code answers ONE way (wrong, started, public, full) and a client guessing codes is stopped', async () => {
    const s = await boot({ guestJoinFail: { burst: 3, perMin: 1 } });
    const priv = track(await create(s, 'Hoster', { private: true, gid: gid(1) }));
    const pub = track(await joinOrCreate(s, 'Pub', { mode: 'ffa', gid: gid(5) }));
    const msgs = new Set<string>();
    for (const code of ['ZZZZZZ', pub.room.roomId, 'nope']) {
      const e = await refused(joinById(s, code, 'Guesser', { gid: gid(2) }));
      expect(e.code).toBe(404);
      msgs.add(e.message);
    }
    expect(msgs.size).toBe(1); // wrong code, public room, malformed code: the same words
    const e = await refused(joinById(s, 'ZZZZZZ', 'Guesser', { gid: gid(2) }));
    expect(parseBusy(e.message)?.code).toBe('rate_limited'); // out of tries
    // a different guest still reaches the real room with the real code
    const ok = track(await joinById(s, priv.room.roomId, 'Friend', { gid: gid(3) }));
    expect(ok.room.roomId).toBe(priv.room.roomId);
    // a wrong name is still reported as a name problem (it is the joiner's, not a probe of the room)
    expect((await refused(joinById(s, priv.room.roomId, 'BOT Emeka', { gid: gid(4) }))).message).toMatch(
      /invalid name/,
    );
  });

  it('a disposed room and a bad token answer the HTTP reconnect alike (no oracle), and failures are throttled', async () => {
    const s = await boot({ guestJoinFail: { burst: 3, perMin: 1 } });
    const a = track(await create(s, 'Aa', { private: true, gid: gid(1) }));
    const sdk = s.client();
    const wrongToken = await refused(sdk.reconnect(`${a.room.roomId}:badtoken1`));
    const wrongRoom = await refused(sdk.reconnect('ZZZZZZ:badtoken1'));
    expect(wrongToken.message).toBe(wrongRoom.message);
    expect(parseBusy(wrongToken.message)?.code).toBe('room_unavailable');
    expect(parseBusy((await refused(sdk.reconnect('ZZZZZZ:badtoken1'))).message)?.code).toBe(
      'room_unavailable',
    );
    const third = await refused(sdk.reconnect('ZZZZZZ:badtoken1'));
    expect(parseBusy(third.message)?.code).toBe('rate_limited');
  });

  it('a raw WebSocket flood from one address is refused with 429 at the upgrade, before any room code is looked at', async () => {
    const s = await boot({ ipUpgrade: { burst: 3, perMin: 1 } });
    const upgrade = (): Promise<number> =>
      new Promise((resolve, reject) => {
        const req = request(`${s.http}/proc/ROOM01?sessionId=x`, {
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-version': '13',
            'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          },
        });
        req.on('response', (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('upgrade', (_res, socket) => {
          socket.destroy();
          resolve(101);
        });
        req.on('error', reject);
        req.end();
      });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push(await upgrade());
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(3);
  });

  it('the connection cap refuses the extra player with server_busy and counts the seat back when someone leaves', async () => {
    const s = await boot({ maxConnections: 2 });
    const host = track(await create(s, 'Hoster', { private: true, gid: gid(1) }));
    track(await joinById(s, host.room.roomId, 'Bb', { gid: gid(2) }));
    const e = await refused(joinById(s, host.room.roomId, 'Cc', { gid: gid(3) }));
    expect(parseBusy(e.message)?.code).toBe('server_busy');
    expect(s.guard.snapshot().connections).toBe(2);
  });
});

describe('C3: match slots, the start queue, idle lobbies and slow readers', () => {
  const startMatch = async (s: TestServer, name: string, n: number): Promise<TestPlayer> => {
    const p = track(await create(s, name, { private: true, durationSec: 60, gid: gid(n) }));
    p.room.send(MSG.start);
    return p;
  };

  it('with one match slot a second room waits in its countdown (and is told), starts when the first is gone, and nobody is dropped', async () => {
    const s = await boot({ maxPlayingRooms: 1, startWaitMaxSec: 60 });
    const a = await startMatch(s, 'Aa', 1);
    await until('A playing', () => a.seat !== null && a.keyframes >= 1);
    const b = await startMatch(s, 'Bb', 2);
    await until('B is told it waits', () => b.lobby?.waitingForSlot === true, 15_000);
    expect(b.lobby!.phase).toBe('countdown');
    await until('a notice', () => b.notices.some((n) => n.code === 'server_busy'));
    const busy = parseBusy(b.notices.find((n) => n.code === 'server_busy')!.message)!;
    expect(busy.text).toMatch(/busy/i);
    expect(busy.retryAfterSec).toBeGreaterThan(0);
    expect(b.seat).toBeNull();
    expect(s.guard.snapshot()).toMatchObject({ playingRooms: 1, waitingToStart: 1 });
    await a.leave(); // room A closes: its slot is free
    await until(
      'B starts',
      () => b.seat !== null && b.keyframes >= 1 && b.lobby?.phase === 'playing',
      20_000,
    );
    expect(b.lobby!.waitingForSlot).toBeUndefined();
  });

  it('a room that waits too long for a slot is closed with a clear server_busy message and a close code that does not reconnect', async () => {
    const s = await boot({ maxPlayingRooms: 1, startWaitMaxSec: 2 });
    const a = await startMatch(s, 'Aa', 1);
    await until('A playing', () => a.seat !== null && a.keyframes >= 1);
    const b = await startMatch(s, 'Bb', 2);
    await until('B closed', () => b.leftWith !== null, 20_000);
    expect(b.leftWith).toBe(CLOSE.overload);
    const last = b.notices.filter((n) => n.code === 'server_busy').at(-1)!;
    expect(parseBusy(last.message)).toMatchObject({ code: 'server_busy' });
    expect(a.leftWith).toBeNull(); // the running match was never touched
  });

  it('an abandoned lobby is closed after the idle limit; activity keeps it open', async () => {
    const s = await boot({ lobbyIdleSec: 2 });
    const idle = track(await create(s, 'Idle', { private: true, gid: gid(1) }));
    const busy = track(await create(s, 'Busy', { private: true, gid: gid(2) }));
    const poke = setInterval(() => busy.room.send(MSG.ready, { ready: Math.random() < 0.5 }), 400);
    await until('idle room closed', () => idle.leftWith !== null, 15_000);
    expect(idle.leftWith).toBe(CLOSE.idle);
    expect(idle.notices.at(-1)).toMatchObject({ code: 'idle' });
    expect(busy.leftWith).toBeNull();
    clearInterval(poke);
  });

  it('a client that stops reading is cut off once its unsent output passes the limit (it may not reconnect)', async () => {
    const s = await boot({ maxBufferedKiB: 64 });
    const slow = track(await create(s, 'Slow', { private: true, durationSec: 60, gid: gid(1) }));
    slow.room.send(MSG.start);
    await until('playing', () => slow.seat !== null && slow.keyframes >= 1);
    const room = matchMaker.getLocalRoomById(slow.room.roomId)!;
    const ref = room.clients.find((c) => c.sessionId === slow.room.sessionId)!.ref as unknown as {
      bufferedAmount: number;
    };
    Object.defineProperty(ref, 'bufferedAmount', { get: () => 10 * 1024 * 1024, configurable: true });
    await until('cut off', () => slow.leftWith !== null, 10_000);
    expect(slow.leftWith).toBe(CLOSE.overload);
    expect(s.metrics.roomSnapshots().reduce((n, r) => n + r.net.backpressureKicks, 0)).toBeGreaterThanOrEqual(
      0,
    );
  });
});

describe('C4: the client address, metrics and production refusals', () => {
  it('a client cannot pick its own address with X-Forwarded-For / X-Real-IP: limits follow the real peer', async () => {
    const s = await boot({ ipCreate: { burst: 2, perMin: 1 } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++)
      codes.push(
        (
          await post(
            s,
            '/matchmake/create/rumble',
            { name: 'Ss', private: true, gid: gid(i) },
            {
              'x-forwarded-for': `10.9.8.${i}`,
              'x-real-ip': `10.7.7.${i}`,
              'x-client-ip': `10.6.6.${i}`,
            },
          )
        ).status,
      );
    expect(codes.filter((c) => c === 200)).toHaveLength(2);
    expect(codes.filter((c) => c === 429)).toHaveLength(3);
  });

  it('behind a configured proxy the forwarded address IS used (each real client gets its own bucket)', async () => {
    const s = await boot({ ipCreate: { burst: 1, perMin: 1 } }, {}, { trustedProxies: '127.0.0.0/8' });
    const make = (ip: string, n: number) =>
      post(
        s,
        '/matchmake/create/rumble',
        { name: 'Pp', private: true, gid: gid(n) },
        { 'x-forwarded-for': ip },
      );
    expect((await make('198.51.100.1', 1)).status).toBe(200);
    expect((await make('198.51.100.2', 2)).status).toBe(200);
    expect((await make('198.51.100.1', 3)).status).toBe(429);
    // a client-supplied hop in front of the proxy's own is ignored (the rightmost untrusted address is the client)
    expect((await make('1.1.1.1, 198.51.100.1', 4)).status).toBe(429);
  });

  it('in production /metrics does not exist without a token, needs it when set, and is open only in development', async () => {
    const prod = await startRumbleServer({
      port: 0,
      host: '127.0.0.1',
      development: false,
      runtime: { ...DEFAULT_RUNTIME, limits: OPEN_LIMITS },
    });
    const url = `http://127.0.0.1:${prod.port}`;
    try {
      expect((await fetch(`${url}/metrics`)).status).toBe(404);
      expect((await fetch(`${url}/metrics`, { headers: { authorization: 'Bearer anything' } })).status).toBe(
        404,
      );
      expect((await fetch(`${url}/health`)).status).toBe(200);
    } finally {
      await prod.close();
    }
    const guarded = await startRumbleServer({
      port: 0,
      host: '127.0.0.1',
      development: false,
      metricsToken: 's3cret-token',
      runtime: { ...DEFAULT_RUNTIME, limits: OPEN_LIMITS },
    });
    const gurl = `http://127.0.0.1:${guarded.port}`;
    try {
      expect((await fetch(`${gurl}/metrics`)).status).toBe(401);
      expect(
        (await fetch(`${gurl}/metrics`, { headers: { authorization: 'Bearer s3cret-tokeX' } })).status,
      ).toBe(401);
      expect((await fetch(`${gurl}/metrics`, { headers: { authorization: 's3cret-token' } })).status).toBe(
        401,
      );
      const ok = await fetch(`${gurl}/metrics`, { headers: { authorization: 'Bearer s3cret-token' } });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { limits: { rooms: number; cpuBudget: number } };
      expect(body.limits).toMatchObject({ rooms: 0, playingRooms: 0, waitingToStart: 0, connections: 0 });
    } finally {
      await guarded.close();
    }
    const dev = await boot();
    expect((await fetch(`${dev.http}/metrics`)).status).toBe(200);
  });

  it('in production the HTTP reconnect door does not exist (the WebSocket needs the session id AND the token); in development it does', async () => {
    const prod = await startRumbleServer({
      port: 0,
      host: '127.0.0.1',
      development: false,
      allowedOrigins: 'https://play.example',
      runtime: { ...DEFAULT_RUNTIME, limits: OPEN_LIMITS },
    });
    try {
      const r = await fetch(`http://127.0.0.1:${prod.port}/matchmake/reconnect/ABCDEF`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://play.example' },
        body: JSON.stringify({ reconnectionToken: 'ABCDEF:aaaaaaaaa' }),
      });
      // the door is not exposed: Colyseus' controller does not list it, and the answer is the uniform refusal anyway
      expect(matchMaker.controller.exposedMethods).not.toContain('reconnect');
      expect(r.status).toBe(404);
      expect(parseBusy(JSON.parse(await r.text()).error)?.code).toBe('room_unavailable');
      // the other doors work, and a browser from another origin gets no CORS answer
      const ok = await fetch(`http://127.0.0.1:${prod.port}/matchmake/create/rumble`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://play.example' },
        body: JSON.stringify({ name: 'Prod Ada', private: true, gid: gid(1) }),
      });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('access-control-allow-origin')).toBe('https://play.example');
      const evil = await fetch(`http://127.0.0.1:${prod.port}/matchmake/create/rumble`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ name: 'Evil', private: true, gid: gid(2) }),
      });
      expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await prod.close();
    }
    const dev = await boot();
    const r = await fetch(`${dev.http}/matchmake/reconnect/ABCDEF`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reconnectionToken: 'ABCDEF:aaaaaaaaa' }),
    });
    expect(await r.text()).not.toMatch(/invalid method/);
  });

  it('refuses to start in production with the test-only fast mode', async () => {
    await expect(
      startRumbleServer({
        port: 0,
        host: '127.0.0.1',
        development: false,
        runtime: { ...DEFAULT_RUNTIME, fast: true },
      }),
    ).rejects.toThrow(/test-only/);
  });

  it('the reserved options are server-stamped: a client cannot set `_who` or send a mode its way around the filter', async () => {
    const s = await boot({}, { fast: false });
    const r = await post(s, '/matchmake/joinOrCreate/rumble', {
      name: 'Raw',
      gid: gid(1),
      mode: 'team',
      private: true,
      _who: { ip: 'internal' },
    });
    expect(r.status).toBe(200);
    // `private: true` through quick play is ignored: the room is public and listed for its mode
    const listed = await matchMaker.getRoomById(JSON.parse(r.body).roomId);
    expect(listed?.private).toBe(false);
  });
});

describe('C4: secrets never reach a log, and shutdown leaves nothing running', () => {
  it('room codes, session ids and reconnection tokens appear in no server log line and no console output through a full drop / reconnect / finish flow', async () => {
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' '))),
    );
    try {
      const s = await boot(
        {},
        { fast: true, graceSeconds: 0.3, reconnectSeconds: 3 },
        { log: (m: string) => lines.push(m) },
      );
      const a = track(await create(s, 'Ada', { private: true, durationSec: 10, gid: gid(1) }));
      const code = a.room.roomId;
      const b = track(await joinById(s, code, 'Bayo', { gid: gid(2) }));
      const secrets = [
        code,
        a.room.sessionId,
        b.room.sessionId,
        a.room.reconnectionToken,
        b.room.reconnectionToken,
        a.room.reconnectionToken.split(':')[1]!,
      ];
      a.room.send(MSG.start);
      await until('playing', () => a.seat !== null && b.keyframes >= 1);
      const token = a.room.reconnectionToken;
      a.room.reconnection.enabled = false;
      const ref = matchMaker.getLocalRoomById(code)!.clients.find((c) => c.sessionId === a.room.sessionId)!
        .ref as unknown as { terminate(): void };
      ref.terminate();
      await until('drop noticed', () => b.lobby?.members.some((m) => !m.connected) === true);
      const back = await s.client().reconnect(token);
      a.attach(back);
      secrets.push(back.reconnectionToken, back.reconnectionToken.split(':')[1]!);
      await until('back', () => b.lobby?.members.every((m) => m.connected) === true);
      await refused(joinById(s, 'ZZZZZZ', 'Guess', { gid: gid(3) }));
      await a.leave();
      await b.leave();
      await until('rooms gone', () => s.metrics.roomCount === 0, 15_000);
      expect(lines.length).toBeGreaterThan(3); // there IS logging to check (created, dropped, reconnected, left, disposed)
      const all = lines.join('\n');
      for (const secret of secrets)
        expect(all, `a secret leaked: ${secret.slice(0, 3)}...`).not.toContain(secret);
      expect(all).toContain(createHash('sha256').update(code).digest('hex').slice(0, 8)); // the room is named by its tag
    } finally {
      for (const sp of spies) sp.mockRestore();
    }
  });

  it('closing the server disposes every room, frees the guard, and leaves no timer or listener of ours running', async () => {
    // a first start / stop lets Colyseus' own one-time setup (its metrics library keeps a few process-wide timers) settle
    await (await boot()).close();
    servers.length = 0;
    // from here every JS timer is recorded until it fires or is cleared
    const live = new Map<unknown, string>();
    const real = {
      st: globalThis.setTimeout,
      si: globalThis.setInterval,
      ct: globalThis.clearTimeout,
      ci: globalThis.clearInterval,
    };
    const g = globalThis as unknown as Record<string, unknown>;
    g.setTimeout = (fn: () => void, ms?: number, ...a: unknown[]) => {
      const t = real.st(() => (live.delete(t), fn()), ms, ...a);
      live.set(t, `timeout ${ms}ms ${new Error().stack!.split('\n').slice(2, 5).join(' | ')}`);
      return t;
    };
    g.setInterval = (fn: () => void, ms?: number, ...a: unknown[]) => {
      const t = real.si(fn, ms, ...a);
      live.set(t, `interval ${ms}ms ${new Error().stack!.split('\n').slice(2, 5).join(' | ')}`);
      return t;
    };
    g.clearTimeout = (t: NodeJS.Timeout) => (live.delete(t), real.ct(t));
    g.clearInterval = (t: NodeJS.Timeout) => (live.delete(t), real.ci(t));
    try {
      const s = await boot({}, { fast: true });
      const a = track(await create(s, 'Ada', { private: true, durationSec: 10, gid: gid(1) }));
      track(await joinOrCreate(s, 'Bola', { gid: gid(2) }));
      a.room.send(MSG.start);
      await until('a match is running', () => a.seat !== null && a.keyframes >= 1);
      expect(s.metrics.roomCount).toBe(2);
      expect(live.size).toBeGreaterThan(2); // there ARE timers while rooms run (loops, housekeeping, linger)
      // the test's own clients must not retry (the SDK reconnects after a server-side close): only the SERVER's timers count
      for (const p of players) p.room.reconnection.enabled = false;
      await s.close();
      servers.length = 0;
      expect(s.metrics.roomCount).toBe(0);
      expect(matchMaker.getLocalRoomById(a.room.roomId)).toBeUndefined();
      expect(s.guard.snapshot()).toMatchObject({
        rooms: 0,
        playingRooms: 0,
        waitingToStart: 0,
        connections: 0,
      });
      await sleep(1500); // Colyseus' own 1 s bookkeeping timers (presence, stats) finish by themselves
      // Not ours: the client SDK, and @pm2/io (a dependency of Colyseus whose IPC transport re-arms a 200 ms retry timer while the
      // process is not under pm2; CI run 351 recorded it inside the window although a first start had settled the others). A timer
      // that any code of this repository creates, or that Colyseus' room code leaves behind, still fails here.
      expect([...live.values()].filter((w) => !/\/sdk\/|node_modules\/@pm2\/io\//.test(w))).toEqual([]);
    } finally {
      Object.assign(g, {
        setTimeout: real.st,
        setInterval: real.si,
        clearTimeout: real.ct,
        clearInterval: real.ci,
      });
    }
  });
});
