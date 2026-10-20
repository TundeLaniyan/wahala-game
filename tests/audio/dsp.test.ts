import { describe, expect, it } from 'vitest';
import {
  Track,
  bandpass,
  envelope,
  hashSeed,
  loopify,
  lowpass,
  osc,
  peakOf,
  rmsOf,
  saturate,
  svf,
  white,
  resample,
} from '../../src/audio/dsp/core';
import { convolveStereo, fft, magnitudeSpectrum, makeImpulse } from '../../src/audio/dsp/reverb';
import { formantVoice } from '../../src/audio/dsp/vocal';
import { createRand } from '../../src/audio/rng';

const RATE = 16000;
const rng = (): (() => number) => createRand(7);

/** Frequency of the strongest spectral bin. */
function peakHz(x: Float32Array, rate = RATE): number {
  const size = 1 << Math.ceil(Math.log2(x.length));
  const m = magnitudeSpectrum(x, size);
  let best = 1;
  for (let k = 2; k < m.length; k++) if (m[k]! > m[best]!) best = k;
  return (best * rate) / size;
}

describe('fft', () => {
  it('round-trips and finds a sine in the right bin', () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const orig = Array.from(
      { length: n },
      (_, i) => Math.sin((2 * Math.PI * 50 * i) / n) + 0.3 * Math.cos((2 * Math.PI * 7 * i) / n),
    );
    orig.forEach((v, i) => (re[i] = v));
    fft(re, im, false);
    const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]!));
    expect(mag.indexOf(Math.max(...mag.slice(0, 512)))).toBe(50);
    fft(re, im, true);
    orig.forEach((v, i) => expect(re[i]).toBeCloseTo(v, 9));
  });

  it('convolution matches direct convolution, also across block boundaries', () => {
    const r = rng();
    const x = white(40000, r); // longer than two blocks
    const h = white(300, r);
    const ir = { l: h, r: h.slice().reverse(), rate: RATE };
    const [yl, yr] = convolveStereo(x, ir, 1);
    for (const i of [0, 5, 299, 300, 16383, 16384, 16500, 32767, 39999, 40100]) {
      let dl = 0;
      let dr = 0;
      for (let k = 0; k < h.length; k++) {
        const xi = x[i - k];
        if (xi === undefined) continue;
        dl += xi * ir.l[k]!;
        dr += xi * ir.r[k]!;
      }
      expect(yl[i]).toBeCloseTo(dl, 3);
      expect(yr[i]).toBeCloseTo(dr, 3);
    }
  });
});

describe('filters and oscillators', () => {
  it('state-variable band-pass has unity gain at the centre and rejects far frequencies', () => {
    const gainAt = (f: number): number => {
      const x = osc('sine', RATE, RATE, f);
      const y = bandpass(x, RATE, 1000, 4);
      return rmsOf(y.subarray(4000)) / rmsOf(x.subarray(4000));
    };
    expect(gainAt(1000)).toBeGreaterThan(0.95);
    expect(gainAt(1000)).toBeLessThan(1.05);
    expect(gainAt(250)).toBeLessThan(0.25);
    expect(gainAt(4000)).toBeLessThan(0.25);
  });

  it('low-pass attenuates above the cutoff, high-pass below it, and time-varying cutoffs stay stable', () => {
    const hi = osc('sine', RATE, RATE, 4000);
    const lo = osc('sine', RATE, RATE, 100);
    expect(rmsOf(lowpass(hi, RATE, 500).subarray(2000))).toBeLessThan(0.05);
    expect(rmsOf(svf(lo, RATE, 'hp', 1000).subarray(2000))).toBeLessThan(0.05);
    const swept = svf(white(RATE, rng()), RATE, 'lp', (i) => 50 + (i / RATE) * 6000, 2);
    expect(peakOf(swept)).toBeLessThan(10);
    expect(Array.from(swept).every(Number.isFinite)).toBe(true);
  });

  it('oscillators produce the requested pitch', () => {
    for (const wave of ['sine', 'saw', 'square', 'tri'] as const) {
      expect(Math.abs(peakHz(osc(wave, 8192, RATE, 440)) - 440), wave).toBeLessThan(5);
    }
    const glide = osc('sine', RATE, RATE, (t) => 200 + 400 * t); // 200 -> 600 Hz
    expect(peakHz(glide.subarray(0, 2000))).toBeLessThan(peakHz(glide.subarray(14000)));
  });

  it('saturate stays within +/-1 and envelope interpolates geometrically', () => {
    const x = Float32Array.from({ length: 100 }, (_, i) => (i - 50) / 5);
    expect(peakOf(saturate(x, 4))).toBeLessThanOrEqual(1);
    const env = envelope(1000, 1000, [
      [0, 1],
      [1, 0.01],
    ]);
    expect(env[500]).toBeCloseTo(0.1, 1);
  });

  it('resample changes length and pitch', () => {
    const x = osc('sine', 8000, RATE, 400);
    const y = resample(x, 2);
    expect(y.length).toBeLessThan(x.length * 0.51);
    expect(Math.abs(peakHz(y) - 800)).toBeLessThan(10);
  });
});

describe('loops, tracks and reverb', () => {
  it('loopify makes the end continue into the start', () => {
    const r = rng();
    const long = svf(white(RATE * 2 + 3200, r), RATE, 'lp', 800);
    const [l] = loopify(long, long, 3200);
    expect(l.length).toBe(RATE * 2);
    // out[last] -> out[0] is an ordinary step of the source signal
    expect(Math.abs(l[0]! - long[RATE * 2]!)).toBe(0);
    expect(Math.abs(l[l.length - 1]! - l[0]!)).toBeLessThan(0.5);
  });

  it('track panning is equal-power and clips out-of-range adds', () => {
    const t = new Track(1000, 0.1);
    t.add(new Float32Array(500).fill(0.5), 0.05, 1, -1);
    expect(t.l[60]).toBeCloseTo(0.5 * Math.SQRT2 * Math.cos(0), 5);
    expect(t.r[60]).toBeCloseTo(0, 5);
    const c = new Track(1000, 0.1).add(new Float32Array(10).fill(1), 0, 1, 0);
    expect(c.l[0]).toBeCloseTo(1, 5);
    expect(c.r[0]).toBeCloseTo(1, 5);
  });

  it('synthesised impulse is unit-energy, decays and differs between channels', () => {
    const ir = makeImpulse(RATE, { rt60: 0.8, seed: 'test' });
    const energy = (x: Float32Array, a: number, b: number): number => {
      let e = 0;
      for (let i = Math.floor(a * x.length); i < Math.floor(b * x.length); i++) e += x[i]! * x[i]!;
      return e;
    };
    expect(energy(ir.l, 0, 1)).toBeCloseTo(1, 3);
    expect(energy(ir.l, 0, 0.25)).toBeGreaterThan(energy(ir.l, 0.75, 1) * 20);
    expect(ir.l).not.toEqual(ir.r);
  });

  it('hashSeed is stable and distinguishes names', () => {
    expect(hashSeed('explosion_1')).toBe(hashSeed('explosion_1'));
    expect(hashSeed('explosion_1')).not.toBe(hashSeed('explosion_2'));
  });
});

describe('formant voice', () => {
  it('puts energy near the formants of the vowel and is deterministic', () => {
    const mk = (v: 'a' | 'i') =>
      formantVoice({
        rate: RATE,
        seconds: 0.5,
        f0: 130,
        vowels: [
          [0, v],
          [1, v],
        ],
        rng: createRand(3),
        breath: 0.05,
        resonance: 1.2,
        vibrato: 0,
      });
    const a = mk('a');
    const i = mk('i');
    expect(a).toEqual(mk('a'));
    const band = (x: Float32Array, lo: number, hi: number): number =>
      rmsOf(svf(svf(x, RATE, 'hp', lo), RATE, 'lp', hi));
    // /a/ has strong F1 (~730) and weak 250-350 Hz; /i/ the opposite
    expect(band(a, 600, 900)).toBeGreaterThan(band(a, 250, 350) * 1.5);
    expect(band(i, 250, 350)).toBeGreaterThan(band(i, 600, 900));
  });
});
