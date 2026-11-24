/** RUMBLE_DROP_POLICY=idle: the dropped seat keeps standing for the whole window; then a bot takes it for good. */
import { describe, expect, it } from 'vitest';
import { TestContext, dropSocket, matchOf, playRandomly, until } from './helpers';
import type { TestPlayer } from './helpers';

const ctx = new TestContext({ graceSeconds: 0.2, reconnectSeconds: 1.5, dropPolicy: 'idle' });

describe('drop policy idle', () => {
  it('stands through the window (no bot), then the bot keeps the seat after the window', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
    const [a, b] = all as [TestPlayer, TestPlayer];
    const stopB = playRandomly(b, 110);
    const seat = a.seat!;
    const match = matchOf(code);
    a.room.reconnection.enabled = false;
    dropSocket(code, a.room.sessionId);
    await until('dropped', () => match.controlOf(seat) !== 'human');
    const at = `${match.state.players[seat]!.x},${match.state.players[seat]!.y}`;
    await new Promise((r) => setTimeout(r, 900)); // far past the 0.2 s grace, still inside the window
    expect(match.controlOf(seat)).toBe('absent');
    expect(`${match.state.players[seat]!.x},${match.state.players[seat]!.y}`).toBe(at);
    expect(match.seatStats(seat)!.autopilotTicks).toBe(0);
    expect(b.lobby?.members.find((m) => m.seat === seat)?.botControlled).toBe(false);
    await until('window over: the bot has the seat', () => match.controlOf(seat) === 'bot', 10_000);
    expect(ctx.metricsOf(code).net.botTakeovers).toBe(1);
    stopB();
  });
});
