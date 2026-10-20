/**
 * The audio engine: composition root of this module. Owns the lazily created AudioContext and wires
 * buses, voice pool, music, crowd bed, fuse ticker and event router together.
 *
 * Contract highlights (see index.ts for the public surface):
 *  - Nothing is created or played until `unlock()` (call it from a click/touch handler).
 *  - Without an AudioContext (Node, tests, ancient browsers) every method is a silent no-op.
 *  - Audio errors never propagate into the game loop; they go to `opts.onError` (default: ignored).
 */
import type { GameState, SimEvent } from '../sim';
import { createBuses } from './buses';
import type { Buses, Volumes } from './buses';
import { defaultContextFactory, primeContext, resumeContext } from './context';
import { createCrowdBed } from './crowdBed';
import type { CrowdBed } from './crowdBed';
import { createEventRouter } from './eventRouter';
import type { EventRouter } from './eventRouter';
import { createFuseTracker } from './fuse';
import type { FuseTracker } from './fuse';
import { createMusic } from './music';
import type { Music } from './music';
import { clamp01, createRand } from './rng';
import { fuseTick } from './sfx/warnings';
import type { SfxRuntime } from './sfx/runtime';
import * as stings from './sfx/stings';
import { createNoiseBuffer } from './synth';
import { createVoicePool } from './voices';
import type { VoicePool } from './voices';
import type { AudioContextLike, ContextFactory } from './webaudio';

export interface AudioEngine {
  /** Call from a user gesture. Idempotent; later calls re-attempt `resume()` if the OS suspended audio. */
  unlock(): Promise<void>;
  /** Each value 0..1 (clamped). Effective SFX level = master x sfx, music = master x music. */
  setVolumes(v: { master: number; music: number; sfx: number }): void;
  /** Smooth (click-free) mute: ramps the master gain to 0 / back. */
  setMuted(muted: boolean): void;
  /** Starts the procedural loop (and the crowd murmur). Remembered if called before `unlock()`. */
  startMusic(): void;
  stopMusic(): void;
  /** 0..1; smoothly layers in more percussion and a slightly faster tempo. */
  setIntensity(level: number): void;
  /**
   * Plays SFX for this batch of sim events and advances fuse ticking from `state.generators`.
   * Call every sim tick or every frame (an empty `events` array is fine and still drives fuses).
   */
  handleEvents(events: readonly SimEvent[], state: Readonly<GameState>): void;
  playUi(kind: 'click' | 'back' | 'start' | 'countdown' | 'go'): void;
  /** Stops timers and sounds and closes the context. The engine is inert afterwards. */
  dispose(): void;
}

export interface AudioOptions {
  /** Creates the AudioContext (called once, from `unlock()`). Default: AudioContext / webkitAudioContext. */
  contextFactory?: ContextFactory;
  /** Receives errors swallowed from the audio path. */
  onError?: (error: unknown) => void;
}

interface Graph {
  ctx: AudioContextLike;
  buses: Buses;
  pool: VoicePool;
  rt: SfxRuntime;
  music: Music;
  crowd: CrowdBed;
  router: EventRouter;
  fuse: FuseTracker;
}

const DEFAULT_VOLUMES: Volumes = { master: 0.8, music: 0.7, sfx: 0.9 };

export function createAudio(opts: AudioOptions = {}): AudioEngine {
  const factory: ContextFactory = opts.contextFactory ?? defaultContextFactory;
  const fail = (e: unknown): void => {
    try {
      opts.onError?.(e);
    } catch {
      /* the error handler itself must not break the game */
    }
  };

  let graph: Graph | null = null;
  let unlocking: Promise<void> | null = null;
  let disposed = false;
  let volumes: Volumes = { ...DEFAULT_VOLUMES };
  let muted = false;
  let musicWanted = false;
  let intensity = 0;
  let resuming = false;

  const build = (ctx: AudioContextLike): Graph => {
    const noise = createNoiseBuffer(ctx);
    const buses = createBuses(ctx, volumes, muted);
    const pool = createVoicePool(ctx, noise);
    const rand = createRand(0x5eed);
    const rt: SfxRuntime = { ctx, noise, buses, pool, rand };
    const crowd = createCrowdBed({ ctx, noise, buses, rand });
    const music = createMusic({ ctx, noise, buses });
    music.setIntensity(intensity);
    return {
      ctx,
      buses,
      pool,
      rt,
      music,
      crowd,
      router: createEventRouter(rt, crowd),
      fuse: createFuseTracker(),
    };
  };

  /** Re-resume if the browser suspended/interrupted the context (iOS does this). */
  const keepRunning = (g: Graph): void => {
    if (resuming || g.ctx.state === 'running' || g.ctx.state === 'closed') return;
    resuming = true;
    void resumeContext(g.ctx).then(() => {
      resuming = false;
    });
  };

  const guard = (fn: (g: Graph) => void): void => {
    if (!graph || disposed) return;
    try {
      fn(graph);
    } catch (e) {
      fail(e);
    }
  };

  const applyMusic = (g: Graph): void => {
    if (musicWanted) {
      g.music.start();
      g.crowd.start();
    } else {
      g.music.stop();
      g.crowd.stop();
    }
  };

  return {
    unlock() {
      if (disposed) return Promise.resolve();
      if (unlocking) {
        if (graph) keepRunning(graph);
        return unlocking;
      }
      let ctx: AudioContextLike | null | undefined;
      try {
        ctx = factory();
      } catch (e) {
        fail(e);
      }
      if (!ctx) {
        unlocking = Promise.resolve(); // silent no-op mode
        return unlocking;
      }
      try {
        graph = build(ctx);
        primeContext(ctx);
        // Start before resume resolves: scheduling is relative to ctx.currentTime, which only
        // advances once the context runs, so nothing is lost and we stay inside the gesture.
        applyMusic(graph);
      } catch (e) {
        fail(e);
        graph = null;
      }
      unlocking = resumeContext(ctx);
      return unlocking;
    },
    setVolumes(v) {
      volumes = { master: clamp01(v.master), music: clamp01(v.music), sfx: clamp01(v.sfx) };
      guard((g) => g.buses.setVolumes(volumes));
    },
    setMuted(m) {
      muted = m;
      guard((g) => g.buses.setMuted(m));
    },
    startMusic() {
      musicWanted = true;
      guard((g) => {
        applyMusic(g);
        keepRunning(g);
      });
    },
    stopMusic() {
      musicWanted = false;
      guard(applyMusic);
    },
    setIntensity(level) {
      intensity = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
      guard((g) => g.music.setIntensity(intensity));
    },
    handleEvents(events, state) {
      guard((g) => {
        if (muted) return;
        keepRunning(g);
        g.router.handle(events, state);
        g.fuse.update(state, g.ctx.currentTime, (urgency, x) => {
          fuseTick(g.rt, urgency, g.router.panFor(state, x));
        });
        if (state.match.phase === 'ended') g.fuse.reset();
      });
    },
    playUi(kind) {
      guard((g) => {
        if (muted) return;
        keepRunning(g);
        stings.ui(g.rt, kind);
      });
    },
    dispose() {
      if (disposed) return;
      const g = graph;
      disposed = true;
      graph = null;
      if (!g) return;
      try {
        g.music.dispose();
        g.crowd.dispose();
        g.pool.stopAll();
        g.buses.dispose();
        void g.ctx.close().catch(() => undefined);
      } catch (e) {
        fail(e);
      }
    },
  };
}
