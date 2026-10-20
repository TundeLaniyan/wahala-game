/**
 * Pure DSP primitives (no Web Audio, no DOM, no Math.random). Everything here works on plain
 * Float32Arrays so the very same code renders the sound bank in the browser and in Node (tests and
 * `tools/audio`). All sounds produced with it are SYNTHESISED, not recordings.
 */

export type Rng = () => number;

export const TAU = Math.PI * 2;

export const clampN = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => 20 * Math.log10(Math.max(1e-9, g));
/** Semitone offset -> frequency ratio. */
export const st = (n: number): number => Math.pow(2, n / 12);
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const samples = (rate: number, seconds: number): number => Math.max(1, Math.round(rate * seconds));
/** Random float in [lo, hi). */
export const between = (rng: Rng, lo: number, hi: number): number => lo + (hi - lo) * rng();
export const pick = <T>(rng: Rng, xs: readonly T[]): T =>
  xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]!;
/** Roughly gaussian (sum of 3 uniforms), range about -1..1. */
export const gauss = (rng: Rng): number => (rng() + rng() + rng() - 1.5) / 1.5;

/** FNV-1a hash of a string to a 32-bit seed (so each sound id gets a stable, distinct seed). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ------------------------------------------------------------------------------------ stereo track

/** A stereo sound under construction. */
export class Track {
  readonly l: Float32Array;
  readonly r: Float32Array;
  constructor(
    readonly rate: number,
    seconds: number,
  ) {
    const n = samples(rate, seconds);
    this.l = new Float32Array(n);
    this.r = new Float32Array(n);
  }
  get length(): number {
    return this.l.length;
  }
  get seconds(): number {
    return this.l.length / this.rate;
  }
  /** Mix a mono signal in at `at` seconds with equal-power panning (-1..1). Out-of-range is clipped. */
  add(x: Float32Array, at = 0, gain = 1, pan = 0): this {
    const p = (clampN(pan, -1, 1) + 1) * 0.25 * Math.PI;
    return this.addLR(x, x, at, gain * Math.cos(p) * Math.SQRT2, gain * Math.sin(p) * Math.SQRT2);
  }
  /** Mix a stereo pair in with separate channel gains. */
  addLR(xl: Float32Array, xr: Float32Array, at = 0, gl = 1, gr = gl): this {
    const o = Math.round(at * this.rate);
    const n = Math.min(xl.length, this.length - o);
    for (let i = Math.max(0, -o); i < n; i++) {
      this.l[o + i]! += xl[i]! * gl;
      this.r[o + i]! += xr[i]! * gr;
    }
    return this;
  }
  /** Mix another track in. */
  addTrack(t: Track, at = 0, gain = 1): this {
    return this.addLR(t.l, t.r, at, gain);
  }
  /** Multiply the whole track by a gain or envelope. */
  scale(g: number | Float32Array): this {
    for (let i = 0; i < this.length; i++) {
      const k = typeof g === 'number' ? g : (g[i] ?? 0);
      this.l[i]! *= k;
      this.r[i]! *= k;
    }
    return this;
  }
  peak(): number {
    return Math.max(peakOf(this.l), peakOf(this.r));
  }
  rms(): number {
    let s = 0;
    for (let i = 0; i < this.length; i++) s += this.l[i]! * this.l[i]! + this.r[i]! * this.r[i]!;
    return Math.sqrt(s / (2 * this.length));
  }
}

export function peakOf(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]!);
    if (a > p) p = a;
  }
  return p;
}

export function rmsOf(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, x.length));
}

// ------------------------------------------------------------------------------------ noise

export function white(n: number, rng: Rng): Float32Array {
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = rng() * 2 - 1;
  return o;
}

/** Pink-ish noise (Paul Kellet's filter), roughly unit-peak. */
export function pink(n: number, rng: Rng): Float32Array {
  const o = new Float32Array(n);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.18;
    b6 = w * 0.115926;
  }
  return o;
}

/** Brown (random-walk, leaky) noise, normalised to roughly unit peak. */
export function brown(n: number, rng: Rng): Float32Array {
  const o = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = 0.985 * v + (rng() * 2 - 1) * 0.12;
    o[i] = v;
  }
  return normalize(o, 0.9);
}

// ------------------------------------------------------------------------------------ oscillators

export type Wave = 'sine' | 'saw' | 'square' | 'tri';
/** Frequency in Hz as a constant or as a function of time in seconds. */
export type Freq = number | ((t: number) => number);

const polyblep = (t: number, dt: number): number => {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
};

/** Band-limited (PolyBLEP) oscillator with optional frequency modulation function. */
export function osc(wave: Wave, n: number, rate: number, freq: Freq, phase0 = 0, pw = 0.5): Float32Array {
  const o = new Float32Array(n);
  let p = phase0 - Math.floor(phase0);
  let tri = 0;
  for (let i = 0; i < n; i++) {
    const f = typeof freq === 'number' ? freq : freq(i / rate);
    const dt = clampN(f / rate, 1e-6, 0.45);
    switch (wave) {
      case 'sine':
        o[i] = Math.sin(TAU * p);
        break;
      case 'saw':
        o[i] = 2 * p - 1 - polyblep(p, dt);
        break;
      case 'square': {
        let y = p < pw ? 1 : -1;
        y += polyblep(p, dt);
        y -= polyblep((p - pw + 1) % 1, dt);
        o[i] = y;
        break;
      }
      case 'tri': {
        let y = p < 0.5 ? 1 : -1;
        y += polyblep(p, dt);
        y -= polyblep((p + 0.5) % 1, dt);
        tri = dt * 4 * y + (1 - 0.0005) * tri; // leaky integral of band-limited square
        o[i] = tri;
        break;
      }
    }
    p += dt;
    if (p >= 1) p -= 1;
  }
  return o;
}

/** Sum of sine partials with an optional shared frequency function (a cheap additive voice). */
export function additive(
  n: number,
  rate: number,
  f0: Freq,
  partials: readonly { ratio: number; amp: number; decay?: number }[],
): Float32Array {
  const o = new Float32Array(n);
  for (const p of partials) {
    let ph = 0;
    const decay = p.decay ?? 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const f = (typeof f0 === 'number' ? f0 : f0(t)) * p.ratio;
      ph += f / rate;
      if (f < rate * 0.48) o[i]! += Math.sin(TAU * ph) * p.amp * (decay > 0 ? Math.exp(-t * decay) : 1);
    }
  }
  return o;
}

// ------------------------------------------------------------------------------------ envelopes

/**
 * Piecewise envelope through `[time, value]` points. Segments between two positive values are
 * geometric (exponential-feeling decays); otherwise linear. Held flat outside the point range.
 */
export function envelope(n: number, rate: number, pts: readonly (readonly [number, number])[]): Float32Array {
  const o = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    while (k < pts.length - 1 && t >= pts[k + 1]![0]) k++;
    const a = pts[k]!;
    const b = pts[Math.min(k + 1, pts.length - 1)]!;
    if (t <= a[0] || b[0] <= a[0]) o[i] = a[1];
    else if (t >= b[0]) o[i] = b[1];
    else {
      const u = (t - a[0]) / (b[0] - a[0]);
      o[i] = a[1] > 0 && b[1] > 0 ? a[1] * Math.pow(b[1] / a[1], u) : a[1] + (b[1] - a[1]) * u;
    }
  }
  return o;
}

/** Attack (linear) + exponential decay with time constant `tau` seconds. */
export function decayEnv(n: number, rate: number, attack: number, tau: number): Float32Array {
  const o = new Float32Array(n);
  const a = Math.max(1, Math.round(attack * rate));
  for (let i = 0; i < n; i++) o[i] = (i < a ? i / a : 1) * Math.exp(-(i / rate) / tau);
  return o;
}

/** Raised-cosine in/out window of `fi` and `fo` seconds (rest = 1). */
export function window(n: number, rate: number, fi: number, fo: number): Float32Array {
  const o = new Float32Array(n).fill(1);
  const a = Math.min(n, Math.round(fi * rate));
  const b = Math.min(n, Math.round(fo * rate));
  for (let i = 0; i < a; i++) o[i] = 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < b; i++) o[n - 1 - i]! *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
  return o;
}

export function mul(x: Float32Array, env: Float32Array): Float32Array {
  const n = Math.min(x.length, env.length);
  for (let i = 0; i < n; i++) x[i]! *= env[i]!;
  return x;
}

export function gainInPlace(x: Float32Array, g: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i]! *= g;
  return x;
}

export function sumInto(dst: Float32Array, src: Float32Array, at = 0, g = 1): Float32Array {
  const o = Math.round(at);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i]! += src[i]! * g;
  return dst;
}

export function normalize(x: Float32Array, peak = 0.9): Float32Array {
  const p = peakOf(x);
  return p > 1e-9 ? gainInPlace(x, peak / p) : x;
}

/** tanh soft saturation; `drive` > 1 = more harmonics. Output stays within +/-1. */
export function saturate(x: Float32Array, drive = 2): Float32Array {
  const k = 1 / Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i]! * drive) * k * 0.999;
  return x;
}

/** Hard-clip-free soft limiter for a final safety net (smooth knee above `ceil`). */
export function softLimit(x: Float32Array, ceil = 0.95): Float32Array {
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const a = Math.abs(v);
    if (a > ceil * 0.7) {
      const over = (a - ceil * 0.7) / (ceil * 0.3);
      x[i] = Math.sign(v) * (ceil * 0.7 + ceil * 0.3 * Math.tanh(over));
    }
  }
  return x;
}

/** Linear-interpolation resample by `ratio` (>1 = higher pitch, shorter). */
export function resample(x: Float32Array, ratio: number): Float32Array {
  const n = Math.max(1, Math.floor((x.length - 1) / ratio));
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const j = Math.floor(p);
    const f = p - j;
    o[i] = x[j]! * (1 - f) + (x[j + 1] ?? x[j]!) * f;
  }
  return o;
}

/** Simple delay (zero-padded). */
export function delay(x: Float32Array, nSamples: number): Float32Array {
  const o = new Float32Array(x.length);
  const d = Math.max(0, Math.round(nSamples));
  for (let i = d; i < x.length; i++) o[i] = x[i - d]!;
  return o;
}

// ------------------------------------------------------------------------------------ filters

export type FilterMode = 'lp' | 'hp' | 'bp' | 'notch';
/** Constant or per-sample cutoff in Hz. */
export type Cutoff = number | Float32Array | ((i: number) => number);

const CTRL = 16; // coefficient update interval (samples) for time-varying cutoffs

/**
 * Zavalishin TPT state-variable filter (stable under fast modulation). Band-pass has UNITY gain at
 * the centre frequency. Returns a new array unless `inPlace`.
 */
export function svf(
  x: Float32Array,
  rate: number,
  mode: FilterMode,
  cutoff: Cutoff,
  q = 0.707,
  inPlace = false,
): Float32Array {
  const n = x.length;
  const out = inPlace ? x : new Float32Array(n);
  const k = 1 / Math.max(0.05, q);
  let ic1 = 0;
  let ic2 = 0;
  let a1 = 0,
    a2 = 0,
    a3 = 0;
  const coeffs = (fc: number): void => {
    const g = Math.tan((Math.PI * clampN(fc, 8, rate * 0.46)) / rate);
    a1 = 1 / (1 + g * (g + k));
    a2 = g * a1;
    a3 = g * a2;
  };
  const constant = typeof cutoff === 'number';
  if (constant) coeffs(cutoff);
  for (let i = 0; i < n; i++) {
    if (!constant && i % CTRL === 0) {
      coeffs(typeof cutoff === 'function' ? cutoff(i) : (cutoff[Math.min(i, cutoff.length - 1)] ?? 1000));
    }
    const v0 = x[i]!;
    const v3 = v0 - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    let y: number;
    switch (mode) {
      case 'lp':
        y = v2;
        break;
      case 'bp':
        y = k * v1;
        break;
      case 'hp':
        y = v0 - k * v1 - v2;
        break;
      default:
        y = v0 - k * v1;
    }
    out[i] = y;
  }
  return out;
}

export const lowpass = (x: Float32Array, rate: number, fc: Cutoff, q = 0.707): Float32Array =>
  svf(x, rate, 'lp', fc, q);
export const highpass = (x: Float32Array, rate: number, fc: Cutoff, q = 0.707): Float32Array =>
  svf(x, rate, 'hp', fc, q);
export const bandpass = (x: Float32Array, rate: number, fc: Cutoff, q = 1): Float32Array =>
  svf(x, rate, 'bp', fc, q);

/** Exponential cutoff sweep helper: returns f(i) going from `f0` to `f1` over `n` samples. */
export function sweep(f0: number, f1: number, n: number): (i: number) => number {
  const r = Math.log(f1 / f0);
  return (i) => f0 * Math.exp((r * Math.min(i, n)) / n);
}

/** Remove DC / sub-sonic drift with a 1-pole high-pass (default 18 Hz). */
export function dcBlock(x: Float32Array, rate: number, fc = 18): Float32Array {
  const a = Math.exp((-TAU * fc) / rate);
  let px = 0;
  let py = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    py = v - px + a * py;
    px = v;
    x[i] = py;
  }
  return x;
}

// ------------------------------------------------------------------------------------ loops

/**
 * Make `x` (length L + X) seamless as a loop of length L by cross-fading its last X samples into
 * its first X samples (equal-power). After this `out[L-1] -> out[0]` continues smoothly because
 * `out[0]` equals the signal that originally followed `out[L-1]`.
 */
export function loopify(
  xl: Float32Array,
  xr: Float32Array,
  fadeSamples: number,
): [Float32Array, Float32Array] {
  const X = Math.min(fadeSamples, Math.floor(xl.length / 3));
  const L = xl.length - X;
  const fix = (x: Float32Array): Float32Array => {
    const o = x.slice(0, L);
    for (let i = 0; i < X; i++) {
      const u = i / X; // 0 -> start of loop (use the tail), 1 -> use the head
      o[i] = x[i]! * Math.sin((u * Math.PI) / 2) + x[L + i]! * Math.cos((u * Math.PI) / 2);
    }
    return o;
  };
  return [fix(xl), fix(xr)];
}
