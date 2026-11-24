import { describe, expect, it } from 'vitest';
import { MATCH_END_BUDGET_MS, TestContext, dropSocket, matchOf, playRandomly, until } from './helpers';
import type { TestPlayer } from './helpers';

const ctx = new TestContext({ graceSeconds: 0.5, reconnectSeconds: 5 });

describe('connection loss', () => {
  it('an abrupt drop: a bot plays the seat after the grace period; reconnecting within the window restores it and the replica converges', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a, b] = all as [TestPlayer, TestPlayer];
    const stopA = playRandomly(a);
    const stopB = playRandomly(b, 110);
    await until('frames flowing', () => a.frameMessages > 30 && b.frameMessages > 30);

    const token = a.room.reconnectionToken;
    const seat = a.seat!;
    a.room.reconnection.enabled = false; // we reconnect by hand below, like a client that noticed the drop
    stopA();
    dropSocket(code, a.room.sessionId);

    await until(
      'b sees a disconnected',
      () => b.lobby?.members.find((m) => m.seat === seat)?.connected === false,
    );
    await until('a left (1006)', () => a.leftWith !== null);
    expect(a.leftWith).toBe(1006);
    expect(matchOf(code).humanSeatsConnected()).toEqual([b.seat]); // nobody human on a's seat, b still plays

    const room2 = await ctx.server.client().reconnect(token);
    a.leftWith = null;
    a.attach(room2);
    await until('welcome + keyframe again', () => a.welcomes.length === 3 && a.keyframes === 2);
    expect(a.welcomes[2]).toMatchObject({ seat, roomCode: code });
    expect(a.welcomes[2]!.descriptor).toEqual(a.welcomes[1]!.descriptor);
    await until('b sees a back', () => b.lobby?.members.find((m) => m.seat === seat)?.connected === true);
    expect(matchOf(code).humanSeatsConnected().sort()).toEqual([0, 1]);

    const acceptedBefore = ctx.metricsOf(code).inputs.accepted;
    const stopA2 = playRandomly(a); // the same TestPlayer keeps counting its input seq up
    await until('a and b results', () => a.results.length > 0 && b.results.length > 0, MATCH_END_BUDGET_MS);
    stopA2();
    stopB();
    expect(ctx.metricsOf(code).inputs.accepted).toBeGreaterThan(acceptedBefore);
    expect(ctx.metricsOf(code).net.reconnections).toBe(1);
    expect(a.results[0]).toEqual(b.results[0]);
    expect(a.hash()).toBe(a.results[0]!.stateHash);
    expect(b.hash()).toBe(a.results[0]!.stateHash);
    expect(a.replica!.stats.hashMismatches).toBe(0);
    expect(a.replica!.stats.resyncs).toBe(0);
    expect(a.leftWith).toBeNull();
  });
});
