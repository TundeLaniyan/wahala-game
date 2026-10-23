/** The playlist model: manifest validation, arena playlists, signature tracks and the rotation rule. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMusicManifest, pickFrom, pickMatchTrack, playlistFor } from '../../src/audio/playlist';
import type { MusicManifest } from '../../src/audio/playlist';
import { createRand } from '../../src/audio/rng';
import { STANDARD_ARENA_IDS } from '../../src/sim';
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
    expect(m.playlists.arenas.danfoBusPark).toEqual({ tracks: ['t1'], signature: null, start: null });
  });

  it('a start track opens the first match on an arena, then rotation takes over', () => {
    const m = parse(
      musicManifest(TRACK_IDS, { arenas: { danfoBusPark: { tracks: ['t0', 't1', 't2'], start: 't2' } } }),
    );
    const rand = createRand(3);
    const first = pickMatchTrack(m, {
      arenaId: 'danfoBusPark',
      previous: null,
      isAvailable: all,
      rand,
      firstOnArena: true,
    });
    expect(first).toBe('t2');
    // not when it was the track just heard (no immediate repeat), nor when its file is missing
    expect(
      pickMatchTrack(m, {
        arenaId: 'danfoBusPark',
        previous: 't2',
        isAvailable: all,
        rand,
        firstOnArena: true,
      }),
    ).not.toBe('t2');
    expect(
      pickMatchTrack(m, {
        arenaId: 'danfoBusPark',
        previous: null,
        isAvailable: (id) => id !== 't2',
        rand,
        firstOnArena: true,
      }),
    ).not.toBe('t2');
  });

  it('the shipped manifest: every standard arena has its own signature track (founder table), City Rumble rotates', () => {
    const raw = JSON.parse(readFileSync(join(__dirname, '../../public/audio/music/manifest.json'), 'utf8'));
    const m = parse(raw);
    expect(m.tracks).toHaveLength(10);
    const FOUNDER: Record<string, string> = {
      danfoBusPark: 'pixabay_504898',
      balogunMarket: 'pixabay_573648',
      lekkiRoadworks: 'pixabay_491433',
      oshodiInterchange: 'pixabay_569473',
      ajegunleBackstreets: 'pixabay_588999',
      lagoonJetty: 'pixabay_406552',
      surulerePowerYard: 'pixabay_491432',
      yabaAfterDark: 'pixabay_439622',
      thirdMainland: 'pixabay_540950',
    };
    expect([...STANDARD_ARENA_IDS].sort()).toEqual(Object.keys(FOUNDER).sort());
    for (const a of STANDARD_ARENA_IDS) {
      const pl = m.playlists.arenas[a]!;
      expect(pl.signature, a).toBe(FOUNDER[a]);
      // every match on the arena, first or fiftieth, plays the signature track
      const picks = season(m, 20, { arenaId: a, isAvailable: () => true });
      expect(new Set(picks), a).toEqual(new Set([FOUNDER[a]]));
    }
    // nine different songs: one per arena, all nine supplied files used
    expect(new Set(Object.values(FOUNDER)).size).toBe(9);
    // City Rumble rotates a subset of the same tracks and never repeats back to back
    const rumble = playlistFor(m, 'cityRumble');
    expect(rumble.length).toBeGreaterThanOrEqual(3);
    for (const id of rumble) expect(Object.values(FOUNDER)).toContain(id);
    const picks = season(m, 60, { arenaId: 'cityRumble', isAvailable: () => true });
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
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
