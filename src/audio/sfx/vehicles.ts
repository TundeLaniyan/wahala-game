/**
 * Vehicle sounds. Each attack vehicle has a distinct warning pattern so it can be told apart by ear:
 *  - Danfo: deep double honk (two long low honks)
 *  - Taxi:  two-tone beeps (high-low-high-low)
 *  - Keke:  buzzy putt-putt plus a squeaky "pip-pip"
 * Warnings run at Priority.warning and are never ducked by music/crowd.
 */
import type { VehicleKind } from '../../sim';
import { Priority } from '../voices';
import { noiseBurst, tone } from '../synth';
import { jit, play } from './runtime';
import type { SfxRuntime } from './runtime';

export function vehicleWarning(rt: SfxRuntime, kind: VehicleKind, pan: number): void {
  play(rt, { priority: Priority.warning, duration: 1.4, pan }, (v, t) => {
    if (kind === 'danfo') {
      for (const dt of [0, 0.55]) {
        // two horn reeds a minor third apart give the classic bus "baaaarp"
        tone(v, {
          type: 'sawtooth',
          f0: 196,
          t: t + dt,
          dur: 0.42,
          gain: 0.26,
          lp: 1400,
          attack: 0.012,
          hold: 0.22,
        });
        tone(v, {
          type: 'sawtooth',
          f0: 233,
          t: t + dt,
          dur: 0.42,
          gain: 0.22,
          lp: 1400,
          attack: 0.012,
          hold: 0.22,
        });
      }
      tone(v, { type: 'sawtooth', f0: 48, f1: 52, t, dur: 1.2, gain: 0.2, lp: 180, attack: 0.1 });
    } else if (kind === 'taxi') {
      [880, 660, 880, 660].forEach((f, i) => {
        tone(v, {
          type: 'square',
          f0: f,
          t: t + i * 0.3,
          dur: 0.17,
          gain: 0.17,
          lp: 2600,
          attack: 0.006,
          hold: 0.09,
        });
      });
    } else {
      for (let i = 0; i < 11; i++) {
        tone(v, { type: 'square', f0: jit(rt, 92, 0.06), t: t + i * 0.105, dur: 0.075, gain: 0.2, lp: 650 });
        noiseBurst(v, { t: t + i * 0.105, dur: 0.04, gain: 0.07, filter: 'bandpass', f0: 900, q: 1.5 });
      }
      for (const dt of [0.1, 0.38]) {
        tone(v, { type: 'triangle', f0: 1250, f1: 1100, t: t + dt, dur: 0.14, gain: 0.14, hold: 0.06 });
      }
    }
  });
}

const LAUNCH = {
  danfo: { n0: 180, n1: 520, e0: 50, e1: 88, type: 'sawtooth', lp: 320, dur: 1.0 },
  taxi: { n0: 450, n1: 1400, e0: 85, e1: 170, type: 'sawtooth', lp: 700, dur: 0.8 },
  keke: { n0: 700, n1: 1700, e0: 105, e1: 190, type: 'square', lp: 900, dur: 0.8 },
} as const;

export function vehicleLaunched(rt: SfxRuntime, kind: VehicleKind, pan: number): void {
  const s = LAUNCH[kind];
  play(rt, { priority: Priority.normal, duration: s.dur + 0.2, pan }, (v, t) => {
    noiseBurst(v, { t, dur: s.dur, gain: 0.3, filter: 'bandpass', f0: s.n0, f1: s.n1, q: 0.9, attack: 0.2 });
    tone(v, {
      type: s.type,
      f0: s.e0,
      f1: s.e1,
      t,
      dur: s.dur,
      gain: 0.26,
      lp: s.lp,
      lp1: s.lp * 2.5,
      attack: 0.08,
    });
  });
}

export function vehicleHitPlayer(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.big, duration: 0.5, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 170, f1: 55, t, dur: 0.2, gain: 0.6 });
    noiseBurst(v, { t, dur: 0.1, gain: 0.3, filter: 'bandpass', f0: 800, q: 0.8 });
    tone(v, { type: 'triangle', f0: 800, f1: 300, t: t + 0.05, dur: 0.2, gain: 0.1 }); // comic "bonk"
  });
}

export function vehicleHitGenerator(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.5, pan }, (v, t) => {
    tone(v, { type: 'square', f0: 330, f1: 280, t, dur: 0.22, gain: 0.12, lp: 2000 });
    tone(v, { type: 'sine', f0: 140, f1: 60, t, dur: 0.15, gain: 0.5 });
    noiseBurst(v, { t, dur: 0.08, gain: 0.25, filter: 'bandpass', f0: 2200, q: 2 });
  });
}

export function vehicleDamaged(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.normal, duration: 0.4, pan }, (v, t) => {
    noiseBurst(v, { t, dur: 0.12, gain: 0.3, filter: 'bandpass', f0: 2000, q: 3 });
    tone(v, { type: 'square', f0: 230, f1: 105, t, dur: 0.17, gain: 0.12, lp: 1100 });
    tone(v, { type: 'sine', f0: 120, f1: 60, t, dur: 0.14, gain: 0.35 });
  });
}

export function vehicleDestroyed(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.big, duration: 1.5, pan }, (v, t) => {
    noiseBurst(v, { t, dur: 0.9, gain: 0.55, filter: 'lowpass', f0: 4200, f1: 200 });
    tone(v, { type: 'sine', f0: 115, f1: 38, t, dur: 0.6, gain: 0.8 });
    for (let i = 0; i < 6; i++) {
      tone(v, {
        type: 'triangle',
        f0: 400 + rt.rand() * 1100,
        f1: 200,
        t: t + 0.08 + rt.rand() * 0.6,
        dur: 0.06,
        gain: 0.1,
      });
    }
    // dying horn
    tone(v, { type: 'sawtooth', f0: 310, f1: 70, t: t + 0.05, dur: 0.7, gain: 0.14, lp: 1100, lp1: 200 });
  });
}

/** Soft cue when the player enters / leaves vehicle-selection mode. */
export function vehicleEntry(rt: SfxRuntime, began: boolean): void {
  play(rt, { priority: Priority.normal, duration: 0.3 }, (v, t) => {
    const [a, b] = began ? [520, 780] : [620, 420];
    tone(v, { type: 'triangle', f0: a, t, dur: 0.1, gain: 0.14 });
    tone(v, { type: 'triangle', f0: b, t: t + 0.08, dur: 0.12, gain: 0.14 });
  });
}
