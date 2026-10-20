/**
 * Voice pool: caps simultaneous SFX voices so mid-range phones never drown in nodes.
 *
 * A "voice" is one sound effect (which may contain several oscillators/noise sources). Each has a
 * priority; when the pool is full the lowest-priority voice (earliest ending on ties) is stolen if
 * its priority is not higher than the newcomer's, otherwise the newcomer is dropped.
 */
import type { Sink } from './synth';
import type { AudioBufferLike, AudioContextLike, AudioNodeLike, GainNodeLike } from './webaudio';

export const MAX_VOICES = 24;

/** Priority tiers (higher survives). */
export const Priority = {
  ambient: 1,
  fuse: 2,
  normal: 3,
  warning: 5,
  big: 6,
  jingle: 7,
} as const;

export interface Voice extends Sink {
  readonly priority: number;
  /** Context time at which the voice's last source has finished. */
  readonly end: number;
}

export interface VoiceOpts {
  priority: number;
  /** Seconds of sound from `at`. */
  duration: number;
  dest: AudioNodeLike;
  /** Absolute start time; defaults to now. Pan -1..1 (ignored without StereoPanner support). */
  at?: number;
  pan?: number;
  /** Voice-level gain multiplier. */
  gain?: number;
}

export interface VoicePool {
  begin(o: VoiceOpts): Voice | null;
  /** Voices still sounding at the current time. */
  active(): number;
  stopAll(): void;
}

interface VoiceImpl extends Voice {
  kill(now: number): void;
  release(): void;
}

export function createVoicePool(ctx: AudioContextLike, noise: AudioBufferLike, max = MAX_VOICES): VoicePool {
  let voices: VoiceImpl[] = [];

  const prune = (now: number): void => {
    let w = 0;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i]!;
      if (v.end <= now) v.release();
      else voices[w++] = v;
    }
    voices.length = w;
  };

  const make = (o: VoiceOpts): VoiceImpl => {
    const at = o.at ?? ctx.currentTime;
    const out: GainNodeLike = ctx.createGain();
    out.gain.value = o.gain ?? 1;
    let pannerNode: AudioNodeLike | null = null;
    if (o.pan !== undefined && o.pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      out.connect(p);
      p.connect(o.dest);
      pannerNode = p;
    } else {
      out.connect(o.dest);
    }
    const sources: { stop(when?: number): void }[] = [];
    return {
      ctx,
      noise,
      dest: out,
      priority: o.priority,
      end: at + o.duration + 0.06,
      track(s) {
        sources.push(s);
      },
      kill(now) {
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(0, now, 0.008);
        for (const s of sources) {
          try {
            s.stop(now + 0.05);
          } catch {
            /* source may already be stopped */
          }
        }
        this.release();
      },
      release() {
        sources.length = 0;
        try {
          out.disconnect();
          pannerNode?.disconnect();
        } catch {
          /* ignore */
        }
      },
    };
  };

  return {
    begin(o) {
      const now = ctx.currentTime;
      prune(now);
      if (voices.length >= max) {
        let victim = 0;
        for (let i = 1; i < voices.length; i++) {
          const a = voices[i]!;
          const b = voices[victim]!;
          if (a.priority < b.priority || (a.priority === b.priority && a.end < b.end)) victim = i;
        }
        const v = voices[victim]!;
        if (v.priority > o.priority) return null;
        v.kill(now);
        voices.splice(victim, 1);
      }
      const voice = make(o);
      voices.push(voice);
      return voice;
    },
    active() {
      prune(ctx.currentTime);
      return voices.length;
    },
    stopAll() {
      const now = ctx.currentTime;
      for (const v of voices) v.kill(now);
      voices = [];
    },
  };
}
