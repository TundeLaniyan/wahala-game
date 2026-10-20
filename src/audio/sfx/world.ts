/** Generators, blasts, blocks, pickups, skills and floor hazards. */
import { Priority } from '../voices';
import { noiseBurst, tone } from '../synth';
import { clamp01 } from '../rng';
import { jit, play } from './runtime';
import type { SfxRuntime } from './runtime';

export function generatorPlaced(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.8, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 150, f1: 55, t, dur: 0.14, gain: 0.55 });
    noiseBurst(v, { t, dur: 0.06, gain: 0.25, filter: 'bandpass', f0: 900, q: 1.2 });
    tone(v, { type: 'square', f0: 480, f1: 380, t, dur: 0.05, gain: 0.08, lp: 1800 });
    // start-up putter: sputters that settle into a steady idle
    for (let i = 0; i < 5; i++) {
      const dt = t + 0.12 + i * (0.1 + i * 0.012);
      tone(v, { type: 'sawtooth', f0: jit(rt, 62 + i * 3, 0.04), t: dt, dur: 0.085, gain: 0.16, lp: 320 });
    }
  });
}

/** Blast thump + crack. `power` 0..1 scales weight (chain size); `pan` -1..1. */
export function generatorBlast(rt: SfxRuntime, pan: number, power: number): void {
  const p = clamp01(power);
  play(rt, { priority: Priority.big, duration: 1.7, pan }, (v, t) => {
    const lvl = 0.7 + 0.3 * p;
    tone(v, { type: 'sine', f0: jit(rt, 150 - 40 * p, 0.05), f1: 36, t, dur: 0.55, gain: 0.9 * lvl });
    noiseBurst(v, { t, dur: 0.6, gain: 0.55 * lvl, filter: 'lowpass', f0: 2200, f1: 180, q: 0.7 });
    noiseBurst(v, { t, dur: 0.09, gain: 0.4 * lvl, filter: 'highpass', f0: 2600, q: 0.6, attack: 0.001 });
    noiseBurst(v, {
      t: t + 0.05,
      dur: 0.9 + 0.6 * p,
      gain: 0.28,
      filter: 'lowpass',
      f0: 320,
      f1: 70,
      attack: 0.05,
    });
  });
}

/** `count` soft blocks broke at once. */
export function blockCrumble(rt: SfxRuntime, pan: number, count: number): void {
  const n = Math.min(count, 6);
  play(rt, { priority: Priority.ambient, duration: 0.5, pan }, (v, t) => {
    noiseBurst(v, { t, dur: 0.2, gain: 0.2 + 0.03 * n, filter: 'bandpass', f0: 1300, f1: 450, q: 0.9 });
    for (let i = 0; i < 3 + Math.min(n, 3); i++) {
      tone(v, {
        type: 'triangle',
        f0: 300 + rt.rand() * 500,
        f1: 150,
        t: t + 0.04 + rt.rand() * 0.25,
        dur: 0.05,
        gain: 0.1,
      });
    }
  });
}

/** Bright reveal sparkle (a pickup popped out of a block). */
export function pickupRevealed(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.ambient, duration: 0.3, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 1320, t, dur: 0.12, gain: 0.12 });
    tone(v, { type: 'sine', f0: 1760, t: t + 0.06, dur: 0.16, gain: 0.1 });
  });
}

/** Bright arpeggio; `rare` adds a third note and a sparkle. */
export function pickupChime(rt: SfxRuntime, pan: number, rare: boolean): void {
  play(rt, { priority: Priority.normal, duration: 0.7, pan }, (v, t) => {
    const notes = rare ? [880, 1174.7, 1568, 2093] : [880, 1318.5];
    notes.forEach((f, i) => {
      tone(v, { type: 'sine', f0: f, t: t + i * 0.07, dur: 0.28, gain: 0.3 });
      tone(v, { type: 'triangle', f0: f * 2, t: t + i * 0.07, dur: 0.15, gain: 0.06 });
    });
    if (rare) noiseBurst(v, { t: t + 0.2, dur: 0.3, gain: 0.05, filter: 'highpass', f0: 6500 });
  });
}

/** Cursed / wasted pickup: sagging "wah-wah". */
export function pickupWasted(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.8, pan }, (v, t) => {
    tone(v, { type: 'sawtooth', f0: 392, f1: 330, t, dur: 0.3, gain: 0.22, lp: 900, lp1: 400 });
    tone(v, { type: 'sawtooth', f0: 311, f1: 233, t: t + 0.3, dur: 0.45, gain: 0.22, lp: 800, lp1: 300 });
  });
}

export function cursedSting(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.9, pan }, (v, t) => {
    tone(v, { type: 'sawtooth', f0: 277, f1: 196, t, dur: 0.7, gain: 0.16, lp: 900, lp1: 250 });
    tone(v, { type: 'sawtooth', f0: 196, f1: 139, t, dur: 0.7, gain: 0.16, lp: 900, lp1: 250 });
    tone(v, { type: 'sine', f0: 1244, t: t + 0.05, dur: 0.5, gain: 0.06 });
  });
}

export function okadaRev(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 1.0, pan }, (v, t) => {
    tone(v, { type: 'sawtooth', f0: 55, f1: 175, glide: 0.55, t, dur: 0.8, gain: 0.3, lp: 400, lp1: 1500 });
    tone(v, { type: 'square', f0: 110, f1: 350, glide: 0.55, t, dur: 0.8, gain: 0.05, lp: 900 });
    for (let i = 0; i < 5; i++) {
      noiseBurst(v, {
        t: t + 0.05 + i * 0.12,
        dur: 0.07,
        gain: 0.08,
        filter: 'bandpass',
        f0: 450 + i * 120,
        q: 1.5,
      });
    }
  });
}

/** Comic crash + two little beeps. */
export function okadaCrash(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.big, duration: 1.1, pan }, (v, t) => {
    noiseBurst(v, { t, dur: 0.4, gain: 0.5, filter: 'lowpass', f0: 3200, f1: 280 });
    tone(v, { type: 'square', f0: 420, f1: 90, t, dur: 0.35, gain: 0.18, lp: 1400 });
    tone(v, { type: 'sine', f0: 130, f1: 50, t, dur: 0.25, gain: 0.55 });
    for (const dt of [0.4, 0.6])
      tone(v, { type: 'square', f0: 720, t: t + dt, dur: 0.13, gain: 0.14, lp: 2000 });
  });
}

export function push(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.4, pan }, (v, t) => {
    noiseBurst(v, { t, dur: 0.22, gain: 0.32, filter: 'bandpass', f0: 400, f1: 1800, q: 1.1, attack: 0.05 });
    tone(v, { type: 'sine', f0: 140, f1: 70, t: t + 0.1, dur: 0.14, gain: 0.4 });
  });
}

export function dazed(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.7, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 320, f1: 110, t, dur: 0.13, gain: 0.5 });
    [1760, 1480, 1245].forEach((f, i) => {
      tone(v, { type: 'sine', f0: f, t: t + 0.1 + i * 0.1, dur: 0.22, gain: 0.1 });
    });
  });
}

export function hop(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.ambient, duration: 0.2, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 300, f1: 640, t, dur: 0.12, gain: 0.14 });
  });
}

export function generatorKicked(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.3, pan }, (v, t) => {
    tone(v, { type: 'square', f0: 320, f1: 150, t, dur: 0.09, gain: 0.14, lp: 1500 });
    tone(v, { type: 'sine', f0: 200, f1: 100, t, dur: 0.1, gain: 0.4 });
    noiseBurst(v, { t, dur: 0.05, gain: 0.15, filter: 'bandpass', f0: 1500 });
  });
}

export function generatorCarried(rt: SfxRuntime, pan: number, bonus: boolean): void {
  play(rt, { priority: Priority.normal, duration: 0.35, pan }, (v, t) => {
    tone(v, { type: 'triangle', f0: 300, f1: 520, t, dur: 0.1, gain: 0.2 });
    if (bonus) tone(v, { type: 'sine', f0: 880, f1: 1180, t: t + 0.08, dur: 0.14, gain: 0.12 });
  });
}

export function generatorDropped(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.3, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 125, f1: 60, t, dur: 0.14, gain: 0.45 });
    noiseBurst(v, { t, dur: 0.06, gain: 0.15, filter: 'lowpass', f0: 900 });
  });
}

export function generatorThrown(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.5, pan }, (v, t) => {
    noiseBurst(v, { t, dur: 0.32, gain: 0.28, filter: 'bandpass', f0: 500, f1: 1600, q: 1, attack: 0.08 });
    tone(v, { type: 'sine', f0: 240, f1: 480, t, dur: 0.25, gain: 0.1 });
  });
}

export function generatorDisarmed(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.6, pan }, (v, t) => {
    [1000, 800, 600].forEach((f, i) =>
      tone(v, { type: 'square', f0: f, t: t + i * 0.06, dur: 0.035, gain: 0.1 }),
    );
    noiseBurst(v, { t: t + 0.18, dur: 0.3, gain: 0.14, filter: 'lowpass', f0: 2200, f1: 250 });
  });
}

export function dudCleaned(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.ambient, duration: 0.5, pan }, (v, t) => {
    noiseBurst(v, { t, dur: 0.4, gain: 0.12, filter: 'highpass', f0: 3000, f1: 800 });
    tone(v, { type: 'sine', f0: 180, f1: 80, t: t + 0.3, dur: 0.1, gain: 0.2 });
  });
}

export function pickupBurned(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.ambient, duration: 0.35, pan }, (v, t) => {
    noiseBurst(v, { t, dur: 0.28, gain: 0.14, filter: 'highpass', f0: 4200, q: 0.5 });
  });
}

export function pickupDropped(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.ambient, duration: 0.4, pan }, (v, t) => {
    [0, 0.11, 0.19].forEach((dt, i) =>
      tone(v, { type: 'sine', f0: 1200 - i * 90, t: t + dt, dur: 0.09, gain: 0.15 - i * 0.04 }),
    );
  });
}

export function hazard(rt: SfxRuntime, pan: number, kind: 'pothole' | 'oil'): void {
  play(rt, { priority: Priority.normal, duration: 0.5, pan }, (v, t) => {
    if (kind === 'pothole') {
      tone(v, { type: 'sine', f0: 170, f1: 65, t, dur: 0.16, gain: 0.5 });
      noiseBurst(v, { t, dur: 0.2, gain: 0.2, filter: 'lowpass', f0: 600 });
      tone(v, { type: 'square', f0: 260, f1: 200, t: t + 0.1, dur: 0.08, gain: 0.07, lp: 900 });
    } else {
      tone(v, { type: 'sine', f0: 900, f1: 1600, t, dur: 0.18, gain: 0.14 });
      tone(v, { type: 'sine', f0: 1600, f1: 700, t: t + 0.18, dur: 0.22, gain: 0.14 });
    }
  });
}
