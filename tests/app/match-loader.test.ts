/**
 * The match loading lifecycle (app/matchLoader.ts, decisions ML1-ML8) with fake paint, time and frames: a tap is
 * acknowledged before any heavy work, duplicate taps start nothing, slow model loading shows the real count and never
 * waits for ever, a failed start offers Retry / Back, the match is held until its first frames are drawn, and the
 * loading screen never outlives the start.
 */
import { describe, expect, it, vi } from 'vitest';
import { MatchLoader, loadStep, loadTitle } from '../../src/app/matchLoader';
import type { MatchLoadState } from '../../src/app/matchLoader';

/** A manually driven clock: `wait(ms)` resolves when `advance` passes it. */
function rig(
  o: { assets?: Promise<unknown> | null; counts?: () => { done: number; total: number } | null } = {},
) {
  const log: (MatchLoadState | null)[] = [];
  const holds: boolean[] = [];
  let now = 0;
  const timers: { at: number; resolve: () => void }[] = [];
  let frames: (() => void) | null = null;
  const paints: (() => void)[] = [];
  const deps = {
    publish: (s: MatchLoadState | null) => log.push(s && { ...s }),
    afterPaint: () => new Promise<void>((r) => paints.push(r)),
    assetsPending: () => o.assets ?? null,
    assetCounts: () => o.counts?.() ?? null,
    framesDrawn: () => new Promise<void>((r) => (frames = r)),
    hold: (h: boolean) => holds.push(h),
    wait: (ms: number) => new Promise<void>((r) => timers.push({ at: now + ms, resolve: r })),
  };
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return {
    log,
    holds,
    deps,
    paint: async () => {
      await flush();
      while (paints.length) paints.shift()!();
      await flush();
    },
    frame: async () => {
      await flush();
      frames?.();
      await flush();
    },
    advance: async (ms: number) => {
      now += ms;
      for (const t of timers.filter((t) => t.at <= now)) t.resolve();
      await flush();
    },
    phases: () => log.map((s) => s?.phase ?? null),
  };
}

const opts = { assetWaitMs: 20_000, sceneWaitMs: 12_000, firstFrames: 2 };

describe('the match loader', () => {
  it('shows the loading screen before the heavy start, holds the match until its first frames, then goes', async () => {
    const r = rig();
    const loader = new MatchLoader(r.deps, opts);
    const start = vi.fn();
    const done = loader.run('match', start, vi.fn());
    await Promise.resolve();
    // acknowledged at once; nothing heavy has run yet
    expect(r.phases()).toEqual(['starting']);
    expect(start).not.toHaveBeenCalled();
    await r.paint(); // the loading screen painted -> the arena is built after one more paint
    await r.paint();
    expect(start).toHaveBeenCalledTimes(1);
    expect(r.holds).toEqual([true]); // no simulation time while the screen is up
    expect(r.phases().at(-1)).toBe('scene');
    await r.frame();
    expect(await done).toBe(true);
    expect(r.phases().at(-1)).toBeNull(); // removed once the first frames are drawn
    expect(r.holds).toEqual([true, false]);
    expect(loader.busy).toBe(false);
  });

  it('rapid taps: only the first starts a session', async () => {
    const r = rig();
    const loader = new MatchLoader(r.deps, opts);
    const start = vi.fn();
    const first = loader.run('match', start, vi.fn());
    const second = loader.run('match', start, vi.fn());
    const third = loader.run('rematch', start, vi.fn());
    expect(await second).toBe(false);
    expect(await third).toBe(false);
    await r.paint();
    await r.paint();
    await r.frame();
    expect(await first).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('slow model loading shows the real count and never waits for ever', async () => {
    let counts = { done: 3, total: 31 };
    const r = rig({ assets: new Promise(() => {}), counts: () => counts });
    const loader = new MatchLoader(r.deps, opts);
    const start = vi.fn();
    const done = loader.run('mission', start, vi.fn());
    await r.paint();
    expect(r.log.at(-1)).toMatchObject({ phase: 'assets', kind: 'mission', assets: { done: 3, total: 31 } });
    expect(loadStep(r.log.at(-1)!)).toBe('Loading fighters and vehicles 3 / 31');
    counts = { done: 17, total: 31 };
    await r.advance(250);
    expect(r.log.at(-1)).toMatchObject({ phase: 'assets', assets: { done: 17, total: 31 } });
    expect(start).not.toHaveBeenCalled();
    // the preload never settles (a stuck connection): after the limit the match starts anyway (drawn fallbacks)
    for (let t = 0; t < 20_000; t += 250) await r.advance(250);
    await r.paint();
    expect(start).toHaveBeenCalledTimes(1);
    await r.frame();
    expect(await done).toBe(true);
  });

  it('models that finish loading let the start go on at once', async () => {
    let settle!: () => void;
    const r = rig({
      assets: new Promise<void>((res) => (settle = res)),
      counts: () => ({ done: 30, total: 31 }),
    });
    const loader = new MatchLoader(r.deps, opts);
    const start = vi.fn();
    const done = loader.run('match', start, vi.fn());
    await r.paint();
    settle();
    await r.advance(0);
    await r.paint();
    expect(start).toHaveBeenCalledTimes(1);
    await r.frame();
    expect(await done).toBe(true);
  });

  it('a failed start shows the reason with Retry and Back; Retry runs the same start, Back undoes it', async () => {
    const r = rig();
    const loader = new MatchLoader(r.deps, opts);
    let fail = true;
    const start = vi.fn(() => {
      if (fail) throw new Error('WebGL context lost');
    });
    const back = vi.fn();
    const done = loader.run('raid', start, back);
    await r.paint();
    await r.paint();
    expect(await done).toBe(false);
    expect(r.log.at(-1)).toMatchObject({ phase: 'failed', kind: 'raid', error: 'WebGL context lost' });
    expect(r.holds).toEqual([true, false]); // never left held
    expect(loader.busy).toBe(true); // a Play tap behind the failure screen starts nothing
    expect(await loader.run('match', vi.fn(), vi.fn())).toBe(false);
    // Retry: the same start again, this time it works
    fail = false;
    const again = loader.retry();
    await r.paint();
    await r.paint();
    await r.frame();
    expect(await again).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
    expect(back).not.toHaveBeenCalled();
    // a second failure, then Back
    fail = true;
    const third = loader.run('match', start, back);
    await r.paint();
    await r.paint();
    expect(await third).toBe(false);
    loader.back();
    expect(back).toHaveBeenCalledTimes(1);
    expect(r.log.at(-1)).toBeNull();
    expect(loader.busy).toBe(false);
  });

  it('a first frame that never comes does not leave the loading screen over the match', async () => {
    const r = rig();
    const loader = new MatchLoader(r.deps, opts);
    const done = loader.run('match', vi.fn(), vi.fn());
    await r.paint();
    await r.paint();
    expect(r.phases().at(-1)).toBe('scene');
    await r.advance(12_000);
    expect(await done).toBe(true);
    expect(r.phases().at(-1)).toBeNull();
    expect(r.holds.at(-1)).toBe(false);
  });

  it('clear() removes a failure screen (leaving for the menu) and never a start in flight', async () => {
    const r = rig();
    const loader = new MatchLoader(r.deps, opts);
    const run = loader.run('match', vi.fn(), vi.fn());
    loader.clear(); // in flight: ignored, the start finishes normally
    await r.paint();
    await r.paint();
    await r.frame();
    expect(await run).toBe(true);
    const failing = loader.run(
      'match',
      () => {
        throw new Error('x');
      },
      vi.fn(),
    );
    await r.paint();
    await r.paint();
    await failing;
    loader.clear();
    expect(r.log.at(-1)).toBeNull();
    expect(loader.busy).toBe(false);
  });

  it('names the kind of start', () => {
    expect(loadTitle('match')).toBe('Starting the match');
    expect(loadTitle('rematch')).toBe('Setting up the rematch');
    expect(loadTitle('mission')).toBe('Heading into the district');
    expect(loadTitle('raid')).toBe('Breaking into the raid');
  });
});
