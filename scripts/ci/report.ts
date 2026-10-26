/**
 * CI report for the sharded Playwright suite (docs/CI.md).
 *
 *   node --experimental-strip-types scripts/ci/report.ts tests <listed.json> <merged.json>
 *     Compares the merged report of every shard with `playwright test --list` of the same commit: each
 *     listed test (spec x project) must have run in exactly one shard. Prints totals (passed, failed,
 *     skipped, flaky, retries) and the flaky tests by name. Exits 1 on a failed, missing or duplicated test.
 *
 *   node --experimental-strip-types scripts/ci/report.ts timings
 *     Durations of this run's jobs (each shard, the fast checks) and the wall clock so far, from the API.
 *
 * Markdown goes to $GITHUB_STEP_SUMMARY when set (stdout otherwise).
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

type Status = 'expected' | 'unexpected' | 'flaky' | 'skipped';

interface JsonTest {
  projectName: string;
  status: Status;
  results: { status: string; retry: number; duration: number }[];
}
interface JsonSpec {
  title: string;
  file: string;
  line: number;
  column: number;
  tests: JsonTest[];
}
interface JsonSuite {
  title: string;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
}
export interface JsonReport {
  suites: JsonSuite[];
  stats?: { duration: number };
}

export interface Entry {
  key: string;
  status: Status;
  retries: number;
}

/** Every spec x project in a JSON report, keyed by project, location and title path. */
export function entries(report: JsonReport): Entry[] {
  const out: Entry[] = [];
  const walk = (suite: JsonSuite, path: string[]): void => {
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests)
        out.push({
          key: `[${t.projectName}] ${spec.file}:${spec.line}:${spec.column} › ${[...path, spec.title].join(' › ')}`,
          status: t.status,
          retries: Math.max(0, t.results.length - 1),
        });
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  // the top-level suites are files: their title is the file name, already in the key
  for (const file of report.suites) walk(file, []);
  return out;
}

export interface TestSummary {
  total: number;
  passed: number;
  flaky: number;
  failed: number;
  skipped: number;
  retries: number;
  missing: string[];
  duplicated: string[];
  unexpected: string[];
  flakyTests: string[];
  failedTests: string[];
}

export function summarise(listed: JsonReport, merged: JsonReport): TestSummary {
  const ran = entries(merged);
  const counts = new Map<string, number>();
  for (const e of ran) counts.set(e.key, (counts.get(e.key) ?? 0) + 1);
  const listedKeys = new Set(entries(listed).map((e) => e.key));
  const by = (s: Status) => ran.filter((e) => e.status === s);
  return {
    total: ran.length,
    passed: by('expected').length,
    flaky: by('flaky').length,
    failed: by('unexpected').length,
    skipped: by('skipped').length,
    retries: ran.reduce((n, e) => n + e.retries, 0),
    missing: [...listedKeys].filter((k) => !counts.has(k)),
    duplicated: [...counts].filter(([, n]) => n > 1).map(([k]) => k),
    unexpected: [...counts.keys()].filter((k) => !listedKeys.has(k)),
    flakyTests: by('flaky').map((e) => e.key),
    failedTests: by('unexpected').map((e) => e.key),
  };
}

export function testsMarkdown(s: TestSummary, listedTotal: number): string {
  const list = (title: string, keys: string[]) =>
    keys.length ? `\n**${title} (${keys.length})**\n\n${keys.map((k) => `- \`${k}\``).join('\n')}\n` : '';
  return [
    '### Playwright (all shards merged)',
    '',
    '| Listed | Ran | Passed | Flaky (passed on retry) | Failed | Skipped | Retries |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${listedTotal} | ${s.total} | ${s.passed} | ${s.flaky} | ${s.failed} | ${s.skipped} | ${s.retries} |`,
    list('Failed', s.failedTests),
    list('Flaky', s.flakyTests),
    list('Listed but never run (missing from every shard)', s.missing),
    list('Run by more than one shard', s.duplicated),
    list('Run but not listed', s.unexpected),
  ]
    .filter((line, i) => i < 5 || line)
    .join('\n');
}

export const problems = (s: TestSummary): string[] => [
  ...(s.failed ? [`${s.failed} test(s) failed`] : []),
  ...(s.missing.length ? [`${s.missing.length} listed test(s) did not run in any shard`] : []),
  ...(s.duplicated.length ? [`${s.duplicated.length} test(s) ran in more than one shard`] : []),
  ...(s.unexpected.length ? [`${s.unexpected.length} test(s) ran that are not in the list`] : []),
];

const minutes = (ms: number) =>
  `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`;

interface Job {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

async function timingsMarkdown(): Promise<string> {
  const api = async <T>(path: string): Promise<T> => {
    const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
      headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return (await res.json()) as T;
  };
  const runId = process.env.GITHUB_RUN_ID;
  const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';
  const run = await api<{ run_started_at: string }>(`/actions/runs/${runId}`);
  const { jobs } = await api<{ jobs: Job[] }>(`/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`);
  const now = Date.now();
  const rows = jobs
    .filter((j) => j.started_at)
    .map((j) => {
      const end = j.completed_at ? Date.parse(j.completed_at) : now;
      const dur = end - Date.parse(j.started_at!);
      return `| ${j.name} | ${j.conclusion ?? j.status} | ${minutes(dur)} |`;
    });
  const shards = jobs.filter((j) => j.name.startsWith('E2E shard') && j.started_at && j.completed_at);
  const durs = shards.map((j) => Date.parse(j.completed_at!) - Date.parse(j.started_at!));
  const spread = durs.length
    ? `\nShards: ${durs.length}, slowest ${minutes(Math.max(...durs))}, fastest ${minutes(Math.min(...durs))}, sum ${minutes(durs.reduce((a, b) => a + b, 0))}.\n`
    : '';
  return [
    '### Timings',
    '',
    `Wall clock from run start to this job: **${minutes(now - Date.parse(run.run_started_at))}** (attempt ${attempt}).`,
    spread,
    '| Job | Result | Duration |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function emit(markdown: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  console.log(markdown);
}

async function main(argv: string[]): Promise<number> {
  const [mode, listedPath, mergedPath] = argv;
  if (mode === 'timings') {
    emit(await timingsMarkdown());
    return 0;
  }
  if (mode !== 'tests' || !listedPath || !mergedPath) {
    console.error('usage: report.ts tests <listed.json> <merged.json> | report.ts timings');
    return 2;
  }
  const listed = JSON.parse(readFileSync(listedPath, 'utf8')) as JsonReport;
  const merged = JSON.parse(readFileSync(mergedPath, 'utf8')) as JsonReport;
  const summary = summarise(listed, merged);
  emit(testsMarkdown(summary, entries(listed).length));
  const bad = problems(summary);
  for (const p of bad) console.log(`::error title=Playwright::${p}`);
  for (const k of summary.flakyTests) console.log(`::warning title=Flaky test (passed on retry)::${k}`);
  return bad.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = await main(process.argv.slice(2));
