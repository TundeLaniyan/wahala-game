/**
 * Keyed looping voices that follow game state: generator "putt-putt" and rattle loops and vehicle
 * engines. Each update pass declares which loops should exist (`set`) and `end()` fades out the rest.
 * Total loop voices are small (a few per kind); they live outside the one-shot voice pool.
 */
import type { SoundId } from './recipes';
import { defOf } from './recipes';
import type { SoundBank } from './bank';
import type { Buses } from './buses';
import type { AudioContextLike, AudioNodeLike, BufferSourceNodeLike, GainNodeLike } from './webaudio';

export interface LoopParams {
  gain: number;
  rate: number;
  pan: number;
}

interface Entry {
  id: SoundId;
  src: BufferSourceNodeLike;
  gain: GainNodeLike;
  panner:
    | (AudioNodeLike & { pan: { value: number; setTargetAtTime(v: number, t: number, tc: number): unknown } })
    | null;
  stamp: number;
  /** Last values sent to the audio params (to skip redundant automation events). */
  last: LoopParams;
}

export interface LoopSet {
  begin(): void;
  set(key: string, id: SoundId, p: LoopParams): void;
  /** Fades out every loop that was not `set` since `begin()`. */
  end(): void;
  /** Number of live loop voices. */
  count(): number;
  keys(): string[];
  stopAll(): void;
}

const SMOOTH = 0.05;

export function createLoopSet(ctx: AudioContextLike, bank: SoundBank, buses: Buses): LoopSet {
  const entries = new Map<string, Entry>();
  let stamp = 0;
  let offsetSeed = 0;

  const stop = (key: string, e: Entry): void => {
    entries.delete(key);
    const now = ctx.currentTime;
    e.gain.gain.cancelScheduledValues(now);
    e.gain.gain.setTargetAtTime(0, now, 0.04);
    try {
      e.src.stop(now + 0.25);
    } catch {
      /* already stopped */
    }
    e.src.onended = () => {
      try {
        e.gain.disconnect();
        e.panner?.disconnect();
      } catch {
        /* ignore */
      }
    };
  };

  return {
    begin() {
      stamp++;
    },
    set(key, id, p) {
      let e = entries.get(key);
      if (e && e.id !== id) {
        stop(key, e);
        e = undefined;
      }
      const now = ctx.currentTime;
      if (!e) {
        const buf = bank.get(id);
        if (!buf) return; // not rendered yet; try again on the next update
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = p.rate;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        let panner: Entry['panner'] = null;
        const dest = buses.input(defOf(id).bus);
        if (ctx.createStereoPanner) {
          const sp = ctx.createStereoPanner();
          sp.pan.value = p.pan;
          src.connect(gain);
          gain.connect(sp);
          sp.connect(dest);
          panner = sp as unknown as Entry['panner'];
        } else {
          src.connect(gain);
          gain.connect(dest);
        }
        offsetSeed = (offsetSeed + 0.381966) % 1; // golden-ratio spacing: simultaneous loops never start in phase
        src.start(now, (buf.length / buf.sampleRate) * offsetSeed);
        e = { id, src, gain, panner, stamp, last: { gain: -1, rate: p.rate, pan: p.pan } };
        entries.set(key, e);
      }
      e.stamp = stamp;
      const g = p.gain * defOf(id).gain * bank.trim(id);
      // each call to the audio params adds a timeline event, so only touch them on real changes
      if (Math.abs(g - e.last.gain) > 0.01) {
        e.gain.gain.cancelScheduledValues(now);
        e.gain.gain.setTargetAtTime(g, now, SMOOTH);
        e.last.gain = g;
      }
      if (Math.abs(p.rate - e.last.rate) > 0.004) {
        e.src.playbackRate.setTargetAtTime(p.rate, now, SMOOTH);
        e.last.rate = p.rate;
      }
      if (e.panner && Math.abs(p.pan - e.last.pan) > 0.02) {
        e.panner.pan.setTargetAtTime(p.pan, now, SMOOTH);
        e.last.pan = p.pan;
      }
    },
    end() {
      for (const [k, e] of [...entries]) if (e.stamp !== stamp) stop(k, e);
    },
    count: () => entries.size,
    keys: () => [...entries.keys()],
    stopAll() {
      for (const [k, e] of [...entries]) stop(k, e);
    },
  };
}
