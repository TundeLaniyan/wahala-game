/**
 * CI plan: does this commit need the full Playwright browser suite?
 *
 * The suite is skipped only when every file changed since the nearest *verified* ancestor is documentation
 * (DOC_PATHS). "Verified" means a run of this workflow *on the same branch* whose `CI gate` job succeeded on
 * that commit, so a docs-only commit can never inherit verification from a run that was cancelled, failed or
 * never ran the suite: the chain always ends at a commit whose browser suite passed. Same branch, so a code
 * change verified on a feature branch still gets its full run (and so its release) on the publishing branch.
 * Anything uncertain (no verified ancestor, an API error, a truncated diff, a forced run) means the full
 * suite. See docs/CI.md.
 *
 * Usage (GitHub Actions): `node --experimental-strip-types scripts/ci/plan.ts` with GITHUB_TOKEN,
 * GITHUB_REPOSITORY, HEAD_SHA, BRANCH and optionally FORCE_FULL=true. Writes `full`, `reason` and `base` to
 * $GITHUB_OUTPUT.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Paths that are never part of the game build, the unit tests' inputs aside (the fast checks always run). */
const DOC_PREFIXES = ['docs/', 'reference/'];
const DOC_FILES = new Set(['README.md', 'CLAUDE.md']);

export const isDocPath = (path: string): boolean =>
  DOC_FILES.has(path) || DOC_PREFIXES.some((prefix) => path.startsWith(prefix));

export interface Plan {
  full: boolean;
  reason: string;
  base: string;
}

/** The decision for one verified ancestor's diff; `files` is null when the diff could not be listed in full. */
export function planFromDiff(base: string, files: readonly string[] | null): Plan {
  if (files === null)
    return { full: true, reason: `diff from verified ${base.slice(0, 7)} is too large to list`, base };
  const code = files.filter((f) => !isDocPath(f));
  if (code.length === 0)
    return {
      full: false,
      reason: `only documentation changed since verified ${base.slice(0, 7)} (${files.length} file(s))`,
      base,
    };
  const shown = code.slice(0, 5).join(', ') + (code.length > 5 ? `, +${code.length - 5} more` : '');
  return { full: true, reason: `code changed since verified ${base.slice(0, 7)}: ${shown}`, base };
}

const GATE_JOB = 'CI gate';
const MAX_CANDIDATES = 25;

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface Run {
  id: number;
  head_sha: string;
}

async function verified(run: Run): Promise<boolean> {
  const { jobs } = await api<{ jobs: { name: string; conclusion: string | null }[] }>(
    `/actions/runs/${run.id}/jobs?per_page=100`,
  );
  return jobs.some((j) => j.name === GATE_JOB && j.conclusion === 'success');
}

export async function plan(head: string, branch: string): Promise<Plan> {
  if (!branch) return { full: true, reason: 'branch unknown', base: '' };
  const { workflow_runs: runs } = await api<{ workflow_runs: Run[] }>(
    `/actions/workflows/ci.yml/runs?status=success&per_page=100&branch=${encodeURIComponent(branch)}`,
  );
  const seen = new Set<string>();
  for (const run of runs) {
    if (seen.has(run.head_sha) || seen.size >= MAX_CANDIDATES) continue;
    seen.add(run.head_sha);
    // ahead/identical: the run's commit is an ancestor of (or is) HEAD
    const cmp = await api<{ status: string; files?: { filename: string; previous_filename?: string }[] }>(
      `/compare/${run.head_sha}...${head}?per_page=300`,
    );
    if (cmp.status !== 'ahead' && cmp.status !== 'identical') continue;
    if (!(await verified(run))) continue;
    const files = cmp.files ?? [];
    // the compare API lists at most 300 files: treat a possibly truncated list as unknown
    if (files.length >= 300) return planFromDiff(run.head_sha, null);
    return planFromDiff(
      run.head_sha,
      files.flatMap((f) => (f.previous_filename ? [f.filename, f.previous_filename] : [f.filename])),
    );
  }
  return { full: true, reason: `no verified ancestor on ${branch}`, base: '' };
}

async function main(): Promise<void> {
  const head = process.env.HEAD_SHA || process.env.GITHUB_SHA || '';
  let result: Plan;
  if (process.env.FORCE_FULL === 'true') result = { full: true, reason: 'full run requested', base: '' };
  else {
    try {
      result = await plan(head, process.env.BRANCH ?? '');
    } catch (err) {
      result = {
        full: true,
        reason: `could not compare with earlier runs (${(err as Error).message.slice(0, 200)})`,
        base: '',
      };
    }
  }
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `full=${result.full}\nreason=${result.reason}\nbase=${result.base}\n`,
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### CI plan\n\n**${result.full ? 'Full browser suite' : 'Documentation only: browser suite and deploy skipped'}** - ${result.reason}\n`,
    );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
