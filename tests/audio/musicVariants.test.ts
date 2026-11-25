/**
 * Sudden Death and boss music (candidate overlay only): the state -> variant rule, the manifest's variants, and the
 * player's position-synced crossfades. The shipped playlist never has variants, so for it everything is a no-op.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuses } from '../../src/audio/buses';
import { mergeCandidateMusic, parseCandidateExtras } from '../../src/audio/candidates';
import { createMusicPlayer } from '../../src/audio/music';
import { musicVariantFor } from '../../src/audio/musicState';
import { parseMusicManifest } from '../../src/audio/playlist';
import { createRand } from '../../src/audio/rng';
import type { GameState } from '../../src/sim';
import { FakeContext } from './fakeContext';
import { mediaFactory } from './fakeMedia';
import type { FakeMediaElement } from './fakeMedia';
import { BASE, musicFiles, musicManifest, server } from './fakeServer';

const VOL = { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };
const CAND = `${BASE}candidates/`;
const IDS = ['c_rumble', 'c_sd', 'c_b1', 'c_b2', 'c_b3'];

const state = (o: { phase?: string; sd?: boolean; mission?: object | null }): GameState =>
  ({
    match: { phase: o.phase ?? 'playing', suddenDeath: o.sd ? {} : null },
    mission: o.mission ?? undefined,
  }) as unknown as GameState;
const boss = (phase: number, hp: number, extra: object = {}): object => ({
  phase,
  outcome: null,
  boss: { maxHits: 3, hp, defeated: false, ...extra },
});

describe('musicVariantFor (read-only, from the authoritative state)', () => {
  it('normal play, Sudden Death, and a finished match', () => {
    expect(musicVariantFor(state({}))).toBe('normal');
    expect(musicVariantFor(state({ sd: true }))).toBe('suddenDeath');
    expect(musicVariantFor(state({ sd: true, phase: 'ended' }))).toBe('normal');
  });
  it('boss level follows the mission phase and the hits already taken, whichever is further on', () => {
    expect(musicVariantFor(state({ mission: boss(0, 3) }))).toBe('boss1');
    expect(musicVariantFor(state({ mission: boss(1, 3) }))).toBe('boss2');
    expect(musicVariantFor(state({ mission: boss(0, 2) }))).toBe('boss2'); // one hit landed
    expect(musicVariantFor(state({ mission: boss(0, 1) }))).toBe('boss3'); // last hit left
    expect(musicVariantFor(state({ mission: boss(2, 3) }))).toBe('boss3');
  });
  it('a defeated boss, a finished mission, or a mission without a boss fight is normal music', () => {
    expect(musicVariantFor(state({ mission: boss(2, 0, { defeated: true }) }))).toBe('normal');
    expect(musicVariantFor(state({ mission: { ...boss(1, 2), outcome: { kind: 'won' } } }))).toBe('normal');
    expect(musicVariantFor(state({ mission: { phase: 1, outcome: null, boss: { defeated: false } } }))).toBe(
      'normal',
    );
  });
});

const candManifest = (): unknown => ({
  ...(musicManifest(IDS) as object),
  tracks: IDS.map((id) => ({
    id,
    title: id,
    artist: null,
    source: 'draft',
    licence: 'DRAFT, NOT approved',
    file: `${id}.mp3`,
    lite: `lite/${id}.mp3`,
  })),
  playlists: { default: ['c_rumble'], arenas: {} },
  menu: [],
  syncGroups: Object.fromEntries(IDS.map((id) => [id, 'g'])),
  variants: { suddenDeath: 'c_sd', boss: ['c_b1', 'c_b2', 'c_b3'], evil: 'x' },
});

describe('candidate variants in the manifest', () => {
  const shipped = parseMusicManifest(musicManifest(['t0'])).manifest;
  const cand = parseMusicManifest(candManifest()).manifest;
  const extras = parseCandidateExtras(candManifest());
  it('extras keep only safe ids; the parser keeps variants only for listed tracks and never reads a url', () => {
    expect(extras.variants).toEqual({ suddenDeath: 'c_sd', boss: ['c_b1', 'c_b2', 'c_b3'] });
    expect(parseCandidateExtras({ variants: { suddenDeath: '../x', boss: ['ok', 3] } }).variants).toEqual({});
    // the parser (production schema) keeps variants whose ids are listed tracks, and drops the unknown ones
    expect(parseMusicManifest(candManifest()).manifest.variants).toEqual({
      suddenDeath: 'c_sd',
      boss: ['c_b1', 'c_b2', 'c_b3'],
    });
    expect(
      parseMusicManifest({
        ...(candManifest() as object),
        variants: { suddenDeath: 'nope', boss: ['c_b1', 'x'] },
      }).manifest.variants,
    ).toBeUndefined();
    const sneaky = parseMusicManifest({
      tracks: [{ id: 'a', file: 'a.mp3', licence: 'L', url: 'https://evil.example/a.mp3', candidate: true }],
    }).manifest.tracks[0]!;
    expect(sneaky.url).toBeUndefined();
    expect(sneaky.candidate).toBeUndefined();
  });
  it('only the lnds / match / all modes carry variants; they point at known candidate tracks; sync groups and lite URLs are set', () => {
    expect(mergeCandidateMusic(shipped, cand, 'menu', CAND, extras).variants).toBeUndefined();
    const m = mergeCandidateMusic(shipped, cand, 'lnds', CAND, extras);
    expect(m.variants).toEqual({ suddenDeath: 'c_sd', boss: ['c_b1', 'c_b2', 'c_b3'] });
    const t = m.tracks.find((x) => x.id === 'c_sd')!;
    expect(t.syncGroup).toBe('g');
    expect(t.liteUrl).toBe(`${CAND}lite/c_sd.mp3`);
    expect(shipped.variants).toBeUndefined();
  });
  it('a variant naming a track that is not in the candidate manifest is dropped', () => {
    const m = mergeCandidateMusic(shipped, cand, 'lnds', CAND, {
      syncGroups: {},
      variants: { suddenDeath: 'nope', boss: ['c_b1', 'nope'] },
      trackMeta: {},
      arenaMap: {},
    });
    expect(m.variants).toBeUndefined();
  });
});

describe('the player switches variants on the same beat', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  async function rig(withVariants: boolean, dataSaver = false, missing: string[] = []) {
    const ctx = new FakeContext();
    const buses = createBuses(ctx, VOL, false);
    const files = musicFiles(['t0'], `${BASE}music/`, musicManifest(['t0']));
    if (withVariants) {
      files[`${CAND}manifest.json`] = candManifest();
      for (const id of IDS.filter((i) => !missing.includes(i))) {
        files[`${CAND}${id}.mp3`] = 'x'.repeat(4000);
        files[`${CAND}lite/${id}.mp3`] = 'x'.repeat(2000);
      }
    }
    const s = server(files);
    const media = mediaFactory();
    const errors: unknown[] = [];
    const player = createMusicPlayer(ctx, buses, {
      fetch: s.fetch,
      probe: (u) => s.fetch(u).then((r) => r.ok),
      createElement: media.create,
      rand: createRand(5),
      baseUrl: BASE,
      candidateMode: withVariants ? 'lnds' : 'off',
      lite: () => dataSaver,
      onError: (e) => errors.push(e),
    });
    await player.load();
    return { player, media, errors, ctx };
  }
  const elOf = (r: Awaited<ReturnType<typeof rig>>, id: string): FakeMediaElement | undefined =>
    r.media.sounding().find((e) => e.src.includes(`/${id}.mp3`));

  it('Sudden Death takes over at the playback position, keeps the tempo, and normal play returns to the match track', async () => {
    const r = await rig(true);
    r.player.startMatch('arena');
    expect(r.player.status().track).toBe('c_rumble');
    const a = elOf(r, 'c_rumble')!;
    a.currentTime = 12.5;
    r.player.update({ phase: 'playing', remaining: 10 }); // some escalation: the rate is not 1
    r.player.setVariant('suddenDeath');
    expect(r.player.status().track).toBe('c_sd');
    expect(r.player.status().variant).toBe('suddenDeath');
    const b = elOf(r, 'c_sd')!;
    expect(b.rateWrites.at(-1)).toBeCloseTo(a.rateWrites.at(-1)!, 3);
    // the old deck keeps sounding until the new stream really plays; then the beat is where it would have got to
    expect(r.media.sounding()).toContain(a);
    r.ctx.advance(0.4);
    b.emit('playing');
    const rate = a.rateWrites.at(-1)!;
    expect(b.currentTime).toBeCloseTo(12.5 + 0.4 * rate, 2);
    r.player.setVariant('normal');
    expect(r.player.status().track).toBe('c_rumble');
    expect(r.errors).toEqual([]);
  });

  it('boss levels crossfade up and down, and the repeated state changes nothing', async () => {
    const r = await rig(true);
    r.player.startMatch('arena');
    const seen: string[] = [];
    for (const v of ['boss1', 'boss1', 'boss2', 'boss3', 'boss2'] as const) {
      r.player.setVariant(v);
      seen.push(r.player.status().track!);
    }
    expect(seen).toEqual(['c_b1', 'c_b1', 'c_b2', 'c_b3', 'c_b2']);
    r.player.startMatch('arena'); // a rematch: back to normal music
    expect(r.player.status().variant).toBe('normal');
    expect(r.player.status().track).toBe('c_rumble');
  });

  it('a variant wanted before the track has opened is applied once it has', async () => {
    const r = await rig(true);
    r.player.setVariant('suddenDeath');
    r.player.startMatch('arena'); // startMatch resets: the engine re-asserts the variant on its next tick
    r.player.setVariant('suddenDeath');
    expect(r.player.status().track).toBe('c_sd');
  });

  it('a broken variant file puts the match back on its own track and is not retried', async () => {
    const r = await rig(true, false, ['c_sd']);
    r.player.startMatch('arena');
    r.player.setVariant('suddenDeath'); // c_sd was probed missing: not available, so nothing switches
    expect(r.player.status().track).toBe('c_rumble');
    expect(r.errors).toEqual([]);
  });

  it('Data Saver streams the candidate lite files, variants included', async () => {
    const r = await rig(true, true);
    r.player.startMatch('arena');
    r.player.setVariant('suddenDeath');
    expect(r.media.sounding().some((e) => e.src === `${CAND}lite/c_sd.mp3`)).toBe(true);
  });

  it('without variants (the shipped playlist, or the overlay off) setVariant never opens anything', async () => {
    const r = await rig(false);
    r.player.startMatch('arena');
    const before = r.media.sounding().length;
    for (const v of ['suddenDeath', 'boss1', 'boss3', 'normal'] as const) r.player.setVariant(v);
    expect(r.player.status().track).toBe('t0');
    expect(r.media.sounding().length).toBe(before);
  });
});
