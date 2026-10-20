/**
 * Sound definitions. Each id in the bank maps to a `SoundDef`: a deterministic recipe that renders
 * a stereo Float32Array pair with pure DSP (see ../dsp). Everything described here is SYNTHESISED.
 *
 * Renders are generator functions: a `yield` marks a point where the bank scheduler may pause so a
 * long render (crowd choirs, loops) is sliced into small chunks and never freezes a phone.
 */
import { dcBlock, gainInPlace, peakOf, rmsOf, softLimit, dbToGain, window, mul } from '../dsp/core';
import type { Rng, Track } from '../dsp/core';
import { Priority } from '../voices';

/**
 * Which bus a sound plays through.
 *  - sfx:   normal effects (ducked by nothing)
 *  - warn:  danger warnings (horns, fuse ticks, alarms): never ducked, sit in their own band
 *  - react: crowd reaction one-shots (ducked only lightly)
 *  - amb:   looping ambience beds (ducked under blasts/warnings)
 */
export type Bus = 'sfx' | 'warn' | 'react' | 'amb';

export interface RenderEnv {
  /** Sample rate to render at. */
  rate: number;
  /** Seeded generator: the same id always renders the same samples. */
  rng: Rng;
}

export type Render = (env: RenderEnv) => Generator<void, Track, void>;

export interface SoundDef {
  kind: 'oneshot' | 'loop';
  bus: Bus;
  /** Native render rate in Hz (before the bank's optional test scale). */
  rate: number;
  priority: number;
  /** Default playback gain 0..~1.5 (loudness trim relative to other sounds). */
  gain: number;
  /** One-shots are peak-normalised to `peak`; loops are RMS-normalised to `rmsDb` (then limited). */
  peak: number;
  rmsDb: number;
  render: Render;
}

interface Common {
  bus?: Bus;
  rate?: number;
  priority?: number;
  gain?: number;
}

/** Wrap a plain function as a (non-yielding) render. */
export const simple = (fn: (env: RenderEnv) => Track): Render =>
  // eslint-disable-next-line require-yield
  function* (env) {
    return fn(env);
  };

export function oneShot(o: Common & { peak?: number; render: Render }): SoundDef {
  return {
    kind: 'oneshot',
    bus: o.bus ?? 'sfx',
    rate: o.rate ?? 32000,
    priority: o.priority ?? Priority.normal,
    gain: o.gain ?? 1,
    peak: o.peak ?? 0.9,
    rmsDb: -20,
    render: o.render,
  };
}

export function loop(o: Common & { rmsDb: number; render: Render }): SoundDef {
  return {
    kind: 'loop',
    bus: o.bus ?? 'amb',
    rate: o.rate ?? 24000,
    priority: o.priority ?? Priority.ambient,
    gain: o.gain ?? 1,
    peak: 0.95,
    rmsDb: o.rmsDb,
    render: o.render,
  };
}

/** Finished audio data (what the bank turns into AudioBuffers). */
export interface Pcm {
  l: Float32Array;
  r: Float32Array;
  rate: number;
}

/** Trailing level below which a one-shot's tail is cut off (-54 dB re peak). */
const TAIL_FLOOR = 0.002;

/** Final clean-up applied by the bank to every rendered track. */
export function finalize(def: SoundDef, t: Track): Pcm {
  let l = t.l;
  let r = t.r;
  if (def.kind === 'oneshot') {
    dcBlock(l, t.rate, 12);
    dcBlock(r, t.rate, 12);
    const p = Math.max(peakOf(l), peakOf(r));
    if (p > 1e-9) {
      gainInPlace(l, def.peak / p);
      gainInPlace(r, def.peak / p);
    }
    // trim the silent tail (render lengths are generous so reverb tails fit), keep 40 ms of grace
    const floor = TAIL_FLOOR * def.peak;
    let end = l.length;
    while (end > 1 && Math.abs(l[end - 1]!) < floor && Math.abs(r[end - 1]!) < floor) end--;
    end = Math.min(l.length, end + Math.round(t.rate * 0.04));
    l = l.slice(0, end);
    r = r.slice(0, end);
    const fade = window(end, t.rate, 0.0004, 0.012);
    mul(l, fade);
    mul(r, fade);
  } else {
    // loops: remove the static offset (a 1-pole DC blocker would break the seam)
    for (const ch of [l, r]) {
      let m = 0;
      for (let i = 0; i < ch.length; i++) m += ch[i]!;
      m /= ch.length;
      for (let i = 0; i < ch.length; i++) ch[i]! -= m;
    }
    const rms = Math.max(rmsOf(l), rmsOf(r));
    if (rms > 1e-9) {
      const g = dbToGain(def.rmsDb) / rms;
      gainInPlace(l, g);
      gainInPlace(r, g);
    }
  }
  softLimit(l, 0.97);
  softLimit(r, 0.97);
  return { l, r, rate: t.rate };
}
