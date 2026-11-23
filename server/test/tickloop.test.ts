import { describe, expect, it } from 'vitest';
import { TickLoop } from '../src/core/TickLoop';
import type { LoopTimers } from '../src/core/TickLoop';

/** A manual clock: `fire(extraMs)` jumps to the armed timer's due time (plus a stall) and runs it. */
function fakeTimers(): LoopTimers & { fire(extraMs?: number): void; t: number } {
  let pending: (() => void) | null = null;
  let at = 0;
  const timers = {
    t: 0,
    now: () => timers.t,
    setTimer: (fn: () => void, ms: number) => {
      pending = fn;
      at = timers.t + ms;
      return fn;
    },
    clearTimer: () => {
      pending = null;
    },
    fire(extraMs = 0) {
      const fn = pending;
      if (!fn) return;
      pending = null;
      timers.t = at + extraMs;
      fn();
    },
  };
  return timers;
}

const STEP = 1000 / 60;

describe('TickLoop', () => {
  it('runs one tick per step on time, without drift', () => {
    const timers = fakeTimers();
    let n = 0;
    const loop = new TickLoop({ stepMs: STEP, maxCatchUp: 6, onTick: () => void n++, timers });
    loop.start();
    for (let i = 0; i < 600; i++) timers.fire(); // timers have 1 ms granularity: always at most 1 ms late
    expect(n).toBe(600);
    expect(loop.ticksDropped).toBe(0);
    expect(loop.lateness.snapshot().max).toBeLessThanOrEqual(1);
  });

  it('runs the owed ticks after a late timer and records the lateness', () => {
    const timers = fakeTimers();
    let n = 0;
    const loop = new TickLoop({ stepMs: STEP, maxCatchUp: 6, onTick: () => void n++, timers });
    loop.start();
    timers.fire(50); // 50 ms late: the due tick plus 3 owed
    expect(n).toBe(1 + Math.floor((50 + (Math.ceil(STEP) - STEP)) / STEP));
    expect(loop.ticksDropped).toBe(0);
    expect(loop.lateness.snapshot().max).toBeCloseTo(50 + (Math.ceil(STEP) - STEP), 2);
  });

  it('caps catch-up at 6 ticks, drops and counts the rest, then resumes at the normal rate', () => {
    const timers = fakeTimers();
    let n = 0;
    const loop = new TickLoop({ stepMs: STEP, maxCatchUp: 6, onTick: () => void n++, timers });
    loop.start();
    timers.fire(1000); // a 1 s stall
    expect(n).toBe(6);
    expect(loop.ticksDropped).toBeGreaterThan(50);
    const dropped = loop.ticksDropped;
    timers.fire();
    expect(n).toBe(7);
    expect(loop.ticksDropped).toBe(dropped);
  });

  it('stops when onTick returns false, and when stopped', () => {
    const timers = fakeTimers();
    let n = 0;
    const loop = new TickLoop({ stepMs: STEP, maxCatchUp: 6, onTick: () => ++n < 3, timers });
    loop.start();
    timers.fire(100);
    expect(n).toBe(3);
    expect(loop.running).toBe(false);
    timers.fire(10_000);
    expect(n).toBe(3);
  });

  it('stops and reports when a tick throws', () => {
    const timers = fakeTimers();
    const errors: unknown[] = [];
    const loop = new TickLoop({
      stepMs: STEP,
      maxCatchUp: 6,
      onTick: () => {
        throw new Error('boom');
      },
      onError: (e) => errors.push(e),
      timers,
    });
    loop.start();
    timers.fire();
    expect(errors).toHaveLength(1);
    expect(loop.running).toBe(false);
  });
});
