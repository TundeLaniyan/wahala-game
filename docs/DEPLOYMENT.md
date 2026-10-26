# Playable preview on GitHub Pages

Target URL: **https://tundelaniyan.github.io/wahala-game/** (a project site, so the game is built with Vite
`base: '/wahala-game/'`; every asset URL is relative or Vite-resolved).

## How it is built and published

The preview is built from **`claude/wahala-stitch-uiux-v1`** (before the Stitch menu, decision UI11, from
`claude/wahala-gameplay-rumble-v2`, and before that `claude/wahala-voice-integration` and
`claude/wahala-mobile-joystick-audio`). The full pipeline, the release checks and the single-publisher setting
are in **`docs/CI.md`**; in short:

- CI (`.github/workflows/ci.yml`) runs typecheck, lint, the unit tests and one production build in parallel, then
  the Playwright desktop + phone suite as parallel shards against that build, merges the shard reports and
  passes a single `CI gate` job only when everything passed on that commit.
- Only then, and only on a push (or a manual CI run) of the publishing branch, `.github/workflows/deploy.yml`
  publishes **that same tested build** (no rebuild), adding `404.html`, `.nojekyll` and `build.json` (commit,
  branch, CI run, build time): `https://tundelaniyan.github.io/wahala-game/build.json` shows which commit is
  live. It refuses to publish if the branch has moved on or if the build would move the preview backwards.
- With the Pages source "Deploy from a branch" it commits the build to the **`gh-pages` branch** (one commit per
  release, no force-push); with the source "GitHub Actions" it deploys through the `github-pages` environment.
- `deploy.yml` has no trigger of its own; to republish, run the CI workflow on the publishing branch
  (`gh workflow run ci.yml --ref claude/wahala-stitch-uiux-v1`, or the REST API: the Actions-tab "Run workflow"
  button only lists workflows that exist on the default branch, `main`, which has none).
- Documentation-only commits run the fast checks and do not redeploy.

**Old branches still publish if pushed:** `claude/wahala-gameplay-rumble-v2`, `claude/wahala-voice-integration`,
`claude/wahala-mobile-joystick-audio` and `claude/wahala-nine-arenas-city-rumble` carry their own workflow copies
that push to `gh-pages`. A push there would replace the Stitch preview with an old game. The repository-admin
setting that stops this for good (Pages source "GitHub Actions" + a `github-pages` environment rule allowing only
the publishing branch) is in `docs/CI.md`, "Single publisher". Until it is set, leave those branches untouched.

Why the `gh-pages` branch was used at first: Pages was not enabled on the repository, and a workflow token is
not allowed to create the Pages site ("Resource not accessible by integration"). Publishing to a branch needs
only `contents: write`.

## Pages setting (admin)

Current: Source "Deploy from a branch", Branch `gh-pages` / `(root)` (set once; the site is live). The
recommended change to Source "GitHub Actions" with a branch-restricted `github-pages` environment is described
step by step in `docs/CI.md`; the workflow detects the source by itself, and the URL stays the same.

## What could not be verified from the build environment

The environment's network proxy refuses `*.github.io`, so the live page itself could not be opened from here; the
workflow result, the `gh-pages` branch contents and a local production build served under `/wahala-game/`
(`npm run build && npx vite preview`) were checked instead. After enabling Pages, open the URL on a phone, or
check `build.json` and the browser network panel (all requests should be 200, under `/wahala-game/`).

## Mobile notes

- Play in landscape: during a match a rotate-your-phone overlay covers portrait. Pressing Play on a touch device
  requests fullscreen and a landscape lock (best effort: iPhone Safari supports neither; add the page to the home
  screen for a full-screen app - `public/manifest.webmanifest` asks for fullscreen landscape).
- Audio starts after the first tap (browser autoplay rules).
- Music is streamed per arena (one MP3 when a match starts), not preloaded; 3D models load once with a progress bar.
- Voice clips (MP3, 5-37 KB each) are fetched in the background when a match starts, only those that arena uses.

## Not this

This is a single-player game against bots running entirely in the browser. It is not online multiplayer and has no
accounts, servers or purchases.
