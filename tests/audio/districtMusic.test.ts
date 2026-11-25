/**
 * District songs on the City Rumble arenas (candidate overlay): the arena map, start-offset variants, the Pixabay
 * fallbacks, and a Sudden Death loop that takes over on the beat at any tempo (decision AU3).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARENAS, RUMBLE_ARENA_IDS } from '../../src/sim/arenas';
import { createBuses } from '../../src/audio/buses';
import { mergeCandidateMusic, parseCandidateExtras } from '../../src/audio/candidates';
import { createMusicPlayer } from '../../src/audio/music';
import { parseMusicManifest } from '../../src/audio/playlist';
import { createRand } from '../../src/audio/rng';
import { FakeContext } from './fakeContext';
import { mediaFactory } from './fakeMedia';
import type { FakeMediaElement } from './fakeMedia';
import { BASE, musicFiles, musicManifest, server } from './fakeServer';

const VOL = { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };
const CAND = `${BASE}candidates/`;

const ids = ['d_oshodi_a', 'd_oshodi_b', 'd_oshodi_sd', 'd_lekki_a', 'd_lekki_sd'];
const raw = (): Record<string, unknown> => ({
  ...(musicManifest(ids) as object),
  tracks: [
    {
      id: 'd_oshodi_a',
      file: 'd_oshodi.mp3',
      lite: 'lite/d_oshodi.mp3',
      startAt: 0,
      grid: { bpm: 124, first: 0.5 },
      family: 'oshodi',
    },
    {
      id: 'd_oshodi_b',
      file: 'd_oshodi.mp3',
      lite: 'lite/d_oshodi.mp3',
      startAt: 70.5,
      grid: { bpm: 124, first: 0.5 },
      family: 'oshodi',
    },
    { id: 'd_oshodi_sd', file: 'd_oshodi_sd.mp3', grid: { bpm: 124, first: 0 }, family: 'oshodi' },
    { id: 'd_lekki_a', file: 'd_lekki.mp3', grid: { bpm: 110, first: 0 }, family: 'lekki' },
    { id: 'd_lekki_sd', file: 'd_lekki_sd.mp3', grid: { bpm: 110, first: 0 }, family: 'lekki' },
  ].map((t) => ({ title: t.id, artist: null, source: 'draft', licence: 'DRAFT, NOT approved', ...t })),
  playlists: { default: [], arenas: {} },
  menu: [],
  arenaMap: {
    rumbleOshodi: { tracks: ['d_oshodi_a', 'd_oshodi_b'], start: 'd_oshodi_a' },
    oshodiInterchange: { tracks: ['d_oshodi_b'] },
    rumbleLekki: { tracks: ['d_lekki_a'] },
    ghostArena: { tracks: ['nope'] },
  },
  variants: { suddenDeathFor: { oshodi: 'd_oshodi_sd', lekki: 'd_lekki_sd', bad: '../x' } },
});

describe('candidate extras for the district songs', () => {
  it('reads start offsets, grids, families, the arena map and per-family Sudden Death, ignoring anything unsafe', () => {
    const e = parseCandidateExtras(raw());
    expect(e.trackMeta.d_oshodi_b).toEqual({
      startAt: 70.5,
      grid: { bpm: 124, first: 0.5 },
      family: 'oshodi',
    });
    expect(e.arenaMap.rumbleOshodi).toEqual({ tracks: ['d_oshodi_a', 'd_oshodi_b'], start: 'd_oshodi_a' });
    expect(e.variants.suddenDeathFor).toEqual({ oshodi: 'd_oshodi_sd', lekki: 'd_lekki_sd' });
    const bad = parseCandidateExtras({
      tracks: [{ id: 'x', startAt: -1, grid: { bpm: 5, first: 0 } }],
      arenaMap: { '../a': { tracks: ['t'] } },
    });
    expect(bad.trackMeta.x).toEqual({ startAt: undefined, grid: undefined, family: undefined });
    expect(bad.arenaMap).toEqual({});
  });
});

describe('mergeCandidateMusic with an arena map', () => {
  const shipped = parseMusicManifest(
    musicManifest(['t0', 't1'], {
      arenas: {
        rumbleOshodi: { tracks: ['t0'], signature: 't0' },
        danfoBusPark: { tracks: ['t1'], signature: 't1' },
      },
    }),
  ).manifest;
  const cand = parseMusicManifest(raw()).manifest;
  const extras = parseCandidateExtras(raw());

  it('match mode points only the listed arenas at the district tracks; every other arena keeps its shipped playlist', () => {
    const m = mergeCandidateMusic(shipped, cand, 'match', CAND, extras);
    expect(m.playlists.arenas.rumbleOshodi).toEqual({
      tracks: ['d_oshodi_a', 'd_oshodi_b'],
      signature: null,
      start: 'd_oshodi_a',
    });
    expect(m.playlists.arenas.oshodiInterchange).toEqual({
      tracks: ['d_oshodi_b'],
      signature: null,
      start: 'd_oshodi_b',
    });
    expect(m.playlists.arenas.rumbleLekki?.tracks).toEqual(['d_lekki_a']);
    expect(m.playlists.arenas.danfoBusPark).toEqual(shipped.playlists.arenas.danfoBusPark); // the Pixabay fallback
    expect(m.playlists.arenas.ghostArena).toBeUndefined(); // names a track that is not there
    expect(m.playlists.default).toEqual(shipped.playlists.default);
    expect(m.variants?.suddenDeathFor).toEqual({ oshodi: 'd_oshodi_sd', lekki: 'd_lekki_sd' });
    const b = m.tracks.find((t) => t.id === 'd_oshodi_b')!;
    expect(b).toMatchObject({
      candidate: true,
      startAt: 70.5,
      family: 'oshodi',
      url: `${CAND}d_oshodi.mp3`,
      liteUrl: `${CAND}lite/d_oshodi.mp3`,
    });
  });
  it('menu and stings modes leave the arenas alone; the shipped manifest is never mutated', () => {
    const frozen = JSON.stringify(shipped);
    expect(mergeCandidateMusic(shipped, cand, 'stings', CAND, extras)).toBe(shipped);
    expect(mergeCandidateMusic(shipped, cand, 'menu', CAND, extras).playlists.arenas).toEqual(
      shipped.playlists.arenas,
    );
    mergeCandidateMusic(shipped, cand, 'all', CAND, extras);
    expect(JSON.stringify(shipped)).toBe(frozen);
  });
});

describe('the player with district tracks', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  async function rig(mode: 'match' | 'off' = 'match') {
    const ctx = new FakeContext();
    const buses = createBuses(ctx, VOL, false);
    const files = musicFiles(
      ['t0', 't1'],
      `${BASE}music/`,
      musicManifest(['t0', 't1'], {
        arenas: {
          rumbleOshodi: { tracks: ['t0'], signature: 't0' },
          danfoBusPark: { tracks: ['t1'], signature: 't1' },
        },
      }),
    );
    files[`${CAND}manifest.json`] = raw();
    for (const f of ['d_oshodi', 'd_oshodi_sd', 'd_lekki', 'd_lekki_sd']) {
      files[`${CAND}${f}.mp3`] = 'x'.repeat(4000);
      files[`${CAND}lite/${f}.mp3`] = 'x'.repeat(2000);
    }
    const s = server(files);
    const media = mediaFactory();
    const player = createMusicPlayer(ctx, buses, {
      fetch: s.fetch,
      probe: (u) => s.fetch(u).then((r) => r.ok),
      createElement: media.create,
      rand: createRand(9),
      baseUrl: BASE,
      candidateMode: mode,
      onError: () => undefined,
    });
    await player.load();
    return { player, media, ctx, hits: s.hits };
  }
  const el = (r: Awaited<ReturnType<typeof rig>>, file: string): FakeMediaElement =>
    r.media.sounding().find((e) => e.src.endsWith(file))!;

  it('a Rumble arena opens its district song, then alternates its two start points, never the same one twice', async () => {
    const r = await rig();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      r.player.startMatch('rumbleOshodi');
      seen.push(r.player.status().track!);
    }
    expect(seen[0]).toBe('d_oshodi_a');
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(new Set(seen)).toEqual(new Set(['d_oshodi_a', 'd_oshodi_b']));
  });

  it('variant B seeks to its start point once the stream plays; variant A does not seek', async () => {
    const r = await rig();
    r.player.startMatch('oshodiInterchange'); // map: only b
    const b = el(r, 'd_oshodi.mp3');
    b.emit('playing');
    expect(b.currentTime).toBe(70.5);
    r.player.startMatch('rumbleLekki');
    const a = el(r, 'd_lekki.mp3');
    a.emit('playing');
    expect(a.currentTime).toBe(0);
  });

  it('an arena the map does not list plays its shipped track, with no candidate file requested for it', async () => {
    const r = await rig();
    r.player.startMatch('danfoBusPark');
    expect(r.player.status().track).toBe('t1');
    r.player.setVariant('suddenDeath'); // there is no Sudden Death loop for a Pixabay track
    expect(r.player.status().track).toBe('t1');
  });

  it("Sudden Death takes the district song's own loop and enters at the same place in the bar, at 124 BPM", async () => {
    const r = await rig();
    r.player.startMatch('rumbleOshodi');
    const base = el(r, 'd_oshodi.mp3');
    base.currentTime = 10.3; // 0.5 s grid offset, bar = 240 / 124 = 1.9355 s
    r.player.setVariant('suddenDeath');
    expect(r.player.status().track).toBe('d_oshodi_sd');
    const sd = el(r, 'd_oshodi_sd.mp3');
    expect(base.paused).toBe(false); // the old song keeps playing until the new stream is up
    base.currentTime = 10.9;
    sd.emit('playing');
    const bar = 240 / 124;
    const phase = (((10.9 - 0.5) % bar) + bar) % bar;
    expect(sd.currentTime).toBeCloseTo(0 + phase + 0.04, 3);
    r.player.setVariant('normal');
    expect(['d_oshodi_a', 'd_oshodi_b']).toContain(r.player.status().track); // back on the song's own track
  });

  it('start-point variants of one file are probed once, and no candidate audio is fetched before a match asks for it', async () => {
    const r = await rig();
    const probes = r.hits.filter((u) => u.endsWith('d_oshodi.mp3'));
    expect(probes).toHaveLength(1); // a, b share the file
    expect(
      r.hits.filter((u) => u.includes('candidates/') && !u.endsWith('manifest.json')).length,
    ).toBeLessThanOrEqual(4); // one probe per file
  });

  it('with the overlay off nothing candidate is requested and setVariant never switches', async () => {
    const r = await rig('off');
    r.player.startMatch('rumbleOshodi');
    r.player.setVariant('suddenDeath');
    expect(r.player.status().track).toBe('t0');
    expect(r.hits.filter((u) => u.includes('candidates/'))).toEqual([]);
  });
});

describe('the committed district manifest', () => {
  const dir = join(__dirname, '../../tools/audio/candidates/lagos_districts_v1');
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
    tracks: {
      id: string;
      file: string;
      lite: string;
      approved: boolean;
      licence: string;
      family: string;
      grid: { bpm: number; first: number };
      startAt?: number;
      seconds: number;
    }[];
    arenaMap: Record<string, { tracks: string[]; start: string }>;
    variants: { suddenDeathFor: Record<string, string> };
    proposedNotApplied: Record<string, { track: string }>;
  };
  const tid = new Set(m.tracks.map((t) => t.id));

  it('maps all seven City Rumble arenas to distinct songs, and only to real arenas', () => {
    for (const a of RUMBLE_ARENA_IDS) expect(m.arenaMap[a], a).toBeDefined();
    for (const a of [...Object.keys(m.arenaMap), ...Object.keys(m.proposedNotApplied)])
      expect(ARENAS[a], `${a} is not a game arena`).toBeDefined();
    const fam = RUMBLE_ARENA_IDS.map((a) => m.tracks.find((t) => t.id === m.arenaMap[a]!.start)!.family);
    expect(new Set(fam).size).toBe(7);
    // the standard arenas that share a district get a start point no Rumble arena of that song opens with
    for (const [arena, e] of Object.entries(m.arenaMap)) {
      if (ARENAS[arena]!.kind !== 'standard') continue;
      const own = m.tracks.find((t) => t.id === e.start)!;
      const rumble = Object.entries(m.arenaMap).find(
        ([a, x]) =>
          ARENAS[a]!.kind === 'rumble' && m.tracks.find((t) => t.id === x.start)!.family === own.family,
      )![1];
      expect(rumble.tracks, arena).not.toContain(e.start);
    }
  });
  it('every track is an unapproved candidate with a grid; each family has a Sudden Death loop on the same tempo; Data Saver files are named', () => {
    for (const t of m.tracks) {
      expect(t.approved).toBe(false);
      expect(t.licence).toMatch(/NOT approved/);
      expect(t.id).toMatch(/^dist_/);
      expect(t.lite).toBe(`lite/${t.file}`);
      expect(t.grid.bpm).toBeGreaterThan(90);
      expect(t.grid.bpm).toBeLessThan(135);
    }
    for (const fam of new Set(m.tracks.map((t) => t.family))) {
      const sd = m.tracks.find((t) => t.id === m.variants.suddenDeathFor[fam])!;
      const bpms = new Set(m.tracks.filter((t) => t.family === fam).map((t) => t.grid.bpm));
      expect(sd, fam).toBeDefined();
      expect([...bpms]).toEqual([sd.grid.bpm]);
      for (const t of m.tracks.filter((x) => x.family === fam && x.startAt !== undefined))
        expect(t.startAt!).toBeLessThan(t.seconds);
    }
    for (const e of Object.values(m.arenaMap)) for (const id of e.tracks) expect(tid.has(id)).toBe(true);
  });
  it('the mastered MP3s are generated, never tracked by git', () => {
    expect(readFileSync(join(__dirname, '../../.gitignore'), 'utf8')).toMatch(/lagos_districts_v1\/\*\.mp3/);
    try {
      expect(
        execFileSync('git', ['ls-files', 'tools/audio/candidates/lagos_districts_v1'], {
          cwd: join(__dirname, '../..'),
          encoding: 'utf8',
        })
          .split('\n')
          .filter((f) => f.endsWith('.mp3')),
      ).toEqual([]);
    } catch (e) {
      if (e instanceof Error && e.name === 'AssertionError') throw e;
    }
  });
});
