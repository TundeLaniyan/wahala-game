import { describe, expect, it } from 'vitest';
import { BusyError, Guard, KeyedBuckets, TokenBucket } from '../src/core/guard';
import { DEFAULT_LIMITS, roomCost } from '../src/core/limits';
import type { LimitsConfig } from '../src/core/limits';

const clock = () => {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};
const guardWith = (over: Partial<LimitsConfig> = {}, lag = () => 0) => {
  const c = clock();
  return { c, g: new Guard({ ...DEFAULT_LIMITS, ...over }, c.now, lag, () => 0) };
};
const who = (gid: string | null, ip = '203.0.113.1') => ({ ip, gid });
const catchBusy = (fn: () => void): BusyError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof BusyError) return e;
    throw e;
  }
  throw new Error('expected a BusyError');
};

describe('token bucket', () => {
  it('allows a burst, refills over time, and says how long to wait', () => {
    const b = new TokenBucket({ burst: 3, perMin: 6 }, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.waitSec(0)).toBe(10);
    expect(b.take(9_999)).toBe(false);
    expect(b.take(10_000)).toBe(true);
    expect(b.idle(10_000)).toBe(false);
    expect(b.idle(100_000)).toBe(true);
    expect(b.has(100_000, 3)).toBe(true);
  });

  it('keyed buckets stay bounded under a flood of distinct keys', () => {
    const k = new KeyedBuckets({ burst: 2, perMin: 1 }, 50);
    for (let i = 0; i < 5000; i++) k.take(`k${i}`, i);
    expect(k.size).toBeLessThanOrEqual(50);
  });
});

describe('matchmaking limits are per guest, with the address only as a ceiling', () => {
  it('limits room creation per guest and tells how long to wait; another guest behind the same address is not affected', () => {
    const { g } = guardWith({ guestCreate: { burst: 2, perMin: 6 } });
    const a = who('A'.repeat(22));
    g.checkMatchmake('create', a);
    g.checkMatchmake('create', a);
    const e = catchBusy(() => g.checkMatchmake('create', a));
    expect(e.busy).toBe('rate_limited');
    expect(e.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(() => g.checkMatchmake('create', who('B'.repeat(22)))).not.toThrow(); // same address, other guest
  });

  it('the per-address ceiling is generous (a carrier address with many players) but not unlimited', () => {
    const { g } = guardWith({ ipCreate: { burst: 30, perMin: 6 } });
    for (let i = 0; i < 30; i++) g.checkMatchmake('create', who(String(i).padStart(22, 'x')));
    expect(catchBusy(() => g.checkMatchmake('create', who('z'.repeat(22)))).busy).toBe('rate_limited');
  });

  it('requests without a guest id share the address bucket (a script cannot get a fresh bucket by omitting it)', () => {
    const { g } = guardWith({ guestCreate: { burst: 1, perMin: 1 } });
    g.checkMatchmake('create', who(null));
    expect(catchBusy(() => g.checkMatchmake('create', who(null))).busy).toBe('rate_limited');
  });

  it('code guessing: failed joins are limited per guest and per address, a correct join costs nothing', () => {
    const { g } = guardWith({ guestJoinFail: { burst: 3, perMin: 6 } });
    const w = who('C'.repeat(22));
    for (let i = 0; i < 3; i++) {
      g.checkMatchmake('joinById', w);
      g.joinFailed(w);
    }
    const e = catchBusy(() => g.checkMatchmake('joinById', w));
    expect(e.busy).toBe('rate_limited');
    expect(e.reason).toBe('guest_join_fail');
    // joinOrCreate (quick play) is not a code guess
    expect(() => g.checkMatchmake('joinOrCreate', w)).not.toThrow();
    // failures of reconnect tokens count the same way
    expect(catchBusy(() => g.checkMatchmake('reconnect', w)).reason).toBe('guest_join_fail');
  });

  it('internal (server-side) calls are exempt from per-client limits', () => {
    const { g } = guardWith({ guestCreate: { burst: 1, perMin: 1 } });
    for (let i = 0; i < 20; i++) g.checkMatchmake('create', { ip: 'internal', gid: null, internal: true });
  });
});

describe('room caps', () => {
  it('a global cap on rooms answers server_busy with a retry time; a freed room makes room again', () => {
    const { g } = guardWith({ maxRooms: 2, busyRetrySec: 20 });
    g.roomCreating('R1', who('a'.repeat(22)));
    g.roomCreating('R2', who('b'.repeat(22), '198.51.100.2'));
    const e = catchBusy(() => g.roomCreating('R3', who('c'.repeat(22), '198.51.100.3')));
    expect(e).toMatchObject({ busy: 'server_busy', reason: 'rooms_full' });
    expect(e.retryAfterSec).toBeGreaterThanOrEqual(20);
    expect(catchBusy(() => g.checkMatchmake('create', who('d'.repeat(22), '198.51.100.4'))).busy).toBe(
      'server_busy',
    );
    g.roomDisposed('R1');
    expect(() => g.roomCreating('R3', who('c'.repeat(22), '198.51.100.3'))).not.toThrow();
  });

  it('caps rooms owned per guest and per address, and releases them when the room goes', () => {
    const { g } = guardWith({ maxRoomsPerGuest: 1, maxRoomsPerIp: 2 });
    const a = who('a'.repeat(22));
    g.roomCreating('R1', a);
    expect(catchBusy(() => g.roomCreating('R2', a)).reason).toBe('guest_rooms');
    g.roomCreating('R2', who('b'.repeat(22)));
    expect(catchBusy(() => g.roomCreating('R3', who('c'.repeat(22)))).reason).toBe('ip_rooms');
    g.roomDisposed('R1');
    expect(() => g.roomCreating('R3', a)).not.toThrow();
  });

  it('the connection cap refuses past the limit and counts closes', () => {
    const { g } = guardWith({ maxConnections: 2 });
    const w = who('a'.repeat(22));
    g.connectionOpened(w);
    g.connectionOpened(w);
    expect(catchBusy(() => g.connectionOpened(w)).busy).toBe('server_busy');
    g.connectionClosed(w);
    expect(() => g.connectionOpened(w)).not.toThrow();
    expect(g.snapshot().connections).toBe(2);
  });
});

describe('the match budget: N rooms of 31 bots cannot starve the event loop', () => {
  it('admits as many bot-heavy rooms as the cost budget holds, then queues the next one in order', () => {
    const { g, c } = guardWith({ cpuBudget: 75, maxPlayingRooms: 50 });
    expect(g.requestStart('A', 31).ok).toBe(true);
    expect(g.requestStart('B', 31).ok).toBe(true);
    expect(g.requestStart('C', 31).ok).toBe(true); // 3 x 23.95 = 71.9 <= 75
    c.advance(10);
    const d = g.requestStart('D', 31);
    expect(d).toMatchObject({ ok: false, reason: 'cpu_budget', position: 1 });
    c.advance(10);
    expect(g.requestStart('E', 31)).toMatchObject({ ok: false, reason: 'queued', position: 2 });
    g.matchEnded('A');
    // D asks again first and gets the slot; E (younger) still waits even though it would fit later
    expect(g.requestStart('E', 31)).toMatchObject({ ok: false, reason: 'queued' });
    expect(g.requestStart('D', 31).ok).toBe(true);
    expect(g.snapshot().costInUse).toBeCloseTo(3 * roomCost(31), 1);
  });

  it('a cheaper room (humans fill it) is admitted where a bot-heavy one is not, and an empty server always runs one room', () => {
    const { g } = guardWith({ cpuBudget: 40, maxPlayingRooms: 50 });
    expect(g.requestStart('A', 31).ok).toBe(true); // 24 on an empty server
    expect(g.requestStart('B', 31).ok).toBe(false); // 48 > 40
    g.cancelStart('B');
    expect(g.requestStart('C', 0).ok).toBe(true); // 24 + 10 <= 40
    const tiny = guardWith({ cpuBudget: 5 });
    expect(tiny.g.requestStart('X', 31).ok).toBe(true); // never deadlocks honest play on a tiny budget
  });

  it('caps rooms playing at once, whatever their cost', () => {
    const { g } = guardWith({ maxPlayingRooms: 2, cpuBudget: 1e6 });
    g.requestStart('A', 0);
    g.requestStart('B', 0);
    expect(g.requestStart('C', 0)).toMatchObject({ ok: false, reason: 'playing_rooms_full' });
  });

  it('does not start another match while the event loop is already struggling, but starts the first one', () => {
    let lag = 0;
    const { g } = guardWith({ startLoopLagMs: 100, cpuBudget: 1e6 }, () => lag);
    lag = 500;
    expect(g.requestStart('A', 31).ok).toBe(true); // nothing running: the lag is not a match's doing
    expect(g.requestStart('B', 31)).toMatchObject({ ok: false, reason: 'loop_lag' });
    lag = 20;
    expect(g.requestStart('B', 31).ok).toBe(true);
  });

  it('a room that is playing is always ok, and a disposed room leaves the queue and the budget', () => {
    const { g } = guardWith({ maxPlayingRooms: 1 });
    g.requestStart('A', 31);
    expect(g.requestStart('A', 31).ok).toBe(true);
    g.requestStart('B', 31);
    expect(g.snapshot().waitingToStart).toBe(1);
    g.roomDisposed('B');
    expect(g.snapshot().waitingToStart).toBe(0);
    g.roomDisposed('A');
    expect(g.snapshot().costInUse).toBe(0);
  });

  it('reports how long a room has waited, and the busy wording for it', () => {
    const { g, c } = guardWith({ maxPlayingRooms: 1 });
    g.requestStart('A', 31);
    const d = g.requestStart('B', 31);
    c.advance(12_000);
    expect(g.waitedSec('B')).toBeCloseTo(12, 0);
    const e = g.startBusy(d);
    expect(e.busy).toBe('server_busy');
    expect(e.message).toMatch(/busy/i);
  });
});
