import { describe, expect, it } from 'vitest';
import { CLOSE, MSG } from '../../src/net/protocol';
import { FLOOD_LIMIT } from '../src/rooms/RumbleRoom';
import { TestContext, sleep, until } from './helpers';

const ctx = new TestContext();

describe('abuse', () => {
  it('counts malformed inputs and unknown messages, never crashes, and kicks a flooder', async () => {
    const { all, code } = await ctx.privateMatch(['Mallory'], { durationSec: 60 });
    const [m] = all;
    await until('frames', () => m!.frameMessages > 5);
    const tickAt = (): number => m!.replica!.state!.tick;

    const bad: Array<[string, unknown]> = [
      [MSG.input, { s: 1, m: 'up', h: false, b: 0, x: 500 }], // an extra field (a position, say)
      [MSG.input, { s: 1, m: 'up', h: false, b: 0, hp: 999 }],
      [MSG.input, { s: -1, m: 'up', h: false, b: 0 }],
      [MSG.input, { s: 1, m: 'north', h: false, b: 0 }],
      [MSG.input, { s: 1, m: 'up', h: 'yes', b: 0 }],
      [MSG.input, { s: 1, m: 'up', h: false, b: 8 }],
      [MSG.input, { s: 1.5, m: 'up', h: false, b: 0 }],
      [MSG.input, 'up'],
      [MSG.input, [1, 2, 3, 4]],
      [MSG.input, { s: 1, m: null, h: false }],
      ['teleport', { x: 3, y: 4 }],
      ['kill', { seat: 5 }],
      ['results', { winnerSeat: 0 }],
      ['seed', 42],
      [MSG.ping, { c: 'abc' }],
    ];
    for (const [type, payload] of bad) m!.room.send(type, payload);
    m!.room.send(MSG.ping, { c: 7 });
    await until('pong after the garbage', () => m!.pongs.length === 1);
    const snap = ctx.metricsOf(code);
    expect(snap.net.invalidMessages).toBe(bad.length);
    expect(snap.net.unknownMessages).toBe(4);
    expect(snap.inputs.accepted).toBe(0);
    expect(snap.net.kicks).toBe(0);
    expect(m!.leftWith).toBeNull();
    const t0 = tickAt();
    await sleep(300);
    expect(tickAt()).toBeGreaterThan(t0); // the match is still running

    // a valid input still works afterwards
    m!.input('left');
    await until('accepted', () => ctx.metricsOf(code).inputs.accepted === 1);

    // flood: kicked with the abuse close code, the room survives and (with nobody left) goes away
    for (let i = 0; i < 40; i++) m!.room.send('spam', { i });
    await until('kicked', () => m!.leftWith !== null);
    expect(m!.leftWith).toBe(CLOSE.abuse);
    expect(m!.notices.at(-1)).toMatchObject({ code: 'kicked' });
    await until('room disposed', () => ctx.server.metrics.roomCount === 0);
  });

  it('a burst of valid inputs (a TCP-stall backlog) is applied, never kicked; a sustained flood is kicked', async () => {
    const { all, code } = await ctx.privateMatch(['Burst', 'Flood'], { durationSec: 60 });
    const [b, f] = all;
    await until('frames', () => b!.frameMessages > 5 && f!.frameMessages > 5);
    // 200 valid inputs at once: well beyond the old 120/s cut-off, as a multi-second mobile stall delivers them
    for (let i = 0; i < 200; i++)
      b!.room.send(MSG.input, { s: 10_000 + i, m: i % 2 ? 'up' : 'left', h: false, b: 0 });
    await until('burst applied', () => ctx.metricsOf(code).inputs.accepted >= 200);
    await sleep(300);
    expect(b!.leftWith).toBeNull();
    expect(ctx.metricsOf(code).net.kicks).toBe(0);
    // a client that keeps flooding valid inputs beyond FLOOD_LIMIT in one window is disconnected
    for (let i = 0; i < FLOOD_LIMIT + 50; i++)
      f!.room.send(MSG.input, { s: 20_000 + i, m: 'up', h: false, b: 0 });
    await until('flooder kicked', () => f!.leftWith !== null);
    expect(f!.leftWith).toBe(CLOSE.abuse);
    expect(b!.leftWith).toBeNull();
  });
});
