/**
 * The audio engine: composition root of this module. Owns the lazily created AudioContext and wires
 * the mixer buses, sound bank, voice pool, crowd ambience, reaction director, state loops and event
 * router together.
 *
 * THERE IS NO MUSIC. `startMusic` / `stopMusic` / `setIntensity` keep their names so the app keeps
 * working, but they only control the looping crowd/bus-park AMBIENCE; the `music` volume scales the
 * crowd. Every sound is either SYNTHESISED in src/audio/recipes or, when a licensed recording has
 * been dropped into public/audio (see samples.ts), that recording.
 *
 * Contract highlights (see index.ts for the public surface):
 *  - Nothing is created or played until `unlock()` (call it from a click/touch handler).
 *  - Without an AudioContext (Node, tests, ancient browsers) every method is a silent no-op.
 *  - Audio errors never propagate into the game loop; they go to `opts.onError` (default: ignored).
 */
import type { GameState, SimEvent } from '../sim';
import { createAmbience } from './ambience';
import type { Ambience } from './ambience';
import { createSoundBank } from './bank';
import type { BankOptions, SoundBank } from './bank';
import { createBuses } from './buses';
import type { Buses, Volumes } from './buses';
import { defaultContextFactory, primeContext, resumeContext } from './context';
import { createEventRouter } from './eventRouter';
import type { EventRouter } from './eventRouter';
import { createFuseTracker } from './fuse';
import type { FuseTracker } from './fuse';
import { createLoopSet } from './loops';
import type { LoopSet } from './loops';
import { createMixer } from './mixer';
import type { Mixer, PlayTrace } from './mixer';
import type { SoundId } from './recipes';
import { createReactionDirector } from './reactions';
import type { ReactionDirector } from './reactions';
import { clamp01 } from './rng';
import { decoderFor, defaultFetch, loadRecordedSlots } from './samples';
import type { FetchLike, SlotReport } from './samples';
import { updateStateLoops } from './stateLoops';
import { createVoicePool } from './voices';
import type { VoicePool } from './voices';
import type { AudioContextLike, ContextFactory } from './webaudio';

export interface AudioEngine {
  /** Call from a user gesture. Idempotent; later calls re-attempt `resume()` if the OS suspended audio. */
  unlock(): Promise<void>;
  /**
   * Each value 0..1 (clamped). Effective SFX level = master x sfx. `music` is kept for API
   * compatibility and now scales the crowd ambience + crowd reactions (there is no music).
   */
  setVolumes(v: { master: number; music: number; sfx: number }): void;
  /** Smooth (click-free) mute: ramps the master gain to 0 / back. */
  setMuted(muted: boolean): void;
  /**
   * Starts the looping crowd/bus-park ambience (NOT music; the name is historical). Remembered if
   * called before `unlock()`.
   */
  startMusic(): void;
  /** Fades the ambience out and stops state-driven loops (generators, engines). */
  stopMusic(): void;
  /** 0..1 excitement: scales the ambience's excited layer and how eager/loud the crowd reacts. */
  setIntensity(level: number): void;
  /**
   * Plays SFX and crowd reactions for this batch of sim events and keeps generator / vehicle loops
   * in step with `state`. Call every sim tick or every frame (an empty `events` array is fine).
   */
  handleEvents(events: readonly SimEvent[], state: Readonly<GameState>): void;
  playUi(kind: 'click' | 'back' | 'start' | 'countdown' | 'go'): void;
  /** Resolves when optional recorded sample slots have been tried (always resolves, never rejects). */
  whenSamplesLoaded(): Promise<SlotReport>;
  /** Stops timers and sounds and closes the context. The engine is inert afterwards. */
  dispose(): void;
}

export interface AudioOptions {
  /** Creates the AudioContext (called once, from `unlock()`). Default: AudioContext / webkitAudioContext. */
  contextFactory?: ContextFactory;
  /** Receives errors swallowed from the audio path. */
  onError?: (error: unknown) => void;
  /**
   * Fetch used to look for recorded sample slots. Default: global `fetch` in a browser; none
   * elsewhere. Pass `null` to disable the lookup entirely.
   */
  fetch?: FetchLike | null;
  /** Base URL of the sample folder (default `<BASE_URL>audio/`). */
  sampleBaseUrl?: string;
  /** Sound bank tuning (tests lower `rateScale`; `schedule` replaces setTimeout slicing). */
  bank?: BankOptions;
  /** Called for every one-shot that is actually started (debugging and tests). */
  onPlay?: (t: PlayTrace) => void;
}

interface Graph {
  ctx: AudioContextLike;
  buses: Buses;
  bank: SoundBank;
  pool: VoicePool;
  mixer: Mixer;
  ambience: Ambience;
  crowd: ReactionDirector;
  loops: LoopSet;
  router: EventRouter;
  fuse: FuseTracker;
}

const DEFAULT_VOLUMES: Volumes = { master: 0.8, music: 0.8, sfx: 0.9 };
const UI_SOUND: Record<Parameters<AudioEngine['playUi']>[0], SoundId> = {
  click: 'ui_click',
  back: 'ui_back',
  start: 'ui_start',
  countdown: 'ui_count',
  go: 'ui_go',
};
const EMPTY_REPORT: SlotReport = { loaded: [], skipped: [] };

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
  let ambienceWanted = false;
  let intensity = 0;
  let resuming = false;
  let samples: Promise<SlotReport> = Promise.resolve(EMPTY_REPORT);

  const build = (ctx: AudioContextLike): Graph => {
    const buses = createBuses(ctx, volumes, muted);
    const bank = createSoundBank(ctx, opts.bank);
    const pool = createVoicePool(ctx);
    const mixer = createMixer(ctx, bank, buses, pool, opts.onPlay);
    const ambience = createAmbience(ctx, bank, buses);
    ambience.setIntensity(intensity);
    const crowd = createReactionDirector(mixer);
    crowd.setIntensity(intensity);
    return {
      ctx,
      buses,
      bank,
      pool,
      mixer,
      ambience,
      crowd,
      loops: createLoopSet(ctx, bank, buses),
      router: createEventRouter({ mixer, buses, crowd, ambience, now: () => ctx.currentTime }),
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

  const applyAmbience = (g: Graph): void => {
    if (ambienceWanted) g.ambience.start();
    else {
      g.ambience.stop();
      g.loops.stopAll();
      g.fuse.reset();
      g.router.reset();
      g.crowd.reset();
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
        graph.bank.warm(); // sliced background rendering of the synthesised sound bank
        // Start before resume resolves: scheduling is relative to ctx.currentTime, which only
        // advances once the context runs, so nothing is lost and we stay inside the gesture.
        applyAmbience(graph);
        const g = graph;
        const fetcher = opts.fetch === undefined ? defaultFetch() : opts.fetch;
        samples = loadRecordedSlots({
          fetch: fetcher,
          decode: decoderFor(ctx),
          baseUrl: opts.sampleBaseUrl,
          isCancelled: () => disposed,
          onSlot: (id, buffer, meta) => g.bank.setRecorded(id, buffer, meta),
        }).catch((e: unknown) => {
          fail(e);
          return EMPTY_REPORT;
        });
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
      guard((g) => {
        g.buses.setMuted(m);
        if (m) g.loops.stopAll(); // loops rebuild on the next update after unmuting
      });
    },
    startMusic() {
      ambienceWanted = true;
      guard((g) => {
        applyAmbience(g);
        keepRunning(g);
      });
    },
    stopMusic() {
      ambienceWanted = false;
      guard(applyAmbience);
    },
    setIntensity(level) {
      const next = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
      if (Math.abs(next - intensity) < 0.005 && graph) return; // the app calls this every frame
      intensity = next;
      guard((g) => {
        g.ambience.setIntensity(intensity);
        g.crowd.setIntensity(intensity);
      });
    },
    handleEvents(events, state) {
      guard((g) => {
        if (muted) return;
        keepRunning(g);
        g.router.handle(events, state);
        g.fuse.update(state, g.ctx.currentTime, (e) => {
          const pan = g.router.panFor(state, e.tileX);
          if (e.mode === 'timed') {
            // the high tick joins the putt-putt loop once the fuse is past its first half
            if (e.urgency >= 0.4) {
              g.mixer.play('fuse_tick', { pan, gain: 0.5 + 0.5 * e.urgency, rate: 1 + 0.45 * e.urgency });
            }
          } else g.mixer.play('gen_remote_blip', { pan, rate: 1 + 0.25 * e.urgency });
        });
        if (state.match.phase === 'ended') {
          g.fuse.reset();
          g.loops.stopAll();
        } else updateStateLoops(g.loops, state, (x) => g.router.panFor(state, x));
      });
    },
    playUi(kind) {
      guard((g) => {
        if (muted) return;
        keepRunning(g);
        g.mixer.play(UI_SOUND[kind]);
      });
    },
    whenSamplesLoaded: () => samples,
    dispose() {
      if (disposed) return;
      const g = graph;
      disposed = true;
      graph = null;
      if (!g) return;
      try {
        g.ambience.dispose();
        g.loops.stopAll();
        g.pool.stopAll();
        g.bank.dispose();
        g.buses.dispose();
        void g.ctx.close().catch(() => undefined);
      } catch (e) {
        fail(e);
      }
    },
  };
}
