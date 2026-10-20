/**
 * Low-level synthesis helpers shared by SFX and music: one enveloped oscillator ("tone") and one
 * filtered noise burst. Everything is scheduled on absolute `ctx.currentTime` based times.
 */
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  BufferSourceNodeLike,
  FilterType,
  OscType,
} from './webaudio';
import { createRand } from './rng';

const FLOOR = 0.0001;

/** Where a sound is written, plus an optional hook to remember sources so a voice can be stolen. */
export interface Sink {
  readonly ctx: AudioContextLike;
  readonly noise: AudioBufferLike;
  readonly dest: AudioNodeLike;
  track?(source: { stop(when?: number): void }): void;
}

export interface ToneOpts {
  type: OscType;
  /** Start frequency (Hz). */
  f0: number;
  /** Optional end frequency; glides exponentially across `glide` seconds (default = whole tone). */
  f1?: number;
  glide?: number;
  /** Start time on the context clock. */
  t: number;
  dur: number;
  gain: number;
  /** Seconds of linear attack (default 0.004). */
  attack?: number;
  /** Optional low-pass: start cutoff and optional end cutoff (exponential across the tone). */
  lp?: number;
  lp1?: number;
  /** Hold the peak for this long before decaying (default 0). */
  hold?: number;
}

export function tone(s: Sink, o: ToneOpts): void {
  const { ctx } = s;
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0, o.t);
  if (o.f1 !== undefined && o.f1 !== o.f0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), o.t + (o.glide ?? o.dur));
  }
  const env = ctx.createGain();
  const attack = Math.min(o.attack ?? 0.004, o.dur * 0.5);
  env.gain.setValueAtTime(FLOOR, o.t);
  env.gain.linearRampToValueAtTime(Math.max(FLOOR, o.gain), o.t + attack);
  if (o.hold) env.gain.setValueAtTime(Math.max(FLOOR, o.gain), o.t + attack + o.hold);
  env.gain.exponentialRampToValueAtTime(FLOOR, o.t + o.dur);

  if (o.lp !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.lp, o.t);
    if (o.lp1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.lp1), o.t + o.dur);
    f.Q.value = 0.7;
    osc.connect(f);
    f.connect(env);
  } else {
    osc.connect(env);
  }
  env.connect(s.dest);
  osc.start(o.t);
  osc.stop(o.t + o.dur + 0.03);
  s.track?.(osc);
}

export interface NoiseOpts {
  t: number;
  dur: number;
  gain: number;
  filter: FilterType;
  /** Filter frequency at start / optional end (exponential sweep across the burst). */
  f0: number;
  f1?: number;
  q?: number;
  attack?: number;
  /** Playback-rate multiplier (changes the noise colour a little; default 1). */
  rate?: number;
}

/** Offsets into the shared noise buffer, so repeated bursts do not sound identical. */
const offsetRand = createRand(0x9e3779b9);

export function noiseBurst(s: Sink, o: NoiseOpts): void {
  const { ctx } = s;
  const src: BufferSourceNodeLike = ctx.createBufferSource();
  src.buffer = s.noise;
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.f0, o.t);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), o.t + o.dur);
  f.Q.value = o.q ?? 0.8;
  const env = ctx.createGain();
  const attack = Math.min(o.attack ?? 0.002, o.dur * 0.5);
  env.gain.setValueAtTime(FLOOR, o.t);
  env.gain.linearRampToValueAtTime(Math.max(FLOOR, o.gain), o.t + attack);
  env.gain.exponentialRampToValueAtTime(FLOOR, o.t + o.dur);
  src.connect(f);
  f.connect(env);
  env.connect(s.dest);
  const offset = offsetRand() * Math.max(0, s.noise.length / s.noise.sampleRate - 0.1);
  src.start(o.t, offset);
  src.stop(o.t + o.dur + 0.03);
  s.track?.(src);
}

/** One shared white-noise buffer (about 2 s). Everything noisy filters and loops this. */
export function createNoiseBuffer(ctx: AudioContextLike, seconds = 2): AudioBufferLike {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rnd = createRand(0xc0ffee);
  for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
  return buf;
}
