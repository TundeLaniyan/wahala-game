# FlowFrame Performance

**FlowFrame Performance** is the internal / product name of the adaptive rendering-quality system (decision FP1).
It is a name only: nothing claims it is a registered trademark, and the system itself (decisions PF1-PF10,
`docs/PERFORMANCE.md`) was not rewritten. The player sees it on the loading screen (the mark, the name and one
sentence: "FlowFrame Performance adjusts the game's rendering quality to match your device's available
performance, so play stays smooth. Gameplay is never affected.") and, as before, as the quiet notices
"Graphics reduced · Very Low" / "Graphics increased · Medium" and the Auto setting.

## One place for the name and the mark

`src/render/perf/brand.ts` exports `FLOWFRAME`: `name`, `shortName`, `tagline`, `description` and `mark` (SVG
path data on a 24 x 24 grid, stroked in the current colour). It has no imports. `src/ui/FlowFrameMark.tsx` draws
the mark from it; `src/ui/menu/MainMenu.tsx` shows mark + name + description in the loading block. To rename or
re-skin the technology change `brand.ts` only (`tests/flowframe.test.ts` fails if the name is written anywhere else
in the code that uses it).

## Reusable module boundary (to lift into another game)

| Part | Files | Game-specific? |
| --- | --- | --- |
| Brand | `src/render/perf/brand.ts` | No |
| Controller (`AdaptiveQuality`: sliding window, thresholds, hysteresis, cooldowns, probation, futile-drop guard) | `src/render/perf/adaptive.ts` | No: clock-free, takes `frame(dt, now, ctx)` and answers with a rung change or nothing |
| First guess (`detectCapabilities`, `estimateRung`, `rungForGpu`, `deviceFingerprint`) | `src/render/perf/capabilities.ts` | No (reads `MAX_RUNG` from the ladder) |
| Learned rung per device | `src/render/perf/learned.ts` | No (reads `MAX_RUNG`) |
| Public surface | `src/render/perf/index.ts` | No |
| The ladder: what each rung means (pixel ratio, shadows, particles, crowd ...) | `src/render/quality.ts` | **Yes**: replace with the new game's budget profiles; only `MAX_RUNG` and the rung order (cheaper = lower) are assumed by the folder above |
| Applying a rung, the frame measurement | `src/render/GameRenderer.ts` | **Yes** (the integration point) |
| The notice wording and its rate limit | `src/app/qualityNotice.ts` | Wording only |

API in one breath: `new AdaptiveQuality({ start, now, floor?, ceiling? })`, then every rendered frame
`const change = controller.frame(dtSeconds, nowSeconds, { busy? })`; a returned `QualityChange` (`from`, `to`,
`direction`, `reason`, `fps`) tells the host to apply `to` live. `controller.reset(rung, now)` when the user or a
new match sets a rung; a manual preset simply never calls `frame`. Persist the settled rung with
`saveLearned` / `loadLearned` (separate from game settings).

## What it never does

It only moves rendering budgets. It never touches the simulation, AI, input timing, collisions, blasts or match
rules, and audio quality is not an adaptive target (audio has its own fixed-cost mix, `docs/AUDIO.md`).

## Tests

`tests/flowframe.test.ts` (brand in one place, mark drawn from it, no dependencies, the loading screen shows it,
notices word for word, one drop and one raise through the real controller) next to the existing
`tests/render/adaptive-quality.test.ts` and `tests/app/qualityNotice.test.ts` (thresholds, hysteresis, rate
limits).
