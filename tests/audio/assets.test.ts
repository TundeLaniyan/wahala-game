/**
 * Guards the founder's decision on the generated audio of the `claude/wahala-lagos-audio` branch:
 * the synthetic Afrobeats music, the synthetic Pidgin voices and the generated Lagos ambience beds
 * were REJECTED. The playback infrastructure is kept, but nothing generated may ship or play until
 * real, licensed files are added through the manifests (see docs/AUDIO.md).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MusicManifest } from '../../src/audio/music';
import type { RecordedManifest, VoiceManifest } from '../../src/audio/pidgin';

const ROOT = join(__dirname, '../..');
const AUDIO = join(ROOT, 'public/audio');
const json = <T>(rel: string): T => JSON.parse(readFileSync(join(AUDIO, rel), 'utf8')) as T;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('rejected generated audio stays disabled', () => {
  it('ships no audio files at all under public/audio (only manifests and docs)', () => {
    const audioFiles = walk(AUDIO)
      .map((p) => relative(AUDIO, p))
      .filter((p) => /\.(ogg|mp3|wav|m4a|flac|aac|opus)$/i.test(p));
    expect(audioFiles).toEqual([]);
  });

  it('the music manifest lists no tracks, so the music player stays silent', () => {
    expect(json<MusicManifest>('music/manifest.json').tracks).toEqual({});
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
