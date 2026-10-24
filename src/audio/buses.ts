/**
 * Mixer graph with four independent user volumes:
 *
 *   music   Afrobeats loops + stings (src/audio/music.ts)   -> musicDuck -> musicBus ----\
 *   sfx     effects                                          -> sfxBus -------------------+
 *   warn    danger warnings (never ducked, slight boost)     -> warnBus (sqrt sfx vol) ---+-> master -> compressor -> out
 *   react   crowd reactions + spoken Pidgin                  -> notch -> reactDuck -> crowdBus +
 *   amb     Lagos street / bus-park / market beds            -> notch -> ambDuck ----> crowdBus /
 *   voice   foreground spoken lines (reactions, warnings)    -> voiceBus (sqrt ambience vol) -> master
 *   (master -> soft limiter -> makeup trim -> soft clipper -> out)
 *
 * - `master`, `musicBus`, `sfxBus`, `crowdBus` carry the user volumes (crowdBus = "Lagos ambience and
 *   voices"). Mute only moves `master` (smoothly).
 * - Spoken reactions sit in their own `voice` bus: no warning-band notch (it would eat the consonants), never
 *   ducked, and it follows the ambience-and-voices slider on a square-root curve so a line stays intelligible
 *   over the music-first default mix. Background conversations stay on the quieter, notched `amb` path.
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
/**
 * Music bus at unity: every track is levelled to about -14 LUFS by its manifest `gain`, so a 100 % music
 * slider plays it at that level and the music-first default (90 %, master 85 %) lands at about -16.8 LUFS
 * after the master limiter, which then takes about 1 dB off the peaks (measured with ffmpeg, decision M8).
 * The louder default comes from the slider alone: the earlier +2.5 dB bus lift (N13, base 1.73) is gone,
 * so the boost is not applied twice and the limiter is not driven into pumping.
 */
export const MUSIC_BASE = 1.0;
/** The music bus before decision M8; saved music levels are converted from it so they sound the same. */
export const LEGACY_MUSIC_BASE = 1.3 * Math.pow(10, 2.5 / 20);
const SFX_BASE = 0.62;
const WARN_BASE = 0.8;
/**
 * Danger warnings follow the effects slider on a gentler curve (square root) so a quieter effects mix
 * never hides a hazard telegraph: at the 50 % default they are 1.6 dB below the old 85 % level while the
 * plain effects are 4.6 dB below it. Zero is still silence.
 */
export const warnLevel = (sfx: number): number => WARN_BASE * Math.sqrt(sfx);
/**
 * Foreground voice lines follow the ambience-and-voices slider on a square-root curve (like the warnings):
 * at the 45 % default the bus sits at 0.87, so a clip mastered to -16 LUFS plays about 3.5 dB over the music
 * ducked for an ordinary line and about 5.5 dB over it for an urgent one; zero is still silence.
 */
const VOICE_BASE = 1.3;
export const voiceLevel = (ambience: number): number => VOICE_BASE * Math.sqrt(ambience);
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

export type DuckKind = 'warning' | 'blast' | 'speech' | 'urgentSpeech';
/** Gain the crowd paths dip to, and for how long (seconds). Reactions duck less than the bed. */
const DUCK: Record<DuckKind, { amb: number; react: number; music: number; hold: number }> = {
  // the music is the loudest layer by default (M8): it makes clear room for warnings and big blasts
  warning: { amb: 0.5, react: 0.8, music: 0.5, hold: 0.9 },
  blast: { amb: 0.4, react: 0.75, music: 0.45, hold: 0.5 },
  // a spoken line: the babble beds and the music make room, the voice itself (voice bus) is never ducked
  speech: { amb: 0.4, react: 1, music: 0.5, hold: 1.5 },
  // a spoken danger warning: the music and the crowd step further back for it
  urgentSpeech: { amb: 0.3, react: 0.6, music: 0.4, hold: 1.5 },
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
  const warnBus = gain(warnLevel(initial.sfx));
  warnBus.connect(master);
  const crowdBus = gain(initial.ambience * CROWD_BASE);
  crowdBus.connect(master);
  const voiceBus = gain(voiceLevel(initial.ambience));
  voiceBus.connect(master);
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
    voice: voiceBus,
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
      smooth(voiceBus, voiceLevel(volumes.ambience));
      smooth(musicBus, volumes.music * MUSIC_BASE);
      smooth(sfxBus, volumes.sfx * SFX_BASE);
      smooth(warnBus, warnLevel(volumes.sfx));
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
      const deepEnough = d.amb >= duckAmb && d.react >= duckReact && d.music >= duckMusic;
      if (active && deepEnough && until <= duckUntil) return; // already deep and long enough
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
