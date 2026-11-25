/**
 * The approved soundtrack's release guards (decision AU5):
 *  - the shipped audio is byte-for-byte the approved audio (SHA-256 list, `npm run audio:release-verify`), which no CI
 *    step ran until now;
 *  - a rights-decision record exists ("cleared" or the founder's documented "founder-authorised", scoped to the SHA-256
 *    digest of the approved file list), and the deploy workflow refuses to publish the soundtrack to GitHub Pages on the
 *    publishing branch unless the record is complete.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

describe('approved soundtrack: rights decision gate', () => {
  type Rec = {
    status: string;
    clearedOn?: string | null;
    clearedBy?: string | null;
    evidence?: string | null;
    authorisedOn?: string;
    authorisedBy?: string;
    explicitProhibitionFound?: boolean;
    scope?: { files: number; sha256sumsDigest: string };
    acknowledgedRisks?: string[];
    withdraw?: string;
  };
  const rec = json('public/audio/release-clearance.json') as unknown as Rec;
  const sums = read('tools/audio/release/SHA256SUMS');

  it('has a record whose status is "not-cleared", "founder-authorised" or "cleared"', () => {
    expect(['not-cleared', 'founder-authorised', 'cleared']).toContain(rec.status);
  });

  it('"cleared" needs who / when / evidence; "founder-authorised" needs a complete, scoped, risk-aware record', () => {
    if (rec.status === 'cleared') {
      expect(rec.clearedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rec.clearedBy).toBeTruthy();
      expect(rec.evidence).toBeTruthy();
    } else if (rec.status === 'founder-authorised') {
      expect(rec.authorisedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rec.authorisedBy).toBeTruthy();
      expect(rec.explicitProhibitionFound).toBe(false);
      expect(rec.evidence).toBeTruthy();
      expect(rec.withdraw).toBeTruthy();
      expect((rec.acknowledgedRisks ?? []).length).toBeGreaterThanOrEqual(5);
    } else {
      expect(rec.clearedOn ?? null).toBeNull();
      expect(rec.clearedBy ?? null).toBeNull();
    }
  });

  it('a founder authorisation covers exactly the shipped file list (digest and count of SHA256SUMS)', () => {
    if (rec.status !== 'founder-authorised') return;
    expect(rec.scope?.sha256sumsDigest).toBe(createHash('sha256').update(sums).digest('hex'));
    expect(rec.scope?.files).toBe(sums.trim().split('\n').length);
  });

  it("the record never states a legal clearance, a licence or a lawyer's opinion it does not have, and carries no private address", () => {
    const raw = read('public/audio/release-clearance.json');
    if (rec.status === 'founder-authorised') expect(raw).toMatch(/NOT a legal clearance/);
    expect(raw).not.toMatch(/gemini\.google\.com/);
    expect(read('docs/AUDIO_PROVENANCE.md')).not.toMatch(/gemini\.google\.com\/app\/[a-z0-9]/i);
  });

  it('the provenance and assessment documents state the same status as the record', () => {
    const doc = read('docs/AUDIO_PROVENANCE.md').toLowerCase();
    const assessment = read('docs/AUDIO_RIGHTS_ASSESSMENT.md').toLowerCase();
    expect(doc).toContain('release-clearance.json');
    const word =
      rec.status === 'cleared'
        ? 'cleared'
        : rec.status === 'founder-authorised'
          ? 'founder-authorised'
          : 'not cleared';
    expect(doc).toContain(word);
    expect(assessment).toContain(word);
  });

  it('the deploy workflow refuses an incomplete rights record, only on the publishing branch', () => {
    const deploy = read('.github/workflows/deploy.yml');
    expect(deploy).toContain('site/audio/release-clearance.json');
    expect(deploy).toContain('founder-authorised');
    expect(deploy).toContain('explicitProhibitionFound == false');
    expect(deploy).toMatch(
      /if \[ "\$publish" = true \]; then\s+echo "::error title=Soundtrack rights record incomplete/,
    );
    // the dry run of any other branch only notes it
    expect(deploy).toContain('::notice title=Soundtrack rights record incomplete');
  });

  it('the music player never reads the rights record (it is a release record, not game data)', () => {
    for (const f of ['src/audio/music.ts', 'src/audio/playlist.ts', 'src/audio/engine.ts'])
      expect(existsSync(join(root, f)) ? read(f) : '').not.toContain('release-clearance');
  });
});
