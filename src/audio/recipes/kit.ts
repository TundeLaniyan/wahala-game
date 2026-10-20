/**
 * Shared synthesis building blocks for the sound recipes: filtered-noise bursts, pitch-dropping
 * thumps, bells, engines, horns, whistles and a reverb helper. All pure DSP (see ../dsp/core).
 */
import {
  TAU,
  additive,
  bandpass,
  between,
  clampN,
  decayEnv,
  envelope,
  highpass,
  lowpass,
  mul,
  osc,
  saturate,
  svf,
  window,
  white,
} from '../dsp/core';
import type { FilterMode, Freq, Rng, Track } from '../dsp/core';
import { convolveStereo, convolveStereoSteps, makeImpulse } from '../dsp/reverb';
import { createRand } from '../rng';
import type { Impulse } from '../dsp/reverb';

export const len = (rate: number, seconds: number): number => Math.max(1, Math.round(rate * seconds));

// ------------------------------------------------------------------------------------ reverb

const irCache = new Map<string, Impulse>();

export type RoomName = 'booth' | 'yard' | 'hall';
const ROOMS: Record<RoomName, { rt60: number; bright: number; dark: number; pre: number }> = {
  booth: { rt60: 0.35, bright: 6000, dark: 1800, pre: 3 },
  yard: { rt60: 0.9, bright: 7000, dark: 1300, pre: 9 },
  hall: { rt60: 1.6, bright: 5500, dark: 900, pre: 14 },
};

/** Cached synthesised room impulse response for a render rate. */
export function room(rate: number, name: RoomName): Impulse {
  const key = `${name}@${rate}`;
  let ir = irCache.get(key);
  if (!ir) {
    const r = ROOMS[name];
    ir = makeImpulse(rate, {
      rt60: r.rt60,
      brightHz: r.bright,
      darkHz: r.dark,
      preDelayMs: r.pre,
      seed: key,
    });
    irCache.set(key, ir);
  }
  return ir;
}

const midOf = (t: Track): Float32Array => {
  const mid = new Float32Array(t.length);
  for (let i = 0; i < t.length; i++) mid[i] = (t.l[i]! + t.r[i]!) * 0.5;
  return mid;
};

/**
 * Adds a synthesised-room tail to the track in place (mono-summed send, stereo return) and returns
 * it. The track must already be long enough to hold the tail; anything beyond is cut.
 */
export function addReverb(t: Track, name: RoomName, wet: number): Track {
  const [wl, wr] = convolveStereo(midOf(t), room(t.rate, name), wet, t.length);
  for (let i = 0; i < t.length; i++) {
    t.l[i]! += wl[i]!;
    t.r[i]! += wr[i]!;
  }
  return t;
}

/** Same as `addReverb` but sliced: yields between FFT blocks so long sounds never block a frame. */
export function* addReverbSteps(t: Track, name: RoomName, wet: number): Generator<void, Track> {
  const [wl, wr] = yield* convolveStereoSteps(midOf(t), room(t.rate, name), wet, t.length);
  for (let i = 0; i < t.length; i++) {
    t.l[i]! += wl[i]!;
    t.r[i]! += wr[i]!;
  }
  return t;
}

/** Reverb for a loop: the tail that runs past the end wraps round to the start (seamless). Sliced. */
export function* addWrappedReverb(t: Track, name: RoomName, wet: number): Generator<void, Track> {
  const ir = room(t.rate, name);
  const full = t.length + ir.l.length;
  const [wl, wr] = yield* convolveStereoSteps(midOf(t), ir, wet, full);
  for (let i = 0; i < full; i++) {
    const j = i % t.length;
    t.l[j]! += wl[i]!;
    t.r[j]! += wr[i]!;
  }
  return t;
}

// ------------------------------------------------------------------------------------ elements

/** Filtered noise burst with a sharp attack and exponential decay. `f1` sweeps the filter. */
export function nburst(
  rate: number,
  seconds: number,
  rng: Rng,
  mode: FilterMode,
  f0: number,
  f1: number | null,
  q: number,
  tau: number,
  attack = 0.002,
): Float32Array {
  const n = len(rate, seconds);
  const x = white(n, rng);
  const cut = f1 === null ? f0 : (i: number): number => f0 * Math.pow(f1 / f0, i / n);
  svf(x, rate, mode, cut, q, true);
  return mul(x, decayEnv(n, rate, attack, tau));
}

/** Pitch-dropping sine ("thump", kick, impact body). */
export function thump(
  rate: number,
  seconds: number,
  f0: number,
  f1: number,
  tauPitch: number,
  tauAmp: number,
  drive = 1.6,
  knock = 0.3,
): Float32Array {
  const n = len(rate, seconds);
  const x = osc('sine', n, rate, (t) => f1 + (f0 - f1) * Math.exp(-t / tauPitch));
  mul(x, decayEnv(n, rate, 0.002, tauAmp));
  const body = drive > 0 ? saturate(x, drive) : x;
  if (knock > 0) {
    // short mid-range "knock" so the impact still reads on small speakers that drop the low end
    const k = len(rate, Math.min(seconds, 0.05 + tauAmp * 0.4));
    const kn = mul(
      bandpass(noiseOf(k, f0), rate, 520 + f0 * 2.2, 0.9),
      decayEnv(k, rate, 0.0008, Math.max(0.006, tauAmp * 0.18)),
    );
    for (let i = 0; i < k; i++) body[i]! += kn[i]! * knock * 2.2;
  }
  return body;
}

/** Deterministic white noise (seeded by an arbitrary number) for internal use inside pure helpers. */
function noiseOf(n: number, seed: number): Float32Array {
  return white(n, createRand(Math.round(seed * 1000) >>> 0));
}

/** Inharmonic metal / bell strike. */
export function bell(
  rate: number,
  seconds: number,
  f: number,
  tau: number,
  ratios?: readonly number[],
): Float32Array {
  const rs = ratios ?? [1, 2.76, 5.4, 8.93];
  const x = additive(
    len(rate, seconds),
    rate,
    f,
    rs.map((ratio, i) => ({ ratio, amp: 1 / (1 + i * 0.9), decay: (1 + i * 0.8) / tau })),
  );
  return mul(x, window(x.length, rate, 0.001, 0.02));
}

/** Warm harmonic chime/pluck (marimba-ish, used for pickups and UI). */
export function chime(rate: number, seconds: number, f: number, tau: number, bright = 1): Float32Array {
  const x = additive(len(rate, seconds), rate, f, [
    { ratio: 1, amp: 1, decay: 1 / tau },
    { ratio: 2, amp: 0.38 * bright, decay: 1.7 / tau },
    { ratio: 3, amp: 0.16 * bright, decay: 2.4 / tau },
    { ratio: 4.2, amp: 0.07 * bright, decay: 3.4 / tau },
  ]);
  return mul(x, window(x.length, rate, 0.0015, 0.02));
}

/** Slide/finger whistle: a near-pure sine with vibrato plus a little breath. */
export function whistle(
  rate: number,
  seconds: number,
  rng: Rng,
  f0: number,
  f1: number,
  vibHz = 6,
  vibSemi = 0.35,
  breath = 0.07,
): Float32Array {
  const n = len(rate, seconds);
  const T = n / rate;
  const ph = rng() * TAU;
  const f = (t: number): number => {
    const u = clampN(t / T, 0, 1);
    return (
      (f0 + (f1 - f0) * (u * u * (3 - 2 * u))) * Math.pow(2, (Math.sin(TAU * vibHz * t + ph) * vibSemi) / 12)
    );
  };
  const x = osc('sine', n, rate, f);
  const nz = bandpass(white(n, rng), rate, (i) => f(i / rate), 9);
  for (let i = 0; i < n; i++) x[i] = x[i]! + nz[i]! * breath * 3;
  return mul(
    x,
    envelope(n, rate, [
      [0, 0],
      [Math.min(0.06, T * 0.3), 1],
      [T * 0.8, 0.85],
      [T, 0],
    ]),
  );
}

/** One hand-clap: a few tightly spaced noise bursts (the "flam") through a mid band-pass. */
export function clap(rate: number, rng: Rng, hz = 1500): Float32Array {
  const n = len(rate, 0.09);
  const o = new Float32Array(n);
  const hits = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < hits; k++) {
    const b = nburst(rate, 0.05, rng, 'bp', hz * between(rng, 0.8, 1.25), null, 1.1, 0.011, 0.0004);
    const at = Math.round(rate * k * between(rng, 0.004, 0.011));
    for (let i = 0; i < b.length && at + i < n; i++) o[at + i]! += b[i]! * (k === hits - 1 ? 1 : 0.6);
  }
  return o;
}

// ------------------------------------------------------------------------------------ engines

export interface EngineSpec {
  rate: number;
  seconds: number;
  rng: Rng;
  /** Firing frequency in Hz over time (cylinder pulses per second). */
  fire: Freq;
  /** Number of harmonics of the firing frequency. */
  harmonics: number;
  /** Spectral tilt exponent: amplitude ~ h^-tilt. */
  tilt: number;
  /** Resonance peak (Hz) with relative boost (exhaust / body formant). */
  peakHz: number;
  peakGain: number;
  /** Noise clatter on each firing: level, band-pass centre and Q. */
  clatter: number;
  clatterHz: number;
  clatterQ: number;
  /** 0..1 cycle-to-cycle irregularity (idle lope). Pattern repeats every 8 cycles. */
  rough: number;
  /** Final low-pass cut-off. */
  lp: number;
  /** High-pass cut-off in Hz (default 60) so small speakers are not asked for sub-bass. */
  hp?: number;
  /** Extra saturation (0 = none). */
  drive?: number;
}

/**
 * Additive firing-pulse engine: a harmonic series of the firing frequency (with an exhaust-style
 * resonance) plus gated noise "clatter". For loops choose `fire * seconds` as a multiple of 8 so
 * the irregularity pattern wraps exactly.
 */
export function engine(s: EngineSpec): Float32Array {
  const { rate, rng } = s;
  const n = len(rate, s.seconds);
  const phase = new Float64Array(n);
  const fire = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    phase[i] = p;
    fire[i] = typeof s.fire === 'number' ? s.fire : s.fire(i / rate);
    p += fire[i]! / rate;
  }
  const pattern = Array.from({ length: 8 }, () => 1 - s.rough * rng() * 0.8);
  const cycleGain = (ph: number): number => pattern[Math.floor(ph) & 7]!;
  const out = new Float32Array(n);
  // Harmonic series by rotation recurrence (one sin/cos per sample instead of one sin per harmonic);
  // the per-harmonic weights (tilt + exhaust resonance) are refreshed every 16 samples.
  const H = s.harmonics;
  const w = new Float64Array(H + 1);
  const base = Array.from({ length: H + 1 }, (_, h) => (h > 0 ? Math.pow(h, -s.tilt) : 0));
  const lim = rate * 0.45;
  for (let i = 0; i < n; i++) {
    if (i % 16 === 0) {
      const f1 = fire[i]!;
      for (let h = 1; h <= H; h++) {
        const f = h * f1;
        w[h] =
          f > lim
            ? 0
            : base[h]! * (1 + s.peakGain * Math.exp(-Math.pow((f - s.peakHz) / (s.peakHz * 0.4), 2)));
      }
    }
    const ang = TAU * phase[i]!;
    const s1 = Math.sin(ang);
    const c1 = Math.cos(ang);
    let sh = s1;
    let ch = c1;
    let acc = 0;
    for (let h = 1; h <= H; h++) {
      acc += sh * w[h]!;
      const ns = sh * c1 + ch * s1;
      ch = ch * c1 - sh * s1;
      sh = ns;
    }
    out[i] = acc * cycleGain(phase[i]!);
  }
  if (s.clatter > 0) {
    const nz = bandpass(white(n, rng), rate, s.clatterHz, s.clatterQ);
    for (let i = 0; i < n; i++) {
      const frac = phase[i]! - Math.floor(phase[i]!);
      out[i]! += nz[i]! * Math.exp(-frac * 9) * s.clatter * cycleGain(phase[i]!) * 1.6;
    }
  }
  const y = highpass(lowpass(out, rate, s.lp, 0.8), rate, s.hp ?? 60, 0.7);
  return s.drive ? saturate(y, s.drive) : y;
}

// ------------------------------------------------------------------------------------ horns

export interface HornSpec {
  rate: number;
  seconds: number;
  /** Fundamentals sounding together. */
  notes: readonly number[];
  attack: number;
  /** Time at which the release starts. */
  hold: number;
  release: number;
  /** Low-pass cut-off for the reed buzz and a band-pass "bell" resonance boost. */
  lp: number;
  bellHz: number;
  bellGain: number;
  /** Amplitude roughness: depth 0..1 at `raspHz`. */
  rasp: number;
  raspHz: number;
  /** Optional pitch glide ratio applied over the note (1 = none), e.g. 0.97 sag at the end. */
  sag?: number;
  /** Detune in cents between the two oscillators per note. */
  detune?: number;
}

/** Reed horn: detuned saw + pulse per note, low-passed, with a bell resonance and rasp. */
export function horn(s: HornSpec): Float32Array {
  const n = len(s.rate, s.seconds);
  const out = new Float32Array(n);
  const det = s.detune ?? 7;
  const sag = s.sag ?? 1;
  for (const f of s.notes) {
    const fm = (t: number): number => f * (1 + (sag - 1) * clampN(t / s.seconds, 0, 1));
    const a = osc('saw', n, s.rate, (t) => fm(t) * Math.pow(2, det / 1200));
    const b = osc('square', n, s.rate, (t) => fm(t) * Math.pow(2, -det / 1200), 0.2, 0.38);
    for (let i = 0; i < n; i++) out[i]! += a[i]! * 0.6 + b[i]! * 0.4;
  }
  const body = lowpass(out, s.rate, s.lp, 1.1);
  const bell = bandpass(out, s.rate, s.bellHz, 2.2);
  for (let i = 0; i < n; i++) {
    const t = i / s.rate;
    const rasp = 1 - s.rasp * 0.5 * (1 + Math.sin(TAU * s.raspHz * t));
    body[i] = (body[i]! + bell[i]! * s.bellGain) * rasp;
  }
  const env = envelope(n, s.rate, [
    [0, 0],
    [s.attack, 1],
    [s.hold, 0.92],
    [s.hold + s.release, 0],
  ]);
  return saturate(mul(body, env), 1.4);
}

/** Simple helper: highpass-filtered white noise with an exponential tail (airy "tssh"). */
export function air(
  rate: number,
  seconds: number,
  rng: Rng,
  hz: number,
  tau: number,
  attack = 0.005,
): Float32Array {
  const n = len(rate, seconds);
  const x = highpass(white(n, rng), rate, hz, 0.7);
  return mul(x, decayEnv(n, rate, attack, tau));
}
