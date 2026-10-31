/**
 * Vehicles: horns, engine loops, launches, pass-bys, Okada, impacts and wrecks. All SYNTHESISED.
 *
 * Horn bands (so the three attack vehicles stay tellable apart and cut through the mix):
 *  - Danfo: deep two-note major-third bus horn (fundamentals ~150-190 Hz, strong harmonics 450-1200 Hz).
 *  - Taxi:  two-tone "bi-bu" peeps alternating 880/660 Hz (fundamentals 600-1800 Hz).
 *  - Keke:  squeaky rubber-bulb double honk gliding up around 1.2 kHz.
 */
import { Track, between, envelope, mul, osc, saturate, bandpass, white, window } from '../dsp/core';
import { Priority } from '../voices';
import { addReverbSteps, bell, chime, engine, horn, len, nburst, thump } from './kit';
import type { EngineSpec, HornSpec } from './kit';
import { loop, oneShot, simple } from './types';
import type { VehicleKind } from '../../sim';

type Kind = VehicleKind;
type EngineParams = Omit<EngineSpec, 'rate' | 'seconds' | 'rng'>;

const ENGINES: Record<Kind, EngineParams> = {
  // heavy diesel: lumpy, clattery
  danfo: {
    fire: 24,
    harmonics: 40,
    tilt: 0.3,
    peakHz: 300,
    peakGain: 1.4,
    clatter: 1.3,
    clatterHz: 2200,
    clatterQ: 1,
    rough: 0.55,
    lp: 3500,
    hp: 70,
    drive: 1.8,
  },
  // smooth four-cylinder petrol hum
  taxi: {
    fire: 40,
    harmonics: 24,
    tilt: 0.7,
    peakHz: 450,
    peakGain: 1.2,
    clatter: 0.15,
    clatterHz: 1500,
    clatterQ: 1,
    rough: 0.1,
    lp: 2200,
    hp: 80,
    drive: 1.2,
  },
  // buzzy three-wheeler 2-stroke putt-putt
  keke: {
    fire: 32,
    harmonics: 30,
    tilt: 0.3,
    peakHz: 900,
    peakGain: 2.0,
    clatter: 0.7,
    clatterHz: 1900,
    clatterQ: 1.3,
    rough: 0.6,
    lp: 3800,
    hp: 90,
    drive: 2.2,
  },
};

const HORNS: Record<Kind, HornSpec> = {
  danfo: {
    rate: 32000,
    seconds: 0.6,
    notes: [148, 186],
    attack: 0.03,
    hold: 0.4,
    release: 0.14,
    lp: 1700,
    bellHz: 620,
    bellGain: 1.1,
    rasp: 0.25,
    raspHz: 70,
    sag: 0.985,
  },
  taxi: {
    rate: 32000,
    seconds: 0.3,
    notes: [880],
    attack: 0.008,
    hold: 0.14,
    release: 0.05,
    lp: 3000,
    bellHz: 1700,
    bellGain: 0.8,
    rasp: 0.08,
    raspHz: 55,
  },
  keke: {
    rate: 32000,
    seconds: 0.2,
    notes: [1180],
    attack: 0.006,
    hold: 0.1,
    release: 0.05,
    lp: 3200,
    bellHz: 2400,
    bellGain: 0.9,
    rasp: 0.3,
    raspHz: 45,
    sag: 1.12,
  },
};

function hornSound(kind: Kind) {
  return oneShot({
    bus: 'warn',
    priority: Priority.warning,
    gain: 0.95,
    render: function* ({ rate }) {
      const t = new Track(rate, 1.9);
      const h = (over: Partial<HornSpec>): Float32Array => horn({ ...HORNS[kind], rate, ...over });
      if (kind === 'danfo') {
        t.add(h({ seconds: 0.62 }), 0, 1);
        t.add(h({ seconds: 0.95, hold: 0.75, release: 0.18, notes: [140, 176] }), 0.62, 1);
        t.add(thump(rate, 1.5, 52, 50, 1, 0.9, 0), 0, 0.12);
      } else if (kind === 'taxi') {
        [880, 660, 880, 660].forEach((f, i) => t.add(h({ notes: [f] }), i * 0.3, 1));
      } else {
        t.add(h({}), 0, 1);
        t.add(h({ notes: [1250] }), 0.24, 1);
      }
      yield;
      return yield* addReverbSteps(t, 'booth', 0.12);
    },
  });
}

function engineLoop(kind: Kind) {
  return loop({
    bus: 'sfx',
    rate: 24000,
    rmsDb: kind === 'danfo' ? -15 : kind === 'taxi' ? -17 : -16,
    priority: Priority.fuse,
    render: simple(({ rate, rng }) => {
      const X = len(rate, 0.06);
      const e = engine({ rate, seconds: 1.06, rng, ...ENGINES[kind] });
      const n = e.length;
      for (let i = 0; i < n; i++) e[i]! *= 0.9 + 0.1 * Math.sin((2 * Math.PI * 2 * i) / rate);
      // seamless: cross-fade tail onto head
      const L = n - X;
      const out = new Track(rate, L / rate);
      for (let i = 0; i < L; i++) {
        let v = e[i]!;
        if (i < X) {
          const u = i / X;
          v = e[i]! * Math.sin((u * Math.PI) / 2) + e[L + i]! * Math.cos((u * Math.PI) / 2);
        }
        out.l[i] = v;
        out.r[i] = v;
      }
      return out;
    }),
  });
}

function launchSound(kind: Kind) {
  return oneShot({
    rate: 24000,
    priority: Priority.normal,
    gain: 0.9,
    render: function* ({ rate, rng }) {
      const base = ENGINES[kind];
      const T = 1.0;
      const e = engine({
        rate,
        seconds: T,
        rng,
        ...base,
        fire: (t) =>
          (base.fire as number) *
          (0.8 + 0.95 * Math.pow(t / T, 1.15)) *
          (1 - 0.22 * Math.exp(-Math.pow((t / T - 0.55) / 0.04, 2))),
      });
      const t = new Track(rate, 1.2);
      t.add(
        mul(
          e,
          envelope(e.length, rate, [
            [0, 0.3],
            [0.2, 0.8],
            [0.6, 1],
            [1.0, 0.7],
          ]),
        ),
        0,
        1,
      );
      t.add(nburst(rate, 0.9, rng, 'bp', 350, 1500, 0.9, 0.5, 0.2), 0, 0.35);
      yield;
      return yield* addReverbSteps(t, 'booth', 0.12);
    },
  });
}

/** Doppler-style pass: pitch glides down as the vehicle crosses; amplitude peaks at the crossing. */
function passSound(kind: Kind) {
  return oneShot({
    rate: 24000,
    priority: Priority.normal,
    gain: 0.9,
    render: function* ({ rate, rng }) {
      const base = ENGINES[kind];
      const T = 1.5;
      const e = engine({
        rate,
        seconds: T,
        rng,
        ...base,
        fire: (t) => (base.fire as number) * 1.2 * (1 + 0.14 * Math.tanh(-(t - T / 2) / 0.17)),
      });
      const n = e.length;
      const bell1 = envelope(n, rate, [
        [0, 0.05],
        [T * 0.35, 0.5],
        [T / 2, 1],
        [T * 0.65, 0.5],
        [T, 0.05],
      ]);
      mul(e, bell1);
      const t = new Track(rate, T + 0.2);
      t.add(e, 0, 1);
      const whoosh = bandpass(white(n, rng), rate, (i) => 1100 - 500 * (i / n), 0.9);
      t.add(mul(whoosh, bell1), 0, 0.7);
      yield;
      return yield* addReverbSteps(t, 'booth', 0.1);
    },
  });
}

/** The commuter railcar's horn: a low two-tone diesel horn, one short and one long blast (deeper than any road vehicle). */
function trainHorn() {
  return oneShot({
    bus: 'warn',
    priority: Priority.warning,
    gain: 0.95,
    render: function* ({ rate }) {
      const t = new Track(rate, 2.1);
      const blast = (seconds: number, hold: number): Float32Array =>
        horn({
          rate,
          seconds,
          notes: [196, 247],
          attack: 0.04,
          hold,
          release: 0.14,
          lp: 1500,
          bellHz: 520,
          bellGain: 1,
          rasp: 0.16,
          raspHz: 60,
          sag: 0.99,
        });
      t.add(blast(0.55, 0.4), 0, 1);
      t.add(blast(1.2, 0.98), 0.7, 1);
      t.add(thump(rate, 1.6, 46, 44, 1, 0.9, 0), 0, 0.1);
      yield;
      return yield* addReverbSteps(t, 'yard', 0.14);
    },
  });
}

/** The level-crossing bell: two alternating metal strikes (a high and a low) ringing for about two seconds. */
function railBell() {
  return oneShot({
    bus: 'warn',
    priority: Priority.warning,
    gain: 0.8,
    render: function* ({ rate }) {
      const t = new Track(rate, 2.2);
      for (let i = 0; i < 7; i++) t.add(bell(rate, 0.5, i % 2 ? 1180 : 940, 0.18), i * 0.26, 0.8);
      yield;
      return yield* addReverbSteps(t, 'yard', 0.08);
    },
  });
}

/** A railcar rushing past: wheel clatter over the joints, a rising and falling rush and a low rumble. */
function trainPass() {
  return oneShot({
    rate: 24000,
    priority: Priority.normal,
    gain: 0.85,
    render: function* ({ rate, rng }) {
      const T = 1.4;
      const n = len(rate, T);
      const swell = envelope(n, rate, [
        [0, 0.05],
        [T * 0.3, 0.6],
        [T * 0.5, 1],
        [T * 0.75, 0.5],
        [T, 0.05],
      ]);
      const t = new Track(rate, T + 0.2);
      t.add(
        mul(
          bandpass(white(n, rng), rate, (i) => 900 - 350 * (i / n), 0.8),
          swell,
        ),
        0,
        0.7,
      );
      // joints: a short clack every 80 ms under the swell
      for (let k = 0; k < Math.floor(T / 0.08); k++)
        t.add(
          nburst(rate, 0.05, rng, 'bp', 2200, 1400, 1.2, 0.012),
          k * 0.08,
          0.25 * swell[Math.floor(k * 0.08 * rate)]!,
        );
      t.add(thump(rate, T, 58, 52, 1, 0.9, 0), 0, 0.12);
      yield;
      return yield* addReverbSteps(t, 'yard', 0.1);
    },
  });
}

export const vehicleSounds = {
  /** Oshodi Metropolis: the commuter railcar's own cues (never shared with a road vehicle). */
  train_horn: trainHorn(),
  rail_bell: railBell(),
  train_pass: trainPass(),

  danfo_horn: hornSound('danfo'),
  taxi_horn: hornSound('taxi'),
  keke_horn: hornSound('keke'),

  danfo_engine_loop: engineLoop('danfo'),
  taxi_engine_loop: engineLoop('taxi'),
  keke_engine_loop: engineLoop('keke'),

  danfo_launch: launchSound('danfo'),
  taxi_launch: launchSound('taxi'),
  keke_launch: launchSound('keke'),

  danfo_pass: passSound('danfo'),
  taxi_pass: passSound('taxi'),
  keke_pass: passSound('keke'),

  /** Okada mounted: 2-stroke motorbike revving ("brrp-brrrap"). */
  okada_mount: oneShot({
    rate: 24000,
    gain: 0.9,
    render: function* ({ rate, rng }) {
      const e = engine({
        rate,
        seconds: 1.0,
        rng,
        harmonics: 36,
        tilt: 0.7,
        peakHz: 1100,
        peakGain: 2.2,
        clatter: 0.8,
        clatterHz: 2400,
        clatterQ: 1.5,
        rough: 0.3,
        lp: 4200,
        hp: 90,
        drive: 2,
        fire: (t) =>
          30 +
          50 * Math.exp(-Math.pow((t - 0.25) / 0.12, 2)) +
          85 * Math.exp(-Math.pow((t - 0.65) / 0.17, 2)),
      });
      const t = new Track(rate, 1.2);
      t.add(
        mul(
          e,
          envelope(e.length, rate, [
            [0, 0.3],
            [0.12, 1],
            [0.85, 0.9],
            [1, 0],
          ]),
        ),
        0,
        1,
      );
      yield;
      return yield* addReverbSteps(t, 'booth', 0.12);
    },
  }),

  /** Okada broken: comic crunch, clattering metal, falling slide whistle and two squeaky peeps. */
  okada_break: oneShot({
    priority: Priority.big,
    gain: 0.95,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 1.8);
      t.add(saturate(nburst(rate, 0.4, rng, 'lp', 3200, 280, 0.8, 0.12, 0.001), 2), 0, 0.9);
      t.add(thump(rate, 0.3, 135, 48, 0.05, 0.12, 2), 0, 0.9);
      for (let k = 0; k < 14; k++)
        t.add(
          bell(rate, 0.25, between(rng, 500, 3200), 0.08, [1, 2.4, 3.9]),
          0.05 + Math.pow(rng(), 1.3) * 0.6,
          between(rng, 0.12, 0.35),
          between(rng, -0.8, 0.8),
        );
      const n = len(rate, 0.5);
      t.add(
        mul(
          osc('sine', n, rate, (tt) => 1300 * Math.exp(-tt * 3.4) + 200),
          window(n, rate, 0.01, 0.12),
        ),
        0.1,
        0.22,
      );
      for (const at of [0.7, 0.9])
        t.add(
          horn({
            rate,
            seconds: 0.16,
            notes: [1250],
            attack: 0.005,
            hold: 0.09,
            release: 0.04,
            lp: 3300,
            bellHz: 2300,
            bellGain: 0.8,
            rasp: 0.3,
            raspHz: 45,
            sag: 1.1,
          }),
          at,
          0.5,
        );
      yield;
      return yield* addReverbSteps(t, 'yard', 0.2);
    },
  }),

  /** Vehicle hits a player: soft comic "bonk/whump" (non-graphic). */
  vehicle_hit: oneShot({
    priority: Priority.big,
    gain: 1,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 0.9);
      t.add(thump(rate, 0.35, 170, 48, 0.05, 0.14, 2.2), 0, 1);
      t.add(nburst(rate, 0.14, rng, 'bp', 750, 300, 0.8, 0.045), 0, 0.7);
      const n = len(rate, 0.3);
      t.add(
        mul(
          osc('tri', n, rate, (tt) => 820 * Math.exp(-tt * 5) + 240),
          window(n, rate, 0.004, 0.1),
        ),
        0.04,
        0.25,
      );
      yield;
      return yield* addReverbSteps(t, 'booth', 0.15);
    },
  }),

  vehicle_hit_gen: oneShot({
    gain: 0.85,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 1.0);
      t.add(bell(rate, 0.9, 330, 0.28, [1, 2.32, 4.1, 6.7]), 0, 0.8);
      t.add(thump(rate, 0.2, 145, 58, 0.04, 0.08, 1.8), 0, 0.8);
      t.add(nburst(rate, 0.07, rng, 'bp', 2300, null, 2, 0.015, 0.0004), 0, 0.6);
      return t;
    }),
  }),

  vehicle_damage: oneShot({
    gain: 0.85,
    priority: Priority.normal,
    render: simple(({ rate, rng }) => {
      const t = new Track(rate, 0.6);
      for (const at of [0, 0.05, 0.11])
        t.add(nburst(rate, 0.08, rng, 'bp', 2000 + at * 4000, null, 2.5, 0.02, 0.0005), at, 0.7);
      const n = len(rate, 0.35);
      t.add(
        mul(
          osc('saw', n, rate, (tt) => (230 - 400 * tt) * (1 + 0.05 * Math.sin(60 * tt))),
          envelope(n, rate, [
            [0, 0],
            [0.01, 1],
            [0.35, 0],
          ]),
        ),
        0,
        0.18,
      );
      t.add(thump(rate, 0.2, 125, 55, 0.04, 0.08, 1.6), 0, 0.7);
      return t;
    }),
  }),

  /** Vehicle destroyed: blast, falling clanks and a dying horn glide. */
  vehicle_wreck: oneShot({
    priority: Priority.big,
    gain: 1,
    render: function* ({ rate, rng }) {
      const t = new Track(rate, 2.6);
      const n = len(rate, 1.3);
      t.add(
        mul(
          nburst(rate, 1.3, rng, 'lp', 4200, 200, 0.7, 0.35, 0.002),
          envelope(n, rate, [
            [0, 1],
            [1.3, 0.1],
          ]),
        ),
        0,
        0.9,
      );
      t.add(thump(rate, 0.9, 118, 36, 0.1, 0.3, 2.2), 0, 1.1);
      for (let k = 0; k < 16; k++)
        t.add(
          bell(rate, 0.3, between(rng, 350, 3000), 0.1, [1, 2.4, 3.8]),
          0.1 + Math.pow(rng(), 1.4) * 1.0,
          between(rng, 0.1, 0.35),
          between(rng, -0.9, 0.9),
        );
      const dh = len(rate, 0.8);
      t.add(
        mul(
          saturate(
            osc('saw', dh, rate, (tt) => 310 * Math.exp(-tt * 2) + 60),
            1.5,
          ),
          envelope(dh, rate, [
            [0, 0],
            [0.03, 1],
            [0.8, 0],
          ]),
        ),
        0.05,
        0.12,
      );
      t.add(nburst(rate, 1.0, rng, 'hp', 4500, 2000, 0.7, 0.4, 0.2), 0.5, 0.18);
      yield;
      return yield* addReverbSteps(t, 'yard', 0.3);
    },
  }),

  vehicle_entry_on: oneShot({
    gain: 0.5,
    priority: Priority.normal,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.35);
      t.add(chime(rate, 0.2, 520, 0.08, 0.7), 0, 0.8);
      t.add(chime(rate, 0.25, 780, 0.09, 0.7), 0.08, 0.8);
      return t;
    }),
  }),
  vehicle_entry_off: oneShot({
    gain: 0.5,
    priority: Priority.normal,
    render: simple(({ rate }) => {
      const t = new Track(rate, 0.35);
      t.add(chime(rate, 0.2, 620, 0.08, 0.7), 0, 0.8);
      t.add(chime(rate, 0.25, 420, 0.09, 0.7), 0.08, 0.8);
      return t;
    }),
  }),
};
