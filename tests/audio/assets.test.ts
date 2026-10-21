/**
 * Checks the SHIPPED audio files and their manifests (not just the code). These are structural
 * checks: loop lengths, exact decoded lengths, manifests, licences, honesty flags. They cannot judge
 * how anything sounds.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../src/audio/samples';
import type { MusicManifest } from '../../src/audio/music';
import type { VoiceManifest } from '../../src/audio/pidgin';

const AUDIO = join(__dirname, '../../public/audio');
const json = <T>(rel: string): T => JSON.parse(readFileSync(join(AUDIO, rel), 'utf8')) as T;

/** Number of PCM frames in an Ogg Vorbis file: the granule position of its last page. */
function oggFrames(file: string): number {
  const b = readFileSync(file);
  const at = b.lastIndexOf('OggS');
  expect(at, `${file} is not an Ogg file`).toBeGreaterThanOrEqual(0);
  return Number(b.readBigUInt64LE(at + 6));
}

describe('shipped music', () => {
  const m = json<
    MusicManifest & {
      tracks: Record<
        string,
        {
          bars: number;
          lufs: number;
          seam?: { jump_ratio: number };
          decoded_samples?: Record<string, number>;
        }
      >;
    }
  >('music/manifest.json');
  const loops = Object.entries(m.tracks).filter(([, t]) => t.loop);

  it('has the menu loop, the match loop, the tension stem and three stings, as ogg with an mp3 fallback', () => {
    expect(Object.keys(m.tracks).sort()).toEqual([
      'match_loop',
      'match_tension',
      'menu_loop',
      'sting_draw',
      'sting_lose',
      'sting_win',
    ]);
    for (const [name, t] of Object.entries(m.tracks)) {
      for (const ext of ['ogg', 'mp3'] as const) {
        const f = t.files[ext];
        expect(f, `${name}.${ext}`).toBeTruthy();
        const p = join(AUDIO, 'music', f!.file);
        expect(existsSync(p), p).toBe(true);
        expect(statSync(p).size).toBe(f!.bytes);
        expect(f!.bytes).toBeGreaterThan(20_000); // real audio, not a stub
      }
    }
  });

  it('is Afrobeats-tempo (100-115 BPM) and loop lengths are a whole number of bars', () => {
    for (const [name, t] of loops) {
      expect(t.bpm, name).toBeGreaterThanOrEqual(100);
      expect(t.bpm, name).toBeLessThanOrEqual(115);
      const barSamples = (60 / t.bpm) * 4 * m.sampleRate;
      expect(t.samples / barSamples, name).toBeCloseTo(t.bars, 9);
      expect(Number.isInteger(t.samples)).toBe(true);
    }
    expect(m.tracks.match_loop!.bars).toBe(32);
    // the stem divides the main loop exactly, which is what makes phase-locking possible
    expect(m.tracks.match_loop!.samples % m.tracks.match_tension!.samples).toBe(0);
  });

  it('decodes to EXACTLY the loop length (ogg granule position), so loop boundaries are sample-accurate', () => {
    for (const [name, t] of loops) {
      expect(oggFrames(join(AUDIO, 'music', t.files.ogg!.file)), name).toBe(t.samples);
      // build_music.py also decoded both encodings with ffmpeg and recorded the frame counts
      expect(t.decoded_samples, name).toEqual({ ogg: t.samples, mp3: t.samples });
    }
  });

  it('has no click at the loop seam (wrap-around jump comparable to normal sample-to-sample movement)', () => {
    for (const [name, t] of loops) {
      expect(t.seam, name).toBeTruthy();
      expect(t.seam!.jump_ratio, name).toBeLessThan(6);
    }
  });

  it('sits at a sane loudness (not clipped, not tiny) and leaves headroom', () => {
    for (const [name, t] of Object.entries(m.tracks)) {
      expect(t.lufs, name).toBeGreaterThan(-24);
      expect(t.lufs, name).toBeLessThan(-12);
      expect((t as unknown as { peak_db: number }).peak_db, name).toBeLessThan(-0.5);
    }
  });
});

describe('shipped Pidgin voices', () => {
  const v = json<
    VoiceManifest & {
      sampleRate: number;
      packs: Record<string, { files: Record<string, string>; seconds: number }>;
    }
  >('voices/voices.json');

  it('is honestly labelled as synthetic placeholder speech, not recordings or authentic accents', () => {
    expect(v.synthetic).toBe(true);
    expect(v.note).toMatch(/SYNTHETIC/);
    expect(v.note).toMatch(/NOT authentic/i);
    expect(v.note).toMatch(/NOT recordings/i);
  });

  it('packs exist, and every clip lies inside its sprite sheet', () => {
    for (const [name, p] of Object.entries(v.packs)) {
      for (const [ext, file] of Object.entries(p.files))
        expect(existsSync(join(AUDIO, 'voices', file)), `${name}.${ext}`).toBe(true);
      const frames = oggFrames(join(AUDIO, 'voices', p.files.ogg!));
      expect(frames / v.sampleRate).toBeCloseTo(p.seconds, 1);
    }
    for (const c of v.clips) {
      const pack = v.packs[c.pack]!;
      expect(pack, c.id).toBeTruthy();
      expect(c.start, c.id).toBeGreaterThanOrEqual(0);
      expect(c.dur, c.id).toBeGreaterThan(0.4);
      expect(c.dur, c.id).toBeLessThan(5);
      expect(c.start + c.dur, c.id).toBeLessThanOrEqual(pack.seconds + 0.01);
    }
  });

  it('clips never overlap inside a pack (a slice never plays its neighbour)', () => {
    for (const pack of Object.keys(v.packs)) {
      const cs = v.clips.filter((c) => c.pack === pack).sort((a, b) => a.start - b.start);
      for (let i = 1; i < cs.length; i++)
        expect(cs[i]!.start, cs[i]!.id).toBeGreaterThan(cs[i - 1]!.start + cs[i - 1]!.dur + 0.1);
    }
  });

  it('has unique ids, at least 3 reaction lines per category, and many different speakers', () => {
    expect(new Set(v.clips.map((c) => c.id)).size).toBe(v.clips.length);
    const byCat = new Map<string, number>();
    for (const c of v.clips.filter((x) => x.pack === 'react'))
      byCat.set(c.category, (byCat.get(c.category) ?? 0) + 1);
    expect(byCat.size).toBeGreaterThanOrEqual(20);
    for (const [cat, n] of byCat) expect(n, cat).toBeGreaterThanOrEqual(2);
    expect(new Set(v.clips.map((c) => c.voice)).size).toBeGreaterThanOrEqual(12);
    expect(v.clips.length).toBeGreaterThanOrEqual(100);
  });

  it('ambient scenes reference existing clips and include conversations as well as shouted calls', () => {
    const ids = new Set(v.clips.map((c) => c.id));
    for (const s of v.scenes) for (const id of s.clips) expect(ids.has(id), `${s.id}:${id}`).toBe(true);
    expect(v.scenes.filter((s) => s.kind === 'talk' && s.clips.length >= 2).length).toBeGreaterThanOrEqual(
      10,
    );
    expect(v.scenes.filter((s) => s.kind === 'call').length).toBeGreaterThanOrEqual(5);
  });

  it('contains the example lines from the brief (as shipped text, spoken by synthetic voices)', () => {
    const text = v.clips.map((c) => c.text.toLowerCase()).join('\n');
    for (const line of [
      'oga, abeg shift small!',
      'wetin dey happen for that side?',
      'abeg, make i pass!',
      'ah! you don finish am!',
      'omo! see as e take escape!',
      'wetin be this one?',
      'chai! that danfo don carry am go!',
      'see calculation! this guy wicked!',
      'oga, where you dey run go?',
    ])
      expect(text, line).toContain(line);
    expect(text).toMatch(/how much you wan collect/);
  });
});

describe('shipped ambience beds and slot manifest', () => {
  it('lists the three Lagos beds with a licence statement, and the engine accepts them', () => {
    const slots = json<{ slots: Record<string, { license: string }> }>('slots.json');
    expect(Object.keys(slots.slots).sort()).toEqual(['buspark_loop', 'crowd_loop', 'crowd_loop_hype']);
    for (const e of Object.values(slots.slots)) expect(e.license).toMatch(/original/i);
    const parsed = parseManifest(slots);
    expect(parsed.skipped).toEqual([]);
    expect(parsed.entries.map(([id]) => id).sort()).toEqual([
      'buspark_loop',
      'crowd_loop',
      'crowd_loop_hype',
    ]);
  });

  it('every bed exists as ogg and mp3 and loops on its exact length (no street-vs-stadium roar bed)', () => {
    const report =
      json<Record<string, { samples: number; seconds: number; seam_jump_ratio: number }>>(
        'ambience_report.json',
      );
    for (const name of ['crowd_loop', 'buspark_loop', 'crowd_loop_hype']) {
      expect(existsSync(join(AUDIO, `${name}.mp3`)), name).toBe(true);
      expect(oggFrames(join(AUDIO, `${name}.ogg`)), name).toBe(report[name]!.samples);
      expect(report[name]!.seconds).toBeGreaterThan(25);
      // block-aligned (browser Vorbis decoders pad to block multiples) and no start-up click at the seam
      expect(report[name]!.samples % 1024, name).toBe(0);
      expect(report[name]!.seam_jump_ratio, name).toBeLessThan(6);
    }
  });
});

describe('documentation', () => {
  it('docs/AUDIO.md exists and states the limitations plainly', () => {
    const doc = readFileSync(join(__dirname, '../../docs/AUDIO.md'), 'utf8');
    expect(doc).toMatch(/synthetic/i);
    expect(doc).toMatch(/not authentic/i);
    expect(doc).toMatch(/not been (listened|heard|assessed)/i);
    expect(doc).toMatch(/recording/i);
  });
});
