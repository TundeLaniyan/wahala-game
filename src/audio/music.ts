/**
 * Music player: an approved playlist of licensed Afrobeats tracks, one per match, streamed and with an
 * escalating endgame.
 *
 * - Tracks are listed in public/audio/music/manifest.json (see playlist.ts for the model and the
 *   rotation rule). Which files actually exist is found out at runtime: each listed file is probed
 *   once (`probe`), and a file that later fails to play is dropped too. Missing files are skipped
 *   silently; with no files at all the player is silent and the rest of the audio is unaffected.
 * - Playback STREAMS through an HTMLAudioElement routed into the Web Audio graph with a
 *   MediaElementAudioSourceNode, so ten tracks never sit decoded in memory and the tempo can change
 *   with `preservesPitch`. Signal path:
 *
 *     <audio> -> deck gain (crossfades) -> high shelf -> punch peak -> trim -> pause gain -> music bus
 *
 *   The music bus input is the music duck (buses.ts), so blasts, warnings and speech still duck the
 *   music, and the user's music volume applies.
 * - Endgame (escalation.ts): from 30 s left, tempo eases 1.0 -> 1.09 (pitch preserved; never changed
 *   where pitch cannot be preserved) and the shelf/punch open up while the trim takes the added level
 *   back out. At the end of the match the tempo returns to 1.0 and the track settles lower until the
 *   menu takes over. A rematch picks a new track and starts again at tempo 1.0.
 * - Pause pauses the stream (after a short fade), resume continues from the same position.
 *
 * Everything browser-specific is injected (`fetch`, `probe`, `createElement`, `schedule`, `rand`)
 * so the unit tests run in Node with fakes.
 */
import type { Buses } from './buses';
import { PUNCH_HZ, PUNCH_Q, SHELF_HZ, tempoFor, toneFor, urgencyOf } from './escalation';
import type { MatchClock } from './escalation';
import { EMPTY_MANIFEST, parseMusicManifest, pickFrom, pickMatchTrack } from './playlist';
import type { MusicManifest, MusicTrack } from './playlist';
import type { Rand } from './rng';
import type { FetchLike } from './samples';
import { audioBaseUrl } from './samples';
import type { AudioContextLike, AudioNodeLike, GainNodeLike, MediaElementLike } from './webaudio';

export type MusicScene = 'off' | 'menu' | 'match';
/** Result kinds (the result stingers are synthesised effects, see eventRouter.ts). */
export type StingKind = 'win' | 'lose' | 'draw';

export interface MusicReport {
  /** Track ids whose files are available. */
  loaded: string[];
  failed: { track: string; reason: string }[];
}

/** Resolves true when the file at `url` exists and is audio (never rejects). */
export type ProbeLike = (url: string) => Promise<boolean>;
export type MediaFactory = () => MediaElementLike;
/** Runs `fn` after `ms` milliseconds; returns a cancel function. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

export interface MusicOptions {
  /** Fetches the manifest. null: no music. */
  fetch: FetchLike | null;
  /** Availability check per listed file. null: every listed file is assumed present until it fails. */
  probe: ProbeLike | null;
  /** Creates the streaming element. null: no music. */
  createElement: MediaFactory | null;
  /** Rotation randomness (inject a seeded one in tests). */
  rand: Rand;
  baseUrl?: string;
  schedule?: Scheduler;
  onError?: (e: unknown) => void;
}

export interface MusicStatus {
  scene: MusicScene;
  /** Track of the deck that is (or is about to be) heard, null when silent. */
  track: string | null;
  arenaId: string | null;
  urgency: number;
  /** Playback rate last written to the element. */
  rate: number;
  pitchPreserved: boolean;
  paused: boolean;
  /** Ids currently considered available. */
  available: string[];
  /** Every match pick so far, oldest first. */
  history: string[];
  /** Playback position of the heard track (seconds) and whether its element is playing (diagnostics). */
  position: number;
  playing: boolean;
}

export interface MusicPlayer {
  /** Fetches the manifest and probes the files (idempotent). Never rejects. */
  load(): Promise<MusicReport>;
  /** 'menu' plays the menu playlist (if any), 'off' silences, 'match' keeps or starts a match track. */
  setScene(scene: MusicScene): void;
  /** A match starts (or restarts): a new track for this arena, tempo and tone back to normal. */
  startMatch(arenaId?: string | null): void;
  /** Every tick/frame during a match: follows the game clock (escalation, match end). */
  update(clock: MatchClock): void;
  setPaused(paused: boolean): void;
  status(): MusicStatus;
  dispose(): void;
}

const FADE_IN = 1.0;
const CROSSFADE = 1.2;
const FADE_TO_MENU = 1.6;
/** Level the track settles to once the match has ended (until the results / menu take over). */
const END_LEVEL = 0.55;
/** Playback rate returns to 1.0 at this many units per second after the match ends. */
const RATE_RETURN_PER_SEC = 0.06;
/**
 * Playback rates written to the element are quantised to this grid (avoids re-initialising the time
 * stretcher 60 times a second; 1.0, 1.045 and 1.09 lie on it).
 */
const RATE_STEP = 0.0025;
const TONE_STEP = 0.01;
const PAUSE_FADE_MS = 120;
const RETRY_PLAY_SEC = 1.5;

interface Deck {
  track: MusicTrack;
  kind: 'menu' | 'match';
  el: MediaElementLike;
  node: AudioNodeLike;
  gain: GainNodeLike;
  pitch: boolean;
  /** Logical playback rate (smooth). */
  rate: number;
  /** Quantised rate last written to the element. */
  written: number;
  onError: () => void;
  released: boolean;
  /** previousMatch before this deck was picked (restored if its file turns out to be broken). */
  prevBefore: string | null;
  lastPlayTry: number;
}

const defaultSchedule: Scheduler = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** Sets preservesPitch (or its prefixed variant). Returns whether pitch preservation is supported. */
export function enablePreservesPitch(el: MediaElementLike): boolean {
  const e = el as MediaElementLike & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };
  for (const k of ['preservesPitch', 'webkitPreservesPitch', 'mozPreservesPitch'] as const) {
    if (k in e) {
      try {
        e[k] = true;
        return e[k] === true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

/** HEAD request through the global fetch: true for an existing, non-HTML file. */
export function defaultProbe(): ProbeLike | null {
  const f = (globalThis as { fetch?: unknown }).fetch;
  if (typeof f !== 'function') return null;
  const fetcher = f as (
    url: string,
    init: { method: string },
  ) => Promise<{ ok: boolean; headers?: { get(name: string): string | null } }>;
  return async (url) => {
    try {
      const r = await fetcher.call(globalThis, url, { method: 'HEAD' });
      if (!r.ok) return false;
      const type = r.headers?.get('content-type') ?? '';
      return !/text\/html/i.test(type); // a dev-server SPA fallback page is not a track
    } catch {
      return false;
    }
  };
}

/** Probe built on an injected FetchLike (tests and tools): the file exists when the request succeeds. */
export function probeVia(fetcher: FetchLike): ProbeLike {
  return async (url) => {
    try {
      return (await fetcher(url)).ok;
    } catch {
      return false;
    }
  };
}

/** `() => new Audio()` in a browser, null elsewhere. */
export function defaultMediaFactory(): MediaFactory | null {
  const A = (globalThis as { Audio?: new () => MediaElementLike }).Audio;
  return typeof A === 'function' ? () => new A() : null;
}

export function createMusicPlayer(ctx: AudioContextLike, buses: Buses, o: MusicOptions): MusicPlayer {
  const schedule = o.schedule ?? defaultSchedule;
  const base = `${o.baseUrl ?? audioBaseUrl()}music/`;
  const fail = (e: unknown): void => {
    try {
      o.onError?.(e);
    } catch {
      /* the error handler must not break the audio path */
    }
  };

  // ---- the shared tone chain
  const nodes: AudioNodeLike[] = [];
  const mk = <T extends AudioNodeLike>(n: T): T => {
    nodes.push(n);
    return n;
  };
  const toneIn = mk(ctx.createGain());
  const shelf = mk(ctx.createBiquadFilter());
  shelf.type = 'highshelf';
  shelf.frequency.value = SHELF_HZ;
  shelf.gain.value = 0;
  const punch = mk(ctx.createBiquadFilter());
  punch.type = 'peaking';
  punch.frequency.value = PUNCH_HZ;
  punch.Q.value = PUNCH_Q;
  punch.gain.value = 0;
  const trim = mk(ctx.createGain());
  const pauseGain = mk(ctx.createGain());
  toneIn.connect(shelf);
  shelf.connect(punch);
  punch.connect(trim);
  trim.connect(pauseGain);
  pauseGain.connect(buses.input('music'));

  let manifest: MusicManifest | null = null;
  const availability = new Map<string, boolean>();
  const report: MusicReport = { loaded: [], failed: [] };
  let loading: Promise<MusicReport> | null = null;
  let disposed = false;

  let wanted: MusicScene = 'menu';
  let arena: string | null = null;
  let current: Deck | null = null;
  const live = new Set<Deck>();
  let previousMatch: string | null = null;
  /** Arenas that already had a match this session (their `start` track has been used). */
  const arenasStarted = new Set<string>();
  let previousMenu: string | null = null;
  const history: string[] = [];
  let paused = false;
  let cancelPause: (() => void) | null = null;
  let urgency = 0;
  let toneU = 0;
  let ended = false;
  let lastUpdateAt = -1;

  const isAvailable = (id: string): boolean => availability.get(id) !== false;
  const trackById = (id: string): MusicTrack | undefined => manifest?.tracks.find((t) => t.id === id);
  const noteFailure = (track: string, reason: string): void => {
    report.failed = report.failed.filter((f) => f.track !== track);
    report.failed.push({ track, reason });
    report.loaded = report.loaded.filter((x) => x !== track);
  };

  const applyTone = (u: number, tc: number): void => {
    const t = toneFor(u);
    const now = ctx.currentTime;
    for (const [param, v] of [
      [shelf.gain, t.shelfDb],
      [punch.gain, t.punchDb],
      [trim.gain, t.trim],
    ] as const) {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(v, now, tc);
    }
    toneU = u;
  };

  const writeRate = (d: Deck, rate: number): void => {
    if (!d.pitch) return; // never change the rate without pitch preservation (no chipmunk music)
    d.rate = rate;
    const q = Math.round(1e6 * (1 + Math.round((rate - 1) / RATE_STEP) * RATE_STEP)) / 1e6;
    if (q === d.written) return;
    try {
      d.el.playbackRate = q;
      d.written = q;
    } catch (e) {
      fail(e);
    }
  };

  const tryPlay = (d: Deck): void => {
    d.lastPlayTry = ctx.currentTime;
    try {
      const p = d.el.play();
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch(() => undefined); // autoplay refusals / missing files: handled via 'error'
      }
    } catch {
      /* ignore */
    }
  };

  const release = (d: Deck): void => {
    if (d.released) return;
    d.released = true;
    live.delete(d);
    try {
      d.el.removeEventListener('error', d.onError);
      d.el.pause();
      d.el.removeAttribute?.('src');
      d.el.load(); // drops the network stream and decoder
    } catch {
      /* ignore */
    }
    try {
      d.node.disconnect();
      d.gain.disconnect();
    } catch {
      /* ignore */
    }
  };

  const closeDeck = (d: Deck, fade: number): void => {
    if (current === d) current = null;
    if (d.released) return;
    const now = ctx.currentTime;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setTargetAtTime(0, now, Math.max(0.01, fade / 4));
    schedule(() => release(d), (fade + 0.3) * 1000);
  };

  const onDeckError = (d: Deck): void => {
    if (d.released) return;
    availability.set(d.track.id, false);
    noteFailure(d.track.id, `${d.track.file}: could not be played`);
    const wasCurrent = current === d;
    release(d);
    if (current === d) current = null;
    if (!wasCurrent || disposed) return;
    // try another track for the same scene
    if (d.kind === 'match' && wanted === 'match') {
      previousMatch = d.prevBefore;
      history.pop();
      openMatch();
    } else if (d.kind === 'menu' && wanted === 'menu') openMenu();
  };

  const openDeck = (track: MusicTrack, kind: Deck['kind'], fade: number): Deck | null => {
    if (!o.createElement || !ctx.createMediaElementSource) return null;
    let d: Deck;
    try {
      const el = o.createElement();
      el.preload = 'auto';
      el.loop = true; // a match longer than the track simply goes round again
      const pitch = enablePreservesPitch(el);
      el.playbackRate = 1;
      el.src = base + track.file;
      const node = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      node.connect(gain);
      gain.connect(toneIn);
      d = {
        track,
        kind,
        el,
        node,
        gain,
        pitch,
        rate: 1,
        written: 1,
        onError: () => onDeckError(d),
        released: false,
        prevBefore: previousMatch,
        lastPlayTry: -Infinity,
      };
      el.addEventListener('error', d.onError);
    } catch (e) {
      fail(e);
      return null;
    }
    live.add(d);
    const now = ctx.currentTime;
    d.gain.gain.setTargetAtTime(track.gain, now, fade / 3);
    if (!paused) tryPlay(d);
    return d;
  };

  function openMatch(): void {
    if (!manifest) return;
    const id = pickMatchTrack(manifest, {
      arenaId: arena,
      previous: previousMatch,
      isAvailable,
      rand: o.rand,
      firstOnArena: arena !== null && !arenasStarted.has(arena),
    });
    if (arena !== null) arenasStarted.add(arena);
    const t = id ? trackById(id) : undefined;
    if (!t) return;
    const d = openDeck(t, 'match', CROSSFADE);
    if (!d) return;
    current = d;
    previousMatch = t.id;
    history.push(t.id);
  }

  function openMenu(): void {
    if (!manifest) return;
    const id = pickFrom(manifest.menu.filter(isAvailable), previousMenu, o.rand);
    const t = id ? trackById(id) : undefined;
    if (!t) return;
    const d = openDeck(t, 'menu', FADE_IN);
    if (!d) return;
    current = d;
    previousMenu = t.id;
  }

  const resetEscalation = (tc: number): void => {
    urgency = 0;
    ended = false;
    lastUpdateAt = -1;
    if (toneU !== 0) applyTone(0, tc);
  };

  /** Brings the decks in line with the wanted scene (idempotent). */
  const apply = (): void => {
    if (disposed) return;
    if (wanted === 'off') {
      if (current) closeDeck(current, 0.8);
      return;
    }
    if (current && current.kind !== wanted) closeDeck(current, wanted === 'menu' ? FADE_TO_MENU : CROSSFADE);
    if (current) return;
    if (wanted === 'match') openMatch();
    else openMenu();
  };

  const setPausedImpl = (p: boolean): void => {
    if (p === paused) return;
    paused = p;
    cancelPause?.();
    cancelPause = null;
    const now = ctx.currentTime;
    pauseGain.gain.cancelScheduledValues(now);
    if (p) {
      pauseGain.gain.setTargetAtTime(0, now, 0.03);
      // pause the stream once the fade has landed, so pausing never clicks
      cancelPause = schedule(() => {
        cancelPause = null;
        if (!paused) return;
        for (const d of live) {
          try {
            d.el.pause();
          } catch {
            /* ignore */
          }
        }
      }, PAUSE_FADE_MS);
    } else {
      pauseGain.gain.setTargetAtTime(1, now, 0.08);
      for (const d of live) if (d.el.paused) tryPlay(d);
    }
  };

  return {
    load() {
      if (loading) return loading;
      loading = (async () => {
        const fetcher = o.fetch;
        let parsed: MusicManifest = EMPTY_MANIFEST;
        if (fetcher) {
          try {
            const res = await fetcher(`${base}manifest.json`);
            if (res.ok) {
              const r = parseMusicManifest(await res.json());
              parsed = r.manifest;
              report.failed.push(...r.rejected);
            }
          } catch {
            /* offline / not JSON: silent */
          }
        }
        if (disposed) return report;
        const probe = o.probe;
        await Promise.all(
          parsed.tracks.map(async (t) => {
            const ok = probe ? await probe(base + t.file).catch(() => false) : true;
            availability.set(t.id, ok);
          }),
        );
        if (disposed) return report;
        for (const t of parsed.tracks) {
          if (availability.get(t.id)) report.loaded.push(t.id);
          else report.failed.push({ track: t.id, reason: `${t.file}: file missing` });
        }
        manifest = parsed;
        apply();
        return report;
      })().catch((e: unknown) => {
        fail(e);
        return report;
      });
      return loading;
    },
    setScene(scene) {
      if (scene === wanted && (scene !== 'match' || current)) return;
      wanted = scene;
      if (scene !== 'match') resetEscalation(0.4);
      apply();
    },
    startMatch(arenaId) {
      if (disposed) return;
      wanted = 'match';
      arena = arenaId ?? null;
      setPausedImpl(false);
      resetEscalation(0.05);
      if (current) closeDeck(current, CROSSFADE);
      openMatch(); // no-op until the manifest has loaded; load() then calls apply()
    },
    update(clock) {
      const d = current;
      if (disposed || wanted !== 'match' || !d || d.kind !== 'match') return;
      const now = ctx.currentTime;
      const dt = lastUpdateAt < 0 ? 0 : Math.max(0, now - lastUpdateAt);
      lastUpdateAt = now;
      if (clock.phase === 'ended') {
        if (!ended) {
          ended = true;
          d.gain.gain.cancelScheduledValues(now);
          d.gain.gain.setTargetAtTime(d.track.gain * END_LEVEL, now, 0.4);
          applyTone(0, 0.5);
        }
        urgency = 0;
        // ease the tempo back to 1.0 (at most RATE_RETURN_PER_SEC per second)
        const next = d.rate > 1 ? Math.max(1, d.rate - RATE_RETURN_PER_SEC * dt) : 1;
        writeRate(d, next);
        return;
      }
      if (paused) return;
      if (d.el.paused && now - d.lastPlayTry > RETRY_PLAY_SEC) tryPlay(d); // an autoplay refusal earlier
      urgency = urgencyOf(clock);
      writeRate(d, tempoFor(urgency, d.pitch));
      if (Math.abs(urgency - toneU) >= TONE_STEP || (urgency === 0 && toneU !== 0)) applyTone(urgency, 0.25);
    },
    setPaused: (p) => {
      if (!disposed) setPausedImpl(p);
    },
    status: () => ({
      scene: wanted,
      track: current?.track.id ?? null,
      arenaId: arena,
      urgency,
      rate: current?.written ?? 1,
      pitchPreserved: current?.pitch ?? false,
      paused,
      available: manifest ? manifest.tracks.filter((t) => isAvailable(t.id)).map((t) => t.id) : [],
      history: [...history],
      position: current ? current.el.currentTime : 0,
      playing: current ? !current.el.paused : false,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPause?.();
      for (const d of [...live]) release(d);
      current = null;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
