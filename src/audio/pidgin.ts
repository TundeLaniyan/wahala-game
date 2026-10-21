/**
 * Spoken Nigerian Pidgin: situational crowd reactions and ambient street conversations.
 *
 * WHAT THE AUDIO IS (be honest about it): the clips in public/audio/voices are SYNTHETIC speech made
 * offline with a free neural English text-to-speech model fed hand-written Pidgin pronunciations
 * (tools/audiogen/build_voices.py). They are intelligible placeholders, NOT recordings of Nigerian
 * speakers, and the accent is not authentic. Real recordings can replace any clip (same sprite layout,
 * or per-clip files) without code changes; see docs/AUDIO.md.
 *
 * Playback rules implemented here (all unit-tested with a fake clock):
 *  - per-category cooldowns, so a reaction type never repeats within a few seconds;
 *  - shuffle-bag line choice: every line of a category is used before any repeats, and a line is never
 *    played twice within RECENT_LINE_S;
 *  - voice variety: the speaker of the previous line is avoided when another is available;
 *  - one reaction voice at a time (GLOBAL_SPACING); critical lines (`force`) may shorten the gap but
 *    never overlap another reaction;
 *  - identical triggers inside DEDUPE_S (same category + key) collapse to one;
 *  - ambient chatter yields: it is ducked while a reaction speaks and is held back for AMBIENT_HOLD_S
 *    after one, and only one ambient scene runs at a time.
 * The module never schedules anything until `load()` has fetched and decoded the clips, and it is a
 * silent no-op when the assets are missing.
 */
import type { Buses } from './buses';
import { createRand, clamp01 } from './rng';
import type { FetchLike } from './samples';
import { audioBaseUrl } from './samples';
import type { VoicePool } from './voices';
import { Priority } from './voices';
import type { AudioBufferLike, AudioContextLike, GainNodeLike } from './webaudio';

/** Triggers a gameplay reaction can be filed under (see tools/audiogen/pidgin_script.py REACTIONS). */
export type VoiceCategory =
  | 'match_start'
  | 'gen_placed'
  | 'fuse'
  | 'escape'
  | 'elim_bot'
  | 'elim_human'
  | 'danfo'
  | 'taxi'
  | 'keke'
  | 'vehicle_destroyed'
  | 'okada_save'
  | 'okada_break'
  | 'final'
  | 'win'
  | 'lose'
  | 'draw'
  | 'kicked'
  | 'pickup'
  | 'pushed'
  | 'thrown'
  | 'crush'
  | 'hazard'
  | 'dazed';

export interface ClipMeta {
  id: string;
  pack: string;
  /** 'react' clips are gameplay reactions; 'ambient' clips belong to a scene. */
  category: string;
  text: string;
  voice: string;
  /** Position of the clip inside its pack, in seconds. */
  start: number;
  dur: number;
}
export interface SceneMeta {
  id: string;
  kind: 'talk' | 'call';
  clips: string[];
}
export interface PackMeta {
  files: Partial<Record<'ogg' | 'mp3', string>>;
}
export interface VoiceManifest {
  version: number;
  /** True while the clips are machine-generated placeholders (they are, today). */
  synthetic: boolean;
  note?: string;
  packs: Record<string, PackMeta>;
  clips: ClipMeta[];
  scenes: SceneMeta[];
}

/** public/audio/voices/recorded.json: real recordings that replace (or add to) the synthetic placeholder lines. */
export interface RecordedEntry {
  /** An existing clip id (replaces that line) or a new id (needs `category` and `text`; adds a line). */
  id: string;
  /** File name inside public/audio/voices/recorded/ (no folders). */
  file: string;
  /** REQUIRED. Without a licence/consent statement the recording is ignored. */
  license: string;
  speaker?: string;
  category?: string;
  text?: string;
}
export interface RecordedManifest {
  clips: RecordedEntry[];
}

export interface VoiceReport {
  loadedPacks: string[];
  /** Ids of lines served from real recordings (public/audio/voices/recorded.json). */
  recorded?: string[];
  failed: { pack: string; reason: string }[];
  clips: number;
  scenes: number;
}

/** Seconds a category must rest after speaking. */
export const CATEGORY_COOLDOWN: Readonly<Record<VoiceCategory, number>> = {
  match_start: 30,
  gen_placed: 22,
  fuse: 15,
  escape: 14,
  elim_bot: 8,
  elim_human: 8,
  danfo: 12,
  taxi: 12,
  keke: 12,
  vehicle_destroyed: 10,
  okada_save: 10,
  okada_break: 10,
  final: 20,
  win: 0,
  lose: 0,
  draw: 0,
  kicked: 25,
  pickup: 30,
  pushed: 20,
  thrown: 18,
  crush: 20,
  hazard: 20,
  dazed: 25,
};
/** Minimum gap between the STARTS of two unforced reaction lines (seconds): the crowd is chatty, not frantic. */
export const GLOBAL_SPACING = 4.5;
/** Forced (critical) lines may start this soon after another, but never while one is still speaking. */
export const FORCE_SPACING = 0.35;
export const DEDUPE_S = 0.6;
export const RECENT_LINE_S = 40;
/** Ambient chatter is held back this long after a gameplay reaction. */
export const AMBIENT_HOLD_S = 2.5;
export const AMBIENT_MIN_GAP = 4.5;
export const AMBIENT_MAX_GAP = 11;
export const AMBIENT_MAX_SCENE_S = 14;

export interface SayOptions {
  /** Stereo position -1..1 (default random). */
  pan?: number;
  /** Seconds before the line starts. */
  delay?: number;
  /** Probability 0..1 of speaking at all (default 1). */
  chance?: number;
  /** Critical moment: ignores chance, the global gap and the category cooldown. */
  force?: boolean;
  /** Extra loudness 0..1 (default 0.8). */
  strength?: number;
  /** Collapses duplicate triggers: same category + key within DEDUPE_S speaks once. */
  key?: string | number;
}

export interface SpokenTrace {
  clipId: string;
  category: string;
  voice: string;
  at: number;
  pan: number;
  gain: number;
  ambient: boolean;
  /** True when the line is a real recording rather than a synthetic placeholder. */
  recorded: boolean;
}

export interface PidginVoices {
  load(): Promise<VoiceReport>;
  /** True once at least one clip pack decoded. */
  readonly ready: boolean;
  setEnabled(on: boolean): void;
  /** Gameplay reaction. Returns true when a line was actually scheduled. */
  say(category: VoiceCategory, o?: SayOptions): boolean;
  /** Drives the ambient chatter scheduler; call with the audio clock every frame/tick. */
  update(now: number, intensity: number): void;
  /** Drops cooldown history (new match); the first ambient scene waits a few seconds after `now`. */
  reset(now?: number): void;
  stop(): void;
  dispose(): void;
}

export interface PidginOptions {
  fetch: FetchLike | null;
  decode: (data: ArrayBuffer) => Promise<AudioBufferLike>;
  baseUrl?: string;
  seed?: number;
  onError?: (e: unknown) => void;
  /** Observability hook for tests/debugging. */
  onSpeak?: (t: SpokenTrace) => void;
}

export function createPidginVoices(
  ctx: AudioContextLike,
  buses: Buses,
  pool: VoicePool,
  o: PidginOptions,
): PidginVoices {
  const rand = createRand(o.seed ?? 0x91d61);
  const packs = new Map<string, AudioBufferLike>();
  /** Real recordings by clip id: replace the synthetic line (or add a new one). */
  const recordings = new Map<string, AudioBufferLike>();
  const byCategory = new Map<string, ClipMeta[]>();
  const byId = new Map<string, ClipMeta>();
  let scenes: SceneMeta[] = [];
  let loading: Promise<VoiceReport> | null = null;
  let enabled = true;
  let disposed = false;

  // director state (audio-clock seconds)
  const lastCategory = new Map<string, number>();
  const bag = new Map<string, string[]>();
  const recentClip = new Map<string, number>();
  const recentTrigger = new Map<string, number>();
  let lastVoice = '';
  let reactionEnd = 0;
  let lastReactionStart = -Infinity;
  let nextAmbient = 0;
  let ambientEnd = 0;
  let sceneBag: string[] = [];

  // ambient chatter goes through its own gain so it can duck under a reaction line. Both kinds of line
  // use the 'react' bus (never ducked by speech), so only the babble beds and the music make room for them
  let chatter: GainNodeLike | null = null;
  const chatterNode = (): GainNodeLike => {
    if (!chatter) {
      chatter = ctx.createGain();
      chatter.gain.value = 1;
      chatter.connect(buses.input('react'));
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

  /** Picks the next clip of a category from its shuffle bag, preferring a new speaker and a line not heard lately. */
  const pick = (category: string, now: number): ClipMeta | null => {
    const clips = byCategory.get(category);
    if (!clips || clips.length === 0) return null;
    let b = bag.get(category);
    if (!b || b.length === 0) {
      b = shuffle(clips.map((c) => c.id));
      bag.set(category, b);
    }
    const fresh = (id: string): boolean => now - (recentClip.get(id) ?? -Infinity) >= RECENT_LINE_S;
    let idx = b.findIndex((id) => fresh(id) && byId.get(id)?.voice !== lastVoice);
    if (idx < 0) idx = b.findIndex(fresh);
    if (idx < 0) idx = 0;
    const id = b.splice(idx, 1)[0]!;
    return byId.get(id) ?? null;
  };

  /** Starts one clip. `at` is an absolute audio time. */
  const play = (
    clip: ClipMeta,
    at: number,
    pan: number,
    gain: number,
    lowpass: number,
    ambient: boolean,
  ): number => {
    const rec = recordings.get(clip.id);
    const buf = rec ?? packs.get(clip.pack);
    if (!buf) return 0;
    const start = rec ? 0 : clip.start;
    const clipDur = rec ? rec.length / rec.sampleRate : clip.dur;
    const rate = 0.97 + rand() * 0.07;
    const dur = clipDur / rate;
    const voice = pool.begin({
      priority: ambient ? Priority.ambient : Priority.normal,
      duration: dur,
      dest: ambient ? chatterNode() : buses.input('react'),
      at,
      pan,
      gain,
    });
    if (!voice) return 0;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    lp.Q.value = 0.5;
    // a little presence around 2.5 kHz keeps consonants readable under music and effects
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2500;
    presence.Q.value = 0.8;
    presence.gain.value = 3.5;
    src.connect(presence);
    presence.connect(lp);
    lp.connect(voice.dest);
    src.onended = () => {
      try {
        src.disconnect();
        presence.disconnect();
        lp.disconnect();
      } catch {
        /* ignore */
      }
    };
    src.start(at, start, clipDur + 0.02);
    voice.track(src);
    buses.duck('speech', { at, hold: dur + 0.2 });
    o.onSpeak?.({
      clipId: clip.id,
      category: clip.category,
      voice: clip.voice,
      at,
      pan,
      gain,
      ambient,
      recorded: rec !== undefined,
    });
    return dur;
  };

  const decodePack = async (
    name: string,
    meta: PackMeta,
    base: string,
    report: VoiceReport,
  ): Promise<void> => {
    const fetcher = o.fetch;
    if (!fetcher) return;
    let reason = 'no files listed';
    for (const ext of ['ogg', 'mp3'] as const) {
      const file = meta.files[ext];
      if (!file) continue;
      if (!/^[A-Za-z0-9_-]+\.(ogg|mp3)$/.test(file)) {
        reason = `unsafe file name ${file}`;
        continue;
      }
      try {
        const res = await fetcher(base + file);
        if (!res.ok) {
          reason = `${file}: HTTP ${res.status ?? '?'}`;
          continue;
        }
        const buf = await o.decode(await res.arrayBuffer());
        if (disposed) return;
        if (!buf || buf.length < 1024) {
          reason = `${file}: decoded to an empty buffer`;
          continue;
        }
        packs.set(name, buf);
        report.loadedPacks.push(name);
        return;
      } catch (e) {
        reason = `${file}: ${String(e)}`;
      }
    }
    report.failed.push({ pack: name, reason });
  };

  const recordedExtra: RecordedEntry[] = [];
  /** Loads public/audio/voices/recorded.json (optional). Entries without a licence or with unsafe names are ignored. */
  const loadRecordings = async (base: string, report: VoiceReport): Promise<void> => {
    const fetcher = o.fetch;
    if (!fetcher) return;
    let list: RecordedEntry[];
    try {
      const res = await fetcher(`${base}recorded.json`);
      if (!res.ok) return;
      const m = (await res.json()) as RecordedManifest;
      list = Array.isArray(m?.clips) ? m.clips : [];
    } catch {
      return;
    }
    for (const e of list) {
      if (disposed) return;
      if (typeof e?.id !== 'string' || typeof e.license !== 'string' || e.license.trim() === '') continue;
      if (typeof e.file !== 'string' || !/^[A-Za-z0-9_-]+\.(ogg|mp3|wav)$/.test(e.file)) continue;
      try {
        const res = await fetcher(`${base}recorded/${e.file}`);
        if (!res.ok) continue;
        const buf = await o.decode(await res.arrayBuffer());
        if (!buf || buf.length < 512) continue;
        recordings.set(e.id, buf);
        (report.recorded ??= []).push(e.id);
        if (typeof e.category === 'string' && typeof e.text === 'string') recordedExtra.push(e);
      } catch (err) {
        fail(err);
      }
    }
  };

  const duckChatter = (until: number): void => {
    if (!chatter) return;
    const now = ctx.currentTime;
    chatter.gain.cancelScheduledValues(now);
    chatter.gain.setTargetAtTime(0.3, now, 0.05);
    chatter.gain.setTargetAtTime(1, until, 0.25);
  };

  return {
    get ready() {
      return packs.size > 0 || recordings.size > 0;
    },
    setEnabled(on) {
      enabled = on;
    },
    load() {
      if (loading) return loading;
      const report: VoiceReport = { loadedPacks: [], failed: [], clips: 0, scenes: 0 };
      loading = (async () => {
        const fetcher = o.fetch;
        if (!fetcher) return report;
        const base = `${o.baseUrl ?? audioBaseUrl()}voices/`;
        let manifest: VoiceManifest;
        try {
          const res = await fetcher(`${base}voices.json`);
          if (!res.ok) return report;
          manifest = (await res.json()) as VoiceManifest;
        } catch {
          return report; // offline / not JSON: silent, like the sample slots
        }
        if (!manifest || !Array.isArray(manifest.clips)) return report;
        for (const [name, meta] of Object.entries(manifest.packs ?? {})) {
          if (disposed) break;
          try {
            await decodePack(name, meta, base, report);
          } catch (e) {
            fail(e);
            report.failed.push({ pack: name, reason: String(e) });
          }
        }
        await loadRecordings(base, report);
        // a clip is usable when its pack decoded or it has its own recording
        for (const c of manifest.clips) {
          if (!packs.has(c.pack) && !recordings.has(c.id)) continue;
          byId.set(c.id, c);
          const list = byCategory.get(c.category) ?? [];
          list.push(c);
          byCategory.set(c.category, list);
        }
        // recordings that ADD lines (ids not in voices.json) join their category
        for (const e of recordedExtra) {
          if (byId.has(e.id)) continue;
          const clip: ClipMeta = {
            id: e.id,
            pack: 'recorded',
            category: e.category!,
            text: e.text!,
            voice: e.speaker ?? 'recorded',
            start: 0,
            dur: 0,
          };
          byId.set(clip.id, clip);
          const list = byCategory.get(clip.category) ?? [];
          list.push(clip);
          byCategory.set(clip.category, list);
        }
        scenes = (manifest.scenes ?? []).filter(
          (s) => s.clips.length > 0 && s.clips.every((id) => byId.has(id)),
        );
        report.clips = byId.size;
        report.scenes = scenes.length;
        return report;
      })();
      return loading;
    },
    say(category, opts = {}) {
      if (!enabled || disposed || (packs.size === 0 && recordings.size === 0)) return false;
      const now = ctx.currentTime;
      const start = now + (opts.delay ?? 0);
      const force = opts.force === true;
      if (opts.key !== undefined) {
        const k = `${category}:${String(opts.key)}`;
        const prev = recentTrigger.get(k);
        if (prev !== undefined && now - prev < DEDUPE_S) return false;
        recentTrigger.set(k, now);
        if (recentTrigger.size > 64)
          for (const [kk, t] of recentTrigger) if (now - t > 5) recentTrigger.delete(kk);
      }
      // never talk over another reaction line
      if (start < reactionEnd) return false;
      if (!force) {
        if (start - lastReactionStart < GLOBAL_SPACING) return false;
        const prev = lastCategory.get(category);
        if (prev !== undefined && start - prev < CATEGORY_COOLDOWN[category]) return false;
        const chance = opts.chance ?? 1;
        if (chance < 1 && rand() > chance) return false;
      } else if (start - lastReactionStart < FORCE_SPACING) return false;
      const clip = pick(category, now);
      if (!clip) return false;
      const pan = Math.max(-1, Math.min(1, opts.pan ?? (rand() * 2 - 1) * 0.7));
      const gain = 1.5 + 0.6 * clamp01(opts.strength ?? 0.8);
      const dur = play(clip, start, pan, gain, 7000, false);
      if (dur === 0) return false;
      lastCategory.set(category, start);
      recentClip.set(clip.id, start);
      lastVoice = clip.voice;
      lastReactionStart = start;
      reactionEnd = start + dur + 0.15;
      nextAmbient = Math.max(nextAmbient, reactionEnd + AMBIENT_HOLD_S);
      duckChatter(reactionEnd + 0.2);
      return true;
    },
    update(now, intensity) {
      if (!enabled || disposed || byId.size === 0 || scenes.length === 0) return;
      if (now < nextAmbient || now < ambientEnd || now < reactionEnd) return;
      // schedule the next scene after this one: busier matches chatter a little more
      const gap =
        (AMBIENT_MIN_GAP + rand() * (AMBIENT_MAX_GAP - AMBIENT_MIN_GAP)) / (1 + 0.4 * clamp01(intensity));
      if (sceneBag.length === 0) sceneBag = shuffle(scenes.map((s) => s.id));
      const sid = sceneBag.shift()!;
      const scene = scenes.find((s) => s.id === sid);
      if (!scene) return;
      const far = scene.kind === 'call';
      const pan = (rand() * 2 - 1) * (far ? 0.85 : 0.6);
      let t = now + 0.05;
      for (let i = 0; i < scene.clips.length; i++) {
        const clip = byId.get(scene.clips[i]!)!;
        // speakers of one conversation stand a little apart
        const p = Math.max(-1, Math.min(1, pan + (i % 2 === 0 ? -0.15 : 0.15)));
        const gain = far ? 0.8 + rand() * 0.2 : 1.1 + rand() * 0.3;
        const d = play(clip, t, p, gain, far ? 2600 : 3800, true);
        if (d === 0) break;
        t += d + 0.3 + rand() * 0.55;
        if (t - now > AMBIENT_MAX_SCENE_S) break;
      }
      ambientEnd = t;
      nextAmbient = t + gap;
    },
    reset(now = 0) {
      lastCategory.clear();
      recentClip.clear();
      recentTrigger.clear();
      bag.clear();
      sceneBag = [];
      lastVoice = '';
      reactionEnd = 0;
      lastReactionStart = -Infinity;
      nextAmbient = now + 3 + rand() * 3;
      ambientEnd = 0;
    },
    stop() {
      this.reset();
    },
    dispose() {
      disposed = true;
      try {
        chatter?.disconnect();
      } catch {
        /* ignore */
      }
      packs.clear();
    },
  };
}
