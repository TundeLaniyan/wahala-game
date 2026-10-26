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

## A. Assisted movement

Workstream A (decisions RE-A1..RE-A8). The founder found it hard to steer round corners, obstacles and generators
with the mobile thumbstick. Movement is easier to steer while the simulation is exactly as before: the assist is
local, deterministic input-layer logic (no cloud, no randomness) that only chooses which orthogonal direction
`MoveGate` hands over, and every hand-over is still one tile resolved by the real movement and collision rules.

| Help | What it does |
| --- | --- |
| Early turn | A turn held while walking, blocked here, is carried along the corridor up to 2 tiles to the first tile where it opens, and taken. No opening in reach: delivered at once, the player just faces the wall. A released flick is a plain press. |
| Sidestep | A direction held against a wall (past the tap delay) with the opening one tile along the corridor slides there and goes on. One qualifying side only (or the thumb's secondary axis / last walked direction decides); never away from a crate. |
| Diagonal thumb | `VirtualStick.wish`: the weaker axis of a clearly diagonal thumb (35 degrees engage, 27 release) is the next turn, taken at the first legal junction on a hold repeat, alternating with the main direction. A flick stays one tile. |
| Direction switch | 2 ticks of settling when a thumb goes straight from one direction to another (touch), so a swipe through the centre leaks no stray tile. |

Safety: a move the assist makes on the player's behalf is a plain step onto open floor that is not a flame, a
generator or its blast footprint (`previewBlast`, radial included), a warned or live lethal stage event, a Wahala
Crush warning, a floor trap, a manhole or an attack vehicle's route (`moveAssist.ts`, `hazardTiles`). The direction
the player explicitly holds is never blocked.

Setting `moveAssist` (`auto` / `on` / `off`, Settings > Controls): `auto` = full help on touch, WA2's one-tile corner
buffer plus the danger check with keyboard / gamepad; `on` = full help everywhere; `off` = exactly the behaviour
before this milestone. (The contract table in section 2 says `assistedMovement`; the field is `moveAssist`.)

Files: `src/input/moveAssist.ts` (new), `moveGate.ts`, `InputManager.ts`, `joystick.ts`; `app/settings.ts`,
`app/session.ts`, `app/MatchController.ts` (builds the `board`); `ui/TouchControls.tsx` (passes the wish),
`ui/menu/SettingsScreen.tsx` + `menu.css` (toggle). Tests: `tests/input-assist.test.ts` (scenarios with the real
InputManager, stick model and simulation: junctions, a sidestep alley, every hazard kind, the Lagos Island stall
aisles, seven phone sizes incl. portrait), `tests/input-assist-gate.test.ts` (off == the verbatim pre-assist gate over
random sessions, keyboard / gamepad latency, planners, wish hysteresis, board hazards, 60 random wandering-thumb
sessions that check every self-chosen move), `tests/app/moveAssistSetting.test.ts`, and three phone-project
Playwright checks in `e2e/mobile.spec.ts`.

Not covered: nobody has used this on a physical phone (emulated touch and pointer events only); the thresholds
(reach 2, wish 35 / 27 degrees, 2-tick settle) are first guesses to tune from play.
