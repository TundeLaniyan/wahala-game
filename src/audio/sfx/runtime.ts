/** Shared plumbing for all SFX recipe modules. */
import type { Buses } from '../buses';
import type { Rand } from '../rng';
import type { AudioBufferLike, AudioContextLike } from '../webaudio';
import type { Voice, VoicePool } from '../voices';

export interface SfxRuntime {
  readonly ctx: AudioContextLike;
  readonly noise: AudioBufferLike;
  readonly buses: Buses;
  readonly pool: VoicePool;
  readonly rand: Rand;
}

export interface PlayOpts {
  priority: number;
  /** Seconds the whole effect lasts (used for voice accounting, not to cut sounds off). */
  duration: number;
  pan?: number;
  gain?: number;
  /** Delay in seconds from now. */
  delay?: number;
}

/**
 * Starts one voice and lets `build(voice, t0)` schedule its tones. Returns false when the pool
 * dropped it. `t0` is the absolute context time the effect starts at.
 */
export function play(rt: SfxRuntime, o: PlayOpts, build: (v: Voice, t0: number) => void): boolean {
  const at = rt.ctx.currentTime + (o.delay ?? 0);
  const v = rt.pool.begin({
    priority: o.priority,
    duration: o.duration,
    dest: rt.buses.sfx,
    at,
    pan: o.pan,
    gain: o.gain,
  });
  if (!v) return false;
  build(v, at);
  return true;
}

/** Multiplicative jitter: `jit(rt, 100, 0.05)` -> 95..105. */
export const jit = (rt: SfxRuntime, base: number, spread: number): number =>
  base * (1 + (rt.rand() * 2 - 1) * spread);
