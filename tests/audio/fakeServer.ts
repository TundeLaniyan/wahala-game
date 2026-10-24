import type { FetchLike } from '../../src/audio/samples';

/** A fake static file server: url -> body (object => JSON, string => bytes of that length). */
export function server(files: Record<string, unknown>): { fetch: FetchLike; hits: string[] } {
  const hits: string[] = [];
  const fetch: FetchLike = (url) => {
    hits.push(url);
    const body = files[url];
    if (body === undefined)
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.reject(new Error('no json')),
        arrayBuffer: () => Promise.reject(new Error('404')),
      });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        typeof body === 'string' ? Promise.reject(new SyntaxError('not json')) : Promise.resolve(body),
      // `string` bodies decode to a buffer as long as the string (the fake context sizes buffers by it)
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(typeof body === 'string' ? body.length : 0)),
    });
  };
  return { fetch, hits };
}

export const BASE = '/wahala-game/audio/';

/** Ten playlist ids in the shape of the shipped manifest (tests use their own tiny files). */
export const TRACK_IDS = Array.from({ length: 10 }, (_, i) => `t${i}`);

/** A version-2 music manifest (playlist.ts) listing `ids`, with optional arena playlists. */
export function musicManifest(
  ids: readonly string[] = TRACK_IDS,
  extra: {
    arenas?: Record<string, { tracks?: string[]; signature?: string | null; start?: string | null }>;
    menu?: string[];
  } = {},
): unknown {
  return {
    version: 2,
    tracks: ids.map((id) => ({
      id,
      title: `Track ${id}`,
      artist: null,
      source: `https://example.org/${id}`,
      licence: 'Test licence',
      file: `${id}.mp3`,
    })),
    playlists: { default: [...ids], arenas: extra.arenas ?? {} },
    menu: extra.menu ?? [],
  };
}

/** Manifest + the files of `present` (default: all listed) under `<prefix>`. */
export function musicFiles(
  present: readonly string[] = TRACK_IDS,
  prefix = `${BASE}music/`,
  manifest: unknown = musicManifest(),
): Record<string, unknown> {
  const files: Record<string, unknown> = { [`${prefix}manifest.json`]: manifest };
  for (const id of present) files[`${prefix}${id}.mp3`] = 'x'.repeat(4000);
  return files;
}

/** A voice catalogue line in the shape of public/audio/voices/voices.json (version 2). */
export interface TestLine {
  id: string;
  trigger: string;
  bus?: 'reaction' | 'crowd' | 'ambient';
  zone?: string;
  priority?: number;
  cooldown?: number;
  speaker?: string;
  status?: 'planned' | 'rejected';
}

/** Lines of the test catalogue: several gameplay triggers, two zoned conversations and edge cases. */
export const TEST_LINES: TestLine[] = [
  { id: 'run_1', trigger: 'ON_GENERATOR_CRITICAL_PROXIMITY', priority: 1, cooldown: 4, speaker: 'a' },
  { id: 'run_2', trigger: 'ON_GENERATOR_CRITICAL_PROXIMITY', priority: 1, cooldown: 4, speaker: 'b' },
  { id: 'run_3', trigger: 'ON_GENERATOR_CRITICAL_PROXIMITY', priority: 1, cooldown: 4, speaker: 'c' },
  { id: 'esc_1', trigger: 'ON_PLAYER_NARROW_ESCAPE', priority: 2, cooldown: 5, speaker: 'a' },
  { id: 'esc_2', trigger: 'ON_PLAYER_NARROW_ESCAPE', priority: 2, cooldown: 5, speaker: 'b' },
  { id: 'esc_3', trigger: 'ON_PLAYER_NARROW_ESCAPE', priority: 2, cooldown: 5, speaker: 'c' },
  { id: 'elim_1', trigger: 'ON_PLAYER_ELIMINATED', priority: 1, cooldown: 3.5, speaker: 'b' },
  { id: 'elim_2', trigger: 'ON_PLAYER_ELIMINATED', priority: 1, cooldown: 3.5, speaker: 'c' },
  { id: 'keke_1', trigger: 'ON_KEKE_HAZARD_SPAWN', priority: 2, cooldown: 4.5, speaker: 'a' },
  { id: 'danfo_1', trigger: 'ON_DANFO_HAZARD_IMPACT', priority: 1, cooldown: 5, speaker: 'a' },
  { id: 'win_1', trigger: 'ON_MATCH_VICTORY', priority: 1, cooldown: 10, speaker: 'a' },
  { id: 'final_1', trigger: 'ON_FINAL_COUNTDOWN_START', priority: 1, cooldown: 15, speaker: 'b' },
  { id: 'blast_1', trigger: 'ON_GENERATOR_DETONATE', priority: 1, cooldown: 3, speaker: 'c' },
  {
    id: 'market_1',
    trigger: 'AMBIENT_SCHEDULER_MARKET',
    bus: 'ambient',
    zone: 'market',
    priority: 4,
    cooldown: 18,
    speaker: 'd',
  },
  {
    id: 'park_1',
    trigger: 'AMBIENT_SCHEDULER_PARK',
    bus: 'ambient',
    zone: 'bus_park',
    priority: 4,
    cooldown: 18,
    speaker: 'e',
  },
  // edge cases: a rejected line with a file, a trigger the game does not know, a planned line with no clip
  {
    id: 'rejected_1',
    trigger: 'AMBIENT_SCHEDULER_PARK',
    bus: 'ambient',
    zone: 'bus_park',
    status: 'rejected',
  },
  { id: 'future_1', trigger: 'ON_SOMETHING_NEW', priority: 2 },
  { id: 'okada_1', trigger: 'ON_OKADA_SHIELD_SAVE', priority: 2 },
];

export function voiceCatalogue(lines: TestLine[] = TEST_LINES): unknown {
  return {
    version: 2,
    zones: { market: ['balogunMarket'], bus_park: ['danfoBusPark'] },
    lines: lines.map((l) => ({
      bus: 'reaction',
      zone: 'all',
      priority: 3,
      cooldown: 5,
      speaker: 'x',
      status: 'planned',
      text: `text of ${l.id}`,
      ...l,
    })),
  };
}

/**
 * The two voice manifests plus clip files (default 1.5 s each with the tests' decode of 10 samples per byte at
 * 24 kHz) for every line except `okada_1`; plus two recorded entries the game must ignore.
 */
export function voiceFiles(
  lines: TestLine[] = TEST_LINES,
  opts: { without?: string[]; bytes?: number } = {},
): Record<string, unknown> {
  const withClip = lines.filter((l) => l.id !== 'okada_1');
  const files: Record<string, unknown> = {
    [`${BASE}voices/voices.json`]: voiceCatalogue(lines),
    [`${BASE}voices/recorded.json`]: {
      version: 2,
      clips: [
        ...withClip.map((l) => ({
          id: l.id,
          file: `${l.id}.mp3`,
          license: 'Test licence',
          speaker: l.speaker,
        })),
        { id: 'esc_9', file: 'esc_9.mp3', license: '' },
        { id: 'esc_8', file: '../esc_8.mp3', license: 'Test licence' },
      ],
    },
  };
  for (const l of withClip)
    if (!opts.without?.includes(l.id))
      files[`${BASE}voices/recorded/${l.id}.mp3`] = 'x'.repeat(opts.bytes ?? 3600);
  files[`${BASE}voices/recorded/esc_9.mp3`] = 'x'.repeat(3600);
  return files;
}
