/**
 * Quiet looping crowd murmur (filtered noise) with occasional swells that react to events.
 * Kept below the warning band (low-passed at ~1.8 kHz) and routed through the crowd bus, which is
 * ducked on warnings and big blasts.
 */
import type { Buses } from './buses';
import type { Rand } from './rng';
import { clamp01 } from './rng';
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  BiquadFilterNodeLike,
  BufferSourceNodeLike,
  GainNodeLike,
} from './webaudio';

export type SwellKind = 'cheer' | 'gasp' | 'groan' | 'laugh';

export interface CrowdBed {
  readonly running: boolean;
  start(): void;
  /** Fades out. */
  stop(): void;
  /** Momentary swell of the murmur; `strength` 0..1. Quieter swells inside a louder one are ignored. */
  swell(kind: SwellKind, strength: number): void;
  dispose(): void;
}

const BASE = 0.05;
const WANDER_MS = 900;

const SWELL_FILTER: Record<SwellKind, { from: number; to: number; gain: number; hold: number }> = {
  cheer: { from: 800, to: 1500, gain: 3.2, hold: 0.9 },
  laugh: { from: 1300, to: 1000, gain: 2.4, hold: 0.7 },
  gasp: { from: 700, to: 1300, gain: 1.8, hold: 0.35 },
  groan: { from: 1000, to: 450, gain: 2.2, hold: 0.8 },
};

interface Deps {
  ctx: AudioContextLike;
  noise: AudioBufferLike;
  buses: Buses;
  rand: Rand;
}

export function createCrowdBed({ ctx, noise, buses, rand }: Deps): CrowdBed {
  const nodes: AudioNodeLike[] = [];
  const bed: GainNodeLike = ctx.createGain();
  bed.gain.value = 0;
  bed.connect(buses.crowd);
  nodes.push(bed);

  const lowBand: BiquadFilterNodeLike = ctx.createBiquadFilter();
  lowBand.type = 'bandpass';
  lowBand.frequency.value = 420;
  lowBand.Q.value = 0.6;
  const highBand: BiquadFilterNodeLike = ctx.createBiquadFilter();
  highBand.type = 'bandpass';
  highBand.frequency.value = 1100;
  highBand.Q.value = 1.1;
  const cap: BiquadFilterNodeLike = ctx.createBiquadFilter();
  cap.type = 'lowpass';
  cap.frequency.value = 1800;
  const highGain: GainNodeLike = ctx.createGain();
  highGain.gain.value = 0.6;
  lowBand.connect(bed);
  highBand.connect(highGain);
  highGain.connect(cap);
  cap.connect(bed);
  nodes.push(lowBand, highBand, cap, highGain);

  let src: BufferSourceNodeLike | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let swellUntil = 0;
  let swellLevel = 0;
  let running = false;

  const wander = (): void => {
    const now = ctx.currentTime;
    if (now < swellUntil) return;
    bed.gain.setTargetAtTime(BASE * (0.7 + 0.6 * rand()), now, 0.6);
    highBand.frequency.setTargetAtTime(900 + 500 * rand(), now, 0.8);
  };

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.playbackRate.value = 0.85;
      s.connect(lowBand);
      s.connect(highBand);
      s.start(0, rand() * 0.5);
      src = s;
      const now = ctx.currentTime;
      bed.gain.cancelScheduledValues(now);
      bed.gain.setTargetAtTime(BASE, now, 1.0);
      timer = setInterval(wander, WANDER_MS);
    },
    stop() {
      if (!running) return;
      running = false;
      if (timer !== null) clearInterval(timer);
      timer = null;
      const now = ctx.currentTime;
      bed.gain.cancelScheduledValues(now);
      bed.gain.setTargetAtTime(0, now, 0.4);
      try {
        src?.stop(now + 2.5);
      } catch {
        /* already stopped */
      }
      src = null;
    },
    swell(kind, strength) {
      if (!running) return;
      const s = clamp01(strength);
      const now = ctx.currentTime;
      if (now < swellUntil && s <= swellLevel) return;
      const p = SWELL_FILTER[kind];
      swellLevel = s;
      swellUntil = now + p.hold + 0.5;
      bed.gain.cancelScheduledValues(now);
      bed.gain.setTargetAtTime(BASE * (1 + p.gain * s), now, 0.07);
      bed.gain.setTargetAtTime(BASE, now + p.hold, 0.5);
      highBand.frequency.cancelScheduledValues(now);
      highBand.frequency.setValueAtTime(p.from, now);
      highBand.frequency.exponentialRampToValueAtTime(p.to, now + p.hold);
    },
    dispose() {
      this.stop();
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
