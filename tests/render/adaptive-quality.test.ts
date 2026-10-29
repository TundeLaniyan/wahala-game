import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, DEFAULT_ADAPTIVE, windowStats } from '../../src/render/perf';
import type { QualityChange } from '../../src/render/perf';

/** A virtual clock feeding a controller frames of a given length. */
function rig(
  start: number,
  opts: { floor?: number; ceiling?: number; config?: Partial<typeof DEFAULT_ADAPTIVE> } = {},
) {
  const ctl = new AdaptiveQuality({ start, now: 0, ...opts });
  const clock = { now: 0 };
  const changes: QualityChange[] = [];
  /** Runs `seconds` of frames at `fps` (optionally with a periodic spike frame). */
  const run = (
    fps: number,
    seconds: number,
    extra: { spikeEvery?: number; spikeMs?: number; busy?: boolean } = {},
  ): QualityChange[] => {
    const out: QualityChange[] = [];
    const dt = 1 / fps;
    const end = clock.now + seconds;
    let n = 0;
    while (clock.now < end) {
      n++;
      const spike = extra.spikeEvery && n % extra.spikeEvery === 0;
      const d = spike ? (extra.spikeMs ?? 120) / 1000 : dt;
      clock.now += d;
      const c = ctl.frame(d, clock.now, { busy: extra.busy });
      if (c) {
        out.push(c);
        changes.push(c);
      }
    }
    return out;
  };
  return { ctl, clock, run, changes };
}

describe('windowStats', () => {
  it('uses median / p90 and counts spikes', () => {
    const s = Array.from({ length: 100 }, (_, i) => ({ t: i / 60, dt: i === 50 ? 0.3 : 1 / 60 }));
    const st = windowStats(s, 0.08);
    expect(st.medianMs).toBeCloseTo(16.67, 1);
    expect(st.p90Ms).toBeCloseTo(16.67, 1);
    expect(st.spikes).toBe(1);
    expect(windowStats([], 0.08).samples).toBe(0);
  });
});

describe('lowering quality', () => {
  it('drops one rung after sustained slow frames, not before warm-up and the hold time', () => {
    const r = rig(5);
    expect(r.run(30, 6)).toEqual([]); // warm-up (4 s) plus a window and hold still running
    const down = r.run(30, 6);
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({ from: 5, to: 4, direction: 'down', reason: 'sustained-slow' });
    expect(down[0]!.fps).toBeCloseTo(30, 0);
    expect(r.ctl.rung).toBe(4);
  });

  it('ignores an isolated slow frame, and a few spikes in a healthy stream', () => {
    const r = rig(5);
    r.run(60, 8);
    expect(r.run(60, 30, { spikeEvery: 120, spikeMs: 400 })).toEqual([]); // 1 spike per 2 s: median is fine
    expect(r.ctl.rung).toBe(5);
  });

  it('treats frequent hitching as slow even when the median is fine', () => {
    const r = rig(5);
    r.run(60, 6);
    const out = r.run(60, 20, { spikeEvery: 30, spikeMs: 150 });
    expect(out[0]).toMatchObject({ direction: 'down', reason: 'hitching' });
  });

  it('goes down two rungs at once and sooner when severely slow', () => {
    const r = rig(6);
    r.run(12, 4); // warm-up
    const out = r.run(12, 8);
    expect(out[0]).toMatchObject({ from: 6, to: 4, reason: 'severe' });
  });

  it('still decides on a device that manages only 1-2 frames a second', () => {
    const r = rig(5);
    r.run(2, 8); // warm-up
    const down = r.run(2, 30);
    expect(down.length).toBeGreaterThanOrEqual(1);
    expect(down[0]).toMatchObject({ direction: 'down', reason: 'severe' });
    const crawl = rig(5);
    crawl.run(1, 8);
    expect(crawl.run(1, 40).some((c) => c.direction === 'down')).toBe(true);
  });

  it('never goes below the floor or the lowest rung', () => {
    const r = rig(1, { floor: 0 });
    const out = r.run(20, 120);
    expect(r.ctl.rung).toBe(0);
    expect(out.every((c) => c.to >= 0)).toBe(true);
  });

  it('waits for an effects burst to pass before a normal drop, but not for a severe one', () => {
    const r = rig(5);
    r.run(30, 4);
    expect(r.run(30, 5, { busy: true })).toEqual([]); // slow, but an explosion burst is on screen
    expect(r.run(30, 10, { busy: true })[0]?.direction).toBe('down'); // starvation guard: it cannot wait forever
    const s = rig(5);
    s.run(10, 4);
    expect(s.run(10, 6, { busy: true })[0]).toMatchObject({ reason: 'severe' });
  });

  it('keeps a cooldown between drops', () => {
    const r = rig(7);
    r.run(30, 4);
    // 30 fps whatever the rung is futile, so use a rate that improves with every drop to see plain drops
    const all: QualityChange[] = [];
    while (r.clock.now < 120) all.push(...r.run(Math.min(60, 20 + (7 - r.ctl.rung) * 7), 1));
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < all.length; i++)
      expect(all[i]!.at - all[i - 1]!.at).toBeGreaterThanOrEqual(DEFAULT_ADAPTIVE.dropCooldownSec);
  });
});

describe('raising quality', () => {
  it('raises one rung only after sustained comfortable headroom and the dwell time', () => {
    const r = rig(3);
    expect(r.run(60, 20)).toEqual([]); // warm-up + not yet 15 s of headroom + dwell 30 s
    const up = r.run(60, 30);
    expect(up).toHaveLength(1);
    expect(up[0]).toMatchObject({ from: 3, to: 4, direction: 'up', reason: 'headroom' });
  });

  it('does not raise in the dead band between the drop line and the raise line', () => {
    const r = rig(3);
    expect(r.run(50, 300)).toEqual([]); // 50 fps: not slow (45), not comfortable (55)
    expect(r.ctl.rung).toBe(3);
  });

  it('does not raise while frames hitch, even at a high average', () => {
    const r = rig(3, { config: { hitchSpikes: 99 } });
    expect(r.run(80, 200, { spikeEvery: 40, spikeMs: 120 })).toEqual([]);
  });

  it('stops at the ceiling', () => {
    const r = rig(4, { ceiling: 4 });
    expect(r.run(120, 200)).toEqual([]);
  });

  it('steps up gradually, one rung per dwell, to the top', () => {
    const r = rig(0);
    const all = r.run(120, 600);
    expect(all.map((c) => c.to)).toEqual(all.map((_, i) => i + 1));
    for (let i = 1; i < all.length; i++)
      expect(all[i]!.at - all[i - 1]!.at).toBeGreaterThanOrEqual(DEFAULT_ADAPTIVE.raiseDwellSec);
  });
});

describe('no oscillation', () => {
  it('blocks a rung that failed straight after being raised, with a growing backoff', () => {
    const r = rig(3);
    // rung 4 is too heavy: fine at 3, slow at 4
    const speedFor = (rung: number): number => (rung >= 4 ? 30 : 120);
    const log: QualityChange[] = [];
    while (r.clock.now < 1500) {
      const out = r.run(speedFor(r.ctl.rung), 1);
      log.push(...out);
    }
    const ups = log.filter((c) => c.direction === 'up');
    const downs = log.filter((c) => c.direction === 'down');
    expect(ups.length).toBeGreaterThanOrEqual(2);
    expect(ups.length).toBeLessThan(10);
    expect(downs.length).toBe(ups.length);
    const gaps = ups.slice(1).map((c, i) => c.at - ups[i]!.at);
    expect(gaps[0]).toBeGreaterThan(DEFAULT_ADAPTIVE.backoffBaseSec); // blocked after the first failure
    if (gaps.length > 1) expect(gaps[1]!).toBeGreaterThan(gaps[0]!); // and longer after the second
    expect(r.ctl.status(r.clock.now).blocked[4] ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('does not flip within the hysteresis band', () => {
    const r = rig(4);
    const flips = r.run(48, 600); // between the two lines
    expect(flips).toEqual([]);
  });
});

describe('futile drops', () => {
  it('stops lowering and restores quality when frames do not speed up (a 30 Hz cap)', () => {
    const r = rig(7);
    const all = r.run(30, 120); // slow whatever the rung
    const downs = all.filter((c) => c.direction === 'down');
    expect(downs).toHaveLength(2);
    const restore = all.find((c) => c.reason === 'restore');
    expect(restore).toMatchObject({ direction: 'up', to: 7 });
    expect(r.ctl.status(r.clock.now).pinned).toBe(true);
    // pinned: nothing more happens until the pause ends
    const pausedFor = restore!.at + DEFAULT_ADAPTIVE.pinReleaseSec - r.clock.now - 5;
    expect(r.run(30, pausedFor)).toEqual([]);
  });

  it('retries a permanent cap ever more rarely (the pause doubles)', () => {
    const r = rig(7);
    const all = r.run(30, 1200);
    const restores = all.filter((c) => c.reason === 'restore');
    expect(restores.length).toBeGreaterThanOrEqual(2);
    const firstDrops = all.filter((c) => c.direction === 'down' && c.from === 7).map((c) => c.at);
    expect(firstDrops[2]! - firstDrops[1]!).toBeGreaterThan(firstDrops[1]! - firstDrops[0]!);
  });

  it('keeps descending when each drop really helps', () => {
    const r = rig(7);
    const fpsAt = (rung: number): number => 30 + (7 - rung) * 6; // 30 at rung 7, 48 at rung 4
    const seen: number[] = [];
    while (r.clock.now < 300) {
      const out = r.run(Math.min(60, fpsAt(r.ctl.rung)), 1);
      for (const c of out) seen.push(c.to);
    }
    expect(r.ctl.rung).toBe(4); // 48 fps is inside the dead band: it stops there
    expect(seen.every((x) => x < 7)).toBe(true);
    expect(r.ctl.status(r.clock.now).pinned).toBe(false);
  });
});

describe('suspend, stalls and reset', () => {
  it('does not sample while suspended (loading, fast-forward)', () => {
    const r = rig(5);
    r.run(60, 6);
    r.ctl.suspend(r.clock.now, 30);
    expect(r.run(10, 25)).toEqual([]);
  });

  it('a long gap (background tab) restarts the window instead of counting as slow', () => {
    const r = rig(5);
    r.run(60, 6);
    r.clock.now += 20;
    expect(r.ctl.frame(20, r.clock.now)).toBeNull(); // longer than stallSec: not a frame time
    expect(r.run(60, 20)).toEqual([]);
  });

  it('ignores junk frame times', () => {
    const r = rig(5);
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(r.ctl.frame(dt, 10)).toBeNull();
  });

  it('reset() moves to a rung, clamps it and starts measuring afresh', () => {
    const r = rig(5, { ceiling: 6 });
    r.run(30, 10);
    r.ctl.reset(99, r.clock.now);
    expect(r.ctl.rung).toBe(6);
    expect(r.run(30, DEFAULT_ADAPTIVE.warmupSec - 0.5)).toEqual([]);
  });
});

describe('status', () => {
  it('reports the rung, window fps and change count', () => {
    const r = rig(5);
    r.run(60, 8);
    const s = r.ctl.status(r.clock.now);
    expect(s.rung).toBe(5);
    expect(s.fps).toBeGreaterThan(55);
    expect(s.changes).toBe(0);
  });
});
