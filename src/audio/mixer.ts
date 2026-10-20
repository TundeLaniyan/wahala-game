/**
 * Plays bank sounds as one-shots: buffer source -> pooled voice (gain, optional pan) -> bus.
 * Applies the voice cap (via the pool) and a small per-id minimum gap so identical sounds never
 * stack into a flanged double-hit.
 */
import type { Bus, SoundId } from './recipes';
import { defOf } from './recipes';
import type { SoundBank } from './bank';
import type { Buses } from './buses';
import type { VoicePool } from './voices';
import type { AudioContextLike } from './webaudio';

export interface PlayOpts {
  /** Stereo position -1..1 (ignored for the wide crowd buses). */
  pan?: number;
  /** Extra gain multiplier on top of the sound's own trim. */
  gain?: number;
  /** playbackRate (pitch + speed), default 1. */
  rate?: number;
  /** Delay in seconds from now. */
  delay?: number;
}

/** Observability hook for tests and debugging. */
export interface PlayTrace {
  id: SoundId;
  bus: Bus;
  at: number;
  gain: number;
  pan: number;
  rate: number;
}

export interface Mixer {
  /** Returns false when dropped (not ready, rate limited, or voice pool full of higher priority). */
  play(id: SoundId, o?: PlayOpts): boolean;
}

/** Same-id minimum spacing in seconds. */
const MIN_GAP = 0.035;

export function createMixer(
  ctx: AudioContextLike,
  bank: SoundBank,
  buses: Buses,
  pool: VoicePool,
  onPlay?: (t: PlayTrace) => void,
): Mixer {
  const last = new Map<SoundId, number>();
  return {
    play(id, o = {}) {
      const def = defOf(id);
      const buf = bank.get(id);
      if (!buf) return false;
      const now = ctx.currentTime;
      const prev = last.get(id);
      if (prev !== undefined && now - prev < MIN_GAP) return false;
      const rate = Math.min(4, Math.max(0.25, o.rate ?? 1));
      const at = now + Math.max(0, o.delay ?? 0);
      const dur = buf.length / buf.sampleRate / rate;
      const gain = def.gain * bank.trim(id) * (o.gain ?? 1);
      const pan = def.bus === 'react' || def.bus === 'amb' ? 0 : (o.pan ?? 0);
      const voice = pool.begin({
        priority: def.priority,
        duration: dur,
        dest: buses.input(def.bus),
        at,
        pan,
        gain,
      });
      if (!voice) return false;
      last.set(id, now);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(voice.dest);
      src.start(at);
      src.stop(at + dur + 0.05);
      voice.track(src);
      onPlay?.({ id, bus: def.bus, at, gain, pan, rate });
      return true;
    },
  };
}
