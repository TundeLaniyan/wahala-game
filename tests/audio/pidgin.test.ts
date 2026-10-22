import { describe, expect, it } from 'vitest';
import { createBuses } from '../../src/audio/buses';
import {
  AMBIENT_HOLD_S,
  CATEGORY_COOLDOWN,
  DEDUPE_S,
  FORCE_SPACING,
  GLOBAL_SPACING,
  RECENT_LINE_S,
  createPidginVoices,
} from '../../src/audio/pidgin';
import type { SpokenTrace, VoiceManifest } from '../../src/audio/pidgin';
import { createVoicePool } from '../../src/audio/voices';
import { BASE, server } from './fakeServer';
import { FakeBuffer, FakeContext } from './fakeContext';

const VOL = { master: 0.8, music: 0.45, ambience: 0.65, sfx: 0.85 };

/** Four reaction categories with 3-4 lines each, spoken by several voices, plus three ambient scenes. */
function manifest(): VoiceManifest {
  const clips: VoiceManifest['clips'] = [];
  let t = 0;
  const add = (id: string, pack: string, category: string, voice: string, dur = 1.5) => {
    clips.push({ id, pack, category, text: id, voice, start: t, dur });
    t += dur + 0.3;
  };
  for (const [cat, n] of [
    ['escape', 4],
    ['elim_bot', 3],
    ['danfo', 3],
    ['win', 3],
  ] as const) {
    for (let i = 0; i < n; i++) add(`r_${cat}_${i}`, 'react', cat, `v${(i + cat.length) % 4}`);
  }
  add('a_one_0', 'ambient', 'one', 'v1', 1.2);
  add('a_one_1', 'ambient', 'one', 'v2', 1.4);
  add('a_two_0', 'ambient', 'two', 'v3', 2.0);
  add('a_call_0', 'ambient', 'call', 'v0', 2.2);
  return {
    version: 1,
    synthetic: true,
    packs: { react: { files: { ogg: 'react.ogg' } }, ambient: { files: { ogg: 'ambient.ogg' } } },
    clips,
    scenes: [
      { id: 'one', kind: 'talk', clips: ['a_one_0', 'a_one_1'] },
      { id: 'two', kind: 'talk', clips: ['a_two_0'] },
      { id: 'call', kind: 'call', clips: ['a_call_0'] },
    ],
  };
}

async function rig(m: VoiceManifest | null = manifest(), seed = 1, extra: Record<string, unknown> = {}) {
  const ctx = new FakeContext();
  const buses = createBuses(ctx, VOL, false);
  const pool = createVoicePool(ctx);
  const spoken: SpokenTrace[] = [];
  const files: Record<string, unknown> = {};
  if (m) {
    files[`${BASE}voices/voices.json`] = m;
    files[`${BASE}voices/react.ogg`] = 'x'.repeat(9999);
    files[`${BASE}voices/ambient.ogg`] = 'x'.repeat(9999);
  }
  Object.assign(files, extra);
  const voices = createPidginVoices(ctx, buses, pool, {
    fetch: server(files).fetch,
    decode: (d) => Promise.resolve(new FakeBuffer(d.byteLength * 10, 24000, 1)),
    baseUrl: BASE,
    seed,
    onSpeak: (t) => spoken.push(t),
  });
  const report = await voices.load();
  return { ctx, voices, spoken, report, buses };
}

const reactions = (s: SpokenTrace[]) => s.filter((x) => !x.ambient);

describe('spoken Pidgin director', () => {
  it('loads both packs, the clips and only the scenes whose clips all exist', async () => {
    const m = manifest();
    m.scenes.push({ id: 'ghost', kind: 'talk', clips: ['a_one_0', 'nope'] });
    const { report, voices } = await rig(m);
    expect(report.loadedPacks.sort()).toEqual(['ambient', 'react']);
    expect(report.clips).toBe(m.clips.length);
    expect(report.scenes).toBe(3);
    expect(voices.ready).toBe(true);
  });

  it('is a silent no-op without assets (missing manifest, missing packs, junk manifest)', async () => {
    const none = await rig(null);
    expect(none.voices.ready).toBe(false);
    expect(none.voices.say('escape')).toBe(false);
    none.voices.update(100, 0);
    expect(none.spoken).toEqual([]);
    const junk = await rig({ nonsense: true } as unknown as VoiceManifest);
    expect(junk.voices.ready).toBe(false);
  });

  it('plays a real line from the right category with start/duration inside the sprite sheet', async () => {
    const { voices, spoken, ctx } = await rig();
    ctx.advance(1);
    expect(voices.say('escape', { pan: -0.4, strength: 1 })).toBe(true);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.category).toBe('escape');
    expect(spoken[0]!.clipId).toMatch(/^r_escape_/);
    expect(spoken[0]!.pan).toBe(-0.4);
    const src = ctx.sources.find((s) => s.startDuration !== undefined)!;
    expect(src.startOffset).toBeGreaterThanOrEqual(0);
    expect(src.startDuration!).toBeCloseTo(1.52, 2);
  });

  it('applies the per-category cooldown, then allows the category again', async () => {
    const { voices, spoken, ctx } = await rig();
    ctx.advance(1);
    expect(voices.say('escape')).toBe(true);
    ctx.advance(GLOBAL_SPACING + 0.5);
    expect(voices.say('escape')).toBe(false); // same category too soon
    expect(voices.say('danfo')).toBe(true); // different category is fine
    ctx.advance(CATEGORY_COOLDOWN.escape + 0.1);
    expect(voices.say('escape')).toBe(true);
    expect(spoken.map((s) => s.category)).toEqual(['escape', 'danfo', 'escape']);
  });

  it('never talks over another reaction line, and keeps the global spacing', async () => {
    const { voices, ctx, spoken } = await rig();
    ctx.advance(1);
    expect(voices.say('escape')).toBe(true);
    expect(voices.say('danfo')).toBe(false); // still speaking
    ctx.advance(0.5);
    expect(voices.say('danfo', { delay: 0 })).toBe(false); // 0.5 s in: the line is still being spoken
    ctx.advance(1.5); // the line is over, but unforced lines keep a longer gap
    expect(voices.say('danfo')).toBe(false);
    ctx.advance(GLOBAL_SPACING);
    expect(voices.say('danfo')).toBe(true);
    // a forced line may follow soon after one ends, but never during a line
    ctx.advance(0.2);
    expect(voices.say('win', { force: true })).toBe(false);
    ctx.advance(1.5 + FORCE_SPACING);
    expect(voices.say('win', { force: true })).toBe(true);
    // no two reaction lines overlap in time
    const lines = reactions(spoken).sort((a, b) => a.at - b.at);
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1]!;
      expect(lines[i]!.at).toBeGreaterThanOrEqual(prev.at + 1.4);
    }
  });

  it('uses every line of a category before repeating, and avoids repeating the previous speaker', async () => {
    const { voices, spoken, ctx } = await rig(manifest(), 5);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      ctx.advance(CATEGORY_COOLDOWN.escape + 3);
      expect(voices.say('escape')).toBe(true);
      seen.push(spoken[spoken.length - 1]!.clipId);
    }
    expect(new Set(seen).size).toBe(4); // 4 lines, 4 plays, no repeats
    for (let i = 1; i < spoken.length; i++) expect(spoken[i]!.voice).not.toBe(spoken[i - 1]!.voice);
  });

  it('does not repeat a line within the recent-line window even when the bag refills', async () => {
    const { voices, spoken, ctx } = await rig(manifest(), 9);
    for (let i = 0; i < 7; i++) {
      ctx.advance(CATEGORY_COOLDOWN.elim_bot + 1);
      voices.say('elim_bot');
    }
    for (let i = 0; i < spoken.length; i++)
      for (let j = i + 1; j < spoken.length; j++)
        if (spoken[i]!.clipId === spoken[j]!.clipId)
          expect(spoken[j]!.at - spoken[i]!.at).toBeGreaterThanOrEqual(
            Math.min(RECENT_LINE_S, 3 * (CATEGORY_COOLDOWN.elim_bot + 1)) - 1e-6,
          );
  });

  it('collapses duplicate triggers (same category + key) inside the dedupe window', async () => {
    const { voices, ctx, spoken } = await rig();
    ctx.advance(1);
    expect(voices.say('escape', { key: 'miss1', force: true })).toBe(true);
    ctx.advance(DEDUPE_S / 2);
    expect(voices.say('escape', { key: 'miss1', force: true })).toBe(false);
    ctx.advance(3);
    expect(voices.say('escape', { key: 'miss1', force: true })).toBe(true);
    expect(spoken).toHaveLength(2);
  });

  it('chance < 1 is a seeded dice roll and force bypasses it', async () => {
    const lows = await rig(manifest(), 3);
    let spoke = 0;
    for (let i = 0; i < 40; i++) {
      lows.ctx.advance(20);
      if (lows.voices.say('danfo', { chance: 0.25 })) spoke++;
    }
    expect(spoke).toBeGreaterThan(2);
    expect(spoke).toBeLessThan(20);
    const f = await rig();
    f.ctx.advance(1);
    expect(f.voices.say('danfo', { chance: 0, force: true })).toBe(true);
  });

  it('respects the on/off switch and the (delayed) start time', async () => {
    const { voices, ctx, spoken } = await rig();
    voices.setEnabled(false);
    expect(voices.say('escape')).toBe(false);
    voices.update(50, 0);
    expect(spoken).toEqual([]);
    voices.setEnabled(true);
    ctx.advance(2);
    expect(voices.say('escape', { delay: 0.7 })).toBe(true);
    expect(spoken[0]!.at).toBeCloseTo(2.7, 6);
  });

  it('ambient chatter: first scene waits after reset, one scene at a time, conversation lines in order', async () => {
    const { voices, spoken, ctx } = await rig();
    voices.reset(0);
    voices.update(0.5, 0); // too soon
    expect(spoken).toEqual([]);
    voices.update(7, 0);
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken.every((s) => s.ambient)).toBe(true);
    const first = spoken.length;
    voices.update(7.1, 0); // the scene is still going: nothing new
    expect(spoken.length).toBe(first);
    if (first === 2) {
      expect(spoken[0]!.clipId).toBe('a_one_0');
      expect(spoken[1]!.clipId).toBe('a_one_1');
      expect(spoken[1]!.at).toBeGreaterThan(spoken[0]!.at + 1.2);
    }
    void ctx;
  });

  it('ambient chatter does not start while a reaction speaks and is held back afterwards', async () => {
    const { voices, spoken, ctx } = await rig();
    voices.reset(0);
    ctx.advance(10);
    expect(voices.say('escape')).toBe(true);
    ctx.advance(0.5);
    voices.update(ctx.currentTime, 1);
    expect(spoken.filter((s) => s.ambient)).toEqual([]);
    voices.update(ctx.currentTime + 1.5 + AMBIENT_HOLD_S - 0.5, 1); // still inside the hold-off
    expect(spoken.filter((s) => s.ambient)).toEqual([]);
    voices.update(ctx.currentTime + 60, 1);
    expect(spoken.filter((s) => s.ambient).length).toBeGreaterThan(0);
  });

  it('ambient scenes cycle through every scene before repeating, with far calls quieter and more filtered', async () => {
    const { voices, spoken, ctx } = await rig(manifest(), 2);
    voices.reset(0);
    let now = 7;
    const sceneIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const n = spoken.length;
      voices.update(now, 0);
      expect(spoken.length).toBeGreaterThan(n);
      sceneIds.push(spoken[n]!.clipId.replace(/^a_/, '').replace(/_\d+$/, ''));
      now += 60;
    }
    expect(new Set(sceneIds).size).toBe(3);
    const call = spoken.find((s) => s.clipId === 'a_call_0')!;
    const talk = spoken.find((s) => s.clipId === 'a_two_0')!;
    expect(call.gain).toBeLessThan(talk.gain);
    const lp = ctx.filters.map((f) => f.frequency.value);
    expect(Math.min(...lp)).toBeLessThan(3000);
  });

  it('reset() forgets cooldowns for a new match', async () => {
    const { voices, ctx } = await rig();
    ctx.advance(1);
    expect(voices.say('escape')).toBe(true);
    ctx.advance(GLOBAL_SPACING + 1.6);
    expect(voices.say('escape')).toBe(false);
    voices.reset(ctx.currentTime);
    expect(voices.say('escape')).toBe(true);
  });

  describe('real recordings replace the synthetic placeholders', () => {
    const rec = (clips: unknown[], files: Record<string, string> = {}) => ({
      [`${BASE}voices/recorded.json`]: { clips },
      ...Object.fromEntries(Object.entries(files).map(([f, body]) => [`${BASE}voices/recorded/${f}`, body])),
    });

    it('a licensed recording with an existing id replaces that line: it plays from its own file, from 0, at its own length', async () => {
      const { voices, spoken, ctx, report } = await rig(
        manifest(),
        1,
        rec(
          [
            {
              id: 'r_win_0',
              file: 'r_win_0.ogg',
              license: 'Recorded by A. Speaker, consent on file',
              speaker: 'ade',
            },
          ],
          { 'r_win_0.ogg': 'x'.repeat(3000) },
        ),
      );
      expect(report.recorded).toEqual(['r_win_0']);
      // play every win line: exactly the replaced one is flagged as recorded
      for (let i = 0; i < 3; i++) {
        ctx.advance(10);
        voices.say('win', { force: true });
      }
      const byId = new Map(spoken.map((s) => [s.clipId, s]));
      expect(byId.get('r_win_0')?.recorded).toBe(true);
      expect(byId.get('r_win_1')?.recorded).toBe(false);
      const src = ctx.sources.find(
        (s) =>
          s.startDuration !== undefined && s.startOffset === 0 && Math.abs(s.startDuration - 1.27) < 0.05,
      );
      expect(src).toBeTruthy(); // 30000 frames @ 24 kHz = 1.25 s (+ 0.02 s tail)
    });

    it('ignores recordings without a licence statement, with unsafe file names, or that fail to load', async () => {
      const { report, voices } = await rig(
        manifest(),
        1,
        rec(
          [
            { id: 'r_win_0', file: 'a.ogg', license: '' },
            { id: 'r_win_1', file: '../evil.ogg', license: 'x' },
            { id: 'r_win_2', file: 'missing.ogg', license: 'x' },
          ],
          { 'a.ogg': 'x'.repeat(3000) },
        ),
      );
      expect(report.recorded).toBeUndefined();
      expect(voices.ready).toBe(true);
    });

    it('a recording with a new id, category and text adds a line to that category', async () => {
      const { voices, spoken, ctx } = await rig(
        manifest(),
        1,
        rec([{ id: 'r_new_0', category: 'danfo', text: 'Oga o!', file: 'n.ogg', license: 'own voice' }], {
          'n.ogg': 'x'.repeat(3000),
        }),
      );
      const seen = new Set<string>();
      for (let i = 0; i < 8; i++) {
        ctx.advance(30);
        voices.say('danfo', { force: true });
        seen.add(spoken[spoken.length - 1]!.clipId);
      }
      expect(seen.has('r_new_0')).toBe(true);
    });

    it('recordings alone are enough: if the synthetic packs are missing, the recorded lines still speak', async () => {
      const files = rec([{ id: 'r_win_0', file: 'w.ogg', license: 'own voice' }], {
        'w.ogg': 'x'.repeat(3000),
      });
      const m = manifest();
      const ctx = new FakeContext();
      const spoken: SpokenTrace[] = [];
      const voices = createPidginVoices(ctx, createBuses(ctx, VOL, false), createVoicePool(ctx), {
        fetch: server({ [`${BASE}voices/voices.json`]: m, ...files }).fetch, // no pack files at all
        decode: (d) => Promise.resolve(new FakeBuffer(d.byteLength * 10, 24000, 1)),
        baseUrl: BASE,
        onSpeak: (s) => spoken.push(s),
      });
      const report = await voices.load();
      expect(report.loadedPacks).toEqual([]);
      expect(report.failed).toHaveLength(2);
      ctx.advance(2);
      expect(voices.ready).toBe(true);
      expect(voices.say('win', { force: true })).toBe(true);
      expect(spoken[0]).toMatchObject({ clipId: 'r_win_0', recorded: true });
      expect(voices.say('danfo', { force: true })).toBe(false); // no recording for that one
    });
  });
});
