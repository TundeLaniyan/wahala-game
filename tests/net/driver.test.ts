/**
 * The online match driver (decision ON3): the replica it plays, the input it sends, the status it reports. The server side is
 * the real transport-agnostic match core (`server/src/core/RumbleMatch.ts`) run in process; the "network" is a queue of the
 * exact bytes the room would send. Nothing is drawn: the controller's presentation is exercised by the browser specs.
 */
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { NetMatchDriver, MIN_STATE_SEND_MS, PING_EVERY_MS } from '../../src/net/client/driver';
import { MSG } from '../../src/net/protocol';
import { pack } from '../../src/net/pack';
import type { InputMsg, WelcomeMsg } from '../../src/net/protocol';
import { canonicalClone } from '../../src/net/pack';
import { makeMatch } from './helpers';
import type { RumbleMatch } from '../../server/src/core/RumbleMatch';

interface Rig {
  driver: NetMatchDriver;
  sent: { type: string; msg: unknown }[];
  clock: { ms: number };
  match: RumbleMatch;
}

function rig(seat = 0): Rig {
  const match = makeMatch({ humans: 2, bots: 30 });
  const sent: Rig['sent'] = [];
  const clock = { ms: 1000 };
  const driver = new NetMatchDriver({
    send: (type, msg) => sent.push({ type, msg }),
    inflate: async (b) => new Uint8Array(inflateRawSync(b)),
    now: () => clock.ms,
  });
  const welcome: WelcomeMsg = { descriptor: canonicalClone(match.descriptor), seat, roomCode: 'ABCDEF' };
  driver.onWelcome(welcome);
  driver.onKeyframe(new Uint8Array(deflateRawSync(pack(match.keyframe()))));
  return { driver, sent, clock, match };
}

/** Steps the server `ticks` ticks and delivers every frames message. */
function serve(r: Rig, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    r.match.step();
    const bytes = r.match.flush();
    if (bytes) r.driver.onFrames(new Uint8Array(deflateRawSync(bytes))); // the room deflates what the match flushes
  }
}

describe('replica and playout', () => {
  it('has no state until the first keyframe, then exposes the replica for the controller', async () => {
    const match = makeMatch({ humans: 2, bots: 30 });
    const driver = new NetMatchDriver({
      send: () => undefined,
      inflate: async (b) => new Uint8Array(inflateRawSync(b)),
      now: () => 0,
    });
    expect(driver.state()).toBeNull();
    driver.onWelcome({ descriptor: canonicalClone(match.descriptor), seat: 1, roomCode: 'ABCDEF' });
    expect(driver.state()).toBeNull();
    driver.onKeyframe(new Uint8Array(deflateRawSync(pack(match.keyframe()))));
    await driver.settled();
    expect(driver.state()).not.toBeNull();
    expect(driver.localId).toBe(1); // the server-assigned seat, not 0
    expect(driver.state()!.players).toHaveLength(32);
  });

  it('plays the server out: advance applies the frames in order and returns their events and an alpha', async () => {
    const r = rig();
    await r.driver.settled();
    serve(r, 120);
    await r.driver.settled();
    const before = r.driver.state()!.tick;
    let applied = 0;
    for (let i = 0; i < 90 && applied < 100; i++) {
      const out = r.driver.advance(1000 / 60);
      expect(out.alpha).toBeGreaterThanOrEqual(0);
      expect(out.alpha).toBeLessThanOrEqual(1);
      applied = r.driver.state()!.tick - before;
    }
    expect(r.driver.state()!.tick).toBeGreaterThan(before);
    expect(r.driver.replica!.stats.hashMismatches).toBe(0);
  });

  it('reports the connection and the round trip to the HUD chip', async () => {
    const r = rig();
    expect(r.driver.status().connection).toBe('connecting');
    r.driver.setConnection('connected', null);
    r.driver.advance(16); // first heartbeat: a ping goes out
    expect(r.sent.some((s) => s.type === MSG.ping)).toBe(true);
    r.clock.ms += 87;
    r.driver.onPong({ c: 1000, t: 5 });
    expect(r.driver.status().rttMs).toBe(87);
    r.driver.setConnection('reconnecting', 'connection lost (1006)');
    expect(r.driver.status()).toMatchObject({ connection: 'reconnecting', detail: 'connection lost (1006)' });
    r.driver.setConnection('connected', 'back');
    expect(r.driver.status().detail).toBeNull();
  });

  it('pings once a second and asks for a keyframe when a message cannot be decoded', async () => {
    const r = rig();
    r.driver.setConnection('connected', null);
    r.driver.advance(16);
    r.clock.ms += PING_EVERY_MS - 1;
    r.driver.advance(16);
    expect(r.sent.filter((s) => s.type === MSG.ping)).toHaveLength(1);
    r.clock.ms += 2;
    r.driver.advance(16);
    expect(r.sent.filter((s) => s.type === MSG.ping)).toHaveLength(2);
    r.driver.onFrames(new Uint8Array([1, 2, 3])); // garbage
    await r.driver.settled();
    expect(r.sent.some((s) => s.type === MSG.resync)).toBe(true);
  });
});

describe('input', () => {
  const lastInput = (r: Rig): InputMsg => r.sent.filter((s) => s.type === MSG.input).at(-1)!.msg as InputMsg;

  it('sends only what changed, at most every 33 ms, and a button press at once', async () => {
    const r = rig();
    await r.driver.settled();
    const state = r.driver.state()!;
    r.driver.sendIntent({ move: 'left' }, state, 1);
    expect(lastInput(r)).toMatchObject({ s: 0, m: 'left', h: false, b: 0 });
    r.driver.sendIntent({ move: 'left' }, state, 1); // unchanged: nothing
    expect(r.sent.filter((s) => s.type === MSG.input)).toHaveLength(1);
    r.clock.ms += 5;
    r.driver.sendIntent({ move: 'up' }, state, 1); // changed but too soon: held back, not lost
    expect(r.sent.filter((s) => s.type === MSG.input)).toHaveLength(1);
    r.clock.ms += MIN_STATE_SEND_MS;
    r.driver.sendIntent({ move: 'up' }, state, 1);
    expect(lastInput(r)).toMatchObject({ m: 'up' });
    r.clock.ms += 1;
    r.driver.sendIntent({ move: 'up', place: true }, state, 1); // a press goes now
    expect(lastInput(r)).toMatchObject({ m: 'up', b: 1 });
    r.driver.sendIntent({ special: true, detonate: true }, state, 1);
    expect(lastInput(r)).toMatchObject({ b: 6 });
  });

  it('carries nothing but {s, m, h, b}: the client can never name a position, hit, kill or result', async () => {
    const r = rig();
    await r.driver.settled();
    r.driver.sendIntent({ move: 'right', place: true, placeHeld: true }, r.driver.state()!, 1);
    const msg = lastInput(r);
    expect(Object.keys(msg).sort()).toEqual(['b', 'h', 'm', 's']);
  });

  it('never sends after dispose, and a drop forgets what was held', async () => {
    const r = rig();
    await r.driver.settled();
    const state = r.driver.state()!;
    r.driver.setConnection('connected', null);
    r.driver.sendIntent({ move: 'left' }, state, 1);
    r.driver.setConnection('reconnecting', 'lost');
    r.driver.setConnection('connected', 'back');
    r.clock.ms += 100;
    r.driver.sendIntent({ move: 'left' }, state, 1); // the held direction is sent again after a reconnect
    expect(r.sent.filter((s) => s.type === MSG.input)).toHaveLength(2);
    r.driver.dispose();
    r.clock.ms += 100;
    r.driver.sendIntent({ move: 'down' }, state, 1);
    expect(r.sent.filter((s) => s.type === MSG.input)).toHaveLength(2);
    expect(r.driver.advance(16).events).toEqual([]);
  });
});

describe('end of match', () => {
  it('ended() is true once the server sent results, whatever the replica shows', async () => {
    const r = rig();
    await r.driver.settled();
    expect(r.driver.ended()).toBe(false);
    r.driver.onResults({ ...r.match.results(), matchId: r.match.descriptor.matchId });
    expect(r.driver.ended()).toBe(true);
  });

  it('a second welcome of the SAME match (a reconnect) keeps the replica; a new match id replaces it', async () => {
    const r = rig();
    await r.driver.settled();
    const first = r.driver.replica;
    r.driver.onWelcome({ descriptor: canonicalClone(r.match.descriptor), seat: 0, roomCode: 'ABCDEF' });
    expect(r.driver.replica).toBe(first);
    const other = canonicalClone(r.match.descriptor);
    other.matchId = 'm-next';
    r.driver.onWelcome({ descriptor: other, seat: 0, roomCode: 'ABCDEF' });
    expect(r.driver.replica).not.toBe(first);
    expect(r.driver.results).toBeNull();
  });
});
