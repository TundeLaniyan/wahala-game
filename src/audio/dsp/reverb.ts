/**
 * FFT convolution and a synthesised reverb impulse response (exponentially decaying, progressively
 * darker noise with a few early reflections). No sampled room is involved: the "space" is made up.
 */
import { TAU, between, clampN, hashSeed } from './core';
import type { Rng } from './core';
import { createRand } from '../rng';

/** In-place iterative radix-2 complex FFT (`re`/`im` length must be a power of two). */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]!;
      re[i] = re[j]!;
      re[j] = t;
      t = im[i]!;
      im[i] = im[j]!;
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a]! += xr;
        im[a]! += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i]! /= n;
      im[i]! /= n;
    }
  }
}

export const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/** Magnitude spectrum (first half) of `x` zero-padded to `size`. Used by tests and tools. */
export function magnitudeSpectrum(x: Float32Array, size: number): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const n = Math.min(size, x.length);
  for (let i = 0; i < n; i++) re[i] = x[i]! * (0.5 - 0.5 * Math.cos((TAU * i) / Math.max(1, n - 1))); // Hann
  fft(re, im, false);
  const m = new Float64Array(size / 2);
  for (let i = 0; i < m.length; i++) m[i] = Math.hypot(re[i]!, im[i]!);
  return m;
}

export interface Impulse {
  readonly l: Float32Array;
  readonly r: Float32Array;
  readonly rate: number;
}

export interface ImpulseOpts {
  /** Seconds for the tail to fall by 60 dB. */
  rt60: number;
  /** Cutoff (Hz) at the start of the tail and at its end; the tail darkens as it decays. */
  brightHz?: number;
  darkHz?: number;
  preDelayMs?: number;
  seed?: string;
}

/** Synthesised stereo impulse response, normalised to unit energy per channel. */
export function makeImpulse(rate: number, o: ImpulseOpts): Impulse {
  const len = Math.round(rate * o.rt60 * 1.15);
  const pre = Math.round((rate * (o.preDelayMs ?? 8)) / 1000);
  const bright = o.brightHz ?? 7000;
  const dark = o.darkHz ?? 1200;
  const make = (rng: Rng): Float32Array => {
    const ir = new Float32Array(len);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      const u = clampN(t / o.rt60, 0, 1);
      const fc = bright * Math.pow(dark / bright, u);
      const a = 1 - Math.exp((-TAU * fc) / rate);
      lp += a * (rng() * 2 - 1 - lp);
      const env = Math.exp((-6.9078 * t) / o.rt60);
      ir[i] = lp * env * (0.35 + 0.65 * Math.min(1, t / 0.03)); // short build-up avoids a hard click
    }
    // a few discrete early reflections (the bus-park walls)
    for (let k = 0; k < 6; k++) {
      const at = pre + Math.round(rate * between(rng, 0.004, 0.045));
      if (at < len) ir[at]! += (rng() < 0.5 ? -1 : 1) * between(rng, 0.25, 0.6);
    }
    let e = 0;
    for (let i = 0; i < len; i++) e += ir[i]! * ir[i]!;
    const g = 1 / Math.sqrt(Math.max(1e-12, e));
    for (let i = 0; i < len; i++) ir[i]! *= g;
    return ir;
  };
  const seed = hashSeed(o.seed ?? `ir${o.rt60}`);
  return { l: make(createRand(seed)), r: make(createRand(seed ^ 0x9e3779b9)), rate };
}

const irSpectra = new WeakMap<Float32Array, Map<number, { re: Float64Array; im: Float64Array }>>();

function irSpectrum(ir: Float32Array, size: number): { re: Float64Array; im: Float64Array } {
  let bySize = irSpectra.get(ir);
  if (!bySize) irSpectra.set(ir, (bySize = new Map()));
  let s = bySize.get(size);
  if (!s) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    re.set(ir);
    fft(re, im, false);
    bySize.set(size, (s = { re, im }));
  }
  return s;
}

const BLOCK = 16384;

/**
 * Convolve mono `x` with both channels of `ir`, partitioned into blocks (overlap-add) so long
 * inputs stay cheap and a caller can slice the work: the generator yields after each block.
 * Returns two arrays of length `outLen` (default x.length + ir.length - 1), scaled by `wet`.
 */
export function* convolveStereoSteps(
  x: Float32Array,
  ir: Impulse,
  wet: number,
  outLen = x.length + ir.l.length - 1,
): Generator<void, [Float32Array, Float32Array]> {
  const outL = new Float32Array(outLen);
  const outR = new Float32Array(outLen);
  const size = nextPow2(Math.min(x.length, BLOCK) + ir.l.length);
  const hl = irSpectrum(ir.l, size);
  yield; // the two impulse-response spectra (cached afterwards) are the expensive part of a first call
  const hr = irSpectrum(ir.r, size);
  yield;
  const xr = new Float64Array(size);
  const xi = new Float64Array(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let start = 0; start < x.length; start += BLOCK) {
    const end = Math.min(x.length, start + BLOCK);
    xr.fill(0);
    xi.fill(0);
    for (let i = start; i < end; i++) xr[i - start] = x[i]!;
    fft(xr, xi, false);
    for (const [h, out] of [
      [hl, outL],
      [hr, outR],
    ] as const) {
      for (let i = 0; i < size; i++) {
        re[i] = xr[i]! * h.re[i]! - xi[i]! * h.im[i]!;
        im[i] = xr[i]! * h.im[i]! + xi[i]! * h.re[i]!;
      }
      fft(re, im, true);
      const n = Math.min(size, outLen - start);
      for (let i = 0; i < n; i++) out[start + i]! += re[i]! * wet;
    }
    yield;
  }
  return [outL, outR];
}

/** Synchronous convolution (drains `convolveStereoSteps`). */
export function convolveStereo(
  x: Float32Array,
  ir: Impulse,
  wet: number,
  outLen = x.length + ir.l.length - 1,
): [Float32Array, Float32Array] {
  const g = convolveStereoSteps(x, ir, wet, outLen);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}
