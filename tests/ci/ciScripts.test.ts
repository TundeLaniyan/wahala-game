import { describe, expect, it } from 'vitest';
import { isDocPath, planFromDiff } from '../../scripts/ci/plan';
import { entries, problems, summarise } from '../../scripts/ci/report';
import type { JsonReport } from '../../scripts/ci/report';

describe('CI plan: when the browser suite may be skipped', () => {
  it('treats only docs/, reference/, README.md and CLAUDE.md as documentation', () => {
    for (const p of [
      'docs/CI.md',
      'docs/screenshots/a.png',
      'reference/gameplay-still.jpg',
      'README.md',
      'CLAUDE.md',
    ])
      expect(isDocPath(p)).toBe(true);
    for (const p of [
      'src/main.ts',
      'public/audio/LICENSES.md',
      'tools/assets/README.md',
      '.github/workflows/ci.yml',
      'package-lock.json',
      'playwright.config.ts',
      'e2e/mobile.spec.ts',
      'scripts/ci/plan.ts',
      'docsx/a.md',
    ])
      expect(isDocPath(p)).toBe(false);
  });

  it('skips only for a pure documentation diff; any code, an unknown diff or nothing verified means full', () => {
    expect(planFromDiff('abc1234def', ['docs/A.md', 'README.md']).full).toBe(false);
    expect(planFromDiff('abc1234def', []).full).toBe(false); // the same commit, already verified
    expect(planFromDiff('abc1234def', ['docs/A.md', 'src/x.ts']).full).toBe(true);
    expect(planFromDiff('abc1234def', ['.github/workflows/deploy.yml']).full).toBe(true);
    expect(planFromDiff('abc1234def', null).full).toBe(true);
  });
});

const spec = (
  title: string,
  line: number,
  tests: { projectName: string; status: string; results: number }[],
) => ({
  title,
  file: 'a.spec.ts',
  line,
  column: 3,
  tests: tests.map((t) => ({
    projectName: t.projectName,
    status: t.status,
    results: Array.from({ length: t.results }, (_, retry) => ({ status: 'passed', retry, duration: 1 })),
  })),
});
const report = (specs: ReturnType<typeof spec>[]) =>
  ({ suites: [{ title: 'a.spec.ts', suites: [{ title: 'group', specs }] }] }) as unknown as JsonReport;

describe('CI report: merged shards against the full test list', () => {
  const listed = report([
    spec('one', 1, [
      { projectName: 'desktop', status: 'skipped', results: 0 },
      { projectName: 'mobile', status: 'skipped', results: 0 },
    ]),
    spec('two', 2, [{ projectName: 'desktop', status: 'skipped', results: 0 }]),
  ]);

  it('counts passed, flaky (kept visible), skipped and retries', () => {
    const merged = report([
      spec('one', 1, [
        { projectName: 'desktop', status: 'expected', results: 1 },
        { projectName: 'mobile', status: 'flaky', results: 2 },
      ]),
      spec('two', 2, [{ projectName: 'desktop', status: 'skipped', results: 1 }]),
    ]);
    const s = summarise(listed, merged);
    expect(s).toMatchObject({ total: 3, passed: 1, flaky: 1, failed: 0, skipped: 1, retries: 1 });
    expect(s.flakyTests).toEqual(['[mobile] a.spec.ts:1:3 › group › one']);
    expect(problems(s)).toEqual([]);
  });

  it('fails on a failed test, a test no shard ran, or a test two shards ran', () => {
    const merged = report([
      spec('one', 1, [
        { projectName: 'desktop', status: 'unexpected', results: 2 },
        { projectName: 'desktop', status: 'expected', results: 1 },
      ]),
    ]);
    const s = summarise(listed, merged);
    expect(s.missing.sort()).toEqual([
      '[desktop] a.spec.ts:2:3 › group › two',
      '[mobile] a.spec.ts:1:3 › group › one',
    ]);
    expect(s.duplicated).toEqual(['[desktop] a.spec.ts:1:3 › group › one']);
    expect(problems(s)).toHaveLength(3);
  });

  it('keys tests by project, location and describe path', () => {
    expect(entries(listed).map((e) => e.key)).toEqual([
      '[desktop] a.spec.ts:1:3 › group › one',
      '[mobile] a.spec.ts:1:3 › group › one',
      '[desktop] a.spec.ts:2:3 › group › two',
    ]);
  });
});
