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

/** A music manifest in the shape tools/audiogen/build_music.py writes (sizes are tiny for tests). */
export function musicManifest(
  samples = { match_loop: 32000, menu_loop: 16000, match_tension: 8000 },
): unknown {
  const t = (n: number, loop: boolean) => ({
    loop,
    bpm: 108,
    samples: n,
    seconds: n / 44100,
    files: { ogg: { file: 'x.ogg', bytes: 1 }, mp3: { file: 'x.mp3', bytes: 1 } },
  });
  const named = (name: string, n: number, loop: boolean) => {
    const m = t(n, loop);
    m.files = { ogg: { file: `${name}.ogg`, bytes: 1 }, mp3: { file: `${name}.mp3`, bytes: 1 } };
    return [name, m] as const;
  };
  return {
    sampleRate: 44100,
    tracks: Object.fromEntries([
      named('menu_loop', samples.menu_loop, true),
      named('match_loop', samples.match_loop, true),
      named('match_tension', samples.match_tension, true),
      named('sting_win', 20000, false),
      named('sting_lose', 20000, false),
      named('sting_draw', 20000, false),
    ]),
  };
}

export function musicFiles(prefix = `${BASE}music/`): Record<string, unknown> {
  const files: Record<string, unknown> = { [`${prefix}manifest.json`]: musicManifest() };
  for (const n of ['menu_loop', 'match_loop', 'match_tension', 'sting_win', 'sting_lose', 'sting_draw']) {
    files[`${prefix}${n}.ogg`] = 'x'.repeat(40000);
    files[`${prefix}${n}.mp3`] = 'x'.repeat(40000);
  }
  return files;
}
