# WAHALA! - City Rumble Evolution V1

Branch `claude/wahala-rumble-evolution-v1` (from `claude/wahala-stitch-uiux-v1` @ `408fb4d`). Founder brief of
2026-10-26: evolve City Rumble into a distinctive Lagos street-combat mode; Classic Battle keeps its established
gameplay. Decisions are section **RE** of `DECISIONS.md` (prefix per workstream: RE-A movement, RE-B blast, RE-C
economy, RE-D Ojuelegba, RE-E living environment, RE-AI bots, RE-L lead). This file is the lead's contract for the
parallel workstreams, then the delivery report.

The GitHub Pages preview is NOT published from this branch (`ci.yml` deploys only from `claude/wahala-stitch-uiux-v1`);
the CI optimisation work lives on its own branch and is not touched here.

The founder's three Lagos research reports and the prototype-decision briefing were not available in the build
session; the cultural and environment detail comes from the earlier stage research in `RUMBLE_STAGES_V2.md` and the
brief itself. No combat rule, engine, health model or Unreal system was adopted from research.

## 1. Shared simulation contracts (lead, Phase 0 - already in the code)

| Contract | Where | Notes |
| --- | --- | --- |
| Radial blast | `generator.blastMode = 'radial'`, `sim/systems/blastShape.ts` (`radialFootprint`, `radialOffsets`, `inDisc`, `lineBetween`, `radialRadius`, `radialSquareRadius`), exported from `src/sim` | THE one implementation: `explosions.ts` flames, `previewBlast` (renderer danger footprint) and the bots must all call it. Disc `dx^2+dy^2 <= R^2+R`, R = `min(range, maxRange)`; reached = outward wave (concrete never entered; crate / other generator hit but passes nothing) AND clear centre line (crosses only open floor without generators; exact corners go diagonal). Hot Fuel passes one crate. Square Blast in radial = the full square of radius `min(R + square - 1, radialMaxSquareRadius)` (RE-B4). Flames on the generator's row / column keep `dir` (+ `tip`); the others carry `radial: true`. `generatorExploded.radial` marks a radial blast. |
| Rumble rules | `RUMBLE_ECONOMY` in `config.ts`, merged by `modes.ts` for survival / deathmatch / team | `blastMode: 'radial'`, `maxRange: 5` (radius cap), `baseCapacity: 2`. Classic untouched (`plus`, 1 generator). |
| Authored cover | layout chars in `ArenaDef.layout`: `_` kept-clear floor (no random crate), `x` barrier (always a crate), `$` supply crate (always a crate, hides one of `config.supply.kinds`, match RNG) | `GameState.supplies` / `Observation.supplies` = tile indices of standing supply crates (public marking; content hidden). Destroyed once, never refilled. Non-mirrored arenas (`mirrorSoftBlocks: false`) now draw random crates over the whole board. |
| Attack lanes | `config.vehicles.lanes: [x, y, inwardDir][] \| null` (arena config) | When set, `allBorderEntries` (and so the vehicle UI, one-press auto vehicle and bots) only offer those border road mouths. |
| Districts | `ArenaDef.districts?: DistrictDef[]`, `districtLinks?: DistrictLink[]` (`sim/arenas/types.ts`) | Data only: named rectangles + connections (`open` / `chokepoint` / `breach`). Tests and the minimap / bots may read them; no rule may branch on a district id. |

Tests: `tests/radial-blast.test.ts`, `tests/rumble-evolution-contracts.test.ts`.

Rules for everyone: nobody redefines the blast, movement or collision interfaces above. Need a change? Ask the lead.
`src/sim` stays pure and deterministic; balance numbers live in `config.ts`; arenas are data; rules never test an
arena id; bots see only `observe()`.

## 2. Workstreams and file ownership

| Stream | Owns |
| --- | --- |
| A Assisted movement | `src/input/*` (new `moveAssist.ts`), `ui/TouchControls.tsx` + touch CSS, the movement-assist part of `app/MatchController.ts` (the `IntentContext` it builds), the `assistedMovement` setting (`app/settings.ts` field + Settings > Controls / Accessibility toggle in `ui/menu/SettingsScreen.tsx`), `tests/input-*.test.ts`, `e2e/mobile.spec.ts` |
| AI Bots | `src/ai/*`, `tests/ai/*`, `tests/rumble-ai.test.ts`, `tests/modes-bots.test.ts`, `tests/economy-ai.test.ts` (AI-side expectations), `scripts/simulate.ts` |
| C Economy + measurement | `sim/systems/{rewards,pickups,drops,attribution}.ts`, `config.ts` reward / supply / Rumble economy numbers (lead-reviewed), supply-crate visuals in `render/views/` (soft block marking), new `scripts/rumble-metrics.ts`, `tests/economy*.test.ts` (economy-side), `tests/rumble-economy-evolution.test.ts` |
| D Ojuelegba | `sim/arenas/rumbleOjuelegba.ts`, `render/arenas/rumbleOjuelegbaArt.ts` (+ new `render/arenas/ojuelegba*.ts` helpers), its `newArenas.ts` / `arenaLook.ts` entries, its preview `public/previews/rumbleOjuelegba.jpg`, `tests/rumble-ojuelegba.test.ts`, the Ojuelegba rows of `tests/rumble-stages.test.ts` |
| E Living environment | `render/life/*` (traffic, crowds, reactions), `render/fx/Ambient.ts`, new reusable `render/env/*` (the `StageEnvironment` presentation contract), the Danfo-departure hazard (`sim/systems/stage.ts` + `StageHazardStyle`), `tests/stage-hazards.test.ts`, `tests/render/*` for its modules |
| Lead | everything in section 1, `types.ts` / `config.ts` / `tick.ts` / `sim/index.ts` shape, merges, docs, cross-system regression, final verification |

Shared files (`types.ts`, `config.ts`, `sim/index.ts`, `settings.ts`, `GameRenderer.ts`): append small fields you
need, never reorder, and say so in your report.

## 3. Rules for every stream

- Read `CLAUDE.md` first. Work on your own branch in your worktree, based on this branch; commit meaningful steps.
- Run `npx tsc --noEmit`, `npx eslint <your files>` and the vitest files covering your area. The full suite takes
  ~3 min on the idle 4-core machine, which is shared by several streams: prefer targeted runs. Playwright only for
  your own spec (`WAHALA_CHROMIUM=/opt/pw-browsers/chromium`).
- Every bug fix / mechanic gets a scenario test. Never weaken an existing test; if a deliberate rule change moves an
  expectation, change it to the new rule and say why in the test.
- Log gameplay / tuning decisions in `DECISIONS.md` section RE with your prefix.
- Never claim something works without a test or a real browser check. Report exactly what is done and not done.

## AI. Bots and the radial blast

Workstream AI (branch `claude/wahala-rumble-evolution-v1-ai`), decisions RE-AI1..RE-AI7.

**What the bots now know.** Wherever a bot reasons about a blast in City Rumble it uses the simulation's own
`radialFootprint` (`ai/blast.ts`): the danger map (with chain relax and the crate-cleared refine pass), placement
value, chained rivals, the remote-detonation check, mercy, friendly-fire and trap filters. Cover is simply what
the danger map leaves safe, so wall and crate shadows are refuges and diagonals are not. On top: a rival on a
diagonal counts as adjacent when picking a spot, Standard / Skilled bots look for a second-generator cut-off
once one of theirs is down, a plan that a fresh danger map makes lethal is re-planned at once, and marked supply
crates (`obs.supplies`, never `state.hidden`) add placement value. Stage sweeps, Wahala Crush and the endgame
traps are modelled as before; authored barrier crates are crates. Nothing reads hidden state; no rule was invented.

**Classic unchanged.** Every new path is behind `blastMode === 'radial'`. Verified before / after every AI
commit two ways: `npx tsx scripts/ai-fingerprint.ts` (36 standard-arena matches, identical output) and a stricter
replay that hashes every bot intent of every tick of 36 Classic / Crush matches on all nine standard arenas
(seven levels, 2-4 seats, the Power Yard full line included) plus one 12-bot City Rumble map match under Classic
rules (the large-board cross path): all 37 hashes identical.

**The two Phase 0 failures, fixed with unchanged thresholds.**

| test | Phase 0 | now | threshold |
| --- | --- | --- | --- |
| `modes-bots` Team Rumble friendly fire: placements whose blast reaches a teammate | 0.289 (of 194) | 0.050 (of 222) | < 0.15 |
| same: placements whose blast reaches an opponent | 0.747 | 0.784 | > 0.5 |
| `economy-ai` 32-bot Survival seed 1: top eliminator power vs the median fighter | 6 vs 4 | 14 vs 4 | > median + 5 |
| same, seed 2 | 7 vs 4 | 21 vs 4 | > median + 5 |

No economy change was needed: with Phase 0 bots the top eliminators died in their own radial blasts (kills
credited after the eliminator's death pay nothing), so they never grew.

**32-bot Survival: Phase 0 bots vs radial-aware bots** (`npm run simulate -- --arena <stage> --game survival
--players 32 --matches 6 --seed 1 --verbose`, every level present, full schedule; CPU time per tick of bots +
simulation on 4 cores shared by five agents, load 3-11; "Phase 0" = the bots of c84d9df on the same radial
rules; "cross" = today's bots, same ruleset with `--blast plus`).

| stage | bots | seeds | Phase 0 bots, radial | radial-aware bots, radial | radial-aware bots, cross |
| --- | --- | --- | --- | --- | --- |
| rumbleOshodi | 32 | 1-6 | 6 won; 20 s avg; own blast 68 of 186 deaths; 1.34 ms/tick (p99 9.6) | 6 won; 55 s; own blast 34 of 186; 1.48 ms (p99 9.2) | 6 won; 53 s; own blast 43; 1.33 ms (p99 7.6) |
| rumbleApapa | 32 | 1-6 | 3 won, 3 draws; 19 s; own blast 99 of 189; 1.22 ms (p99 9.2) | 6 won; 55 s; own blast 52 of 186; 1.58 ms (p99 9.2) | 6 won; 55 s; own blast 44; 1.20 ms (p99 7.0) |
| cityRumble | 32 | 1-6 | 4 won, 2 draws; 17 s; own blast 67 of 188; 1.53 ms (p99 10.6) | 6 won; 71 s; own blast 29 of 186; 1.42 ms (p99 9.3) | 6 won; 76 s; own blast 38; 0.92 ms (p99 6.8) |
| all three | 32 | 1-6 | own blast 234 of 563 deaths (42 %) | own blast 115 of 558 (21 %) | own blast 125 of 558 (22 %) |

Per match (radial-aware bots, radial blast, the batch above; ms/tick is per batch: 1.48 / 1.58 / 1.42):

| stage | bots | ruleset | seed | result | play s | own blast | credited kills | opponent within 6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOshodi | 32 | survival | 1 | skilled #23 wins | 40 | 7 | 24 | 81 % |
| rumbleOshodi | 32 | survival | 2 | nightmare #19 wins | 37 | 5 | 26 | 85 % |
| rumbleOshodi | 32 | survival | 3 | skilled #13 wins | 45 | 4 | 27 | 85 % |
| rumbleOshodi | 32 | survival | 4 | nightmare #23 wins | 131 | 7 | 24 | 83 % |
| rumbleOshodi | 32 | survival | 5 | casual #9 wins | 51 | 5 | 26 | 83 % |
| rumbleOshodi | 32 | survival | 6 | expert #23 wins | 29 | 6 | 25 | 78 % |
| rumbleApapa | 32 | survival | 1 | expert #13 wins | 34 | 7 | 24 | 83 % |
| rumbleApapa | 32 | survival | 2 | nightmare #26 wins | 59 | 10 | 21 | 74 % |
| rumbleApapa | 32 | survival | 3 | skilled #31 wins | 51 | 7 | 24 | 85 % |
| rumbleApapa | 32 | survival | 4 | nightmare #2 wins | 62 | 10 | 21 | 84 % |
| rumbleApapa | 32 | survival | 5 | expert #14 wins | 84 | 7 | 24 | 78 % |
| rumbleApapa | 32 | survival | 6 | skilled #30 wins | 42 | 11 | 20 | 78 % |
| cityRumble | 32 | survival | 1 | skilled #30 wins | 46 | 3 | 28 | 78 % |
| cityRumble | 32 | survival | 2 | nightmare #19 wins | 147 | 6 | 24 | 82 % |
| cityRumble | 32 | survival | 3 | standard #16 wins | 63 | 5 | 26 | 86 % |
| cityRumble | 32 | survival | 4 | expert #30 wins | 48 | 4 | 27 | 87 % |
| cityRumble | 32 | survival | 5 | nightmare #29 wins | 81 | 5 | 26 | 89 % |
| cityRumble | 32 | survival | 6 | nightmare #13 wins | 40 | 6 | 25 | 87 % |

**8 / 16 / 24 / 32 combatants, radial vs cross, deaths by cause** (radial-aware bots, seeds 1-4 per cell, full
schedule, `simulate --game survival --players N --matches 4 --seed 1 [--blast plus] --verbose`; load about 10).

| stage | bots | blast | results | mean length s | own blast | rival blast | vehicle | stage hazard | crush | opponent within 6 | same, 6 or fewer left | ms/tick avg | p99 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOshodi | 8 | radial | 4 won | 57 | 6 | 22 | 0 | 0 | 0 | 71 % | 82 % | 0.54 | 4.9 |
| rumbleOshodi | 8 | cross | 4 won | 58 | 5 | 23 | 0 | 0 | 0 | 69 % | 82 % | 0.43 | 4.7 |
| rumbleOshodi | 16 | radial | 4 won | 42 | 9 | 50 | 1 | 0 | 0 | 79 % | 80 % | 1.03 | 7.3 |
| rumbleOshodi | 16 | cross | 4 won | 49 | 12 | 48 | 0 | 0 | 0 | 76 % | 78 % | 0.82 | 6.8 |
| rumbleOshodi | 24 | radial | 4 won | 39 | 17 | 74 | 0 | 1 | 0 | 83 % | 76 % | 1.60 | 9.6 |
| rumbleOshodi | 24 | cross | 4 won | 57 | 20 | 72 | 0 | 0 | 0 | 83 % | 80 % | 0.99 | 7.2 |
| rumbleOshodi | 32 | radial | 4 won | 63 | 23 | 101 | 0 | 0 | 0 | 84 % | 74 % | 1.41 | 9.9 |
| rumbleOshodi | 32 | cross | 4 won | 59 | 33 | 90 | 0 | 1 | 0 | 85 % | 78 % | 1.31 | 8.6 |
| rumbleApapa | 8 | radial | 4 won | 38 | 6 | 22 | 0 | 0 | 0 | 54 % | 68 % | 0.58 | 5.6 |
| rumbleApapa | 8 | cross | 4 won | 61 | 4 | 23 | 0 | 1 | 0 | 58 % | 66 % | 0.43 | 4.9 |
| rumbleApapa | 16 | radial | 4 won | 53 | 15 | 45 | 0 | 0 | 0 | 67 % | 70 % | 1.00 | 7.2 |
| rumbleApapa | 16 | cross | 4 won | 58 | 13 | 47 | 0 | 0 | 0 | 72 % | 79 % | 0.76 | 6.4 |
| rumbleApapa | 24 | radial | 4 won | 59 | 25 | 67 | 0 | 0 | 0 | 80 % | 87 % | 1.31 | 7.8 |
| rumbleApapa | 24 | cross | 4 won | 66 | 23 | 69 | 0 | 0 | 0 | 78 % | 74 % | 0.81 | 6.0 |
| rumbleApapa | 32 | radial | 4 won | 52 | 34 | 89 | 1 | 0 | 0 | 81 % | 80 % | 1.84 | 10.3 |
| rumbleApapa | 32 | cross | 4 won | 56 | 27 | 96 | 1 | 0 | 0 | 83 % | 76 % | 1.26 | 7.9 |
| cityRumble | 8 | radial | 4 won | 41 | 6 | 22 | 0 | 0 | 0 | 73 % | 76 % | 0.51 | 6.0 |
| cityRumble | 8 | cross | 4 won | 51 | 5 | 23 | 0 | 0 | 0 | 73 % | 76 % | 0.37 | 5.2 |
| cityRumble | 16 | radial | 4 won | 52 | 10 | 50 | 0 | 0 | 0 | 77 % | 78 % | 0.85 | 7.4 |
| cityRumble | 16 | cross | 4 won | 75 | 5 | 55 | 0 | 0 | 0 | 81 % | 88 % | 0.41 | 4.6 |
| cityRumble | 24 | radial | 4 won | 43 | 19 | 73 | 0 | 0 | 0 | 86 % | 88 % | 1.64 | 10.3 |
| cityRumble | 24 | cross | 3 won, 1 draw | 73 | 14 | 79 | 0 | 0 | 0 | 81 % | 74 % | 0.79 | 6.5 |
| cityRumble | 32 | radial | 4 won | 76 | 18 | 105 | 0 | 0 | 1 | 83 % | 77 % | 1.40 | 9.5 |
| cityRumble | 32 | cross | 4 won | 68 | 21 | 101 | 1 | 1 | 0 | 87 % | 87 % | 1.02 | 8.1 |

| bots | blast | own blast | rival blast | vehicle | stage hazard | crush | all deaths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | radial | 18 | 66 | 0 | 0 | 0 | 84 |
| 8 | cross | 14 | 69 | 0 | 1 | 0 | 84 |
| 16 | radial | 34 | 145 | 1 | 0 | 0 | 180 |
| 16 | cross | 30 | 150 | 0 | 0 | 0 | 180 |
| 24 | radial | 61 | 214 | 0 | 1 | 0 | 276 |
| 24 | cross | 57 | 220 | 0 | 0 | 0 | 277 |
| 32 | radial | 75 | 295 | 1 | 0 | 1 | 372 |
| 32 | cross | 81 | 287 | 2 | 2 | 0 | 372 |

Reading: with radial-aware bots the own-blast share is at parity with the cross (188 vs 182 deaths over 48
matches; per cell the difference is a few deaths and flips sign between cells and seeds). Phase 0 bots on the
radial rules lost 42 % of the field to their own blast and ended 32-bot matches in under 20 s, often in draws.
The remaining own-blast deaths are mostly "chained by a rival": a bot's generator set off early inside a cascade
of several owners' generators in the crowded opening, not a walk into a visible footprint. Elimination
opportunities stay high: most kills come from blasts that include two or more of the killer's own generators
(about 120 of 150 kills per 6-match 32-bot stage batch). Engagement: an opponent within 6 tiles in 54-86 % of
alive samples (similar to the cross), and with 6 or fewer left the fighters keep closing in (68-88 %): the bots
fight rather than camp. Radial matches are a little shorter at 8-24 bots.

**Respawn rulesets** (radial-aware bots, 16 bots, 1 minute, seeds 1-2): credited kills per match - Team Rumble
with friendly fire 30 / 38 (cityRumble) and 34 / 34 (rumbleOshodi), 2.2-3.7 ms/tick; without friendly fire 52 / 51
and 30 / 39; Deathmatch 52 / 46 and 50 / 44, 1.8-2.4 ms/tick. Friendly-fire placement share: table above.

**Cost.** `radialFootprint` was the top cost (25 % of CPU in a 32-bot radial match). After its internal
optimisation (RE-AI5), the per-node footprint cache and closure-free blockers, the same match went from 2.68 to
1.46 ms per tick with an identical outcome. Radial Rumble stays about 1.1-1.8 x the cross per tick at 24-32 bots
(p99 about 9-10 ms vs 7-8 ms), inside a 16.7 ms frame on this shared machine.

**Tests.** `tests/ai/radial.test.ts` (30 cases: danger map == `previewBlast` on 40 random boards with crates,
Petrol, Hot Fuel, Square Blast and chains; diagonal / shadow / crate-cleared / chain cases; escaping via a wall
shadow and off a diagonal; never walking into a visible footprint at four fuse timings and three levels; a
telegraphed sweep next to a disc; blasting an authored barrier open; friendly fire; supply crates; two
generators; the optimised footprint equals the Phase 0 reference on 300 random boards). 13 of them fail with the
Phase 0 bots; the rest are invariants that already held. `tests/ai/radial-rumble.test.ts`: 32-bot radial
Survival on rumbleOshodi / rumbleApapa ends with a result and keeps an opponent within 6 tiles more than 60 % of
the time (more than 25 % with 6 or fewer left); own-blast deaths radial <= cross over 3 stages x 2 seeds on the
real schedule (measured 40 vs 43).

**Not done / open.** Own-blast deaths are at parity with the cross, not clearly below it, and slightly above it
at 8-24 bots; the chain-link idea (RE-AI7) did not help. The new Ojuelegba layout was not used in any test or
measurement (another stream owns it); its `x` partition is an ordinary barrier crate to the bots. Absolute
ms/tick values are indicative only (shared machine); comparisons inside one table are like for like.
