# WAHALA! - project conventions for Claude Code

Browser-only, offline, single-player (1 human vs 1-3 bots) Nigerian-inspired Bomberman-style game. **Authoritative design: `docs/GAME_DESIGN_BIBLE.md`.** Architecture: `docs/ARCHITECTURE.md`. Status/backlog: `docs/IMPLEMENTATION_STATUS.md`. Tuning/rule decisions: `docs/DECISIONS.md`.

## Commands
`npm run dev` | `npm run check` (typecheck + lint + vitest + build) | `npm test` | `npm run test:e2e` (Playwright; set `WAHALA_CHROMIUM=/opt/pw-browsers/chromium` offline) | `npm run simulate` (bot batches).

## Non-negotiable rules
- Stack: TypeScript strict, Vite, Three.js, React + Zustand (UI only), Vitest, Playwright. No backend, DB, auth or sockets.
- `src/sim` is pure and deterministic: no DOM, Three, React, `Math.random`, `Date.now`. Time = ticks (60/s). Randomness = seeded `rng.ts`. ESLint enforces this. `src/ai` may import only `src/sim`.
- No game rules in render/ui/audio/input. Rendering reads state and consumes `SimEvent`s.
- All balance numbers live in `src/sim/config.ts`. Characters/vehicles/pickups/arenas are data.
- Humans and bots send the same `Intent`. Bots only see `observe()` output, never hidden pickups or RNG.
- Game rules that are LOCKED in the Bible must not drift: generator is the primary weapon; Okada is a mount (one-hit shield, never an attack vehicle); exactly three attack vehicles (Danfo, taxi, Keke) fixed per character; vehicle damage accumulates over separate blasts; Kill-Switched generators still explode from flame/vehicles; carry adds exactly +1s once; simultaneous final deaths = draw; no health bars.
- Never reformat `docs/` or `reference/` (Prettier ignores them).
- Any gameplay/tuning change: log why in `docs/DECISIONS.md`. Never claim a feature works without a passing test or a real browser check.

## Conventions
- Small modules, explicit interfaces, no god classes, no circular imports; prefer composition; inject dependencies only where it helps tests.
- Tests: scenario-style (`tests/helpers.ts` `sandbox()` etc.). Add a regression test with every bug fix.
- `base` is `/wahala-game/` for production builds (GitHub Pages). Use relative/Vite-resolved asset URLs only.
- Commit per milestone; update `docs/IMPLEMENTATION_STATUS.md`.
