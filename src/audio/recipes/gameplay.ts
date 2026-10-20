/**
 * Pickups, player actions, comic eliminations, UI sounds and match stingers. All SYNTHESISED.
 * The stingers are short one-off hits (1-2 s) and are not a music loop.
 */
import {
  TAU,
  Track,
  between,
  decayEnv,
  envelope,
  lowpass,
  mul,
  osc,
  white,
  window,
  highpass,
} from '../dsp/core';
import type { Rng } from '../dsp/core';
import { Priority } from '../voices';
import { addReverb, addReverbSteps, air, bell, chime, horn, len, nburst, thump } from './kit';
import { oneShot, simple } from './types';

const sparkle = (rate: number, rng: Rng, seconds = 0.3): Float32Array =>
  air(rate, seconds, rng, 7000, 0.06, 0.003);

/** Glide sine ("slide whistle") with gentle vibrato. */
function slide(rate: number, seconds: number, f0: number, f1: number, vib = 7): Float32Array {
  const n = len(rate, seconds);
  const x = osc(
    'sine',
    n,
    rate,
    (t) => f0 * Math.pow(f1 / f0, t / seconds) * (1 + 0.012 * Math.sin(TAU * vib * t)),
  );
  const h = osc('sine', n, rate, (t) => 2 * f0 * Math.pow(f1 / f0, t / seconds));
  for (let i = 0; i < n; i++) x[i] = x[i]! + 0.12 * h[i]!;
  return mul(x, window(n, rate, 0.02, 0.06));
}

/** Cartoon "boing": a decaying sine with a springy FM wobble. */
function boing(rate: number, seconds: number): Float32Array {
  const n = len(rate, seconds);
  const x = osc(
    'sine',
    n,
    rate,
    (t) => 190 + 170 * Math.exp(-t * 3.2) + 120 * Math.sin(TAU * 13 * t) * Math.exp(-t * 4),
  );
  const h = osc('sine', n, rate, (t) => 2 * (190 + 170 * Math.exp(-t * 3.2)));
  for (let i = 0; i < n; i++) x[i] = x[i]! + 0.3 * h[i]!;
  return mul(x, decayEnv(n, rate, 0.004, 0.32));
}

/** Sad trombone-ish "womp": low-passed saw sagging in pitch with a wah filter. */
function womp(rate: number, seconds: number, f0: number, f1: number): Float32Array {
  const n = len(rate, seconds);
  const x = osc('saw', n, rate, (t) => f0 * Math.pow(f1 / f0, t / seconds));
  const y = lowpass(
    x,
    rate,
    (i) => 420 + 380 * Math.sin((TAU * 3.2 * i) / rate) ** 2 + 200 * (1 - i / n),
    1.6,
  );
  return mul(
    y,
    envelope(n, rate, [
      [0, 0],
      [0.04, 1],
      [seconds * 0.75, 0.8],
      [seconds, 0],
    ]),
  );
}

/** A pair of shoes dropping and clattering: bounces with shrinking gaps. */
function shoes(t: Track, rng: Rng, at: number): void {
  let gap = 0.17;
  let when = at;
  let g = 1;
  for (let k = 0; k < 6; k++) {
    for (const o of [0, between(rng, 0.025, 0.05)]) {
      t.add(
        thump(t.rate, 0.07, between(rng, 280, 380), 150, 0.012, 0.03, 1.2),
        when + o,
        0.55 * g,
        between(rng, -0.3, 0.3),
      );
      t.add(
        nburst(t.rate, 0.04, rng, 'bp', between(rng, 1200, 2200), null, 2, 0.01, 0.0005),
        when + o,
        0.3 * g,
        between(rng, -0.3, 0.3),
      );
    }
    when += gap;
    gap *= 0.74;
    g *= 0.72;
  }
}

function elimination(kind: 'slide' | 'boing' | 'womp') {
  return oneShot({
    priority: Priority.big,
    gain: 0.95,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 2.4);
      // "poof" so it reads as an impact without being graphic
      t.add(nburst(rate, 0.25, rng, 'lp', 1000, 250, 0.8, 0.07, 0.002), 0, 0.6);
      t.add(thump(rate, 0.25, 150, 52, 0.05, 0.1, 1.8), 0, 0.9);
      if (kind === 'slide') {
        t.add(slide(rate, 0.85, 1700, 240), 0.08, 0.38);
        shoes(t, rng, 1.05);
      } else if (kind === 'boing') {
        t.add(boing(rate, 0.9), 0.08, 0.55);
        shoes(t, rng, 1.05);
      } else {
        t.add(womp(rate, 0.35, 233, 220), 0.12, 0.45);
        t.add(womp(rate, 0.35, 220, 207), 0.5, 0.45);
        t.add(womp(rate, 0.8, 207, 120), 0.88, 0.5);
        shoes(t, rng, 1.65);
      }
      yield;
      return yield* addReverbSteps(t, 'booth', 0.15);
    },
  });
}

/** Quick pluck chain used by several UI/jingle sounds. */
function pluck(t: Track, rate: number, notes: readonly number[], step: number, tau: number, g = 0.8): void {
  notes.forEach((f, i) => t.add(chime(rate, tau * 3, f, tau), i * step, g));
}

export const gameplaySounds = {
  // ----------------------------------------------------------------- pickups
  pickup_1: oneShot({
    gain: 0.7,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.75);
      pluck(t, rate, [1318.5, 1975.5], 0.07, 0.11);
      t.add(sparkle(rate, rng, 0.2), 0.05, 0.12);
      return addReverb(t, 'booth', 0.15);
    }),
  }),
  pickup_rare: oneShot({
    gain: 0.85,
    priority: Priority.big,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 1.6);
      pluck(t, rate, [880, 1108.7, 1318.5, 1760, 2217.5], 0.065, 0.2);
      pluck(
        t,
        rate,
        [880 * 1.005, 1108.7 * 1.005, 1318.5 * 1.005, 1760 * 1.005, 2217.5 * 1.005],
        0.065,
        0.2,
        0.4,
      );
      t.add(sparkle(rate, rng, 0.6), 0.1, 0.18);
      t.add(
        mul(
          osc('sine', len(rate, 0.5), rate, (tt) => 180 + 500 * tt),
          window(len(rate, 0.5), rate, 0.1, 0.2),
        ),
        0,
        0.14,
      );
      yield;
      return yield* addReverbSteps(t, 'yard', 0.25);
    },
  }),
  /** Voucher: a coin-like "ka-ching". */
  pickup_voucher: oneShot({
    gain: 0.85,
    priority: Priority.big,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.1);
      t.add(air(rate, 0.04, rng, 5000, 0.01, 0.0003), 0, 0.5);
      t.add(bell(rate, 0.9, 1760, 0.3), 0.03, 0.7);
      t.add(bell(rate, 0.9, 2349, 0.4), 0.13, 0.8);
      t.add(sparkle(rate, rng, 0.4), 0.13, 0.15);
      return addReverb(t, 'booth', 0.2);
    }),
  }),
  /** Cursed pickup: wobbling, detuned and downward, clearly "bad". */
  pickup_curse: oneShot({
    gain: 0.85,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.3);
      const n = len(rate, 1.0);
      for (const f of [150, 158]) {
        const x = osc('saw', n, rate, (tt) => f * Math.pow(0.55, tt) * (1 + 0.02 * Math.sin(TAU * 6 * tt)));
        const y = lowpass(x, rate, (i) => 1100 * Math.exp((-2.2 * i) / n) + 150, 1.2);
        for (let i = 0; i < n; i++) y[i]! *= (0.75 + 0.25 * Math.sin((TAU * 7 * i) / rate)) * (1 - i / n);
        t.add(y, 0, 0.35, f === 150 ? -0.2 : 0.2);
      }
      t.add(bell(rate, 0.7, 932, 0.25, [1, 1.41, 2.2]), 0.02, 0.22);
      t.add(bell(rate, 0.8, 659, 0.3, [1, 1.41, 2.2]), 0.26, 0.22);
      t.add(
        highpass(white(len(rate, 0.8), rng), rate, 2500).map((v, i, a) => v * (1 - i / a.length) * 0.05),
        0,
        1,
      );
      return addReverb(t, 'yard', 0.2);
    }),
  }),
  pickup_reveal: oneShot({
    gain: 0.5,
    priority: Priority.ambient,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.5);
      pluck(t, rate, [1568, 2093, 2637], 0.045, 0.07, 0.5);
      t.add(sparkle(rate, rng, 0.2), 0, 0.1);
      return t;
    }),
  }),
  pickup_burn: oneShot({
    gain: 0.55,
    priority: Priority.ambient,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.55);
      const n = len(rate, 0.45);
      const hiss = highpass(white(n, rng), rate, 4200);
      for (let i = 0; i < n; i++) hiss[i]! *= (rng() < 0.35 ? 1 : 0.2) * Math.exp((-i / rate) * 6);
      t.add(hiss, 0, 0.7);
      return t;
    }),
  }),
  pickup_drop: oneShot({
    gain: 0.55,
    priority: Priority.ambient,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.6);
      [
        [0, 1],
        [0.11, 0.6],
        [0.19, 0.35],
      ].forEach(([at, g], i) => t.add(bell(rate, 0.25, 2300 - i * 120, 0.06, [1, 2.5]), at!, g!));
      return t;
    }),
  }),
  /** Wasted pickup: sad two-note "wah-wah". */
  pickup_wasted: oneShot({
    gain: 0.8,
    render: simple(({ rate }) => {
      const t = new Track(rate, 1.1);
      t.add(womp(rate, 0.35, 392, 360), 0, 0.5);
      t.add(womp(rate, 0.6, 311, 233), 0.34, 0.5);
      return t;
    }),
  }),

  // ----------------------------------------------------------------- player actions
  push: oneShot({
    gain: 0.8,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.5);
      t.add(nburst(rate, 0.3, rng, 'bp', 350, 1500, 1.0, 0.12, 0.06), 0, 0.5);
      t.add(
        highpass(white(len(rate, 0.2), rng), rate, 3000).map(
          (v, i, a) => v * Math.sin((Math.PI * i) / a.length) * 0.07,
        ),
        0,
        1,
      );
      t.add(thump(rate, 0.2, 125, 60, 0.04, 0.08, 1.6), 0.1, 0.7);
      return t;
    }),
  }),
  /** Dazed: cartoon "bonk" and little stars twinkling down. */
  daze: oneShot({
    gain: 0.85,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.9);
      t.add(thump(rate, 0.16, 330, 105, 0.03, 0.07, 1.8), 0, 0.9);
      t.add(bell(rate, 0.12, 700, 0.03, [1, 2.9]), 0, 0.4);
      [1760, 1480, 1245, 1047].forEach((f, i) =>
        t.add(bell(rate, 0.3, f, 0.1, [1, 2.76]), 0.12 + i * 0.1, 0.32 - i * 0.04),
      );
      return t;
    }),
  }),
  hop: oneShot({
    gain: 0.5,
    priority: Priority.ambient,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.22);
      const n = len(rate, 0.16);
      t.add(
        mul(
          osc('sine', n, rate, (tt) => 300 + 2200 * tt * (1 - tt * 3)),
          window(n, rate, 0.006, 0.07),
        ),
        0,
        0.6,
      );
      return t;
    }),
  }),

  // ----------------------------------------------------------------- eliminations
  elim_slide: elimination('slide'),
  elim_boing: elimination('boing'),
  elim_womp: elimination('womp'),

  // ----------------------------------------------------------------- ui
  ui_click: oneShot({
    gain: 0.55,
    priority: Priority.normal,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.1);
      t.add(chime(rate, 0.08, 1500, 0.02, 0.5), 0, 0.8);
      t.add(air(rate, 0.02, rng, 4500, 0.004, 0.0003), 0, 0.25);
      return t;
    }),
  }),
  ui_back: oneShot({
    gain: 0.5,
    priority: Priority.normal,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.14);
      t.add(chime(rate, 0.12, 880, 0.03, 0.4), 0, 0.8);
      t.add(chime(rate, 0.1, 620, 0.03, 0.4), 0.04, 0.5);
      return t;
    }),
  }),
  ui_start: oneShot({
    gain: 0.65,
    priority: Priority.normal,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.6);
      pluck(t, rate, [420, 560, 840], 0.08, 0.09);
      t.add(nburst(rate, 0.3, rng, 'bp', 600, 3000, 0.9, 0.1, 0.08), 0.02, 0.12);
      return t;
    }),
  }),
  ui_count: oneShot({
    gain: 0.7,
    priority: Priority.normal,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.3);
      const x = osc('sine', len(rate, 0.2), rate, 660);
      const h = osc('sine', len(rate, 0.2), rate, 1320);
      for (let i = 0; i < x.length; i++) x[i] = x[i]! + 0.25 * h[i]!;
      t.add(mul(x, window(x.length, rate, 0.004, 0.08)), 0, 0.8);
      return t;
    }),
  }),
  ui_go: oneShot({
    gain: 0.85,
    priority: Priority.big,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.9);
      for (const f of [660, 990, 1320])
        t.add(
          horn({
            rate,
            seconds: 0.6,
            notes: [f],
            attack: 0.01,
            hold: 0.32,
            release: 0.2,
            lp: 3500,
            bellHz: f * 2,
            bellGain: 0.5,
            rasp: 0.1,
            raspHz: 50,
          }),
          0,
          0.6,
        );
      t.add(nburst(rate, 0.4, rng, 'bp', 600, 3500, 0.8, 0.15, 0.1), 0, 0.2);
      return addReverb(t, 'booth', 0.15);
    }),
  }),

  // ----------------------------------------------------------------- match stingers (not music)
  win_sting: oneShot({
    gain: 0.9,
    priority: Priority.jingle,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3.0);
      const stab = (f: number, at: number, dur: number, g: number): void => {
        for (const d of [-9, 9]) {
          const n = len(rate, dur);
          const x = osc('saw', n, rate, f * Math.pow(2, d / 1200));
          const y = lowpass(x, rate, (i) => 900 + 2600 * Math.exp((-6 * i) / n), 0.9);
          t.add(
            mul(
              y,
              envelope(n, rate, [
                [0, 0],
                [0.012, 1],
                [dur * 0.4, 0.6],
                [dur, 0],
              ]),
            ),
            at,
            g,
          );
        }
      };
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => stab(f, i * 0.11, 0.35, 0.22));
      for (const f of [523.3, 659.3, 784, 1046.5, 1318.5]) stab(f, 0.5, 1.3, 0.2);
      t.add(thump(rate, 0.3, 130, 48, 0.05, 0.12, 1.8), 0.5, 0.8);
      t.add(air(rate, 1.2, rng, 5500, 0.4, 0.15), 0.5, 0.22);
      t.add(bell(rate, 1.2, 2093, 0.5), 0.5, 0.25);
      yield;
      return yield* addReverbSteps(t, 'yard', 0.25);
    },
  }),
  lose_sting: oneShot({
    gain: 0.85,
    priority: Priority.jingle,
    render: simple(({ rate }) => {
      const t = new Track(rate, 2.4);
      t.add(womp(rate, 0.4, 294, 277), 0, 0.5);
      t.add(womp(rate, 0.4, 277, 262), 0.45, 0.5);
      t.add(womp(rate, 0.4, 262, 247), 0.9, 0.5);
      t.add(womp(rate, 0.9, 247, 130), 1.35, 0.55);
      return addReverb(t, 'booth', 0.15);
    }),
  }),
  draw_sting: oneShot({
    gain: 0.85,
    priority: Priority.jingle,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 2.1);
      t.add(womp(rate, 0.3, 330, 327), 0, 0.5);
      t.add(womp(rate, 0.3, 330, 327), 0.35, 0.5);
      t.add(womp(rate, 0.7, 294, 190), 0.7, 0.5);
      t.add(slide(rate, 0.5, 700, 300, 5), 0.9, 0.12);
      t.add(nburst(rate, 0.3, rng, 'bp', 800, 300, 0.9, 0.1, 0.02), 0.7, 0.2);
      return addReverb(t, 'booth', 0.15);
    }),
  }),
};
