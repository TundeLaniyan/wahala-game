/**
 * Warning sounds for fuses, wahala-crush and crowd throws.
 * Their energy sits in the reserved warning band (about 2-4 kHz, see WARN_BAND_HZ) which the music
 * is notched around and the crowd bed is filtered below.
 */
import { Priority } from '../voices';
import { noiseBurst, tone } from '../synth';
import { clamp01 } from '../rng';
import { play } from './runtime';
import type { SfxRuntime } from './runtime';

/** One fuse tick; `urgency` 0 (just lit) .. 1 (about to go). Pitch and loudness rise with urgency. */
export function fuseTick(rt: SfxRuntime, urgency: number, pan: number): void {
  const u = clamp01(urgency);
  play(rt, { priority: Priority.fuse, duration: 0.12, pan }, (v, t) => {
    const f = 2200 + 1300 * u;
    tone(v, { type: 'square', f0: f, f1: f * 0.8, t, dur: 0.035, gain: 0.07 + 0.1 * u, lp: 5000 });
    noiseBurst(v, { t, dur: 0.025, gain: 0.06 + 0.06 * u, filter: 'bandpass', f0: f * 1.2, q: 3 });
    if (u > 0.65) {
      // rattle: gritty buzz under the tick as the fuse runs out
      tone(v, { type: 'sawtooth', f0: 95, t, dur: 0.06, gain: 0.12, lp: 500 });
      noiseBurst(v, { t, dur: 0.05, gain: 0.1, filter: 'bandpass', f0: 3200, q: 4 });
    }
  });
}

export function crushWarning(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.warning, duration: 1.1, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 46, f1: 38, t, dur: 1.0, gain: 0.32, attack: 0.35 });
    noiseBurst(v, { t, dur: 0.9, gain: 0.2, filter: 'lowpass', f0: 160, q: 0.7, attack: 0.4 });
    for (const dt of [0.1, 0.3]) tone(v, { type: 'sine', f0: 2500, t: t + dt, dur: 0.07, gain: 0.1 });
  });
}

export function crushLanded(rt: SfxRuntime, pan: number): void {
  play(rt, { priority: Priority.big, duration: 1.0, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 95, f1: 32, t, dur: 0.5, gain: 0.85 });
    noiseBurst(v, { t, dur: 0.4, gain: 0.45, filter: 'lowpass', f0: 900, f1: 100 });
    noiseBurst(v, { t, dur: 0.05, gain: 0.25, filter: 'highpass', f0: 2500, attack: 0.001 });
  });
}

export function crowdWarning(rt: SfxRuntime, kind: 'bottle' | 'firecracker', pan: number): void {
  play(rt, { priority: Priority.warning, duration: 1.0, pan }, (v, t) => {
    if (kind === 'bottle') {
      // rising "incoming" whistle
      tone(v, { type: 'sine', f0: 1900, f1: 3000, t, dur: 0.7, gain: 0.15, attack: 0.15 });
      tone(v, { type: 'sine', f0: 1910 * 1.5, f1: 3000 * 1.5, t, dur: 0.7, gain: 0.04, attack: 0.15 });
    } else {
      // accelerating fizz + beeps
      noiseBurst(v, { t, dur: 0.9, gain: 0.1, filter: 'highpass', f0: 4800, attack: 0.1 });
      let dt = 0;
      for (let i = 0; i < 7; i++) {
        tone(v, { type: 'square', f0: 2900 + i * 80, t: t + dt, dur: 0.04, gain: 0.1, lp: 5000 });
        dt += 0.22 - i * 0.025;
      }
    }
  });
}

export function crowdLanded(rt: SfxRuntime, kind: 'bottle' | 'firecracker', pan: number): void {
  play(rt, { priority: Priority.big, duration: 0.9, pan }, (v, t) => {
    if (kind === 'bottle') {
      tone(v, { type: 'sine', f0: 180, f1: 80, t, dur: 0.12, gain: 0.4 });
      noiseBurst(v, { t, dur: 0.12, gain: 0.22, filter: 'highpass', f0: 5000 });
      [2200, 3100, 4100].forEach((f, i) =>
        tone(v, { type: 'sine', f0: f, t: t + i * 0.03, dur: 0.3, gain: 0.08 }),
      );
    } else {
      noiseBurst(v, { t, dur: 0.3, gain: 0.7, filter: 'bandpass', f0: 2500, f1: 500, q: 0.6, attack: 0.001 });
      tone(v, { type: 'sine', f0: 130, f1: 45, t, dur: 0.35, gain: 0.8 });
      noiseBurst(v, { t, dur: 0.07, gain: 0.35, filter: 'highpass', f0: 4000, attack: 0.001 });
    }
  });
}
