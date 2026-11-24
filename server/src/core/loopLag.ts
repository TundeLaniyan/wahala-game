/**
 * The event loop's recent health, as the admission guard reads it (decision FU2S-C3): p99 of the loop's delay over the last
 * second, in ms beyond the 10 ms sampling timer. One interval, unref'd, stopped with the server (`stop()`), so a closed
 * server leaves no timer behind.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';

export class LoopLagSensor {
  private readonly h = monitorEventLoopDelay({ resolution: 10 });
  private timer: NodeJS.Timeout | null;
  private lagMs = 0;

  constructor(everyMs = 1000) {
    this.h.enable();
    this.timer = setInterval(() => {
      this.lagMs = Math.max(0, this.h.percentile(99) / 1e6 - 10);
      this.h.reset();
    }, everyMs);
    this.timer.unref();
  }

  /** p99 event-loop delay over the last completed second (ms). */
  read(): number {
    return this.lagMs;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.h.disable();
  }
}
