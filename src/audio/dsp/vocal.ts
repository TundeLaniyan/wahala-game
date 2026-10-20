/**
 * Formant-synthesised "group voices" for crowd sounds. A source (band-limited saw with vibrato and
 * jitter, plus breath noise) is shaped by four parallel band-pass formants that glide between
 * vowels (a, o, e, i, u). Many such voices with random pitch, vowel, pan and timing offset sum to
 * a crowd-like "walla". This is NOT speech and NOT a recording: it makes vowel-like wordless
 * vocalisations only. Any "language" flavour comes from the text captions elsewhere.
 */
import { TAU, between, bandpass, clampN, mul, osc, pick, svf, white } from './core';
import type { Freq, Rng } from './core';

export type Vowel = 'a' | 'o' | 'e' | 'i' | 'u';

/** Rough adult-male formant centres (Hz) for F1..F4; scaled up for higher voices. */
const FORMANTS: Record<Vowel, readonly [number, number, number, number]> = {
  a: [730, 1090, 2440, 3400],
  o: [570, 840, 2410, 3300],
  e: [530, 1840, 2480, 3400],
  i: [290, 2250, 2950, 3500],
  u: [320, 800, 2250, 3200],
};
const AMPS = [1, 0.62, 0.3, 0.16] as const;

export type VowelKey = readonly [number, Vowel];

export interface VoiceSpec {
  rate: number;
  seconds: number;
  /** Fundamental (Hz) over time (seconds). */
  f0: Freq;
  /** Vowel keyframes as [0..1 position through the sound, vowel]. */
  vowels: readonly VowelKey[];
  /** Amplitude envelope (length must equal the sample count) or undefined for a flat one. */
  env?: Float32Array;
  /** 0..1 amount of aspiration noise in the source. */
  breath?: number;
  /** Vibrato depth in semitones (default 0.25) and rate (Hz, default 5.5). */
  vibrato?: number;
  vibRate?: number;
  /** Formant scale: 1 = adult male, ~1.17 female, ~1.35 child. */
  shift?: number;
  /** Larger = more resonant/tonal; smaller = breathier/blurrier (default 1). */
  resonance?: number;
  rng: Rng;
}

/** F1..F4 (Hz) at position `u` (0..1) of a vowel keyframe track. */
export function vowelFormants(keys: readonly VowelKey[], u: number, shift = 1): Float64Array {
  const out = new Float64Array(4);
  vowelAt(keys, u, shift, out);
  return out;
}

function vowelAt(keys: readonly VowelKey[], u: number, shift: number, out: Float64Array): void {
  let k = 0;
  while (k < keys.length - 1 && u >= keys[k + 1]![0]) k++;
  const a = keys[k]!;
  const b = keys[Math.min(k + 1, keys.length - 1)]!;
  const span = b[0] - a[0];
  const w = span > 1e-6 ? clampN((u - a[0]) / span, 0, 1) : 0;
  const s = w * w * (3 - 2 * w); // smoothstep glide
  const fa = FORMANTS[a[1]];
  const fb = FORMANTS[b[1]];
  for (let i = 0; i < 4; i++) out[i] = (fa[i]! * (1 - s) + fb[i]! * s) * shift;
}

/** One formant-filtered vocal voice (mono). */
export function formantVoice(s: VoiceSpec): Float32Array {
  const n = Math.max(1, Math.round(s.rate * s.seconds));
  const { rate, rng } = s;
  const shift = s.shift ?? 1;
  const vibDepth = s.vibrato ?? 0.25;
  const vibRate = s.vibRate ?? 5.5;
  const vibPhase = rng() * TAU;
  const jitterPhase = rng() * TAU;
  const f0 = s.f0;
  const src = osc(
    'saw',
    n,
    rate,
    (t) => {
      const base = typeof f0 === 'number' ? f0 : f0(t);
      const vib =
        Math.sin(TAU * vibRate * t + vibPhase) * vibDepth + Math.sin(TAU * 13.1 * t + jitterPhase) * 0.05;
      return base * Math.pow(2, vib / 12);
    },
    rng(),
  );
  const breath = s.breath ?? 0.12;
  if (breath > 0) {
    const nz = white(n, rng);
    for (let i = 0; i < n; i++) src[i] = src[i]! * (1 - breath * 0.5) + nz[i]! * breath;
  }
  // per-control-step formant tracks (shared by the four band-passes)
  const tracks = [0, 1, 2, 3].map(() => new Float32Array(n));
  const tmp = new Float64Array(4);
  for (let i = 0; i < n; i += 16) {
    vowelAt(s.vowels, i / n, shift, tmp);
    const end = Math.min(n, i + 16);
    for (let j = i; j < end; j++) for (let f = 0; f < 4; f++) tracks[f]![j] = tmp[f]!;
  }
  const out = new Float32Array(n);
  const res = s.resonance ?? 1;
  for (let f = 0; f < 4; f++) {
    const q = (f === 0 ? 5 : f === 1 ? 7 : 9) * res;
    const y = bandpass(src, rate, tracks[f]!, q);
    const a = AMPS[f]!;
    for (let i = 0; i < n; i++) out[i]! += y[i]! * a;
  }
  return s.env ? mul(out, s.env) : out;
}

/** Pitch ranges (Hz) for typical crowd members. */
export const PITCH = {
  man: [95, 150],
  woman: [180, 270],
  child: [260, 380],
} as const;

export interface CrowdMember {
  /** Fundamental in Hz. */
  f0: number;
  /** Formant scale (male 1.0 .. child 1.35). */
  shift: number;
  /** Stereo position -1..1. */
  pan: number;
}

/** Random crowd members: ~55% men, 35% women, 10% children. */
export function crowdMembers(rng: Rng, count: number, lowBias = 0): CrowdMember[] {
  const out: CrowdMember[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng();
    const kind = r < 0.55 + lowBias ? 'man' : r < 0.9 ? 'woman' : 'child';
    const [lo, hi] = PITCH[kind];
    out.push({
      f0: between(rng, lo, hi),
      shift:
        kind === 'man'
          ? between(rng, 0.95, 1.08)
          : kind === 'woman'
            ? between(rng, 1.13, 1.24)
            : between(rng, 1.3, 1.42),
      pan: between(rng, -0.95, 0.95),
    });
  }
  return out;
}

export const randomVowel = (rng: Rng): Vowel => pick(rng, ['a', 'a', 'o', 'e', 'i', 'u'] as const);

/** Breathy inhale/"gasp" noise burst: band-pass noise sweeping upward. */
export function gaspNoise(rate: number, seconds: number, rng: Rng, f0 = 700, f1 = 2100): Float32Array {
  const n = Math.round(rate * seconds);
  const nz = white(n, rng);
  const sweepFn = (i: number): number => f0 * Math.pow(f1 / f0, i / n);
  const y = svf(nz, rate, 'bp', sweepFn, 1.4);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    y[i]! *= Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 1.5);
  }
  return y;
}
