/**
 * Regression test (decision FU2S-C5): a connection that drops AGAIN before its page acknowledged the (re)join must not lose
 * the seat. Found in the two-browser e2e on a loaded machine: both browsers were starved for a while (software WebGL), the
 * server's liveness check dropped both sockets, both pages reconnected, and 18 s later one reconnected socket was dropped
 * again before its page had run the join acknowledgement. For Colyseus that client had never "joined", `allowReconnection`
 * refused it ("not joined") and the room logged `seat 1 dropped` and `seat 1 left for good` in the same millisecond: the
 * seat went to a bot permanently, the 60 s window never started, and the page (still retrying) was refused for good.
 */
import { matchMaker } from '@colyseus/core';
import { describe, expect, it } from 'vitest';
import { TestContext, dropSocket, matchOf, sleep, until } from './helpers';
import type { TestPlayer } from './helpers';

const ctx = new TestContext({ graceSeconds: 0.3, reconnectSeconds: 8 });

/** Colyseus' JOIN_ROOM message: [code, tokenLength, token bytes ...]. */
const tokenOf = (data: ArrayBuffer): string => {
  const b = new Uint8Array(data);
  return new TextDecoder().decode(b.subarray(2, 2 + b[1]!));
};

describe('a socket that drops before it acknowledged its join', () => {
  it('keeps the seat: the window still runs, and the player comes back to the same fighter', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a, b] = all as [TestPlayer, TestPlayer];
    const seat = a.seat!;
    const match = matchOf(code);
    const sessionId = a.room.sessionId;
    const firstToken = a.room.reconnectionToken.split(':')[1]!;
    a.room.reconnection.enabled = false;
    dropSocket(code, sessionId);
    await until('b sees a drop', () => b.lobby?.members.find((m) => m.seat === seat)?.connected === false);

    // a raw socket takes the seat back but never runs the join acknowledgement (what a page whose main thread is busy does)
    const url = `${ctx.server.url}/${matchMaker.processId}/${code}?sessionId=${sessionId}&reconnectionToken=${firstToken}&skipHandshake=1`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const secondToken = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (e) => resolve(tokenOf(e.data as ArrayBuffer));
      ws.onclose = () => reject(new Error('the reconnect was refused'));
      setTimeout(() => reject(new Error('no join message')), 5000);
    });
    await until(
      'server shows a back',
      () => b.lobby?.members.find((m) => m.seat === seat)?.connected === true,
    );

    // ... and the link drops again before the acknowledgement could be sent
    const room = matchMaker.getLocalRoomById(code)!;
    const fresh = room.clients.find((c) => c.sessionId === sessionId)!;
    ws.onclose = null;
    (fresh.ref as unknown as { terminate(): void }).terminate();
    await until(
      'b sees a drop again',
      () => b.lobby?.members.find((m) => m.seat === seat)?.connected === false,
    );
    await sleep(500);

    // the seat is still a held seat: a member of the lobby, played by a bot meanwhile, the window open
    expect(b.lobby!.members.some((m) => m.seat === seat)).toBe(true);
    expect(b.lobby!.members).toHaveLength(2);
    await until('a bot plays it', () => match.controlOf(seat) === 'bot');
    expect(ctx.metricsOf(code).net).toMatchObject({ drops: 2, dropsBeforeAck: 1 });

    // and the player can still come back, with the token of the connection that dropped
    a.attach(await ctx.server.client().reconnect(`${code}:${secondToken}`));
    await until('a is back', () => a.welcomes.length >= 3 && a.keyframes >= 2);
    expect(a.welcomes.at(-1)).toMatchObject({ seat, roomCode: code });
    await until('b sees a back', () => b.lobby?.members.find((m) => m.seat === seat)?.connected === true);
    expect(match.controlOf(seat)).toBe('human');
    expect(match.humanSeatsConnected().sort()).toEqual([0, 1]);
  });
});
