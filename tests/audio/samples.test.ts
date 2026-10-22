import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_SLOTS, audioBaseUrl, loadRecordedSlots, parseManifest } from '../../src/audio/samples';
import type { FetchLike } from '../../src/audio/samples';
import { SOUND_IDS } from '../../src/audio/recipes';
import type { SimEvent } from '../../src/sim';
import { FakeBuffer } from './fakeContext';
import { SAMPLES, finishWarmup, makeRig, playState } from './helpers';

/** A fake static file server: path -> body (object => JSON, string => bytes of that length). */
function server(files: Record<string, unknown>): { fetch: FetchLike; hits: string[] } {
  const hits: string[] = [];
  const fetch: FetchLike = (url) => {
    hits.push(url);
    const body = files[url];
    if (body === undefined)
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.reject(new Error('no json')),
        arrayBuffer: () => Promise.reject(new Error('404')),
      });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        typeof body === 'string' ? Promise.reject(new SyntaxError('not json')) : Promise.resolve(body),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(typeof body === 'string' ? body.length : 0)),
    });
  };
  return { fetch, hits };
}

const BASE = '/wahala-game/audio/';
const OK = { license: 'CC0 1.0', source: 'test fixture' };

describe('public/audio documentation and manifest', () => {
  const dir = join(__dirname, '../../public/audio');
  const read = (f: string): string => readFileSync(join(dir, f), 'utf8');

  it('ships NO recordings: slots.json is empty (rejected generated beds removed), and the docs say so', () => {
    const manifest = JSON.parse(read('slots.json')) as { slots: Record<string, { license: string }> };
    expect(manifest.slots).toEqual({});
    expect(parseManifest(manifest).entries).toHaveLength(0);
    expect(read('README.md')).toMatch(/No recordings are shipped/i);
    expect(read('LICENSES.md')).toMatch(/No recorded audio is shipped/i);
    expect(read('LICENSES.md')).toMatch(/licen[cs]e/i);
  });

  it('documents every slot by name', () => {
    const readme = read('README.md');
    for (const slot of SAMPLE_SLOTS) expect(readme, slot.id).toContain(`\`${slot.id}\``);
  });
});

describe('slot manifest', () => {
  it('has one slot per sound id, with ogg then mp3 candidates and a loop flag', () => {
    expect(SAMPLE_SLOTS.map((s) => s.id)).toEqual(SOUND_IDS);
    const crowd = SAMPLE_SLOTS.find((s) => s.id === 'crowd_loop')!;
    expect(crowd.loop).toBe(true);
    expect(crowd.defaultFiles).toEqual(['crowd_loop.ogg', 'crowd_loop.mp3']);
    expect(SAMPLE_SLOTS.find((s) => s.id === 'explosion_1')!.loop).toBe(false);
  });

  it('builds the folder URL from Vite BASE_URL with a trailing slash', () => {
    const url = audioBaseUrl();
    expect(url.endsWith('/audio/')).toBe(true);
    expect(url.startsWith('/')).toBe(true);
  });

  it('accepts licensed known slots and rejects unlicensed, unknown and unsafe entries', () => {
    const { entries, skipped } = parseManifest({
      slots: {
        explosion_1: { ...OK },
        explosion_2: { file: 'boom.ogg', license: '  ' },
        explosion_3: { file: '../../etc/passwd', license: 'x' },
        crowd_loop: { file: 'sub/dir.ogg', license: 'x' },
        not_a_slot: { license: 'x' },
        danfo_horn: null,
        taxi_horn: { file: 'taxi.mp3', license: 'Purchased', gain: 99 },
      },
    });
    expect(entries.map(([id]) => id)).toEqual(['explosion_1', 'taxi_horn']);
    expect(entries[1]![1].gain).toBe(4); // clamped
    expect(skipped.map((s) => s.slot).sort()).toEqual([
      'crowd_loop',
      'danfo_horn',
      'explosion_2',
      'explosion_3',
      'not_a_slot',
    ]);
    expect(parseManifest(null).entries).toEqual([]);
    expect(parseManifest({ slots: [] }).entries).toEqual([]);
    expect(parseManifest('slots').entries).toEqual([]);
  });
});

describe('loadRecordedSlots (fake fetch)', () => {
  const decode = (data: ArrayBuffer): Promise<FakeBuffer> =>
    Promise.resolve(new FakeBuffer(Math.max(64, data.byteLength), 44100, 2));

  it('does nothing and makes a single request when there is no manifest', async () => {
    const s = server({});
    const onSlot = vi.fn();
    const r = await loadRecordedSlots({ fetch: s.fetch, decode, baseUrl: BASE, onSlot });
    expect(r).toEqual({ loaded: [], skipped: [] });
    expect(s.hits).toEqual([BASE + 'slots.json']);
    expect(onSlot).not.toHaveBeenCalled();
  });

  it('does nothing without fetch, on network errors, and when the manifest is not JSON (dev server HTML)', async () => {
    const onSlot = vi.fn();
    expect(await loadRecordedSlots({ fetch: null, decode, onSlot })).toEqual({ loaded: [], skipped: [] });
    const boom: FetchLike = () => Promise.reject(new TypeError('offline'));
    expect(await loadRecordedSlots({ fetch: boom, decode, baseUrl: BASE, onSlot })).toEqual({
      loaded: [],
      skipped: [],
    });
    const html = server({ [BASE + 'slots.json']: '<!doctype html>' });
    expect(await loadRecordedSlots({ fetch: html.fetch, decode, baseUrl: BASE, onSlot })).toEqual({
      loaded: [],
      skipped: [],
    });
    expect(onSlot).not.toHaveBeenCalled();
  });

  it('loads listed slots, falling back from .ogg to .mp3, and reports misses', async () => {
    const s = server({
      [BASE + 'slots.json']: {
        slots: {
          explosion_1: OK,
          danfo_horn: OK,
          taxi_horn: { ...OK, file: 'taxi.mp3', gain: 0.5 },
          keke_horn: OK,
        },
      },
      [BASE + 'explosion_1.ogg']: 'x'.repeat(5000),
      [BASE + 'danfo_horn.mp3']: 'y'.repeat(3000), // only the mp3 exists
      [BASE + 'taxi.mp3']: 'z'.repeat(2000),
      // keke_horn: listed but no file
    });
    const got: Record<string, number> = {};
    const r = await loadRecordedSlots({
      fetch: s.fetch,
      decode,
      baseUrl: BASE,
      onSlot: (id, _b, meta) => (got[id] = meta.gain),
    });
    expect(r.loaded.sort()).toEqual(['danfo_horn', 'explosion_1', 'taxi_horn']);
    expect(got).toEqual({ explosion_1: 1, danfo_horn: 1, taxi_horn: 0.5 });
    expect(r.skipped).toEqual([{ slot: 'keke_horn', reason: 'file not found' }]);
    // never asks for slots that are not listed
    expect(s.hits.some((h) => h.includes('crowd_loop'))).toBe(false);
    expect(s.hits).toContain(BASE + 'danfo_horn.ogg');
    expect(s.hits).toContain(BASE + 'danfo_horn.mp3');
  });

  it('keeps going when one file fails to decode', async () => {
    const s = server({
      [BASE + 'slots.json']: { slots: { explosion_1: OK, explosion_2: OK } },
      [BASE + 'explosion_1.ogg']: 'corrupt',
      [BASE + 'explosion_2.ogg']: 'fine!!!!!',
    });
    const bad = (data: ArrayBuffer): Promise<FakeBuffer> =>
      data.byteLength === 7 ? Promise.reject(new Error('EncodingError')) : decode(data);
    const r = await loadRecordedSlots({
      fetch: s.fetch,
      decode: bad,
      baseUrl: BASE,
      onSlot: () => undefined,
    });
    expect(r.loaded).toEqual(['explosion_2']);
    expect(r.skipped[0]!.slot).toBe('explosion_1');
  });

  it('stops quietly when cancelled', async () => {
    const s = server({
      [BASE + 'slots.json']: { slots: { explosion_1: OK } },
      [BASE + 'explosion_1.ogg']: 'abc',
    });
    const onSlot = vi.fn();
    const r = await loadRecordedSlots({
      fetch: s.fetch,
      decode,
      baseUrl: BASE,
      onSlot,
      isCancelled: () => true,
    });
    expect(onSlot).not.toHaveBeenCalled();
    expect(r.loaded).toEqual([]);
  });
});

describe('engine integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays the recorded buffer when a slot exists and the synthesised one otherwise', async () => {
    const s = server({
      [BASE + 'slots.json']: { slots: { danfo_horn: { ...OK, gain: 0.7 } } },
      [BASE + 'danfo_horn.ogg']: 'recorded!',
    });
    const rig = makeRig({ fetch: s.fetch, sampleBaseUrl: BASE });
    let decoded: unknown = null;
    rig.ctx.decoded = (d) => (decoded = new FakeBuffer(d.byteLength * 1000, 22050, 2));
    await rig.audio.unlock();
    const report = await rig.audio.whenSamplesLoaded();
    expect(report.loaded).toEqual(['danfo_horn']);
    finishWarmup();
    rig.audio.handleEvents(
      [SAMPLES.vehicleWarning, { ...SAMPLES.vehicleLaunched, kind: 'danfo' } as SimEvent],
      playState(),
    );
    const horn = rig.traces.find((t) => t.id === 'danfo_horn')!;
    const launch = rig.traces.find((t) => t.id === 'danfo_launch')!;
    expect(horn).toBeTruthy();
    const playedBuffers = rig.ctx.sources.filter((x) => !x.loop && x.buffer).map((x) => x.buffer);
    expect(playedBuffers).toContain(decoded); // recording used for the horn
    expect(launch).toBeTruthy(); // other sounds still synthesised
    expect(horn.gain).toBeCloseTo(0.95 * 0.7, 5); // slot trim applied on top of the sound's own gain
    expect(rig.errors).toEqual([]);
  });

  it('a recorded ambience loop replaces the synthesised bed while it plays', async () => {
    const s = server({
      [BASE + 'slots.json']: { slots: { crowd_loop: OK } },
      [BASE + 'crowd_loop.mp3']: 'loop-bytes',
    });
    const rig = makeRig({ fetch: s.fetch, sampleBaseUrl: BASE });
    let rec: unknown = null;
    rig.ctx.decoded = (d) => (rec = new FakeBuffer(d.byteLength * 1000, 44100, 2));
    await rig.audio.unlock();
    rig.audio.startMusic();
    finishWarmup(); // synthesised beds are running
    await rig.audio.whenSamplesLoaded();
    const loops = rig.ctx.sources.filter((x) => x.loop && x.stoppedAt === null);
    expect(loops.map((l) => l.buffer)).toContain(rec);
    expect(loops).toHaveLength(3); // the old synthesised crowd_loop was faded out and replaced
  });

  it('falls back silently to synthesised sounds when everything fails', async () => {
    const boom: FetchLike = () => Promise.reject(new Error('offline'));
    const rig = makeRig({ fetch: boom });
    await rig.audio.unlock();
    expect((await rig.audio.whenSamplesLoaded()).loaded).toEqual([]);
    finishWarmup();
    rig.audio.handleEvents([SAMPLES.generatorExploded], playState());
    expect(rig.ids().some((id) => id.startsWith('explosion_'))).toBe(true);
    expect(rig.errors).toEqual([]);

    const ctxNoDecode = makeRig({
      fetch: server({
        [BASE + 'slots.json']: { slots: { explosion_1: OK } },
        [BASE + 'explosion_1.ogg']: 'x'.repeat(100),
      }).fetch,
      sampleBaseUrl: BASE,
    });
    ctxNoDecode.ctx.decoded = null; // decodeAudioData rejects
    await ctxNoDecode.audio.unlock();
    const rep = await ctxNoDecode.audio.whenSamplesLoaded();
    expect(rep.loaded).toEqual([]);
    expect(rep.skipped).toHaveLength(1);
  });
});
