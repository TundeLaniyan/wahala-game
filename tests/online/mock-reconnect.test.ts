import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../src/online/schema';
import { mock, quickMatchRoom, val } from './helpers';

type M = ReturnType<typeof mock>;

async function liveMatch(m: M) {
  const room = await quickMatchRoom(m);
  val(await m.online.lobbies.setReady(room.id, true));
  let r = val(await m.online.lobbies.get(room.id));
  for (let i = 0; i < 200 && r.state !== 'inProgress'; i++) {
    m.wait(100);
    r = val(await m.online.lobbies.get(room.id));
  }
  const descriptor = val(await m.online.matches.join(r.matchId!));
  m.online.control.pause(descriptor.matchId, true);
  m.online.control.step(descriptor.matchId, 200);
  return descriptor;
}

describe('mock reconnect', () => {
  it('a dropped connection holds the seat for the grace window; resume rebuilds state from snapshot + input log', async () => {
    const m = mock({ graceMs: 20_000 });
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    const d = await liveMatch(m);
    const lastSeen = val(await m.online.matches.snapshot(d.matchId));
    val(await m.online.matches.submitInput(d.matchId, lastSeen.tick, { move: 'right', place: true }));
    m.online.control.step(d.matchId, 30);
    val(m.online.control.simulateDrop(d.matchId));
    expect(m.online.connection()).toBe('reconnecting');
    const dropped = events.find((e) => e.type === 'match.connection' && !e.connected);
    expect(dropped).toMatchObject({ graceMs: 20_000, seat: 0 });
    // while the connection is down the server refuses input and the seat idles
    expect(await m.online.matches.submitInput(d.matchId, lastSeen.tick + 30, { move: 'up' })).toMatchObject({
      error: { code: 'conflict' },
    });
    m.online.control.step(d.matchId, 60);
    m.clock.advance(5000);
    m.online.control.pump();

    const resumed = val(
      await m.online.reconnect.resume({
        matchId: d.matchId,
        resumeToken: d.resumeToken,
        lastAckedTick: lastSeen.tick,
      }),
    );
    expect(m.online.connection()).toBe('connected');
    expect(resumed.graceRemainingMs).toBe(15_000);
    expect(resumed.snapshot.tick).toBeGreaterThan(lastSeen.tick);
    expect(resumed.snapshot.players[0]!.connected).toBe(true);
    // the log carries what the server accepted since the client's last tick (the ones before are not re-sent)
    expect(resumed.inputLog.every((e) => e.tick >= lastSeen.tick)).toBe(true);
    expect(resumed.inputLog.some((e) => e.seat === 0 && e.intent.place)).toBe(true);
    expect(events.some((e) => e.type === 'match.connection' && e.connected)).toBe(true);
    // the server state is intact and equals a replay of the whole log
    const check = m.online.control.verifyReplay(d.matchId)!;
    expect(check.replayed).toBe(check.live);
    // input works again
    expect((await m.online.matches.submitInput(d.matchId, resumed.snapshot.tick, { move: 'down' })).ok).toBe(
      true,
    );
  });

  it('the resume token is single use: a stolen or replayed token is refused', async () => {
    const m = mock();
    const d = await liveMatch(m);
    val(m.online.control.simulateDrop(d.matchId));
    expect(
      await m.online.reconnect.resume({ matchId: d.matchId, resumeToken: 'x'.repeat(24), lastAckedTick: 0 }),
    ).toMatchObject({ error: { code: 'forbidden' } });
    val(
      await m.online.reconnect.resume({ matchId: d.matchId, resumeToken: d.resumeToken, lastAckedTick: 0 }),
    );
    expect(
      await m.online.reconnect.resume({ matchId: d.matchId, resumeToken: d.resumeToken, lastAckedTick: 0 }),
    ).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('after the grace window a bot takes the seat and the resume is refused (reconnectExpired)', async () => {
    const m = mock({ graceMs: 10_000 });
    const events: ServerEvent[] = [];
    m.online.events.subscribe((e) => events.push(e));
    const d = await liveMatch(m);
    val(m.online.control.simulateDrop(d.matchId));
    m.wait(10_500, 500);
    const rec = m.online.control.inspect(d.matchId)!;
    expect(rec.links[0]!).toMatchObject({ expired: true, bot: true, connected: false });
    expect(events.filter((e) => e.type === 'match.connection').at(-1)).toMatchObject({
      connected: false,
      graceMs: null,
    });
    expect(
      await m.online.reconnect.resume({ matchId: d.matchId, resumeToken: d.resumeToken, lastAckedTick: 0 }),
    ).toMatchObject({
      error: { code: 'reconnectExpired' },
    });
  });

  it('resuming a match that has already ended is expired too; unknown matches and strangers are refused', async () => {
    const m = mock();
    const d = await liveMatch(m);
    val(m.online.control.simulateDrop(d.matchId));
    val(m.online.control.fastForward(d.matchId));
    expect(
      await m.online.reconnect.resume({ matchId: d.matchId, resumeToken: d.resumeToken, lastAckedTick: 0 }),
    ).toMatchObject({
      error: { code: 'reconnectExpired' },
    });
    expect(
      await m.online.reconnect.resume({ matchId: 'nope', resumeToken: d.resumeToken, lastAckedTick: 0 }),
    ).toMatchObject({ error: { code: 'notFound' } });
  });

  it('dropping twice, or dropping a seat a bot already plays, is refused', async () => {
    const m = mock();
    const d = await liveMatch(m);
    val(m.online.control.simulateDrop(d.matchId));
    val(await m.online.matches.leave(d.matchId));
    expect(m.online.control.simulateDrop(d.matchId)).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(m.online.control.simulateDrop('nope')).toMatchObject({ ok: false, error: { code: 'notFound' } });
  });
});
