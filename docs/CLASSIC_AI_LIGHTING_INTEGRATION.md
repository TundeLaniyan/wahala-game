# Classic raid AI, lighting and the night raid: integration report

Branch `claude/wahala-classic-ai-lighting-v1`, from production `514be88`. **Not merged, not pushed to production, not deployed.**
Founder review first. Detail: `CLASSIC_RAID_AI.md` (decisions RA1-RA7), `CLASSIC_LIGHTING.md` (NL1-NL15).

## Integration

- `claude/wahala-cl-raid-ai` merged first (no conflicts); `claude/wahala-cl-night` merged on top (two additive conflicts: the
  export lists of `src/sim/raid/index.ts` and the RA / NL sections of `docs/DECISIONS.md`, both sides kept). Light-based
  detection (NL10-NL13) was then built on the merged tree, on the raid AI's `enemySeesPerson` and `Player.facing`.

## Verification of the integrated tree (2026-11-21, this container)

- `tsc --noEmit`, `eslint src tests scripts e2e`: clean. `npm run build`: passes.
- Vitest, the whole suite: 298 files, 4628 passed, 7 skipped, 0 failed (includes `raid-ai-isolation`, the mission and bot
  digest regressions, `raid-night-detection`, `classic-readability`, `raid-art`).
- Playwright (built preview, desktop 1280 x 720 and phone 844 x 390): `night-raid`, `raid-render`, `checkpoint-clarity`,
  `mission-guidance`, `mobile-hud-fit`: 18 passed, 9 skipped (single-project tests), 1 failed under load (load average
  above 6): the desktop Oshodi approach -> raid start exceeded the local 90 s timeout; re-run alone with the CI timeout
  (300 s, `--retries=0`) it passes in 1.2 min. The single-process browser launch crashed in this busy container on the first
  attempt (every test, before any page); `WAHALA_MULTIPROCESS=1` (the documented opt-out) was used.
- Full 12-shard CI: deliberately not run at this stage (founder instruction).

## Cost

- JavaScript, gzip -9 over `dist/assets/*.js`: 868,682 B (`514be88`) -> 875,791 B (+7.1 KB, +0.8 %): raid routes, night sight,
  light map, night mask.
- Records Vault night vs `?nonight` (`scripts/campaign-perf.mjs`, software GL): draw calls 272 / 271 (Low), 397 / 396 (High);
  triangles +80 (Low), +128 (High); +1 geometry. Frame times are not comparable here (SwiftShader, 0.6-1.5 s per frame on
  both sides, within noise): no phone frame timing exists yet.
- Raids that were drawing the Danfo Bus Park set by mistake now draw their own lighter sets (Dispatch Depot Low 350 -> 274
  draw calls).

## Not established by tests

Whether the patrols, traps and the night raid are fun, whether the dark board reads on a real phone screen in daylight, and
how much a deliberately sneaking player gains from the dark (the scripted player never sneaks).

## Remote branch (founder-authorised 2026-11-21)

Pushed to `origin/claude/wahala-classic-ai-lighting-v1` only (not the publishing branch). The head commit carries
`[skip ci]`, so GitHub starts no push workflow: no CI run, and therefore no `deploy.yml` (it runs only when CI calls it,
and on any branch but `PUBLISH_BRANCH` it is a dry run that publishes nothing). Full release validation runs before any
production integration.
