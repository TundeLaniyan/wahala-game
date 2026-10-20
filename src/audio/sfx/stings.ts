/** Comic eliminations, match jingles and UI sounds. All original, synthesised. */
import { Priority } from '../voices';
import { noiseBurst, tone } from '../synth';
import { play } from './runtime';
import type { SfxRuntime } from './runtime';

export const STING_VARIANTS = 3;

/** Non-graphic comic elimination sting: slide whistle / boing / trombone "womp". */
export function eliminationSting(rt: SfxRuntime, variant: number, pan: number): void {
  play(rt, { priority: Priority.big, duration: 1.9, pan }, (v, t) => {
    tone(v, { type: 'sine', f0: 140, f1: 55, t, dur: 0.18, gain: 0.5 }); // soft "poof" so it reads as impact
    if (variant % STING_VARIANTS === 0) {
      tone(v, { type: 'sine', f0: 1500, f1: 230, t: t + 0.05, dur: 0.75, gain: 0.2, attack: 0.02 });
      tone(v, { type: 'sine', f0: 3000, f1: 460, t: t + 0.05, dur: 0.75, gain: 0.03 });
      tone(v, { type: 'sawtooth', f0: 220, f1: 207, t: t + 0.85, dur: 0.3, gain: 0.2, lp: 800, lp1: 400 });
      tone(v, { type: 'sawtooth', f0: 185, f1: 130, t: t + 1.2, dur: 0.6, gain: 0.2, lp: 800, lp1: 300 });
    } else if (variant % STING_VARIANTS === 1) {
      tone(v, { type: 'sine', f0: 180, f1: 560, t: t + 0.05, dur: 0.22, gain: 0.3 });
      tone(v, { type: 'sine', f0: 560, f1: 150, t: t + 0.27, dur: 0.4, gain: 0.3 });
      tone(v, { type: 'sawtooth', f0: 165, f1: 123, t: t + 0.8, dur: 0.7, gain: 0.2, lp: 700, lp1: 280 });
    } else {
      [262, 247, 233].forEach((f, i) => {
        tone(v, {
          type: 'sawtooth',
          f0: f * 1.5,
          f1: f * 1.45,
          t: t + 0.1 + i * 0.3,
          dur: 0.28,
          gain: 0.18,
          lp: 1100,
          lp1: 500,
        });
      });
      tone(v, { type: 'sawtooth', f0: 175, f1: 110, t: t + 1.0, dur: 0.8, gain: 0.2, lp: 900, lp1: 250 });
    }
  });
}

/** Happy win jingle: pentatonic flourish into a held chord, with shaker and kick. */
export function winJingle(rt: SfxRuntime): void {
  play(rt, { priority: Priority.jingle, duration: 2.4 }, (v, t) => {
    [659.3, 784, 880, 1046.5, 1318.5].forEach((f, i) => {
      tone(v, { type: 'triangle', f0: f, t: t + i * 0.1, dur: 0.3, gain: 0.26 });
      tone(v, { type: 'sine', f0: f * 2, t: t + i * 0.1, dur: 0.18, gain: 0.05 });
    });
    for (const f of [523.3, 659.3, 784, 1046.5]) {
      tone(v, { type: 'triangle', f0: f, t: t + 0.55, dur: 1.5, gain: 0.15, attack: 0.02 });
    }
    tone(v, { type: 'sine', f0: 130.8, t: t + 0.55, dur: 1.4, gain: 0.3 });
    tone(v, { type: 'sine', f0: 120, f1: 45, t, dur: 0.2, gain: 0.5 });
    for (let i = 0; i < 8; i++) {
      noiseBurst(v, { t: t + 0.55 + i * 0.12, dur: 0.06, gain: 0.07, filter: 'highpass', f0: 6500 });
    }
  });
}

/** Gentle "aww" when somebody else won. */
export function loseSting(rt: SfxRuntime): void {
  play(rt, { priority: Priority.jingle, duration: 1.6 }, (v, t) => {
    [392, 349, 330, 262].forEach((f, i) => {
      tone(v, { type: 'triangle', f0: f, t: t + i * 0.22, dur: i === 3 ? 0.8 : 0.25, gain: 0.22, lp: 1500 });
    });
  });
}

/** Neutral "hmm, nobody won" sting. */
export function drawSting(rt: SfxRuntime): void {
  play(rt, { priority: Priority.jingle, duration: 1.8 }, (v, t) => {
    [
      [392, 0],
      [392, 0.28],
      [330, 0.56],
    ].forEach(([f, dt], i) => {
      tone(v, { type: 'triangle', f0: f!, t: t + dt!, dur: i === 2 ? 0.9 : 0.24, gain: 0.24, lp: 1800 });
    });
    tone(v, { type: 'sine', f0: 110, f1: 70, t: t + 0.56, dur: 0.8, gain: 0.3 });
    noiseBurst(v, { t: t + 0.56, dur: 0.15, gain: 0.1, filter: 'bandpass', f0: 800 });
  });
}

export type UiKind = 'click' | 'back' | 'start' | 'countdown' | 'go';

export function ui(rt: SfxRuntime, kind: UiKind): void {
  play(rt, { priority: Priority.normal, duration: 0.8 }, (v, t) => {
    switch (kind) {
      case 'click':
        tone(v, { type: 'sine', f0: 1300, f1: 900, t, dur: 0.05, gain: 0.2 });
        noiseBurst(v, { t, dur: 0.02, gain: 0.05, filter: 'highpass', f0: 4000 });
        break;
      case 'back':
        tone(v, { type: 'sine', f0: 760, f1: 480, t, dur: 0.07, gain: 0.2 });
        break;
      case 'start':
        [420, 560, 840].forEach((f, i) =>
          tone(v, { type: 'triangle', f0: f, t: t + i * 0.08, dur: 0.14, gain: 0.22 }),
        );
        break;
      case 'countdown':
        tone(v, { type: 'sine', f0: 660, t, dur: 0.18, gain: 0.34 });
        tone(v, { type: 'triangle', f0: 1320, t, dur: 0.08, gain: 0.07 });
        break;
      case 'go':
        tone(v, { type: 'triangle', f0: 1320, t, dur: 0.5, gain: 0.3, attack: 0.01 });
        tone(v, { type: 'triangle', f0: 990, t, dur: 0.5, gain: 0.2 });
        tone(v, { type: 'sine', f0: 660, t, dur: 0.5, gain: 0.2 });
        noiseBurst(v, {
          t,
          dur: 0.35,
          gain: 0.12,
          filter: 'bandpass',
          f0: 600,
          f1: 3000,
          q: 0.8,
          attack: 0.1,
        });
        break;
    }
  });
}
