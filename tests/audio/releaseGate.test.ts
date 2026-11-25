/**
 * The approved soundtrack's release guards (decision AU5):
 *  - the shipped audio is byte-for-byte the approved audio (SHA-256 list, `npm run audio:release-verify`), which no CI
 *    step ran until now;
 *  - a commercial-rights clearance record exists, and the deploy workflow refuses to publish the soundtrack to GitHub
 *    Pages on the publishing branch unless the record says "cleared".
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const json = (p: string): Record<string, unknown> => JSON.parse(read(p)) as Record<string, unknown>;

describe('approved soundtrack: integrity', () => {
  it('every shipped file matches its approved SHA-256 and the manifest is consistent', () => {
    const r = spawnSync(process.execPath, ['tools/audio/release/verify.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('files match SHA256SUMS');
  });

  it('SHA256SUMS lists every approved music file and nothing else is shipped under the approved names', () => {
    const listed = read('tools/audio/release/SHA256SUMS')
      .trim()
      .split('\n')
      .map((l) => l.split(/\s{2}/)[1]!);
    const manifest = json('public/audio/music/manifest.json') as {
      tracks: { id: string; file: string; lite?: string }[];
    };
    for (const t of manifest.tracks.filter((x) => /^(dist|lnds)_/.test(x.id))) {
      expect(listed, t.id).toContain(`public/audio/music/${t.file}`);
      if (t.lite) expect(listed, `${t.id} Data Saver`).toContain(`public/audio/music/${t.lite}`);
    }
  });
});

describe('approved soundtrack: commercial-rights clearance gate', () => {
  const clearance = json('public/audio/release-clearance.json') as {
    status: string;
    clearedOn: string | null;
    clearedBy: string | null;
    evidence: string | null;
  };

  it('has a record whose status is exactly "not-cleared" or "cleared"', () => {
    expect(['not-cleared', 'cleared']).toContain(clearance.status);
  });

  it('"cleared" requires who, when and where the evidence is kept; "not-cleared" must not claim them', () => {
    if (clearance.status === 'cleared') {
      expect(clearance.clearedOn, 'clearedOn').toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(clearance.clearedBy, 'clearedBy').toBeTruthy();
      expect(clearance.evidence, 'evidence').toBeTruthy();
    } else {
      expect(clearance.clearedOn).toBeNull();
      expect(clearance.clearedBy).toBeNull();
      expect(clearance.evidence).toBeNull();
    }
  });

  it('the provenance document states the same status as the record', () => {
    const doc = read('docs/AUDIO_PROVENANCE.md');
    expect(doc).toContain('release-clearance.json');
    expect(doc.toLowerCase()).toContain(clearance.status === 'cleared' ? 'cleared' : 'not cleared');
  });

  it('the deploy workflow refuses to publish an uncleared soundtrack, only on the publishing branch', () => {
    const deploy = read('.github/workflows/deploy.yml');
    expect(deploy).toContain('site/audio/release-clearance.json');
    expect(deploy).toMatch(/\[ "\$clearance" != cleared \]/);
    expect(deploy).toMatch(/if \[ "\$publish" = true \]; then\s+echo "::error title=Soundtrack not cleared/);
    // the dry run of any other branch only notes it
    expect(deploy).toContain('::notice title=Soundtrack not cleared');
  });

  it('the music player never reads the clearance record (it is a release record, not game data)', () => {
    for (const f of ['src/audio/music.ts', 'src/audio/playlist.ts', 'src/audio/engine.ts'])
      expect(existsSync(join(root, f)) ? read(f) : '').not.toContain('release-clearance');
  });
});
