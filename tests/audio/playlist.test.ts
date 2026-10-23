/** The playlist model: manifest validation, arena playlists, signature tracks and the rotation rule. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMusicManifest, pickFrom, pickMatchTrack, playlistFor } from '../../src/audio/playlist';
import type { MusicManifest } from '../../src/audio/playlist';
import { createRand } from '../../src/audio/rng';
import { ARENAS } from '../../src/sim';
import { TRACK_IDS, musicManifest } from './fakeServer';

const parse = (raw: unknown): MusicManifest => parseMusicManifest(raw).manifest;
const all = () => true;

/** Plays `n` matches in a row the way the player does (previous = last pick). */
function season(
  m: MusicManifest,
  n: number,
  o: { arenaId?: string; isAvailable?: (id: string) => boolean; seed?: number } = {},
) {
  const rand = createRand(o.seed ?? 7);
  const picks: (string | null)[] = [];
  let previous: string | null = null;
  for (let i = 0; i < n; i++) {
    const id = pickMatchTrack(m, { arenaId: o.arenaId, previous, isAvailable: o.isAvailable ?? all, rand });
    picks.push(id);
    previous = id;
  }
  return picks;
}

describe('rotation', () => {
  it('never plays the same track twice in a row, and uses the whole playlist', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const picks = season(parse(musicManifest()), 400, { seed });
      for (let i = 1; i < picks.length; i++)
        expect(picks[i], `seed ${seed} match ${i}`).not.toBe(picks[i - 1]);
      expect(new Set(picks)).toEqual(new Set(TRACK_IDS));
    }
  });

  it('is deterministic for an injected rng', () => {
    const m = parse(musicManifest());
    expect(season(m, 30, { seed: 5 })).toEqual(season(m, 30, { seed: 5 }));
    expect(season(m, 30, { seed: 5 })).not.toEqual(season(m, 30, { seed: 6 }));
  });

  it('with two available tracks it alternates; with one it repeats it (better than silence)', () => {
    const m = parse(musicManifest());
    const two = season(m, 20, { isAvailable: (id) => id === 't3' || id === 't7' });
    for (let i = 1; i < two.length; i++) expect(two[i]).not.toBe(two[i - 1]);
    expect(new Set(two)).toEqual(new Set(['t3', 't7']));
    expect(new Set(season(m, 5, { isAvailable: (id) => id === 't4' }))).toEqual(new Set(['t4']));
  });

  it('skips tracks whose files are missing, and returns null when none is available (silent music)', () => {
    const m = parse(musicManifest());
    const present = new Set(['t1', 't2', 't5']);
    const picks = season(m, 60, { isAvailable: (id) => present.has(id) });
    expect(picks.every((p) => p !== null && present.has(p))).toBe(true);
    expect(season(m, 3, { isAvailable: () => false })).toEqual([null, null, null]);
    expect(season(parse(musicManifest([])), 2)).toEqual([null, null]);
  });

  it('pickFrom avoids the previous choice only while there is an alternative', () => {
    const r = createRand(1);
    expect(pickFrom([], null, r)).toBeNull();
    expect(pickFrom(['a'], 'a', r)).toBe('a');
    for (let i = 0; i < 50; i++) expect(pickFrom(['a', 'b'], 'a', r)).toBe('b');
  });
});

describe('arena playlists and signature tracks', () => {
  const arenas = {
    danfoBusPark: { tracks: ['t0', 't1', 't2'] },
    balogunMarket: { signature: 't9' },
    lekkiRoadworks: { tracks: ['t4', 't5'], signature: 't6' },
  };

  it('every arena defaults to the full playlist', () => {
    const m = parse(musicManifest());
    for (const a of ['danfoBusPark', 'balogunMarket', 'lekkiRoadworks', 'unknownArena']) {
      expect(playlistFor(m, a)).toEqual(TRACK_IDS);
    }
    expect(playlistFor(m)).toEqual(TRACK_IDS);
  });

  it('an arena with its own list only rotates through that list', () => {
    const m = parse(musicManifest(TRACK_IDS, { arenas }));
    expect(new Set(season(m, 50, { arenaId: 'danfoBusPark' }))).toEqual(new Set(['t0', 't1', 't2']));
    // an arena that has only a signature keeps the default list for rotation
    expect(playlistFor(m, 'balogunMarket')).toEqual(TRACK_IDS);
  });

  it('a signature track takes priority while it is available, rotation resumes when it is missing', () => {
    const m = parse(musicManifest(TRACK_IDS, { arenas }));
    expect(new Set(season(m, 10, { arenaId: 'balogunMarket' }))).toEqual(new Set(['t9']));
    expect(new Set(season(m, 10, { arenaId: 'lekkiRoadworks' }))).toEqual(new Set(['t6']));
    const noSig = season(m, 30, { arenaId: 'lekkiRoadworks', isAvailable: (id) => id !== 't6' });
    expect(new Set(noSig)).toEqual(new Set(['t4', 't5']));
    for (let i = 1; i < noSig.length; i++) expect(noSig[i]).not.toBe(noSig[i - 1]);
  });

  it('a signature or list entry naming an unknown track is dropped', () => {
    const m = parse(
      musicManifest(['t0', 't1'], {
        arenas: { danfoBusPark: { tracks: ['nope', 't1'], signature: 'ghost' } },
      }),
    );
    expect(m.playlists.arenas.danfoBusPark).toEqual({ tracks: ['t1'], signature: null });
  });

  it('the shipped manifest knows the three current arenas and gives each all ten tracks', () => {
    const raw = JSON.parse(readFileSync(join(__dirname, '../../public/audio/music/manifest.json'), 'utf8'));
    const m = parse(raw);
    expect(m.tracks).toHaveLength(10);
    for (const a of Object.keys(ARENAS)) {
      expect(Object.keys(m.playlists.arenas)).toContain(a);
      expect(playlistFor(m, a)).toHaveLength(10);
      expect(m.playlists.arenas[a]!.signature).toBeNull();
    }
  });
});

describe('manifest validation', () => {
  it('drops unlicensed, unsafe and duplicate entries with a reason; never throws on junk', () => {
    const r = parseMusicManifest({
      version: 2,
      tracks: [
        { id: 'ok', licence: 'L', file: 'ok.mp3' },
        { id: 'nolic', file: 'nolic.mp3' },
        { id: 'bad', licence: 'L', file: '../etc/passwd.mp3' },
        { id: 'ok', licence: 'L', file: 'ok2.mp3' },
        { id: 'a b', licence: 'L', file: 'x.mp3' },
        { id: 'wav', licence: 'L', file: 'x.wav' },
      ],
    });
    expect(r.manifest.tracks.map((t) => t.id)).toEqual(['ok']);
    expect(r.rejected.map((x) => x.track)).toEqual(['nolic', 'bad', 'ok', 'a b', 'wav']);
    expect(r.manifest.playlists.default).toEqual(['ok']); // no explicit default: every valid track
    for (const junk of [null, 1, 'x', [], { tracks: 'no' }]) expect(parse(junk).tracks).toEqual([]);
  });

  it('clamps the per-track gain', () => {
    const m = parse({
      tracks: [
        { id: 'a', licence: 'L', file: 'a.mp3', gain: 9 },
        { id: 'b', licence: 'L', file: 'b.mp3', gain: -1 },
      ],
    });
    expect(m.tracks.map((t) => t.gain)).toEqual([2, 0]);
  });
});
