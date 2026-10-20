/**
 * Crowd reaction one-shots and the looping ambience beds.
 *
 * ALL of this is SYNTHESISED from formant-filtered oscillators, filtered noise and synthetic
 * handclaps/whistles. It is a stand-in "crowd texture", not a recording of any real crowd, and it is
 * not meant to sound like any particular nationality. Real recordings can replace every sound id
 * here through the sample slots (see ../samples.ts and public/audio/README.md).
 */
import {
  Track,
  between,
  brown,
  clampN,
  envelope,
  gauss,
  lowpass,
  mul,
  pick,
  pink,
  resample,
  bandpass,
  loopify,
  rmsOf,
  st,
  TAU,
  gainInPlace,
  svf,
} from '../dsp/core';
import type { Rng } from '../dsp/core';
import { crowdMembers, formantVoice, gaspNoise, randomVowel, vowelFormants } from '../dsp/vocal';
import type { CrowdMember, VowelKey } from '../dsp/vocal';
import { Priority } from '../voices';
import { addReverb, addReverbSteps, addWrappedReverb, clap, engine, horn, len, nburst, whistle } from './kit';
import { loop, oneShot, simple } from './types';

// ------------------------------------------------------------------------------------ helpers

/** Add into a looping track with wrap-around, so overlaps past the end continue at the start. */
function addWrapped(t: Track, x: Float32Array, atSec: number, gain: number, pan: number): void {
  const o = Math.round(atSec * t.rate) % t.length;
  const p = (clampN(pan, -1, 1) + 1) * 0.25 * Math.PI;
  const gl = gain * Math.cos(p) * Math.SQRT2;
  const gr = gain * Math.sin(p) * Math.SQRT2;
  for (let i = 0; i < x.length; i++) {
    const j = (o + i) % t.length;
    t.l[j]! += x[i]! * gl;
    t.r[j]! += x[i]! * gr;
  }
}

function scaleToRms(t: Track, target: number): Track {
  const r = Math.max(1e-9, (rmsOf(t.l) + rmsOf(t.r)) / 2);
  gainInPlace(t.l, target / r);
  gainInPlace(t.r, target / r);
  return t;
}

interface ChoirSpec {
  track: Track;
  rng: Rng;
  voices: number;
  /** Window (seconds from `at`) in which voices begin. */
  onset: readonly [number, number];
  dur: readonly [number, number];
  vowels: readonly VowelKey[];
  /** Pitch contour in semitones against the voice's own 0..1 progress. */
  contour: (u: number) => number;
  attack: number;
  release: number;
  breath?: number;
  resonance?: number;
  pitchScale?: number;
  lowBias?: number;
  level?: number;
  at?: number;
  /** Level (0..1) of an extra formant-filtered noise "wash" underneath, like a big shouting crowd. Default 0.3. */
  wash?: number;
}

/** Sums many randomised formant voices into the track (a wordless group vocalisation). */
function* choir(s: ChoirSpec): Generator<void> {
  const members = crowdMembers(s.rng, s.voices, s.lowBias ?? 0);
  for (const m of members) {
    const d = between(s.rng, s.dur[0], s.dur[1]);
    const n = len(s.track.rate, d);
    const a = Math.min(s.attack * between(s.rng, 0.8, 1.3), d * 0.4);
    const r = Math.min(s.release * between(s.rng, 0.8, 1.3), d * 0.5);
    const env = envelope(n, s.track.rate, [
      [0, 0],
      [a, 1],
      [d - r, 0.8],
      [d, 0],
    ]);
    const drift = gauss(s.rng) * 0.35;
    const v = formantVoice({
      rate: s.track.rate,
      seconds: d,
      f0: (t) => m.f0 * (s.pitchScale ?? 1) * st(s.contour(t / d) + drift),
      vowels: jitterVowels(s.vowels, s.rng),
      env,
      breath: s.breath ?? 0.25,
      resonance: s.resonance ?? 0.8,
      shift: m.shift,
      rng: s.rng,
    });
    const at = (s.at ?? 0) + between(s.rng, s.onset[0], s.onset[1]);
    s.track.add(v, at, (s.level ?? 1) * between(s.rng, 0.55, 1), m.pan);
    yield;
  }
  // The wash: shouting is aspirated, and dozens of voices blur into a noisy formant-shaped hiss.
  const wash = s.wash ?? 0.3;
  if (wash > 0) {
    const dur = s.onset[1] + s.dur[1] * 0.9;
    const n = len(s.track.rate, dur);
    const env = envelope(n, s.track.rate, [
      [0, 0],
      [s.onset[1] + s.attack, 1],
      [dur - s.release, 0.7],
      [dur, 0],
    ]);
    for (const ch of [0, 1]) {
      let x: Float32Array = pink(n, s.rng);
      x = svf(x, s.track.rate, 'bp', (i) => vowelFormants(s.vowels, i / n, 1.05)[1]!, 0.8);
      const y = svf(pink(n, s.rng), s.track.rate, 'bp', (i) => vowelFormants(s.vowels, i / n, 1.05)[0]!, 0.9);
      for (let i = 0; i < n; i++) x[i] = (x[i]! * 0.7 + y[i]! * 1.0) * env[i]!;
      const w = ch === 0 ? s.track.l : s.track.r;
      const o = Math.round((s.at ?? 0) * s.track.rate);
      for (let i = 0; i < n && o + i < w.length; i++) w[o + i]! += x[i]! * wash * (s.level ?? 1) * 1.1;
    }
    yield;
  }
}

const jitterVowels = (keys: readonly VowelKey[], rng: Rng): VowelKey[] =>
  keys.map(([u, v], i) => [clampN(u + (i === 0 ? 0 : gauss(rng) * 0.06), 0, 1), v]);

/** Applause: `count` claps spread over `dur` seconds with a swelling/falling density. */
function clapBurst(t: Track, rng: Rng, at: number, dur: number, count: number, level: number): void {
  for (let k = 0; k < count; k++) {
    const u = rng();
    // density: quick rise, long sustain, tail-off
    const pos = Math.pow(u, 0.85) * dur;
    const fall = pos > dur * 0.65 ? 1 - (pos - dur * 0.65) / (dur * 0.35) : 1;
    if (rng() > fall) continue;
    const c = clap(t.rate, rng, between(rng, 1100, 2400));
    t.add(c, at + pos, level * between(rng, 0.35, 1), between(rng, -0.9, 0.9));
  }
}

// ------------------------------------------------------------------------------------ one-shots

const R = 16000;
const REACT = { bus: 'react', rate: R, priority: Priority.normal } as const;

const cheerContour = (u: number): number => (u < 0.3 ? (u / 0.3) * 2.5 : 2.5 - (u - 0.3) * 3.2);

export const crowdOneShots = {
  /** "yeah-aah": rising vowel glide /i e a/. */
  crowd_cheer_1: oneShot({
    ...REACT,
    gain: 0.9,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3.2);
      yield* choir({
        track: t,
        rng,
        voices: 20,
        onset: [0, 0.22],
        dur: [1.0, 1.5],
        attack: 0.12,
        release: 0.5,
        vowels: [
          [0, 'i'],
          [0.16, 'e'],
          [0.42, 'a'],
          [1, 'a'],
        ],
        contour: cheerContour,
      });
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  }),
  /** "wooo": rounded vowel, rising pitch. */
  crowd_cheer_2: oneShot({
    ...REACT,
    gain: 0.9,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3.2);
      yield* choir({
        track: t,
        rng,
        voices: 18,
        onset: [0, 0.3],
        dur: [1.1, 1.7],
        attack: 0.18,
        release: 0.55,
        vowels: [
          [0, 'u'],
          [0.3, 'o'],
          [1, 'o'],
        ],
        contour: (u) => Math.min(1, u * 3) * 4 - u,
      });
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  }),
  /** Bigger, longer cheer with applause and a couple of whistles. */
  crowd_cheer_big: oneShot({
    ...REACT,
    gain: 1,
    priority: Priority.big,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 4.4);
      yield* choir({
        track: t,
        rng,
        voices: 34,
        onset: [0, 0.35],
        dur: [1.5, 2.4],
        attack: 0.14,
        release: 0.7,
        vowels: [
          [0, 'i'],
          [0.14, 'e'],
          [0.4, 'a'],
          [1, 'a'],
        ],
        contour: cheerContour,
        pitchScale: 1.05,
      });
      clapBurst(t, rng, 0.5, 2.2, 60, 0.22);
      t.add(whistle(rate, 0.55, rng, 2000, 3200), 0.35, 0.16, -0.4);
      t.add(whistle(rate, 0.4, rng, 2600, 3500), 0.9, 0.12, 0.5);
      yield;
      return yield* addReverbSteps(t, 'hall', 0.3);
    },
  }),
  /** "ooooh": the sharp-intake-then-awe reaction to a near miss or a spectacular hit. */
  crowd_ooh: oneShot({
    ...REACT,
    gain: 0.9,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3.0);
      t.add(gaspNoise(rate, 0.22, rng, 600, 1600), 0, 0.5, 0);
      yield* choir({
        track: t,
        rng,
        voices: 18,
        onset: [0.08, 0.3],
        dur: [1.0, 1.5],
        attack: 0.2,
        release: 0.55,
        vowels: [
          [0, 'u'],
          [0.4, 'o'],
          [1, 'o'],
        ],
        contour: (u) => Math.sin(Math.PI * Math.min(1, u * 1.3)) * 3.2 - u * 1.5,
      });
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  }),
  /** Sharp collective intake of breath + a few startled "oh!" voices. */
  crowd_gasp: oneShot({
    ...REACT,
    gain: 0.85,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 1.8);
      for (let i = 0; i < 7; i++) {
        t.add(
          gaspNoise(rate, between(rng, 0.2, 0.34), rng, between(rng, 500, 900), between(rng, 1600, 2600)),
          between(rng, 0, 0.14),
          0.4,
          between(rng, -0.9, 0.9),
        );
        yield;
      }
      yield* choir({
        track: t,
        rng,
        voices: 9,
        onset: [0.05, 0.2],
        dur: [0.28, 0.5],
        attack: 0.04,
        release: 0.2,
        vowels: [
          [0, 'o'],
          [1, 'a'],
        ],
        contour: (u) => u * 3,
        breath: 0.3,
        level: 0.7,
      });
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  }),
  /** "awwww": falling, sympathetic groan. */
  crowd_groan: oneShot({
    ...REACT,
    gain: 0.95,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3.4);
      yield* choir({
        track: t,
        rng,
        voices: 18,
        onset: [0, 0.3],
        dur: [1.3, 2.0],
        attack: 0.15,
        release: 0.75,
        vowels: [
          [0, 'a'],
          [0.55, 'o'],
          [1, 'o'],
        ],
        contour: (u) => -u * 5.5,
        pitchScale: 0.92,
        lowBias: 0.15,
      });
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  }),
  /** Many overlapping "ha-ha-ha" bursts. Laughter-like, deliberately not intelligible. */
  crowd_laugh: oneShot({
    ...REACT,
    gain: 0.9,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 2.9);
      const members = crowdMembers(rng, 12, 0.1);
      for (const m of members) {
        const start = between(rng, 0, 0.35);
        const syll = 4 + Math.floor(rng() * 3);
        const gap = between(rng, 0.14, 0.2);
        for (let k = 0; k < syll; k++) {
          const d = 0.13;
          const fall = 1 - k * 0.07;
          const v = formantVoice({
            rate,
            seconds: d,
            rng,
            shift: m.shift,
            breath: 0.32,
            resonance: 0.8,
            f0: (tt) => m.f0 * 1.08 * fall * (1 - 0.12 * (tt / d)),
            vowels: [
              [0, 'a'],
              [1, 'e'],
            ],
            env: envelope(len(rate, d), rate, [
              [0, 0],
              [0.012, 1],
              [d * 0.55, 0.5],
              [d, 0],
            ]),
          });
          t.add(v, start + k * gap * between(rng, 0.92, 1.08), (0.45 + 0.55 * rng()) * (1 - k * 0.08), m.pan);
        }
        yield;
      }
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  }),
  /** Single wolf-whistle-style rise and fall (a lone crowd member). */
  crowd_whistle_1: oneShot({
    ...REACT,
    gain: 0.55,
    priority: Priority.ambient,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.6);
      t.add(whistle(rate, 0.3, rng, 1900, 3200, 5.5, 0.2), 0, 1, 0);
      t.add(whistle(rate, 0.32, rng, 3200, 2300, 6, 0.3), 0.3, 1, 0);
      return addReverb(t, 'yard', 0.25);
    }),
  }),
  /** Short sharp two-tone whistle. */
  crowd_whistle_2: oneShot({
    ...REACT,
    gain: 0.55,
    priority: Priority.ambient,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.3);
      t.add(whistle(rate, 0.13, rng, 2700, 2800, 0, 0), 0, 1, 0);
      t.add(whistle(rate, 0.42, rng, 3300, 3500, 7, 0.25), 0.17, 1, 0);
      return addReverb(t, 'yard', 0.25);
    }),
  }),
  /** Applause burst. */
  crowd_clap: oneShot({
    ...REACT,
    gain: 0.8,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3.4);
      clapBurst(t, rng, 0, 2.2, 90, 0.4);
      yield;
      return yield* addReverbSteps(t, 'yard', 0.35);
    },
  }),
  /** Excited short shout ("OH-oh!") for vehicle attacks and spectacular moments. */
  crowd_shout: oneShot({
    ...REACT,
    gain: 1,
    priority: Priority.big,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 2.2);
      yield* choir({
        track: t,
        rng,
        voices: 14,
        onset: [0, 0.12],
        dur: [0.5, 0.85],
        attack: 0.04,
        release: 0.28,
        vowels: [
          [0, 'o'],
          [0.4, 'a'],
          [1, 'a'],
        ],
        contour: (u) => (u < 0.3 ? u * 18 : 5.4 - (u - 0.3) * 8),
        lowBias: 0.25,
        breath: 0.1,
      });
      yield* choir({
        track: t,
        rng,
        voices: 8,
        onset: [0.35, 0.5],
        dur: [0.5, 0.9],
        attack: 0.05,
        release: 0.3,
        level: 0.8,
        vowels: [
          [0, 'e'],
          [0.3, 'a'],
          [1, 'o'],
        ],
        contour: (u) => 3 - u * 4,
      });
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  }),
  /** Big victory roar: a lot of voices, applause and whistles. */
  crowd_roar: oneShot({
    ...REACT,
    gain: 1.05,
    priority: Priority.jingle,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 6.0);
      yield* choir({
        track: t,
        rng,
        voices: 40,
        onset: [0, 0.5],
        dur: [2.2, 3.4],
        attack: 0.2,
        release: 1.0,
        vowels: [
          [0, 'a'],
          [0.4, 'a'],
          [1, 'o'],
        ],
        contour: (u) => 1.5 + Math.sin(u * 5) * 0.8,
        pitchScale: 1.04,
      });
      yield* choir({
        track: t,
        rng,
        voices: 16,
        onset: [0.1, 0.4],
        dur: [1.5, 2.2],
        attack: 0.1,
        release: 0.7,
        level: 0.7,
        vowels: [
          [0, 'i'],
          [0.2, 'e'],
          [0.5, 'a'],
          [1, 'a'],
        ],
        contour: cheerContour,
      });
      clapBurst(t, rng, 0.4, 3.4, 130, 0.28);
      for (const [at, f] of [
        [0.3, 2100],
        [0.8, 2700],
        [1.6, 3000],
      ] as const)
        t.add(whistle(rate, 0.5, rng, f, f * 1.35), at, 0.14, between(rng, -0.8, 0.8));
      yield;
      return yield* addReverbSteps(t, 'hall', 0.35);
    },
  }),
};

// ------------------------------------------------------------------------------------ ambience

/** Short vocal "syllable" templates that get resampled and scattered to form babble. */
function* grainBank(
  rate: number,
  rng: Rng,
  count: number,
  opts: { pitchScale: number; rise: number; durLo: number; durHi: number; resonance: number; breath: number },
): Generator<void, Float32Array[]> {
  const members: CrowdMember[] = crowdMembers(rng, count, 0.05);
  const out: Float32Array[] = [];
  for (const m of members) {
    const d = between(rng, opts.durLo, opts.durHi);
    const n = len(rate, d);
    const v1 = randomVowel(rng);
    const v2 = randomVowel(rng);
    const drift = gauss(rng) * 2 + opts.rise;
    out.push(
      formantVoice({
        rate,
        seconds: d,
        rng,
        shift: m.shift,
        breath: opts.breath,
        resonance: opts.resonance,
        vibrato: 0.35,
        f0: (t) => m.f0 * opts.pitchScale * st((drift * t) / d),
        vowels: [
          [0, v1],
          [0.55, v2],
          [1, v2],
        ],
        env: envelope(n, rate, [
          [0, 0],
          [Math.min(0.05, d * 0.25), 1],
          [d * 0.6, 0.7],
          [d, 0],
        ]),
      }),
    );
    yield;
  }
  return out;
}

/** Scatter babble grains with wrap-around placement. */
function* scatterGrains(
  t: Track,
  rng: Rng,
  bank: readonly Float32Array[],
  perSecond: number,
  level: number,
  seconds: number,
  mod: (atSec: number) => number,
): Generator<void> {
  const total = Math.round(perSecond * seconds);
  for (let k = 0; k < total; k++) {
    const at = rng() * seconds;
    const g = resample(pick(rng, bank), between(rng, 0.88, 1.16));
    const lvl = level * (0.25 + 0.75 * rng() * rng()) * mod(at);
    addWrapped(t, g, at, lvl, between(rng, -0.95, 0.95));
    if (k % 40 === 0) yield;
  }
}

/** A looping noise bed (pink noise through a vocal-ish band bank), made seamless by cross-fade. */
function murmurBed(
  rate: number,
  seconds: number,
  rng: Rng,
  am: (t: number) => number,
): [Float32Array, Float32Array] {
  const X = len(rate, 0.6);
  const n = len(rate, seconds) + X;
  const chans = [0, 1].map(() => {
    const src = pink(n, rng);
    const a = bandpass(src, rate, 480, 0.8);
    const b = bandpass(src, rate, 1450, 1.0);
    const c = bandpass(src, rate, 2700, 1.4);
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = (a[i]! + 0.55 * b[i]! + 0.22 * c[i]!) * am(i / rate);
    return o;
  });
  return loopify(chans[0]!, chans[1]!, X);
}

export const ambienceLoops = {
  /** General crowd murmur ("walla"): many overlapping vowel-like grains over a band-passed noise bed. */
  crowd_loop: loop({
    rmsDb: -18,
    rate: R,
    gain: 1,
    render: function* ({ rate, rng }) {
      const SEC = 12;
      const t = new Track(rate, SEC);
      const bank = yield* grainBank(rate, rng, 26, {
        pitchScale: 1,
        rise: 0,
        durLo: 0.16,
        durHi: 0.46,
        resonance: 0.55,
        breath: 0.22,
      });
      const p1 = rng() * TAU;
      const p2 = rng() * TAU;
      const slow = (at: number): number =>
        0.8 + 0.2 * Math.sin((TAU * 2 * at) / SEC + p1) + 0.12 * Math.sin((TAU * 5 * at) / SEC + p2);
      yield* scatterGrains(t, rng, bank, 26, 1, SEC, slow);
      scaleToRms(t, 0.1);
      const [ml, mr] = murmurBed(
        rate,
        SEC,
        rng,
        (tt) => 0.8 + 0.25 * Math.sin((TAU * 3 * tt) / SEC + p2) + 0.15 * Math.sin((TAU * 7 * tt) / SEC + p1),
      );
      const bed = new Track(rate, SEC);
      bed.addLR(ml, mr);
      scaleToRms(bed, 0.06);
      t.addTrack(bed);
      const rumble = lowpass(brown(len(rate, SEC) + len(rate, 0.6), rng), rate, 170, 0.7);
      const [rl, rr] = loopify(rumble, lowpass(brown(rumble.length, rng), rate, 170, 0.7), len(rate, 0.6));
      const rt = new Track(rate, SEC).addLR(rl, rr);
      scaleToRms(rt, 0.025);
      t.addTrack(rt);
      yield;
      return t;
    },
  }),

  /** Excited layer: denser, higher babble, handclaps, whistles and short cheer swells. */
  crowd_loop_hype: loop({
    rmsDb: -17,
    rate: R,
    gain: 1,
    render: function* ({ rate, rng }) {
      const SEC = 14;
      const babble = new Track(rate, SEC);
      const bank = yield* grainBank(rate, rng, 24, {
        pitchScale: 1.12,
        rise: 2.5,
        durLo: 0.14,
        durHi: 0.5,
        resonance: 0.8,
        breath: 0.16,
      });
      const p1 = rng() * TAU;
      const slow = (at: number): number => 0.75 + 0.25 * Math.sin((TAU * 3 * at) / SEC + p1);
      yield* scatterGrains(babble, rng, bank, 18, 1, SEC, slow);
      scaleToRms(babble, 0.1);

      // handclap clusters at irregular intervals
      const claps = new Track(rate, SEC);
      let at = rng() * 0.6;
      while (at < SEC) {
        const dur = between(rng, 0.4, 1.3);
        const per = between(rng, 5, 10);
        const centre = between(rng, -0.6, 0.6);
        const count = Math.round(dur * per * 3); // several people clapping near each other
        for (let k = 0; k < count; k++) {
          const when = at + Math.floor(rng() * dur * per) / per + gauss(rng) * 0.02;
          addWrapped(
            claps,
            clap(rate, rng, between(rng, 1100, 2500)),
            (when + SEC) % SEC,
            between(rng, 0.3, 1),
            centre + gauss(rng) * 0.35,
          );
        }
        at += dur + between(rng, 0.2, 1.6);
        yield;
      }
      scaleToRms(claps, 0.07);

      // whistles
      const wh = new Track(rate, SEC);
      for (let k = 0; k < 7; k++) {
        const f = between(rng, 2300, 3500);
        addWrapped(
          wh,
          whistle(
            rate,
            between(rng, 0.25, 0.9),
            rng,
            f,
            f * between(rng, 0.85, 1.3),
            between(rng, 4.5, 7),
            0.3,
          ),
          rng() * SEC,
          between(rng, 0.4, 1),
          between(rng, -0.9, 0.9),
        );
      }
      scaleToRms(wh, 0.02);

      // swells of collective "ooh"/"yeah"
      const sw = new Track(rate, SEC + 4);
      for (let k = 0; k < 3; k++) {
        yield* choir({
          track: sw,
          rng,
          voices: 9,
          at: (k + 0.3 + rng() * 0.4) * (SEC / 3),
          onset: [0, 0.3],
          dur: [0.8, 1.4],
          attack: 0.18,
          release: 0.5,
          vowels: [
            [0, pick(rng, ['i', 'u'] as const)],
            [0.4, 'a'],
            [1, 'o'],
          ],
          contour: cheerContour,
          level: 0.8,
        });
      }
      const swell = new Track(rate, SEC);
      for (let i = 0; i < sw.length; i++) {
        const j = i % swell.length;
        swell.l[j]! += sw.l[i]!;
        swell.r[j]! += sw.r[i]!;
      }
      scaleToRms(swell, 0.05);

      const t = new Track(rate, SEC);
      t.addTrack(babble).addTrack(claps).addTrack(wh).addTrack(swell);
      yield* addWrappedReverb(t, 'yard', 0.25);
      return t;
    },
  }),

  /** Distant bus park: idling diesels, generator hum, far-off horn toots and clanks (synthesised). */
  buspark_loop: loop({
    rmsDb: -24,
    rate: R,
    gain: 1,
    render: function* ({ rate, rng }) {
      const SEC = 16;
      const t = new Track(rate, SEC);
      // three idling engines. Each is rendered once for a 2 s period (firing rate x 2 s is a multiple
      // of 8, so the idle "lope" pattern wraps exactly) and tiled, with a slow level drift on top.
      for (const [f, pan, g] of [
        [16, -0.6, 1],
        [20, 0.5, 0.8],
        [12, 0.1, 0.7],
      ] as const) {
        const e = engine({
          rate,
          seconds: 2,
          rng,
          fire: f,
          harmonics: 16,
          tilt: 0.5,
          peakHz: 160,
          peakGain: 1.6,
          clatter: 0.5,
          clatterHz: 1800,
          clatterQ: 1,
          rough: 0.5,
          lp: 650,
          hp: 30,
        });
        const drift = rng() * TAU;
        const tiled = new Float32Array(len(rate, SEC));
        for (let i = 0; i < tiled.length; i++)
          tiled[i] = e[i % e.length]! * (0.8 + 0.2 * Math.sin((TAU * 2 * i) / tiled.length + drift));
        t.add(tiled, 0, g, pan);
        yield;
      }
      scaleToRms(t, 0.05);
      const rest = new Track(rate, SEC);
      // far-off horn toots: danfo (low), taxi (peep), keke (squeak)
      for (let k = 0; k < 9; k++) {
        const kind = pick(rng, ['danfo', 'taxi', 'keke'] as const);
        const base = kind === 'danfo' ? 190 : kind === 'taxi' ? 620 : 1050;
        const toots = rng() < 0.4 ? 2 : 1;
        for (let j = 0; j < toots; j++) {
          const d = kind === 'danfo' ? between(rng, 0.25, 0.6) : between(rng, 0.08, 0.2);
          const h = horn({
            rate,
            seconds: d + 0.1,
            notes: kind === 'danfo' ? [base, base * 1.2] : [base * between(rng, 0.95, 1.05)],
            attack: 0.02,
            hold: d,
            release: 0.08,
            lp: 1400,
            bellHz: base * 3,
            bellGain: 0.6,
            rasp: 0.2,
            raspHz: 60,
          });
          addWrapped(
            rest,
            lowpass(h, rate, 1500, 0.7),
            (rng() * (SEC - 1) + j * (d + 0.12)) % SEC,
            between(rng, 0.4, 1),
            between(rng, -0.8, 0.8),
          );
        }
        yield;
      }
      // distant vehicles passing: slow swells of band-passed noise
      for (let k = 0; k < 4; k++) {
        const d = between(rng, 1.8, 3.2);
        const w = nburst(rate, d, rng, 'bp', between(rng, 350, 600), between(rng, 700, 1300), 0.9, 99, 0.01);
        const env = envelope(w.length, rate, [
          [0, 0],
          [d * 0.5, 1],
          [d, 0],
        ]);
        addWrapped(rest, mul(w, env), rng() * SEC, between(rng, 0.5, 1), between(rng, -0.8, 0.8));
      }
      // metallic clanks (bus doors, bonnets)
      for (let k = 0; k < 6; k++) {
        const c = nburst(rate, 0.25, rng, 'bp', between(rng, 700, 2200), null, 6, 0.07, 0.001);
        addWrapped(rest, c, rng() * SEC, between(rng, 0.2, 0.7), between(rng, -0.8, 0.8));
      }
      scaleToRms(rest, 0.03);
      t.addTrack(rest);
      // steady hum of far generators: a low sine stack, exactly periodic
      const hum = new Float32Array(len(rate, SEC));
      for (const [f, a] of [
        [50, 1],
        [100, 0.5],
        [150, 0.25],
      ] as const)
        for (let i = 0; i < hum.length; i++) hum[i]! += Math.sin((TAU * f * i) / rate) * a;
      const humT = new Track(rate, SEC).add(hum, 0, 1, 0);
      scaleToRms(humT, 0.012);
      t.addTrack(humT);
      yield* addWrappedReverb(t, 'hall', 0.3);
      return t;
    },
  }),
};
