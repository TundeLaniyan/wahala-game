/**
 * Smoothed per-frame cost of the main-thread sections (sim ticks, bot decisions, render), shown with `?fps`
 * and readable from `__WAHALA__.timings()`. It exists to answer "where does the frame go on a real phone"
 * without a profiler; it measures only and never feeds back into the game or the quality controller.
 */
export class SectionTimers {
  private readonly ema = new Map<string, number>();

  /** Adds one measurement (milliseconds spent in `name` this frame). */
  add(name: string, ms: number): void {
    const prev = this.ema.get(name);
    this.ema.set(name, prev === undefined ? ms : prev * 0.95 + ms * 0.05);
  }

  /** Runs `fn`, adding its duration under `name`. */
  time<T>(name: string, fn: () => T): T {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      this.add(name, performance.now() - t0);
    }
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries([...this.ema].map(([k, v]) => [k, Math.round(v * 100) / 100]));
  }
}
