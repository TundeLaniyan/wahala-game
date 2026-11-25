/**
 * Duration-balanced unit-test shards (docs/CI.md, "Unit shards", decision FU2-CI5).
 *
 * `vitest run` on one runner took 15 to 20 minutes against a 20-minute step limit (run 330 was cancelled at 20m15s), and
 * the browser shards used to wait for it. Vitest's own `--shard=i/N` splits the hash-ordered file list by count, which
 * ignores that a handful of files (the scripted district and boss playthroughs) take two minutes each. So, as for the
 * browser suite (`shards.ts`), every test file goes to exactly one shard, longest first, onto the shard with the least
 * work so far, using the per-file durations the previous run recorded (`timings`) or the committed seed; a file with
 * none is estimated at the mean. Each shard runs `vitest run <its files>` with the JSON reporter; the `unit` job (the
 * one the CI gate reads) then checks that every file ran exactly once and nothing failed, so no test can be lost.
 *
 *   node --experimental-strip-types scripts/ci/unit-shards.ts split <timings.json|-> <N> <outdir>
 *   node --experimental-strip-types scripts/ci/unit-shards.ts verify <N> <reports-dir> <timings-out.json> [previous.json|-]
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { balance } from './shards.ts';

/** Every unit-test file (vite.config.ts: `tests/**\/*.test.ts`), posix paths relative to `root`, sorted. */
export function listTestFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.test.ts')) out.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(join(root, 'tests'));
  return out.sort();
}

/** A file's expected cost: its recorded duration, else the mean of the recorded ones (1 when nothing is recorded). */
export function unitWeights(files: readonly string[], timings: Readonly<Record<string, number>>): number[] {
  const known = files.map((f) => timings[f]).filter((d): d is number => typeof d === 'number' && d > 0);
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  return files.map((f) => (typeof timings[f] === 'number' && timings[f]! > 0 ? timings[f]! : mean));
}

export function splitUnit(
  files: readonly string[],
  timings: Readonly<Record<string, number>>,
  n: number,
): { files: string[]; weight: number }[] {
  const w = unitWeights(files, timings);
  return balance(
    files.map((line, i) => ({ line, weight: w[i]! })),
    n,
  ).map((s) => ({ files: s.lines.sort(), weight: s.weight }));
}

/** The part of vitest's JSON report this script reads. */
export interface VitestJson {
  numFailedTests?: number;
  numTotalTests?: number;
  success?: boolean;
  testResults?: { name: string; status?: string; startTime?: number; endTime?: number }[];
}

export interface UnitVerdict {
  problems: string[];
  /** file -> milliseconds it took in this run (from the shards that ran it). */
  durations: Record<string, number>;
  files: number;
  tests: number;
  failed: number;
}

/**
 * Every expected file ran in exactly one shard report, no report holds an unexpected file, and nothing failed.
 * `reports` are the parsed JSON reports; `root` is the checkout path the absolute `name`s start with.
 */
export function verifyReports(
  expected: readonly string[],
  reports: readonly VitestJson[],
  root: string,
): UnitVerdict {
  const prefix = `${root.split(sep).join('/').replace(/\/$/, '')}/`;
  const seen = new Map<string, number>();
  const durations: Record<string, number> = {};
  let tests = 0;
  let failed = 0;
  const problems: string[] = [];
  for (const r of reports) {
    tests += r.numTotalTests ?? 0;
    failed += r.numFailedTests ?? 0;
    for (const t of r.testResults ?? []) {
      const name = t.name.split(sep).join('/');
      const file = name.startsWith(prefix) ? name.slice(prefix.length) : name;
      seen.set(file, (seen.get(file) ?? 0) + 1);
      if (typeof t.startTime === 'number' && typeof t.endTime === 'number' && t.endTime > t.startTime)
        durations[file] = Math.round(t.endTime - t.startTime);
      if (t.status === 'failed') problems.push(`failed file: ${file}`);
    }
  }
  const want = new Set(expected);
  for (const f of expected) if (!seen.has(f)) problems.push(`did not run in any shard: ${f}`);
  for (const [f, k] of seen) {
    if (!want.has(f)) problems.push(`ran but is not a listed test file: ${f}`);
    else if (k > 1) problems.push(`ran ${k} times: ${f}`);
  }
  if (failed > 0) problems.push(`${failed} test(s) failed`);
  return { problems, durations, files: seen.size, tests, failed };
}

const minutes = (ms: number): string => `${(ms / 60_000).toFixed(1)} min`;

function split(timingsPath: string, n: number, outdir: string): void {
  const files = listTestFiles('.');
  const timings: Record<string, number> =
    timingsPath !== '-' && existsSync(timingsPath) ? JSON.parse(readFileSync(timingsPath, 'utf8')) : {};
  const shards = splitUnit(files, timings, n);
  mkdirSync(outdir, { recursive: true });
  shards.forEach((s, i) => writeFileSync(join(outdir, `unit-${i + 1}.txt`), `${s.files.join('\n')}\n`));
  writeFileSync(join(outdir, 'all.txt'), `${files.join('\n')}\n`);
  const known = files.filter((f) => (timings[f] ?? 0) > 0).length;
  const md = [
    '### Unit shard plan',
    '',
    `${files.length} test files over ${n} shards, longest first; ${known} with a recorded duration (others: the mean).`,
    '',
    '| Shard | Files | Expected |',
    '| --- | --- | --- |',
    ...shards.map((s, i) => `| ${i + 1}/${n} | ${s.files.length} | ${minutes(s.weight)} |`),
    '',
  ].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

function verify(n: number, dir: string, timingsOut: string, previousPath: string | undefined): number {
  const expected = readFileSync(join(dir, 'all.txt'), 'utf8').split('\n').filter(Boolean);
  const reports: VitestJson[] = [];
  const lost: string[] = [];
  for (let i = 1; i <= n; i++) {
    const p = join(dir, `unit-report-${i}.json`);
    if (existsSync(p)) reports.push(JSON.parse(readFileSync(p, 'utf8')) as VitestJson);
    else lost.push(`no report from shard ${i}/${n}`);
  }
  const v = verifyReports(expected, reports, process.cwd());
  v.problems.unshift(...lost);
  const previous: Record<string, number> =
    previousPath && previousPath !== '-' && existsSync(previousPath)
      ? JSON.parse(readFileSync(previousPath, 'utf8'))
      : {};
  writeFileSync(timingsOut, JSON.stringify({ ...previous, ...v.durations }, null, 1));
  const md = [
    '### Unit tests (all shards)',
    '',
    `${v.files} of ${expected.length} test files ran, ${v.tests} tests, ${v.failed} failed.`,
    '',
    ...(v.problems.length ? ['**Problems**', '', ...v.problems.slice(0, 40).map((p) => `- ${p}`), ''] : []),
  ].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  return v.problems.length ? 1 : 0;
}

function main(argv: string[]): number {
  const [mode, a, b, c, d] = argv;
  if (mode === 'split' && a && b && c) {
    split(a, Number(b), c);
    return 0;
  }
  if (mode === 'verify' && a && b && c) return verify(Number(a), b, c, d);
  console.error(
    'usage: unit-shards.ts split <timings.json|-> <N> <outdir> | unit-shards.ts verify <N> <reports-dir> <timings-out.json> [previous.json|-]',
  );
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = main(process.argv.slice(2));
