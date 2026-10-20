/**
 * Mixer graph:
 *
 *   music sources -> music(fade) -> notch -> musicDuck -> musicBus --\
 *   crowd bed     -> crowd(duck) ------\                              \
 *   sfx voices    -> sfx (= sfxBus) ----+-> master -> compressor -> destination
 *
 * - `master`, `musicBus`, `sfxBus` carry the user volumes. Mute only moves `master` (smoothly).
 * - Danger warnings connect to `sfx` and are never ducked; music and the crowd bed duck under them.
 * - The music is carved with a gentle notch at the warning band (WARN_BAND_HZ) so fuse ticks, horns
 *   and sirens stay on top of it.
 */
import { clamp01 } from './rng';
import type { AudioContextLike, AudioNodeLike, BiquadFilterNodeLike, GainNodeLike } from './webaudio';

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

/** Centre of the frequency band reserved for danger warnings (fuse ticks, sirens, crush alarm). */
export const WARN_BAND_HZ = 2600;

/** Headroom scalers so that a 1.0 slider never clips the mix. */
const MUSIC_BASE = 0.42;
const SFX_BASE = 0.85;
const SMOOTH = 0.02; // seconds, time constant for volume / mute changes

export type DuckKind = 'warning' | 'blast';
const DUCK: Record<DuckKind, { depth: number; hold: number }> = {
  warning: { depth: 0.38, hold: 1.1 },
  blast: { depth: 0.6, hold: 0.45 },
};

export interface Buses {
  /** Input for normal and warning SFX voices. */
  readonly sfx: GainNodeLike;
  /** Input for the music sequencer. */
  readonly music: GainNodeLike;
  /** Input for the crowd bed (ducked on warnings). */
  readonly crowd: GainNodeLike;
  setVolumes(v: Volumes): void;
  setMuted(muted: boolean): void;
  /** Briefly lowers music and crowd so a warning or big blast stays readable. */
  duck(kind: DuckKind): void;
  /** Smooth fade of the whole music input (used by start/stop). */
  fadeMusic(to: number, seconds: number): void;
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

  const master = gain(muted ? 0 : initial.master);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  nodes.push(comp);
  master.connect(comp);
  comp.connect(ctx.destination);

  const sfxBus = gain(initial.sfx * SFX_BASE);
  sfxBus.connect(master);

  const musicBus = gain(initial.music * MUSIC_BASE);
  musicBus.connect(master);
  const musicDuck = gain(1);
  musicDuck.connect(musicBus);
  const notch: BiquadFilterNodeLike = ctx.createBiquadFilter();
  notch.type = 'peaking';
  notch.frequency.value = WARN_BAND_HZ;
  notch.Q.value = 0.9;
  notch.gain.value = -6;
  nodes.push(notch);
  notch.connect(musicDuck);
  const musicFade = gain(0);
  musicFade.connect(notch);

  const crowdDuck = gain(1);
  crowdDuck.connect(sfxBus);

  let volumes: Volumes = { ...initial };
  let isMuted = muted;
  let duckUntil = 0;
  let duckDepth = 1;

  const smooth = (g: GainNodeLike, v: number): void => {
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(v, now, SMOOTH);
  };

  return {
    sfx: sfxBus,
    music: musicFade,
    crowd: crowdDuck,
    get volumes() {
      return volumes;
    },
    get muted() {
      return isMuted;
    },
    setVolumes(v) {
      volumes = { master: clamp01(v.master), music: clamp01(v.music), sfx: clamp01(v.sfx) };
      smooth(musicBus, volumes.music * MUSIC_BASE);
      smooth(sfxBus, volumes.sfx * SFX_BASE);
      smooth(master, isMuted ? 0 : volumes.master);
    },
    setMuted(m) {
      isMuted = m;
      smooth(master, m ? 0 : volumes.master);
    },
    duck(kind) {
      const { depth, hold } = DUCK[kind];
      const now = ctx.currentTime;
      const until = now + hold;
      const active = now < duckUntil;
      if (active && depth >= duckDepth && until <= duckUntil) return; // already deep and long enough
      duckDepth = active ? Math.min(depth, duckDepth) : depth;
      duckUntil = active ? Math.max(until, duckUntil) : until;
      for (const g of [musicDuck, crowdDuck]) {
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(duckDepth, now, 0.025);
        g.gain.setTargetAtTime(1, duckUntil, 0.25);
      }
    },
    fadeMusic(to, seconds) {
      const now = ctx.currentTime;
      musicFade.gain.cancelScheduledValues(now);
      musicFade.gain.setTargetAtTime(to, now, Math.max(0.01, seconds / 3));
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
