/**
 * Looping crowd ambience (NOT music). Three seamless synthesised beds are layered:
 *   crowd_loop       general murmur ("walla"), always present
 *   buspark_loop     distant engines, generators, far-off horn toots
 *   crowd_loop_hype  excited babble, handclaps, whistles and cheer swells; follows `intensity`
 * Any of them can be replaced by a recorded sample slot with the same name (see samples.ts).
 *
 * `setIntensity(0..1)` raises the hype layer and slightly lifts the murmur. `swell()` gives a short
 * boost to the whole bed when something exciting happens.
 */
import type { SoundBank } from './bank';
import type { Buses } from './buses';
import { clamp01 } from './rng';
import type { SoundId } from './recipes';
import { defOf } from './recipes';
import type { AudioBufferLike, AudioContextLike, BufferSourceNodeLike, GainNodeLike } from './webaudio';

export interface AmbienceLevels {
  crowd_loop: number;
  buspark_loop: number;
  crowd_loop_hype: number;
}

type LayerId = keyof AmbienceLevels;
const LAYERS: readonly LayerId[] = ['crowd_loop', 'buspark_loop', 'crowd_loop_hype'];

/** Target layer gains for an intensity level (0 calm .. 1 frantic). */
export function levelsFor(intensity: number): AmbienceLevels {
  const i = clamp01(intensity);
  return {
    // the babble beds are texture only: they sit well under the spoken Pidgin lines so those stay intelligible
    crowd_loop: 0.5 + 0.1 * i,
    buspark_loop: 0.55 - 0.2 * i,
    crowd_loop_hype: 0.22 + 0.5 * i,
  };
}

export interface Ambience {
  readonly running: boolean;
  start(): void;
  /** Fades out. */
  stop(): void;
  setIntensity(level: number): void;
  /** Momentary lift of the whole bed; `strength` 0..1. Quieter swells inside a louder one are ignored. */
  swell(strength: number): void;
  /** Current target gains (introspection for tests and tools). */
  levels(): Readonly<AmbienceLevels>;
  dispose(): void;
}

interface Layer {
  id: LayerId;
  src: BufferSourceNodeLike | null;
  gain: GainNodeLike | null;
  buffer: AudioBufferLike | null;
}

const FADE_IN = 1.2;

export function createAmbience(ctx: AudioContextLike, bank: SoundBank, buses: Buses): Ambience {
  const layers: Layer[] = LAYERS.map((id) => ({ id, src: null, gain: null, buffer: null }));
  let running = false;
  let intensity = 0;
  let target = levelsFor(0);
  let swellUntil = 0;
  let swellLevel = 0;
  let offsetSeed = 0;

  const level = (l: Layer): number => target[l.id] * defOf(l.id as SoundId).gain * bank.trim(l.id);

  const fadeOutOld = (l: Layer): void => {
    if (!l.src || !l.gain) return;
    const now = ctx.currentTime;
    l.gain.gain.cancelScheduledValues(now);
    l.gain.gain.setTargetAtTime(0, now, 0.35);
    try {
      l.src.stop(now + 2.5);
    } catch {
      /* already stopped */
    }
    const g = l.gain;
    l.src.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    l.src = null;
    l.gain = null;
    l.buffer = null;
  };

  /** Starts (or swaps to a recorded version of) a layer once its buffer is available. */
  const ensure = (l: Layer): void => {
    if (!running) return;
    const buf = bank.get(l.id);
    if (!buf || l.buffer === buf) return;
    fadeOutOld(l);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(buses.input(defOf(l.id as SoundId).bus));
    const dur = buf.length / buf.sampleRate;
    offsetSeed = (offsetSeed + 0.381966) % 1; // golden-ratio offsets: layers never start aligned
    src.start(ctx.currentTime, dur * offsetSeed);
    const now = ctx.currentTime;
    g.gain.setTargetAtTime(level(l), now, FADE_IN / 3);
    l.src = src;
    l.gain = g;
    l.buffer = buf;
  };

  const unsubscribe = bank.onReady((id) => {
    const l = layers.find((x) => x.id === id);
    if (l) ensure(l);
  });

  const apply = (timeConstant: number): void => {
    const now = ctx.currentTime;
    const boost = now < swellUntil ? 1 + 0.5 * swellLevel : 1;
    for (const l of layers) {
      if (!l.gain) continue;
      l.gain.gain.cancelScheduledValues(now);
      l.gain.gain.setTargetAtTime(level(l) * (l.id === 'buspark_loop' ? 1 : boost), now, timeConstant);
    }
  };

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      bank.prioritize(LAYERS);
      for (const l of layers) ensure(l);
      apply(FADE_IN / 3);
    },
    stop() {
      if (!running) return;
      running = false;
      for (const l of layers) fadeOutOld(l);
    },
    setIntensity(v) {
      intensity = clamp01(v);
      target = levelsFor(intensity);
      if (running) apply(0.6);
    },
    swell(strength) {
      if (!running) return;
      const s = clamp01(strength);
      const now = ctx.currentTime;
      if (now < swellUntil && s <= swellLevel) return;
      swellLevel = s;
      swellUntil = now + 1.4;
      const boost = 1 + 0.5 * s;
      for (const l of layers) {
        if (!l.gain || l.id === 'buspark_loop') continue;
        l.gain.gain.cancelScheduledValues(now);
        l.gain.gain.setTargetAtTime(level(l) * boost, now, 0.08);
        l.gain.gain.setTargetAtTime(level(l), now + 0.9, 0.5);
      }
    },
    levels: () => target,
    dispose() {
      unsubscribe();
      this.stop();
    },
  };
}
