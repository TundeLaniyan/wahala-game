/**
 * A fake streaming <audio> element for Node. Records what the music player does to it (src, plays,
 * pauses, every playbackRate write) and can simulate a missing / undecodable file (`broken`) or an
 * engine without pitch preservation (`pitch: false`).
 */
import type { MediaElementLike } from '../../src/audio/webaudio';

type Ev = 'error' | 'playing' | 'ended';

export class FakeMediaElement implements MediaElementLike {
  src = '';
  loop = false;
  preload = '';
  paused = true;
  currentTime = 0;
  declare preservesPitch?: boolean;
  plays = 0;
  pauses = 0;
  loads = 0;
  released = false;
  readonly rateWrites: number[] = [];
  private rate = 1;
  private readonly listeners = new Map<Ev, Set<() => void>>();

  constructor(
    private readonly broken: (src: string) => boolean,
    pitch: boolean,
  ) {
    if (pitch) this.preservesPitch = false; // present (browser default true; the player must set it)
  }
  get playbackRate(): number {
    return this.rate;
  }
  set playbackRate(v: number) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`bad playbackRate ${v}`);
    this.rate = v;
    this.rateWrites.push(v);
  }
  play(): Promise<void> {
    this.plays++;
    if (this.broken(this.src)) {
      void Promise.resolve().then(() => this.emit('error'));
      return Promise.reject(new Error('NotSupportedError'));
    }
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.pauses++;
    this.paused = true;
  }
  load(): void {
    this.loads++;
  }
  removeAttribute(name: string): void {
    if (name === 'src') this.released = true; // `src` is kept so tests can still see what it streamed
  }
  addEventListener(type: Ev, fn: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }
  removeEventListener(type: Ev, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: Ev): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
}

export interface MediaRig {
  els: FakeMediaElement[];
  create: () => FakeMediaElement;
  /** Elements that are playing and not released (what is audible, before gains). */
  sounding: () => FakeMediaElement[];
}

export function mediaFactory(opts: { pitch?: boolean; broken?: (src: string) => boolean } = {}): MediaRig {
  const els: FakeMediaElement[] = [];
  return {
    els,
    create: () => {
      const e = new FakeMediaElement(opts.broken ?? (() => false), opts.pitch ?? true);
      els.push(e);
      return e;
    },
    sounding: () => els.filter((e) => !e.paused && !e.released),
  };
}

/** The track id an element streams (`.../pixabay_123.mp3` -> `pixabay_123`). */
export const trackOf = (e: FakeMediaElement): string => /([A-Za-z0-9_-]+)\.mp3$/.exec(e.src)?.[1] ?? '';
