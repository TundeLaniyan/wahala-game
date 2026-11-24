/** Data Saver music (docs/MOBILE_PERFORMANCE.md): the player streams a track's `lite` file only when asked, and recovers. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuses } from '../../src/audio/buses';
import { createMusicPlayer } from '../../src/audio/music';
import { parseMusicManifest } from '../../src/audio/playlist';
import { createRand } from '../../src/audio/rng';
import { FakeContext } from './fakeContext';
import { mediaFactory } from './fakeMedia';
import { BASE, musicFiles, musicManifest, server } from './fakeServer';

const VOL = { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };
const IDS = ['t1', 't2'];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A manifest where `t1` has a Data Saver file and `t2` has none. */
function manifest(): unknown {
  const m = musicManifest(IDS) as { tracks: { id: string; lite?: string }[] };
  m.tracks[0]!.lite = 'lite/t1.mp3';
  return m;
}

async function rig(opts: { lite: boolean | (() => boolean); brokenLite?: boolean; only?: string }) {
  const ctx = new FakeContext();
  const buses = createBuses(ctx, VOL, false);
  const m = manifest() as { playlists: { default: string[] } };
  if (opts.only) m.playlists.default = [opts.only];
  const files = musicFiles(IDS, `${BASE}music/`, m);
  files[`${BASE}music/lite/t1.mp3`] = 'x'.repeat(10);
  const s = server(files);
  const media = mediaFactory({ broken: (src) => !!opts.brokenLite && src.includes('/lite/') });
  const player = createMusicPlayer(ctx, buses, {
    fetch: s.fetch,
    probe: (url) => s.fetch(url).then((r) => r.ok),
    createElement: media.create,
    rand: createRand(5),
    baseUrl: BASE,
    lite: typeof opts.lite === 'function' ? opts.lite : () => opts.lite as boolean,
  });
  await player.load();
  return { player, media, hits: s.hits };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('Data Saver music files', () => {
  it('streams the full file by default and the lite file when Data Saver is on', async () => {
    const off = await rig({ lite: false, only: 't1' });
    off.player.startMatch('danfoBusPark');
    expect(off.media.els.map((e) => e.src)).toEqual([`${BASE}music/t1.mp3`]);

    const on = await rig({ lite: true, only: 't1' });
    on.player.startMatch('danfoBusPark');
    expect(on.media.els.map((e) => e.src)).toEqual([`${BASE}music/lite/t1.mp3`]);
  });

  it('reads the setting each time a track opens (turning Data Saver on mid-session applies to the next match)', async () => {
    let saver = false;
    const r = await rig({ lite: () => saver, only: 't1' });
    r.player.startMatch('danfoBusPark');
    saver = true;
    r.player.startMatch('danfoBusPark');
    expect(r.media.els.map((e) => e.src).at(-1)).toBe(`${BASE}music/lite/t1.mp3`);
    expect(r.media.els[0]!.src).toBe(`${BASE}music/t1.mp3`);
  });

  it('a track without a lite file plays its full file even with Data Saver on', async () => {
    const r = await rig({ lite: true, only: 't2' });
    r.player.startMatch('danfoBusPark');
    expect(r.media.els.map((e) => e.src)).toEqual([`${BASE}music/t2.mp3`]);
  });

  it('a lite file that cannot play falls back to the full file of the SAME track and keeps the track available', async () => {
    const r = await rig({ lite: true, brokenLite: true, only: 't1' });
    r.player.startMatch('danfoBusPark');
    await flush();
    const srcs = r.media.els.map((e) => e.src);
    expect(srcs[0]).toBe(`${BASE}music/lite/t1.mp3`);
    expect(srcs.at(-1)).toBe(`${BASE}music/t1.mp3`);
    expect(r.player.status().available).toContain('t1');
  });
});

describe('manifest `lite` field', () => {
  const base = musicManifest(['a']) as { tracks: Record<string, unknown>[] };
  it('keeps a well-formed lite path', () => {
    base.tracks[0]!.lite = 'lite/a.mp3';
    expect(parseMusicManifest(base).manifest.tracks[0]!.lite).toBe('lite/a.mp3');
  });
  it.each(['../a.mp3', 'lite/../a.mp3', 'http://x/a.mp3', 'a.mp3', 'lite/a.txt', 7])(
    'drops an unsafe lite path (%s)',
    (bad) => {
      base.tracks[0]!.lite = bad;
      expect(parseMusicManifest(base).manifest.tracks[0]!.lite).toBeUndefined();
    },
  );
});
