import { describe, expect, it } from 'vitest';
import { createBuses } from '../../src/audio/buses';
import {
  AMBIENT_LINE_REST,
  DEDUPE_S,
  GLOBAL_SPACING,
  VOICE_TRIGGERS,
  createPidginVoices,
  lineInScene,
  parseRecorded,
  parseVoiceCatalogue,
  registerLines,
} from '../../src/audio/pidgin';
import type { SpokenTrace } from '../../src/audio/pidgin';
import { createVoicePool } from '../../src/audio/voices';
import { BASE, TEST_LINES, server, voiceCatalogue, voiceFiles } from './fakeServer';
import { FakeBuffer, FakeContext } from './fakeContext';
import type { FakeGain } from './fakeContext';

const VOL = { master: 0.85, music: 0.9, ambience: 0.45, sfx: 0.5 };

async function rig(
  files: Record<string, unknown> = voiceFiles(),
  scene: string | null = 'danfoBusPark',
  seed = 1,
) {
  const ctx = new FakeContext();
  const buses = createBuses(ctx, VOL, false);
  const pool = createVoicePool(ctx);
  const spoken: SpokenTrace[] = [];
  const errors: unknown[] = [];
  const srv = server(files);
  const voices = createPidginVoices(ctx, buses, pool, {
    fetch: srv.fetch,
    decode: (d) => Promise.resolve(new FakeBuffer(d.byteLength * 10, 24000, 1)),
    baseUrl: BASE,
    seed,
    onSpeak: (t) => spoken.push(t),
    onError: (e) => errors.push(e),
  });
  const report = await voices.load();
  voices.setScene(scene);
  await voices.whenSceneLoaded();
  voices.reset(0);
  return { ctx, buses, voices, spoken, report, hits: srv.hits, errors };
}

/** True when audio from `node` reaches `target` through the connection graph. */
function reaches(node: unknown, target: unknown, seen = new Set<unknown>()): boolean {
  if (node === target) return true;
  if (seen.has(node)) return false;
  seen.add(node);
  const next = (node as { connections?: unknown[] }).connections ?? [];
  return next.some((n) => reaches(n, target, seen));
}

const fg = (s: SpokenTrace[]) => s.filter((t) => !t.ambient);

describe('voice registry (manifests)', () => {
  it('registers only lines that are in the catalogue, have an approved licensed clip, are not rejected and use a known trigger', async () => {
    const { report } = await rig();
    expect(report.registered.sort()).toEqual(
      TEST_LINES.map((l) => l.id)
        .filter((id) => !['rejected_1', 'future_1', 'okada_1'].includes(id))
        .sort(),
    );
    expect(report.triggers).not.toContain('ON_OKADA_SHIELD_SAVE'); // planned, no clip yet
    const reasons = Object.fromEntries(report.ignored.map((i) => [i.id, i.reason]));
    expect(reasons.rejected_1).toBe('rejected line');
    expect(reasons.future_1).toMatch(/unknown trigger/);
    expect(reasons.esc_9).toMatch(/licence/);
    expect(reasons.esc_8).toMatch(/file name/);
  });

  it('parsers reject junk safely', () => {
    expect(parseVoiceCatalogue(null).catalogue.lines).toEqual([]);
    expect(
      parseVoiceCatalogue({ lines: [{ id: '../x', trigger: 'T', text: 't' }] }).ignored[0]!.reason,
    ).toMatch(/unsafe/);
    expect(parseRecorded({ clips: [{ id: 'a', file: 'a.exe', license: 'x' }] }).clips).toEqual([]);
    const cat = parseVoiceCatalogue(voiceCatalogue()).catalogue;
    expect(registerLines(cat, []).lines).toEqual([]);
    const dup = parseRecorded({
      clips: [
        { id: 'a', file: 'a.mp3', license: 'x' },
        { id: 'a', file: 'b.mp3', license: 'x' },
      ],
    });
    expect(dup.clips).toHaveLength(1);
  });

  it('zones: lines are heard everywhere (all) or only on the arenas listed for their zone', () => {
    const zones = { market: ['balogunMarket'] };
    expect(lineInScene({ zone: 'all' }, zones, null)).toBe(true);
    expect(lineInScene({ zone: 'market' }, zones, 'balogunMarket')).toBe(true);
    expect(lineInScene({ zone: 'market' }, zones, 'danfoBusPark')).toBe(false);
    expect(lineInScene({ zone: 'market' }, zones, null)).toBe(false);
  });

  it('every trigger name is unique', () => {
    expect(new Set(VOICE_TRIGGERS).size).toBe(VOICE_TRIGGERS.length);
  });
});

describe('per-scene loading', () => {
  it('load() reads only the two manifests; clips are fetched only for the scene, most urgent first', async () => {
    const ctx = new FakeContext();
    const buses = createBuses(ctx, VOL, false);
    const srv = server(voiceFiles());
    const voices = createPidginVoices(ctx, buses, createVoicePool(ctx), {
      fetch: srv.fetch,
      decode: (d) => Promise.resolve(new FakeBuffer(d.byteLength * 10, 24000, 1)),
      baseUrl: BASE,
    });
    await voices.load();
    expect(srv.hits.sort()).toEqual([`${BASE}voices/recorded.json`, `${BASE}voices/voices.json`]);
    voices.setScene('danfoBusPark');
    await voices.whenSceneLoaded();
    const clips = srv.hits.filter((h) => h.includes('/recorded/')).map((h) => h.split('/').pop());
    expect(clips).toContain('park_1.mp3');
    expect(clips).not.toContain('market_1.mp3'); // another zone's conversation is never downloaded here
    expect(clips).not.toContain('rejected_1.mp3');
    expect(clips).not.toContain('future_1.mp3');
    expect(clips.at(-1)).toBe('park_1.mp3'); // background talk last, priority-1 lines first
    expect(clips.slice(0, 2).every((c) => /^(blast|danfo|elim|final|run|win)_/.test(c!))).toBe(true);
    // entering the market later fetches only what is new there
    srv.hits.length = 0;
    voices.setScene('balogunMarket');
    await voices.whenSceneLoaded();
    expect(srv.hits).toEqual([`${BASE}voices/recorded/market_1.mp3`]);
  });

  it('a missing or broken clip stays silent, is never requested again and does not affect the others', async () => {
    const r = await rig(voiceFiles(TEST_LINES, { without: ['esc_1', 'esc_2', 'esc_3', 'run_2'] }));
    expect(
      r.voices
        .status()
        .failed.map((f) => f.id)
        .sort(),
    ).toEqual(['esc_1', 'esc_2', 'esc_3', 'run_2']);
    expect(r.voices.has('ON_PLAYER_NARROW_ESCAPE')).toBe(false);
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(false);
    expect(r.voices.say('ON_GENERATOR_CRITICAL_PROXIMITY', { force: true })).toBe(true);
    expect(r.spoken[0]!.clipId).not.toBe('run_2');
    const before = r.hits.length;
    r.voices.setScene('danfoBusPark');
    await r.voices.whenSceneLoaded();
    expect(r.hits.length).toBe(before); // nothing re-requested
  });

  it('without manifests or a fetcher everything is a silent no-op', async () => {
    const r = await rig({});
    expect(r.voices.ready).toBe(false);
    expect(r.voices.say('ON_PLAYER_ELIMINATED', { force: true })).toBe(false);
    r.voices.update(30, 1);
    expect(r.spoken).toEqual([]);
    const ctx = new FakeContext();
    const v = createPidginVoices(ctx, createBuses(ctx, VOL, false), createVoicePool(ctx), {
      fetch: null,
      decode: () => Promise.reject(new Error('x')),
    });
    expect((await v.load()).registered).toEqual([]);
    await v.whenSceneLoaded();
  });

  it('back on the menus (scene null) cached clips never speak', async () => {
    const r = await rig();
    r.voices.setScene(null);
    expect(r.voices.say('ON_PLAYER_ELIMINATED', { force: true })).toBe(false);
    r.voices.update(60, 1);
    expect(r.spoken).toEqual([]);
    r.voices.setScene('danfoBusPark');
    expect(r.voices.say('ON_PLAYER_ELIMINATED', { force: true })).toBe(true);
  });

  it('nothing is fetched on the title screen (scene null)', async () => {
    const r = await rig(voiceFiles(), null);
    expect(r.hits.filter((h) => h.includes('/recorded/'))).toEqual([]);
  });
});

describe('voice director', () => {
  it('plays a line of the requested trigger on the voice bus, from the start, at its own length', async () => {
    const r = await rig();
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(true);
    const t = r.spoken[0]!;
    expect(t.trigger).toBe('ON_PLAYER_NARROW_ESCAPE');
    expect(t.clipId).toMatch(/^esc_/);
    expect(t.text).toBe(`text of ${t.clipId}`);
    expect(t.duration).toBeCloseTo(1.5, 5);
    const src = r.ctx.sources.at(-1)!;
    expect(src.startOffset).toBe(0);
    expect(reaches(src, r.buses.input('voice'))).toBe(true);
    expect(reaches(src, r.buses.input('react'))).toBe(false); // no warning-band notch on speech
  });

  it('falls back along the trigger list and stays silent for a trigger without any clip', async () => {
    const r = await rig();
    expect(r.voices.has('ON_OKADA_SHIELD_SAVE')).toBe(false);
    expect(r.voices.say('ON_OKADA_SHIELD_SAVE', { force: true })).toBe(false);
    expect(r.voices.say(['ON_PLAYER_COMEDIC_ELIMINATION', 'ON_PLAYER_ELIMINATED'])).toBe(true);
    expect(r.spoken[0]!.trigger).toBe('ON_PLAYER_ELIMINATED');
  });

  it("rests a trigger for the line's manifest cooldown, and keeps the global spacing", async () => {
    const r = await rig();
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(true); // cooldown 5 s
    r.ctx.advance(GLOBAL_SPACING + 0.1);
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(false); // 4.1 s < 5 s
    expect(r.voices.say('ON_KEKE_HAZARD_SPAWN')).toBe(true); // another trigger is free
    r.ctx.advance(2);
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(false); // global spacing after the keke line
    r.ctx.advance(GLOBAL_SPACING);
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(true);
  });

  it('never talks over a line; a forced line of equal priority waits', async () => {
    const r = await rig();
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(true); // priority 2
    r.ctx.advance(0.5);
    expect(r.voices.say('ON_KEKE_HAZARD_SPAWN', { force: true })).toBe(false); // priority 2 too
    expect(fg(r.spoken)).toHaveLength(1);
  });

  it('an urgent warning cuts a less important line short and ducks the music deeper', async () => {
    const r = await rig();
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(true);
    const escape = r.ctx.sources.at(-1)!;
    r.ctx.advance(0.4);
    const duck = r.ctx.gains.find(
      (g) => reaches(g, r.buses.input('music')) && g === r.buses.input('music'),
    ) as FakeGain | undefined;
    expect(r.voices.say('ON_GENERATOR_CRITICAL_PROXIMITY', { force: true })).toBe(true);
    const warn = r.spoken.at(-1)!;
    expect(warn.interrupted).toMatch(/^esc_/);
    expect(warn.urgent).toBe(true);
    expect(escape.stoppedAt).not.toBeNull();
    expect(escape.stoppedAt!).toBeLessThan(0.4 + 0.2);
    expect(duck!.gain.targets).toContain(0.4); // urgentSpeech: music to 0.4
    expect(r.voices.status().speaking).toBe(warn.clipId);
  });

  it('uses every line of a trigger before repeating and avoids the previous speaker', async () => {
    const r = await rig();
    for (let i = 0; i < 3; i++) {
      r.ctx.advance(6);
      expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(true);
    }
    const ids = r.spoken.map((s) => s.clipId);
    expect(new Set(ids).size).toBe(3);
    for (let i = 1; i < r.spoken.length; i++) expect(r.spoken[i]!.speaker).not.toBe(r.spoken[i - 1]!.speaker);
  });

  it('a refused request does not use up a line of the shuffle bag', async () => {
    const r = await rig();
    expect(r.voices.say('ON_PLAYER_NARROW_ESCAPE')).toBe(true);
    for (let i = 0; i < 10; i++) r.voices.say('ON_PLAYER_ELIMINATED'); // all refused: a line is speaking
    r.ctx.advance(6);
    expect(r.voices.say('ON_PLAYER_ELIMINATED')).toBe(true);
    r.ctx.advance(6);
    expect(r.voices.say('ON_PLAYER_ELIMINATED')).toBe(true);
    const elims = r.spoken.filter((s) => s.trigger === 'ON_PLAYER_ELIMINATED').map((s) => s.clipId);
    expect(new Set(elims).size).toBe(2);
  });

  it('collapses duplicate triggers with the same key inside the dedupe window', async () => {
    const r = await rig();
    expect(r.voices.say('ON_PLAYER_ELIMINATED', { force: true, key: 'p1' })).toBe(true);
    r.ctx.advance(DEDUPE_S / 2);
    expect(r.voices.say('ON_PLAYER_ELIMINATED', { force: true, key: 'p1' })).toBe(false);
  });

  it('chance is a seeded dice roll; force bypasses it', async () => {
    const r = await rig();
    let spoke = 0;
    for (let i = 0; i < 40; i++) {
      r.ctx.advance(20);
      if (r.voices.say('ON_GENERATOR_DETONATE', { chance: 0.3 })) spoke++;
    }
    expect(spoke).toBeGreaterThan(3);
    expect(spoke).toBeLessThan(25);
    r.ctx.advance(20);
    expect(r.voices.say('ON_GENERATOR_DETONATE', { chance: 0, force: true })).toBe(true);
  });

  it('respects the on/off switch and a delayed start', async () => {
    const r = await rig();
    r.voices.setEnabled(false);
    expect(r.voices.say('ON_PLAYER_ELIMINATED', { force: true })).toBe(false);
    r.voices.setEnabled(true);
    expect(r.voices.say('ON_PLAYER_ELIMINATED', { force: true, delay: 0.5 })).toBe(true);
    expect(r.spoken[0]!.at).toBeCloseTo(0.5, 6);
    expect(r.spoken[0]!.delay).toBeCloseTo(0.5, 6);
    expect(r.ctx.sources.at(-1)!.startedAt).toBeCloseTo(0.5, 6);
  });

  it('switching voices off mid-line fades it out', async () => {
    const r = await rig();
    r.voices.say('ON_PLAYER_ELIMINATED', { force: true });
    r.ctx.advance(0.3);
    r.voices.setEnabled(false);
    expect(r.ctx.sources.at(-1)!.stoppedAt).toBeLessThan(0.6);
  });
});

describe('background conversations', () => {
  const run = (r: Awaited<ReturnType<typeof rig>>, seconds: number, intensity = 0.2) => {
    for (let i = 0; i < seconds * 4; i++) {
      r.ctx.advance(0.25);
      r.voices.update(r.ctx.currentTime, intensity);
    }
  };

  it("play only the arena's own zone, quietly on the ambience path, and not again within the rest time", async () => {
    const r = await rig();
    run(r, 120);
    const talk = r.spoken.filter((s) => s.ambient);
    expect(talk.length).toBeGreaterThanOrEqual(2);
    expect(talk.every((s) => s.clipId === 'park_1')).toBe(true);
    for (let i = 1; i < talk.length; i++)
      expect(talk[i]!.at - talk[i - 1]!.at).toBeGreaterThanOrEqual(AMBIENT_LINE_REST);
    const src = r.ctx.sources.find((s) => r.spoken.some((t) => t.ambient && t.at === s.startedAt))!;
    expect(reaches(src, r.buses.input('amb'))).toBe(true);
    expect(reaches(src, r.buses.input('voice'))).toBe(false);
    expect(talk[0]!.gain).toBeLessThan(1);
    expect(talk[0]!.urgent).toBe(false);
  });

  it('the market plays its own line; arenas outside both zones have no conversations', async () => {
    const market = await rig(voiceFiles(), 'balogunMarket');
    run(market, 60);
    expect(market.spoken.filter((s) => s.ambient).map((s) => s.clipId)).toContain('market_1');
    expect(market.spoken.some((s) => s.clipId === 'park_1')).toBe(false);
    const lekki = await rig(voiceFiles(), 'lekkiRoadworks');
    run(lekki, 60);
    expect(lekki.spoken.filter((s) => s.ambient)).toEqual([]);
  });

  it('never start while a foreground line speaks; an urgent line cuts a conversation', async () => {
    const r = await rig();
    run(r, 15);
    const talk = r.spoken.find((s) => s.ambient)!;
    expect(talk).toBeDefined();
    r.ctx.currentTime = talk.at + 0.2;
    expect(r.voices.say('ON_GENERATOR_CRITICAL_PROXIMITY', { force: true })).toBe(true);
    const ambientSrc = r.ctx.sources.find((s) => s.startedAt === talk.at)!;
    expect(ambientSrc.stoppedAt).not.toBeNull();
    const n = r.spoken.length;
    r.voices.update(r.ctx.currentTime + 0.5, 1);
    expect(r.spoken.length).toBe(n);
  });
});
