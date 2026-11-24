/**
 * The 30-second reconnection window, waited out for real (decision FU2S-C5). Every other reconnection test shortens the
 * window; this one uses the PRODUCTION window (`reconnectSeconds` 30) and the wall clock, no fake timers:
 *
 *   t = 0         two players drop at the same instant (their sockets are cut, 1006) and do not retry on their own
 *   t = 20 s      the first one is back: same seat, same fighter, nothing reset (the window is open and honoured late)
 *   t = 30 s ...  the second one stays away; its window ends 30 s after the drop
 *   t > 30 s      its token is dead on both doors (matchmaking HTTP and the raw WebSocket): a clear refusal, the seat is
 *                 a bot for good, nobody else was affected, and the match's books say so
 *
 * The grace period before the bot plays is the production 5 s. It takes about 45 s of real time.
 */
import { matchMaker } from '@colyseus/core';
import { describe, expect, it } from 'vitest';
import { parseBusy } from '../../src/net/protocol';
import { TestContext, dropSocket, matchOf, playRandomly, until } from './helpers';
import type { TestPlayer } from './helpers';

const WINDOW_SEC = 30;
const ctx = new TestContext({ graceSeconds: 5, reconnectSeconds: WINDOW_SEC });

describe('the 30 s reconnection window, real clock', () => {
  it('a drop shorter than 30 s comes back to the same fighter; a drop longer than 30 s is a bot for good and a late return is refused', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo', 'Chidi'], { durationSec: 120 });
    const [a, b, c] = all as [TestPlayer, TestPlayer, TestPlayer];
    const stop = playRandomly(a);
    const seatB = b.seat!;
    const seatC = c.seat!;
    const tokenB = b.room.reconnectionToken;
    const tokenC = c.room.reconnectionToken;
    const sessionB = b.room.sessionId;
    const match = matchOf(code);
    b.room.reconnection.enabled = false;
    c.room.reconnection.enabled = false;

    const droppedAt = performance.now();
    dropSocket(code, b.room.sessionId);
    dropSocket(code, c.room.sessionId);
    await until('both drops noticed', () => a.lobby?.members.filter((m) => !m.connected).length === 2);
    const noticedAt = performance.now();

    // after the 5 s grace a bot plays both seats, the match never paused, and the window is still open
    await until(
      'bots took over',
      () => match.controlOf(seatB) === 'bot' && match.controlOf(seatC) === 'bot',
      15_000,
    );
    await until('the lobby says a bot plays both', () => a.lobby!.members.filter((m) => m.botControlled).length === 2);
    const tickBefore = match.state.tick;

    // C comes back at about 20 s (real time): the window is honoured late, the same fighter, nothing reset
    await until('20 s have passed', () => performance.now() - noticedAt >= 20_000, 40_000);
    const fighterC = match.state.players[seatC]!;
    const deathsC = fighterC.stats.deaths;
    c.leftWith = null; // the 1006 of the drop
    c.attach(await ctx.server.client().reconnect(tokenC));
    await until('C is back', () => c.welcomes.length >= 3 && c.keyframes >= 2);
    expect(c.welcomes.at(-1)).toMatchObject({ seat: seatC, roomCode: code });
    expect(match.state.players[seatC]).toBe(fighterC);
    expect(fighterC.stats.deaths).toBeGreaterThanOrEqual(deathsC);
    expect(match.controlOf(seatC)).toBe('human');
    expect(match.state.tick).toBeGreaterThan(tickBefore); // the match ran on all the while

    // B stays away until its window is over (30 s after the server noticed the drop), then tries the way a browser would
    await until('B window is over', () => performance.now() - noticedAt >= WINDOW_SEC * 1000 + 1500, 60_000);
    const lateBy = (performance.now() - droppedAt) / 1000;
    expect(lateBy).toBeGreaterThan(WINDOW_SEC);
    await until(
      'B was removed from the lobby for good',
      () => !a.lobby!.members.some((m) => m.seat === seatB),
    );
    expect(match.controlOf(seatB)).toBe('bot');

    // door 1: the matchmaking HTTP reconnect: one clear refusal, never a seat
    const refusal = await ctx.server
      .client()
      .reconnect(tokenB)
      .then(
        () => null,
        (e: unknown) => e as { message: string },
      );
    expect(refusal, 'a reconnect after the window must be refused').not.toBeNull();
    expect(parseBusy(refusal!.message)).toMatchObject({ code: 'room_unavailable' });
    expect(parseBusy(refusal!.message)!.text).toMatch(/time to come back has ended/);

    // door 2: the raw WebSocket the SDK itself uses to reconnect: closed with an error, never a welcome
    const room = matchMaker.getLocalRoomById(code)!;
    expect(room.clients.find((cl) => cl.sessionId === sessionB)).toBeUndefined();
    const closed = await new Promise<{ code: number; welcomed: boolean }>((resolve, reject) => {
      const url = `${ctx.server.url}/${matchMaker.processId}/${code}?sessionId=${sessionB}&reconnectionToken=${tokenB.split(':')[1]}&skipHandshake=1`;
      const ws = new WebSocket(url);
      let welcomed = false;
      ws.binaryType = 'arraybuffer';
      ws.onmessage = () => (welcomed = true);
      ws.onclose = (e) => resolve({ code: e.code, welcomed });
      ws.onerror = () => undefined;
      setTimeout(() => reject(new Error('the late reconnect was neither accepted nor closed')), 10_000);
    });
    expect(closed.code).not.toBe(1000);
    expect(closed.code).toBeGreaterThanOrEqual(1006);

    // the seat is a bot for the rest of the match, C and A were never disturbed, and the results say who played what
    expect(match.humanSeatsConnected().sort()).toEqual([a.seat, seatC].sort());
    expect(a.leftWith).toBeNull();
    expect(c.leftWith).toBeNull();
    stop();
    // the match's own books: B's seat was a bot from the grace period on (about 25 s of 60 ticks), C's came back to a human
    expect(match.seatStats(seatB)!.autopilotTicks).toBeGreaterThan(20 * 60);
    expect(match.seatStats(seatC)!.drops).toBe(1);
    expect(match.controlOf(seatC)).toBe('human');
  }, 180_000);
});
