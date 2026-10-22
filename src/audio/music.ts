/**
 * Afrobeats music player: crossfades between the menu loop and the in-match loop, layers a
 * percussion-only tension stem over the match loop in the final seconds, and plays result stings.
 *
 * The music is PRE-RENDERED audio (public/audio/music/*.ogg with .mp3 fallback, listed in
 * public/audio/music/manifest.json), not a runtime oscillator sequence. No tracks ship today (the
 * generated ones were rejected), so the manifest is empty. If files cannot be fetched or decoded the
 * player simply stays silent: the rest of the audio (ambience, effects) is unaffected.
 *
 * Loops are gapless: sources loop [0, loopEnd) where `loopEnd` comes from the manifest's exact sample
 * count, so even an MP3 fallback with encoder padding loops on the musical boundary. Stems that
 * share a bar grid (match_loop 32 bars, match_tension 8 bars) are started phase-locked.
 */
import type { Buses } from './buses';
import type { FetchLike } from './samples';
import { audioBaseUrl } from './samples';
import { clamp01 } from './rng';
import type { AudioBufferLike, AudioContextLike, BufferSourceNodeLike, GainNodeLike } from './webaudio';

export type MusicScene = 'off' | 'menu' | 'match';
export type StingKind = 'win' | 'lose' | 'draw';

export interface TrackMeta {
  loop: boolean;
  bpm: number;
  /** Exact length of the rendered audio in sample frames (the loop length for loops). */
  samples: number;
  seconds: number;
  files: Partial<Record<'ogg' | 'mp3', { file: string; bytes: number }>>;
}
export interface MusicManifest {
  sampleRate: number;
  tracks: Record<string, TrackMeta>;
}

export interface MusicReport {
  loaded: string[];
  failed: { track: string; reason: string }[];
}

export interface MusicPlayer {
  /** Which scene is wanted (the audible scene follows once its audio has loaded). */
  setScene(scene: MusicScene): void;
  readonly scene: MusicScene;
  /** 0..1: how much of the percussion-only tension stem sits over the match loop. */
  setTension(level: number): void;
  /** Plays a result sting and dips the loop underneath. Returns false when the sting is unavailable. */
  sting(kind: StingKind): boolean;
  /** Starts loading (idempotent). Resolves once every track has been tried; never rejects. */
  load(): Promise<MusicReport>;
  /** Names of loops currently sounding (introspection for tests). */
  playing(): string[];
  dispose(): void;
}

export interface MusicOptions {
  fetch: FetchLike | null;
  decode: (data: ArrayBuffer) => Promise<AudioBufferLike>;
  baseUrl?: string;
  onError?: (e: unknown) => void;
}

/** Load order: what the title screen needs first. */
const TRACKS = ['menu_loop', 'match_loop', 'match_tension', 'sting_win', 'sting_lose', 'sting_draw'] as const;
type TrackName = (typeof TRACKS)[number];

const FADE_IN = 1.0;
const FADE_MENU_TO_MATCH = 1.2;
const FADE_MATCH_TO_MENU = 1.6;
const TENSION_GAIN = 0.9;
const STING_DIP = 0.18;
const STING_GAIN = 1;

interface Layer {
  name: TrackName;
  src: BufferSourceNodeLike;
  gain: GainNodeLike;
  /** Audio-clock time at which the loop's position 0 occurred (for phase-locking stems). */
  t0: number;
}

export function createMusicPlayer(ctx: AudioContextLike, buses: Buses, o: MusicOptions): MusicPlayer {
  const buffers = new Map<TrackName, AudioBufferLike>();
  const meta = new Map<TrackName, TrackMeta>();
  let wanted: MusicScene = 'menu';
  let tension = 0;
  let loading: Promise<MusicReport> | null = null;
  let disposed = false;
  let layers: Layer[] = [];
  let dipUntil = 0;

  const fail = (e: unknown): void => {
    try {
      o.onError?.(e);
    } catch {
      /* the error handler must not break the audio path */
    }
  };

  const target = (name: TrackName): number => (name === 'match_tension' ? TENSION_GAIN * tension : 1);
  const dip = (): number => (ctx.currentTime < dipUntil ? STING_DIP : 1);

  const loopEnd = (name: TrackName, buf: AudioBufferLike): number => {
    const m = meta.get(name);
    const frames = m ? Math.min(buf.length, m.samples) : buf.length;
    return frames / buf.sampleRate;
  };

  const startLayer = (name: TrackName, fade: number, offset = 0): Layer | null => {
    const buf = buffers.get(name);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = loopEnd(name, buf);
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(buses.input('music'));
    src.start(now, offset % Math.max(0.001, src.loopEnd));
    gain.gain.setTargetAtTime(target(name) * dip(), now, fade / 3);
    const layer: Layer = { name, src, gain, t0: now - offset };
    layers.push(layer);
    return layer;
  };

  const stopLayer = (l: Layer, fade: number): void => {
    const now = ctx.currentTime;
    l.gain.gain.cancelScheduledValues(now);
    l.gain.gain.setTargetAtTime(0, now, fade / 4);
    try {
      l.src.stop(now + fade + 0.3);
    } catch {
      /* already stopped */
    }
    l.src.onended = () => {
      try {
        l.src.disconnect();
        l.gain.disconnect();
      } catch {
        /* ignore */
      }
    };
    layers = layers.filter((x) => x !== l);
  };

  const has = (n: TrackName): boolean => layers.some((l) => l.name === n);
  const find = (n: TrackName): Layer | undefined => layers.find((l) => l.name === n);

  /** Brings the sounding layers in line with the wanted scene (idempotent). */
  const apply = (): void => {
    if (disposed) return;
    const want: TrackName[] =
      wanted === 'menu' ? ['menu_loop'] : wanted === 'match' ? ['match_loop', 'match_tension'] : [];
    const leaving = wanted === 'menu' ? FADE_MATCH_TO_MENU : wanted === 'match' ? FADE_MENU_TO_MATCH : 0.8;
    for (const l of [...layers]) if (!want.includes(l.name)) stopLayer(l, leaving);
    for (const n of want) {
      if (has(n)) continue;
      if (n === 'match_tension') {
        // phase-lock to the main loop: both are bar-aligned, and 8 bars divide 32
        const main = find('match_loop');
        const stem = buffers.get(n);
        if (!main || !stem) continue;
        const elapsed = ctx.currentTime - main.t0;
        startLayer(n, 0.5, elapsed % (stem.length / stem.sampleRate));
      } else startLayer(n, FADE_IN);
    }
  };

  const applyGains = (): void => {
    const now = ctx.currentTime;
    for (const l of layers) {
      l.gain.gain.cancelScheduledValues(now);
      l.gain.gain.setTargetAtTime(target(l.name) * dip(), now, l.name === 'match_tension' ? 0.8 : 0.3);
    }
  };

  const decodeTrack = async (
    name: TrackName,
    m: TrackMeta,
    base: string,
    report: MusicReport,
  ): Promise<void> => {
    const fetcher = o.fetch;
    if (!fetcher) return;
    const order = (['ogg', 'mp3'] as const).filter((e) => m.files[e]);
    let lastReason = 'no files listed';
    for (const ext of order) {
      const file = m.files[ext]!.file;
      if (!/^[A-Za-z0-9_-]+\.(ogg|mp3)$/.test(file)) {
        lastReason = `unsafe file name ${file}`;
        continue;
      }
      try {
        const res = await fetcher(base + file);
        if (!res.ok) {
          lastReason = `${file}: HTTP ${res.status ?? '?'}`;
          continue;
        }
        const buf = await o.decode(await res.arrayBuffer());
        if (disposed) return;
        if (!buf || buf.length < 1024) {
          lastReason = `${file}: decoded to an empty buffer`;
          continue;
        }
        buffers.set(name, buf);
        meta.set(name, m);
        report.loaded.push(name);
        return;
      } catch (e) {
        lastReason = `${file}: ${String(e)}`;
      }
    }
    report.failed.push({ track: name, reason: lastReason });
  };

  return {
    get scene() {
      return wanted;
    },
    setScene(scene) {
      if (scene === wanted) return;
      wanted = scene;
      apply();
    },
    setTension(level) {
      const next = clamp01(level);
      if (Math.abs(next - tension) < 0.01) return;
      tension = next;
      // the stem runs (silent) for the whole match so it is always phase-locked; only its gain moves
      if (wanted === 'match') applyGains();
    },
    sting(kind) {
      const name = `sting_${kind}` as TrackName;
      const buf = buffers.get(name);
      if (!buf || disposed) return false;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = STING_GAIN;
      src.connect(g);
      g.connect(buses.input('music'));
      src.start(now + 0.05);
      src.onended = () => {
        try {
          src.disconnect();
          g.disconnect();
        } catch {
          /* ignore */
        }
      };
      // dip whatever is looping underneath for the length of the sting, then restore
      const dur = buf.length / buf.sampleRate;
      dipUntil = now + dur * 0.8;
      applyGains();
      for (const l of layers) l.gain.gain.setTargetAtTime(target(l.name), dipUntil, 0.6);
      return true;
    },
    load() {
      if (loading) return loading;
      const report: MusicReport = { loaded: [], failed: [] };
      loading = (async () => {
        const fetcher = o.fetch;
        if (!fetcher) return report;
        const base = `${o.baseUrl ?? audioBaseUrl()}music/`;
        let manifest: MusicManifest;
        try {
          const res = await fetcher(`${base}manifest.json`);
          if (!res.ok) return report; // no music shipped: stay silent without noise
          manifest = (await res.json()) as MusicManifest;
        } catch {
          return report; // offline / not JSON: silent, like the sample slots
        }
        for (const name of TRACKS) {
          if (disposed) break;
          const m = manifest.tracks?.[name];
          if (!m) {
            report.failed.push({ track: name, reason: 'not in manifest' });
            continue;
          }
          try {
            await decodeTrack(name, m, base, report);
          } catch (e) {
            fail(e);
            report.failed.push({ track: name, reason: String(e) });
          }
          if (name === 'menu_loop' || name === 'match_loop') apply(); // start as soon as it is wanted
        }
        apply();
        return report;
      })();
      return loading;
    },
    playing: () => layers.map((l) => l.name),
    dispose() {
      disposed = true;
      for (const l of [...layers]) stopLayer(l, 0.2);
      buffers.clear();
    },
  };
}

/** Track names in load order (tests and tooling). */
export const MUSIC_TRACKS: readonly string[] = TRACKS;
