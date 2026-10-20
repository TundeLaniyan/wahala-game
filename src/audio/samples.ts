/**
 * Recorded asset slots.
 *
 * NO RECORDINGS ARE SHIPPED. Every sound the game currently makes is synthesised (src/audio/recipes).
 * This module lets properly licensed recordings be dropped in later without code changes:
 *
 *   public/audio/slots.json        lists the slots that have a recording and their licence
 *   public/audio/<slot>.ogg|.mp3   the audio file (slot names = sound ids, see SAMPLE_SLOTS)
 *
 * At unlock the engine fetches `slots.json` (one request). For each listed slot that names a valid
 * SoundId, has a non-empty `license` string, and decodes successfully, the recording replaces the
 * synthesised sound. Anything missing or failing silently keeps the synthesised version. Nothing is
 * requested for slots that are not listed, so a missing file never causes 404 noise.
 *
 * Fetching and decoding are injected (`FetchLike`, `decode`) so tests can fake both.
 */
import { SOUND_IDS, defOf } from './recipes';
import type { SoundId } from './recipes';
import type { AudioBufferLike, AudioContextLike } from './webaudio';

export interface SlotEntry {
  /** File name inside public/audio (no folders). Defaults to `<slot>.ogg`, then `<slot>.mp3`. */
  file?: string;
  /** REQUIRED. Licence name or terms, e.g. "CC0 1.0" or "Purchased, single-project licence". */
  license: string;
  /** Where the recording came from (URL, vendor, recordist). */
  source?: string;
  /** Loudness trim relative to the synthesised version (default 1). */
  gain?: number;
}

export interface SlotManifest {
  slots: Partial<Record<SoundId, SlotEntry>>;
}

export interface SlotInfo {
  id: SoundId;
  loop: boolean;
  bus: string;
  /** Candidate file names, in the order they are tried when a manifest entry has no `file`. */
  defaultFiles: readonly string[];
}

/** Every recordable slot (one per sound id), for documentation and tooling. */
export const SAMPLE_SLOTS: readonly SlotInfo[] = SOUND_IDS.map((id) => ({
  id,
  loop: defOf(id).kind === 'loop',
  bus: defOf(id).bus,
  defaultFiles: [`${id}.ogg`, `${id}.mp3`],
}));

export const MANIFEST_FILE = 'slots.json';
const SAFE_FILE = /^[A-Za-z0-9_-]+\.(ogg|mp3|wav|m4a)$/;
const MAX_CONCURRENT = 3;

export interface FetchedResponse {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}
/** Minimal fetch: a real `fetch` satisfies it; tests pass a fake. */
export type FetchLike = (url: string) => Promise<FetchedResponse>;

/** `<BASE_URL>audio/` (Vite's base is `/wahala-game/` in production builds). */
export function audioBaseUrl(): string {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}audio/`;
}

/** The global `fetch` if there is one (not in old browsers or some test environments). */
export function defaultFetch(): FetchLike | null {
  const f = (globalThis as { fetch?: unknown }).fetch;
  return typeof f === 'function' ? (f as FetchLike).bind(globalThis) : null;
}

export interface SlotReport {
  loaded: SoundId[];
  /** Slots that were listed but not used, with the reason. */
  skipped: { slot: string; reason: string }[];
}

export interface LoadOptions {
  fetch: FetchLike | null;
  decode: (data: ArrayBuffer) => Promise<AudioBufferLike>;
  baseUrl?: string;
  /** Called for each successfully decoded recording. */
  onSlot: (id: SoundId, buffer: AudioBufferLike, meta: { gain: number }) => void;
  isCancelled?: () => boolean;
}

const isId = (s: string): s is SoundId => (SOUND_IDS as readonly string[]).includes(s);

/** Parses and validates a manifest; returns usable entries and reasons for the rest. */
export function parseManifest(data: unknown): {
  entries: [SoundId, SlotEntry][];
  skipped: SlotReport['skipped'];
} {
  const entries: [SoundId, SlotEntry][] = [];
  const skipped: SlotReport['skipped'] = [];
  const slots = (data as { slots?: unknown } | null)?.slots;
  if (typeof slots !== 'object' || slots === null || Array.isArray(slots)) return { entries, skipped };
  for (const [slot, raw] of Object.entries(slots)) {
    const e = raw as Partial<SlotEntry> | null;
    if (!isId(slot)) skipped.push({ slot, reason: 'unknown slot name' });
    else if (typeof e !== 'object' || e === null) skipped.push({ slot, reason: 'entry is not an object' });
    else if (typeof e.license !== 'string' || e.license.trim() === '') {
      skipped.push({ slot, reason: 'missing license (unlicensed recordings are ignored)' });
    } else if (e.file !== undefined && (typeof e.file !== 'string' || !SAFE_FILE.test(e.file))) {
      skipped.push({ slot, reason: 'unsafe or unsupported file name' });
    } else {
      const gain =
        typeof e.gain === 'number' && Number.isFinite(e.gain) ? Math.min(4, Math.max(0, e.gain)) : 1;
      entries.push([slot, { ...e, license: e.license, gain } as SlotEntry]);
    }
  }
  return { entries, skipped };
}

/** Loads whatever recordings the manifest lists. Never throws; every failure keeps the synth sound. */
export async function loadRecordedSlots(o: LoadOptions): Promise<SlotReport> {
  const report: SlotReport = { loaded: [], skipped: [] };
  const doFetch = o.fetch;
  if (!doFetch) return report;
  const base = o.baseUrl ?? audioBaseUrl();
  let manifest: unknown;
  try {
    const res = await doFetch(base + MANIFEST_FILE);
    if (!res.ok) return report; // no manifest: nothing recorded, nothing to do
    manifest = await res.json();
  } catch {
    return report; // offline, 404 page that is not JSON, ...
  }
  const parsed = parseManifest(manifest);
  report.skipped.push(...parsed.skipped);

  const work = async ([id, entry]: [SoundId, SlotEntry]): Promise<void> => {
    const files = entry.file ? [entry.file] : [`${id}.ogg`, `${id}.mp3`];
    for (const file of files) {
      if (o.isCancelled?.()) return;
      try {
        const res = await doFetch(base + file);
        if (!res.ok) continue;
        const buf = await o.decode(await res.arrayBuffer());
        if (o.isCancelled?.()) return;
        if (!buf || buf.length < 16) {
          report.skipped.push({ slot: id, reason: `${file} decoded to an empty buffer` });
          return;
        }
        o.onSlot(id, buf, { gain: entry.gain ?? 1 });
        report.loaded.push(id);
        return;
      } catch (e) {
        report.skipped.push({ slot: id, reason: `${file} failed to load/decode: ${String(e)}` });
        return;
      }
    }
    report.skipped.push({ slot: id, reason: 'file not found' });
  };

  const queue = [...parsed.entries];
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await work(item);
  });
  await Promise.all(workers);
  return report;
}

/** Decoder bound to a context; rejects when the context cannot decode. */
export const decoderFor =
  (ctx: AudioContextLike) =>
  (data: ArrayBuffer): Promise<AudioBufferLike> =>
    ctx.decodeAudioData
      ? ctx.decodeAudioData(data)
      : Promise.reject(new Error('decodeAudioData unavailable'));
