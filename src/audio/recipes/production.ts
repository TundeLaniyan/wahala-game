/**
 * Sound-design pass (docs/AUDIO_COVERAGE.md): sounds the coverage audit found missing or borrowed from another event.
 * Like every other effect they are SYNTHESISED at runtime from the same kit (nothing is downloaded, nothing is a
 * recording; do not describe them as one). Rendered lazily by the bank, so they cost no first-load data.
 *
 * Mix rules followed here: danger and boss warnings live on the `warn` bus (never ducked, never notched), impacts keep a
 * 500-2500 Hz "knock" so they read on phone speakers that drop the low end, and nothing relies on content below 100 Hz.
 */
import { TAU, Track, between, envelope, lowpass, mul, osc, saturate, window } from '../dsp/core';
import { Priority } from '../voices';
import { addReverbSteps, air, bell, chime, horn, len, nburst, thump } from './kit';
import { loop, oneShot, simple } from './types';

const pluckChain = (
  t: Track,
  rate: number,
  notes: readonly number[],
  step: number,
  tau: number,
  g = 0.8,
): void => notes.forEach((f, i) => t.add(chime(rate, tau * 3, f, tau), i * step, g));

export const productionSounds = {
  // ------------------------------------------------------------------------------------ movement and combat
  /** A shoe on the ground: a dry tick over a short thump. The footstep director varies rate and gain. */
  step_ground: oneShot({
    gain: 0.5,
    priority: Priority.ambient,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.16);
      // the body sits above 150 Hz on purpose: a phone speaker drops everything below that, and a step is mostly body
      t.add(thump(rate, 0.08, 300, 170, 0.01, 0.025, 1, 0.8), 0, 0.7);
      t.add(nburst(rate, 0.07, rng, 'bp', 900, 600, 1.1, 0.02, 0.0008), 0, 0.8);
      t.add(nburst(rate, 0.05, rng, 'bp', 2200, 1500, 1.2, 0.01, 0.0005), 0, 0.6);
      return t;
    }),
  }),

  /** The empty swing of a punch: an air whoosh that rises and falls (distinct from the shove). */
  punch_swing: oneShot({
    gain: 0.6,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.3);
      t.add(
        mul(
          nburst(rate, 0.26, rng, 'bp', 500, 2800, 1.1, 0.09, 0.07),
          window(len(rate, 0.26), rate, 0.05, 0.1),
        ),
        0,
        0.9,
      );
      return t;
    }),
  }),

  /** A punch that lands: a crack over a body thump. */
  punch_hit: oneShot({
    gain: 0.95,
    priority: Priority.normal,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.35);
      t.add(thump(rate, 0.18, 330, 175, 0.02, 0.05, 1.5, 0.7), 0, 0.8);
      t.add(air(rate, 0.1, rng, 2600, 0.016, 0.0004), 0, 0.7);
      t.add(nburst(rate, 0.14, rng, 'bp', 900, 500, 1.4, 0.035, 0.001), 0, 0.9);
      return t;
    }),
  }),

  /** A fighter thrown back: a scrape that slides away, ending in a floor thud. */
  knock_back: oneShot({
    gain: 0.9,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.6);
      t.add(nburst(rate, 0.35, rng, 'lp', 2600, 400, 0.8, 0.11, 0.004), 0, 0.7);
      t.add(thump(rate, 0.3, 120, 48, 0.03, 0.1, 1.8, 0.4), 0.22, 1);
      t.add(air(rate, 0.08, rng, 3000, 0.02, 0.0004), 0.22, 0.4);
      return t;
    }),
  }),

  /** Damage taken: a sharper blow with a dull metallic edge (campaign health, bosses). */
  hurt_hit: oneShot({
    gain: 0.9,
    priority: Priority.big,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.45);
      t.add(thump(rate, 0.25, 150, 55, 0.025, 0.09, 1.9, 0.5), 0, 1);
      t.add(bell(rate, 0.25, 640, 0.05, [1, 2.3, 4.1]), 0, 0.3);
      t.add(air(rate, 0.1, rng, 3200, 0.02, 0.0004), 0, 0.5);
      return t;
    }),
  }),

  // ------------------------------------------------------------------------------------ interface
  ui_confirm: oneShot({
    gain: 0.65,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.5);
      pluckChain(t, rate, [880, 1318.5], 0.07, 0.09);
      return t;
    }),
  }),
  ui_error: oneShot({
    gain: 0.4, // a sustained square is far louder per peak than a plucked chime: trimmed to sit with the other UI sounds
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.35);
      for (const [f, at] of [
        [165, 0],
        [138, 0.11],
      ] as const) {
        const n = len(rate, 0.1);
        const x = saturate(lowpass(osc('square', n, rate, f), rate, 900, 0.8), 1.4);
        t.add(mul(x, window(n, rate, 0.004, 0.03)), at, 0.7);
      }
      return t;
    }),
  }),
  ui_pause: oneShot({
    gain: 0.6,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.5);
      pluckChain(t, rate, [660, 440], 0.08, 0.1);
      return t;
    }),
  }),
  ui_resume: oneShot({
    gain: 0.6,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.5);
      pluckChain(t, rate, [440, 660], 0.07, 0.09);
      return t;
    }),
  }),
  ui_ready: oneShot({
    gain: 0.7,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.8);
      pluckChain(t, rate, [523.3, 659.3, 784, 1046.5], 0.075, 0.1, 0.7);
      t.add(nburst(rate, 0.3, rng, 'bp', 800, 3600, 0.9, 0.09, 0.06), 0, 0.12);
      return t;
    }),
  }),

  // ------------------------------------------------------------------------------------ Sudden Death
  /** Rising pressure as Sudden Death begins: a riser that ends on silence (the card and the first blast follow). */
  sd_rise: oneShot({
    bus: 'warn',
    gain: 0.75,
    priority: Priority.warning,
    render: simple(({ rate, rng }) => {
      const sec = 2.6;
      const n = len(rate, sec);
      const t = new Track(rate, sec + 0.1);
      const sweep = nburst(rate, sec, rng, 'bp', 180, 5200, 1.4, 99, 0.2);
      mul(
        sweep,
        envelope(n, rate, [
          [0, 0.05],
          [sec * 0.85, 1],
          [sec, 0],
        ]),
      );
      t.add(sweep, 0, 0.8);
      const tone = osc('saw', n, rate, (x) => 110 * Math.pow(3.4, x / sec));
      mul(
        lowpass(tone, rate, 1500, 0.9),
        envelope(n, rate, [
          [0, 0],
          [sec * 0.9, 0.5],
          [sec, 0],
        ]),
      );
      t.add(tone, 0, 0.35);
      // a pulse that speeds up: the pressure is rising
      for (let k = 0, at = 0.1; at < sec - 0.2; k++) {
        t.add(thump(rate, 0.16, 120, 60, 0.02, 0.05, 1.4, 0.5), at, 0.35 + 0.012 * k);
        at += Math.max(0.12, 0.5 - 0.034 * k);
      }
      return t;
    }),
  }),

  /** Rubble settling after a Wahala Crush block lands. */
  crush_debris: oneShot({
    gain: 0.7,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 1.3);
      t.add(nburst(rate, 0.8, rng, 'lp', 1500, 200, 0.8, 0.25, 0.01), 0.05, 0.5);
      for (let k = 0; k < 28; k++)
        t.add(
          nburst(rate, 0.06, rng, 'bp', between(rng, 450, 3000), null, 3, 0.012, 0.0005),
          0.04 + Math.pow(rng(), 1.7) * 0.9,
          between(rng, 0.1, 0.4),
          between(rng, -0.8, 0.8),
        );
      yield;
      return yield* addReverbSteps(t, 'yard', 0.2);
    },
  }),

  // ------------------------------------------------------------------------------------ boss encounters
  /** The boss arrives: a low horn swell, then a heavy stomp. */
  boss_entrance: oneShot({
    gain: 0.9,
    priority: Priority.big,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 2.4);
      t.add(
        horn({
          rate,
          seconds: 1.6,
          notes: [98, 146.8],
          attack: 0.35,
          hold: 1.1,
          release: 0.45,
          lp: 750,
          bellHz: 450,
          bellGain: 0.5,
          rasp: 0.25,
          raspHz: 9,
          sag: 0.97,
        }),
        0,
        0.8,
      );
      t.add(thump(rate, 0.8, 90, 30, 0.08, 0.28, 2.2, 0.45), 1.0, 1.1);
      t.add(nburst(rate, 0.5, rng, 'lp', 1400, 180, 0.8, 0.16, 0.004), 1.0, 0.7);
      yield;
      return yield* addReverbSteps(t, 'hall', 0.25);
    },
  }),

  /** The boss's attack is about to land: a rising growl in the warning band (never ducked). */
  boss_windup: oneShot({
    bus: 'warn',
    gain: 0.85,
    priority: Priority.warning,
    render: simple(({ rate, rng }) => {
      const sec = 0.95;
      const n = len(rate, sec);
      const t = new Track(rate, sec);
      const growl = saturate(
        lowpass(
          osc('saw', n, rate, (x) => 85 + 150 * (x / sec) ** 1.4),
          rate,
          1100,
          1.1,
        ),
        1.8,
      );
      for (let i = 0; i < n; i++) growl[i]! *= 0.6 + 0.4 * Math.sin(TAU * (16 + 10 * (i / n)) * (i / rate));
      mul(
        growl,
        envelope(n, rate, [
          [0, 0],
          [0.12, 0.7],
          [sec * 0.92, 1],
          [sec, 0],
        ]),
      );
      t.add(growl, 0, 0.9);
      t.add(mul(nburst(rate, sec, rng, 'bp', 700, 2600, 1.3, 99, 0.25), window(n, rate, 0.2, 0.03)), 0, 0.35);
      return t;
    }),
  }),

  /** The boss's attack lands: a heavy blow with a metallic ring, brighter than the Wahala Crush slam. */
  boss_impact: oneShot({
    gain: 1,
    priority: Priority.big,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 1.6);
      t.add(thump(rate, 0.9, 105, 32, 0.09, 0.3, 2.3, 0.5), 0, 1.15);
      t.add(bell(rate, 0.8, 190, 0.25, [1, 2.3, 4.1, 6.7]), 0, 0.28);
      t.add(nburst(rate, 0.5, rng, 'lp', 2600, 250, 0.8, 0.14, 0.003), 0, 0.8);
      t.add(air(rate, 0.08, rng, 2400, 0.012, 0.0003), 0, 0.7);
      yield;
      return yield* addReverbSteps(t, 'hall', 0.22);
    },
  }),

  /** The vulnerability window opens: a bright rising arpeggio with a shimmer (clearly not a UI blip). */
  boss_exposed: oneShot({
    bus: 'warn',
    gain: 0.8,
    priority: Priority.warning,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.1);
      pluckChain(t, rate, [783.99, 1174.7, 1568, 2093], 0.085, 0.16, 0.8);
      t.add(air(rate, 0.6, rng, 6000, 0.2, 0.05), 0.05, 0.25);
      return t;
    }),
  }),

  /** The boss's protection comes back: a downward metallic zap into a hum. */
  boss_shield: oneShot({
    gain: 0.8,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.8);
      t.add(nburst(rate, 0.35, rng, 'bp', 4200, 500, 1.2, 0.12, 0.004), 0, 0.7);
      t.add(bell(rate, 0.6, 310, 0.14, [1, 2.76, 5.4]), 0.03, 0.4);
      const n = len(rate, 0.5);
      t.add(mul(lowpass(osc('saw', n, rate, 140), rate, 700, 0.9), window(n, rate, 0.04, 0.3)), 0.1, 0.25);
      return t;
    }),
  }),

  /** A punch interrupts the boss: a crack with a rising ring. */
  boss_interrupt: oneShot({
    gain: 0.9,
    priority: Priority.big,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.8);
      t.add(thump(rate, 0.2, 170, 65, 0.02, 0.07, 1.8, 0.55), 0, 1);
      t.add(air(rate, 0.1, rng, 2600, 0.015, 0.0004), 0, 0.7);
      pluckChain(t, rate, [1046.5, 1568], 0.09, 0.12, 0.6);
      return t;
    }),
  }),

  /** A blast reaches the exposed boss: a heavy blow and a groan that sinks. */
  boss_hit_big: oneShot({
    gain: 1,
    priority: Priority.big,
    render: function* ({ rate }) {
      const t = new Track(rate, 1.5);
      t.add(thump(rate, 0.7, 100, 34, 0.08, 0.24, 2.2, 0.5), 0, 1.1);
      t.add(bell(rate, 0.6, 240, 0.2, [1, 2.3, 4.1]), 0, 0.25);
      const n = len(rate, 0.9);
      const groan = lowpass(
        osc('saw', n, rate, (x) => 160 * Math.pow(0.55, x / 0.9)),
        rate,
        800,
        0.9,
      );
      t.add(mul(groan, window(n, rate, 0.04, 0.4)), 0.12, 0.45);
      yield;
      return yield* addReverbSteps(t, 'yard', 0.2);
    },
  }),

  /** The boss falls: a long impact, a sagging horn and a rumble. */
  boss_down: oneShot({
    gain: 1,
    priority: Priority.jingle,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 3);
      t.add(thump(rate, 1.2, 95, 28, 0.12, 0.45, 2.3, 0.45), 0, 1.2);
      t.add(nburst(rate, 1.2, rng, 'lp', 1800, 120, 0.8, 0.4, 0.004), 0, 0.8);
      t.add(
        horn({
          rate,
          seconds: 1.8,
          notes: [98, 123.5],
          attack: 0.1,
          hold: 0.6,
          release: 1.1,
          lp: 800,
          bellHz: 500,
          bellGain: 0.4,
          rasp: 0.2,
          raspHz: 7,
          sag: 0.88,
        }),
        0.35,
        0.6,
      );
      for (let k = 0; k < 20; k++)
        t.add(
          nburst(rate, 0.07, rng, 'bp', between(rng, 450, 2800), null, 3, 0.014, 0.0005),
          0.5 + rng() * 1.6,
          between(rng, 0.08, 0.3),
          between(rng, -0.7, 0.7),
        );
      yield;
      return yield* addReverbSteps(t, 'hall', 0.3);
    },
  }),

  /** One heavy footfall (the boss walking). */
  step_heavy: oneShot({
    gain: 0.8,
    priority: Priority.normal,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.55);
      t.add(thump(rate, 0.4, 230, 125, 0.04, 0.1, 2, 0.8), 0, 0.8);
      t.add(nburst(rate, 0.25, rng, 'bp', 700, 350, 0.9, 0.09, 0.003), 0, 1);
      return t;
    }),
  }),

  /** The relay jammer protecting a boss: a pulsing electrical hum. Integer-Hz partials over exactly 1 s: it loops cleanly. */
  jammer_loop: loop({
    rmsDb: -27,
    rate: 16000,
    bus: 'sfx',
    render: simple(({ rate }) => {
      const n = len(rate, 1);
      const t = new Track(rate, 1);
      const x = new Float32Array(n);
      for (const [f, a] of [
        [120, 1],
        [240, 0.5],
        [360, 0.3],
        [600, 0.12],
      ] as const)
        for (let i = 0; i < n; i++) x[i]! += a * Math.sin((TAU * f * i) / rate);
      for (let i = 0; i < n; i++) x[i]! *= 0.55 + 0.45 * Math.sin((TAU * 4 * i) / rate) ** 2;
      t.add(x, 0, 0.5);
      return t;
    }),
  }),
};
