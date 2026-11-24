/**
 * A fixed-rate loop that does not drift: ticks are due at `start + n * stepMs` on a monotonic clock, a late timer runs
 * the owed ticks back to back (at most `maxCatchUp` per callback; the rest is dropped and counted), and the timer
 * lateness of every callback is recorded. Clock and timers are injectable so the loop is unit-testable.
 */
import { RollingStats } from './metrics';

export interface LoopTimers {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export const realTimers: LoopTimers = {
  now: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
};

export interface TickLoopOptions {
  stepMs: number;
  maxCatchUp: number;
  /** Runs one tick. Return `false` to stop the loop (e.g. the match ended). */
  onTick: () => boolean | void;
  onError?: (e: unknown) => void;
  timers?: LoopTimers;
}

export class TickLoop {
  ticksRun = 0;
  ticksDropped = 0;
  /** How late each callback was versus the time its first owed tick was due (ms). */
  readonly lateness = new RollingStats();
  private readonly timers: LoopTimers;
  private handle: unknown = null;
  private nextDue = 0;
  private active = false;

  constructor(private readonly opts: TickLoopOptions) {
    this.timers = opts.timers ?? realTimers;
  }

  get running(): boolean {
    return this.active;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.nextDue = this.timers.now() + this.opts.stepMs;
    this.arm();
  }

  stop(): void {
    this.active = false;
    if (this.handle !== null) this.timers.clearTimer(this.handle);
    this.handle = null;
  }

  private arm(): void {
    const wait = Math.max(0, Math.ceil(this.nextDue - this.timers.now()));
    this.handle = this.timers.setTimer(this.fire, wait);
  }

  private readonly fire = (): void => {
    this.handle = null;
    if (!this.active) return;
    const t = this.timers.now();
    const late = t - this.nextDue;
    if (late < 0) {
      this.arm(); // woke early (timers have 1 ms granularity): wait out the rest
      return;
    }
    this.lateness.push(late);
    const { stepMs, maxCatchUp } = this.opts;
    const owed = 1 + Math.floor(late / stepMs);
    const n = Math.min(owed, maxCatchUp);
    for (let i = 0; i < n; i++) {
      let keepGoing: boolean | void;
      try {
        keepGoing = this.opts.onTick();
      } catch (e) {
        this.stop();
        this.opts.onError?.(e);
        return;
      }
      this.ticksRun++;
      if (keepGoing === false) {
        this.stop();
        return;
      }
      if (!this.active) return;
    }
    if (owed > n) {
      this.ticksDropped += owed - n;
      this.nextDue = this.timers.now() + stepMs; // give up the backlog instead of spiralling
    } else {
      this.nextDue += n * stepMs;
    }
    this.arm();
  };
}
