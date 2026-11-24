/**
 * The disconnect policy end to end over real sockets (decisions ON6-ON8): grace period (the fighter stands), then a bot
 * plays the seat without pausing the match, the human takes back THE SAME fighter, results split human / bot numbers.
 * Test-fast mode: grace 3 s, window 8 s (production: 5 s and 30 s).
 */
import { describe, expect, it } from 'vitest';
import { MATCH_END_BUDGET_MS, TestContext, dropSocket, matchOf, playRandomly, sleep, until } from './helpers';
import type { TestPlayer } from './helpers';

const GRACE_SEC = 3;
const ctx = new TestContext({ graceSeconds: GRACE_SEC, reconnectSeconds: 8 });

/** A drops (abruptly, by hand-reconnect), b keeps playing. Returns what a test needs to bring `a` back. */
async function dropA(): Promise<{
  a: TestPlayer;
  b: TestPlayer;
  code: string;
  seat: number;
  token: string;
  stopB: () => void;
}> {
  const { all, code } = await ctx.privateMatch(['Ada', 'Bayo']);
  const [a, b] = all as [TestPlayer, TestPlayer];
  const stopA = playRandomly(a);
  const stopB = playRandomly(b, 110);
  await until('frames flowing', () => a.frameMessages > 30 && b.frameMessages > 30);
  const seat = a.seat!;
  const token = a.room.reconnectionToken;
  a.room.reconnection.enabled = false; // we reconnect by hand, like a client that noticed the drop
  stopA();
  dropSocket(code, a.room.sessionId);
  await until(
    'b sees a disconnected',
    () => b.lobby?.members.find((m) => m.seat === seat)?.connected === false,
  );
  return { a, b, code, seat, token, stopB };
}

async function comeBack(a: TestPlayer, token: string): Promise<void> {
  const room2 = await ctx.server.client().reconnect(token);
  a.leftWith = null;
  const welcomes = a.welcomes.length;
  const keyframes = a.keyframes;
  a.attach(room2);
  await until('welcome + keyframe again', () => a.welcomes.length > welcomes && a.keyframes > keyframes);
}

const memberOf = (p: TestPlayer, seat: number) => p.lobby?.members.find((m) => m.seat === seat);

describe('grace period, bot takeover, the match never pauses', () => {
  it('the fighter stands for the grace period, then the bot plays it; the lobby says so; the match keeps running', async () => {
    const { a, b, code, seat, stopB } = await dropA();
    const match = matchOf(code);
    expect(match.controlOf(seat)).toBe('absent');
    expect(memberOf(b, seat)).toMatchObject({ connected: false, botControlled: false });

    // ticks keep coming while we wait (the match is never paused), the seat stands, and the bot arrives at the end of
    // the grace period: exactly graceSeconds * 60 ticks of "absent"
    const ticks: number[] = [];
    const standingAt = `${match.state.players[seat]!.x},${match.state.players[seat]!.y}`;
    while (match.controlOf(seat) === 'absent') {
      ticks.push(match.state.tick);
      await sleep(15);
    }
    expect(ticks.length).toBeGreaterThan(10);
    expect(ticks.every((t, i) => i === 0 || t >= ticks[i - 1]!)).toBe(true);
    expect(ticks.at(-1)! - ticks[0]!).toBeGreaterThan(30);
    expect(match.seatStats(seat)!.absentTicks).toBe(GRACE_SEC * 60);
    expect(standingAt).toBeDefined();

    await until('b sees the bot', () => memberOf(b, seat)?.botControlled === true);
    expect(memberOf(b, seat)).toMatchObject({ connected: false, botControlled: true });
    expect(ctx.metricsOf(code).net).toMatchObject({ drops: 1, botTakeovers: 1 });
    const frames = b.frameMessages;
    const t = match.state.tick;
    await sleep(400);
    expect(b.frameMessages).toBeGreaterThan(frames); // b still gets the live match
    expect(match.state.tick).toBeGreaterThan(t + 5);
    expect(match.botControlledSeats()).toEqual([seat]);
    expect(match.humanSeatsConnected()).toEqual([b.seat]);
    stopB();
    expect(a.leftWith).toBe(1006);
  });

  it('reconnecting inside the grace period: the same fighter, no bot ever played it', async () => {
    const { a, b, code, seat, token, stopB } = await dropA();
    const match = matchOf(code);
    const fighter = match.state.players[seat]!;
    const deaths = fighter.stats.deaths;
    await comeBack(a, token);
    expect(match.controlOf(seat)).toBe('human');
    await until('b sees a back', () => memberOf(b, seat)?.connected === true);
    expect(memberOf(b, seat)).toMatchObject({ connected: true, botControlled: false });
    expect(match.state.players[seat]).toBe(fighter);
    expect(match.seatStats(seat)).toMatchObject({ autopilotTicks: 0, botKills: 0, botDeaths: 0, drops: 1 });
    expect(match.seatStats(seat)!.absentTicks).toBeGreaterThan(0);
    expect(match.seatStats(seat)!.absentTicks).toBeLessThan(GRACE_SEC * 60);
    await sleep((GRACE_SEC + 0.5) * 1000); // well past where the grace would have ended
    expect(ctx.metricsOf(code).net).toMatchObject({ drops: 1, botTakeovers: 0, reconnections: 1 });
    expect(match.seatStats(seat)!.autopilotTicks).toBe(0);
    expect(fighter.stats.deaths).toBeGreaterThanOrEqual(deaths); // (a death while standing still is the game)
    stopB();
  });

  it('reconnecting after the bot took over: the same fighter, no new life, personal and bot numbers separate in the results', async () => {
    const { a, b, code, seat, token, stopB } = await dropA();
    const match = matchOf(code);
    const fighter = match.state.players[seat]!;
    await until('the bot plays', () => match.controlOf(seat) === 'bot');
    await sleep(700);
    const placeBefore = { x: fighter.x, y: fighter.y };
    const deathsBefore = fighter.stats.deaths;
    await comeBack(a, token);
    // continuity: the very same Player object, still in the match where the bot left it (at most a few steps on)
    expect(match.state.players[seat]).toBe(fighter);
    expect(Math.abs(fighter.x - placeBefore.x) + Math.abs(fighter.y - placeBefore.y)).toBeLessThanOrEqual(4);
    expect(fighter.stats.deaths).toBeGreaterThanOrEqual(deathsBefore);
    expect(match.controlOf(seat)).toBe('human');
    await until('b sees a back, bot gone', () => memberOf(b, seat)?.connected === true);
    expect(memberOf(b, seat)).toMatchObject({ connected: true, botControlled: false });
    expect(ctx.metricsOf(code).net).toMatchObject({ drops: 1, botTakeovers: 1, reconnections: 1 });

    const acceptedBefore = ctx.metricsOf(code).inputs.accepted;
    const stopA = playRandomly(a);
    await until('results', () => a.results.length > 0 && b.results.length > 0, MATCH_END_BUDGET_MS);
    stopA();
    stopB();
    expect(ctx.metricsOf(code).inputs.accepted).toBeGreaterThan(acceptedBefore);
    expect(a.results[0]).toEqual(b.results[0]);
    expect(a.hash()).toBe(a.results[0]!.stateHash);
    expect(a.replica!.stats.hashMismatches).toBe(0);

    const row = a.results[0]!.players[seat]!;
    const sim = fighter.stats;
    expect(row).toMatchObject({ seat, isBot: false, drops: 1, controlledByBotAtEnd: false });
    expect(row.autopilotSeconds).toBeGreaterThan(0); // a bot played for a while (the exact seconds depend on machine load)
    expect(row.absentSeconds).toBe(GRACE_SEC);
    // the personal numbers are only what the human did; human + bot is exactly what the simulation counted
    expect(row.kills + row.botKills!).toBe(sim.kills);
    expect(row.deaths + row.botDeaths!).toBe(sim.deaths);
    expect(row.assists + row.botAssists!).toBe(sim.assists);
    // b never dropped
    expect(a.results[0]!.players[b.seat!]).toMatchObject({
      drops: 0,
      autopilotSeconds: 0,
      botKills: 0,
      controlledByBotAtEnd: false,
    });
  });

  it('the results payload is backward compatible: the original fields are all there, the new ones are additive and optional', async () => {
    const { all } = await ctx.privateMatch(['Ada']);
    const [a] = all as [TestPlayer];
    const stop = playRandomly(a);
    await until('results', () => a.results.length > 0, MATCH_END_BUDGET_MS);
    stop();
    const wire = JSON.parse(JSON.stringify(a.results[0])) as Record<string, unknown> & {
      players: Record<string, unknown>[];
    };
    for (const key of ['matchId', 'tick', 'winnerSeat', 'winnerTeam', 'draw', 'stateHash', 'players'])
      expect(wire).toHaveProperty(key);
    expect(wire.players).toHaveLength(32);
    for (const p of wire.players) {
      for (const key of ['seat', 'name', 'isBot', 'team', 'placement', 'kills', 'deaths', 'assists'])
        expect(p, `${String(p.name)}.${key}`).toHaveProperty(key);
    }
    const human = wire.players[0]!;
    expect(human).toMatchObject({ isBot: false, drops: 0, controlledByBotAtEnd: false, autopilotSeconds: 0 });
    const bot = wire.players[1]!;
    expect(bot.isBot).toBe(true);
    for (const key of [
      'botKills',
      'botDeaths',
      'botAssists',
      'autopilotSeconds',
      'absentSeconds',
      'drops',
      'controlledByBotAtEnd',
    ])
      expect(bot, key).not.toHaveProperty(key); // server bots carry no split
  });
});
