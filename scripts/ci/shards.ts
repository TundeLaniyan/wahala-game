/**
 * Duration-balanced E2E shards (docs/CI.md, "Shard balance").
 *
 * Playwright's own `--shard=i/N` splits the ordered test list by count. Here the desktop tests are about twice
 * as slow as the phone ones and the skipped-by-design tests cluster, so a count split left one shard of eight
 * at 23 minutes and another at 3. Instead every test from `playwright test --list` goes to exactly one shard,
 * longest first, onto the shard with the least work so far (LPT), using the per-test durations the previous
 * successful run recorded (`timings` below). A test with no recorded duration counts as the median. Each shard
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

export function weights(lines: readonly string[], timings: Readonly<Record<string, number>>): number[] {
  const known = lines.map((l) => timings[l]).filter((d): d is number => typeof d === 'number');
  const sorted = [...known].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 60_000;
  return lines.map((l) => timings[l] ?? median);
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
    `${lines.length} tests over ${n} shards, longest first; ${known} with a duration from the last successful run (others count as the median).`,
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
