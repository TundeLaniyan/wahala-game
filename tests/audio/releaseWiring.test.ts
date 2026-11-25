/**
 * The founder-approved audio release as shipped (decision AU4): every arena id the game can start maps to the intended
 * soundtrack or a documented fallback, each Rumble arena's Sudden Death loop takes over reliably on its own tempo, the
 * menu / boss / result music is wired, and the files named by the manifest exist. Runs the REAL public/audio manifest
 * through the real player with fake media.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARENAS, CAMPAIGN_ARENAS, RAID_ARENAS, RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS } from '../../src/sim';
import { createBuses } from '../../src/audio/buses';
import { createMusicPlayer } from '../../src/audio/music';
import { parseMusicManifest } from '../../src/audio/playlist';
import type { MusicManifest } from '../../src/audio/playlist';
import { createRand } from '../../src/audio/rng';
import { FakeContext } from './fakeContext';
import { mediaFactory } from './fakeMedia';
import type { FakeMediaElement } from './fakeMedia';
import { BASE, server } from './fakeServer';

const AUDIO = join(__dirname, '../../public/audio');
const raw = JSON.parse(readFileSync(join(AUDIO, 'music/manifest.json'), 'utf8')) as unknown;
const manifest: MusicManifest = parseMusicManifest(raw).manifest;
const VOL = { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };
const DISTRICT: Record<string, string> = {
  rumbleOjuelegba: 'ojuelegba',
  rumbleOshodi: 'oshodi',
  rumbleMushin: 'mushin',
  rumbleFadeyi: 'fadeyi',
  rumbleEbuteMetta: 'ebute',
  rumbleLagosIsland: 'lagosisland',
  rumbleLekki: 'lekki',
};
const trackById = (id: string) => manifest.tracks.find((t) => t.id === id)!;

describe('every arena id has a documented soundtrack', () => {
  it('the seven City Rumble arenas are exactly the seven district songs, each with a distinct file', () => {
    expect([...RUMBLE_ARENA_IDS].sort()).toEqual(Object.keys(DISTRICT).sort());
    const files = new Set<string>();
    for (const arena of RUMBLE_ARENA_IDS) {
      const pl = manifest.playlists.arenas[arena]!;
      expect(pl.signature, arena).toBeNull();
      expect(pl.tracks, arena).toEqual([`dist_${DISTRICT[arena]}_a`, `dist_${DISTRICT[arena]}_b`]);
      expect(pl.start).toBe(`dist_${DISTRICT[arena]}_a`);
      files.add(trackById(pl.tracks![0]!).file);
      // each has a Sudden Death loop of its own song, and the files exist, with a Data Saver version
      const sd = trackById(manifest.variants!.suddenDeathFor![DISTRICT[arena]!]!);
      expect(sd.family, arena).toBe(DISTRICT[arena]);
      for (const t of [trackById(pl.tracks![0]!), trackById(pl.tracks![1]!), sd]) {
        expect(existsSync(join(AUDIO, 'music', t.file)), t.file).toBe(true);
        expect(existsSync(join(AUDIO, 'music', t.lite!)), t.lite).toBe(true);
        expect(t.grid, t.id).toBeDefined();
      }
    }
    expect(files.size).toBe(7);
  });

  it('every other arena the game can start plays its founder-assigned Pixabay song or the default pool; none is silent', () => {
    const rumble = new Set(RUMBLE_ARENA_IDS);
    const others = [
      ...Object.keys(ARENAS).filter((a) => !rumble.has(a)),
      ...Object.keys(RAID_ARENAS),
      ...Object.keys(CAMPAIGN_ARENAS),
    ];
    expect(others.length).toBeGreaterThan(9);
    for (const a of others) {
      const pl = manifest.playlists.arenas[a];
      if (STANDARD_ARENA_IDS.includes(a)) {
        // the nine standard arenas keep their founder-assigned Pixabay signature (decision N12)
        expect(pl?.signature, a).toMatch(/^pixabay_/);
      } else {
        // experimental, raid and campaign boards have no assignment: the default (all Pixabay) pool, documented in docs/AUDIO_RELEASE.md
        expect(pl, a).toBeUndefined();
      }
    }
    expect(manifest.playlists.default.length).toBeGreaterThanOrEqual(5);
    for (const id of manifest.playlists.default) expect(id).toMatch(/^pixabay_/);
  });

  it('the district songs never play on a non-Rumble arena (no lnds_rumble or generic mix anywhere)', () => {
    const ids = Object.values(manifest.playlists.arenas).flatMap((p) => p.tracks ?? []);
    expect(ids.filter((i) => /^lnds_/.test(i))).toEqual([]);
    expect(manifest.tracks.some((t) => t.id === 'lnds_rumble')).toBe(false);
  });
});

describe('the shipped player behaviour', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  /** The real manifest; `present` decides which music files the fake server has. */
  async function rig(present: (file: string) => boolean = () => true) {
    const ctx = new FakeContext();
    const buses = createBuses(ctx, VOL, false);
    const files: Record<string, unknown> = { [`${BASE}music/manifest.json`]: raw };
    for (const t of manifest.tracks) {
      if (present(t.file)) files[`${BASE}music/${t.file}`] = 'x'.repeat(4000);
      if (t.lite && present(t.file)) files[`${BASE}music/${t.lite}`] = 'x'.repeat(2000);
    }
    const s = server(files);
    const media = mediaFactory();
    const player = createMusicPlayer(ctx, buses, {
      fetch: s.fetch,
      probe: (u) => s.fetch(u).then((r) => r.ok),
      createElement: media.create,
      rand: createRand(5),
      baseUrl: BASE,
      candidateMode: 'off',
      onError: () => undefined,
    });
    await player.load();
    return { player, media, hits: s.hits };
  }
  const el = (r: Awaited<ReturnType<typeof rig>>, file: string): FakeMediaElement =>
    r.media.sounding().find((e) => e.src.endsWith(file))!;

  it('each Rumble arena opens its own district song, and Sudden Death swaps to that song’s loop on the same beat phase', async () => {
    for (const [arena, family] of Object.entries(DISTRICT)) {
      const r = await rig();
      r.player.startMatch(arena);
      expect(r.player.status().track, arena).toBe(`dist_${family}_a`);
      const a = trackById(`dist_${family}_a`);
      const base = el(r, a.file);
      base.emit('playing');
      base.currentTime = 20.37;
      r.player.setVariant('suddenDeath');
      expect(r.player.status().track, arena).toBe(`dist_${family}_sd`);
      const sdTrack = trackById(`dist_${family}_sd`);
      const sd = el(r, sdTrack.file);
      expect(base.paused, `${arena}: the song keeps playing until the loop is up`).toBe(false);
      base.currentTime = 21.0;
      sd.emit('playing');
      const bar = (4 * 60) / a.grid!.bpm;
      const phase = (((21.0 - a.grid!.first) % bar) + bar) % bar;
      expect(sd.currentTime, arena).toBeCloseTo(sdTrack.grid!.first + phase + 0.04, 3);
      // the match ends or the state returns to normal: back on the district song
      r.player.setVariant('normal');
      expect(r.player.status().track, arena).toMatch(new RegExp(`^dist_${family}_[ab]$`));
    }
  });

  it('Sudden Death on a Pixabay arena changes nothing (those songs have no loop of their own)', async () => {
    const r = await rig();
    r.player.startMatch('danfoBusPark');
    const t = r.player.status().track;
    expect(t).toBe('pixabay_504898');
    r.player.setVariant('suddenDeath');
    expect(r.player.status().track).toBe(t);
  });

  it('boss levels 1 to 3 play the Lagos No Dey Sleep boss music on any arena and return to the arena song', async () => {
    const r = await rig();
    r.player.startMatch('danfoBusPark');
    for (const [i, v] of (['boss1', 'boss2', 'boss3'] as const).entries()) {
      r.player.setVariant(v);
      expect(r.player.status().track).toBe(`lnds_boss_${i + 1}`);
    }
    r.player.setVariant('normal');
    expect(r.player.status().track).toBe('pixabay_504898');
  });

  it('the main menu plays the Lagos No Dey Sleep instrumental', async () => {
    const r = await rig();
    r.player.setScene('menu');
    expect(r.player.status().track).toBe('lnds_menu');
  });

  it('with a district file missing the arena falls back to its earlier Pixabay song, never silence', async () => {
    const r = await rig((f) => !f.startsWith('dist_'));
    r.player.startMatch('rumbleLekki');
    expect(r.player.status().track).toBe('pixabay_623364');
    r.player.setVariant('suddenDeath'); // no loop file: the fallback keeps playing
    expect(r.player.status().track).toBe('pixabay_623364');
    const m = await rig((f) => !f.startsWith('dist_'));
    m.player.startMatch('rumbleMushin'); // no earlier song: the default pool
    expect(m.player.status().track).toMatch(/^pixabay_/);
  });

  it('lazy: loading opens only the menu theme; no district, boss or Pixabay stream exists before a match asks', async () => {
    const r = await rig();
    expect(r.media.sounding().map((e) => e.src.split('/').pop())).toEqual(['lnds_menu.mp3']);
  });

  it('Data Saver plays the small file of every WAHALA! track (menu, district, Sudden Death, boss)', async () => {
    const ctx = new FakeContext();
    const buses = createBuses(ctx, VOL, false);
    const files: Record<string, unknown> = { [`${BASE}music/manifest.json`]: raw };
    for (const t of manifest.tracks) {
      files[`${BASE}music/${t.file}`] = 'x'.repeat(4000);
      if (t.lite) files[`${BASE}music/${t.lite}`] = 'x'.repeat(2000);
    }
    const s = server(files);
    const media = mediaFactory();
    const player = createMusicPlayer(ctx, buses, {
      fetch: s.fetch,
      probe: (u) => s.fetch(u).then((r) => r.ok),
      createElement: media.create,
      rand: createRand(5),
      baseUrl: BASE,
      candidateMode: 'off',
      lite: () => true,
      onError: () => undefined,
    });
    await player.load();
    const srcs = (): string[] => media.sounding().map((e) => e.src);
    expect(srcs()).toEqual([`${BASE}music/lite/lnds_menu.mp3`]);
    player.startMatch('rumbleOshodi');
    expect(srcs().some((u) => u.endsWith('lite/dist_oshodi.mp3'))).toBe(true);
    player.setVariant('suddenDeath');
    expect(srcs().some((u) => u.endsWith('lite/dist_oshodi_sd.mp3'))).toBe(true);
    player.setVariant('boss2');
    expect(srcs().some((u) => u.endsWith('lite/lnds_boss_2.mp3'))).toBe(true);
    expect(srcs().filter((u) => /music\/(?!lite\/)(dist|lnds)_/.test(u))).toEqual([]);
  });
});
