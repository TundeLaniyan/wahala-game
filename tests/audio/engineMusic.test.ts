/** Engine-level behaviour of the music, ambience, spoken-Pidgin and volume layers on a fake AudioContext. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrefsStore } from '../../src/audio/prefs';
import type { StorageLike } from '../../src/audio/prefs';
import type { SpokenTrace, VoiceManifest } from '../../src/audio/pidgin';
import type { SimEvent } from '../../src/sim';
import { BASE, musicFiles, server } from './fakeServer';
import { FakeBuffer } from './fakeContext';
import { finishWarmup, makeRig, playState } from './helpers';

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

async function rig(files: Record<string, unknown> = allFiles(), storage = mem()) {
  const spoken: SpokenTrace[] = [];
  const prefs = createPrefsStore(() => storage);
  const r = makeRig({
    fetch: server(files).fetch,
    sampleBaseUrl: BASE,
    prefs,
    onSpeak: (t) => spoken.push(t),
  });
  r.ctx.decoded = (d) => new FakeBuffer(d.byteLength > 20000 ? 32000 : d.byteLength * 20, 44100, 2);
  await r.audio.unlock();
  await r.audio.whenMusicLoaded();
  await r.audio.whenVoicesLoaded();
  finishWarmup();
  return { ...r, prefs, spoken, storage };
}

const loopsOn = (r: { ctx: { sources: { loop: boolean; stoppedAt: number | null; buffer: unknown }[] } }) =>
  r.ctx.sources.filter((s) => s.loop && s.stoppedAt === null);

/** The four user-volume buses: gains that feed the master. Order: sfx, warn, crowd(ambience+voices), music. */
const busGains = (r: Awaited<ReturnType<typeof rig>>) => {
  const master = r.ctx.master();
  return r.ctx.gains.filter((g) => g.connections.includes(master)).map((g) => g.gain.value);
};

describe('music through the engine', () => {
  it('starts the menu music after unlock (the first user gesture) and not before', async () => {
    const files = allFiles();
    const r = makeRig({
      fetch: server(files).fetch,
      sampleBaseUrl: BASE,
      prefs: createPrefsStore(() => mem()),
    });
    expect(r.ctx.sources).toHaveLength(0); // nothing is created until a gesture unlocks audio
    expect(r.ctx.resumeCalls).toBe(0);
    await r.audio.unlock();
    await r.audio.whenMusicLoaded();
    expect(r.ctx.resumeCalls).toBeGreaterThan(0);
    expect(loopsOn(r).length).toBeGreaterThanOrEqual(1);
  });

  it('crossfades to the match loop on startMusic, brings the menu music back on stopMusic', async () => {
    const r = await rig();
    const menu = loopsOn(r)[0]!;
    r.audio.startMusic();
    expect(loopsOn(r).filter((s) => s !== menu).length).toBeGreaterThanOrEqual(1);
    expect((menu as { stoppedAt: number | null }).stoppedAt).not.toBeNull();
    r.audio.stopMusic();
    // a fresh source over the very same menu buffer is running again
    expect(loopsOn(r).some((s) => s !== menu && s.buffer === (menu as { buffer: unknown }).buffer)).toBe(
      true,
    );
    expect(r.errors).toEqual([]);
  });

  it('remembers startMusic() requested before unlock', async () => {
    const r = makeRig({
      fetch: server(allFiles()).fetch,
      sampleBaseUrl: BASE,
      prefs: createPrefsStore(() => mem()),
    });
    r.ctx.decoded = (d) => new FakeBuffer(d.byteLength > 20000 ? 32000 : 5000, 44100, 2);
    r.audio.startMusic();
    await r.audio.unlock();
    await r.audio.whenMusicLoaded();
    // match loop + tension stem (silent) are what runs; the menu loop was never started
    expect(r.ctx.sources.filter((s) => s.loop).length).toBeGreaterThanOrEqual(2);
  });

  it('fades the tension stem in for the final stretch (intensity 1) and out again', async () => {
    const r = await rig();
    r.audio.startMusic();
    const before = r.ctx.gains.reduce((n, g) => n + g.gain.targets.length, 0);
    r.audio.setIntensity(1);
    const after = r.ctx.gains.reduce((n, g) => n + g.gain.targets.length, 0);
    expect(after).toBeGreaterThan(before);
    expect(r.ctx.gains.some((g) => g.gain.targets.some((t) => Math.abs(t - 0.9) < 1e-9))).toBe(true); // TENSION_GAIN
    r.audio.setIntensity(0.2);
    expect(r.errors).toEqual([]);
  });

  it('plays the win / lose / draw sting when the match ends', async () => {
    for (const [winnerId, humanIsZero] of [
      [0, true],
      [1, true],
    ] as const) {
      const r = await rig();
      r.audio.startMusic();
      const s = playState(2);
      s.players[1]!.isBot = true;
      const n = r.ctx.sources.length;
      r.audio.handleEvents([{ type: 'matchEnded', result: { kind: 'win', winnerId } }], s);
      // decoded music files are 32000 frames in this fixture; synthesised sounds never are
      const stings = r.ctx.sources
        .slice(n)
        .filter((x) => !x.loop && (x.buffer as FakeBuffer | null)?.length === 32000);
      expect(stings, `winner ${winnerId} human0=${String(humanIsZero)}`).toHaveLength(1);
    }
    const d = await rig();
    d.audio.startMusic();
    const n = d.ctx.sources.length;
    d.audio.handleEvents([{ type: 'matchEnded', result: { kind: 'draw', reason: 'timeout' } }], playState(2));
    expect(
      d.ctx.sources.slice(n).filter((x) => !x.loop && (x.buffer as FakeBuffer | null)?.length === 32000),
    ).toHaveLength(1);
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
    r.prefs.set({ music: 0.45, ambience: 0 });
    const a = busGains(r);
    expect(a[2]).toBe(0);
    expect([a[0], a[1], a[3]]).toEqual([base[0], base[1], base[3]]);
    r.prefs.set({ ambience: 0.65, sfx: 0 });
    const s = busGains(r);
    expect([s[0], s[1]]).toEqual([0, 0]);
    expect([s[2], s[3]]).toEqual([base[2], base[3]]);
    r.prefs.set({ sfx: 0.85, master: 0.2 });
    expect(r.ctx.master().gain.value).toBeCloseTo(0.2);
    expect(busGains(r).slice(1, 4)).toEqual(base.slice(1, 4)); // master does not change the bus levels
  });

  it('starts at the requested defaults (master 80, music 45, ambience 65, effects 85)', async () => {
    const r = await rig();
    expect(r.ctx.master().gain.value).toBeCloseTo(0.8);
    const [sfx, , crowd, music] = busGains(r) as [number, number, number, number];
    expect(sfx / 0.62).toBeCloseTo(0.85, 5);
    expect(crowd / 0.8).toBeCloseTo(0.65, 5);
    expect(music / 1.3).toBeCloseTo(0.45, 5);
  });

  it('applies saved preferences when the engine starts (remembered between visits)', async () => {
    const storage = mem();
    createPrefsStore(() => storage).set({ master: 0.3, music: 0.9, ambience: 0.2, sfx: 0.5 });
    const r = await rig(allFiles(), storage); // a fresh store over the same storage = a later visit
    expect(r.ctx.master().gain.value).toBeCloseTo(0.3);
    const [sfx, , crowd, music] = busGains(r) as [number, number, number, number];
    expect(sfx / 0.62).toBeCloseTo(0.5, 5);
    expect(crowd / 0.8).toBeCloseTo(0.2, 5);
    expect(music / 1.3).toBeCloseTo(0.9, 5);
  });

  it('mute silences the master without touching the saved volumes, and volume edits while muted stay muted', async () => {
    const r = await rig();
    r.audio.setMuted(true);
    expect(r.ctx.master().gain.value).toBe(0);
    r.prefs.set({ master: 1 });
    expect(r.ctx.master().gain.value).toBe(0);
    r.audio.setMuted(false);
    expect(r.ctx.master().gain.value).toBe(1);
    expect(r.prefs.get().music).toBe(0.45);
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

  it('a decode failure for every file is reported without throwing', async () => {
    const r = makeRig({
      fetch: server(allFiles()).fetch,
      sampleBaseUrl: BASE,
      prefs: createPrefsStore(() => mem()),
    });
    r.ctx.decoded = null;
    await r.audio.unlock();
    expect((await r.audio.whenMusicLoaded()).loaded).toEqual([]);
    expect((await r.audio.whenVoicesLoaded()).loadedPacks).toEqual([]);
    r.audio.startMusic();
    r.audio.handleEvents([], playState());
    expect(r.errors).toEqual([]);
  });
});
