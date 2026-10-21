/**
 * Mixer graph with four independent user volumes:
 *
 *   music   Afrobeats loops + stings (src/audio/music.ts)   -> musicDuck -> musicBus ----\
 *   sfx     effects                                          -> sfxBus -------------------+
 *   warn    danger warnings (never ducked, slight boost)     -> warnBus (sfx volume) -----+-> master -> compressor -> out
 *   react   crowd reactions + spoken Pidgin                  -> notch -> reactDuck -> crowdBus +
 *   amb     Lagos street / bus-park / market beds            -> notch -> ambDuck ----> crowdBus /
 *   (master -> soft limiter -> makeup trim -> soft clipper -> out)
 *
 * - `master`, `musicBus`, `sfxBus`, `crowdBus` carry the user volumes (crowdBus = "Lagos ambience and
 *   voices"). Mute only moves `master` (smoothly).
 * - Warnings (horns, fuse ticks, alarms) sit in their own bus that is never ducked; the crowd paths
 *   carry a gentle notch at the warning band (WARN_BAND_HZ) so warnings stay readable.
 * - The master compressor works as a soft limiter so stacked explosions do not clip.
 */
import { clamp01 } from './rng';
import type { AudioContextLike, AudioNodeLike, BiquadFilterNodeLike, GainNodeLike } from './webaudio';
import type { Bus } from './recipes/types';

export interface Volumes {
  master: number;
  /** Afrobeats music loops and stings. */
  music: number;
  /** Lagos ambience beds, crowd reactions and spoken Pidgin. */
  ambience: number;
  /** Gameplay effects and warnings. */
  sfx: number;
}

/** Centre of the frequency band reserved for danger warnings (fuse ticks, alarms, whistle). */
export const WARN_BAND_HZ = 2600;

/** Headroom scalers so that a 1.0 slider never clips the mix. */
const CROWD_BASE = 0.8;
const MUSIC_BASE = 1.3;
const SFX_BASE = 0.62;
const WARN_BASE = 0.8;
const SMOOTH = 0.02; // seconds, time constant for volume / mute changes

/** Master limiter settings (dB, dB, ratio) and the makeup-gain compensation derived from them. */
export const LIMITER = { threshold: -6, knee: 8, ratio: 16 } as const;
/**
 * Makeup gain of the limiter above, measured in Chromium with OfflineAudioContext (a quiet sine came
 * out +1.15 dB louder). Firefox and Safari share the same WebKit-derived algorithm.
 */
export const LIMITER_MAKEUP_DB = 1.15;
/**
 * Soft-clip transfer curve: exactly unity (transparent) up to |x| = 0.7, then a tanh knee that
 * approaches 0.98, so the output can never reach full scale.
 */
export const SOFT_CLIP_CURVE: Float32Array = (() => {
  const n = 2049;
  const c = new Float32Array(n);
  const knee = 0.7;
  const room = 0.98 - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= knee ? a : knee + room * Math.tanh((a - knee) / room));
  }
  return c;
})();

export const LIMITER_TRIM = Math.pow(10, -LIMITER_MAKEUP_DB / 20);

export type DuckKind = 'warning' | 'blast' | 'speech';
/** Gain the crowd paths dip to, and for how long (seconds). Reactions duck less than the bed. */
const DUCK: Record<DuckKind, { amb: number; react: number; music: number; hold: number }> = {
  warning: { amb: 0.5, react: 0.8, music: 0.8, hold: 0.9 },
  blast: { amb: 0.4, react: 0.75, music: 0.6, hold: 0.5 },
  // a spoken Pidgin line: the babble beds and the music make room, the voice itself is never ducked
  speech: { amb: 0.4, react: 1, music: 0.6, hold: 1.5 },
};

export interface DuckOptions {
  /** Audio-clock time the duck starts (default: now), for lines scheduled slightly ahead. */
  at?: number;
  /** Seconds to hold the dip (default: the kind's own hold). */
  hold?: number;
}

export interface Buses {
  /** Input node for a sound's bus. */
  input(bus: Bus): GainNodeLike;
  setVolumes(v: Volumes): void;
  setMuted(muted: boolean): void;
  /** Briefly lowers the crowd and music so a warning or big blast stays readable. Never touches sfx/warn. */
  duck(kind: DuckKind, opts?: DuckOptions): void;
  readonly volumes: Readonly<Volumes>;
  readonly muted: boolean;
  dispose(): void;
}

export function createBuses(ctx: AudioContextLike, initial: Volumes, muted: boolean): Buses {
  const nodes: AudioNodeLike[] = [];
  const gain = (v: number): GainNodeLike => {
    const g = ctx.createGain();
    g.gain.value = v;
    nodes.push(g);
    return g;
  };
  const notch = (): BiquadFilterNodeLike => {
    const f = ctx.createBiquadFilter();
    f.type = 'peaking';
    f.frequency.value = WARN_BAND_HZ;
    f.Q.value = 0.9;
    f.gain.value = -5;
    nodes.push(f);
    return f;
  };

  const master = gain(muted ? 0 : initial.master);
  // A soft limiter, not a squasher: the threshold sits high so the quiet crowd bed passes through
  // untouched and only stacked explosions get caught. Web Audio compressors apply an automatic
  // makeup gain of (output level at 0 dBFS)^-0.6; `LIMITER_TRIM` cancels it so levels stay predictable.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = LIMITER.threshold;
  comp.knee.value = LIMITER.knee;
  comp.ratio.value = LIMITER.ratio;
  comp.attack.value = 0.002;
  comp.release.value = 0.16;
  nodes.push(comp);
  const trim = gain(LIMITER_TRIM);
  master.connect(comp);
  comp.connect(trim);
  // final safety net: a soft clipper guarantees the output never exceeds full scale, even for
  // transients that get through the limiter's attack time
  const shaper = ctx.createWaveShaper?.();
  if (shaper) {
    shaper.curve = SOFT_CLIP_CURVE;
    shaper.oversample = '2x';
    nodes.push(shaper);
    trim.connect(shaper);
    shaper.connect(ctx.destination);
  } else {
    trim.connect(ctx.destination);
  }

  const sfxBus = gain(initial.sfx * SFX_BASE);
  sfxBus.connect(master);
  const warnBus = gain(initial.sfx * WARN_BASE);
  warnBus.connect(master);
  const crowdBus = gain(initial.ambience * CROWD_BASE);
  crowdBus.connect(master);
  const musicBus = gain(initial.music * MUSIC_BASE);
  const musicDuck = gain(1);
  musicDuck.connect(musicBus);
  musicBus.connect(master);

  const ambDuck = gain(1);
  const reactDuck = gain(1);
  const ambNotch = notch();
  const reactNotch = notch();
  ambNotch.connect(ambDuck);
  ambDuck.connect(crowdBus);
  reactNotch.connect(reactDuck);
  reactDuck.connect(crowdBus);

  const inputs: Record<Bus, GainNodeLike> = {
    sfx: sfxBus,
    warn: warnBus,
    // the notches are BiquadFilters; wrap them behind unity gains so every input is a GainNode
    amb: gain(1),
    react: gain(1),
    music: musicDuck,
  };
  inputs.amb.connect(ambNotch);
  inputs.react.connect(reactNotch);

  let volumes: Volumes = { ...initial };
  let isMuted = muted;
  let duckUntil = 0;
  let duckAmb = 1;
  let duckReact = 1;
  let duckMusic = 1;

  const smooth = (g: GainNodeLike, v: number): void => {
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(v, now, SMOOTH);
  };

  return {
    input: (bus) => inputs[bus],
    get volumes() {
      return volumes;
    },
    get muted() {
      return isMuted;
    },
    setVolumes(v) {
      volumes = {
        master: clamp01(v.master),
        music: clamp01(v.music),
        ambience: clamp01(v.ambience),
        sfx: clamp01(v.sfx),
      };
      smooth(crowdBus, volumes.ambience * CROWD_BASE);
      smooth(musicBus, volumes.music * MUSIC_BASE);
      smooth(sfxBus, volumes.sfx * SFX_BASE);
      smooth(warnBus, volumes.sfx * WARN_BASE);
      smooth(master, isMuted ? 0 : volumes.master);
    },
    setMuted(m) {
      isMuted = m;
      smooth(master, m ? 0 : volumes.master);
    },
    duck(kind, o = {}) {
      const d = DUCK[kind];
      const now = Math.max(ctx.currentTime, o.at ?? 0);
      const until = now + (o.hold ?? d.hold);
      const active = now < duckUntil;
      if (active && d.amb >= duckAmb && until <= duckUntil) return; // already deep and long enough
      duckAmb = active ? Math.min(d.amb, duckAmb) : d.amb;
      duckReact = active ? Math.min(d.react, duckReact) : d.react;
      duckMusic = active ? Math.min(d.music, duckMusic) : d.music;
      duckUntil = active ? Math.max(until, duckUntil) : until;
      for (const [g, depth, rel] of [
        [ambDuck, duckAmb, 0.3],
        [reactDuck, duckReact, 0.2],
        [musicDuck, duckMusic, 0.35],
      ] as const) {
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(depth, now, 0.02);
        g.gain.setTargetAtTime(1, duckUntil, rel);
      }
    },
    dispose() {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    },
  };
}
