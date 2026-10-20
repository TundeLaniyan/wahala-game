/**
 * The sound bank: renders every synthesised sound once (pure DSP, see ./recipes), lazily and in
 * small slices off the critical path, caches the result as AudioBuffers, and lets optional
 * RECORDED samples (see ./samples.ts) take priority over the synthesised version.
 *
 *  - Rendering is deterministic: the same id + rate always produces the same samples.
 *  - Rendered float data is only kept in a process-wide cache when `cache: true` (tests and tools).
 *  - Cheap one-shots requested before they were warmed up are rendered synchronously on demand
 *    (a few ms beats silence). Loops, crowd reactions and a short list of long-reverb one-shots
 *    (`HEAVY`) are expensive, so they are never rendered synchronously: they return null (and jump
 *    the queue) until the background warm-up has produced them.
 */
import { hashSeed } from './dsp/core';
import { SOUND_DEFS, SOUND_IDS, defOf } from './recipes';
import type { SoundId } from './recipes';
import { finalize } from './recipes/types';
import type { SoundDef } from './recipes/types';
import { createRand } from './rng';
import type { AudioBufferLike, AudioContextLike } from './webaudio';

export type Scheduler = (fn: () => void) => () => void;

export interface BankOptions {
  /** Scales every render rate (tests use 0.25 to keep Node runs fast). Default 1. */
  rateScale?: number;
  /** Runs warm-up slices. Default: setTimeout. */
  schedule?: Scheduler;
  /** Milliseconds of rendering per slice. Default 5. */
  sliceMs?: number;
  /**
   * Keep rendered float data in a process-wide cache so other banks reuse it (tests, tools).
   * Default false: in the browser the AudioBuffers are the only copy, which halves memory.
   */
  cache?: boolean;
  /**
   * Render every sound synchronously the first time it is requested and never warm up in the
   * background (tests and offline tools: only the sounds actually used get rendered).
   */
  syncRender?: boolean;
}

export interface RecordedMeta {
  gain: number;
}

export interface SoundBank {
  /** AudioBuffer for the id (recorded if available, else synthesised), or null if not ready. */
  get(id: SoundId): AudioBufferLike | null;
  /** True when `get(id)` would return a buffer without rendering. */
  ready(id: SoundId): boolean;
  /** Loudness trim for the id (1 for synthesised; the slot's gain for recordings). */
  trim(id: SoundId): number;
  isRecorded(id: SoundId): boolean;
  setRecorded(id: SoundId, buffer: AudioBufferLike, meta?: Partial<RecordedMeta>): void;
  /** Moves ids to the front of the background queue. */
  prioritize(ids: readonly SoundId[]): void;
  /** Starts background rendering of everything (idempotent). */
  warm(): void;
  /** Renders everything synchronously (tests, offline tools). */
  warmAll(): void;
  /** Number of sounds still waiting to be rendered. */
  pending(): number;
  /** Called with an id every time a synthesised or recorded buffer becomes available. */
  onReady(cb: (id: SoundId) => void): () => void;
  dispose(): void;
}

interface Rendered {
  l: Float32Array;
  r: Float32Array;
  rate: number;
}

const rendered = new Map<string, Rendered>();

/** Web Audio implementations must support buffers from 8 kHz; never render below that. */
const MIN_RATE = 8000;
const rateFor = (def: SoundDef, scale: number): number => Math.max(MIN_RATE, Math.round(def.rate * scale));

/** Renders one sound to float data (cached by default). Exposed for tests and tools/audio. */
export function renderSound(id: SoundId, rateScale = 1, cache = true): Rendered {
  const def = defOf(id);
  const rate = rateFor(def, rateScale);
  const key = `${id}@${rate}`;
  let r = cache ? rendered.get(key) : undefined;
  if (!r) {
    const gen = def.render({ rate, rng: createRand(hashSeed(id)) });
    let step = gen.next();
    while (!step.done) step = gen.next();
    r = finalize(def, step.value);
    if (cache) rendered.set(key, r);
  }
  return r;
}

/** Renders step by step; `step()` returns true when finished. */
function startRender(
  id: SoundId,
  rateScale: number,
  cache: boolean,
): { step: () => boolean; result: () => Rendered } {
  const def: SoundDef = defOf(id);
  const rate = rateFor(def, rateScale);
  const key = `${id}@${rate}`;
  const cached = cache ? rendered.get(key) : undefined;
  if (cached) return { step: () => true, result: () => cached };
  const gen = def.render({ rate, rng: createRand(hashSeed(id)) });
  let done: Rendered | null = null;
  return {
    step: () => {
      if (done) return true;
      const s = gen.next();
      if (s.done) {
        done = finalize(def, s.value);
        if (cache) rendered.set(key, done);
        return true;
      }
      return false;
    },
    result: () => {
      if (!done) throw new Error('render not finished');
      return done;
    },
  };
}

const defaultSchedule: Scheduler = (fn) => {
  const h = setTimeout(fn, 4);
  return () => clearTimeout(h);
};

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/** Order in which the background warm-up renders sounds (UI first, then ambience, then core SFX). */
const WARM_FIRST: readonly SoundId[] = [
  'ui_click',
  'ui_back',
  'ui_start',
  'ui_count',
  'ui_go',
  'crowd_loop',
  'buspark_loop',
  'crowd_loop_hype',
  'explosion_1',
  'explosion_2',
  'explosion_3',
  'explosion_rumble',
  'gen_place',
  'gen_run_loop',
  'fuse_tick',
  'gen_rattle_loop',
  'pickup_1',
  'elim_slide',
  'elim_boing',
  'elim_womp',
  'danfo_horn',
  'taxi_horn',
  'keke_horn',
  'crowd_cheer_1',
  'crowd_gasp',
  'crowd_groan',
  'crowd_ooh',
  'vehicle_wreck',
  'crush_slam',
  'okada_break',
  'win_sting',
];

/**
 * One-shots that take long enough to render (roughly 60 ms or more on a desktop) that rendering
 * them on the spot would visibly hitch a frame. They are never rendered synchronously; if one is
 * requested before the background warm-up reached it, that single play is skipped.
 */
const HEAVY: ReadonlySet<SoundId> = new Set<SoundId>([
  'explosion_1',
  'explosion_2',
  'explosion_3',
  'explosion_rumble',
  'vehicle_wreck',
  'win_sting',
  'okada_break',
  'crush_slam',
]);

export function createSoundBank(ctx: AudioContextLike, opts: BankOptions = {}): SoundBank {
  const scale = opts.rateScale ?? 1;
  const schedule = opts.schedule ?? defaultSchedule;
  const sliceMs = opts.sliceMs ?? 5;
  const cache = opts.cache ?? false;
  const syncRender = opts.syncRender ?? false;
  const buffers = new Map<SoundId, AudioBufferLike>();
  const recorded = new Map<SoundId, { buffer: AudioBufferLike; meta: RecordedMeta }>();
  const listeners = new Set<(id: SoundId) => void>();
  let queue: SoundId[] = [];
  let queued = false;
  let current: { id: SoundId; job: ReturnType<typeof startRender> } | null = null;
  let cancel: (() => void) | null = null;
  let disposed = false;

  const emit = (id: SoundId): void => {
    for (const cb of [...listeners]) cb(id);
  };

  const toBuffer = (id: SoundId, r: Rendered): AudioBufferLike => {
    const buf = ctx.createBuffer(2, r.l.length, r.rate);
    buf.getChannelData(0).set(r.l);
    buf.getChannelData(1).set(r.r);
    buffers.set(id, buf);
    return buf;
  };

  const tick = (): void => {
    cancel = null;
    if (disposed) return;
    const start = now();
    for (;;) {
      if (!current) {
        let id: SoundId | undefined;
        while ((id = queue.shift()) !== undefined) if (!buffers.has(id)) break;
        if (id === undefined || buffers.has(id)) {
          queued = false;
          return;
        }
        current = { id, job: startRender(id, scale, cache) };
      }
      if (current.job.step()) {
        const id = current.id;
        toBuffer(id, current.job.result());
        current = null;
        emit(id);
      }
      if (now() - start >= sliceMs) break;
    }
    cancel = schedule(tick);
  };

  let filled = false;
  const enqueue = (ids: readonly SoundId[], front: boolean): void => {
    const fresh = ids.filter((id) => !buffers.has(id));
    queue = front
      ? [...fresh, ...queue.filter((q) => !fresh.includes(q))]
      : [...queue, ...fresh.filter((id) => !queue.includes(id))];
  };

  return {
    get(id) {
      const rec = recorded.get(id);
      if (rec) return rec.buffer;
      const b = buffers.get(id);
      if (b) return b;
      if (disposed) return null;
      const def = SOUND_DEFS[id];
      if (!syncRender && (def.kind === 'loop' || def.bus === 'react' || HEAVY.has(id))) {
        // heavy to render (loops, many-voice crowd choirs, long reverbs): never block the game for them
        this.prioritize([id]);
        return null;
      }
      return toBuffer(id, renderSound(id, scale, cache)); // on-demand render of a short one-shot
    },
    ready: (id) => recorded.has(id) || buffers.has(id),
    trim: (id) => recorded.get(id)?.meta.gain ?? 1,
    isRecorded: (id) => recorded.has(id),
    setRecorded(id, buffer, meta) {
      recorded.set(id, { buffer, meta: { gain: meta?.gain ?? 1 } });
      emit(id);
    },
    prioritize(ids) {
      if (syncRender) return;
      enqueue(ids, true);
      this.warm();
    },
    warm() {
      if (disposed || syncRender) return;
      if (!filled) {
        filled = true;
        enqueue([...WARM_FIRST, ...SOUND_IDS.filter((id) => !WARM_FIRST.includes(id))], false);
      }
      if (!queued && queue.length > 0) {
        queued = true;
        cancel = schedule(tick);
      }
    },
    warmAll() {
      for (const id of SOUND_IDS) {
        if (!buffers.has(id)) {
          toBuffer(id, renderSound(id, scale, cache));
          emit(id);
        }
      }
      queue = [];
    },
    pending: () => queue.length + (current ? 1 : 0),
    onReady(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      disposed = true;
      cancel?.();
      cancel = null;
      queue = [];
      current = null;
      listeners.clear();
      buffers.clear();
      recorded.clear();
    },
  };
}
