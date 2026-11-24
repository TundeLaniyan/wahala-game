import { describe, expect, it } from 'vitest';
import { MATCH_END_BUDGET_MS, TestContext, dropSocket, matchOf, playRandomly, until } from './helpers';
import type { TestPlayer } from './helpers';

const RECONNECT_SEC = 1;
const ctx = new TestContext({ graceSeconds: 0.3, reconnectSeconds: RECONNECT_SEC });

describe('reconnection window', () => {
  it('when it expires the seat stays with a bot, the token is dead, and the match still finishes', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a, b] = all as [TestPlayer, TestPlayer];
    const stopB = playRandomly(b);
    const token = a.room.reconnectionToken;
    a.room.reconnection.enabled = false;
    const dropped = Date.now();
    dropSocket(code, a.room.sessionId);

    await until('b sees a disconnected', () => b.lobby?.members.some((m) => !m.connected) === true);
    expect(matchOf(code).humanSeatsConnected()).toEqual([b.seat]); // not a human; a bot after the grace period
    await until('window expired: a removed from the lobby', () => b.lobby?.members.length === 1, 10_000);
    expect(Date.now() - dropped).toBeGreaterThanOrEqual(RECONNECT_SEC * 1000 - 50);
    expect(matchOf(code).humanSeatsConnected()).toEqual([b.seat]); // now replaced for good
    await expect(ctx.server.client().reconnect(token)).rejects.toThrow();

    await until('b gets results', () => b.results.length > 0, MATCH_END_BUDGET_MS);
    stopB();
    expect(b.hash()).toBe(b.results[0]!.stateHash);
    expect(b.replica!.stats.hashMismatches).toBe(0);
    // the leaver is still a human seat in the (server-trusted) results; a bot just played it after the window
    expect(b.results[0]!.players.filter((p) => !p.isBot).map((p) => p.seat)).toEqual([0, 1]);
    // the seat belonged to the bot for the rest of the match: the absent player's personal numbers stay human-only
    const gone = b.results[0]!.players[a.seat!]!;
    expect(gone).toMatchObject({ drops: 1, controlledByBotAtEnd: true });
    expect(gone.autopilotSeconds).toBeGreaterThan(5);
    expect(gone.kills + gone.botKills!).toBe(matchOf(code).state.players[a.seat!]!.stats.kills);
  });
});
