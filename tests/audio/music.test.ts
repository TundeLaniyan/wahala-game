import { describe, expect, it } from 'vitest';
import { createBuses } from '../../src/audio/buses';
import { createMusicPlayer } from '../../src/audio/music';
import { BASE, musicFiles, musicManifest, server } from './fakeServer';
import { FakeBuffer, FakeContext } from './fakeContext';
import type { FakeSource } from './fakeContext';

const VOL = { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };

function rig(files: Record<string, unknown> = musicFiles(), decode?: (n: number) => FakeBuffer) {
  const ctx = new FakeContext();
  const buses = createBuses(ctx, VOL, false);
  const s = server(files);
  const errors: unknown[] = [];
  const player = createMusicPlayer(ctx, buses, {
    fetch: s.fetch,
    decode: (d) => Promise.resolve(decode ? decode(d.byteLength) : new FakeBuffer(32000, 44100, 2)),
    baseUrl: BASE,
    onError: (e) => errors.push(e),
  });
  return { ctx, buses, player, errors, hits: s.hits };
}

const loops = (ctx: FakeContext): FakeSource[] => ctx.sources.filter((x) => x.loop && x.stoppedAt === null);

describe('music player', () => {
  it('loads the manifest, starts the menu loop first and loops it gaplessly on the manifest length', async () => {
    const { ctx, player } = rig();
    const report = await player.load();
    expect(report.failed).toEqual([]);
    expect(report.loaded).toEqual([
      'menu_loop',
      'match_loop',
      'match_tension',
      'sting_win',
      'sting_lose',
      'sting_draw',
    ]);
    const l = loops(ctx);
    expect(l).toHaveLength(1);
    expect(player.playing()).toEqual(['menu_loop']);
    expect(l[0]!.loop).toBe(true);
    expect(l[0]!.loopStart).toBe(0);
    expect(l[0]!.loopEnd).toBeCloseTo(16000 / 44100, 9); // exact bar-aligned length from the manifest
  });

  it('trims a decoded buffer that carries encoder padding back to the manifest loop length', async () => {
    const { ctx, player } = rig(musicFiles(), () => new FakeBuffer(16000 + 1105, 44100, 2));
    await player.load();
    const menu = ctx.sources.find((s) => s.loop)!;
    expect(menu.loopEnd).toBeCloseTo(16000 / 44100, 9);
  });

  it('crossfades menu -> match and back, never leaving two scenes at full level', async () => {
    const { ctx, player } = rig();
    await player.load();
    player.setScene('match');
    expect(player.playing().sort()).toEqual(['match_loop', 'match_tension']); // the stem runs silent, phase-locked
    const menuSource = ctx.sources[0]!;
    expect(menuSource.stoppedAt).not.toBeNull(); // old loop scheduled to stop after its fade
    expect(menuSource.stoppedAt!).toBeGreaterThan(ctx.currentTime);
    player.setScene('menu');
    expect(player.playing()).toEqual(['menu_loop']);
    player.setScene('off');
    expect(player.playing()).toEqual([]);
  });

  it('remembers the wanted scene when audio finishes loading later', async () => {
    const { player, ctx } = rig();
    player.setScene('match'); // before anything has loaded
    expect(loops(ctx)).toHaveLength(0);
    await player.load();
    expect(player.playing().sort()).toEqual(['match_loop', 'match_tension']);
  });

  it('fades the tension stem in with the tension level', async () => {
    const { ctx, player } = rig();
    await player.load();
    player.setScene('match');
    const stemGain = ctx.gains.filter((g) => !g.disconnected).slice(-1)[0]!;
    player.setTension(0);
    expect(player.playing().sort()).toEqual(['match_loop', 'match_tension']);
    player.setTension(1);
    expect(Math.max(...stemGain.gain.targets)).toBeGreaterThan(0.5);
    player.setTension(Number.NaN); // junk is treated as 0
    expect(stemGain.gain.value).toBe(0);
  });

  it('phase-locks a tension stem that finishes loading after the match loop started', async () => {
    const files = musicFiles();
    files[`${BASE}music/match_tension.ogg`] = 'y'.repeat(8000); // recognisable by size in decode()
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const ctx = new FakeContext();
    const player = createMusicPlayer(ctx, createBuses(ctx, VOL, false), {
      fetch: server(files).fetch,
      decode: async (d) => {
        if (d.byteLength === 8000) await gate;
        return new FakeBuffer(d.byteLength === 8000 ? 8000 : 32000, 44100, 2);
      },
      baseUrl: BASE,
    });
    player.setScene('match');
    const loading = player.load();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(player.playing()).toEqual(['match_loop']);
    const main = ctx.sources.find((s) => s.loop)!;
    ctx.advance(3.3);
    release();
    await loading;
    const stem = ctx.sources.filter((s) => s.loop).find((s) => s !== main)!;
    expect(stem.startOffset).toBeCloseTo((3.3 - main.startedAt!) % (8000 / 44100), 6);
  });

  it('plays a result sting once and dips the loop underneath it', async () => {
    const { ctx, player } = rig();
    await player.load();
    player.setScene('match');
    const before = ctx.sources.length;
    expect(player.sting('win')).toBe(true);
    expect(ctx.sources.length).toBe(before + 1);
    const sting = ctx.sources[ctx.sources.length - 1]!;
    expect(sting.loop).toBe(false);
    const loopGain = ctx.gains.find((g) => g.gain.targets.some((t) => Math.abs(t - 0.18) < 1e-9));
    expect(loopGain).toBeTruthy();
  });

  it('falls back to the mp3 when the ogg cannot be decoded', async () => {
    const files = musicFiles();
    const { player, hits, ctx } = rig(files);
    let calls = 0;
    ctx.decoded = null;
    const p2 = createMusicPlayer(ctx, createBuses(ctx, VOL, false), {
      fetch: server(files).fetch,
      decode: (d) => {
        calls++;
        // reject .ogg-sized first attempt per track, accept the retry
        return calls % 2 === 1
          ? Promise.reject(new Error('EncodingError'))
          : Promise.resolve(new FakeBuffer(d.byteLength, 44100, 2));
      },
      baseUrl: BASE,
    });
    const r = await p2.load();
    expect(r.failed).toEqual([]);
    expect(r.loaded).toContain('menu_loop');
    expect(hits).toEqual([]);
    void player;
  });

  it('stays silent and error-free when nothing is shipped, offline, or the manifest is junk', async () => {
    for (const files of [{}, { [`${BASE}music/manifest.json`]: 'not json' }]) {
      const { player, errors, ctx } = rig(files);
      const r = await player.load();
      expect(r.loaded).toEqual([]);
      player.setScene('match');
      expect(player.sting('win')).toBe(false);
      expect(loops(ctx)).toHaveLength(0);
      expect(errors).toEqual([]);
    }
    const ctx = new FakeContext();
    const off = createMusicPlayer(ctx, createBuses(ctx, VOL, false), {
      fetch: () => Promise.reject(new Error('offline')),
      decode: () => Promise.reject(new Error('x')),
    });
    expect((await off.load()).loaded).toEqual([]);
  });

  it('reports tracks that are missing from the manifest or fail to decode, and keeps the rest', async () => {
    const files = musicFiles();
    const m = musicManifest() as { tracks: Record<string, unknown> };
    delete m.tracks.match_tension;
    files[`${BASE}music/manifest.json`] = m;
    delete files[`${BASE}music/sting_lose.ogg`];
    delete files[`${BASE}music/sting_lose.mp3`];
    const { player } = rig(files);
    const r = await player.load();
    expect(r.failed.map((f) => f.track).sort()).toEqual(['match_tension', 'sting_lose']);
    expect(r.loaded).toContain('match_loop');
  });

  it('rejects unsafe file names from a manifest', async () => {
    const files = musicFiles();
    const m = musicManifest() as { tracks: Record<string, { files: { ogg: { file: string } } }> };
    m.tracks.menu_loop!.files.ogg.file = '../../etc/passwd.ogg';
    files[`${BASE}music/manifest.json`] = m;
    const { player } = rig(files);
    const r = await player.load();
    expect(r.loaded).toContain('menu_loop'); // served by the mp3 candidate instead
  });

  it('dispose stops everything', async () => {
    const { ctx, player } = rig();
    await player.load();
    player.dispose();
    expect(player.playing()).toEqual([]);
    expect(ctx.sources.every((s) => s.stoppedAt !== null)).toBe(true);
  });
});
