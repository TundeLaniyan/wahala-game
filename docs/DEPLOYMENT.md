# Playable preview on GitHub Pages

Target URL: **https://tundelaniyan.github.io/wahala-game/** (a project site, so the game is built with Vite
`base: '/wahala-game/'`; every asset URL is relative or Vite-resolved).

## How it is built and published

`.github/workflows/deploy.yml` runs on every push to `claude/wahala-nine-arenas-city-rumble` (and on demand from the
Actions tab, "Run workflow"). It installs, typechecks, lints, runs the unit tests, builds, and then commits the
contents of `dist/` to the **`gh-pages` branch** (one commit per build, no force-push). It also writes
`build.json` (commit, branch, build time) next to `index.html` so anyone can check which commit is live:
`https://tundelaniyan.github.io/wahala-game/build.json`.

Why a `gh-pages` branch and not the "GitHub Actions" Pages source: Pages was not enabled on the repository, and a
workflow token is not allowed to create the Pages site ("Resource not accessible by integration", Actions run
#1 on this branch). Publishing to a branch needs only `contents: write`, which the workflow has, so the build is
already sitting in `gh-pages`. A second benefit: the old `deploy.yml` on `main` uses the "GitHub Actions" source;
with the source set to the `gh-pages` branch that old workflow cannot replace the preview.

## The one setting the founder must change (admin, once)

1. Repository **Settings -> Pages**.
2. **Build and deployment -> Source: "Deploy from a branch"**.
3. **Branch: `gh-pages`, folder `/ (root)`**, Save.
4. After a minute the page shows "Your site is live at https://tundelaniyan.github.io/wahala-game/".

Nothing else is needed: later pushes to the branch republish automatically. To publish without a code change, open
**Actions -> Deploy preview to GitHub Pages -> Run workflow** on `claude/wahala-nine-arenas-city-rumble`.

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

## Not this

This is a single-player game against bots running entirely in the browser. It is not online multiplayer and has no
accounts, servers or purchases.
