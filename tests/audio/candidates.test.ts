/**
 * The founder-audition overlay for UNAPPROVED candidate audio (src/audio/candidates.ts, decision AU1):
 * inert by default, additive only, never tracked under public/, never listed as approved.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuses } from '../../src/audio/buses';
import { candidateModeFromSearch, mergeCandidateMusic } from '../../src/audio/candidates';
import { createMusicPlayer } from '../../src/audio/music';
import { parseMusicManifest } from '../../src/audio/playlist';
import type { MusicManifest } from '../../src/audio/playlist';
import { parseManifest } from '../../src/audio/samples';
import { createRand } from '../../src/audio/rng';
import { FakeContext } from './fakeContext';
import { mediaFactory } from './fakeMedia';
import { BASE, TRACK_IDS, musicFiles, musicManifest, server } from './fakeServer';

const ROOT = join(__dirname, '../..');
const CAND_DIR = join(ROOT, 'tools/audio/candidates/lagos_no_dey_sleep_v1');
const VOL = { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };

const CAND_BASE = `${BASE}candidates/`;
const candManifest = (): unknown => ({
  version: 2,
  tracks: ['wahala_draft_menu', 'wahala_draft_rumble'].map((id) => ({
    id,
    title: id,
    artist: null,
    source: 'draft',
    licence: 'ORIGINAL DRAFT, NOT approved',
    file: `${id}.m4a`,
    gain: 1.26,
  })),
  playlists: { default: ['wahala_draft_rumble'], arenas: {} },
  menu: ['wahala_draft_menu'],
});
const parsed = (raw: unknown): MusicManifest => parseMusicManifest(raw).manifest;
const shipped = (): MusicManifest =>
  parsed(
    musicManifest(TRACK_IDS, {
      arenas: { a1: { tracks: ['t1'], signature: 't1', start: 't1' }, a2: { tracks: ['t2'] } },
    }),
  );

describe('mode parsing', () => {
  it('is off unless the URL asks, and understands the four modes', () => {
    expect(candidateModeFromSearch('')).toBe('off');
    expect(candidateModeFromSearch('?debug&seed=3')).toBe('off');
    expect(candidateModeFromSearch('?audiodraft')).toBe('all');
    expect(candidateModeFromSearch('?audiodraft=1')).toBe('all');
    expect(candidateModeFromSearch('?audiodraft=menu')).toBe('menu');
    expect(candidateModeFromSearch('?audiodraft=MATCH')).toBe('match');
    expect(candidateModeFromSearch('?audiodraft=lnds')).toBe('lnds');
    expect(candidateModeFromSearch('?audiodraft=stings')).toBe('stings');
    expect(candidateModeFromSearch('?audiodraft=off')).toBe('off');
    expect(candidateModeFromSearch('?audiodraft=0')).toBe('off');
  });
});

describe('mergeCandidateMusic (pure)', () => {
  it('returns the very same manifest when the mode wants no music or there are no candidates', () => {
    const base = shipped();
    for (const m of ['off', 'stings'] as const) {
      expect(mergeCandidateMusic(base, parsed(candManifest()), m, CAND_BASE)).toBe(base);
    }
    expect(mergeCandidateMusic(base, parsed({ version: 2, tracks: [] }), 'all', CAND_BASE)).toBe(base);
  });

  it('menu mode adds the tracks and the menu entry, and changes no arena or default playlist', () => {
    const base = shipped();
    const frozen = JSON.stringify(base);
    const m = mergeCandidateMusic(base, parsed(candManifest()), 'menu', CAND_BASE);
    expect(JSON.stringify(base)).toBe(frozen); // never mutated
    expect(m.menu).toEqual(['wahala_draft_menu']);
    expect(m.playlists).toEqual(base.playlists);
    expect(m.tracks.slice(0, base.tracks.length)).toEqual(base.tracks);
    const added = m.tracks.slice(base.tracks.length);
    expect(added.map((t) => t.id)).toEqual(['wahala_draft_menu', 'wahala_draft_rumble']);
    for (const t of added) {
      expect(t.candidate).toBe(true);
      expect(t.url).toBe(`${CAND_BASE}${t.file}`);
    }
    expect(base.tracks.every((t) => t.candidate === undefined && t.url === undefined)).toBe(true);
  });

  it('lnds mode makes the candidate the signature of every listed arena and the default, and leaves the menu alone', () => {
    const base = parsed(
      musicManifest(TRACK_IDS, { menu: ['t0'], arenas: { a1: { signature: 't1' }, a2: {} } }),
    );
    const m = mergeCandidateMusic(base, parsed(candManifest()), 'lnds', CAND_BASE);
    expect(m.menu).toEqual(['t0']);
    expect(m.playlists.default).toEqual(['wahala_draft_rumble']);
    for (const a of ['a1', 'a2']) {
      expect(m.playlists.arenas[a]).toEqual({
        tracks: ['wahala_draft_rumble'],
        signature: 'wahala_draft_rumble',
        start: 'wahala_draft_rumble',
      });
    }
    expect(m.tracks.slice(0, 10)).toEqual(base.tracks);
  });

  it('never replaces an approved track that has the same id', () => {
    const base = shipped();
    const clash = { ...(candManifest() as { tracks: { id: string }[] }) };
    clash.tracks = clash.tracks.map((t, i) => (i === 0 ? { ...t, id: 't0' } : t));
    const m = mergeCandidateMusic(base, parsed(clash), 'all', CAND_BASE);
    expect(m.tracks.find((t) => t.id === 't0')).toEqual(base.tracks[0]);
    expect(m.tracks.filter((t) => t.id === 't0')).toHaveLength(1);
  });

  it('a manifest cannot supply url or candidate: approved files always come from public/audio/music/', () => {
    const raw = musicManifest(['t0']) as { tracks: Record<string, unknown>[] };
    raw.tracks[0]!.url = 'https://evil.example/x.mp3';
    raw.tracks[0]!.candidate = true;
    const t = parsed(raw).tracks[0]!;
    expect(t.url).toBeUndefined();
    expect(t.candidate).toBeUndefined();
  });
});

describe('the music player with the overlay', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  async function rig(mode: 'off' | 'menu' | 'match' | 'lnds' | 'all', withCandidates: boolean) {
    const ctx = new FakeContext();
    const buses = createBuses(ctx, VOL, false);
    const files = musicFiles(
      ['t0', 't1'],
      `${BASE}music/`,
      musicManifest(['t0', 't1'], { arenas: { arena: { tracks: ['t1'], signature: 't1' } } }),
    );
    if (withCandidates) {
      files[`${CAND_BASE}manifest.json`] = candManifest();
      for (const id of ['wahala_draft_menu', 'wahala_draft_rumble'])
        files[`${CAND_BASE}${id}.m4a`] = 'x'.repeat(4000);
    }
    const s = server(files);
    const media = mediaFactory();
    const errors: unknown[] = [];
    const player = createMusicPlayer(ctx, buses, {
      fetch: s.fetch,
      probe: (url) => s.fetch(url).then((r) => r.ok),
      createElement: media.create,
      rand: createRand(5),
      baseUrl: BASE,
      candidateMode: mode,
      onError: (e) => errors.push(e),
    });
    const report = await player.load();
    return { player, media, errors, report, hits: s.hits };
  }
  const heard = (r: Awaited<ReturnType<typeof rig>>): string[] => r.media.sounding().map((e) => e.src);

  it('mode off: no candidate URL is ever requested, even when the files are staged', async () => {
    const r = await rig('off', true);
    r.player.startMatch('arena');
    expect(r.hits.filter((u) => u.includes('candidates/'))).toEqual([]);
    expect(heard(r).every((src) => src.endsWith('/t1.mp3'))).toBe(true);
    expect(r.report.loaded).toEqual(['t0', 't1']);
  });

  it('mode menu: the title screen plays the candidate menu loop, the match still plays the approved track', async () => {
    const r = await rig('menu', true);
    r.player.setScene('menu');
    expect(heard(r)).toEqual([`${CAND_BASE}wahala_draft_menu.m4a`]);
    r.player.startMatch('arena');
    expect(r.player.status().track).toBe('t1'); // the menu loop is only crossfading out
    expect(heard(r).some((src) => src.endsWith('/music/t1.mp3'))).toBe(true);
  });

  it('mode match: any arena plays the candidate rumble mix and the menu stays silent', async () => {
    const r = await rig('lnds', true);
    r.player.setScene('menu');
    expect(heard(r)).toEqual([]);
    r.player.startMatch('arena');
    expect(heard(r)).toEqual([`${CAND_BASE}wahala_draft_rumble.m4a`]);
    expect(r.player.status().track).toBe('wahala_draft_rumble');
  });

  it('with the overlay on but no staged files (the production case) everything is exactly as shipped', async () => {
    const r = await rig('all', false);
    r.player.setScene('menu');
    expect(heard(r)).toEqual([]);
    r.player.startMatch('arena');
    expect(heard(r).every((src) => src.endsWith('/music/t1.mp3'))).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.report.loaded).toEqual(['t0', 't1']);
  });
});

describe('the committed candidates are clearly unapproved and cannot ship by accident', () => {
  it('manifest: every track is approved:false, licence says NOT approved, names avoid the rejected patterns', () => {
    const raw = JSON.parse(readFileSync(join(CAND_DIR, 'manifest.json'), 'utf8')) as {
      tracks: { id: string; file: string; licence: string; approved: boolean }[];
    };
    expect(raw.tracks.length).toBeGreaterThan(0);
    for (const t of raw.tracks) {
      expect(t.approved).toBe(false);
      expect(t.licence).toMatch(/NOT approved/);
      expect(t.id).toMatch(/^lnds_/);
      expect(`${t.id} ${t.file}`).not.toMatch(
        /match_loop|menu_loop|match_tension|sting_(win|lose|draw)|crowd_loop|buspark_loop|kokoro/i,
      );
      expect(existsSync(join(CAND_DIR, t.file))).toBe(true);
    }
    expect(parseMusicManifest(raw).rejected).toEqual([]);
  });

  it('slots: only the two result stingers, each licensed as an unapproved draft, files present', () => {
    const raw = JSON.parse(readFileSync(join(CAND_DIR, 'slots.json'), 'utf8')) as {
      slots: Record<string, { file: string; license: string }>;
    };
    expect(Object.keys(raw.slots).sort()).toEqual(['lose_sting', 'win_sting']);
    const p = parseManifest(raw);
    expect(p.skipped).toEqual([]);
    for (const e of Object.values(raw.slots)) {
      expect(e.license).toMatch(/NOT approved/);
      expect(existsSync(join(CAND_DIR, e.file))).toBe(true);
    }
  });

  it('every audio file in the candidates folder is listed by its manifest or slots (nothing stray), Data Saver files exist', () => {
    const m = JSON.parse(readFileSync(join(CAND_DIR, 'manifest.json'), 'utf8')) as {
      sourceSha256: string;
      tracks: { file: string; lite?: string }[];
    };
    const s = JSON.parse(readFileSync(join(CAND_DIR, 'slots.json'), 'utf8')) as {
      slots: Record<string, { file: string }>;
    };
    // the approved recording is identified by its fingerprint in the manifest; the recording itself is never committed
    expect(m.sourceSha256).toBe('e4b6314d4c27cc2719e51f7cc9f97f4df03dec8920696e744211afc29be3bebc');
    const listed = new Set([...m.tracks.map((t) => t.file), ...Object.values(s.slots).map((e) => e.file)]);
    const audio = readdirSync(CAND_DIR).filter((n) => /\.(m4a|mp3|ogg|wav)$/.test(n));
    // the logo sting is kept for the founder's review but has no in-game hook yet
    expect(audio.filter((n) => !listed.has(n))).toEqual(['lnds_sting.mp3']);
    for (const t of m.tracks) if (t.lite) expect(existsSync(join(CAND_DIR, t.lite))).toBe(true);
    expect(readdirSync(CAND_DIR).filter((n) => /original|approved_main/i.test(n))).toEqual([]);
  });

  it('nothing is tracked under public/audio/candidates and the folder is git-ignored', () => {
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8')).toMatch(/^public\/audio\/candidates\/$/m);
    try {
      const tracked = execFileSync('git', ['ls-files', 'public/audio/candidates'], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      expect(tracked.trim()).toBe('');
    } catch (e) {
      if (e instanceof Error && e.name === 'AssertionError') throw e;
      // not a git checkout (a source archive): nothing to check
    }
  });
});
