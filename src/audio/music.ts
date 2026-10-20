/**
 * Procedural music sequencer: a look-ahead scheduler (setInterval + AudioContext clock) that
 * writes kick, shaker, clave, bass and a plucked highlife-style riff, with congas / backbeat / bells
 * layering in as `intensity` rises. Scheduling uses an absolute step clock so it never drifts.
 */
import type { Buses } from './buses';
import * as P from './musicPatterns';
import { clamp01, semis } from './rng';
import { noiseBurst, tone } from './synth';
import type { Sink } from './synth';
import type { AudioBufferLike, AudioContextLike } from './webaudio';

export interface Music {
  readonly running: boolean;
  start(): void;
  stop(): void;
  /** 0..1: more percussion, a little faster. Smoothed internally. */
  setIntensity(level: number): void;
  dispose(): void;
}

const LOOKAHEAD_S = 0.25;
const PUMP_MS = 60;
const smoothstep = (lo: number, hi: number, v: number): number => {
  const x = clamp01((v - lo) / (hi - lo));
  return x * x * (3 - 2 * x);
};
/** Layer gain 0..1 that is fully on at `at`, starting `0.2` below it. */
const layer = (intensity: number, at: number): number => smoothstep(at - 0.2, at, intensity);

interface Deps {
  ctx: AudioContextLike;
  noise: AudioBufferLike;
  buses: Buses;
}

export function createMusic({ ctx, noise, buses }: Deps): Music {
  const sink: Sink = { ctx, noise, dest: buses.music };
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextTime = 0;
  let step = 0; // global step counter, loops over BARS * STEPS_PER_BAR
  let target = 0;
  let intensity = 0;

  const kick = (t: number, vel: number): void => {
    tone(sink, { type: 'sine', f0: 135, f1: 46, glide: 0.09, t, dur: 0.24, gain: 0.7 * vel });
    noiseBurst(sink, { t, dur: 0.015, gain: 0.12 * vel, filter: 'lowpass', f0: 2500 });
  };
  const shaker = (t: number, vel: number): void => {
    noiseBurst(sink, { t, dur: 0.045, gain: 0.07 * vel, filter: 'highpass', f0: 7000, q: 0.5 });
  };
  const clave = (t: number): void => {
    tone(sink, { type: 'sine', f0: 1900, f1: 1750, t, dur: 0.06, gain: 0.1 });
    tone(sink, { type: 'triangle', f0: 2650, t, dur: 0.02, gain: 0.04 });
  };
  const conga = (t: number, high: 0 | 1, vel: number, g: number): void => {
    if (g <= 0.02) return;
    if (high) {
      tone(sink, { type: 'sine', f0: 360, f1: 280, glide: 0.05, t, dur: 0.1, gain: 0.22 * vel * g });
      noiseBurst(sink, { t, dur: 0.02, gain: 0.05 * g, filter: 'bandpass', f0: 1800, q: 1 });
    } else {
      tone(sink, { type: 'sine', f0: 220, f1: 150, glide: 0.08, t, dur: 0.2, gain: 0.3 * vel * g });
    }
  };
  const backbeat = (t: number, vel: number, g: number): void => {
    noiseBurst(sink, { t, dur: 0.11, gain: 0.16 * vel * g, filter: 'bandpass', f0: 1900, q: 0.8 });
    tone(sink, { type: 'sine', f0: 200, f1: 150, t, dur: 0.09, gain: 0.18 * vel * g });
  };
  const hat = (t: number, g: number): void => {
    noiseBurst(sink, { t, dur: 0.12, gain: 0.07 * g, filter: 'highpass', f0: 8000 });
  };
  const bell = (t: number, high: number, g: number): void => {
    const f = high ? 1400 : 1050;
    tone(sink, { type: 'sine', f0: f, t, dur: 0.14, gain: 0.07 * g });
    tone(sink, { type: 'triangle', f0: f * 1.5, t, dur: 0.07, gain: 0.025 * g });
  };
  const bass = (t: number, midiOffset: number, vel: number, dur: number): void => {
    const f = P.BASS_A1 * semis(midiOffset);
    tone(sink, { type: 'sine', f0: f, t, dur, gain: 0.5 * vel, attack: 0.006 });
    tone(sink, { type: 'triangle', f0: f * 2, t, dur: dur * 0.6, gain: 0.08 * vel, lp: 700 });
  };
  const pluck = (t: number, semi: number, vel: number, dur: number, octave: number): void => {
    const f = P.GUITAR_A3 * semis(semi);
    tone(sink, { type: 'sawtooth', f0: f, t, dur, gain: 0.07 * vel, lp: 3200, lp1: 500, attack: 0.003 });
    tone(sink, { type: 'triangle', f0: f, t, dur: dur * 0.9, gain: 0.09 * vel, attack: 0.003 });
    if (octave > 0.05) {
      tone(sink, { type: 'triangle', f0: f * 2, t, dur: dur * 0.6, gain: 0.05 * vel * octave });
    }
  };

  const scheduleStep = (g: number, time: number, stepDur: number): void => {
    const bar = Math.floor(g / P.STEPS_PER_BAR) % P.BARS;
    const s = g % P.STEPS_PER_BAR;
    const t = time + (s % 2 === 1 ? P.SWING * stepDur : 0);
    const conga_ = layer(intensity, P.LAYER_AT.conga);
    const back = layer(intensity, P.LAYER_AT.backbeat);
    const bells = layer(intensity, P.LAYER_AT.bell);

    for (const [st, v] of P.KICK) if (st === s) kick(t, v);
    if (bells > 0.5) for (const [st, v] of P.KICK_EXTRA) if (st === s) kick(t, v * bells);
    shaker(t, P.SHAKER_VEL[s]! * (0.8 + 0.4 * intensity));
    if (P.CLAVE.includes(s)) clave(t);
    for (const [st, hi, v] of P.CONGA) if (st === s) conga(t, hi, v, conga_);
    if (back > 0.05) {
      for (const [st, v] of P.BACKBEAT) if (st === s) backbeat(t, v, back);
      if (P.HAT_OFFBEATS.includes(s)) hat(t, back);
    }
    if (bells > 0.05) for (const [st, hi] of P.BELL) if (st === s) bell(t, hi, bells);

    const root = P.BASS_ROOTS[bar]!;
    for (const [st, off, v] of P.BASS_PATTERN) if (st === s) bass(t, root + off, v, stepDur * 2.2);
    const riff = P.GUITAR[bar]!;
    for (let i = 0; i < riff.length; i++) {
      const [st, semi, v] = riff[i]!;
      if (st !== s) continue;
      const nextSt = riff[i + 1]?.[0] ?? P.STEPS_PER_BAR;
      const dur = Math.min(3, nextSt - st) * stepDur * 1.1 + 0.08;
      pluck(t, semi, v * (0.85 + 0.25 * intensity), dur, bells);
    }
  };

  const pump = (): void => {
    const now = ctx.currentTime;
    if (nextTime < now - 0.3) nextTime = now + 0.05; // tab was throttled: resync rather than burst
    while (nextTime < now + LOOKAHEAD_S) {
      intensity += (target - intensity) * 0.15;
      const bpm = P.BASE_BPM + (P.MAX_BPM - P.BASE_BPM) * intensity;
      const stepDur = 60 / bpm / 4;
      scheduleStep(step, nextTime, stepDur);
      nextTime += stepDur;
      step = (step + 1) % (P.BARS * P.STEPS_PER_BAR);
    }
  };

  return {
    get running() {
      return timer !== null;
    },
    start() {
      if (timer !== null) return;
      nextTime = ctx.currentTime + 0.08;
      step = 0;
      buses.fadeMusic(1, 0.3);
      pump();
      timer = setInterval(pump, PUMP_MS);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      buses.fadeMusic(0, 0.35);
    },
    setIntensity(level) {
      target = clamp01(level);
    },
    dispose() {
      this.stop();
    },
  };
}
