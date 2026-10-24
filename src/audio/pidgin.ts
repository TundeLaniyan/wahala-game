/**
 * Spoken Nigerian Pidgin: the voice-line registry and the director that plays the founder's approved clips.
 *
 * Data (no code change is needed to add lines; see docs/AUDIO.md "Adding voice clips"):
 *  - public/audio/voices/voices.json    the line catalogue: every planned line with its trigger event, bus,
 *                                       location zone, priority, cooldown, text and speaker, plus which arenas
 *                                       belong to each zone. Generated from the founder manifest.
 *  - public/audio/voices/recorded.json  the approved clips that exist (file + licence statement).
 * A line is playable only when it is in both, is not rejected, has a licence statement, and its trigger is
 * one the game fires (VOICE_TRIGGERS). Anything else stays silent: a missing line never breaks playback.
 *
 * Loading: `load()` reads only the two small manifests. Audio is fetched per scene: `setScene(arenaId)`
 * queues the clips that can play on that arena (gameplay reactions everywhere, conversations only in their
 * zone), most urgent first, two at a time, in the background. A match never waits for them, a clip that
 * fails is never requested again, and the title screen loads nothing.
 *
 * Playback rules (unit-tested with a fake clock):
 *  - one foreground line at a time; a forced line with a more urgent priority (lower number) cuts the
 *    current one short, anything else waits its turn or is dropped;
 *  - after a line, its trigger rests for that line's manifest cooldown; unforced lines also keep
 *    GLOBAL_SPACING between starts; identical triggers inside DEDUPE_S collapse to one;
 *  - shuffle-bag choice per trigger, a line is not repeated within RECENT_LINE_S, the previous speaker is avoided;
 *  - background conversations (bus 'ambient') play on the quieter, filtered ambience path, only in their
 *    zone, at most one at a time, never while a foreground line speaks, and are ducked under one.
 */
import type { Buses } from './buses';
import { createRand, clamp01 } from './rng';
import type { FetchLike } from './samples';
import { audioBaseUrl } from './samples';
import type { VoicePool } from './voices';
import { Priority } from './voices';
import type { AudioBufferLike, AudioContextLike, AudioNodeLike, GainNodeLike } from './webaudio';

/** Every trigger event the game can fire (names from the founder's voice manifest). */
export const VOICE_TRIGGERS = [
  'ON_GENERATOR_CRITICAL_PROXIMITY',
  'ON_GENERATOR_DETONATE',
  'ON_SUDDEN_EXPLOSION_NEARBY',
  'ON_PLAYER_NARROW_ESCAPE',
  'ON_PLAYER_ELIMINATED',
  'ON_PLAYER_COMEDIC_ELIMINATION',
  'ON_PLAYER_SELF_TRAP',
  'ON_DANFO_HAZARD_IMPACT',
  'ON_DANFO_HAZARD_SWEEP',
  'ON_KEKE_HAZARD_SPAWN',
  'ON_OKADA_SHIELD_SAVE',
  'ON_MATCH_VICTORY',
  'ON_FINAL_COUNTDOWN_START',
  'ON_NEAR_MISS_OR_TRAP_ARMED',
  'ON_HAZARD_IMPACT',
  'ON_STALL_BUMP_OR_BLOCK',
  'ON_POWERUP_PICKUP_OR_CLUTCH',
  'AMBIENT_SCHEDULER_PARK',
  'AMBIENT_SCHEDULER_MARKET',
  'AMBIENT_CROWD_FLAREUP',
] as const;
export type VoiceTrigger = (typeof VOICE_TRIGGERS)[number];
/** Triggers the ambient scheduler plays by itself (never requested by gameplay). */
export const AMBIENT_TRIGGERS: readonly VoiceTrigger[] = [
  'AMBIENT_SCHEDULER_PARK',
  'AMBIENT_SCHEDULER_MARKET',
  'AMBIENT_CROWD_FLAREUP',
];
const KNOWN = new Set<string>(VOICE_TRIGGERS);

/** reaction = foreground gameplay line; crowd = foreground non-verbal crowd; ambient = background conversation. */
export type VoiceBus = 'reaction' | 'crowd' | 'ambient';

export interface VoiceLine {
  id: string;
  trigger: string;
  bus: VoiceBus;
  /** 'all', or a zone listed in the catalogue's `zones` (e.g. 'bus_park', 'market'). */
  zone: string;
  /** 1 = most urgent ... 5 = background. */
  priority: number;
  /** Seconds the line's trigger rests after the line plays. */
  cooldown: number;
  text: string;
  speaker: string;
  status: 'planned' | 'rejected';
}
export interface VoiceCatalogue {
  version: number;
  /** Zone -> arena ids where its conversations are heard. */
  zones: Record<string, string[]>;
  lines: VoiceLine[];
}

/** One approved clip in public/audio/voices/recorded.json. */
export interface RecordedEntry {
  /** The catalogue line id this clip voices. */
  id: string;
  /** File name inside public/audio/voices/recorded/ (no folders). */
  file: string;
  /** REQUIRED. Without a licence/consent statement the clip is ignored. */
  license: string;
  speaker?: string;
  /** Seconds (informational). */
  duration?: number;
}
export interface RecordedManifest {
  clips: RecordedEntry[];
}

export interface VoiceReport {
  /** Ids of the playable lines (catalogue + approved clip + known trigger). */
  registered: string[];
  /** Triggers that have at least one playable line. */
  triggers: string[];
  /** Catalogue/recording entries that were ignored, and why. */
  ignored: { id: string; reason: string }[];
}

export interface VoiceStatus {
  scene: string | null;
  registered: number;
  /** Ids decoded so far. */
  loaded: string[];
  /** Ids that failed to load (never requested again). */
  failed: { id: string; reason: string }[];
  /** Ids still queued or in flight. */
  pending: string[];
  speaking: string | null;
}

/** Minimum gap between the STARTS of two unforced foreground lines (seconds). */
export const GLOBAL_SPACING = 4;
/** Forced lines may start this soon after another (when not interrupting). */
export const FORCE_SPACING = 0.35;
export const DEDUPE_S = 0.6;
export const RECENT_LINE_S = 40;
/** Background conversations are held back this long after a foreground line ends. */
export const AMBIENT_HOLD_S = 2.5;
export const AMBIENT_MIN_GAP = 7;
export const AMBIENT_MAX_GAP = 15;
/** A background line never repeats sooner than this, whatever its manifest cooldown. */
export const AMBIENT_LINE_REST = 40;
/** Interrupted lines fade out over about this long (seconds). */
export const INTERRUPT_FADE = 0.06;
/** Concurrent clip downloads. */
const FETCH_CONCURRENCY = 2;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE = /^[A-Za-z0-9_-]+\.(mp3|m4a|ogg|wav)$/;

export interface SayOptions {
  /** Stereo position -1..1 (default centre). */
  pan?: number;
  /** Seconds before the line starts. */
  delay?: number;
  /** Probability 0..1 of speaking at all (default 1). */
  chance?: number;
  /** Critical moment: ignores chance, the global gap and the trigger cooldown, and may cut a less urgent line. */
  force?: boolean;
  /** Collapses duplicate triggers: same trigger + key within DEDUPE_S speaks once. */
  key?: string | number;
}

export interface SpokenTrace {
  clipId: string;
  trigger: string;
  text: string;
  speaker: string;
  priority: number;
  /** Absolute audio time the line starts, and its delay from now. */
  at: number;
  delay: number;
  /** Seconds the line lasts. */
  duration: number;
  pan: number;
  gain: number;
  /** Background conversation (quiet, filtered, never ducks the music). */
  ambient: boolean;
  /** A forced line of priority 1: the music ducks deeper for it. */
  urgent: boolean;
  /** Id of the less urgent line this one cut short, if any. */
  interrupted: string | null;
}

export interface PidginVoices {
  /** Reads the two manifests (no audio). Never rejects. */
  load(): Promise<VoiceReport>;
  /** True once at least one line is registered. */
  readonly ready: boolean;
  setEnabled(on: boolean): void;
  /** Enters a scene (arena id; null = menus): queues that scene's clips for download. */
  setScene(arenaId: string | null): void;
  /** Resolves when the current scene's queue has drained (loaded or failed). Never rejects. */
  whenSceneLoaded(): Promise<void>;
  /** True when this trigger has a decoded line for the current scene. */
  has(trigger: VoiceTrigger): boolean;
  /** Foreground line for the first trigger of the list that can speak. Returns true when one was scheduled. */
  say(trigger: VoiceTrigger | readonly VoiceTrigger[], o?: SayOptions): boolean;
  /** Drives the background-conversation scheduler; call with the audio clock every frame/tick. */
  update(now: number, intensity: number): void;
  /** Drops cooldown history (new match); the first conversation waits a few seconds after `now`. */
  reset(now?: number): void;
  /** Fades out whatever is speaking and resets. */
  stop(): void;
  status(): VoiceStatus;
  dispose(): void;
}

export interface PidginOptions {
  fetch: FetchLike | null;
  decode: (data: ArrayBuffer) => Promise<AudioBufferLike>;
  baseUrl?: string;
  seed?: number;
  onError?: (e: unknown) => void;
  /** Observability hook (subtitles, tests, debugging). */
  onSpeak?: (t: SpokenTrace) => void;
}

/** Validates the catalogue (untrusted JSON). Bad lines are dropped and reported. */
export function parseVoiceCatalogue(raw: unknown): {
  catalogue: VoiceCatalogue;
  ignored: { id: string; reason: string }[];
} {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const ignored: { id: string; reason: string }[] = [];
  const zones: Record<string, string[]> = {};
  if (typeof o.zones === 'object' && o.zones !== null) {
    for (const [zone, arenas] of Object.entries(o.zones as Record<string, unknown>)) {
      if (Array.isArray(arenas)) zones[zone] = arenas.filter((a): a is string => typeof a === 'string');
    }
  }
  const lines: VoiceLine[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(o.lines) ? o.lines : []) {
    const l = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = typeof l.id === 'string' ? l.id : '';
    if (!SAFE_ID.test(id)) {
      ignored.push({ id: String(l.id), reason: 'unsafe or missing id' });
      continue;
    }
    if (seen.has(id)) {
      ignored.push({ id, reason: 'duplicate id' });
      continue;
    }
    if (typeof l.trigger !== 'string' || typeof l.text !== 'string') {
      ignored.push({ id, reason: 'missing trigger or text' });
      continue;
    }
    const bus: VoiceBus = l.bus === 'ambient' || l.bus === 'crowd' ? l.bus : 'reaction';
    const num = (v: unknown, d: number, lo: number, hi: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
    seen.add(id);
    lines.push({
      id,
      trigger: l.trigger,
      bus,
      zone: typeof l.zone === 'string' ? l.zone : 'all',
      priority: Math.round(num(l.priority, 3, 1, 5)),
      cooldown: num(l.cooldown, 5, 0, 120),
      text: l.text,
      speaker: typeof l.speaker === 'string' ? l.speaker : 'unknown',
      status: l.status === 'rejected' ? 'rejected' : 'planned',
    });
  }
  return { catalogue: { version: Number(o.version) || 0, zones, lines }, ignored };
}

/** Validates recorded.json (untrusted JSON): entries need a safe id, a safe file name and a licence. */
export function parseRecorded(raw: unknown): {
  clips: RecordedEntry[];
  ignored: { id: string; reason: string }[];
} {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const clips: RecordedEntry[] = [];
  const ignored: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(o.clips) ? o.clips : []) {
    const e = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = typeof e.id === 'string' ? e.id : '';
    if (!SAFE_ID.test(id)) ignored.push({ id: String(e.id), reason: 'unsafe or missing id' });
    else if (typeof e.license !== 'string' || e.license.trim() === '')
      ignored.push({ id, reason: 'no licence statement' });
    else if (typeof e.file !== 'string' || !SAFE_FILE.test(e.file))
      ignored.push({ id, reason: 'unsafe or missing file name' });
    else if (seen.has(id)) ignored.push({ id, reason: 'duplicate id' });
    else {
      seen.add(id);
      clips.push({
        id,
        file: e.file,
        license: e.license,
        speaker: typeof e.speaker === 'string' ? e.speaker : undefined,
        duration: typeof e.duration === 'number' ? e.duration : undefined,
      });
    }
  }
  return { clips, ignored };
}

/** The playable lines: catalogue x approved clips x triggers the game fires. Pure. */
export function registerLines(
  catalogue: VoiceCatalogue,
  recorded: readonly RecordedEntry[],
): { lines: (VoiceLine & { file: string })[]; ignored: { id: string; reason: string }[] } {
  const byId = new Map(catalogue.lines.map((l) => [l.id, l]));
  const lines: (VoiceLine & { file: string })[] = [];
  const ignored: { id: string; reason: string }[] = [];
  for (const r of recorded) {
    const line = byId.get(r.id);
    if (!line) ignored.push({ id: r.id, reason: 'not in the catalogue' });
    else if (line.status === 'rejected') ignored.push({ id: r.id, reason: 'rejected line' });
    else if (!KNOWN.has(line.trigger)) ignored.push({ id: r.id, reason: `unknown trigger ${line.trigger}` });
    else lines.push({ ...line, file: r.file });
  }
  return { lines, ignored };
}

/** Whether a line can be heard on this arena (zone 'all', or the arena is listed for the line's zone). */
export function lineInScene(
  line: Pick<VoiceLine, 'zone'>,
  zones: Record<string, string[]>,
  arenaId: string | null,
): boolean {
  if (line.zone === 'all') return true;
  return arenaId !== null && (zones[line.zone] ?? []).includes(arenaId);
}

interface Speaking {
  id: string;
  priority: number;
  end: number;
  gain: GainNodeLike;
  src: { stop(when?: number): void };
}

type Line = VoiceLine & { file: string };

export function createPidginVoices(
  ctx: AudioContextLike,
  buses: Buses,
  pool: VoicePool,
  o: PidginOptions,
): PidginVoices {
  const rand = createRand(o.seed ?? 0x91d61);
  const base = `${o.baseUrl ?? audioBaseUrl()}voices/`;
  let lines: Line[] = [];
  let zones: Record<string, string[]> = {};
  const byId = new Map<string, Line>();
  const buffers = new Map<string, AudioBufferLike>();
  const failed = new Map<string, string>();
  const queue: string[] = [];
  const inFlight = new Set<string>();
  let sceneWaiters: (() => void)[] = [];
  let loading: Promise<VoiceReport> | null = null;
  let loaded = false;
  let scene: string | null = null;
  let enabled = true;
  let disposed = false;

  // director state (audio-clock seconds)
  const restUntil = new Map<string, number>();
  const lineRest = new Map<string, number>();
  const bag = new Map<string, string[]>();
  const recentClip = new Map<string, number>();
  const recentTrigger = new Map<string, number>();
  let lastVoice = '';
  let current: Speaking | null = null;
  let lastStart = -Infinity;
  let nextAmbient = 0;
  let ambientEnd = 0;
  let ambientNow: Speaking | null = null;

  // background conversations go through their own gain (on the ambience path) so they can duck under a line
  let chatter: GainNodeLike | null = null;
  const chatterNode = (): GainNodeLike => {
    if (!chatter) {
      chatter = ctx.createGain();
      chatter.gain.value = 1;
      chatter.connect(buses.input('amb'));
    }
    return chatter;
  };

  const fail = (e: unknown): void => {
    try {
      o.onError?.(e);
    } catch {
      /* the error handler must not break the audio path */
    }
  };

  const shuffle = <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };

  const inScene = (l: Line): boolean => lineInScene(l, zones, scene);
  // menus (scene null) never speak, even with clips cached from an earlier match
  const playable = (l: Line): boolean => scene !== null && buffers.has(l.id) && inScene(l);

  // ---------- loading ----------
  const settle = (): void => {
    if (queue.length > 0 || inFlight.size > 0) return;
    const w = sceneWaiters;
    sceneWaiters = [];
    for (const fn of w) fn();
  };

  const pump = (): void => {
    const fetcher = o.fetch;
    while (!disposed && fetcher && inFlight.size < FETCH_CONCURRENCY && queue.length > 0) {
      const id = queue.shift()!;
      const line = byId.get(id);
      if (!line || buffers.has(id) || failed.has(id)) continue;
      inFlight.add(id);
      void (async () => {
        try {
          const res = await fetcher(`${base}recorded/${line.file}`);
          if (!res.ok) throw new Error(`HTTP ${res.status ?? '?'}`);
          const buf = await o.decode(await res.arrayBuffer());
          if (!buf || buf.length < 512) throw new Error('decoded to an empty buffer');
          if (!disposed) buffers.set(id, buf);
        } catch (e) {
          failed.set(id, e instanceof Error ? e.message : String(e));
          fail(e);
        } finally {
          inFlight.delete(id);
          pump();
          settle();
        }
      })();
    }
    settle();
  };

  const queueScene = (): void => {
    queue.length = 0;
    // menus (scene null) load nothing; nothing is known before the manifests are read
    if (!loaded || scene === null) {
      settle();
      return;
    }
    const wanted = lines
      .filter((l) => inScene(l) && !buffers.has(l.id) && !failed.has(l.id) && !inFlight.has(l.id))
      // the most urgent lines first, background conversations last
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    queue.push(...wanted.map((l) => l.id));
    pump();
  };

  // ---------- playback ----------
  /**
   * Picks the next line of a trigger from its shuffle bag (decoded, in scene, rested). The bag is only
   * updated by `take()`, once the line really plays.
   */
  const pick = (trigger: string, now: number): { line: Line; take: () => void } | null => {
    const candidates = lines.filter(
      (l) => l.trigger === trigger && playable(l) && now >= (lineRest.get(l.id) ?? -Infinity),
    );
    if (candidates.length === 0) return null;
    let b = (bag.get(trigger) ?? []).filter((id) => candidates.some((c) => c.id === id));
    if (b.length === 0) b = shuffle(candidates.map((c) => c.id));
    const fresh = (id: string): boolean => now - (recentClip.get(id) ?? -Infinity) >= RECENT_LINE_S;
    let idx = b.findIndex((id) => fresh(id) && byId.get(id)?.speaker !== lastVoice);
    if (idx < 0) idx = b.findIndex(fresh);
    if (idx < 0) {
      // every line was heard lately: the one heard longest ago
      idx = 0;
      for (let i = 1; i < b.length; i++)
        if ((recentClip.get(b[i]!) ?? -Infinity) < (recentClip.get(b[idx]!) ?? -Infinity)) idx = i;
    }
    const id = b[idx]!;
    const line = byId.get(id);
    if (!line) return null;
    return {
      line,
      take: () => {
        b.splice(idx, 1);
        bag.set(trigger, b);
      },
    };
  };

  const fadeOut = (s: Speaking, at: number): void => {
    try {
      s.gain.gain.cancelScheduledValues(at);
      s.gain.gain.setTargetAtTime(0, at, INTERRUPT_FADE / 3);
      s.src.stop(at + INTERRUPT_FADE * 2);
    } catch {
      /* already stopped */
    }
  };

  /** Starts one clip. Returns its length in seconds (0 = not played). */
  const play = (
    line: Line,
    at: number,
    pan: number,
    gain: number,
    ambient: boolean,
    urgent: boolean,
  ): { dur: number; speaking: Speaking } | null => {
    const buf = buffers.get(line.id);
    if (!buf) return null;
    const dur = buf.length / buf.sampleRate;
    const voice = pool.begin({
      priority: ambient ? Priority.ambient : urgent ? Priority.warning : Priority.normal,
      duration: dur,
      dest: ambient ? chatterNode() : buses.input('voice'),
      at,
      pan,
      gain: 1,
    });
    if (!voice) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lineGain = ctx.createGain();
    lineGain.gain.value = gain;
    const nodes: AudioNodeLike[] = [lineGain];
    let tail: AudioNodeLike = src;
    if (ambient) {
      // far away across the street: duller and a little smaller
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      lp.Q.value = 0.5;
      tail.connect(lp);
      tail = lp;
      nodes.push(lp);
    } else {
      // a little presence around 2.5 kHz keeps consonants readable under music and effects
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 2500;
      presence.Q.value = 0.8;
      presence.gain.value = 3;
      tail.connect(presence);
      tail = presence;
      nodes.push(presence);
    }
    tail.connect(lineGain);
    lineGain.connect(voice.dest);
    src.onended = () => {
      try {
        src.disconnect();
        for (const n of nodes) n.disconnect();
      } catch {
        /* ignore */
      }
    };
    src.start(at, 0, dur + 0.02);
    voice.track(src);
    return { dur, speaking: { id: line.id, priority: line.priority, end: at + dur, gain: lineGain, src } };
  };

  const trace = (
    line: Line,
    at: number,
    dur: number,
    pan: number,
    gain: number,
    ambient: boolean,
    urgent: boolean,
    interrupted: string | null,
  ): void => {
    try {
      o.onSpeak?.({
        clipId: line.id,
        trigger: line.trigger,
        text: line.text,
        speaker: line.speaker,
        priority: line.priority,
        at,
        delay: Math.max(0, at - ctx.currentTime),
        duration: dur,
        pan,
        gain,
        ambient,
        urgent,
        interrupted,
      });
    } catch (e) {
      fail(e);
    }
  };

  const duckChatter = (until: number): void => {
    if (!chatter) return;
    const now = ctx.currentTime;
    chatter.gain.cancelScheduledValues(now);
    chatter.gain.setTargetAtTime(0.2, now, 0.05);
    chatter.gain.setTargetAtTime(1, until, 0.3);
  };

  /** Reads voices.json + recorded.json and registers the playable lines (no audio). */
  const readManifests = async (fetcher: FetchLike, report: VoiceReport): Promise<VoiceReport> => {
    const json = async (name: string): Promise<unknown> => {
      try {
        const res = await fetcher(`${base}${name}`);
        return res.ok ? await res.json() : null;
      } catch {
        return null; // offline / not JSON: silent, like the sample slots
      }
    };
    const [rawCatalogue, rawRecorded] = await Promise.all([json('voices.json'), json('recorded.json')]);
    if (disposed || !rawCatalogue || !rawRecorded) return report;
    const { catalogue, ignored: badLines } = parseVoiceCatalogue(rawCatalogue);
    const { clips, ignored: badClips } = parseRecorded(rawRecorded);
    const reg = registerLines(catalogue, clips);
    zones = catalogue.zones;
    lines = reg.lines;
    for (const l of lines) byId.set(l.id, l);
    report.registered = lines.map((l) => l.id);
    report.triggers = [...new Set(lines.map((l) => l.trigger))];
    report.ignored = [...badLines, ...badClips, ...reg.ignored];
    return report;
  };

  const resetDirector = (now: number): void => {
    restUntil.clear();
    lineRest.clear();
    recentClip.clear();
    recentTrigger.clear();
    bag.clear();
    lastVoice = '';
    current = null;
    ambientNow = null;
    lastStart = -Infinity;
    nextAmbient = now + 6 + rand() * 6;
    ambientEnd = 0;
  };

  return {
    get ready() {
      return lines.length > 0;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        const now = ctx.currentTime;
        if (current) fadeOut(current, now);
        if (ambientNow) fadeOut(ambientNow, now);
        current = null;
        ambientNow = null;
      }
    },
    load() {
      if (loading) return loading;
      const report: VoiceReport = { registered: [], triggers: [], ignored: [] };
      loading = (async () => {
        const fetcher = o.fetch;
        try {
          return fetcher ? await readManifests(fetcher, report) : report;
        } finally {
          // read or not, the registry is now settled: scene waiters must not hang on missing manifests
          loaded = true;
          queueScene();
        }
      })();
      return loading;
    },
    setScene(arenaId) {
      scene = arenaId;
      queueScene();
    },
    whenSceneLoaded() {
      if (disposed || (loaded && queue.length === 0 && inFlight.size === 0)) return Promise.resolve();
      return new Promise((resolve) => sceneWaiters.push(resolve));
    },
    has(trigger) {
      return lines.some((l) => l.trigger === trigger && playable(l));
    },
    say(trigger, opts = {}) {
      if (!enabled || disposed || lines.length === 0) return false;
      const list: readonly VoiceTrigger[] = typeof trigger === 'string' ? [trigger] : trigger;
      const now = ctx.currentTime;
      const t = list.find((x) => lines.some((l) => l.trigger === x && playable(l)));
      if (!t) return false; // no clip for this moment yet: stays silent (visual cues carry it)
      const start = now + Math.max(0, opts.delay ?? 0);
      const force = opts.force === true;
      if (opts.key !== undefined) {
        const k = `${list[0]}:${String(opts.key)}`;
        const prev = recentTrigger.get(k);
        if (prev !== undefined && now - prev < DEDUPE_S) return false;
        recentTrigger.set(k, now);
        if (recentTrigger.size > 64)
          for (const [kk, tt] of recentTrigger) if (now - tt > 5) recentTrigger.delete(kk);
      }
      const picked = pick(t, start);
      if (!picked) return false;
      const { line } = picked;
      let interrupt: Speaking | null = null;
      if (current && start < current.end) {
        // never talk over another line, unless this one is a more urgent forced call
        if (!(force && line.priority < current.priority)) return false;
        interrupt = current;
      }
      if (!force) {
        if (start - lastStart < GLOBAL_SPACING) return false;
        if (start < (restUntil.get(t) ?? -Infinity)) return false;
        const chance = opts.chance ?? 1;
        if (chance < 1 && rand() > chance) return false;
      } else if (!interrupt && start - lastStart < FORCE_SPACING) return false;
      const urgent = force && line.priority === 1;
      const pan = Math.max(-0.35, Math.min(0.35, opts.pan ?? 0));
      const gain = line.bus === 'crowd' ? 0.85 : urgent ? 1 : 0.92;
      if (interrupt) fadeOut(interrupt, start);
      const played = play(line, start, pan, gain, false, urgent);
      if (!played) return false;
      const { dur, speaking } = played;
      picked.take();
      buses.duck(urgent ? 'urgentSpeech' : 'speech', { at: start, hold: dur + 0.2 });
      restUntil.set(t, start + line.cooldown);
      recentClip.set(line.id, start);
      lastVoice = line.speaker;
      lastStart = start;
      current = speaking;
      nextAmbient = Math.max(nextAmbient, speaking.end + AMBIENT_HOLD_S);
      if (ambientNow && ambientNow.end > start) {
        if (urgent) {
          fadeOut(ambientNow, start);
          ambientNow = null;
          ambientEnd = start;
        } else duckChatter(speaking.end + 0.2);
      }
      trace(line, start, dur, pan, gain, false, urgent, interrupt?.id ?? null);
      return true;
    },
    update(now, intensity) {
      if (!enabled || disposed || lines.length === 0) return;
      if (now < nextAmbient || now < ambientEnd || (current && now < current.end)) return;
      const ambientLines = lines.filter(
        (l) =>
          AMBIENT_TRIGGERS.includes(l.trigger as VoiceTrigger) &&
          playable(l) &&
          now >= (lineRest.get(l.id) ?? -Infinity),
      );
      const gap =
        (AMBIENT_MIN_GAP + rand() * (AMBIENT_MAX_GAP - AMBIENT_MIN_GAP)) / (1 + 0.3 * clamp01(intensity));
      if (ambientLines.length === 0) {
        nextAmbient = now + gap;
        return;
      }
      // the crowd argues only when the match is lively; otherwise ordinary street talk
      const triggers = [...new Set(ambientLines.map((l) => l.trigger))].filter(
        (t) => t !== 'AMBIENT_CROWD_FLAREUP' || intensity > 0.4,
      );
      if (triggers.length === 0) {
        nextAmbient = now + gap;
        return;
      }
      const t = triggers[Math.floor(rand() * triggers.length)]!;
      const picked = pick(t, now);
      if (!picked) {
        nextAmbient = now + gap;
        return;
      }
      const { line } = picked;
      const at = now + 0.05;
      const pan = (rand() * 2 - 1) * 0.8;
      const gain = line.bus === 'crowd' ? 0.8 : 0.9;
      const played = play(line, at, pan, gain, true, false);
      if (!played) {
        nextAmbient = now + gap;
        return;
      }
      picked.take();
      lineRest.set(line.id, at + Math.max(line.cooldown, AMBIENT_LINE_REST));
      recentClip.set(line.id, at);
      ambientNow = played.speaking;
      ambientEnd = played.speaking.end;
      nextAmbient = ambientEnd + gap;
      trace(line, at, played.dur, pan, gain, true, false, null);
    },
    reset(now = 0) {
      resetDirector(now);
    },
    stop() {
      const now = ctx.currentTime;
      if (current && current.end > now) fadeOut(current, now);
      if (ambientNow && ambientNow.end > now) fadeOut(ambientNow, now);
      resetDirector(now);
    },
    status() {
      return {
        scene,
        registered: lines.length,
        loaded: [...buffers.keys()],
        failed: [...failed].map(([id, reason]) => ({ id, reason })),
        pending: [...queue, ...inFlight],
        speaking: current && current.end > ctx.currentTime ? current.id : null,
      };
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      try {
        chatter?.disconnect();
      } catch {
        /* ignore */
      }
      buffers.clear();
      const w = sceneWaiters;
      sceneWaiters = [];
      for (const fn of w) fn();
    },
  };
}
