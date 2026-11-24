/**
 * Real server, real WebSocket clients (@colyseus/sdk). Every test drives the room only through the wire protocol and
 * checks the state the clients rebuilt from the binary frames against the server's own results message.
 * (Reconnection, seat hand-over and abuse live in their own files: each file is its own process, so the real-time
 * matches run in parallel.)
 */
import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import { MSG } from '../../src/net/protocol';
import { CHARACTER_IDS } from '../../src/sim';
import type { RoomMetricsSnapshot } from '../src/core/metrics';
import {
  MATCH_END_BUDGET_MS,
  TestContext,
  create,
  joinById,
  joinOrCreate,
  playRandomly,
  until,
} from './helpers';
import type { TestPlayer } from './helpers';

const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const ctx = new TestContext({ defaultAutoStartSec: 0.4 });

describe('lobby and matchmaking', () => {
  it('creates a private room with a 6-character code, welcome and lobby, outside public matchmaking', async () => {
    const a = ctx.track(
      await create(ctx.server, 'Ada', { private: true, characterId: CHARACTER_IDS[1], durationSec: 10 }),
    );
    const code = a.room.roomId;
    expect(code).toMatch(CODE_RE);
    await until('welcome + lobby', () => a.welcomes.length === 1 && a.lobby !== null);
    expect(a.welcomes[0]).toEqual({ descriptor: null, seat: null, roomCode: code });
    expect(a.lobby).toMatchObject({
      code,
      phase: 'lobby',
      private: true,
      botsToFill: 31,
      you: 0,
      countdownMs: null,
      autoStartMs: null,
      settings: { arenaId: 'rumbleOshodi', game: 'deathmatch', durationSec: 10, botDifficulty: 'standard' },
    });
    expect(a.lobby!.members[0]).toMatchObject({
      name: 'Ada',
      characterId: CHARACTER_IDS[1],
      isHost: true,
      seat: null,
    });
    expect(JSON.stringify(a.lobbies)).not.toContain(a.room.sessionId);

    const stranger = ctx.track(await joinOrCreate(ctx.server, 'Xavier', { durationSec: 10 }));
    expect(stranger.room.roomId).not.toBe(code); // a private room is only reachable by its code
    expect(ctx.metricsOf(code).code).toBeNull(); // and its code is not listed on /metrics
  });

  it('lets only the host start, change settings and rematch; unknown settings are refused', async () => {
    const a = ctx.track(await create(ctx.server, 'Ada', { private: true, durationSec: 10 }));
    const b = ctx.track(await joinById(ctx.server, a.room.roomId, 'Bayo'));
    await until('both in lobby', () => a.lobby?.members.length === 2 && b.lobby?.members.length === 2);
    expect(b.lobby!.you).toBe(1);

    b.room.send(MSG.start);
    b.room.send(MSG.settings, { game: 'team' });
    b.room.send(MSG.rematch);
    await until('three refusals', () => b.notices.length === 3);
    expect(b.notices.map((n) => n.code)).toEqual(['not_host', 'not_host', 'not_host']);

    a.room.send(MSG.settings, { arenaId: 'nowhere' });
    a.room.send(MSG.settings, { game: 'team', botDifficulty: 'expert' });
    b.room.send(MSG.ready, { ready: true });
    await until(
      'settings + ready applied',
      () => b.lobby?.settings.game === 'team' && b.lobby.members[1]!.ready,
    );
    expect(a.notices.map((n) => n.code)).toEqual(['bad_settings']);
    expect(a.lobby!.settings).toMatchObject({
      game: 'team',
      botDifficulty: 'expert',
      arenaId: 'rumbleOshodi',
    });

    // the host leaves: the next member becomes the host
    await a.leave();
    await until('b is host', () => b.lobby?.members.length === 1 && b.lobby.members[0]!.isHost);
  });

  it('rejects bad names, options and unknown rooms without creating rooms', async () => {
    const before = ctx.server.metrics.roomCount;
    const client = ctx.server.client();
    await expect(client.joinOrCreate('rumble', { name: '<script>' })).rejects.toThrow(/invalid name/);
    await expect(client.create('rumble', { name: 'Ada', arenaId: 'nowhere' })).rejects.toThrow(/arena/);
    await expect(client.create('rumble', { name: 'Ada', durationSec: 3 })).rejects.toThrow(/duration/);
    await expect(client.joinById('ZZZZZZ', { name: 'Ada' })).rejects.toThrow();
    expect(ctx.server.metrics.roomCount).toBe(before);
  });

  it('puts public players into the same lobby, auto-starts it, and locks it against late joiners', async () => {
    const a = ctx.track(await joinOrCreate(ctx.server, 'Ada', { durationSec: 10 }));
    const b = ctx.track(await joinOrCreate(ctx.server, 'Bayo'));
    expect(b.room.roomId).toBe(a.room.roomId);
    await until(
      'lobby shows autoStart',
      () => a.lobby?.autoStartMs !== null && a.lobby?.members.length === 2,
    );
    await until('match running', () => [a, b].every((p) => p.seat !== null && p.keyframes >= 1));
    expect(a.lobby!.phase).toBe('playing');
    expect(a.seat).not.toBe(b.seat);
    expect(ctx.metricsOf(a.room.roomId).code).toBe(a.room.roomId); // public rooms are listed by code

    await expect(joinById(ctx.server, a.room.roomId, 'Late')).rejects.toThrow(/not open/); // public rooms are only for quick play; one answer for every bad code
    const late = ctx.track(await joinOrCreate(ctx.server, 'Late', { durationSec: 10 }));
    expect(late.room.roomId).not.toBe(a.room.roomId);
  });
});

describe('a full match over real sockets', () => {
  it('two humans + 30 bots: both replicas end on the server hash, with identical results', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo'], { characterId: CHARACTER_IDS[2] });
    const [a, b] = all as [TestPlayer, TestPlayer];
    await until('b lobby = playing', () => b.lobby?.phase === 'playing');

    expect(new Set([a.seat, b.seat])).toEqual(new Set([0, 1]));
    expect(a.welcomes.at(-1)!.roomCode).toBe(code);
    const descriptor = a.welcomes.at(-1)!.descriptor!;
    expect(descriptor).toEqual(b.welcomes.at(-1)!.descriptor);
    expect(descriptor.players).toHaveLength(32);
    expect(descriptor.players.filter((p) => p.isBot)).toHaveLength(30);
    expect(descriptor.players.slice(0, 2).map((p) => p.name)).toEqual(['Ada', 'Bayo']);
    expect(JSON.stringify(a.welcomes)).not.toMatch(/seed/i);

    const stop = [playRandomly(a), playRandomly(b, 110)];
    a.room.send(MSG.ping, { c: 1234 });
    await until('pong', () => a.pongs.length === 1);
    expect(a.pongs[0]).toMatchObject({ c: 1234 });
    // two resyncs back to back: one keyframe is served, the other is rate limited
    await until('some frames', () => a.frameMessages > 20);
    a.room.send(MSG.resync);
    a.room.send(MSG.resync);

    await until('both got results', () => a.results.length > 0 && b.results.length > 0, MATCH_END_BUDGET_MS);
    stop.forEach((s) => s());
    const ra = a.results[0]!;
    expect(ra).toEqual(b.results[0]);

    // convergence: what each client rebuilt from the frames IS the server's final state
    expect(a.hash()).toBe(ra.stateHash);
    expect(b.hash()).toBe(ra.stateHash);
    expect(a.replica!.state!.tick).toBe(ra.tick);
    for (const p of [a, b]) {
      expect(p.replica!.stats.hashMismatches).toBe(0);
      expect(p.replica!.stats.resyncs).toBe(0);
      expect(p.replica!.resyncReason).toBeNull();
      expect(p.replica!.stats.hashChecks).toBeGreaterThan(0);
    }
    expect(a.keyframes).toBe(2); // join + the one resync that was not rate limited

    // results: humans are humans, the rest are bots
    expect(ra.players).toHaveLength(32);
    expect(ra.players.filter((p) => !p.isBot).map((p) => p.seat)).toEqual([0, 1]);
    expect(ra.players.filter((p) => p.isBot)).toHaveLength(30);
    expect(ra.players.filter((p) => p.isBot).every((p) => p.name.startsWith('BOT '))).toBe(true);
    expect(ra.tick).toBeGreaterThanOrEqual(10 * 60);

    // server-side numbers
    await until('lobby shows results', () => a.lobby?.phase === 'results');
    const m = ctx.metricsOf(code);
    const seconds = ra.tick / 60;
    expect(m.net.invalidMessages).toBe(0);
    expect(m.net.resyncsServed).toBe(1);
    expect(m.net.resyncsLimited).toBe(1);
    expect(m.inputs.accepted).toBeGreaterThan(50);
    expect(m.matches).toEqual({ started: 1, finished: 1 });
    expect(m.ticks.run).toBe(ra.tick);
    console.log(
      '[measured] ' +
        JSON.stringify({
          matchSeconds: Math.round(seconds * 10) / 10,
          framesBytesPerClientPerSec: Math.round(m.net.framesBytesPerClient / seconds),
          framesRawBytesPerSec: Math.round(m.net.framesBytesRaw / seconds),
          clientSeenFrameBytes: a.frameBytes,
          keyframeBytes: Math.round(m.net.keyframeBytes / m.net.keyframesSent),
          stepMs: m.ticks.stepMs,
          broadcastMs: m.ticks.broadcastMs,
          timerLatenessMs: m.ticks.timerLatenessMs,
          ticksDropped: m.ticks.dropped,
        }),
    );

    // rematch: same members, back in the lobby, then through the countdown into a second, different match
    a.room.send(MSG.rematch);
    await until('back in lobby', () => a.lobby?.phase === 'lobby' && b.lobby?.phase === 'lobby');
    expect(a.lobby!.members.map((x) => [x.name, x.seat, x.ready])).toEqual([
      ['Ada', null, false],
      ['Bayo', null, false],
    ]);
    a.room.send(MSG.start);
    await until('second match', () => a.welcomes.length === 3 && a.keyframes === 3 && b.keyframes === 2);
    expect(a.welcomes.at(-1)!.descriptor!.matchId).not.toBe(descriptor.matchId);
  });
});

describe('operations', () => {
  it('serves /health and /metrics and applies the origin policy', async () => {
    const a = ctx.track(await create(ctx.server, 'Ada', { durationSec: 10 })); // a public room to list
    const health = await fetch(`${ctx.server.http}/health`);
    expect(await health.json()).toEqual({ ok: true });

    const res = await fetch(`${ctx.server.http}/metrics`);
    const body = (await res.json()) as {
      process: { cpuUsage: unknown; memoryUsage: { rss: number }; eventLoopDelayMs: { p99: number } };
      rooms: RoomMetricsSnapshot[];
    };
    expect(body.process.memoryUsage.rss).toBeGreaterThan(0);
    expect(body.process.eventLoopDelayMs).toHaveProperty('p99');
    expect(body.process.cpuUsage).toHaveProperty('user');
    const room = body.rooms.find((r) => r.code === a.room.roomId)!;
    expect(room).toMatchObject({ phase: 'lobby', humans: 1, isPrivate: false });

    const ok = await fetch(`${ctx.server.http}/health`, { headers: { Origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const evil = await fetch(`${ctx.server.http}/health`, { headers: { Origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();

    // a browser from a foreign origin cannot open the socket either
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${ctx.server.url}/${a.room.roomId}`, {
        headers: { Origin: 'https://evil.example' },
      });
      ws.on('unexpected-response', (_req, r) => resolve(r.statusCode ?? 0));
      ws.on('open', () => resolve(101));
      ws.on('error', () => undefined);
    });
    expect(status).toBe(403);
  });
});
