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
