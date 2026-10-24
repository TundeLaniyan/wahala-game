/**
 * Guards the founder's decisions on shipped audio:
 *  - the synthetic Afrobeats music, the Kokoro TTS Pidgin voices and the generated Lagos ambience beds of
 *    the `claude/wahala-lagos-audio` branch were REJECTED and may never come back;
 *  - the music is the founder's approved Pixabay tracks, listed below by id and in public/audio/music/manifest.json;
 *  - the voices are the founder's approved Gemini TTS clips (2026-10-24), imported by
 *    tools/audio/voices/import_voices.py and listed in public/audio/voices/recorded.json; the rejected
 *    conductor recordings (conductor_cms_01) may never ship.
 * Adding any other audio means changing this file deliberately.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMusicManifest } from '../../src/audio/playlist';
import { voiceLevel } from '../../src/audio/buses';
import { DEFAULT_AUDIO_PREFS } from '../../src/audio/prefs';
import { parseRecorded, parseVoiceCatalogue, registerLines } from '../../src/audio/pidgin';

const ROOT = join(__dirname, '../..');
const AUDIO = join(ROOT, 'public/audio');
const json = <T>(rel: string): T => JSON.parse(readFileSync(join(AUDIO, rel), 'utf8')) as T;

/** The founder's approved Pixabay tracks (Pixabay Content License): page id -> source page. */
const APPROVED: Record<string, string> = {
  pixabay_569473: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-569473/',
  pixabay_573648: 'https://pixabay.com/music/modern-jazz-afrobeat-instrumental-summer-groove-573648/',
  pixabay_588999: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-588999/',
  pixabay_491433: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-491433/',
  pixabay_439622: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-439622/',
  pixabay_491432: 'https://pixabay.com/music/beats-afrobeat-afro-beat-2-491432/',
  pixabay_496406: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-496406/',
  pixabay_406552: 'https://pixabay.com/music/afrobeat-pause-406552/',
  pixabay_540950: 'https://pixabay.com/music/afrobeat-afro-beat-afrobeat-instrumental-540950/',
  pixabay_504898: 'https://pixabay.com/music/electronic-afrobeat-afro-beat-504898/',
};
/** Names of the rejected generated tracks; none may ever come back under any form. */
const REJECTED_NAMES =
  /match_loop|menu_loop|match_tension|sting_(win|lose|draw)|crowd_loop|buspark_loop|kokoro/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('rejected generated audio stays disabled', () => {
  it('the only audio files under public/audio are approved Pixabay tracks and the listed, approved voice clips', () => {
    const audioFiles = walk(AUDIO)
      .map((p) => relative(AUDIO, p).split('\\').join('/'))
      .filter((p) => /\.(ogg|mp3|wav|m4a|flac|aac|opus|webm)$/i.test(p));
    const voiceClips = json<{ clips: { file: string }[] }>('voices/recorded.json').clips.map(
      (c) => `voices/recorded/${c.file}`,
    );
    const allowed = new Set([...Object.keys(APPROVED).map((id) => `music/${id}.mp3`), ...voiceClips]);
    expect(audioFiles.filter((p) => !allowed.has(p))).toEqual([]);
  });

  it('the music manifest lists exactly the ten approved tracks, each with its source page and licence', () => {
    const raw = json<{
      tracks: { id: string; file: string; source: string; licence: string; approved: boolean }[];
    }>('music/manifest.json');
    expect(raw.tracks.map((t) => t.id).sort()).toEqual(Object.keys(APPROVED).sort());
    for (const t of raw.tracks) {
      expect(t.file).toBe(`${t.id}.mp3`);
      expect(t.source).toBe(APPROVED[t.id]);
      expect(t.licence).toBe('Pixabay Content License');
      expect(t.approved).toBe(true);
    }
    const { manifest, rejected } = parseMusicManifest(raw);
    expect(rejected).toEqual([]);
    expect(manifest.tracks).toHaveLength(10);
    expect(JSON.stringify(raw)).not.toMatch(REJECTED_NAMES);
  });

  it('every music file present has its own row (with source page) under "Files present" in LICENSES.md', () => {
    const licences = readFileSync(join(AUDIO, 'LICENSES.md'), 'utf8');
    const section = /### Files present\n([\s\S]*?)(\n## |$)/.exec(licences)?.[1] ?? '';
    expect(section).toContain('| File |');
    const rows = section.split('\n').filter((l) => l.startsWith('| `pixabay_'));
    const present = readdirSync(join(AUDIO, 'music')).filter((n) => n.endsWith('.mp3'));
    for (const f of present) {
      const row = rows.find((l) => l.startsWith(`| \`${f}\``));
      expect(row, `${f} needs a row under "Files present"`).toBeDefined();
      expect(row).toContain(APPROVED[f.replace(/\.mp3$/, '')]!);
      expect(row).toContain('Pixabay Content License');
    }
  });

  it('nine approved tracks are installed as real MP3 audio; only #7 (pixabay_496406) is missing', () => {
    const present = readdirSync(join(AUDIO, 'music'))
      .filter((n) => n.endsWith('.mp3'))
      .sort();
    expect(present).toEqual(
      Object.keys(APPROVED)
        .filter((id) => id !== 'pixabay_496406')
        .map((id) => `${id}.mp3`)
        .sort(),
    );
    for (const f of present) {
      const b = readFileSync(join(AUDIO, 'music', f));
      // an MPEG audio frame sync (or an ID3 tag) at the start: real audio, not an HTML error page
      const mpeg = b[0] === 0xff && (b[1]! & 0xe0) === 0xe0;
      const id3 = b.subarray(0, 3).toString('latin1') === 'ID3';
      expect(mpeg || id3, `${f} is not MP3 audio`).toBe(true);
      expect(b.length, f).toBeGreaterThan(1_000_000);
    }
  });

  it('no recordings are listed for the sample slots (effects and ambience beds stay synthesised)', () => {
    expect(json<{ slots: Record<string, unknown> }>('slots.json').slots).toEqual({});
  });

  it('the generators of the rejected audio are not in the repository', () => {
    expect(() => statSync(join(ROOT, 'tools/audiogen'))).toThrow();
  });
});

describe('voice clips (founder-approved Gemini TTS, 2026-10-24)', () => {
  const catalogue = parseVoiceCatalogue(json('voices/voices.json'));
  const recorded = parseRecorded(json('voices/recorded.json'));
  const MASTERS = join(ROOT, 'tools/audio/voices/masters');

  it('the catalogue is the founder plan: 47 planned voice lines plus the rejected conductor line, no sound effects', () => {
    expect(catalogue.ignored).toEqual([]);
    const lines = catalogue.catalogue.lines;
    expect(lines.filter((l) => l.status === 'planned')).toHaveLength(47);
    expect(lines.filter((l) => l.status === 'rejected').map((l) => l.id)).toEqual(['conductor_cms_01']);
    expect(
      lines.some((l) => /horn|idle|accel|engine|footsteps|objects|clatter|trolley|traffic_amb/.test(l.id)),
    ).toBe(false);
    expect(Object.keys(catalogue.catalogue.zones).sort()).toEqual(['bus_park', 'market']);
  });

  it('every listed clip is a licensed, playable line with its MP3 present, a WAV master kept, and sane length', () => {
    expect(recorded.ignored).toEqual([]);
    const reg = registerLines(catalogue.catalogue, recorded.clips);
    expect(reg.ignored).toEqual([]);
    expect(reg.lines).toHaveLength(recorded.clips.length);
    const raw = json<{ clips: { id: string; duration: number; peakDb: number }[] }>(
      'voices/recorded.json',
    ).clips;
    for (const c of recorded.clips) {
      expect(c.file).toBe(`${c.id}.mp3`);
      expect(c.license).toMatch(/Gemini/);
      expect(c.license).toMatch(/synthetic/i); // never presented as a recording of a person
      const b = readFileSync(join(AUDIO, 'voices/recorded', c.file));
      const mpeg = b[0] === 0xff && (b[1]! & 0xe0) === 0xe0;
      const id3 = b.subarray(0, 3).toString('latin1') === 'ID3';
      expect(mpeg || id3, `${c.file} is not MP3 audio`).toBe(true);
      expect(b.length, c.file).toBeGreaterThan(2000);
      expect(b.length, c.file).toBeLessThan(80_000);
      expect(statSync(join(MASTERS, `${c.id}.wav`)).isFile()).toBe(true);
      const meta = raw.find((r) => r.id === c.id)!;
      expect(meta.duration).toBeGreaterThan(0.3);
      expect(meta.duration).toBeLessThan(8);
    }
    // masters and clips match one to one
    expect(
      readdirSync(MASTERS)
        .filter((n) => n.endsWith('.wav'))
        .sort(),
    ).toEqual(recorded.clips.map((c) => `${c.id}.wav`).sort());
  });

  it('the first batch: the 19 clips the founder supplied', () => {
    expect(recorded.clips.map((c) => c.id).sort()).toEqual(
      [
        'danfo_hit_01',
        'danfo_hit_02',
        'danfo_hit_03',
        'danger_explosion_01',
        'danger_explosion_02',
        'danger_explosion_03',
        'danger_run_01',
        'danger_run_02',
        'danger_run_03',
        'elimination_01',
        'elimination_02',
        'elimination_03',
        'escape_01',
        'escape_02',
        'escape_03',
        'keke_approach_01',
        'keke_approach_02',
        'keke_approach_03',
        'market_come_buy_01',
      ].sort(),
    );
  });

  it('the rejected conductor recordings are nowhere: not listed, not shipped, not kept as masters', () => {
    const everything = [...walk(AUDIO), ...walk(join(ROOT, 'tools/audio/voices'))].map((p) =>
      p.toLowerCase(),
    );
    expect(everything.filter((p) => p.includes('conductor_cms'))).toEqual([]);
    expect(recorded.clips.some((c) => c.id.includes('conductor_cms'))).toBe(false);
  });

  it('at the default mix a voice peak leaves headroom before the master limiter (no clipping, no distortion)', () => {
    const raw = json<{ clips: { id: string; peakDb: number }[] }>('voices/recorded.json').clips;
    const d = DEFAULT_AUDIO_PREFS;
    for (const c of raw) {
      expect(c.peakDb, c.id).toBeLessThanOrEqual(-1);
      // loudest line gain is 1 (urgent); the voice bus follows the ambience slider; then the master slider
      const peak = Math.pow(10, c.peakDb / 20) * 1 * voiceLevel(d.ambience) * d.master;
      expect(20 * Math.log10(peak), c.id).toBeLessThan(-3);
    }
  });
});

describe('documentation', () => {
  it('docs/AUDIO.md records the rejection and how to add real recordings', () => {
    const doc = readFileSync(join(ROOT, 'docs/AUDIO.md'), 'utf8');
    expect(doc).toMatch(/rejected/i);
    expect(doc).toMatch(/recorded\.json/);
    expect(doc).toMatch(/music\/manifest\.json/);
  });
});
