import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as audioModule from '../../src/audio';
import { createAudio } from '../../src/audio';
import type { SimEvent } from '../../src/sim';
import { addGenerator, put } from '../helpers';
import { FakeContext } from './fakeContext';
import type { FakeGain } from './fakeContext';
import { SAMPLES, finishWarmup, makeRig, playState } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Unlocks and lets the background renderer produce every sound (loops + crowd included). */
async function started(extra = {}, ctxOpts = {}) {
  const rig = makeRig(extra, ctxOpts);
  await rig.audio.unlock();
  finishWarmup();
  rig.traces.length = 0;
  return rig;
}

describe('context handling', () => {
  it('is a silent no-op without any AudioContext (Node default factory)', async () => {
    const a = createAudio();
    await a.unlock();
    a.setVolumes({ master: 1, music: 1, sfx: 1 });
    a.setMuted(true);
    a.setMuted(false);
    a.startMusic();
    a.setIntensity(1);
    a.handleEvents(Object.values(SAMPLES), playState());
    a.playUi('click');
    a.stopMusic();
    a.dispose();
    expect(await a.whenSamplesLoaded()).toEqual({ loaded: [], skipped: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is a silent no-op when the factory returns null or throws', async () => {
    const a = createAudio({ contextFactory: () => null });
    await a.unlock();
    a.handleEvents(Object.values(SAMPLES), playState());
    const errs: unknown[] = [];
    const b = createAudio({
      contextFactory: () => {
        throw new Error('boom');
      },
      onError: (e) => errs.push(e),
    });
    await b.unlock();
    b.startMusic();
    b.playUi('go');
    expect(errs).toHaveLength(1);
  });

  it('picks webkitAudioContext on old Safari', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const made: FakeContext[] = [];
    g.webkitAudioContext = function () {
      const c = new FakeContext();
      made.push(c);
      return c;
    };
    try {
      const a = createAudio({ fetch: null });
      await a.unlock();
      expect(made).toHaveLength(1);
      expect(made[0]!.state).toBe('running');
      a.dispose();
    } finally {
      delete g.webkitAudioContext;
    }
  });

  it('creates nothing until unlock, and sounds nothing before it', () => {
    const factory = vi.fn(() => new FakeContext());
    const a = createAudio({ contextFactory: factory });
    a.startMusic();
    a.handleEvents(Object.values(SAMPLES), playState());
    a.playUi('click');
    expect(factory).not.toHaveBeenCalled();
  });

  it('unlock resumes the context, is idempotent, and creates a single context', async () => {
    const ctx = new FakeContext();
    const factory = vi.fn(() => ctx);
    const b = createAudio({ contextFactory: factory, fetch: null });
    await Promise.all([b.unlock(), b.unlock()]);
    await b.unlock();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe('running');
    expect(ctx.resumeCalls).toBe(1); // later unlocks do not resume a running context again
    b.dispose();
  });

  it('re-resumes a context the OS suspended on the next unlock', async () => {
    const { audio, ctx } = makeRig();
    await audio.unlock();
    ctx.state = 'interrupted';
    await audio.unlock();
    expect(ctx.resumeCalls).toBe(2);
    expect(ctx.state).toBe('running');
  });

  it('survives a context without StereoPanner', async () => {
    const rig = await started({}, { noPanner: true });
    rig.audio.handleEvents(Object.values(SAMPLES), playState());
    expect(rig.errors).toEqual([]);
  });
});

describe('music is pre-rendered audio, never a runtime oscillator sequence', () => {
  it('has no sequencer/pattern modules and creates no oscillators; the app-facing method names still work', async () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
      );
    const names = files(join(__dirname, '../../src/audio'));
    // the only "music" source file is the player of pre-rendered files (src/audio/music.ts)
    expect(names.filter((n) => /sequenc|pattern|oscillat/i.test(n))).toEqual([]);
    expect(Object.keys(audioModule).filter((k) => /sequenc|pattern/i.test(k))).toEqual([]);
    // app-facing surface
    const rig = makeRig();
    for (const m of ['startMusic', 'stopMusic', 'setIntensity'] as const) {
      expect(typeof rig.audio[m]).toBe('function');
    }
    // nothing oscillator-based exists any more: the fake context cannot even create one
    expect((rig.ctx as unknown as { createOscillator?: unknown }).createOscillator).toBeUndefined();
    await rig.audio.unlock();
    rig.audio.startMusic();
    finishWarmup();
    expect(rig.errors).toEqual([]);
  });
});

describe('event mapping', () => {
  it('handles every SimEvent type without throwing and makes sound for most', async () => {
    const rig = await started({}, {});
    const s = playState();
    const silent = new Set(['vehicleExited', 'vehicleEntryBegan', 'vehicleEntryCancelled']);
    // an extra human-less state variant is covered below; here players 0/1 are both "human" sandbox players
    for (const [type, e] of Object.entries(SAMPLES)) {
      rig.traces.length = 0;
      rig.audio.handleEvents([e], s);
      rig.ctx.advance(10); // let the per-key rate limiters and reaction cooldowns reopen
      if (type === 'pickupCollected') expect(rig.traces.length, type).toBeGreaterThan(0);
      else if (!silent.has(type) && type !== 'vehicleEntryBegan') {
        expect(rig.traces.length, type).toBeGreaterThan(0);
      }
    }
    rig.audio.handleEvents(Object.values(SAMPLES), s); // all together in one batch too
    expect(rig.errors).toEqual([]);
  });

  it('maps event kinds to the expected sound ids', async () => {
    const rig = await started();
    const s = playState();
    const expectIds = (e: SimEvent, ...ids: string[]): void => {
      rig.traces.length = 0;
      rig.ctx.advance(10);
      rig.audio.handleEvents([e], s);
      for (const id of ids) expect(rig.ids(), `${e.type} -> ${id}`).toContain(id);
    };
    expectIds({ ...SAMPLES.vehicleWarning, kind: 'danfo' } as SimEvent, 'danfo_horn');
    expectIds({ ...SAMPLES.vehicleWarning, kind: 'taxi' } as SimEvent, 'taxi_horn');
    expectIds({ ...SAMPLES.vehicleWarning, kind: 'keke' } as SimEvent, 'keke_horn');
    expectIds({ ...SAMPLES.vehicleLaunched, kind: 'keke' } as SimEvent, 'keke_launch', 'crowd_shout');
    expectIds(SAMPLES.pickupCollected, 'pickup_rare');
    expectIds({ ...SAMPLES.pickupCollected, kind: 'voucher' } as SimEvent, 'pickup_voucher');
    expectIds({ ...SAMPLES.pickupCollected, kind: 'petrol' } as SimEvent, 'pickup_1');
    expectIds({ ...SAMPLES.pickupCollected, wasted: true } as SimEvent, 'pickup_wasted');
    expectIds(SAMPLES.cursed, 'pickup_curse');
    expectIds(SAMPLES.hazardTriggered, 'oil_squeak');
    expectIds({ ...SAMPLES.hazardTriggered, kind: 'pothole' } as SimEvent, 'pothole_thud');
    expectIds(SAMPLES.crowdLanded, 'bottle_smash');
    expectIds(SAMPLES.crowdWarning, 'crowd_throw_whistle');
    expectIds(SAMPLES.crushLanded, 'crush_slam');
    expectIds(SAMPLES.generatorDisarmed, 'gen_powerdown');
    expectIds(SAMPLES.okadaBroken, 'okada_break');
    expectIds(SAMPLES.okadaMounted, 'okada_mount');
    expectIds(SAMPLES.vehicleDestroyed, 'vehicle_wreck');
    expect(rig.ids().some((id) => id.startsWith('crowd_'))).toBe(true);
  });

  it('puts warnings on the warning bus and crowd reactions on the reaction bus', async () => {
    const rig = await started();
    rig.audio.handleEvents([SAMPLES.vehicleWarning, SAMPLES.playerEliminated], playState());
    const bus = (id: string): string | undefined => rig.traces.find((t) => t.id === id)?.bus;
    expect(bus('danfo_horn')).toBe('warn');
    expect(rig.traces.filter((t) => t.id.startsWith('elim_'))[0]?.bus).toBe('sfx');
    expect(rig.traces.filter((t) => t.id.startsWith('crowd_')).every((t) => t.bus === 'react')).toBe(true);
  });

  it('never schedules invalid times (strict fake would throw) for 600 random batches', async () => {
    const rig = await started({
      onError: (e: unknown) => {
        throw e;
      },
    });
    const s = playState();
    const all = Object.values(SAMPLES);
    let seed = 12345;
    const r = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < 600; i++) {
      const batch = Array.from({ length: Math.floor(r() * 6) }, () => all[Math.floor(r() * all.length)]!);
      rig.audio.handleEvents(batch, s);
      rig.ctx.advance(r() * 0.1);
    }
    rig.audio.dispose();
  });

  it('every one-shot source that starts is stopped after it starts (loops are managed separately)', async () => {
    const rig = await started();
    rig.audio.handleEvents(Object.values(SAMPLES), playState());
    for (const src of rig.ctx.sources) {
      if (src.loop || (src.buffer && src.buffer.length === 1)) continue; // loops and the iOS priming sample
      expect(src.stoppedAt).not.toBeNull();
    }
  });

  it('pans from the tile x position', async () => {
    const rig = await started();
    const s = playState();
    rig.audio.handleEvents([{ ...SAMPLES.generatorExploded, x: 0 } as SimEvent], s);
    rig.ctx.advance(1);
    rig.audio.handleEvents([{ ...SAMPLES.generatorExploded, x: s.width - 1 } as SimEvent], s);
    const pans = rig.traces
      .filter((t) => t.id.startsWith('explosion_') && t.id !== 'explosion_rumble')
      .map((t) => t.pan);
    expect(Math.min(...pans)).toBeLessThan(-0.4);
    expect(Math.max(...pans)).toBeGreaterThan(0.4);
  });

  it('scales the blast with chain size and reach', async () => {
    const rig = await started();
    const s = playState();
    const solo = { ...SAMPLES.generatorExploded, range: 2 } as SimEvent;
    rig.audio.handleEvents([solo], s);
    const small = rig.traces.find((t) => /^explosion_[123]$/.test(t.id))!;
    expect(rig.ids()).not.toContain('explosion_rumble');
    rig.ctx.advance(10);
    rig.traces.length = 0;
    const chain = [1, 2, 3].map(
      (i) => ({ ...SAMPLES.generatorExploded, generatorId: i, eventId: 7, range: 8 }) as SimEvent,
    );
    rig.audio.handleEvents(chain, s);
    const big = rig.traces.filter((t) => /^explosion_[123]$/.test(t.id));
    expect(big).toHaveLength(3);
    expect(big[0]!.gain).toBeGreaterThan(small.gain);
    expect(big[0]!.rate).toBeLessThan(small.rate); // heavier = slower/lower
    expect(rig.ids()).toContain('explosion_rumble');
    // a big chain also gets a big crowd response
    expect(rig.ids()).toContain('crowd_cheer_big');
  });

  it('collapses a blast that breaks many soft blocks into one crumble', async () => {
    const rig = await started();
    const blocks = Array.from(
      { length: 30 },
      (_, i) => ({ type: 'blockDestroyed', x: i % 10, y: 1, by: 'flame' }) as SimEvent,
    );
    rig.audio.handleEvents(blocks, playState());
    expect(rig.ids().filter((id) => id.startsWith('block_crumble'))).toHaveLength(1);
  });

  it('caps blasts and eliminations per call', async () => {
    const rig = await started();
    const ex = Array.from(
      { length: 9 },
      (_, i) => ({ ...SAMPLES.generatorExploded, generatorId: i, eventId: i }) as SimEvent,
    );
    rig.audio.handleEvents(ex, playState());
    expect(rig.ids().filter((id) => /^explosion_[123]$/.test(id)).length).toBeLessThanOrEqual(3);
    rig.ctx.advance(10);
    rig.traces.length = 0;
    const el = Array.from({ length: 5 }, () => SAMPLES.playerEliminated);
    rig.audio.handleEvents(el, playState());
    expect(rig.ids().filter((id) => id.startsWith('elim_')).length).toBeLessThanOrEqual(2);
  });
});

describe('voice cap and rate limiting', () => {
  /** Voice output gains: not yet released and connected to one of the four bus inputs. */
  function liveVoices(rig: { ctx: FakeContext }): FakeGain[] {
    const inputs = new Set<unknown>();
    const master = rig.ctx.master();
    for (const g of rig.ctx.gains) {
      if (g.connections.includes(master)) inputs.add(g); // sfx + warn buses
      if (g.connections.some((c) => rig.ctx.filters.includes(c as never))) inputs.add(g); // amb + react inputs
    }
    return rig.ctx.gains.filter(
      (g) => !g.disconnected && g.connections.some((c) => inputs.has(c)) && !inputs.has(g),
    );
  }

  it('never keeps more than 24 simultaneous one-shot voices alive, even under spam', async () => {
    const rig = await started({}, { noPanner: true });
    const s = playState();
    const spam: SimEvent[] = [
      SAMPLES.vehicleWarning,
      SAMPLES.playerEliminated,
      SAMPLES.pickupCollected,
      SAMPLES.cursed,
      SAMPLES.vehicleDestroyed,
      SAMPLES.okadaBroken,
      SAMPLES.matchEnded,
      SAMPLES.crowdLanded,
      SAMPLES.hazardTriggered,
    ];
    let peak = 0;
    const baseline = liveVoices(rig).length; // the bus plumbing itself (duck gains) matches the filter
    for (let i = 0; i < 400; i++) {
      rig.audio.handleEvents(spam, s);
      rig.ctx.advance(0.004);
      rig.audio.playUi('click');
      peak = Math.max(peak, liveVoices(rig).length - baseline);
    }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(24);
    expect(rig.errors).toEqual([]);
  });

  it('does not double-trigger the same sound inside the minimum gap', async () => {
    const rig = await started();
    rig.audio.playUi('click');
    rig.audio.playUi('click');
    expect(rig.ids().filter((id) => id === 'ui_click')).toHaveLength(1);
    rig.ctx.advance(0.2);
    rig.audio.playUi('click');
    expect(rig.ids().filter((id) => id === 'ui_click')).toHaveLength(2);
  });

  it('rate limits crowd reactions (global gap, per-kind cooldown, concurrency)', async () => {
    const rig = await started();
    const s = playState();
    const crowd = (): string[] => rig.ids().filter((id) => id.startsWith('crowd_'));
    for (let i = 0; i < 50; i++) {
      rig.audio.handleEvents([SAMPLES.vehicleDestroyed, SAMPLES.playerEliminated, SAMPLES.crowdLanded], s);
      rig.ctx.advance(0.05); // 2.5 s in total
    }
    // at most one reaction per 0.45 s window => bounded well below the number of triggers
    expect(crowd().length).toBeLessThanOrEqual(7);
    expect(crowd().length).toBeGreaterThan(0);
  });
});

describe('volume and mute', () => {
  it('maps volumes onto buses, clamps them, and mutes smoothly via the master gain', async () => {
    const { audio, ctx } = makeRig({ prefs: null });
    await audio.unlock();
    const master = ctx.master();
    audio.setVolumes({ master: 0.5, music: 0.5, sfx: 0.5 });
    expect(master.gain.value).toBeCloseTo(0.5);
    audio.setVolumes({ master: 5, music: -2, sfx: Number.NaN });
    expect(master.gain.value).toBe(1);
    expect(ctx.anyGainTargeted(0)).toBe(true); // crowd + sfx buses clamp to 0

    audio.setVolumes({ master: 0.8, music: 0.7, sfx: 0.9 });
    const setTargets = master.gain.targets.length;
    audio.setMuted(true);
    expect(master.gain.value).toBe(0);
    expect(master.gain.targets.length).toBe(setTargets + 1); // smooth ramp, not a hard jump
    audio.setMuted(false);
    expect(master.gain.value).toBeCloseTo(0.8);
    audio.setMuted(true);
    audio.setVolumes({ master: 1, music: 1, sfx: 1 });
    expect(master.gain.value).toBe(0); // volume change while muted stays muted
    audio.setMuted(false);
    expect(master.gain.value).toBe(1);
  });

  it('music, ambience and sfx volumes each scale only their own buses', async () => {
    const { audio, ctx } = makeRig({ prefs: null });
    await audio.unlock();
    audio.setVolumes({ master: 1, music: 1, ambience: 1, sfx: 0 });
    const master = ctx.master();
    const direct = ctx.gains.filter((g) => g.connections.includes(master));
    // sfxBus, warnBus, crowdBus and musicBus all feed the master; sfx at 0 silences two of them
    expect(direct.length).toBe(4);
    expect(direct.filter((g) => g.gain.value === 0)).toHaveLength(2);
    audio.setVolumes({ master: 1, music: 0, ambience: 1, sfx: 1 });
    expect(direct.filter((g) => g.gain.value === 0)).toHaveLength(1); // only the music bus
    audio.setVolumes({ master: 1, music: 1, ambience: 0, sfx: 1 });
    expect(direct.filter((g) => g.gain.value === 0)).toHaveLength(1); // only the crowd/ambience bus
  });

  it('applies volumes and mute chosen before unlock', async () => {
    const { audio, ctx } = makeRig({ prefs: null });
    audio.setVolumes({ master: 0.3, music: 1, sfx: 1 });
    audio.setMuted(true);
    await audio.unlock();
    expect(ctx.master().gain.value).toBe(0);
    audio.setMuted(false);
    expect(ctx.master().gain.value).toBeCloseTo(0.3);
  });

  it('does no work while muted', async () => {
    const rig = await started();
    rig.audio.setMuted(true);
    const n = rig.ctx.nodeCount();
    rig.audio.handleEvents(Object.values(SAMPLES), playState());
    rig.audio.playUi('go');
    expect(rig.ctx.nodeCount()).toBe(n);
    expect(rig.traces).toHaveLength(0);
  });

  it('a master compressor limits the mix', async () => {
    const { audio, ctx } = makeRig();
    await audio.unlock();
    expect(ctx.compressors).toHaveLength(1);
    expect(ctx.compressors[0]!.ratio.value).toBeGreaterThanOrEqual(10);
    expect(ctx.compressors[0]!.threshold.value).toBeLessThan(0);
    expect(ctx.compressors[0]!.threshold.value).toBeGreaterThan(-12); // a limiter, not a squasher
    // the compressor's automatic makeup gain is cancelled by a trim, then a soft clipper guards full scale
    const trim = ctx.gains.find((g) => ctx.compressors[0]!.connections.includes(g))!;
    expect(trim.gain.value).toBeLessThan(1);
    expect(trim.gain.value).toBeGreaterThan(0.6);
    const shaper = trim.connections[0] as { curve: Float32Array; connections: unknown[] };
    expect(shaper.connections).toContain(ctx.destination);
    const c = shaper.curve;
    expect(Math.max(...c)).toBeLessThan(1);
    expect(Math.min(...c)).toBeGreaterThan(-1);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!); // monotonic
    const at = (x: number): number => c[Math.round(((x + 1) / 2) * (c.length - 1))]!;
    expect(at(0.5)).toBeCloseTo(0.5, 2); // transparent below the knee
    expect(at(-0.6)).toBeCloseTo(-0.6, 2);
    expect(at(1)).toBeLessThan(0.97); // and a ceiling above it
    expect(c[0]! + c[c.length - 1]!).toBeCloseTo(0, 6); // symmetric
  });

  it('still works on a context without WaveShaper', async () => {
    const { audio, ctx } = makeRig({}, { noShaper: true });
    await audio.unlock();
    const trim = ctx.gains.find((g) => ctx.compressors[0]!.connections.includes(g))!;
    expect(trim.connections).toContain(ctx.destination);
  });
});

describe('ducking and warnings', () => {
  it('ducks the crowd on warnings and blasts, never the sfx or warning buses', async () => {
    const rig = await started();
    const s = playState();
    const sfxBusGains = rig.ctx.gains.filter((g) => g.connections.includes(rig.ctx.master()));
    const before = sfxBusGains.map((g) => g.gain.targets.length);
    expect(rig.ctx.anyGainTargeted(0.5)).toBe(false);
    rig.audio.handleEvents([SAMPLES.vehicleWarning], s);
    expect(rig.ctx.anyGainTargeted(0.5)).toBe(true); // warning duck depth for the ambience
    rig.ctx.advance(3);
    expect(rig.ctx.anyGainTargeted(0.4)).toBe(false);
    rig.audio.handleEvents([SAMPLES.generatorExploded], s);
    expect(rig.ctx.anyGainTargeted(0.4)).toBe(true); // blast duck depth
    expect(sfxBusGains.map((g) => g.gain.targets.length)).toEqual(before);
  });

  it('gives each vehicle kind a distinct horn in the warning bus', async () => {
    const rig = await started();
    const ids = (['danfo', 'taxi', 'keke'] as const).map((kind) => {
      rig.traces.length = 0;
      rig.ctx.advance(10);
      rig.audio.handleEvents([{ ...SAMPLES.vehicleWarning, kind } as SimEvent], playState());
      return rig.traces.find((t) => t.bus === 'warn')?.id;
    });
    expect(ids).toEqual(['danfo_horn', 'taxi_horn', 'keke_horn']);
  });
});

describe('generators: fuse loop, tick and remote blip', () => {
  it('starts a putt-putt loop for a burning fuse that speeds up, then adds the rattle', async () => {
    const rig = await started();
    const s = playState();
    const g = addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    const rates: number[] = [];
    for (let f = 0; f < 170; f++) {
      rig.audio.handleEvents([], s);
      const run = rig.ctx.sources.filter(
        (x) => x.loop && x.stoppedAt === null && x.playbackRate.targets.length > 0,
      );
      if (run[0]) rates.push(run[0].playbackRate.value);
      rig.ctx.advance(1 / 60);
      g.timer--;
    }
    expect(rates.length).toBeGreaterThan(50);
    expect(rates[rates.length - 1]!).toBeGreaterThan(rates[0]! * 1.5);
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeGreaterThanOrEqual(rates[i - 1]! - 1e-9);
    const loopBuffers = new Set(rig.ctx.sources.filter((x) => x.loop).map((x) => x.buffer));
    expect(loopBuffers.size).toBeGreaterThanOrEqual(2); // run + rattle
    expect(rig.errors).toEqual([]);
  });

  it('fades the loop out when the generator is gone', async () => {
    const rig = await started();
    const s = playState();
    addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    rig.audio.handleEvents([], s);
    const loops = rig.ctx.sources.filter((x) => x.loop);
    expect(loops.length).toBeGreaterThan(0);
    s.generators.length = 0;
    rig.audio.handleEvents([], s);
    for (const l of loops) expect(l.stoppedAt).not.toBeNull();
  });

  it('limits the number of simultaneous generator loop voices', async () => {
    const rig = await started();
    const s = playState();
    for (let i = 0; i < 8; i++) addGenerator(s, { ownerId: 0, x: 1 + i, y: 1, timer: 30 + i * 10 });
    rig.audio.handleEvents([], s);
    expect(rig.ctx.sources.filter((x) => x.loop && x.stoppedAt === null).length).toBeLessThanOrEqual(5 + 3);
  });

  it('ticks faster as the fuse runs down, and stays rate-limited', async () => {
    const rig = await started();
    const s = playState();
    const g = addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    for (let f = 0; f < g.timer + 1 && g.timer > 0;) {
      rig.audio.handleEvents([], s);
      rig.ctx.advance(1 / 60);
      g.timer--;
    }
    const t = rig.traces.filter((x) => x.id === 'fuse_tick').map((x) => x.at);
    expect(t.length).toBeGreaterThan(4);
    const gaps = t.slice(1).map((x, i) => x - t[i]!);
    expect(gaps[0]!).toBeGreaterThan(gaps[gaps.length - 1]! * 1.5);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.04 - 1e-9);
    // pitch (playback rate) rises with urgency
    const rates = rig.traces.filter((x) => x.id === 'fuse_tick').map((x) => x.rate);
    expect(rates[rates.length - 1]!).toBeGreaterThan(rates[0]!);
  });

  it('calling many times at the same instant cannot machine-gun', async () => {
    const rig = await started();
    const s = playState();
    for (let i = 0; i < 6; i++) addGenerator(s, { ownerId: 0, x: 1 + i, y: 1, timer: 3 });
    rig.ctx.advance(10);
    rig.audio.handleEvents([], s);
    rig.ctx.advance(1);
    for (let i = 0; i < 200; i++) rig.audio.handleEvents([], s);
    expect(rig.ids().filter((id) => id === 'fuse_tick').length).toBeLessThanOrEqual(2);
  });

  it('remote generators give a calm blip; disabled and expired ones are silent', async () => {
    const rig = await started();
    const s = playState();
    addGenerator(s, { ownerId: 0, x: 1, y: 1, mode: 'remote', timer: 1000 });
    addGenerator(s, { ownerId: 0, x: 2, y: 1, mode: 'disabled', timer: 600 });
    addGenerator(s, { ownerId: 0, x: 3, y: 1, timer: 0 });
    for (let i = 0; i < 360; i++) {
      rig.audio.handleEvents([], s);
      rig.ctx.advance(1 / 60);
    }
    const blips = rig.traces.filter((t) => t.id === 'gen_remote_blip');
    expect(blips.length).toBeGreaterThanOrEqual(3);
    expect(blips.length).toBeLessThanOrEqual(6); // ~one per 1.4 s over 6 s
    expect(rig.ids()).not.toContain('fuse_tick');
    expect(rig.ctx.sources.filter((x) => x.loop)).toHaveLength(0);
  });

  it('forgets generators that disappeared', async () => {
    const rig = await started();
    const s = playState();
    addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    rig.audio.handleEvents([], s);
    s.generators.length = 0;
    rig.traces.length = 0;
    for (let i = 0; i < 100; i++) {
      rig.audio.handleEvents([], s);
      rig.ctx.advance(0.05);
    }
    expect(rig.ids()).not.toContain('fuse_tick');
  });
});

describe('vehicle engine loops', () => {
  it('runs an engine bed only for driving vehicles', async () => {
    const rig = await started();
    const s = playState();
    s.vehicles.push({
      id: 1,
      ownerId: 1,
      kind: 'danfo',
      route: [
        { x: 0, y: 3 },
        { x: 1, y: 3 },
        { x: 2, y: 3 },
      ],
      phase: 'warning',
      warnRemaining: 30,
      wreckRemaining: 0,
      hitPlayerIds: [],
      index: 0,
      stepRemaining: 0,
      stepTotal: 10,
      damage: 0,
      slowUntil: 0,
      softBroken: 0,
      playerHits: 0,
      exposedEvents: [],
      eventId: 5,
      startTick: 0,
    });
    rig.audio.handleEvents([], s);
    expect(rig.ctx.sources.filter((x) => x.loop)).toHaveLength(0);
    s.vehicles[0]!.phase = 'driving';
    rig.audio.handleEvents([], s);
    const live = rig.ctx.sources.filter((x) => x.loop && x.stoppedAt === null);
    expect(live).toHaveLength(1);
    s.vehicles.length = 0;
    rig.audio.handleEvents([], s);
    expect(live[0]!.stoppedAt).not.toBeNull();
  });
});

describe('ambience (not music)', () => {
  it('startMusic layers three looping beds once rendered; stopMusic fades them', async () => {
    const rig = makeRig();
    await rig.audio.unlock();
    rig.audio.startMusic();
    finishWarmup();
    const loops = rig.ctx.sources.filter((x) => x.loop && x.startedAt !== null);
    expect(loops).toHaveLength(3);
    expect(new Set(loops.map((l) => l.buffer)).size).toBe(3);
    // staggered start offsets so layers never begin aligned
    expect(new Set(loops.map((l) => l.startOffset)).size).toBe(3);
    rig.audio.stopMusic();
    for (const l of loops) expect(l.stoppedAt).not.toBeNull();
    rig.audio.stopMusic(); // harmless
    rig.audio.startMusic();
    expect(rig.ctx.sources.filter((x) => x.loop && x.stoppedAt === null)).toHaveLength(3);
  });

  it('remembers startMusic called before unlock', async () => {
    const rig = makeRig();
    rig.audio.startMusic();
    await rig.audio.unlock();
    finishWarmup();
    expect(rig.ctx.sources.filter((x) => x.loop && x.startedAt !== null)).toHaveLength(3);
  });

  it('does not need timers of its own (no polling): only the warm-up uses them, and they end', async () => {
    const rig = makeRig({ bank: { rateScale: 0.25, cache: true, sliceMs: 0 } });
    await rig.audio.unlock();
    rig.audio.startMusic();
    expect(vi.getTimerCount()).toBe(1); // the sliced warm-up
    rig.ctx.advance(0); // (the audio clock is not involved)
    for (let i = 0; i < 40 && rig.ctx.sources.filter((x) => x.loop && x.startedAt !== null).length < 3; i++) {
      vi.advanceTimersByTime(10);
    }
    expect(rig.ctx.sources.filter((x) => x.loop && x.startedAt !== null)).toHaveLength(3); // loops are first in the queue
    rig.audio.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('intensity raises the excited layer and is clamped', async () => {
    const { levelsFor } = await import('../../src/audio/ambience');
    const calm = levelsFor(0);
    const hot = levelsFor(1);
    expect(hot.crowd_loop_hype).toBeGreaterThan(calm.crowd_loop_hype * 2);
    expect(hot.crowd_loop).toBeGreaterThanOrEqual(calm.crowd_loop);
    expect(calm.crowd_loop_hype).toBeGreaterThan(0.2); // never dead: the crowd is always audible
    expect(levelsFor(9)).toEqual(hot);
    expect(levelsFor(-4)).toEqual(calm);
    expect(levelsFor(Number.NaN)).toEqual(calm);
    for (let i = 1; i <= 10; i++) {
      expect(levelsFor(i / 10).crowd_loop_hype).toBeGreaterThan(levelsFor((i - 1) / 10).crowd_loop_hype);
    }
  });

  it('setIntensity retargets the beds and makes crowd reactions louder', async () => {
    const quiet = await started();
    quiet.audio.startMusic();
    quiet.audio.setIntensity(0);
    quiet.audio.handleEvents([SAMPLES.vehicleDestroyed], playState());
    const lo = quiet.traces.find((t) => t.id.startsWith('crowd_cheer'))!;
    const loud = await started();
    loud.audio.startMusic();
    loud.audio.setIntensity(1);
    loud.audio.setIntensity(Number.NaN); // ignored => 0
    loud.audio.setIntensity(1);
    loud.audio.handleEvents([SAMPLES.vehicleDestroyed], playState());
    const hi = loud.traces.find((t) => t.id.startsWith('crowd_cheer'))!;
    expect(hi.gain).toBeGreaterThan(lo.gain);
    expect(quiet.errors.concat(loud.errors)).toEqual([]);
  });
});

describe('crowd reactions', () => {
  it('reacts to a human elimination with a groan, louder than for a bot', async () => {
    const humanRig = await started();
    const s = playState();
    s.players[1]!.isBot = true; // player 0 is the human
    humanRig.audio.handleEvents([{ ...SAMPLES.playerEliminated, playerId: 0 } as SimEvent], s);
    expect(humanRig.ids()).toContain('crowd_groan');
    const botRig = await started();
    botRig.audio.handleEvents([{ ...SAMPLES.playerEliminated, playerId: 1 } as SimEvent], s);
    expect(botRig.ids()).not.toContain('crowd_groan');
    expect(botRig.ids().some((id) => id.startsWith('crowd_'))).toBe(true);
  });

  it('final elimination and a win get the big roar', async () => {
    const rig = await started();
    const s = playState();
    s.players[1]!.alive = false;
    rig.audio.handleEvents([{ type: 'matchEnded', result: { kind: 'win', winnerId: 0 } }], s);
    expect(rig.ids()).toContain('win_sting');
    expect(rig.ids()).toContain('crowd_roar');
    const lose = await started();
    s.players[1]!.isBot = true;
    lose.audio.handleEvents([{ type: 'matchEnded', result: { kind: 'win', winnerId: 1 } }], s);
    expect(lose.ids()).toContain('lose_sting');
    expect(lose.ids()).toContain('crowd_groan');
    const draw = await started();
    draw.audio.handleEvents([{ type: 'matchEnded', result: { kind: 'draw', reason: 'timeout' } }], s);
    expect(draw.ids()).toContain('draw_sting');
  });

  it('gives a near-miss gasp when a blast flames pass next to a living player', async () => {
    const rig = await started();
    const s = playState();
    put(s, 0, 5, 5);
    s.flames.push({
      x: 6,
      y: 5,
      eventId: 1,
      genId: 1,
      ownerId: 1,
      dir: 'right',
      tip: false,
      startTick: 0,
      endTick: 30,
    });
    rig.audio.handleEvents([SAMPLES.generatorExploded], s);
    expect(rig.ids()).toContain('crowd_gasp');
    const quiet = await started();
    const s2 = playState();
    put(s2, 0, 5, 5);
    s2.flames.push({
      x: 9,
      y: 5,
      eventId: 1,
      genId: 1,
      ownerId: 1,
      dir: 'right',
      tip: false,
      startTick: 0,
      endTick: 30,
    });
    quiet.audio.handleEvents([SAMPLES.generatorExploded], s2);
    expect(quiet.ids()).not.toContain('crowd_gasp');
  });

  it('plays a Doppler-style pass sound and an ooh for a vehicle brushing past', async () => {
    const rig = await started();
    const s = playState();
    put(s, 0, 5, 4);
    s.vehicles.push({
      id: 9,
      ownerId: 1,
      kind: 'taxi',
      route: [
        { x: 4, y: 3 },
        { x: 5, y: 3 },
        { x: 6, y: 3 },
      ],
      phase: 'driving',
      warnRemaining: 0,
      wreckRemaining: 0,
      hitPlayerIds: [],
      index: 1,
      stepRemaining: 0,
      stepTotal: 8,
      damage: 0,
      slowUntil: 0,
      softBroken: 0,
      playerHits: 0,
      exposedEvents: [],
      eventId: 5,
      startTick: 0,
    });
    rig.audio.handleEvents([], s);
    expect(rig.ids()).toContain('taxi_pass');
    expect(rig.ids()).toContain('crowd_ooh');
    rig.traces.length = 0;
    rig.ctx.advance(10);
    rig.audio.handleEvents([], s); // the same pass is not reported twice
    expect(rig.ids()).not.toContain('taxi_pass');
  });

  it('builds up when the final 30 seconds start, once', async () => {
    const rig = await started();
    const s = playState();
    s.match.playTicks = s.config.match.durationTicks - 1800 - 5;
    rig.audio.handleEvents([], s);
    expect(rig.ids().some((id) => id.startsWith('crowd_'))).toBe(false);
    s.match.playTicks += 10;
    rig.audio.handleEvents([], s);
    expect(rig.ids()).toContain('crowd_cheer_big');
    const n = rig.ids().length;
    rig.ctx.advance(20);
    s.match.playTicks += 100;
    rig.audio.handleEvents([], s);
    expect(rig.ids().length).toBe(n);
  });
});

describe('dispose', () => {
  it('stops everything, closes the context and becomes inert', async () => {
    const rig = makeRig();
    await rig.audio.unlock();
    rig.audio.startMusic();
    finishWarmup();
    rig.audio.handleEvents([SAMPLES.matchStarted], playState());
    rig.audio.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(rig.ctx.closed).toBe(true);
    for (const src of rig.ctx.sources.filter((x) => x.loop)) expect(src.stoppedAt).not.toBeNull();
    const n = rig.ctx.nodeCount();
    rig.audio.handleEvents(Object.values(SAMPLES), playState());
    rig.audio.playUi('click');
    rig.audio.startMusic();
    await rig.audio.unlock();
    finishWarmup();
    expect(rig.ctx.nodeCount()).toBe(n);
    rig.audio.dispose(); // idempotent
  });

  it('cancels pending warm-up work', async () => {
    const rig = makeRig({ bank: { rateScale: 0.25, cache: true } }); // default background warm-up
    await rig.audio.unlock();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    rig.audio.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is safe before unlock', () => {
    const rig = makeRig();
    rig.audio.dispose();
    expect(rig.ctx.nodeCount()).toBe(0);
  });
});

describe('ui sounds', () => {
  it('plays each ui kind', async () => {
    const rig = await started({
      onError: (e: unknown) => {
        throw e;
      },
    });
    const expected = {
      click: 'ui_click',
      back: 'ui_back',
      start: 'ui_start',
      countdown: 'ui_count',
      go: 'ui_go',
    } as const;
    for (const [kind, id] of Object.entries(expected)) {
      rig.traces.length = 0;
      rig.ctx.advance(1);
      rig.audio.playUi(kind as keyof typeof expected);
      expect(rig.ids(), kind).toEqual([id]);
    }
  });
});
