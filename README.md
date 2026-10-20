# WAHALA!

A Nigerian-inspired, Bomberman-style 3D browser arcade game. Drop portable generators, blast your rivals in plus-shaped fire, grab upgrades, ride an Okada and call in a Danfo, Yellow Cab or Keke. Phase 1 is **one human against 1-3 bots, entirely in your browser** - no server, no accounts, no database.

Design specification: [`docs/GAME_DESIGN_BIBLE.md`](docs/GAME_DESIGN_BIBLE.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Status & backlog: [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md)

## Play locally

Requires Node 20+ (22 recommended).

```bash
npm ci
npm run dev        # http://localhost:5173
# or a production-like run under the GitHub Pages path:
npm run build && npm run preview   # http://localhost:4173/wahala-game/
```

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | Arrows / WASD | D-pad / left stick | on-screen pad |
| Drop generator | Space | A | big button |
| Carry / drop / punch | E | X | context button |
| Push / shove / daze | F | B | skill button |
| Remote detonate | Q | RB | context button |
| Kill Switch | X | LB | context button |
| Signature vehicle | V | Y | context button |
| Pause | P / Esc | Start | pause button |

Vehicle entry: press the vehicle button, pick any glowing border arrow (arrows / D-pad / tap / click, tap the focused arrow again or press Enter/A to confirm; the Keke then asks where to turn), and the lane is warned before the vehicle drives in. You have 8 seconds.

URL options for testers: `?fps` (performance overlay), `?q=low|medium|high` (force graphics quality), `?seed=123` (reproducible match), `?debug` (exposes `window.__WAHALA__`), `?nobots`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run check` | typecheck + lint + unit tests + production build |
| `npm test` | Vitest (simulation scenarios, AI, audio, app controller) |
| `npm run test:e2e` | Playwright against the built site (desktop + landscape phone). Set `WAHALA_CHROMIUM=/path/to/chromium` to reuse an installed browser, otherwise run `npx playwright install chromium` first |
| `npm run simulate -- --matches 200` | headless bot-vs-bot batches to compare Easy / Medium / Hard |

## Deploying to GitHub Pages

The workflow `.github/workflows/deploy.yml` builds and deploys `dist/` with the correct `/wahala-game/` base path on every push to `main`.

1. Merge the pull request into `main`.
2. In the repository go to **Settings -> Pages -> Build and deployment -> Source** and choose **GitHub Actions** (one-time).
3. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to succeed (use **Run workflow** if it ran before Pages was enabled).
4. The game is then served at `https://<your-username>.github.io/wahala-game/`.

Everything runs client-side, so every visitor plays their own private match. The Game Bible and `reference/` images are documentation and are not shipped in the site.

## Project layout

```
src/sim     deterministic rules (pure TypeScript, no DOM/Three/React)
src/ai      bots (see only observe() output)
src/render  Three.js scene, models, effects
src/audio   WebAudio synthesised music/SFX + Pidgin crowd captions
src/input   keyboard, touch state, gamepad -> Intent
src/ui      React menus and HUD
src/app     composition root, match controller, Zustand store
tests e2e   Vitest scenario tests, Playwright browser tests
```
