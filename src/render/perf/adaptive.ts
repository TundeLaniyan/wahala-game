/**
 * Adaptive graphics controller (Auto mode). Pure and clock-free: it is fed `(frame time, now)` pairs and
 * answers with a rung change or nothing, so every threshold, hysteresis and cooldown is unit-tested with
 * a virtual clock (tests/render/adaptive-quality.test.ts).
 *
 * How it decides (all numbers in `DEFAULT_ADAPTIVE`):
 *  - Frame times go into a rolling window of `windowSec` seconds. Decisions use the MEDIAN and P90 of the
 *    window and a spike count, never a single frame, so one slow frame (a texture upload, a GC pause, an
 *    explosion's first draw) cannot move quality.
 *  - DOWN: the window median stays below `dropBelowFps` for `dropHoldSec` (or `severeHoldSec` and two rungs
 *    when below `severeBelowFps`; repeated frame spikes count as slow too). Then `dropCooldownSec` must have
 *    passed since the last change.
 *  - UP: the window P90 stays at or above `raiseAboveFps` (comfortable headroom: even the slow tenth of
 *    frames makes the target) for `raiseHoldSec`, at least `raiseDwellSec` after the last change.
 *  - HYSTERESIS: the drop line (45 fps median) and the raise line (55 fps p90) leave a dead band where
 *    nothing happens; after any change the window is emptied and sampling pauses for `settleSec`.
 *  - NO PING-PONG: if a rung that was just raised to is dropped again within `probationSec`, going up to it
 *    is blocked for `backoffBaseSec`, doubling on every repeat (up to `backoffMaxSec`).
 *  - FUTILE DROPS: when lowering quality does not make frames faster (a 30 Hz display or power-saver cap,
 *    a CPU-bound device) `futileLimit` drops in a row stop the descent and restore the quality they took
 *    away: the controller never grinds the game down to Very Low for a cap it cannot beat. The pause lasts
 *    `pinReleaseSec` and doubles each time it happens again, so a permanent cap is retried ever more rarely.
 *  - BUSY MOMENTS: while `ctx.busy` (an explosion burst on screen) a normal drop waits (its timer keeps
 *    running); a severe one does not.
 *  - Warm-up, loading and fast-forward are `suspend()`ed: frames in that time are not sampled. A gap longer
 *    than `stallSec` (background tab, device sleep) restarts the window instead of counting as a slow frame.
 *
 * It never touches the simulation: only the render budgets of quality.ts follow it.
 */

export interface AdaptiveConfig {
  windowSec: number;
  evalIntervalSec: number;
  warmupSec: number;
  settleSec: number;
  dropBelowFps: number;
  severeBelowFps: number;
  dropHoldSec: number;
  severeHoldSec: number;
  dropCooldownSec: number;
  raiseAboveFps: number;
  raiseHoldSec: number;
  raiseDwellSec: number;
  spikeMs: number;
  hitchSpikes: number;
  probationSec: number;
  backoffBaseSec: number;
  backoffMaxSec: number;
  futileRatio: number;
  futileLimit: number;
  /** First pin length after futile drops; doubles with every repeat. */
  pinReleaseSec: number;
  pinMaxSec: number;
  stallSec: number;
  /** Fewest frames a window needs before it is judged (a device at 1-2 fps still gets decisions). */
  minSamples: number;
  /** A normal drop waits at most this long for a busy moment to pass. */
  busyDeferSec: number;
}

export const DEFAULT_ADAPTIVE: Readonly<AdaptiveConfig> = {
  windowSec: 4,
  evalIntervalSec: 0.5,
  warmupSec: 4,
  settleSec: 3,
  dropBelowFps: 45,
  severeBelowFps: 24,
  dropHoldSec: 3,
  severeHoldSec: 1.5,
  dropCooldownSec: 8,
  raiseAboveFps: 55,
  raiseHoldSec: 15,
  raiseDwellSec: 30,
  spikeMs: 80,
  hitchSpikes: 5,
  probationSec: 60,
  backoffBaseSec: 90,
  backoffMaxSec: 900,
  futileRatio: 0.92,
  futileLimit: 2,
  pinReleaseSec: 120,
  pinMaxSec: 3600,
  stallSec: 2.5,
  minSamples: 5,
  busyDeferSec: 6,
};

export type ChangeReason = 'sustained-slow' | 'severe' | 'hitching' | 'headroom' | 'restore';

export interface QualityChange {
  from: number;
  to: number;
  direction: 'down' | 'up';
  reason: ChangeReason;
  /** Median frame rate of the window that triggered it. */
  fps: number;
  /** Controller clock (seconds) when it happened. */
  at: number;
}

export interface FrameCtx {
  /** An effects burst (an explosion) is on screen: a normal drop waits for it to pass. */
  busy?: boolean;
}

export interface WindowStats {
  samples: number;
  spanSec: number;
  medianMs: number;
  p90Ms: number;
  spikes: number;
}

export interface AdaptiveStatus {
  rung: number;
  floor: number;
  ceiling: number;
  /** Descent stopped because lower quality did not help. */
  pinned: boolean;
  /** Rungs that are blocked from going up, with the time they unlock. */
  blocked: Record<number, number>;
  /** Stats of the current window (null before it holds enough frames). */
  window: WindowStats | null;
  /** Median fps of the current window (0 when unknown). */
  fps: number;
  changes: number;
}

interface Sample {
  t: number;
  dt: number;
}

export function windowStats(samples: readonly Sample[], spikeSec: number): WindowStats {
  const n = samples.length;
  if (n === 0) return { samples: 0, spanSec: 0, medianMs: 0, p90Ms: 0, spikes: 0 };
  const sorted = samples.map((s) => s.dt).sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(n - 1, Math.floor(q * n))]!;
  return {
    samples: n,
    spanSec: samples[n - 1]!.t - samples[0]!.t,
    medianMs: at(0.5) * 1000,
    p90Ms: at(0.9) * 1000,
    spikes: sorted.filter((d) => d > spikeSec).length,
  };
}

export class AdaptiveQuality {
  private readonly cfg: AdaptiveConfig;
  private readonly floor: number;
  private readonly ceiling: number;
  private current: number;
  private samples: Sample[] = [];
  private ignoreUntil: number;
  private lastEval = -Infinity;
  private lastChange = -Infinity;
  private slowSince: number | null = null;
  private goodSince: number | null = null;
  private busySince: number | null = null;
  private raisedTo: { rung: number; at: number } | null = null;
  private readonly blockedUntil = new Map<number, number>();
  private readonly failures = new Map<number, number>();
  /** The last drop's before-state, judged once the next window is full. */
  private probe: { medianMs: number; from: number } | null = null;
  private futile = 0;
  private futileStart: number | null = null;
  private pinnedUntil = 0;
  private pins = 0;
  private changeCount = 0;
  private lastStats: WindowStats | null = null;

  constructor(opts: {
    start: number;
    floor?: number;
    ceiling?: number;
    now?: number;
    config?: Partial<AdaptiveConfig>;
  }) {
    this.cfg = { ...DEFAULT_ADAPTIVE, ...opts.config };
    this.floor = opts.floor ?? 0;
    this.ceiling = Math.max(this.floor, opts.ceiling ?? Number.MAX_SAFE_INTEGER);
    this.current = Math.max(this.floor, Math.min(this.ceiling, Math.round(opts.start)));
    const now = opts.now ?? 0;
    this.ignoreUntil = now + this.cfg.warmupSec;
    this.lastChange = now;
  }

  get rung(): number {
    return this.current;
  }

  status(now: number): AdaptiveStatus {
    const blocked: Record<number, number> = {};
    for (const [r, t] of this.blockedUntil) if (t > now) blocked[r] = t;
    return {
      rung: this.current,
      floor: this.floor,
      ceiling: this.ceiling,
      pinned: now < this.pinnedUntil,
      blocked,
      window: this.lastStats,
      fps: this.lastStats && this.lastStats.medianMs > 0 ? 1000 / this.lastStats.medianMs : 0,
      changes: this.changeCount,
    };
  }

  /** Stops sampling for `seconds` (loading, scene rebuild, fast-forward). Timers and memory are kept. */
  suspend(now: number, seconds: number): void {
    this.ignoreUntil = Math.max(this.ignoreUntil, now + seconds);
    this.samples = [];
    this.slowSince = null;
    this.goodSince = null;
    this.busySince = null;
  }

  /** The rung was set from outside (Auto switched on, a new match): start measuring afresh from there. */
  reset(rung: number, now: number, warmupSec = this.cfg.warmupSec): void {
    this.current = Math.max(this.floor, Math.min(this.ceiling, Math.round(rung)));
    this.probe = null;
    this.futile = 0;
    this.futileStart = null;
    this.raisedTo = null;
    this.lastChange = now;
    this.suspend(now, 0);
    this.ignoreUntil = now + warmupSec;
  }

  /** One rendered frame: `dt` seconds since the previous frame, at controller time `now` (seconds). */
  frame(dt: number, now: number, ctx: FrameCtx = {}): QualityChange | null {
    if (!(dt > 0) || !Number.isFinite(dt)) return null;
    if (now < this.ignoreUntil) return null;
    if (dt > this.cfg.stallSec) {
      // background tab / sleep: not evidence about the renderer
      this.suspend(now, this.cfg.settleSec);
      return null;
    }
    this.samples.push({ t: now, dt });
    const oldest = now - this.cfg.windowSec;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop]!.t < oldest) drop++;
    if (drop > 0) this.samples.splice(0, drop);
    if (now - this.lastEval < this.cfg.evalIntervalSec) return null;
    this.lastEval = now;
    const stats = windowStats(this.samples, this.cfg.spikeMs / 1000);
    if (stats.spanSec < this.cfg.windowSec * 0.75 || stats.samples < this.cfg.minSamples) return null;
    this.lastStats = stats;
    return this.evaluate(stats, now, ctx);
  }

  private evaluate(stats: WindowStats, now: number, ctx: FrameCtx): QualityChange | null {
    const c = this.cfg;
    const medianFps = 1000 / stats.medianMs;
    const p90Fps = 1000 / stats.p90Ms;

    // judge the previous drop: did lower quality make frames any faster?
    if (this.probe) {
      const faster = stats.medianMs <= this.probe.medianMs * c.futileRatio;
      const from = this.probe.from;
      this.probe = null;
      if (faster) {
        this.futile = 0;
        this.futileStart = null;
      } else {
        if (this.futile === 0) this.futileStart = from;
        this.futile++;
        if (this.futile >= c.futileLimit) {
          const back = this.futileStart ?? from;
          this.futile = 0;
          this.futileStart = null;
          this.pinnedUntil = now + Math.min(c.pinMaxSec, c.pinReleaseSec * 2 ** this.pins);
          this.pins++;
          if (back > this.current) return this.move(back, 'up', 'restore', medianFps, now);
          return null;
        }
      }
    }

    const severe = medianFps < c.severeBelowFps;
    const slow = medianFps < c.dropBelowFps;
    const hitching = stats.spikes >= c.hitchSpikes;
    const good = p90Fps >= c.raiseAboveFps && stats.spikes <= 1;

    if (slow || hitching) {
      this.slowSince ??= now;
      this.goodSince = null;
    } else {
      this.slowSince = null;
      this.busySince = null;
      if (good) this.goodSince ??= now;
      else this.goodSince = null;
    }

    if (this.slowSince !== null && this.current > this.floor && now >= this.pinnedUntil) {
      const hold = severe ? c.severeHoldSec : c.dropHoldSec;
      if (now - this.slowSince >= hold && now - this.lastChange >= c.dropCooldownSec) {
        if (ctx.busy && !severe) {
          this.busySince ??= now;
          if (now - this.busySince < c.busyDeferSec) return null;
        }
        const reason: ChangeReason = severe ? 'severe' : slow ? 'sustained-slow' : 'hitching';
        const to = Math.max(this.floor, this.current - (severe ? 2 : 1));
        return this.move(to, 'down', reason, medianFps, now);
      }
      return null;
    }

    if (
      this.goodSince !== null &&
      this.current < this.ceiling &&
      now - this.goodSince >= c.raiseHoldSec &&
      now - this.lastChange >= c.raiseDwellSec &&
      now >= this.pinnedUntil &&
      (this.blockedUntil.get(this.current + 1) ?? 0) <= now
    )
      return this.move(this.current + 1, 'up', 'headroom', medianFps, now);
    return null;
  }

  private move(
    to: number,
    direction: 'down' | 'up',
    reason: ChangeReason,
    fps: number,
    now: number,
  ): QualityChange {
    const from = this.current;
    if (direction === 'down') {
      // a rung we raised to a moment ago did not hold: keep it off the menu for longer each time
      const r = this.raisedTo;
      if (r && from === r.rung && now - r.at < this.cfg.probationSec) {
        const n = (this.failures.get(from) ?? 0) + 1;
        this.failures.set(from, n);
        this.blockedUntil.set(
          from,
          now + Math.min(this.cfg.backoffMaxSec, this.cfg.backoffBaseSec * 2 ** (n - 1)),
        );
      }
      this.raisedTo = null;
      this.probe = { medianMs: this.lastStats?.medianMs ?? 1000 / fps, from };
    } else {
      this.raisedTo = reason === 'headroom' ? { rung: to, at: now } : null;
      this.probe = null;
    }
    this.current = to;
    this.lastChange = now;
    this.changeCount++;
    this.samples = [];
    this.slowSince = null;
    this.goodSince = null;
    this.busySince = null;
    this.ignoreUntil = now + this.cfg.settleSec;
    return { from, to, direction, reason, fps, at: now };
  }
}
