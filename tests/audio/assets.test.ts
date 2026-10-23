/**
 * Guards the founder's decision on the generated audio of the `claude/wahala-lagos-audio` branch:
 * the synthetic Afrobeats music, the synthetic Pidgin voices and the generated Lagos ambience beds
 * were REJECTED. The playback infrastructure is kept, but nothing generated may ship or play.
 *
 * The ONLY audio files allowed are the founder's ten approved Pixabay tracks, listed below by id and
 * in public/audio/music/manifest.json. Adding any other audio means changing this list deliberately.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMusicManifest } from '../../src/audio/playlist';
import type { RecordedManifest, VoiceManifest } from '../../src/audio/pidgin';

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
  it('the only audio files under public/audio are approved Pixabay tracks in public/audio/music', () => {
    const audioFiles = walk(AUDIO)
      .map((p) => relative(AUDIO, p).split('\\').join('/'))
      .filter((p) => /\.(ogg|mp3|wav|m4a|flac|aac|opus|webm)$/i.test(p));
    const allowed = new Set(Object.keys(APPROVED).map((id) => `music/${id}.mp3`));
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

  it('the voice catalogue has no packs and is not flagged as shipping synthetic speech', () => {
    const v = json<VoiceManifest>('voices/voices.json');
    expect(v.packs).toEqual({});
    expect(v.synthetic).toBe(false);
    expect(v.note).toMatch(/no voice audio is shipped/i);
  });

  it('no recordings are listed for the Pidgin lines or the sample slots', () => {
    expect(json<RecordedManifest>('voices/recorded.json').clips).toEqual([]);
    expect(json<{ slots: Record<string, unknown> }>('slots.json').slots).toEqual({});
  });

  it('the generators of the rejected audio are not in the repository', () => {
    expect(() => statSync(join(ROOT, 'tools/audiogen'))).toThrow();
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
