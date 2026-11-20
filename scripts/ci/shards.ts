/**
 * Duration-balanced E2E shards (docs/CI.md, "Shard balance").
 *
 * Playwright's own `--shard=i/N` splits the ordered test list by count. Here the desktop tests are about twice
 * as slow as the phone ones and the skipped-by-design tests cluster, so a count split left one shard of eight
 * at 23 minutes and another at 3. Instead every test from `playwright test --list` goes to exactly one shard,
 * longest first, onto the shard with the least work so far (LPT), using the per-test durations the previous
 * successful run recorded (`timings` below); a test with none is estimated (`weights`). Each shard
 * then runs `playwright test --test-list shard-i.txt`; the report job checks that every listed test ran once.
 *
 *   node --experimental-strip-types scripts/ci/shards.ts split <listed.json> <timings.json|-> <N> <outdir>
 *   node --experimental-strip-types scripts/ci/shards.ts timings <merged.json> <out.json>
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { JsonReport } from './report';

interface Suite {
  title: string;
  specs?: { title: string; tests: { projectName: string; results: { duration: number }[] }[] }[];
  suites?: Suite[];
}

/** One `--test-list` line per spec x project: `[project] › file › describe › title`. */
export function listLines(report: JsonReport): { line: string; duration: number | null }[] {
  const out: { line: string; duration: number | null }[] = [];
  const walk = (suite: Suite, path: string[]): void => {
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests) {
        const last = t.results[t.results.length - 1];
        out.push({
          line: [`[${t.projectName}]`, ...path, spec.title].join(' › '),
          duration: last ? last.duration : null,
        });
      }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  for (const file of report.suites as Suite[]) walk(file, [file.title]);
  return out;
}

/** Longest-processing-time-first assignment; deterministic for equal weights (stable order, lowest shard). */
export function balance(
  tests: readonly { line: string; weight: number }[],
  n: number,
): { lines: string[]; weight: number }[] {
  const shards = Array.from({ length: n }, () => ({ lines: [] as string[], weight: 0 }));
  const order = tests.map((t, i) => ({ ...t, i })).sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const t of order) {
    let best = shards[0]!;
    for (const s of shards) if (s.weight < best.weight) best = s;
    best.lines.push(t.line);
    best.weight += t.weight;
  }
  return shards;
}

/** `[project] › file` of a list line: tests in one spec file on one project cost alike (same setup, same page loads). */
const fileOf = (line: string): string => line.split(' › ').slice(0, 2).join(' › ');

/**
 * A test's expected cost: its recorded duration; else the mean of the recorded tests of its spec file on its project
 * (a new test in a known file); else the 90th percentile of every recorded test (a new file: its tests are often long
 * scenario runs, and counting them as the median put several on one shard, which then ran past the step limit with
 * every test passing: CI runs 295-297). Overestimating an unknown test only leaves a shard a little short.
 */
export function weights(lines: readonly string[], timings: Readonly<Record<string, number>>): number[] {
  const recorded = Object.entries(timings).filter(([, d]) => typeof d === 'number');
  const sorted = recorded.map(([, d]) => d).sort((a, b) => a - b);
  const p90 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]! : 60_000;
  const byFile = new Map<string, { sum: number; n: number }>();
  for (const [line, d] of recorded) {
    const f = byFile.get(fileOf(line)) ?? { sum: 0, n: 0 };
    f.sum += d;
    f.n++;
    byFile.set(fileOf(line), f);
  }
  return lines.map((l) => {
    const own = timings[l];
    if (typeof own === 'number') return own;
    const f = byFile.get(fileOf(l));
    return f ? f.sum / f.n : p90;
  });
}

const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`;

function split(listedPath: string, timingsPath: string, n: number, outdir: string): void {
  const listed = JSON.parse(readFileSync(listedPath, 'utf8')) as JsonReport;
  const timings: Record<string, number> =
    timingsPath !== '-' && existsSync(timingsPath) ? JSON.parse(readFileSync(timingsPath, 'utf8')) : {};
  const lines = listLines(listed).map((t) => t.line);
  const w = weights(lines, timings);
  const shards = balance(
    lines.map((line, i) => ({ line, weight: w[i]! })),
    n,
  );
  mkdirSync(outdir, { recursive: true });
  shards.forEach((s, i) => writeFileSync(join(outdir, `shard-${i + 1}.txt`), `${s.lines.join('\n')}\n`));
  const known = lines.filter((l) => l in timings).length;
  const md = [
    '### E2E shard plan',
    '',
    `${lines.length} tests over ${n} shards, longest first; ${known} with a duration from the last successful run (others: their spec file's mean, or the 90th percentile for a new file).`,
    '',
    '| Shard | Tests | Expected (last run speed) |',
    '| --- | --- | --- |',
    ...shards.map((s, i) => `| ${i + 1}/${n} | ${s.lines.length} | ${minutes(s.weight)} |`),
    '',
  ].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

function main(argv: string[]): number {
  const [mode, a, b, c, d] = argv;
  if (mode === 'split' && a && b && c && d) {
    split(a, b, Number(c), d);
    return 0;
  }
  if (mode === 'timings' && a && b) {
    const merged = JSON.parse(readFileSync(a, 'utf8')) as JsonReport;
    const out: Record<string, number> = {};
    for (const t of listLines(merged)) if (t.duration !== null) out[t.line] = t.duration;
    writeFileSync(b, JSON.stringify(out, null, 1));
    return 0;
  }
  console.error(
    'usage: shards.ts split <listed.json> <timings.json|-> <N> <outdir> | shards.ts timings <merged.json> <out.json>',
  );
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = main(process.argv.slice(2));
