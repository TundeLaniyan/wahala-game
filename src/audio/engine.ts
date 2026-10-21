/**
 * The audio engine: composition root of this module. Owns the lazily created AudioContext and wires
 * the mixer buses, sound bank, voice pool, crowd ambience, reaction director, state loops and event
 * router together.
 *
 * Layers (each with its own user volume, see prefs.ts / buses.ts):
 *   music     pre-rendered Afrobeats loops + stings (music.ts), menu loop until a match starts
 *   ambience  Lagos street / bus-park / market beds, crowd reactions and spoken Pidgin (pidgin.ts)
 *   sfx       synthesised gameplay effects and warnings (src/audio/recipes)
 * Recorded files in public/audio (see samples.ts) override synthesised sounds slot by slot, which is
 * how the generated Lagos beds replace the synthesised crowd/bus-park beds.
 *
 * Contract highlights (see index.ts for the public surface):
 *  - Nothing is created or played until `unlock()` (call it from a click/touch handler).
 *  - Without an AudioContext (Node, tests, ancient browsers) every method is a silent no-op.
 *  - Audio errors never propagate into the game loop; they go to `opts.onError` (default: ignored).
 */
import type { GameState, SimEvent } from '../sim';
import { createAmbience } from './ambience';
import { createMusicPlayer } from './music';
import type { MusicPlayer, MusicReport } from './music';
import { createPidginVoices } from './pidgin';
import type { PidginVoices, SpokenTrace, VoiceReport } from './pidgin';
import { createPidginReactor, stingForEnd } from './pidginReactions';
import type { PidginReactor } from './pidginReactions';
import { audioPrefs } from './prefs';
import type { PrefsStore } from './prefs';
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
   * LEGACY / manual override. Volumes normally come from the persistent preferences store
   * (`AudioOptions.prefs`, default `audioPrefs`), which the engine follows by itself; while a store
   * is active this call is ignored so a stale caller can never override what the user saved.
   * It applies only when the engine was created with `prefs: null`.
   */
  setVolumes(v: { master: number; music: number; sfx: number; ambience?: number }): void;
  /** Smooth (click-free) mute: ramps the master gain to 0 / back. */
  setMuted(muted: boolean): void;
  /**
   * A match is starting: crossfades the menu music to the in-match Afrobeats loop and starts the
   * Lagos street ambience + chatter. Remembered if called before `unlock()`. (The name predates the
   * music; it now means "enter the match soundscape".)
   */
  startMusic(): void;
  /** Leaving the match: ambience fades out, generator/engine loops stop, the menu music returns. */
  stopMusic(): void;
  /**
   * 0..1 excitement: scales the ambience's excited layer and how eager/loud the crowd reacts. Values
   * above ~0.5 (the app sends 1 for the last 30 s) also fade in the percussion tension stem.
   */
  setIntensity(level: number): void;
  /**
   * Plays SFX and crowd reactions for this batch of sim events and keeps generator / vehicle loops
   * in step with `state`. Call every sim tick or every frame (an empty `events` array is fine).
   */
  handleEvents(events: readonly SimEvent[], state: Readonly<GameState>): void;
  playUi(kind: 'click' | 'back' | 'start' | 'countdown' | 'go'): void;
  /** Resolves when optional recorded sample slots have been tried (always resolves, never rejects). */
  whenSamplesLoaded(): Promise<SlotReport>;
  /** Resolves when the music files have been tried (never rejects). */
  whenMusicLoaded(): Promise<MusicReport>;
  /** Resolves when the spoken-Pidgin packs have been tried (never rejects). */
  whenVoicesLoaded(): Promise<VoiceReport>;
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
  /**
   * Persistent preferences the engine follows (volumes, spoken-Pidgin switch). Default: the shared
   * `audioPrefs` store (localStorage). Pass `null` to opt out (the legacy `setVolumes` then applies).
   */
  prefs?: PrefsStore | null;
  /** Called for every spoken Pidgin line that is actually scheduled (debugging and tests). */
  onSpeak?: (t: SpokenTrace) => void;
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
  music: MusicPlayer;
  voices: PidginVoices;
  reactor: PidginReactor;
}

const NO_MUSIC: MusicReport = { loaded: [], failed: [] };
const NO_VOICES: VoiceReport = { loadedPacks: [], failed: [], clips: 0, scenes: 0 };
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
  const prefs: PrefsStore | null = opts.prefs === undefined ? audioPrefs : opts.prefs;
  const fromPrefs = (): Volumes => {
    const p = (prefs as PrefsStore).get();
    return { master: p.master, music: p.music, ambience: p.ambience, sfx: p.sfx };
  };
  let volumes: Volumes = prefs ? fromPrefs() : { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };
  let muted = false;
  let ambienceWanted = false;
  /** True from startMusic() until stopMusic(): the match soundscape (match music, street chatter). */
  let matchWanted = false;
  let intensity = 0;
  let resuming = false;
  let samples: Promise<SlotReport> = Promise.resolve(EMPTY_REPORT);
  let musicLoaded: Promise<MusicReport> = Promise.resolve(NO_MUSIC);
  let voicesLoaded: Promise<VoiceReport> = Promise.resolve(NO_VOICES);
  let unsubscribePrefs: (() => void) | null = null;

  const build = (ctx: AudioContextLike): Graph => {
    const buses = createBuses(ctx, volumes, muted);
    const bank = createSoundBank(ctx, opts.bank);
    const pool = createVoicePool(ctx);
    const mixer = createMixer(ctx, bank, buses, pool, opts.onPlay);
    const ambience = createAmbience(ctx, bank, buses);
    ambience.setIntensity(intensity);
    const crowd = createReactionDirector(mixer, undefined, { street: true });
    crowd.setIntensity(intensity);
    const fetcher = opts.fetch === undefined ? defaultFetch() : opts.fetch;
    const decode = decoderFor(ctx);
    const music = createMusicPlayer(ctx, buses, {
      fetch: fetcher,
      decode,
      baseUrl: opts.sampleBaseUrl,
      onError: fail,
    });
    music.setScene(matchWanted ? 'match' : 'menu');
    const voices = createPidginVoices(ctx, buses, pool, {
      fetch: fetcher,
      decode,
      baseUrl: opts.sampleBaseUrl,
      onError: fail,
      onSpeak: opts.onSpeak,
    });
    voices.setEnabled(prefs ? prefs.get().voices : true);
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
      music,
      voices,
      reactor: createPidginReactor(voices),
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
    g.music.setScene(matchWanted ? 'match' : 'menu');
    if (ambienceWanted) {
      if (!g.ambience.running) {
        g.voices.reset(g.ctx.currentTime);
        g.reactor.reset();
      }
      g.ambience.start();
    } else {
      g.voices.stop();
      g.ambience.stop();
      g.loops.stopAll();
      g.fuse.reset();
      g.router.reset();
      g.crowd.reset();
    }
  };

  if (prefs) {
    unsubscribePrefs = prefs.subscribe((p) => {
      volumes = { master: p.master, music: p.music, ambience: p.ambience, sfx: p.sfx };
      guard((g) => {
        g.buses.setVolumes(volumes);
        g.voices.setEnabled(p.voices);
      });
    });
  }

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
        // music first (the title screen wants it), then the spoken-Pidgin packs
        musicLoaded = g.music.load();
        voicesLoaded = musicLoaded.then(() => g.voices.load());
      } catch (e) {
        fail(e);
        graph = null;
      }
      unlocking = resumeContext(ctx);
      return unlocking;
    },
    setVolumes(v) {
      if (prefs) return; // the persistent preferences own the mix (see AudioEngine.setVolumes)
      volumes = {
        master: clamp01(v.master),
        music: clamp01(v.music),
        ambience: clamp01(v.ambience ?? volumes.ambience),
        sfx: clamp01(v.sfx),
      };
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
      matchWanted = true;
      guard((g) => {
        applyAmbience(g);
        keepRunning(g);
      });
    },
    stopMusic() {
      ambienceWanted = false;
      matchWanted = false;
      guard(applyAmbience);
    },
    setIntensity(level) {
      const next = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
      if (Math.abs(next - intensity) < 0.005 && graph) return; // the app calls this every frame
      intensity = next;
      guard((g) => {
        g.ambience.setIntensity(intensity);
        g.crowd.setIntensity(intensity);
        g.music.setTension((intensity - 0.5) * 2);
      });
    },
    handleEvents(events, state) {
      guard((g) => {
        if (muted) return;
        keepRunning(g);
        g.router.handle(events, state);
        g.reactor.handle(events, state, g.router.lastNearMisses, g.router.panFor);
        const sting = stingForEnd(events, state);
        if (sting) g.music.sting(sting);
        if (ambienceWanted) g.voices.update(g.ctx.currentTime, intensity);
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
    whenMusicLoaded: () => musicLoaded,
    whenVoicesLoaded: () => voicesLoaded,
    dispose() {
      if (disposed) return;
      const g = graph;
      disposed = true;
      graph = null;
      unsubscribePrefs?.();
      unsubscribePrefs = null;
      if (!g) return;
      try {
        g.music.dispose();
        g.voices.dispose();
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
