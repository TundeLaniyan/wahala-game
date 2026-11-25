import { describe, expect, it } from 'vitest';
import { isDocPath, planFromDiff } from '../../scripts/ci/plan';
import { entries, problems, summarise } from '../../scripts/ci/report';
import type { JsonReport } from '../../scripts/ci/report';
import { attemptsDuration, balance, listLines, mergeTimings, weights } from '../../scripts/ci/shards';
import { splitUnit, unitWeights, verifyReports } from '../../scripts/ci/unit-shards';

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

const listedForShards = report([
  spec('one', 1, [
    { projectName: 'desktop', status: 'skipped', results: 0 },
    { projectName: 'mobile', status: 'skipped', results: 0 },
  ]),
  spec('two', 2, [{ projectName: 'desktop', status: 'skipped', results: 0 }]),
]);

describe('CI shards: duration-balanced test lists', () => {
  it('writes one --test-list line per spec x project with the describe path', () => {
    expect(listLines(listedForShards).map((t) => t.line)).toEqual([
      '[desktop] › a.spec.ts › group › one',
      '[mobile] › a.spec.ts › group › one',
      '[desktop] › a.spec.ts › group › two',
    ]);
  });

  it('puts every test in exactly one shard, longest first onto the least-loaded shard', () => {
    const tests = [10, 1, 7, 3, 3, 2, 9, 1].map((w, i) => ({ line: `t${i}`, weight: w }));
    const shards = balance(tests, 3);
    expect(shards.flatMap((s) => s.lines).sort()).toEqual(tests.map((t) => t.line).sort());
    expect(shards.map((s) => s.weight)).toEqual([12, 12, 12]);
    // more shards than tests: the extra shards are empty, nothing is lost
    expect(balance(tests.slice(0, 2), 4).map((s) => s.lines.length)).toEqual([1, 1, 0, 0]);
  });

  // twelve is the release default since 2026-11-20 (founder-approved); ten was the default before and stays a choice
  it.each([10, 12])('%i shards: every test exactly once, no shard far above the average', (n) => {
    // a suite shaped like the real one: a few heavy whole-board specs, many mid ones, a tail of quick ones
    const weightsMs = [...Array(12).fill(130_000), ...Array(40).fill(60_000), ...Array(60).fill(20_000)];
    const tests = weightsMs.map((w, i) => ({ line: `t${i}`, weight: w }));
    const shards = balance(tests, n);
    expect(shards).toHaveLength(n);
    expect(shards.flatMap((s) => s.lines).sort()).toEqual(tests.map((t) => t.line).sort());
    const total = weightsMs.reduce((a, b) => a + b, 0);
    const heaviest = Math.max(...shards.map((s) => s.weight));
    // longest-first onto the least-loaded shard stays within one heaviest test of a perfect split
    expect(heaviest).toBeLessThanOrEqual(total / n + 130_000);
  });

  it('weighs a test with no recorded duration by its spec file, or as a long test when the file is new', () => {
    const t = {
      '[desktop] › a.spec.ts › one': 10,
      '[desktop] › a.spec.ts › two': 30,
      '[mobile] › a.spec.ts › one': 4,
      '[desktop] › b.spec.ts › x': 20,
      '[desktop] › c.spec.ts › y': 100,
    };
    expect(
      weights(
        [
          '[desktop] › a.spec.ts › one',
          '[desktop] › a.spec.ts › three', // new test, known file and project: the file's mean
          '[mobile] › a.spec.ts › three', // the same file on the phone: the phone mean
          '[desktop] › new.spec.ts › z', // a new file: the 90th percentile of every recorded test
        ],
        t,
      ),
    ).toEqual([10, 20, 4, 100]);
    expect(weights(['x'], {})).toEqual([60_000]);
  });
});

describe('E2E shard timings: what a test costs its runner (decision FU2-CI4)', () => {
  it('adds up every attempt, so a retried test counts its failed try too', () => {
    expect(attemptsDuration([{ duration: 530_000 }, { duration: 480_000 }])).toBe(1_010_000);
    expect(attemptsDuration([{ duration: 5 }])).toBe(5);
    expect(attemptsDuration([])).toBeNull();
    const report = {
      suites: [
        {
          title: 'a.spec.ts',
          specs: [
            {
              title: 'flaky',
              tests: [{ projectName: 'desktop', results: [{ duration: 500 }, { duration: 400 }] }],
            },
          ],
        },
      ],
    } as unknown as JsonReport;
    expect(listLines(report)).toEqual([{ line: '[desktop] › a.spec.ts › flaky', duration: 900 }]);
  });

  it('keeps the last known duration of a test a later run did not reach, and lets a positive new one replace it', () => {
    const previous = { a: 60_000, b: 30_000, c: 10_000 };
    const latest = { a: 90_000, b: 0, d: 0, e: 5_000 }; // b was skipped this time, d is a new skipped test
    expect(mergeTimings(previous, latest)).toEqual({ a: 90_000, b: 30_000, c: 10_000, d: 0, e: 5_000 });
  });
});

describe('Unit shards: balanced by file duration, and every file runs exactly once (decision FU2-CI5)', () => {
  const files = [
    'tests/a.test.ts',
    'tests/b.test.ts',
    'tests/c.test.ts',
    'tests/d.test.ts',
    'tests/e.test.ts',
  ];

  it('puts the longest files on different shards and weighs an unknown file at the mean of the known ones', () => {
    const timings = { 'tests/a.test.ts': 120_000, 'tests/b.test.ts': 110_000, 'tests/c.test.ts': 10_000 };
    const w = unitWeights(files, timings);
    expect(w.slice(0, 3)).toEqual([120_000, 110_000, 10_000]);
    expect(w[3]).toBe(80_000); // (120 + 110 + 10) / 3
    const shards = splitUnit(files, timings, 2);
    const of = (f: string) => shards.findIndex((s) => s.files.includes(f));
    expect(of('tests/a.test.ts')).not.toBe(of('tests/b.test.ts'));
    expect(shards.flatMap((s) => s.files).sort()).toEqual([...files].sort()); // each file once, none lost
    expect(unitWeights(files, {})).toEqual([1, 1, 1, 1, 1]); // nothing recorded: a count split
  });

  const report = (names: string[], extra: Record<string, unknown> = {}) => ({
    numTotalTests: names.length * 2,
    numFailedTests: 0,
    testResults: names.map((n, i) => ({
      name: `/work/repo/${n}`,
      status: 'passed',
      startTime: 1000,
      endTime: 1000 + 500 * (i + 1),
    })),
    ...extra,
  });

  it('accepts a complete, passing set of shard reports and reads each file duration', () => {
    const v = verifyReports(files, [report(files.slice(0, 2)), report(files.slice(2))], '/work/repo');
    expect(v.problems).toEqual([]);
    expect(v.files).toBe(5);
    expect(v.durations['tests/a.test.ts']).toBe(500);
  });

  it('names a lost file, a repeated file, an unknown file and a failure', () => {
    const lost = verifyReports(files, [report(files.slice(0, 4))], '/work/repo');
    expect(lost.problems).toEqual(['did not run in any shard: tests/e.test.ts']);
    const twice = verifyReports(files, [report(files), report(['tests/a.test.ts'])], '/work/repo');
    expect(twice.problems).toEqual(['ran 2 times: tests/a.test.ts']);
    const stray = verifyReports(files, [report([...files, 'tests/z.test.ts'])], '/work/repo');
    expect(stray.problems).toEqual(['ran but is not a listed test file: tests/z.test.ts']);
    const bad = report(files, { numFailedTests: 1 });
    (bad.testResults[2] as { status: string }).status = 'failed';
    expect(verifyReports(files, [bad], '/work/repo').problems).toEqual([
      'failed file: tests/c.test.ts',
      '1 test(s) failed',
    ]);
  });
});
