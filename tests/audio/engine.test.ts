import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/audio';
import type { AudioEngine } from '../../src/audio';
import type { GameState, SimEvent } from '../../src/sim';
import { addGenerator, sandbox } from '../helpers';
import { FakeContext } from './fakeContext';
import type { FakeOsc } from './fakeContext';
import type { FakeContextOptions } from './fakeContext';

/** One sample of every SimEvent type. The Record type makes a new sim event a compile error here. */
const SAMPLES: Record<SimEvent['type'], SimEvent> = {
  matchStarted: { type: 'matchStarted' },
  matchEnded: { type: 'matchEnded', result: { kind: 'win', winnerId: 0 } },
  generatorPlaced: { type: 'generatorPlaced', generatorId: 1, ownerId: 0, x: 3, y: 3 },
  generatorExploded: {
    type: 'generatorExploded',
    generatorId: 1,
    ownerId: 0,
    x: 3,
    y: 3,
    eventId: 1,
    range: 2,
  },
  generatorKicked: { type: 'generatorKicked', generatorId: 1 },
  generatorCarried: { type: 'generatorCarried', generatorId: 1, playerId: 0, bonus: true },
  generatorDropped: { type: 'generatorDropped', generatorId: 1, playerId: 0 },
  generatorThrown: { type: 'generatorThrown', generatorId: 1, playerId: 0, toX: 5, toY: 3 },
  generatorDisarmed: { type: 'generatorDisarmed', generatorId: 1, playerId: 0 },
  generatorDudCleaned: { type: 'generatorDudCleaned', generatorId: 1, x: 2, y: 2 },
  blockDestroyed: { type: 'blockDestroyed', x: 4, y: 4, by: 'flame' },
  pickupRevealed: { type: 'pickupRevealed', pickupId: 1, x: 4, y: 4, kind: 'petrol' },
  pickupCollected: { type: 'pickupCollected', pickupId: 1, playerId: 0, kind: 'okada', wasted: false },
  pickupBurned: { type: 'pickupBurned', pickupId: 1, x: 4, y: 4 },
  pickupDropped: { type: 'pickupDropped', pickupId: 1, x: 4, y: 4, kind: 'socket' },
  playerEliminated: {
    type: 'playerEliminated',
    playerId: 1,
    cause: { kind: 'flame', ownerId: 0, eventId: 1 },
    x: 5,
    y: 5,
  },
  playerJumped: { type: 'playerJumped', playerId: 0 },
  okadaMounted: { type: 'okadaMounted', playerId: 0 },
  okadaBroken: { type: 'okadaBroken', playerId: 0, x: 1, y: 1 },
  skillUsed: { type: 'skillUsed', playerId: 0, skill: 'push', targetId: 1 },
  playerPushed: { type: 'playerPushed', playerId: 1, byId: 0, fromX: 1, fromY: 1 },
  playerDazed: { type: 'playerDazed', playerId: 1, byId: 0 },
  cursed: { type: 'cursed', playerId: 0, curse: 'inverted' },
  vehicleEntryBegan: { type: 'vehicleEntryBegan', playerId: 0 },
  vehicleEntryCancelled: { type: 'vehicleEntryCancelled', playerId: 0, reason: 'cancel' },
  vehicleWarning: { type: 'vehicleWarning', vehicleId: 1, kind: 'danfo', ownerId: 1, entry: { x: 0, y: 3 } },
  vehicleLaunched: { type: 'vehicleLaunched', vehicleId: 1, kind: 'taxi', ownerId: 1 },
  vehicleHitPlayer: { type: 'vehicleHitPlayer', vehicleId: 1, playerId: 0 },
  vehicleHitGenerator: { type: 'vehicleHitGenerator', vehicleId: 1, generatorId: 1 },
  vehicleDamaged: { type: 'vehicleDamaged', vehicleId: 1, damage: 2, total: 4, resistance: 9 },
  vehicleDestroyed: { type: 'vehicleDestroyed', vehicleId: 1, x: 6, y: 3, reason: 'blast' },
  vehicleExited: { type: 'vehicleExited', vehicleId: 1 },
  crushWarning: { type: 'crushWarning', x: 2, y: 2, landTick: 100 },
  crushLanded: { type: 'crushLanded', x: 2, y: 2 },
  crowdWarning: { type: 'crowdWarning', throwId: 1, x: 2, y: 2, kind: 'firecracker', landTick: 100 },
  crowdLanded: { type: 'crowdLanded', throwId: 1, x: 2, y: 2, kind: 'bottle' },
  hazardTriggered: { type: 'hazardTriggered', playerId: 0, kind: 'oil' },
};

let ctx: FakeContext;
let errors: unknown[];

function make(opts: FakeContextOptions = {}): AudioEngine {
  ctx = new FakeContext(opts);
  errors = [];
  return createAudio({
    contextFactory: () => ctx,
    onError: (e) => {
      errors.push(e);
    },
  });
}

/** Advances audio clock and fake timers together. */
function advance(seconds: number): void {
  const stepMs = 20;
  for (let t = 0; t < seconds * 1000; t += stepMs) {
    ctx.advance(stepMs / 1000);
    vi.advanceTimersByTime(stepMs);
  }
}

function state(): GameState {
  return sandbox({ players: 2 });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('context handling', () => {
  it('is a silent no-op without any AudioContext (Node default factory)', async () => {
    const a = createAudio();
    await a.unlock();
    a.setVolumes({ master: 1, music: 1, sfx: 1 });
    a.setMuted(true);
    a.setMuted(false);
    a.startMusic();
    a.setIntensity(1);
    a.handleEvents(Object.values(SAMPLES), state());
    a.playUi('click');
    a.stopMusic();
    a.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is a silent no-op when the factory returns null or throws', async () => {
    const a = createAudio({ contextFactory: () => null });
    await a.unlock();
    a.handleEvents(Object.values(SAMPLES), state());
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
      const a = createAudio();
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
    a.handleEvents(Object.values(SAMPLES), state());
    a.playUi('click');
    expect(factory).not.toHaveBeenCalled();
  });

  it('unlock resumes the context, is idempotent, and creates a single context', async () => {
    const a = make();
    const factory = vi.fn(() => ctx);
    const b = createAudio({ contextFactory: factory });
    const p1 = b.unlock();
    const p2 = b.unlock();
    await Promise.all([p1, p2]);
    await b.unlock();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe('running');
    expect(ctx.resumeCalls).toBe(1); // later unlocks do not resume a running context again
    a.dispose();
    b.dispose();
  });

  it('re-resumes a context the OS suspended on the next unlock', async () => {
    const a = make();
    await a.unlock();
    ctx.state = 'interrupted';
    await a.unlock();
    expect(ctx.resumeCalls).toBe(2);
    expect(ctx.state).toBe('running');
  });

  it('survives a context without StereoPanner', async () => {
    const a = make({ noPanner: true });
    await a.unlock();
    a.handleEvents(Object.values(SAMPLES), state());
    expect(errors).toEqual([]);
  });
});

describe('event mapping', () => {
  it('handles every SimEvent type without throwing and makes sound for most', async () => {
    const a = createAudio({
      contextFactory: () => (ctx = new FakeContext()),
      onError: (e) => {
        throw e;
      },
    });
    await a.unlock();
    const s = state();
    const silent = new Set(['vehicleExited', 'vehicleEntryBegan', 'vehicleEntryCancelled']);
    for (const [type, e] of Object.entries(SAMPLES)) {
      const before = ctx.oscs.length + ctx.sources.length;
      a.handleEvents([e], s);
      ctx.advance(2); // let the per-key rate limiters reopen
      const made = ctx.oscs.length + ctx.sources.length - before;
      if (!silent.has(type)) expect(made, type).toBeGreaterThan(0);
    }
    // all together in one batch too
    a.handleEvents(Object.values(SAMPLES), s);
    a.dispose();
  });

  it('never schedules invalid times (strict fake would throw) for 600 random batches', async () => {
    const a = createAudio({
      contextFactory: () => (ctx = new FakeContext()),
      onError: (e) => {
        throw e;
      },
    });
    await a.unlock();
    const s = state();
    const all = Object.values(SAMPLES);
    let seed = 12345;
    const r = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < 600; i++) {
      const batch = Array.from({ length: Math.floor(r() * 6) }, () => all[Math.floor(r() * all.length)]!);
      a.handleEvents(batch, s);
      ctx.advance(r() * 0.1);
    }
    a.dispose();
  });

  it('every oscillator and source that was started is stopped after it starts', async () => {
    const a = make();
    await a.unlock();
    a.handleEvents(Object.values(SAMPLES), state());
    for (const o of ctx.oscs) {
      expect(o.stoppedAt, 'oscillator never stopped').not.toBeNull();
    }
    for (const src of ctx.sources) {
      if (src.buffer && src.buffer.length === 1) continue; // iOS priming sample ends by itself
      if (src.playbackRate.value === 0.85 && src.startedAt === 0) continue; // crowd bed: stopped by stopMusic
      expect(src.stoppedAt).not.toBeNull();
    }
  });

  it('pans from the tile x position', async () => {
    const a = make();
    await a.unlock();
    const s = state();
    a.handleEvents([{ ...SAMPLES.generatorExploded, x: 0 } as SimEvent], s);
    ctx.advance(1);
    a.handleEvents([{ ...SAMPLES.generatorExploded, x: s.width - 1 } as SimEvent], s);
    const pans = ctx.gains
      .flatMap((g) => g.connections)
      .filter((c): c is { pan: { value: number } } => typeof c === 'object' && c !== null && 'pan' in c)
      .map((p) => p.pan.value);
    expect(Math.min(...pans)).toBeLessThan(-0.4);
    expect(Math.max(...pans)).toBeGreaterThan(0.4);
  });

  it('scales the blast with chain size', async () => {
    const a = make();
    await a.unlock();
    const s = state();
    const thump = (): FakeOsc => ctx.oscs[ctx.oscs.length - 1]!;
    a.handleEvents([SAMPLES.generatorExploded], s);
    const solo = ctx.oscs.filter((o) => o.type === 'sine' && o.f0 > 100 && o.f0 < 200).length;
    ctx.advance(2);
    const chain = [1, 2, 3].map(
      (i) => ({ ...SAMPLES.generatorExploded, generatorId: i, eventId: 7 }) as SimEvent,
    );
    a.handleEvents(chain, s);
    const after = ctx.oscs.filter((o) => o.type === 'sine' && o.f0 > 100 && o.f0 < 200).length;
    expect(after - solo).toBeGreaterThanOrEqual(2);
    expect(thump()).toBeDefined();
  });

  it('collapses a blast that breaks many soft blocks into one crumble voice', async () => {
    const a = make({ noPanner: true });
    await a.unlock();
    a.setVolumes({ master: 1, music: 0, sfx: 1 });
    const s = state();
    const sfxBus = ctx.gains.find((g) => g.connections.includes(ctx.master()) && g.gain.value === 0.85)!;
    const before = ctx.liveGainsInto(sfxBus).length;
    const blocks = Array.from(
      { length: 30 },
      (_, i) => ({ type: 'blockDestroyed', x: i % 10, y: 1, by: 'flame' }) as SimEvent,
    );
    a.handleEvents(blocks, s);
    expect(ctx.liveGainsInto(sfxBus).length - before).toBe(1);
  });
});

describe('voice cap', () => {
  it('never keeps more than 24 simultaneous voices alive, even under spam', async () => {
    const a = make({ noPanner: true });
    await a.unlock();
    a.setVolumes({ master: 1, music: 0, sfx: 1 });
    const sfxBus = ctx.gains.find((g) => g.connections.includes(ctx.master()) && g.gain.value === 0.85)!;
    expect(sfxBus).toBeDefined();
    const s = state();
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
    const baseline = ctx.liveGainsInto(sfxBus).length; // the (idle) crowd bed input is already attached
    let peak = 0;
    for (let i = 0; i < 400; i++) {
      a.handleEvents(spam, s);
      ctx.advance(0.004);
      a.playUi('click');
      peak = Math.max(peak, ctx.liveGainsInto(sfxBus).length - baseline);
    }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(24);
    expect(errors).toEqual([]);
  });
});

describe('volume and mute', () => {
  it('maps volumes onto buses, clamps them, and mutes smoothly via the master gain', async () => {
    const a = make();
    await a.unlock();
    const master = ctx.master();
    a.setVolumes({ master: 0.5, music: 0.5, sfx: 0.5 });
    expect(master.gain.value).toBeCloseTo(0.5);
    a.setVolumes({ master: 5, music: -2, sfx: Number.NaN });
    expect(master.gain.value).toBe(1);
    // music bus 0, sfx bus 0 (clamped NaN) => both bus gains target 0
    expect(ctx.anyGainTargeted(0)).toBe(true);

    a.setVolumes({ master: 0.8, music: 0.7, sfx: 0.9 });
    const setTargets = master.gain.targets.length;
    a.setMuted(true);
    expect(master.gain.value).toBe(0);
    expect(master.gain.targets.length).toBe(setTargets + 1); // smooth ramp, not a hard jump
    a.setMuted(false);
    expect(master.gain.value).toBeCloseTo(0.8);
    // volume change while muted stays muted
    a.setMuted(true);
    a.setVolumes({ master: 1, music: 1, sfx: 1 });
    expect(master.gain.value).toBe(0);
    a.setMuted(false);
    expect(master.gain.value).toBe(1);
  });

  it('applies volumes and mute chosen before unlock', async () => {
    const a = make();
    a.setVolumes({ master: 0.3, music: 1, sfx: 1 });
    a.setMuted(true);
    await a.unlock();
    expect(ctx.master().gain.value).toBe(0);
    a.setMuted(false);
    expect(ctx.master().gain.value).toBeCloseTo(0.3);
  });

  it('does no work while muted', async () => {
    const a = make();
    await a.unlock();
    a.setMuted(true);
    const n = ctx.nodeCount();
    a.handleEvents(Object.values(SAMPLES), state());
    a.playUi('go');
    expect(ctx.nodeCount()).toBe(n);
  });
});

describe('ducking and warnings', () => {
  it('ducks music/crowd on warnings and blasts, but never ducks the SFX bus', async () => {
    const a = make();
    await a.unlock();
    const s = state();
    expect(ctx.anyGainTargeted(0.38)).toBe(false);
    a.handleEvents([SAMPLES.vehicleWarning], s);
    expect(ctx.anyGainTargeted(0.38)).toBe(true);
    ctx.advance(3);
    expect(ctx.anyGainTargeted(0.6)).toBe(false);
    a.handleEvents([SAMPLES.generatorExploded], s);
    expect(ctx.anyGainTargeted(0.6)).toBe(true);
  });

  it('gives each vehicle kind a distinct warning', async () => {
    const sig = (kind: 'danfo' | 'taxi' | 'keke'): string => {
      const a = make();
      void a.unlock();
      const before = ctx.oscs.length;
      // unlock() is async only for resume; the graph exists synchronously
      a.handleEvents([{ ...SAMPLES.vehicleWarning, kind } as SimEvent], state());
      const mine = ctx.oscs.slice(before).filter((o) => o.startedAt !== null);
      const out = mine.map((o) => `${o.type}:${Math.round(o.f0)}`).join(',');
      a.dispose();
      return out;
    };
    const [d, t, k] = [sig('danfo'), sig('taxi'), sig('keke')];
    expect(d.length).toBeGreaterThan(0);
    expect(new Set([d, t, k]).size).toBe(3);
  });
});

describe('fuse ticking', () => {
  function fuseTicks(osc: FakeOsc[]): number[] {
    return osc
      .filter((o) => o.type === 'square' && o.f0 >= 2200 && o.f0 <= 3600 && o.startedAt !== null)
      .map((o) => o.startedAt!);
  }

  it('ticks faster as the fuse runs down, and stays rate-limited', async () => {
    const a = make();
    await a.unlock();
    const s = state();
    const g = addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    // 60 Hz frames; the fuse counts down 1 tick per frame like the real sim
    for (let f = 0; f < g.timer + 1 && g.timer > 0;) {
      a.handleEvents([], s);
      ctx.advance(1 / 60);
      g.timer--;
    }
    const t = fuseTicks(ctx.oscs);
    expect(t.length).toBeGreaterThan(8);
    const gaps = t.slice(1).map((x, i) => x - t[i]!);
    const early = gaps.slice(0, 2).reduce((x, y) => x + y) / 2;
    const late = gaps.slice(-3).reduce((x, y) => x + y) / 3;
    expect(early).toBeGreaterThan(late * 2);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.04 - 1e-9);
    expect(errors).toEqual([]);
  });

  it('calling many times at the same instant cannot machine-gun', async () => {
    const a = make();
    await a.unlock();
    const s = state();
    for (let i = 0; i < 6; i++) addGenerator(s, { ownerId: 0, x: 1 + i, y: 1, timer: 3 });
    ctx.advance(10);
    a.handleEvents([], s); // registers
    ctx.advance(1);
    for (let i = 0; i < 200; i++) a.handleEvents([], s);
    expect(fuseTicks(ctx.oscs).length).toBeLessThanOrEqual(2);
  });

  it('does not tick for remote, disabled, or expired generators', async () => {
    const a = make();
    await a.unlock();
    const s = state();
    addGenerator(s, { ownerId: 0, x: 1, y: 1, mode: 'remote', timer: 600 });
    addGenerator(s, { ownerId: 0, x: 2, y: 1, mode: 'disabled', timer: 600 });
    addGenerator(s, { ownerId: 0, x: 3, y: 1, timer: 0 });
    for (let i = 0; i < 120; i++) {
      a.handleEvents([], s);
      ctx.advance(1 / 30);
    }
    expect(fuseTicks(ctx.oscs)).toHaveLength(0);
  });

  it('forgets generators that disappeared', async () => {
    const a = make();
    await a.unlock();
    const s = state();
    addGenerator(s, { ownerId: 0, x: 3, y: 3 });
    a.handleEvents([], s);
    s.generators.length = 0;
    for (let i = 0; i < 100; i++) {
      a.handleEvents([], s);
      ctx.advance(0.05);
    }
    expect(fuseTicks(ctx.oscs)).toHaveLength(0);
  });
});

describe('music', () => {
  const STEP = 60 / 104 / 4;
  const kicks = (): number[] =>
    ctx.oscs
      .filter((o) => o.type === 'sine' && o.f0 === 135 && o.startedAt !== null)
      .map((o) => o.startedAt!);

  it('schedules a drift-free groove from the audio clock', async () => {
    const a = make();
    await a.unlock();
    a.startMusic();
    advance(20);
    const k = kicks();
    expect(k.length).toBeGreaterThan(8);
    // pattern kicks at steps 0, 6, 10 of each bar (all even steps => no swing offset)
    const d1 = k[1]! - k[0]!;
    const d2 = k[2]! - k[1]!;
    const d3 = k[3]! - k[2]!;
    expect(d1).toBeCloseTo(6 * STEP, 6);
    expect(d2).toBeCloseTo(4 * STEP, 6);
    expect(d3).toBeCloseTo(6 * STEP, 6);
    // one full 4-bar loop later the same step lands exactly 64 steps later (no drift)
    expect(k[12]! - k[0]!).toBeCloseTo(64 * STEP, 6);
    // events are monotonic
    for (let i = 1; i < k.length; i++) expect(k[i]!).toBeGreaterThan(k[i - 1]!);
    expect(errors).toEqual([]);
  });

  it('looks ahead only a little (does not schedule the whole song at once)', async () => {
    const a = make();
    await a.unlock();
    a.startMusic();
    const horizon = Math.max(...ctx.oscs.map((o) => o.startedAt ?? 0));
    expect(horizon - ctx.currentTime).toBeLessThan(0.6);
  });

  it('remembers startMusic before unlock and starts it on unlock', async () => {
    const a = make();
    a.startMusic();
    await a.unlock();
    advance(1);
    expect(kicks().length).toBeGreaterThan(0);
  });

  it('adds percussion layers with intensity', async () => {
    const congas = (): number => ctx.oscs.filter((o) => o.type === 'sine' && o.f0 === 360).length;
    const bells = (): number =>
      ctx.oscs.filter((o) => o.type === 'sine' && (o.f0 === 1050 || o.f0 === 1400)).length;
    const calm = make();
    await calm.unlock();
    calm.startMusic();
    advance(12);
    expect([congas(), bells()]).toEqual([0, 0]);
    calm.dispose();

    const hot = make();
    await hot.unlock();
    hot.startMusic();
    hot.setIntensity(1);
    advance(12);
    expect(congas()).toBeGreaterThan(0);
    expect(bells()).toBeGreaterThan(0);
    hot.setIntensity(5); // clamped
    hot.setIntensity(Number.NaN);
    expect(errors).toEqual([]);
  });

  it('speeds up slightly with intensity', async () => {
    const calm = make();
    await calm.unlock();
    calm.startMusic();
    advance(14);
    const c = kicks();
    const calmLoop = c[12]! - c[0]!;
    calm.dispose();
    const hot = make();
    await hot.unlock();
    hot.setIntensity(1);
    hot.startMusic();
    advance(40); // smoothing needs time
    const h = kicks();
    const tail = h.slice(-13);
    expect(tail[12]! - tail[0]!).toBeLessThan(calmLoop);
  });

  it('stopMusic stops the scheduler; startMusic is idempotent', async () => {
    const a = make();
    await a.unlock();
    a.startMusic();
    a.startMusic();
    const running = vi.getTimerCount();
    expect(running).toBeGreaterThan(0);
    expect(running).toBeLessThanOrEqual(2); // music pump + crowd wander, not duplicated
    advance(1);
    a.stopMusic();
    expect(vi.getTimerCount()).toBe(0);
    const n = ctx.oscs.length;
    advance(2);
    expect(ctx.oscs.length).toBe(n);
    a.stopMusic(); // harmless
  });
});

describe('dispose', () => {
  it('stops timers, closes the context and becomes inert', async () => {
    const a = make();
    await a.unlock();
    a.startMusic();
    a.handleEvents([SAMPLES.matchStarted], state());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    a.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(ctx.closed).toBe(true);
    const n = ctx.nodeCount();
    a.handleEvents(Object.values(SAMPLES), state());
    a.playUi('click');
    a.startMusic();
    await a.unlock();
    advance(1);
    expect(ctx.nodeCount()).toBe(n);
    a.dispose(); // idempotent
  });

  it('is safe before unlock', () => {
    const a = make();
    a.dispose();
    expect(ctx.nodeCount()).toBe(0);
  });
});

describe('ui sounds', () => {
  it('plays each ui kind', async () => {
    const a = createAudio({
      contextFactory: () => (ctx = new FakeContext()),
      onError: (e) => {
        throw e;
      },
    });
    await a.unlock();
    for (const k of ['click', 'back', 'start', 'countdown', 'go'] as const) {
      const n = ctx.oscs.length;
      a.playUi(k);
      expect(ctx.oscs.length, k).toBeGreaterThan(n);
    }
  });
});
