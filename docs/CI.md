# CI and release pipeline

Workflows: `.github/workflows/ci.yml` (every push except `main`/`gh-pages`, pull requests, manual runs) and
`.github/workflows/deploy.yml` (called only by CI); composite action `.github/actions/playwright-browser`. Helper
scripts: `scripts/ci/plan.ts`, `scripts/ci/shards.ts`, `scripts/ci/report.ts` (unit-tested in
`tests/ci/ciScripts.test.ts`).

## Release path

```
Plan (+ shard lists) ─┐
Typecheck and lint ───┤
Unit tests ───────────┼─> E2E shard 1/8 ┐
Production build ─────┤   E2E shard 2/8 ├─> E2E report ─> CI gate ─> Deploy preview
   (dist artifact)    │   ...           │   (merge, every          (release checks,
Browser cache ────────┘   E2E shard 8/8 ┘    test ran once)          then publish)
```

1. **Fast checks** run as parallel jobs: `npm run typecheck` + `npm run lint`, `npm run test` (Vitest), and one
   production build (`vite build`, uploaded as the `dist` artifact). All are mandatory. Beside them, **Plan**
   decides whether the browser suite is needed (below) and writes the shard lists, and **Browser cache** installs
   the Chromium headless shell with its system packages once and caches them.
2. **E2E shards** start only when every fast check passed. Each shard is its own GitHub-hosted runner: it
   downloads that `dist`, restores the cached browser and runs `playwright test --test-list shard-i.txt
   --fully-parallel` against `vite preview` of the downloaded build (`WAHALA_E2E_PREBUILT=1` skips the rebuild in
   `playwright.config.ts`). One worker per shard (`WAHALA_E2E_WORKERS`). `fail-fast` is off so every shard
   reports. The whole desktop + phone suite runs; nothing is skipped or filtered.
3. **E2E report** downloads every shard's blob report, merges them into one HTML report (with failure screenshots
   and the traces recorded on retries) and one JSON report, and compares the merged report with
   `playwright test --list` of the same commit: every listed test (spec x project) must have run in exactly one
   shard, otherwise the job fails. The run summary shows listed / ran / passed / flaky / failed / skipped /
   retries, the flaky tests by name (a pass on retry stays visible as flaky and as a warning annotation), and
   every job's duration and the wall clock. It also uploads the per-test durations (`e2e-timings`) for the next
   run's shard plan.
4. **CI gate** is the one job to require in branch protection. It passes only when plan, the fast checks and (for
   a full run) the browser cache, every shard and the report passed. A cancelled or failed job anywhere fails it.
5. **Deploy preview** runs only after the gate passed on a push or manual run, never on pull requests. See below.

`fullyParallel` is not set in `playwright.config.ts` (locally the suite runs exactly as before); CI passes
`--fully-parallel`. That is safe because every test gets its own browser context and page, no spec keeps state
between tests (no `beforeAll`, no module-level mutable state, unique screenshot paths), and each test sets up its
own match.

## Shards: count, balance, workers

Default: **8 shards x 1 worker** (`E2E_SHARDS` / `E2E_WORKERS` in `ci.yml`). A manual run can pick 4, 6 or 8 shards
and 1 or 2 workers: `gh workflow run ci.yml --ref <branch> -f shards=8 -f workers=1` (or the REST dispatch API; the
Actions-tab "Run workflow" button only lists workflows present on the default branch, `main`, which has none).

- **Balance.** Playwright's `--shard=i/N` splits the ordered list by count. Measured in run 103 (8 shards): shards
  from 3.5 to 24 minutes, because desktop tests are about twice as slow as phone ones and the device-specific
  skips cluster. `scripts/ci/shards.ts` instead assigns every listed test to exactly one shard, longest first,
  using the durations of the last fully passing run (unknown tests count as the median); shards run
  `--test-list`. The report job's exactly-once check guards the split.
- **Workers.** Run 107 (8 x 2 workers) took about as long as run 106 (8 x 1): one software-WebGL Chromium already
  keeps a runner's CPUs busy, so a second worker adds contention, not speed. One worker per shard stays.
- **Runner speed varies.** The same test takes up to 2-3x longer on one runner than another, and the old
  single-job suite took 57 minutes at 01:00 UTC but 87-120 in the evening. Balance cannot remove that; more,
  shorter shards bound it. Each shard logs its CPU (`Runner` step).
- **Browser install.** `playwright install --with-deps` fetches ~26 MB of Ubuntu packages; on two runners of run
  103 the mirror served them at ~40 kB/s (10-13 minutes). The `Browser cache` job installs once per runner image
  and Playwright version and caches the headless shell and the `.deb` files; shards restore them (12-30 s).

## Documentation-only commits

`scripts/ci/plan.ts` looks for the nearest ancestor commit whose run of this workflow passed the CI gate
("verified"). If every file changed since then is documentation (`docs/**`, `reference/**`, `README.md`,
`CLAUDE.md`), the run does the fast checks only (the unit tests read some docs) and skips the browser suite and
the deploy. Anything else (code, assets, `public/`, `package*.json`, workflows, scripts, tests, configs), no
verified ancestor, an API error or a diff too large to list means the full suite. Because only gate-passed
commits count, a docs commit can never inherit verification from a run that was cancelled, failed or skipped:
the chain always ends at a commit whose browser suite passed. A manual run is always full.

So recording "CI passed" in `docs/IMPLEMENTATION_STATUS.md` no longer costs another hour of browser tests and
another public deploy.

## Deploy and the single publisher

The preview at https://tundelaniyan.github.io/wahala-game/ is built from **`claude/wahala-stitch-uiux-v1`**
(`PUBLISH_BRANCH` in `deploy.yml`). `deploy.yml` has no trigger of its own (no `push`, no `workflow_dispatch`); to
republish, run the CI workflow on that branch. Its `Release checks` job publishes only when:

- the run is for `PUBLISH_BRANCH` (any other branch: a dry run that checks and stamps the build, publishes nothing);
- the commit is still the head of `PUBLISH_BRANCH` (a re-run of an old run cannot publish an old build);
- the live `build.json` is not a newer commit of `PUBLISH_BRANCH` (the preview never moves backwards; a live build
  from another branch is replaced, with a warning).

It publishes the exact `dist` artifact the shards tested (plus `404.html`, `.nojekyll` and `build.json` with the
commit, branch, CI run and time), never a rebuild. Publishing follows the repository's Pages source: "Deploy from
a branch" -> one commit on `gh-pages` (no force-push); "GitHub Actions" -> `actions/deploy-pages` through the
`github-pages` environment.

### Why that is not yet enough, and the admin step that makes it enforceable

Every older feature branch carries its own copy of the workflows, and GitHub runs the copy in the pushed commit.
Today four of them publish if anyone pushes to them (or runs their deploy workflow by hand), replacing the
preview with an old game: `claude/wahala-gameplay-rumble-v2`, `claude/wahala-voice-integration`,
`claude/wahala-mobile-joystick-audio` (CI `deploy-preview` job + a manual `deploy.yml`) and
`claude/wahala-nine-arenas-city-rumble` (deploys on every push). They push to `gh-pages` with the default
workflow token, which any workflow on any branch has, so no code on the new branch can stop them, and a comment
or a concurrency group does not either.

The enforceable fix is a repository setting (needs a repository admin; a workflow token cannot change it):

1. **Settings -> Pages -> Build and deployment -> Source: "GitHub Actions".** From then on the site is whatever the
   last Pages *deployment* was; pushes to the `gh-pages` branch (all the old workflows) no longer change it.
2. **Settings -> Environments -> `github-pages` -> Deployment branches and tags: "Selected branches and tags",
   add exactly `claude/wahala-stitch-uiux-v1`** (remove any other rule). GitHub then refuses a Pages deployment
   from any other branch, whatever that branch's workflow says. The old `main`-style workflows that use
   `deploy-pages` are refused the same way.
3. **Actions -> CI -> Run workflow** on `claude/wahala-stitch-uiux-v1`. The `Release checks` job reads the Pages
   source, takes the "GitHub Actions" path and deploys through the protected environment; the site URL does not
   change. Check `https://tundelaniyan.github.io/wahala-game/build.json` afterwards.

To move the preview to another branch later, change `PUBLISH_BRANCH` in `deploy.yml` and the environment's branch
rule together. Until steps 1-2 are done, do not push to the four branches above.

## Timeouts and diagnostics

Each shard job has a 50-minute limit (45 for the test step) instead of the old single 170-minute step: one hung
test (15 minutes at `test.slow()` x 300 s) plus its retry still fits, and a stuck shard can no longer hold the
whole release for hours. Failure screenshots and retry traces (DOM snapshots, network, sources; no screencast,
which costs seconds per frame on software WebGL) are in the merged `playwright-report` artifact; each shard's
`blob-report-i` artifact is kept for 14 days.

## Benchmarks

Real GitHub Actions runs (ubuntu-latest, public-repository runners). "Wall clock" is push to the end of the
release checks (the deploy decision); for the old pipeline, push to the end of its deploy job.

| Run | Pipeline | Tests | Wall clock | Slowest E2E job |
| --- | --- | --- | --- | --- |
| [#99](https://github.com/TundeLaniyan/wahala-game/actions/runs/40232286084) (old, 20:45 UTC) | 1 job, 1 worker | timed out at the 120-minute step limit (one 15-minute hang) | 125 min, failed | 120 min |
| [#100](https://github.com/TundeLaniyan/wahala-game/actions/runs/40242628017) (old, 22:58 UTC) | same | 104 passed, 24 skipped | 93 min | 87 min |
| [#101](https://github.com/TundeLaniyan/wahala-game/actions/runs/40252470401) (old, 01:05 UTC) | same | 104 passed, 24 skipped | 63 min | 57 min |
| [#103](https://github.com/TundeLaniyan/wahala-game/actions/runs/40349078468) (15:25 UTC) | 8 count-split shards | 128: 104 passed, 24 skipped, 0 flaky | 35 min | 31 min (10.5 of them apt) |
| [#104](https://github.com/TundeLaniyan/wahala-game/actions/runs/40349588062) (15:28 UTC) | 4 count-split shards | 128: 104 passed, 24 skipped, 0 flaky | 42 min | 38 min (12.8 of them apt) |
| [#105](https://github.com/TundeLaniyan/wahala-game/actions/runs/40356611492) (16:11 UTC) | 4 shards, cached browser, no timings yet | 128: 104 passed, 24 skipped, 0 flaky | 39 min | 35 min |
| [#106](https://github.com/TundeLaniyan/wahala-game/actions/runs/40362899002) (16:49 UTC) | **8 balanced shards x 1 worker** | 130: 105 passed, 25 skipped, 0 flaky | **22 min** | 18 min |
| [#107](https://github.com/TundeLaniyan/wahala-game/actions/runs/40362928688) (16:50 UTC) | 8 balanced shards x 2 workers | 130: 105 passed, 25 skipped, 0 flaky | 19 min | 15 min |

(130 = the 128 tests plus the new B-button regression test on both projects; its desktop copy is skipped by design.)
