/**
 * Generators, explosions, blocks, crush slam, crowd throws and floor hazards. All SYNTHESISED.
 *
 * Explosion anatomy: sharp crack transient + pitch-dropping low thump + noise roar with a falling
 * low-pass sweep + sub rumble + scattered debris, then a synthesised room tail.
 */
import {
  TAU,
  Track,
  additive,
  bandpass,
  between,
  brown,
  decayEnv,
  envelope,
  highpass,
  loopify,
  lowpass,
  mul,
  osc,
  pink,
  saturate,
  white,
  window,
} from '../dsp/core';
import type { Rng } from '../dsp/core';
import { Priority } from '../voices';
import { addReverbSteps, air, bell, engine, len, nburst, thump, whistle } from './kit';
import { loop, oneShot, simple } from './types';

function* roar(
  t: Track,
  rng: Rng,
  seconds: number,
  f0: number,
  f1: number,
  level: number,
  tau: number,
): Generator<void> {
  for (const ch of [t.l, t.r]) {
    const n = len(t.rate, seconds);
    const x = pink(n, rng);
    const lp = lowpass(x, t.rate, (i) => f0 * Math.pow(f1 / f0, Math.min(1, (i / n) * 1.3)), 0.8);
    const env = envelope(n, t.rate, [
      [0, 0],
      [0.008, 1],
      [tau, 0.5],
      [seconds, 0],
    ]);
    for (let i = 0; i < n; i++)
      ch[i]! += lp[i]! * env[i]! * level * (1 + 0.3 * Math.sin((TAU * 27 * i) / t.rate)) * 1.6;
    yield;
  }
}

function explosion(variant: number) {
  const P = [
    { f0: 125, f1: 34, sweep: 5200, tau: 0.3, crackHz: 1400, debris: 55 },
    { f0: 150, f1: 38, sweep: 6400, tau: 0.26, crackHz: 1800, debris: 70 },
    { f0: 105, f1: 31, sweep: 4400, tau: 0.38, crackHz: 1100, debris: 48 },
  ][variant]!;
  return oneShot({
    priority: Priority.big,
    gain: 1,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3.0);
      const crack = saturate(nburst(rate, 0.06, rng, 'hp', P.crackHz, null, 0.7, 0.007, 0.0003), 3);
      t.add(crack, 0, 0.9);
      t.add(highpass(white(len(rate, 0.012), rng), rate, 4500), 0, 0.9);
      yield;
      t.add(thump(rate, 1.0, P.f0, P.f1, 0.09, 0.24, 2.4), 0, 0.85);
      yield* roar(t, rng, 1.9, P.sweep, 190, 1.0, P.tau);
      // mid "body" burst (fireball)
      t.add(nburst(rate, 0.7, rng, 'bp', 650, 160, 0.8, 0.2, 0.01), 0.01, 1.3, 0);
      // sub rumble
      const sub = mul(
        lowpass(brown(len(rate, 2.2), rng), rate, 95, 0.8),
        envelope(len(rate, 2.2), rate, [
          [0, 0],
          [0.04, 1],
          [0.5, 0.6],
          [2.2, 0],
        ]),
      );
      t.add(sub, 0.02, 0.9);
      yield;
      // debris: pitched fragments and clicks falling like rubble, density decaying
      for (let k = 0; k < P.debris; k++) {
        const at = 0.07 + Math.pow(rng(), 1.7) * 1.5;
        const f = between(rng, 650, 4200);
        const lvl = 0.3 * Math.exp(-at * 1.3) * between(rng, 0.4, 1);
        // mostly noisy clicks and clacks; only every fourth fragment carries a little pitch
        t.add(
          nburst(rate, 0.05, rng, 'bp', f, null, 1.6, 0.012, 0.0004),
          at,
          lvl * 1.6,
          between(rng, -0.9, 0.9),
        );
        if (k % 4 === 0)
          t.add(bell(rate, 0.08, f * 0.8, 0.02, [1, 2.4]), at, lvl * 0.5, between(rng, -0.9, 0.9));
      }
      yield;
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  });
}

export const blastSounds = {
  explosion_1: explosion(0),
  explosion_2: explosion(1),
  explosion_3: explosion(2),

  /** Extra low boom layered under big chains / long reach. */
  explosion_rumble: oneShot({
    priority: Priority.big,
    gain: 0.9,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3.4);
      const n = len(rate, 3.0);
      const x = lowpass(brown(n, rng), rate, (i) => 420 * Math.pow(55 / 420, i / n), 0.8);
      t.add(
        mul(
          x,
          envelope(n, rate, [
            [0, 0],
            [0.03, 1],
            [0.7, 0.55],
            [3.0, 0],
          ]),
        ),
        0,
        1.6,
      );
      t.add(thump(rate, 1.6, 72, 27, 0.2, 0.5, 1.8), 0, 1);
      yield;
      return yield* addReverbSteps(t, 'hall', 0.3);
    },
  }),

  /** Placing a generator: metallic thunk then a 2-stroke engine sputtering into idle. */
  gen_place: oneShot({
    gain: 0.9,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.1);
      t.add(thump(rate, 0.25, 160, 58, 0.04, 0.09, 1.6), 0, 0.9);
      t.add(nburst(rate, 0.1, rng, 'bp', 900, null, 1.2, 0.025), 0, 0.5);
      t.add(bell(rate, 0.3, 530, 0.09, [1, 1.9, 2.9]), 0.005, 0.18);
      // sputter: pops speeding up into a steady idle
      let at = 0.16;
      for (let i = 0; i < 9; i++) {
        const p = thump(rate, 0.09, between(rng, 95, 120), 55, 0.02, 0.035, 2);
        t.add(p, at, 0.5 + 0.05 * i);
        t.add(nburst(rate, 0.06, rng, 'bp', 1300, null, 1.5, 0.014), at, 0.25);
        at += 0.12 - i * 0.008;
      }
      return t;
    }),
  }),

  /**
   * Running generator, 1 s seamless loop: a small petrol 2-stroke "putt-putt" (24 pulses/s with an
   * irregular governor hunt, buzzy mechanical band, exhaust resonance). The game raises
   * playbackRate and gain as the fuse nears zero.
   */
  gen_run_loop: loop({
    rmsDb: -16,
    bus: 'sfx',
    rate: 32000,
    priority: Priority.fuse,
    render: simple(({ rate, rng }) => {
      const X = len(rate, 0.05);
      const body = engine({
        rate,
        seconds: 1.05,
        rng,
        fire: 24,
        harmonics: 34,
        tilt: 0.35,
        peakHz: 450,
        peakGain: 2.2,
        clatter: 0.9,
        clatterHz: 2100,
        clatterQ: 1.1,
        rough: 0.7,
        lp: 4200,
        hp: 80,
        drive: 1.6,
      });
      // governor "hunt": slow 3 Hz amplitude wobble (3 whole cycles per second keeps the loop exact)
      for (let i = 0; i < body.length; i++) body[i]! *= 1 + 0.18 * Math.sin((TAU * 3 * i) / rate);
      const buzz = mul(
        bandpass(white(body.length, rng), rate, 1700, 1.4),
        body.map((v) => Math.min(1, Math.abs(v) * 3)),
      );
      for (let i = 0; i < body.length; i++) body[i]! += buzz[i]! * 0.35;
      const [l, r] = loopify(body, body.slice(), X);
      return new Track(rate, l.length / rate).addLR(l, r);
    }),
  }),

  /** Last-third rattle: loose metal and a rough buzz, 0.8 s seamless loop. */
  gen_rattle_loop: loop({
    rmsDb: -18,
    bus: 'sfx',
    rate: 32000,
    priority: Priority.fuse,
    render: simple(({ rate, rng }) => {
      const X = len(rate, 0.06);
      const n = len(rate, 0.8) + X;
      const base = bandpass(white(n, rng), rate, 2600, 1.6);
      for (let i = 0; i < n; i++)
        base[i]! *= 0.5 + 0.5 * Math.abs(Math.sin((TAU * 62 * i) / rate)) * (0.6 + 0.4 * rng());
      const metal = new Float32Array(n);
      for (let k = 0; k < 26; k++) {
        const f = [640, 1180, 2050, 3100][k % 4]! * between(rng, 0.97, 1.03);
        const ping = additive(len(rate, 0.07), rate, f, [{ ratio: 1, amp: 1, decay: 60 }]);
        const at = Math.floor(rng() * (n - ping.length));
        const g = between(rng, 0.3, 1);
        for (let i = 0; i < ping.length; i++) metal[at + i]! += ping[i]! * g;
      }
      const buzz = lowpass(osc('saw', n, rate, 97), rate, 700, 0.8);
      for (let i = 0; i < n; i++) base[i] = base[i]! * 0.7 + metal[i]! * 0.5 + buzz[i]! * 0.25;
      const [l, r] = loopify(base, base.slice(), X);
      return new Track(rate, l.length / rate).addLR(l, r);
    }),
  }),

  /** Remote-detonator generator indicator: a small two-tone electronic blip, in its own band. */
  gen_remote_blip: oneShot({
    bus: 'warn',
    gain: 0.7,
    priority: Priority.fuse,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.22);
      for (const [at, f] of [
        [0, 1320],
        [0.075, 1760],
      ] as const) {
        const x = osc('sine', len(rate, 0.06), rate, f);
        t.add(mul(x, window(x.length, rate, 0.004, 0.025)), at, 0.7);
        t.add(
          mul(osc('sine', len(rate, 0.06), rate, f * 2), decayEnv(len(rate, 0.06), rate, 0.002, 0.012)),
          at,
          0.12,
        );
      }
      return t;
    }),
  }),

  /** Disarm: the engine winds down with a falling whine and a final clunk. */
  gen_powerdown: oneShot({
    gain: 0.85,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.3);
      const n = len(rate, 1.1);
      const fall = (tt: number): number => 640 * Math.exp(-tt * 2.7) + 45;
      const whine = lowpass(
        osc('saw', n, rate, fall),
        rate,
        (i) => 3000 * Math.exp((-3.5 * i) / n) + 200,
        1.0,
      );
      t.add(
        mul(
          whine,
          envelope(n, rate, [
            [0, 0],
            [0.03, 1],
            [0.8, 0.5],
            [1.1, 0],
          ]),
        ),
        0,
        0.45,
      );
      const eng = engine({
        rate,
        seconds: 1.1,
        rng,
        fire: (tt) => 24 * Math.exp(-tt * 1.9) + 3,
        harmonics: 20,
        tilt: 0.9,
        peakHz: 300,
        peakGain: 1.2,
        clatter: 0.5,
        clatterHz: 1800,
        clatterQ: 1,
        rough: 0.5,
        lp: 2500,
      });
      t.add(
        mul(
          eng,
          envelope(n, rate, [
            [0, 1],
            [0.7, 0.6],
            [1.1, 0],
          ]),
        ),
        0,
        0.6,
      );
      t.add(thump(rate, 0.2, 110, 50, 0.04, 0.08, 1.5), 1.0, 0.5);
      t.add(nburst(rate, 0.08, rng, 'bp', 700, null, 1.5, 0.02), 1.0, 0.25);
      return t;
    }),
  }),

  /** Dud generator being cleared: wet fizzle and a dull clank. */
  gen_dud: oneShot({
    gain: 0.6,
    priority: Priority.ambient,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.7);
      t.add(nburst(rate, 0.5, rng, 'hp', 3200, 800, 0.7, 0.13, 0.02), 0, 0.5);
      t.add(bell(rate, 0.25, 360, 0.07, [1, 2.2, 3.7]), 0.3, 0.3);
      t.add(thump(rate, 0.12, 170, 80, 0.03, 0.05, 1.2), 0.3, 0.4);
      return t;
    }),
  }),

  gen_kick: oneShot({
    gain: 0.85,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.45);
      t.add(thump(rate, 0.16, 210, 85, 0.03, 0.07, 1.8), 0, 0.9);
      t.add(nburst(rate, 0.08, rng, 'bp', 1400, 600, 1.1, 0.02), 0, 0.5);
      t.add(bell(rate, 0.3, 470, 0.08, [1, 2.5, 4.1]), 0.012, 0.2);
      return t;
    }),
  }),

  gen_carry: oneShot({
    gain: 0.7,
    priority: Priority.normal,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.4);
      t.add(nburst(rate, 0.18, rng, 'bp', 800, 2200, 1.0, 0.07, 0.03), 0, 0.35);
      t.add(
        mul(
          osc('sine', len(rate, 0.14), rate, (tt) => 150 + 380 * tt),
          window(len(rate, 0.14), rate, 0.01, 0.05),
        ),
        0.02,
        0.5,
      );
      t.add(bell(rate, 0.2, 1900, 0.04, [1, 2.7]), 0.11, 0.22);
      return t;
    }),
  }),

  gen_throw: oneShot({
    gain: 0.75,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.6);
      const w = nburst(rate, 0.5, rng, 'bp', 450, 1800, 1.0, 0.25, 0.1);
      t.add(w, 0, 0.8);
      t.add(
        mul(
          osc('sine', len(rate, 0.3), rate, (tt) => 220 + 260 * tt),
          window(len(rate, 0.3), rate, 0.05, 0.1),
        ),
        0,
        0.2,
      );
      return t;
    }),
  }),

  gen_drop: oneShot({
    gain: 0.8,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.4);
      t.add(thump(rate, 0.22, 135, 52, 0.04, 0.09, 1.7), 0, 1);
      t.add(nburst(rate, 0.09, rng, 'lp', 1100, null, 0.7, 0.03), 0, 0.5);
      t.add(bell(rate, 0.2, 420, 0.06, [1, 2.4]), 0.01, 0.15);
      return t;
    }),
  }),

  /** Fuse countdown tick in the warning band (~3 kHz). The game pitches it up with urgency. */
  fuse_tick: oneShot({
    bus: 'warn',
    gain: 0.5,
    priority: Priority.fuse,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.08);
      const x = osc('sine', len(rate, 0.04), rate, 3000);
      t.add(mul(x, decayEnv(x.length, rate, 0.0006, 0.007)), 0, 0.8);
      t.add(nburst(rate, 0.03, rng, 'bp', 3300, null, 3, 0.006, 0.0003), 0, 0.5);
      return t;
    }),
  }),

  block_crumble_1: blockCrumble(0),
  block_crumble_2: blockCrumble(1),

  crush_warning: oneShot({
    bus: 'warn',
    gain: 0.9,
    priority: Priority.warning,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.3);
      const n = len(rate, 1.2);
      t.add(
        mul(
          osc('sine', n, rate, (tt) => 46 - 8 * tt),
          envelope(n, rate, [
            [0, 0],
            [0.4, 1],
            [1.2, 0.4],
          ]),
        ),
        0,
        0.8,
      );
      t.add(
        mul(
          lowpass(brown(n, rng), rate, 170, 0.7),
          envelope(n, rate, [
            [0, 0],
            [0.45, 1],
            [1.2, 0.3],
          ]),
        ),
        0,
        1.2,
      );
      for (const at of [0.1, 0.32])
        t.add(
          mul(osc('sine', len(rate, 0.09), rate, 2500), window(len(rate, 0.09), rate, 0.005, 0.03)),
          at,
          0.4,
        );
      return t;
    }),
  }),

  crush_slam: oneShot({
    priority: Priority.big,
    gain: 1,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 1.8);
      t.add(thump(rate, 0.9, 98, 30, 0.1, 0.3, 2.2), 0, 1.15);
      t.add(nburst(rate, 0.7, rng, 'lp', 1000, 110, 0.7, 0.22, 0.004), 0, 0.9);
      t.add(saturate(nburst(rate, 0.05, rng, 'hp', 2200, null, 0.7, 0.008, 0.0003), 2), 0, 0.6);
      for (let k = 0; k < 24; k++)
        t.add(
          nburst(rate, 0.05, rng, 'bp', between(rng, 500, 3200), null, 3, 0.012, 0.0005),
          0.05 + Math.pow(rng(), 1.5) * 0.9,
          between(rng, 0.1, 0.35),
          between(rng, -0.8, 0.8),
        );
      yield;
      return yield* addReverbSteps(t, 'yard', 0.28);
    },
  }),

  /** Rising "incoming" whistle for thrown bottles/firecrackers (warning band). */
  crowd_throw_whistle: oneShot({
    bus: 'warn',
    gain: 0.65,
    priority: Priority.warning,
    render: simple(({ rate, rng }) => whistleTrack(rate, rng, 0.8)),
  }),

  bottle_smash: oneShot({
    priority: Priority.big,
    gain: 0.85,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 1.2);
      t.add(thump(rate, 0.14, 190, 90, 0.025, 0.05, 1.5), 0, 0.6);
      t.add(air(rate, 0.12, rng, 4500, 0.025, 0.0004), 0, 0.7);
      for (let k = 0; k < 34; k++) {
        const at = Math.pow(rng(), 1.8) * 0.5 + 0.01;
        t.add(
          bell(rate, 0.14, between(rng, 2200, 9000), between(rng, 0.015, 0.06), [1, 2.1]),
          at,
          between(rng, 0.1, 0.4),
          between(rng, -0.8, 0.8),
        );
      }
      yield;
      return yield* addReverbSteps(t, 'booth', 0.25);
    },
  }),

  firecracker_bang: oneShot({
    priority: Priority.big,
    gain: 1,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 1.5);
      t.add(saturate(nburst(rate, 0.05, rng, 'bp', 2800, 900, 0.5, 0.01, 0.0002), 3.5), 0, 1);
      t.add(thump(rate, 0.3, 135, 46, 0.04, 0.1, 2), 0, 0.8);
      t.add(air(rate, 0.5, rng, 5500, 0.12, 0.0005), 0.01, 0.35);
      for (let k = 0; k < 6; k++)
        t.add(
          nburst(rate, 0.03, rng, 'hp', 3500, null, 1, 0.006, 0.0003),
          0.18 + k * 0.05 * (1 + rng()),
          between(rng, 0.15, 0.4),
        );
      yield;
      return yield* addReverbSteps(t, 'yard', 0.35);
    },
  }),

  pothole_thud: oneShot({
    gain: 0.85,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.7);
      t.add(thump(rate, 0.22, 175, 62, 0.035, 0.08, 1.8), 0, 1);
      t.add(nburst(rate, 0.14, rng, 'lp', 700, null, 0.8, 0.04), 0, 0.5);
      t.add(bell(rate, 0.35, 410, 0.1, [1, 2.2, 3.4]), 0.01, 0.35);
      for (const [at, g] of [
        [0.18, 0.5],
        [0.27, 0.3],
        [0.34, 0.18],
      ] as const)
        t.add(thump(rate, 0.08, 150, 80, 0.02, 0.03, 1.2), at, g);
      return t;
    }),
  }),

  oil_squeak: oneShot({
    gain: 0.7,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.7);
      const f = (tt: number): number => (tt < 0.2 ? 900 + 3500 * tt : 1600 - 2200 * (tt - 0.2));
      const n = len(rate, 0.46);
      const x = osc('sine', n, rate, (tt) => f(tt) * (1 + 0.04 * Math.sin(TAU * 38 * tt)));
      const h = osc('sine', n, rate, (tt) => f(tt) * 2.01);
      for (let i = 0; i < n; i++) x[i] = x[i]! + 0.25 * h[i]!;
      t.add(
        mul(
          x,
          envelope(n, rate, [
            [0, 0],
            [0.02, 1],
            [0.35, 0.8],
            [0.46, 0],
          ]),
        ),
        0,
        0.6,
      );
      t.add(nburst(rate, 0.3, rng, 'bp', 1300, 400, 0.9, 0.12, 0.03), 0, 0.25);
      return t;
    }),
  }),

  // A fighter's feet go out on an oil slick: a rubbery skid that glides down, a whoosh as the feet fly up,
  // then the slap of the body landing and two scuffs as they slide. Clearly different from the endgame
  // wave's `oil_squeak` and from the dull `pothole_thud`.
  oil_slip: oneShot({
    gain: 0.9,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1);
      const f = (tt: number): number => 1900 * Math.exp(-tt * 2.6) + 380;
      const n = len(rate, 0.5);
      const skid = osc('sine', n, rate, (tt) => f(tt) * (1 + 0.05 * Math.sin(TAU * 31 * tt)));
      const grit = osc('saw', n, rate, (tt) => f(tt) * 0.5);
      for (let i = 0; i < n; i++) skid[i] = skid[i]! + 0.18 * grit[i]!;
      t.add(
        mul(
          skid,
          envelope(n, rate, [
            [0, 0],
            [0.015, 1],
            [0.3, 0.7],
            [0.5, 0],
          ]),
        ),
        0,
        0.5,
      );
      t.add(nburst(rate, 0.42, rng, 'bp', 2400, 500, 0.8, 0.18, 0.01), 0, 0.3);
      t.add(air(rate, 0.3, rng, 1800, 0.1, 0.04), 0.12, 0.28);
      // body hits the tarmac, then it slides
      t.add(thump(rate, 0.24, 150, 52, 0.03, 0.09, 1.8), 0.34, 0.95);
      t.add(nburst(rate, 0.16, rng, 'lp', 900, null, 0.8, 0.05), 0.34, 0.55);
      t.add(nburst(rate, 0.24, rng, 'bp', 1400, 600, 0.9, 0.09, 0.004), 0.5, 0.22);
      t.add(nburst(rate, 0.18, rng, 'bp', 1100, 500, 0.9, 0.07, 0.004), 0.68, 0.14);
      return t;
    }),
  }),
};

function blockCrumble(variant: number) {
  return oneShot({
    gain: 0.75,
    priority: Priority.ambient,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.8);
      t.add(nburst(rate, 0.3, rng, 'bp', variant ? 1500 : 1100, 380, 0.9, 0.09, 0.002), 0, 0.8);
      t.add(thump(rate, 0.2, 110, 52, 0.04, 0.08, 1.6), 0, 0.7);
      for (let k = 0; k < 14; k++) {
        const at = 0.02 + Math.pow(rng(), 1.4) * 0.45;
        t.add(
          bell(rate, 0.08, between(rng, 700, 3200), 0.025, [1, 2.7]),
          at,
          between(rng, 0.1, 0.4),
          between(rng, -0.8, 0.8),
        );
      }
      return t;
    }),
  });
}

function whistleTrack(rate: number, rng: Rng, seconds: number): Track {
  const t = new Track(rate, seconds + 0.1);
  const w = whistle(rate, seconds, rng, 1900, 3000, 0, 0, 0.02);
  t.add(w, 0, 0.9);
  t.add(
    mul(
      osc('sine', w.length, rate, (tt) => 2850 + 1650 * (tt / seconds) * 1.0),
      envelope(w.length, rate, [
        [0, 0],
        [0.15, 0.18],
        [seconds, 0.2],
      ]),
    ),
    0,
    0.2,
  );
  return t;
}
