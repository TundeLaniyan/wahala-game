/** Engine-level behaviour of the music, ambience, spoken-Pidgin and volume layers on a fake AudioContext. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrefsStore } from '../../src/audio/prefs';
import type { StorageLike } from '../../src/audio/prefs';
import type { SpokenTrace, VoiceManifest } from '../../src/audio/pidgin';
import type { SimEvent } from '../../src/sim';
import { createRand } from '../../src/audio/rng';
import { BASE, TRACK_IDS, musicFiles, musicManifest, server } from './fakeServer';
import { FakeBuffer } from './fakeContext';
import type { FakeGain } from './fakeContext';
import { mediaFactory, trackOf } from './fakeMedia';
import { finishWarmup, makeRig, playState } from './helpers';
import { MUSIC_BASE, warnLevel } from '../../src/audio/buses';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const mem = (): StorageLike & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

function voiceManifest(): VoiceManifest {
  const clips: VoiceManifest['clips'] = [];
  let t = 0;
  for (const cat of [
    'match_start',
    'escape',
    'elim_bot',
    'elim_human',
    'danfo',
    'taxi',
    'keke',
    'win',
    'lose',
    'draw',
    'final',
    'vehicle_destroyed',
    'okada_save',
    'fuse',
  ]) {
    for (let i = 0; i < 3; i++) {
      clips.push({
        id: `r_${cat}_${i}`,
        pack: 'react',
        category: cat,
        text: cat,
        voice: `v${i}`,
        start: t,
        dur: 1.2,
      });
      t += 1.5;
    }
  }
  clips.push({ id: 'a_x_0', pack: 'ambient', category: 'x', text: 'x', voice: 'v9', start: 0, dur: 1.5 });
  return {
    version: 1,
    synthetic: true,
    packs: { react: { files: { ogg: 'react.ogg' } }, ambient: { files: { ogg: 'ambient.ogg' } } },
    clips,
    scenes: [{ id: 'x', kind: 'talk', clips: ['a_x_0'] }],
  };
}

function allFiles(): Record<string, unknown> {
  return {
    ...musicFiles(),
    [`${BASE}voices/voices.json`]: voiceManifest(),
    [`${BASE}voices/react.ogg`]: 'x'.repeat(5000),
    [`${BASE}voices/ambient.ogg`]: 'x'.repeat(5000),
  };
}

async function rig(files: Record<string, unknown> = allFiles(), storage = mem(), pitch = true) {
  const spoken: SpokenTrace[] = [];
  const prefs = createPrefsStore(() => storage);
  const media = mediaFactory({ pitch, broken: (src) => files[src] === undefined });
  const r = makeRig({
    fetch: server(files).fetch,
    sampleBaseUrl: BASE,
    prefs,
    onSpeak: (t) => spoken.push(t),
    createMediaElement: media.create,
    musicRand: createRand(42),
  });
  r.ctx.decoded = (d) => new FakeBuffer(d.byteLength > 20000 ? 32000 : d.byteLength * 20, 44100, 2);
  await r.audio.unlock();
  await r.audio.whenMusicLoaded();
  await r.audio.whenVoicesLoaded();
  finishWarmup();
  return { ...r, prefs, spoken, storage, media };
}

/** A sandbox state on the game clock: `remaining` seconds of play left (or ended). */
function clockState(remaining: number, phase: 'playing' | 'ended' = 'playing') {
  const s = playState(2);
  s.players[1]!.isBot = true;
  s.match.phase = phase;
  s.match.playTicks = Math.round(s.config.match.durationTicks - remaining * 60);
  return s;
}
const streaming = (r: Awaited<ReturnType<typeof rig>>) => r.media.sounding().map(trackOf);

const loopsOn = (r: { ctx: { sources: { loop: boolean; stoppedAt: number | null; buffer: unknown }[] } }) =>
  r.ctx.sources.filter((s) => s.loop && s.stoppedAt === null);

/** The four user-volume buses: gains that feed the master. Order: sfx, warn, crowd(ambience+voices), music. */
const busGains = (r: Awaited<ReturnType<typeof rig>>) => {
  const master = r.ctx.master();
  return r.ctx.gains.filter((g) => g.connections.includes(master)).map((g) => g.gain.value);
};

describe('music through the engine', () => {
  it('streams nothing before the first gesture; after unlock the menus are silent (no menu playlist)', async () => {
    const media = mediaFactory();
    const r = makeRig({
      fetch: server(allFiles()).fetch,
      sampleBaseUrl: BASE,
      prefs: createPrefsStore(() => mem()),
      createMediaElement: media.create,
    });
    r.audio.startMusic('danfoBusPark');
    expect(media.els).toHaveLength(0); // nothing is created until a gesture unlocks audio
    expect(r.ctx.resumeCalls).toBe(0);
    await r.audio.unlock();
    await r.audio.whenMusicLoaded();
    // the match requested before unlock was remembered
    expect(media.sounding()).toHaveLength(1);
    expect(r.audio.musicStatus().arenaId).toBe('danfoBusPark');
    r.audio.stopMusic();
    vi.advanceTimersByTime(3000);
    expect(media.sounding()).toHaveLength(0); // empty menu playlist: the title screen is silent
  });

  it('each match plays a track from the arena playlist, never the previous one; quitting stops it', async () => {
    const r = await rig();
    await expect(r.audio.whenMusicLoaded()).resolves.toMatchObject({ loaded: TRACK_IDS });
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      r.audio.startMusic(['danfoBusPark', 'balogunMarket', 'lekkiRoadworks'][i % 3]);
      vi.advanceTimersByTime(2000);
      expect(streaming(r)).toHaveLength(1);
      seen.push(streaming(r)[0]!);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    r.audio.stopMusic(); // quit to the title screen
    vi.advanceTimersByTime(3000);
    expect(streaming(r)).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('only the approved files that are present play; missing ones are skipped', async () => {
    const files = { ...allFiles() };
    for (const id of TRACK_IDS.slice(0, 8)) delete files[`${BASE}music/${id}.mp3`];
    const r = await rig(files);
    expect((await r.audio.whenMusicLoaded()).loaded).toEqual(['t8', 't9']);
    for (let i = 0; i < 6; i++) r.audio.startMusic('lekkiRoadworks');
    expect(new Set(r.media.els.map(trackOf))).toEqual(new Set(['t8', 't9']));
  });

  it('handleEvents drives the endgame from the game clock, also while muted', async () => {
    const r = await rig();
    r.audio.startMusic('danfoBusPark');
    const el = r.media.els[0]!;
    r.audio.handleEvents([], clockState(45));
    expect(el.playbackRate).toBe(1);
    r.audio.handleEvents([], clockState(30));
    expect(el.playbackRate).toBe(1);
    r.audio.handleEvents([], clockState(15));
    expect(el.playbackRate).toBeCloseTo(1.045, 3);
    r.audio.setMuted(true);
    r.audio.handleEvents([], clockState(0));
    expect(el.playbackRate).toBeCloseTo(1.09, 3);
    expect(el.preservesPitch).toBe(true);
    expect(r.audio.musicStatus().urgency).toBe(1);
    r.audio.setMuted(false);
    expect(r.errors).toEqual([]);
  });

  it('match end eases the tempo back; a rematch starts a different track at 1.0', async () => {
    const r = await rig();
    r.audio.startMusic('balogunMarket');
    const first = r.media.els[0]!;
    r.audio.handleEvents([], clockState(0));
    for (let i = 0; i < 200; i++) {
      r.ctx.advance(1 / 60);
      r.audio.handleEvents([], clockState(0, 'ended'));
    }
    expect(first.playbackRate).toBe(1);
    r.audio.startMusic('balogunMarket'); // rematch
    const next = r.media.els.at(-1)!;
    expect(trackOf(next)).not.toBe(trackOf(first));
    expect(next.playbackRate).toBe(1);
    expect(r.audio.musicStatus().rate).toBe(1);
  });

  it('pause pauses the stream and resume continues it; quitting from the pause menu cleans up', async () => {
    const r = await rig();
    r.audio.startMusic('danfoBusPark');
    const el = r.media.els[0]!;
    r.audio.setPaused(true);
    vi.advanceTimersByTime(300);
    expect(el.paused).toBe(true);
    r.audio.handleEvents([], clockState(20)); // the paused frame loop keeps calling in
    expect(el.paused).toBe(true);
    r.audio.setPaused(false);
    expect(el.paused).toBe(false);
    r.audio.setPaused(true);
    r.audio.stopMusic(); // quit to title while paused
    vi.advanceTimersByTime(3000);
    expect(r.audio.musicStatus().paused).toBe(false);
    expect(el.released).toBe(true);
    expect(streaming(r)).toEqual([]);
  });

  it('the music sits behind the music duck: blasts still duck it, effects and warnings are untouched by the escalation', async () => {
    const r = await rig();
    r.audio.startMusic('danfoBusPark');
    const master = r.ctx.master();
    const busesBefore = r.ctx.gains.filter((g) => g.connections.includes(master)).map((g) => g.gain.value);
    r.audio.handleEvents([], clockState(0)); // full escalation
    const busesAfter = r.ctx.gains.filter((g) => g.connections.includes(master)).map((g) => g.gain.value);
    expect(busesAfter).toEqual(busesBefore); // sfx, warn, crowd and music bus levels unchanged
    // element -> deck gain -> tone in -> shelf -> punch -> trim -> pause gain -> music duck -> music bus -> master
    const path: unknown[] = [r.ctx.mediaSources[0]];
    for (let i = 0; i < 9; i++) path.push((path.at(-1) as FakeGain).connections[0]);
    expect(path[9]).toBe(master);
    const musicDuck = path[7] as FakeGain;
    r.audio.handleEvents(
      [{ type: 'generatorExploded', generatorId: 1, ownerId: 0, x: 3, y: 3, eventId: 1, range: 8 }], // a big blast
      clockState(0),
    );
    expect(musicDuck!.gain.targets).toContain(0.45); // DUCK.blast.music
  });

  it('an optional menu playlist plays on the title screen', async () => {
    const files = musicFiles(TRACK_IDS, `${BASE}music/`, musicManifest(TRACK_IDS, { menu: ['t3'] }));
    const r = await rig(files);
    expect(streaming(r)).toEqual(['t3']);
    r.audio.startMusic('danfoBusPark');
    vi.advanceTimersByTime(3000);
    expect(streaming(r)).not.toContain('t3');
    r.audio.stopMusic();
    vi.advanceTimersByTime(3000);
    expect(streaming(r)).toEqual(['t3']);
  });
});

describe('independent persistent volumes', () => {
  it('music, ambience/voices, effects and master move independently', async () => {
    const r = await rig();
    const base = busGains(r);
    expect(base).toHaveLength(4);
    r.prefs.set({ music: 0 });
    const m = busGains(r);
    expect(m[3]).toBe(0);
    expect(m.slice(0, 3)).toEqual(base.slice(0, 3)); // sfx, warn, crowd untouched
    r.prefs.set({ music: 0.9, ambience: 0 });
    const a = busGains(r);
    expect(a[2]).toBe(0);
    expect([a[0], a[1], a[3]]).toEqual([base[0], base[1], base[3]]);
    r.prefs.set({ ambience: 0.45, sfx: 0 });
    const s = busGains(r);
    expect([s[0], s[1]]).toEqual([0, 0]);
    expect([s[2], s[3]]).toEqual([base[2], base[3]]);
    r.prefs.set({ sfx: 0.5, master: 0.2 });
    expect(r.ctx.master().gain.value).toBeCloseTo(0.2);
    expect(busGains(r).slice(1, 4)).toEqual(base.slice(1, 4)); // master does not change the bus levels
  });

  it('starts at the music-first defaults (master 85, music 90, ambience 45, effects 50)', async () => {
    const r = await rig();
    expect(r.ctx.master().gain.value).toBeCloseTo(0.85);
    const [sfx, warn, crowd, music] = busGains(r) as [number, number, number, number];
    expect(sfx / 0.62).toBeCloseTo(0.5, 5);
    expect(warn).toBeCloseTo(warnLevel(0.5), 5);
    expect(crowd / 0.8).toBeCloseTo(0.45, 5);
    expect(music / MUSIC_BASE).toBeCloseTo(0.9, 5);
  });

  it('the louder default comes from the slider only: the music bus is unity, never boosted twice', async () => {
    expect(MUSIC_BASE).toBe(1);
    const r = await rig();
    r.prefs.set({ music: 1 });
    expect(busGains(r)[3]).toBe(1); // a full slider plays the levelled (-14 LUFS) track as it is
  });

  it('warnings stay on a gentler curve than effects so a quieter effects mix never hides them', () => {
    expect(warnLevel(0)).toBe(0);
    expect(warnLevel(1)).toBeCloseTo(0.8);
    // at the 50 % default the warnings lose 1.6 dB against the old 85 % default, the effects 4.6 dB
    expect(20 * Math.log10(warnLevel(0.5) / (0.85 * 0.8))).toBeGreaterThan(-1.7); // old linear warn bus
    expect(20 * Math.log10(0.5 / 0.85)).toBeLessThan(-4.5);
  });

  it('applies saved preferences when the engine starts (remembered between visits)', async () => {
    const storage = mem();
    createPrefsStore(() => storage).set({ master: 0.3, music: 0.9, ambience: 0.2, sfx: 0.5 });
    const r = await rig(allFiles(), storage); // a fresh store over the same storage = a later visit
    expect(r.ctx.master().gain.value).toBeCloseTo(0.3);
    const [sfx, , crowd, music] = busGains(r) as [number, number, number, number];
    expect(sfx / 0.62).toBeCloseTo(0.5, 5);
    expect(crowd / 0.8).toBeCloseTo(0.2, 5);
    expect(music / MUSIC_BASE).toBeCloseTo(0.9, 5);
  });

  it('mute silences the master without touching the saved volumes, and volume edits while muted stay muted', async () => {
    const r = await rig();
    r.audio.setMuted(true);
    expect(r.ctx.master().gain.value).toBe(0);
    r.prefs.set({ master: 1 });
    expect(r.ctx.master().gain.value).toBe(0);
    r.audio.setMuted(false);
    expect(r.ctx.master().gain.value).toBe(1);
    expect(r.prefs.get().music).toBe(0.9);
  });

  it('the legacy setVolumes() cannot override saved preferences', async () => {
    const r = await rig();
    const before = busGains(r);
    r.audio.setVolumes({ master: 0, music: 0, sfx: 0 });
    expect(busGains(r)).toEqual(before);
  });
});

describe('spoken Pidgin through the engine', () => {
  const state = () => {
    const s = playState(3);
    s.players.forEach((p, i) => (p.isBot = i !== 0));
    return s;
  };

  it('reacts to gameplay with lines from the right category', async () => {
    const r = await rig();
    r.audio.startMusic();
    r.ctx.advance(5);
    r.audio.handleEvents([{ type: 'vehicleLaunched', vehicleId: 1, kind: 'taxi', ownerId: 1 }], state());
    r.ctx.advance(12);
    r.audio.handleEvents([{ type: 'matchEnded', result: { kind: 'win', winnerId: 0 } }], state());
    expect(r.spoken.filter((t) => !t.ambient).map((t) => t.category)).toEqual(['taxi', 'win']);
    expect(r.errors).toEqual([]);
  });

  it('does not speak twice for the same trigger batch fed twice (no overlapping duplicates)', async () => {
    const r = await rig();
    r.audio.startMusic();
    r.ctx.advance(5);
    const ev: SimEvent[] = [
      { type: 'playerEliminated', playerId: 1, cause: { kind: 'flame', ownerId: 0, eventId: 1 }, x: 3, y: 3 },
    ];
    r.audio.handleEvents(ev, state());
    r.audio.handleEvents(ev, state());
    r.audio.handleEvents(ev, state());
    expect(r.spoken.filter((t) => !t.ambient)).toHaveLength(1);
  });

  it('is switched off by the preference, and back on', async () => {
    const r = await rig();
    r.audio.startMusic();
    r.prefs.set({ voices: false });
    r.ctx.advance(5);
    r.audio.handleEvents([{ type: 'vehicleLaunched', vehicleId: 1, kind: 'danfo', ownerId: 1 }], state());
    expect(r.spoken).toEqual([]);
    r.prefs.set({ voices: true });
    r.ctx.advance(12);
    r.audio.handleEvents([{ type: 'vehicleLaunched', vehicleId: 2, kind: 'keke', ownerId: 1 }], state());
    expect(r.spoken.map((t) => t.category)).toEqual(['keke']);
  });

  it('ambient street chatter runs under the match, and stops when the match is left', async () => {
    const r = await rig();
    r.audio.startMusic();
    for (let i = 0; i < 40; i++) {
      r.ctx.advance(1);
      r.audio.handleEvents([], state());
    }
    expect(r.spoken.some((t) => t.ambient)).toBe(true);
    r.audio.stopMusic();
    const n = r.spoken.length;
    for (let i = 0; i < 40; i++) {
      r.ctx.advance(1);
      r.audio.handleEvents([], state());
    }
    expect(r.spoken.length).toBe(n);
  });

  it('is silent while muted', async () => {
    const r = await rig();
    r.audio.startMusic();
    r.audio.setMuted(true);
    r.ctx.advance(5);
    r.audio.handleEvents([{ type: 'vehicleLaunched', vehicleId: 1, kind: 'danfo', ownerId: 1 }], state());
    expect(r.spoken).toEqual([]);
  });
});

describe('graceful fallback when optional assets are unavailable', () => {
  it('no music/voice files at all: no errors, effects and ambience synthesis still work', async () => {
    const r = await rig({});
    r.audio.startMusic();
    r.audio.handleEvents(
      [{ type: 'generatorExploded', generatorId: 1, ownerId: 0, x: 3, y: 3, eventId: 1, range: 2 }],
      playState(),
    );
    expect(r.ids().some((id) => id.startsWith('explosion_'))).toBe(true);
    expect(r.spoken).toEqual([]);
    expect(loopsOn(r).length).toBeGreaterThan(0); // the synthesised ambience bed
    expect(r.errors).toEqual([]);
  });

  it('music present but voices missing: music plays, game is quiet of speech, no errors', async () => {
    const files = musicFiles();
    const r = await rig(files);
    r.audio.startMusic();
    r.ctx.advance(5);
    r.audio.handleEvents([{ type: 'vehicleLaunched', vehicleId: 1, kind: 'danfo', ownerId: 1 }], playState());
    expect(r.spoken).toEqual([]);
    expect(loopsOn(r).length).toBeGreaterThan(0);
    expect(r.errors).toEqual([]);
  });

  it('voices present but music missing: voices still speak', async () => {
    const files = allFiles();
    for (const k of Object.keys(files)) if (k.includes('/music/')) delete files[k];
    const r = await rig(files);
    r.audio.startMusic();
    r.ctx.advance(5);
    r.audio.handleEvents([{ type: 'vehicleLaunched', vehicleId: 1, kind: 'danfo', ownerId: 1 }], playState());
    expect(r.spoken.map((t) => t.category)).toEqual(['danfo']);
  });

  it('a decode failure for every file is reported without throwing (music streams, it is not decoded)', async () => {
    const r = makeRig({
      fetch: server(allFiles()).fetch,
      sampleBaseUrl: BASE,
      prefs: createPrefsStore(() => mem()),
    });
    r.ctx.decoded = null;
    await r.audio.unlock();
    await r.audio.whenMusicLoaded();
    expect((await r.audio.whenVoicesLoaded()).loadedPacks).toEqual([]);
    r.audio.startMusic();
    r.audio.handleEvents([], playState());
    expect(r.errors).toEqual([]);
  });
});
