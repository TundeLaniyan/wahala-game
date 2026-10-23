/** The streaming playlist player on a fake AudioContext and fake <audio> elements. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuses } from '../../src/audio/buses';
import { createMusicPlayer } from '../../src/audio/music';
import type { MusicOptions } from '../../src/audio/music';
import { createRand } from '../../src/audio/rng';
import { BASE, TRACK_IDS, musicFiles, musicManifest, server } from './fakeServer';
import { FakeContext } from './fakeContext';
import type { FakeFilter, FakeGain } from './fakeContext';
import { mediaFactory, trackOf } from './fakeMedia';

const VOL = { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

interface RigOptions {
  present?: readonly string[];
  manifest?: unknown;
  pitch?: boolean;
  /** Files that probe fine but fail to play (corrupt). */
  corrupt?: readonly string[];
  probe?: boolean;
  seed?: number;
  extra?: Partial<MusicOptions>;
}

async function rig(o: RigOptions = {}) {
  const ctx = new FakeContext();
  const buses = createBuses(ctx, VOL, false);
  const present = o.present ?? TRACK_IDS;
  const s = server(musicFiles(present, `${BASE}music/`, o.manifest ?? musicManifest()));
  const media = mediaFactory({
    pitch: o.pitch,
    broken: (src) =>
      !present.some((id) => src.endsWith(`/${id}.mp3`)) ||
      (o.corrupt ?? []).some((id) => src.endsWith(`/${id}.mp3`)),
  });
  const errors: unknown[] = [];
  const probed: string[] = [];
  const player = createMusicPlayer(ctx, buses, {
    fetch: s.fetch,
    probe:
      o.probe === false
        ? null
        : (url) => {
            probed.push(url);
            return s.fetch(url).then((r) => r.ok);
          },
    createElement: media.create,
    rand: createRand(o.seed ?? 3),
    baseUrl: BASE,
    onError: (e) => errors.push(e),
    ...o.extra,
  });
  const report = await player.load();
  return { ctx, buses, player, media, errors, report, probed, hits: s.hits };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const playing = (r: Awaited<ReturnType<typeof rig>>) => r.media.sounding().map(trackOf);
const clock = (remaining: number, phase: 'countdown' | 'playing' | 'ended' = 'playing') => ({
  phase,
  remaining,
});
/** The shared tone chain: [shelf, punch] filters and the trim gain right after them. */
const chain = (ctx: FakeContext) => {
  const [shelf, punch] = ctx.filters.filter((f) => f.type === 'highshelf' || f.frequency.value === 110) as [
    FakeFilter,
    FakeFilter,
  ];
  const trim = punch.connections[0] as FakeGain;
  const pauseGain = trim.connections[0] as FakeGain;
  return { shelf, punch, trim, pauseGain };
};

describe('loading and availability', () => {
  it('reads the manifest, probes each listed file once and reports which are present', async () => {
    const r = await rig({ present: ['t1', 't4'] });
    expect(r.report.loaded.sort()).toEqual(['t1', 't4']);
    expect(r.report.failed.map((f) => f.track).sort()).toEqual(
      TRACK_IDS.filter((x) => x !== 't1' && x !== 't4').sort(),
    );
    expect(r.probed).toHaveLength(10);
    expect(r.player.status().available.sort()).toEqual(['t1', 't4']);
    expect(r.errors).toEqual([]);
  });

  it('never streams a missing file: matches only ever pick the present ones', async () => {
    const r = await rig({ present: ['t2', 't8'] });
    for (let i = 0; i < 12; i++) r.player.startMatch('danfoBusPark');
    const streamed = new Set(r.media.els.map(trackOf));
    expect(streamed).toEqual(new Set(['t2', 't8']));
  });

  it('with zero tracks the player is silent: no element, no error', async () => {
    const r = await rig({ present: [] });
    r.player.setScene('menu');
    r.player.startMatch('balogunMarket');
    r.player.update(clock(0));
    r.player.setPaused(true);
    r.player.setPaused(false);
    expect(r.media.els).toEqual([]);
    expect(r.player.status().track).toBeNull();
    expect(r.errors).toEqual([]);
  });

  it('without a manifest (404 / offline) it is silent too', async () => {
    const ctx = new FakeContext();
    const media = mediaFactory();
    const player = createMusicPlayer(ctx, createBuses(ctx, VOL, false), {
      fetch: server({}).fetch,
      probe: null,
      createElement: media.create,
      rand: createRand(1),
      baseUrl: BASE,
    });
    expect((await player.load()).loaded).toEqual([]);
    player.startMatch();
    expect(media.els).toEqual([]);
  });

  it('a listed file that fails to play is dropped and another track takes over', async () => {
    const r = await rig({ corrupt: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'], seed: 11 });
    r.player.startMatch();
    for (let i = 0; i < 12; i++) await flush();
    expect(r.player.status().track).toBe('t9');
    expect(playing(r)).toEqual(['t9']);
    const tried = [...new Set(r.media.els.map(trackOf))].filter((id) => id !== 't9');
    for (const id of tried) expect(r.player.status().available).not.toContain(id);
    expect(r.report.failed.map((f) => f.track).sort()).toEqual(tried.sort());
    expect(r.player.status().history).toEqual(['t9']); // failed attempts are not remembered as "played"
    expect(r.errors).toEqual([]);
  });

  it('without a probe every listed file is tried, and runtime failures are skipped', async () => {
    const r = await rig({ probe: false, present: ['t5'] });
    r.player.startMatch();
    for (let i = 0; i < 30; i++) await flush();
    expect(r.player.status().track).toBe('t5');
    expect(playing(r)).toEqual(['t5']);
  });
});

describe('streaming through the music bus', () => {
  it('streams one element per track through a MediaElementSource into the music duck, preserving pitch', async () => {
    const r = await rig();
    r.player.startMatch('lekkiRoadworks');
    const [el] = r.media.els;
    expect(el!.preservesPitch).toBe(true);
    expect(el!.loop).toBe(true);
    expect(r.ctx.mediaSources.map((m) => m.element)).toEqual([el]);
    // element -> deck gain -> shelf -> punch -> trim -> pause gain -> music duck (the bus input)
    const deckGain = r.ctx.mediaSources[0]!.connections[0] as FakeGain;
    const toneIn = deckGain.connections[0] as FakeGain;
    const { shelf, pauseGain } = chain(r.ctx);
    expect(toneIn.connections).toEqual([shelf]);
    expect(pauseGain.connections).toEqual([r.buses.input('music')]);
    expect(r.player.status().pitchPreserved).toBe(true);
  });

  it('the menu playlist (optional) plays on the title screen and crossfades to the match track', async () => {
    const r = await rig({ manifest: musicManifest(TRACK_IDS, { menu: ['t0'] }) });
    r.player.setScene('menu');
    expect(playing(r)).toEqual(['t0']);
    r.player.startMatch();
    const matchTrack = r.player.status().track!;
    expect(matchTrack).not.toBeNull();
    vi.advanceTimersByTime(3000); // the menu deck fades out and is released
    expect(playing(r)).toEqual([matchTrack]);
    r.player.setScene('menu');
    vi.advanceTimersByTime(3000);
    expect(playing(r)).toEqual(['t0']);
    r.player.setScene('off');
    vi.advanceTimersByTime(3000);
    expect(playing(r)).toEqual([]);
  });

  it('with an empty menu playlist the menus are silent', async () => {
    const r = await rig();
    r.player.setScene('menu');
    expect(r.media.els).toEqual([]);
  });
});

describe('per-match rotation', () => {
  it('each rematch picks a new track (never the previous one) and releases the old stream', async () => {
    const r = await rig();
    const seen: string[] = [];
    for (let i = 0; i < 25; i++) {
      r.player.startMatch('danfoBusPark');
      seen.push(r.player.status().track!);
      vi.advanceTimersByTime(2000);
      expect(playing(r)).toEqual([seen[i]]);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(r.player.status().history).toEqual(seen);
    expect(r.media.els.filter((e) => !e.released)).toHaveLength(1); // old elements give up their stream
  });

  it('a signature track always plays on its arena', async () => {
    const r = await rig({
      manifest: musicManifest(TRACK_IDS, { arenas: { balogunMarket: { signature: 't6' } } }),
    });
    for (let i = 0; i < 4; i++) {
      r.player.startMatch('balogunMarket');
      expect(r.player.status().track).toBe('t6');
    }
    r.player.startMatch('danfoBusPark');
    expect(r.player.status().track).not.toBe('t6');
  });

  it('remembers a match started before the manifest has loaded', async () => {
    const ctx = new FakeContext();
    const media = mediaFactory();
    const s = server(musicFiles());
    const player = createMusicPlayer(ctx, createBuses(ctx, VOL, false), {
      fetch: s.fetch,
      probe: (url) => s.fetch(url).then((x) => x.ok),
      createElement: media.create,
      rand: createRand(2),
      baseUrl: BASE,
    });
    player.startMatch('lekkiRoadworks');
    expect(media.els).toEqual([]);
    await player.load();
    expect(media.sounding()).toHaveLength(1);
    expect(player.status().arenaId).toBe('lekkiRoadworks');
  });
});

describe('endgame escalation', () => {
  it('follows the game clock: tempo 1.0 at 45 s and 30 s, ~1.045 at 15 s, ~1.09 at 0 s, pitch preserved', async () => {
    const r = await rig();
    r.player.startMatch();
    const el = r.media.els[0]!;
    const rateAt = (remaining: number) => {
      r.player.update(clock(remaining));
      return el.playbackRate;
    };
    expect(rateAt(45)).toBe(1);
    expect(rateAt(30)).toBe(1);
    expect(rateAt(15)).toBeCloseTo(1.045, 3);
    expect(rateAt(0)).toBeCloseTo(1.09, 3);
    expect(el.preservesPitch).toBe(true);
  });

  it('ramps smoothly tick by tick, writing the rate only in small steps', async () => {
    const r = await rig();
    r.player.startMatch();
    const el = r.media.els[0]!;
    for (let ticks = 40 * 60; ticks >= 0; ticks--) r.player.update(clock(ticks / 60));
    expect(el.playbackRate).toBeCloseTo(1.09, 3);
    expect(el.rateWrites.length).toBeLessThanOrEqual(40); // 0.0025 steps, not 60 writes a second
    for (let i = 1; i < el.rateWrites.length; i++) {
      expect(el.rateWrites[i]! - el.rateWrites[i - 1]!).toBeGreaterThanOrEqual(0);
      expect(el.rateWrites[i]! - el.rateWrites[i - 1]!).toBeLessThan(0.004);
    }
  });

  it('opens the brightness / drive with a compensating trim, and resets it for the next match', async () => {
    const r = await rig();
    r.player.startMatch();
    const { shelf, punch, trim } = chain(r.ctx);
    r.player.update(clock(45));
    expect([shelf.gain.value, punch.gain.value, trim.gain.value]).toEqual([0, 0, 1]);
    r.player.update(clock(0));
    expect(shelf.gain.value).toBeCloseTo(3.5, 6);
    expect(punch.gain.value).toBeCloseTo(2, 6);
    expect(trim.gain.value).toBeLessThan(0.9);
    r.player.startMatch(); // rematch
    expect([shelf.gain.value, punch.gain.value, trim.gain.value]).toEqual([0, 0, 1]);
  });

  it('does not touch the playback rate where pitch cannot be preserved (tone lift only)', async () => {
    const r = await rig({ pitch: false });
    r.player.startMatch();
    const el = r.media.els[0]!;
    for (const s of [45, 30, 15, 0]) r.player.update(clock(s));
    expect(el.rateWrites.filter((x) => x !== 1)).toEqual([]);
    expect(el.playbackRate).toBe(1);
    expect(r.player.status().pitchPreserved).toBe(false);
    expect(chain(r.ctx).shelf.gain.value).toBeCloseTo(3.5, 6); // the fallback still lifts
  });

  it('at match end the tempo eases back to 1.0, the tone resets and the track settles lower', async () => {
    const r = await rig();
    r.player.startMatch();
    const el = r.media.els[0]!;
    r.player.update(clock(0));
    expect(el.playbackRate).toBeCloseTo(1.09, 3);
    const deckGain = r.ctx.mediaSources[0]!.connections[0] as FakeGain;
    for (let i = 0; i < 180; i++) {
      r.ctx.advance(1 / 60);
      r.player.update(clock(0, 'ended'));
    }
    expect(el.playbackRate).toBe(1);
    expect(deckGain.gain.value).toBeCloseTo(0.55, 6);
    expect(chain(r.ctx).shelf.gain.value).toBe(0);
    const back = el.rateWrites.slice(el.rateWrites.indexOf(Math.max(...el.rateWrites)));
    expect(back.length).toBeGreaterThan(20);
    expect(Math.max(...back.slice(1).map((w, i) => Math.abs(w - back[i]!)))).toBeLessThan(0.01); // no snap
  });

  it('the countdown is calm', async () => {
    const r = await rig();
    r.player.startMatch();
    r.player.update(clock(0, 'countdown'));
    expect(r.media.els[0]!.playbackRate).toBe(1);
  });
});

describe('pause, resume and rematch', () => {
  it('pause fades and then pauses the stream; resume continues the same element', async () => {
    const r = await rig();
    r.player.startMatch();
    const el = r.media.els[0]!;
    const { pauseGain } = chain(r.ctx);
    r.player.setPaused(true);
    expect(pauseGain.gain.value).toBe(0);
    expect(el.paused).toBe(false); // still fading
    vi.advanceTimersByTime(200);
    expect(el.paused).toBe(true);
    expect(r.player.status().paused).toBe(true);
    r.player.update(clock(10)); // frames keep coming while paused: nothing restarts
    expect(el.paused).toBe(true);
    r.player.setPaused(false);
    expect(el.paused).toBe(false);
    expect(pauseGain.gain.value).toBe(1);
    expect(r.media.els).toHaveLength(1); // the same stream, not a new track
  });

  it('a quick pause/resume never leaves the stream paused', async () => {
    const r = await rig();
    r.player.startMatch();
    r.player.setPaused(true);
    r.player.setPaused(false);
    vi.advanceTimersByTime(500);
    expect(r.media.els[0]!.paused).toBe(false);
  });

  it('a rematch from the pause menu un-pauses and starts a new track at tempo 1.0', async () => {
    const r = await rig();
    r.player.startMatch();
    const first = r.player.status().track;
    r.player.update(clock(5));
    r.player.setPaused(true);
    vi.advanceTimersByTime(200);
    r.player.startMatch();
    const st = r.player.status();
    expect(st.paused).toBe(false);
    expect(st.track).not.toBe(first);
    expect(st.rate).toBe(1);
    expect(r.media.els.at(-1)!.playbackRate).toBe(1);
    expect(r.media.els.at(-1)!.paused).toBe(false);
  });

  it('dispose releases every stream and the chain', async () => {
    const r = await rig();
    r.player.startMatch();
    r.player.startMatch();
    r.player.dispose();
    expect(r.media.els.every((e) => e.released && e.paused)).toBe(true);
    r.player.startMatch();
    r.player.update(clock(0));
    expect(r.media.els).toHaveLength(2);
  });
});
