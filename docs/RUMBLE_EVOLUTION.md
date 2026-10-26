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
| A Assisted movement | `src/input/*` (new `moveAssist.ts`), `ui/TouchControls.tsx` + touch CSS, the movement-assist part of `app/MatchController.ts` (the `IntentContext` it builds), the `moveAssist` setting (`app/settings.ts` field + Settings > Controls / Accessibility toggle in `ui/menu/SettingsScreen.tsx`), `tests/input-*.test.ts`, `e2e/mobile.spec.ts` |
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
## C. Generator availability, rewards and measurements

Workstream C (decisions RE-C1..RE-C6 in `DECISIONS.md`). What changed: Square Blast reach and the reward rules in
`RUMBLE_ECONOMY` / `rewards.ts` (RE-C4), eight marked supply crates on four stages with a visible marking (RE-C5),
and the measurement harness (RE-C2). Nothing else in the economy moved: two starting generators (RE-C1, Phase 0),
reach cap 5, capacity cap 10, the ladder rungs and the fallback list are as before.

### C.1 The harness

```
npx tsx scripts/rumble-metrics.ts --arenas rumbleOshodi,rumbleApapa,cityRumble \
    --cases survival:16,survival:32,deathmatch:16:5 --variants legacy,evolution --matches 4 --seed 100 --json out.json
npx tsx scripts/rumble-metrics.ts --ladder --variants legacy,evolution --kills 12      # bot-independent economy curve
npx tsx scripts/rumble-metrics.ts --arenas rumbleOshodi --cases survival:32 --variants nosupply,evolution,sq6
npx tsx scripts/rumble-metrics.ts --variants evolution+ --config '{"rewards":{"fallback":["socket"]}}'   # ad hoc override
```

Variants live in `scripts/rumbleMetrics/variants.ts` (`legacy`, `evolution`, `nosupply` = supply crates left empty,
`sq6` = the Square Blast cap that is now the default); metric definitions are in `scripts/rumbleMetrics/collector.ts`
and are tested (`tests/rumble-economy-evolution.test.ts`: camping tracker, determinism per seed, read-only collector).
A 4-seed table of 3 stages x 3 cases x 2 variants takes ~5 minutes on the shared 4-core machine.

### C.2 Legacy versus evolution (bots as they are before the AI merge)

`legacy` = plus blast, one starting generator, reach cap 10. `evolution` = the current defaults. Standard bots, seeds
100-103, sample every 6 ticks. Columns: elims = eliminations per match; 1st s = mean time of the first elimination;
<=30 / <=60 s = eliminations in the opening; engaged = share of fighter time with a living opponent within 6 tiles
(whole match / first 60 s); in fire = share inside an opponent's live blast footprint; gens/fm = placements per
fighter-minute; aimed = placements whose footprint held a living opponent; camp = share of time in >= 5 s runs inside
3 x 3; near opp = mean distance to the nearest opponent; self = self-eliminations per match; top / med k, pw = kills and
peak power of the top eliminator and of the median fighter.

| stage | ruleset | bots | variant | n | result | len s | elims | elims/min | 1st s | <=30 s | <=60 s | engaged | engaged 60s | in fire | in fire 60s | gens/fm | aimed | camp | near opp | self | top k | med k | top pw | med pw | ms/tick |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOshodi | survival | 16 | legacy | 4 | win 4 | 67.1 | 15.0 | 13.8 | 6.1 | 9.3 | 13.5 | 88% | 88% | 29% | 28% | 23.2 | 84% | 2% | 3.1 | 1.8 | 6.0 | 0.1 | 17.0 | 0.6 | 0.35 |
| rumbleOshodi | survival | 16 | evolution | 4 | win 4 | 19.1 | 15.0 | 49.3 | 3.2 | 15.0 | 15.0 | 64% | 64% | 38% | 38% | 32.8 | 65% | 0% | 5.7 | 6.3 | 3.0 | 0.4 | 4.0 | 0.1 | 0.31 |
| rumbleOshodi | survival | 32 | legacy | 4 | win 4 | 51.6 | 31.0 | 37.2 | 3.7 | 21.5 | 30.5 | 93% | 93% | 33% | 32% | 22.7 | 91% | 1% | 2.6 | 4.0 | 7.8 | 0.5 | 20.5 | 0.0 | 0.57 |
| rumbleOshodi | survival | 32 | evolution | 4 | win 3, d:simultaneous 1 | 20.8 | 31.3 | 96.3 | 3.4 | 31.3 | 31.3 | 79% | 79% | 44% | 44% | 30.9 | 77% | 0% | 4.4 | 14.3 | 4.0 | 0.8 | 3.3 | 0.0 | 0.51 |
| rumbleOshodi | deathmatch 5m | 16 | legacy | 4 | win 4 | 300.0 | 278.5 | 55.7 | 7.0 | 11.5 | 30.8 | 80% | 83% | 25% | 27% | 19.0 | 94% | 1% | 4.2 | 22.8 | 175.0 | 5.5 | 37.0 | 3.9 | 0.66 |
| rumbleOshodi | deathmatch 5m | 16 | evolution | 4 | win 4 | 300.0 | 429.0 | 85.8 | 3.4 | 35.5 | 73.5 | 71% | 68% | 40% | 40% | 27.3 | 93% | 0% | 5.1 | 101.8 | 142.5 | 17.8 | 29.0 | 4.0 | 0.67 |
| rumbleApapa | survival | 16 | legacy | 4 | win 4 | 73.6 | 15.0 | 12.6 | 9.0 | 8.0 | 13.3 | 83% | 83% | 25% | 24% | 23.8 | 79% | 3% | 3.5 | 3.3 | 5.8 | 0.3 | 15.8 | 0.5 | 0.28 |
| rumbleApapa | survival | 16 | evolution | 4 | win 4 | 23.5 | 15.0 | 41.2 | 3.0 | 14.5 | 15.0 | 54% | 54% | 30% | 30% | 33.6 | 51% | 0% | 7.2 | 9.8 | 2.3 | 0.1 | 1.8 | 0.0 | 0.24 |
| rumbleApapa | survival | 32 | legacy | 4 | win 4 | 68.6 | 31.0 | 27.3 | 6.1 | 18.5 | 29.5 | 90% | 90% | 29% | 29% | 23.4 | 85% | 3% | 2.9 | 4.0 | 10.8 | 0.1 | 34.0 | 0.1 | 0.66 |
| rumbleApapa | survival | 32 | evolution | 4 | d:simultaneous 1, win 3 | 21.2 | 31.3 | 95.2 | 3.0 | 30.8 | 31.3 | 71% | 71% | 39% | 39% | 32.6 | 64% | 0% | 5.3 | 18.3 | 3.3 | 0.0 | 4.0 | 0.0 | 0.52 |
| rumbleApapa | deathmatch 5m | 16 | legacy | 4 | win 4 | 300.0 | 286.0 | 57.2 | 5.1 | 10.8 | 28.5 | 78% | 80% | 25% | 27% | 20.2 | 92% | 1% | 4.2 | 16.0 | 163.8 | 4.8 | 37.0 | 3.5 | 0.73 |
| rumbleApapa | deathmatch 5m | 16 | evolution | 4 | win 4 | 300.0 | 471.0 | 94.2 | 3.0 | 40.3 | 85.3 | 70% | 64% | 42% | 38% | 27.8 | 91% | 0% | 5.1 | 117.8 | 137.5 | 20.0 | 29.0 | 4.0 | 0.64 |
| cityRumble | survival | 16 | legacy | 4 | win 4 | 43.3 | 15.0 | 21.0 | 6.3 | 11.0 | 15.0 | 88% | 88% | 30% | 30% | 21.6 | 87% | 2% | 3.1 | 2.8 | 4.8 | 0.3 | 12.5 | 0.5 | 0.29 |
| cityRumble | survival | 16 | evolution | 4 | win 3, d:simultaneous 1 | 14.2 | 15.3 | 70.5 | 3.5 | 15.3 | 15.3 | 65% | 65% | 39% | 39% | 32.6 | 62% | 1% | 6.3 | 5.0 | 3.3 | 0.6 | 4.8 | 0.0 | 0.27 |
| cityRumble | survival | 32 | legacy | 4 | win 4 | 44.6 | 31.0 | 43.2 | 3.7 | 24.8 | 31.0 | 93% | 93% | 35% | 35% | 22.3 | 93% | 1% | 2.5 | 5.5 | 9.8 | 0.0 | 30.0 | 0.0 | 0.54 |
| cityRumble | survival | 32 | evolution | 4 | d:simultaneous 2, win 2 | 16.1 | 31.5 | 126.3 | 3.3 | 31.5 | 31.5 | 83% | 83% | 49% | 49% | 29.1 | 82% | 0% | 4.2 | 8.0 | 7.5 | 0.4 | 16.8 | 0.0 | 0.64 |
| cityRumble | deathmatch 5m | 16 | legacy | 4 | win 4 | 300.0 | 283.3 | 56.7 | 8.1 | 14.5 | 35.3 | 78% | 82% | 26% | 28% | 19.2 | 94% | 1% | 4.3 | 17.0 | 191.3 | 5.6 | 37.0 | 3.5 | 0.64 |
| cityRumble | deathmatch 5m | 16 | evolution | 4 | win 4 | 300.0 | 470.8 | 94.2 | 3.5 | 41.5 | 86.0 | 69% | 66% | 42% | 42% | 26.1 | 94% | 0% | 5.5 | 117.0 | 142.3 | 20.3 | 29.0 | 4.0 | 0.59 |


**Reading it - with a warning.** These bots still reason with the plus shape. Under the radial blast they walk into
their own fire: the first elimination falls at 3-3.5 s (legacy 3.7-9 s), 5-18 eliminations per match are
self-eliminations (legacy 2-6) and Survival is decided in 14-24 s (legacy 43-74 s). So the table shows that Phase 0
raised offence a lot (eliminations per minute x1.5 in Deathmatch and x2.6-3.6 in Survival, time spent standing in an
opponent's blast footprint 25-35 % -> 30-49 %, placements per fighter-minute 19-24 -> 26-34), but it cannot say how
much of that is real offence and how much bot suicide; "engaged" falls only because the field is empty after 15 s.
Camping is 0-3 % in both: these bots never sit still, so the harness cannot show the founder's passivity concern until
the bots are radial-aware. Re-run the command above after the AI merge and judge: first-elimination time, `<=30 s` in
Survival, `in fire 60s`, `aimed`, `self`, and the Deathmatch concentration columns. Deathmatch shows the snowball
(RE-C6a): one bot takes ~140 of ~450 eliminations at the 29-power plateau against a median fighter at 4 (legacy: 164-191
of ~280, power 37 against 3.5-5.5).

### C.3 The elimination ladder (bot-independent; `--ladder`)

What a fighter owns after n credited eliminations (all three fighters give the same row apart from the contact tool).
`blast tiles` = tiles one generator burns on open ground; `coverage` = generators x blast tiles.

Evolution (defaults):

| kills | paid | gens | radius | square | armour | speed | okada | contact | remote | voucher | blast tiles | coverage | power |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | - | 2 | 2 | 0 | 0 | 0 | - | - | - | - | 21 | 42 | 0 |
| 1 | socket+petrol | 3 | 3 | 0 | 0 | 0 | - | - | - | - | 37 | 111 | 2 |
| 2 | boots+skates | 3 | 3 | 0 | 0 | 1 | - | kick | - | - | 37 | 111 | 4 |
| 3 | armour+socket | 4 | 3 | 0 | 1 | 1 | - | kick | - | - | 37 | 148 | 7 |
| 4 | square+petrol | 4 | 4 | 1 | 1 | 1 | - | kick | - | - | 81 | 324 | 10 |
| 5 | remote+voucher+socket | 5 | 4 | 1 | 1 | 1 | - | kick | yes | yes | 81 | 405 | 13 |
| 6 | okada+armour+petrol | 5 | 5 | 1 | 2 | 1 | yes | kick | yes | yes | 121 | 605 | 18 |
| 7 | square+socket+skates | 6 | 5 | 2 | 2 | 2 | yes | kick | yes | yes | 169 | 1014 | 22 |
| 8 | armour+socket+socket+socket | 9 | 5 | 2 | 3 | 2 | yes | kick | yes | yes | 169 | 1521 | 27 |
| 9 | socket+skates | 10 | 5 | 2 | 3 | 3 | yes | kick | yes | yes | 169 | 1690 | 29 |
| 10 | - | 10 | 5 | 2 | 3 | 3 | yes | kick | yes | yes | 169 | 1690 | 29 |
| 11 | - | 10 | 5 | 2 | 3 | 3 | yes | kick | yes | yes | 169 | 1690 | 29 |
| 12 | - | 10 | 5 | 2 | 3 | 3 | yes | kick | yes | yes | 169 | 1690 | 29 |

Legacy for comparison (plus blast, 1 start generator, reach cap 10): coverage 9 / 26 / 26 / 39 / 63 / 84 / 100 / 185 /
287 / 549 / 690 / 770 for kills 0-11, so the radial start is 42 against 9 (x4.7) and the first kill takes it to 111
(legacy 26); the legacy ladder is dry after kill 11, the evolution ladder after kill 9.

Findings:

1. **Early offence is already large without any economy change**: coverage 42 at the start, 111 after one kill, 324 after
   four. The two start generators plus radius 2 are worth more than legacy's first kill.
2. **Square tiers 2-3 were dead rewards under the Phase 0 cap (radius 4)**: kills 7 and 9 paid a tier that left the blast at
   121 tiles. Fixed by RE-C4 (cap 6 and a usefulness check): kill 7 now takes it to 169 tiles, and no rung is wasted
   before the plateau.
3. **Petrol saturates at kill 6** (three steps: 2 -> 5); later petrol entries become sockets / armour via the fallback
   list, as designed (WC3). Reach is capped at 5 by Phase 0 and was not raised: a radius-5 disc is 97 tiles on a
   41 x 31 board and the square pays the rest.
4. **The ladder is dry after kill 9.** Typical top eliminators (bots: 3-8 in Survival) stay inside it; Deathmatch leaders
   (their ladder is per life) reach the plateau and stay there. Only spent protection is paid again afterwards (tested).
   Raising a cap would be the lever (capacity 10 -> 12, armour 3 -> 4), at a cost in danger-map work for 32 fighters; not
   done without data from radial-aware bots.
5. **Progression is monotone** (tested for all three fighters and both blast modes): a fighter with more eliminations
   is never weaker in generators, reach, square tier, armour, speed, coverage or power score.

### C.4 Supply crates

Eight `$` crates (two per quadrant) on Oshodi, Lagos Island, Apapa and Lekki Nightworks, each one socket or petrol,
placed 5 or more tiles from every spawn in the ground between spawns and core. The `nosupply` variant (same layout,
empty crates) isolates their effect; with the current bots it is invisible (a first run on an earlier placement of the
same eight: Oshodi Survival 32 gave 31.5 vs 31.0 eliminations and a first elimination at 3.4 s in both), because the
matches end in the first 20 s through self-kills. This is the number to re-measure after the AI merge
(`--variants nosupply,evolution`, look at the opening columns). Recommendation: keep 8 (0.25-0.5 per fighter); only if
openings stay passive with radial-aware bots add a third per quadrant (12; `mirrorQuadrant` takes the marks) rather than
adding drops to ordinary crates, which stay empty in Rumble.

Marking (checked in Chromium with software GL on Oshodi at desktop and phone size and on Lekki Nightworks): yellow
straps over a plain wooden crate, a black `$` on a yellow plate on the south face and the lid, and four painted yellow
corner brackets on the floor (`SupplyMarkViews.ts`). They are flat on the crate, so they never hide a generator or a
fighter, and they dissolve with the crate's occlusion fade.

### C.5 Tests

`tests/rumble-economy-evolution.test.ts` (32 tests): two generators in every Rumble ruleset and the respawn reset;
Classic's economy unchanged; ladder under radial caps (pays, never wastes a square tier, monotone, spent protection is
paid again, `grantRewards` equals the curve); supply crates (counts, symmetry, distance from spawns, basic upgrades only,
public marking / hidden content, finite, no refills, none in Classic); harness functions. `tests/economy.test.ts`
expects square tier 2 (not 3) after a long run, deliberately (RE-C4). `tests/rumble-stages.test.ts` accepts the cover
marks `_ x $` in a layout row.

### C.6 Research metrics at 8 / 16 / 24 / 32 combatants

Added after the late research brief; all are in `scripts/rumble-metrics.ts` (second table, `--slots` for the spawn
table) and tested. Definitions:

- **1st encounter s** = the first moment any fighter stands inside a live opponent's blast footprint (chains included,
  sampled at 10 Hz) or a credited elimination falls. Design target 5-10 s.
- **empty runs >= 15 s / longest empty s** = stretches in which a fighter has no living opponent within 6 tiles
  (Manhattan); runs of 15 s or more are the "routine empty traversals" to flag.
- **causes** = eliminations per match: own blast / rival blast / team blast (friendly fire) / vehicle / stage hazard
  (traffic, crowd, falling goods) / crush / melee (a death by crush or hazard that a rival's shove within the credit
  window is credited with).
- **live gens** = ticking generators on the board: mean, peak, and mean per living fighter.
- **supplies opened** = standing supply crates at the start, how many were opened (and within 60 s), time of the first;
  **pickups taken / wasted / burned** = floor pickups collected, collected but useless, burned before anyone took them.
- **slot survival spread / cv** = spawn fairness: the spread (max - min) and the coefficient of variation of the mean
  share of the match each spawn slot was alive; `--slots` prints survival, kills and wins per slot.

Survival, 4 seeds (100-103), legacy vs evolution, at 8 / 16 / 24 / 32 bots:

| stage | ruleset | bots | variant | n | result | len s | elims | elims/min | 1st s | <=30 s | <=60 s | engaged | engaged 60s | in fire | in fire 60s | gens/fm | aimed | camp | near opp | self | top k | med k | top pw | med pw | ms/tick |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOshodi | survival | 8 | legacy | 4 | win 4 | 90.4 | 7.0 | 5.3 | 14.2 | 4.3 | 6.3 | 81% | 79% | 24% | 23% | 26.0 | 75% | 5% | 4.4 | 1.3 | 3.5 | 0.4 | 8.3 | 1.1 | 0.53 |
| rumbleOshodi | survival | 8 | evolution | 4 | win 3, d:simultaneous 1 | 15.1 | 7.3 | 29.2 | 4.3 | 7.3 | 7.3 | 45% | 45% | 24% | 24% | 33.5 | 47% | 2% | 9.0 | 3.5 | 1.5 | 0.8 | 1.8 | 0.1 | 0.79 |
| rumbleOshodi | survival | 16 | legacy | 4 | win 4 | 67.1 | 15.0 | 13.8 | 6.1 | 9.3 | 13.5 | 88% | 88% | 29% | 28% | 23.2 | 84% | 2% | 3.1 | 1.8 | 6.0 | 0.1 | 17.0 | 0.6 | 0.54 |
| rumbleOshodi | survival | 16 | evolution | 4 | win 4 | 19.1 | 15.0 | 49.3 | 3.2 | 15.0 | 15.0 | 64% | 64% | 38% | 38% | 32.8 | 65% | 0% | 5.7 | 6.3 | 3.0 | 0.4 | 4.0 | 0.1 | 0.77 |
| rumbleOshodi | survival | 24 | legacy | 4 | win 4 | 61.1 | 23.0 | 23.1 | 5.0 | 15.5 | 22.3 | 89% | 89% | 30% | 30% | 24.1 | 86% | 1% | 3.1 | 4.5 | 7.5 | 0.0 | 23.8 | 0.4 | 1.07 |
| rumbleOshodi | survival | 24 | evolution | 4 | win 2, d:simultaneous 2 | 19.6 | 23.5 | 74.8 | 3.7 | 23.5 | 23.5 | 75% | 75% | 42% | 42% | 31.8 | 73% | 1% | 5.2 | 11.0 | 3.5 | 0.9 | 2.3 | 0.0 | 0.63 |
| rumbleOshodi | survival | 32 | legacy | 4 | win 4 | 51.6 | 31.0 | 37.2 | 3.7 | 21.5 | 30.5 | 93% | 93% | 33% | 32% | 22.7 | 91% | 1% | 2.6 | 4.0 | 7.8 | 0.5 | 20.5 | 0.0 | 1.24 |
| rumbleOshodi | survival | 32 | evolution | 4 | win 3, d:simultaneous 1 | 20.8 | 31.3 | 96.3 | 3.4 | 31.3 | 31.3 | 79% | 79% | 44% | 44% | 30.9 | 77% | 0% | 4.4 | 14.3 | 4.0 | 0.8 | 3.3 | 0.0 | 1.32 |
| rumbleApapa | survival | 8 | legacy | 4 | win 4 | 88.5 | 7.0 | 4.8 | 15.7 | 3.0 | 5.3 | 74% | 73% | 21% | 18% | 25.3 | 69% | 5% | 5.0 | 1.3 | 3.8 | 0.3 | 10.3 | 1.1 | 0.31 |
| rumbleApapa | survival | 8 | evolution | 4 | win 4 | 16.5 | 7.0 | 26.7 | 3.4 | 7.0 | 7.0 | 34% | 34% | 21% | 21% | 33.3 | 36% | 0% | 10.4 | 4.8 | 1.3 | 0.1 | 1.0 | 0.0 | 0.17 |
| rumbleApapa | survival | 16 | legacy | 4 | win 4 | 73.6 | 15.0 | 12.6 | 9.0 | 8.0 | 13.3 | 83% | 83% | 25% | 24% | 23.8 | 79% | 3% | 3.5 | 3.3 | 5.8 | 0.3 | 15.8 | 0.5 | 0.67 |
| rumbleApapa | survival | 16 | evolution | 4 | win 4 | 23.5 | 15.0 | 41.2 | 3.0 | 14.5 | 15.0 | 54% | 54% | 30% | 30% | 33.6 | 51% | 0% | 7.2 | 9.8 | 2.3 | 0.1 | 1.8 | 0.0 | 0.50 |
| rumbleApapa | survival | 24 | legacy | 4 | win 4 | 84.1 | 23.0 | 16.9 | 5.8 | 14.0 | 21.3 | 89% | 88% | 30% | 28% | 24.7 | 82% | 5% | 3.0 | 3.5 | 5.8 | 0.3 | 17.3 | 0.9 | 0.64 |
| rumbleApapa | survival | 24 | evolution | 4 | win 3, d:simultaneous 1 | 22.9 | 23.3 | 62.8 | 3.0 | 23.3 | 23.3 | 62% | 62% | 34% | 34% | 32.9 | 56% | 0% | 6.0 | 14.3 | 3.5 | 0.0 | 4.3 | 0.0 | 0.66 |
| rumbleApapa | survival | 32 | legacy | 4 | win 4 | 68.6 | 31.0 | 27.3 | 6.1 | 18.5 | 29.5 | 90% | 90% | 29% | 29% | 23.4 | 85% | 3% | 2.9 | 4.0 | 10.8 | 0.1 | 34.0 | 0.1 | 0.95 |
| rumbleApapa | survival | 32 | evolution | 4 | d:simultaneous 1, win 3 | 21.2 | 31.3 | 95.2 | 3.0 | 30.8 | 31.3 | 71% | 71% | 39% | 39% | 32.6 | 64% | 0% | 5.3 | 18.3 | 3.3 | 0.0 | 4.0 | 0.0 | 0.65 |
| cityRumble | survival | 8 | legacy | 4 | win 4 | 54.4 | 7.0 | 8.1 | 8.4 | 4.3 | 6.3 | 87% | 87% | 26% | 25% | 22.9 | 83% | 3% | 3.4 | 2.0 | 3.5 | 0.5 | 7.8 | 0.8 | 0.16 |
| cityRumble | survival | 8 | evolution | 4 | d:simultaneous 1, win 3 | 12.5 | 7.3 | 41.4 | 4.3 | 7.3 | 7.3 | 57% | 57% | 38% | 38% | 32.5 | 58% | 0% | 7.2 | 3.5 | 2.5 | 0.4 | 1.0 | 0.0 | 0.51 |
| cityRumble | survival | 16 | legacy | 4 | win 4 | 43.3 | 15.0 | 21.0 | 6.3 | 11.0 | 15.0 | 88% | 88% | 30% | 30% | 21.6 | 87% | 2% | 3.1 | 2.8 | 4.8 | 0.3 | 12.5 | 0.5 | 0.35 |
| cityRumble | survival | 16 | evolution | 4 | win 3, d:simultaneous 1 | 14.2 | 15.3 | 70.5 | 3.5 | 15.3 | 15.3 | 65% | 65% | 39% | 39% | 32.6 | 62% | 1% | 6.3 | 5.0 | 3.3 | 0.6 | 4.8 | 0.0 | 0.25 |
| cityRumble | survival | 24 | legacy | 4 | win 4 | 54.2 | 23.0 | 28.1 | 5.2 | 17.5 | 22.8 | 90% | 91% | 30% | 31% | 22.3 | 88% | 0% | 2.9 | 3.3 | 7.8 | 0.3 | 24.8 | 0.0 | 0.32 |
| cityRumble | survival | 24 | evolution | 4 | win 4 | 19.2 | 23.0 | 75.7 | 3.6 | 23.0 | 23.0 | 75% | 75% | 47% | 47% | 32.3 | 79% | 1% | 5.2 | 8.0 | 4.8 | 0.6 | 9.3 | 0.0 | 0.60 |
| cityRumble | survival | 32 | legacy | 4 | win 4 | 44.6 | 31.0 | 43.2 | 3.7 | 24.8 | 31.0 | 93% | 93% | 35% | 35% | 22.3 | 93% | 1% | 2.5 | 5.5 | 9.8 | 0.0 | 30.0 | 0.0 | 0.70 |
| cityRumble | survival | 32 | evolution | 4 | d:simultaneous 2, win 2 | 16.1 | 31.5 | 126.3 | 3.3 | 31.5 | 31.5 | 83% | 83% | 49% | 49% | 29.1 | 82% | 0% | 4.2 | 8.0 | 7.5 | 0.4 | 16.8 | 0.0 | 0.88 |

| stage | ruleset | bots | variant | 1st encounter s | empty runs >= 15 s | longest empty s | own / rival / team / veh / stage / crush / melee | live gens (mean / peak / per fighter) | supplies opened (of start, by 60 s, 1st s) | pickups taken / wasted / burned | slot survival spread / cv |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOshodi | survival | 8 | legacy | 4.0 | 0.3 | 12.9 | 1.3 / 5.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.5 | 4.5 / 9.0 / 1.25 | 6.3 of 8.0, 4.3, 16.2 | 3.3 / 0.0 / 0.3 | 0.59 / 0.39 |
| rumbleOshodi | survival | 8 | evolution | 4.0 | 0.0 | 9.6 | 3.5 / 3.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 7.8 / 15.8 / 1.41 | 3.0 of 8.0, 3.0, 5.4 | 2.0 / 0.0 / 0.3 | 0.39 / 0.17 |
| rumbleOshodi | survival | 16 | legacy | 1.1 | 0.0 | 9.3 | 1.8 / 13.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 7.1 / 15.8 / 1.12 | 5.3 of 8.0, 5.3, 7.4 | 4.5 / 0.0 / 0.8 | 0.66 / 0.38 |
| rumbleOshodi | survival | 16 | evolution | 1.1 | 0.0 | 9.6 | 6.3 / 8.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 10.7 / 29.8 / 1.43 | 5.5 of 8.0, 5.5, 5.6 | 2.8 / 0.0 / 1.0 | 0.49 / 0.28 |
| rumbleOshodi | survival | 24 | legacy | 0.8 | 0.3 | 12.0 | 4.5 / 18.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.3 | 9.9 / 23.8 / 1.12 | 5.8 of 8.0, 5.8, 10.1 | 4.5 / 0.0 / 1.0 | 0.66 / 0.34 |
| rumbleOshodi | survival | 24 | evolution | 0.8 | 0.0 | 9.0 | 11.0 / 12.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 12.1 / 44.0 / 1.36 | 4.5 of 8.0, 4.5, 9.2 | 2.3 / 0.0 / 0.3 | 0.60 / 0.38 |
| rumbleOshodi | survival | 32 | legacy | 0.7 | 0.0 | 7.3 | 4.0 / 26.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.3 | 11.9 / 30.0 / 1.01 | 6.0 of 8.0, 6.0, 10.3 | 4.5 / 0.0 / 0.8 | 0.67 / 0.34 |
| rumbleOshodi | survival | 32 | evolution | 0.7 | 0.0 | 8.7 | 14.3 / 17.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 14.7 / 54.3 / 1.38 | 6.0 of 8.0, 6.0, 6.3 | 3.5 / 0.0 / 1.0 | 0.57 / 0.39 |
| rumbleApapa | survival | 8 | legacy | 4.3 | 1.0 | 15.4 | 1.3 / 5.0 / 0.0 / 0.0 / 0.0 / 0.3 / 0.5 | 4.8 / 8.5 / 1.26 | 3.8 of 8.0, 3.8, 21.9 | 3.8 / 0.0 / 0.0 | 0.58 / 0.33 |
| rumbleApapa | survival | 8 | evolution | 6.3 | 0.3 | 9.3 | 4.8 / 2.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 6.8 / 16.0 / 1.45 | 3.0 of 8.0, 3.0, 7.6 | 1.3 / 0.0 / 0.0 | 0.62 / 0.39 |
| rumbleApapa | survival | 16 | legacy | 1.1 | 0.0 | 9.1 | 3.3 / 11.3 / 0.0 / 0.0 / 0.0 / 0.3 / 0.3 | 7.4 / 16.5 / 1.12 | 5.8 of 8.0, 5.0, 11.8 | 4.8 / 0.0 / 0.5 | 0.45 / 0.29 |
| rumbleApapa | survival | 16 | evolution | 1.1 | 0.3 | 14.0 | 9.8 / 5.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 9.0 / 29.5 / 1.49 | 4.0 of 8.0, 4.0, 7.5 | 2.0 / 0.0 / 0.3 | 0.53 / 0.38 |
| rumbleApapa | survival | 24 | legacy | 0.6 | 0.0 | 7.5 | 3.5 / 19.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 8.9 / 23.5 / 1.22 | 6.5 of 8.0, 5.8, 14.4 | 4.8 / 0.0 / 0.8 | 0.46 / 0.35 |
| rumbleApapa | survival | 24 | evolution | 0.6 | 0.3 | 10.0 | 14.3 / 9.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 11.8 / 41.8 / 1.49 | 4.5 of 8.0, 4.5, 8.7 | 3.0 / 0.0 / 0.0 | 0.45 / 0.29 |
| rumbleApapa | survival | 32 | legacy | 0.4 | 0.0 | 7.1 | 4.0 / 27.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 12.4 / 31.8 / 1.06 | 7.5 of 8.0, 7.5, 8.1 | 6.3 / 0.0 / 1.0 | 0.69 / 0.34 |
| rumbleApapa | survival | 32 | evolution | 0.4 | 0.5 | 11.5 | 18.3 / 13.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 16.2 / 58.3 / 1.49 | 4.8 of 8.0, 4.8, 10.7 | 1.5 / 0.0 / 0.8 | 0.41 / 0.30 |
| cityRumble | survival | 8 | legacy | 2.2 | 0.0 | 8.4 | 2.0 / 5.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 4.8 / 8.0 / 1.07 | - | 0.0 / 0.0 / 0.0 | 0.59 / 0.33 |
| cityRumble | survival | 8 | evolution | 1.8 | 0.0 | 7.0 | 3.5 / 3.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 7.4 / 14.5 / 1.31 | - | 0.0 / 0.0 / 0.0 | 0.35 / 0.13 |
| cityRumble | survival | 16 | legacy | 0.9 | 0.0 | 8.7 | 2.8 / 12.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 7.5 / 15.8 / 0.94 | - | 0.0 / 0.0 / 0.0 | 0.44 / 0.20 |
| cityRumble | survival | 16 | evolution | 0.9 | 0.0 | 8.2 | 5.0 / 10.3 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 11.0 / 26.8 / 1.40 | - | 0.0 / 0.0 / 0.0 | 0.57 / 0.25 |
| cityRumble | survival | 24 | legacy | 0.6 | 0.3 | 11.9 | 3.3 / 19.8 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 9.4 / 22.5 / 1.08 | - | 0.0 / 0.0 / 0.0 | 0.53 / 0.34 |
| cityRumble | survival | 24 | evolution | 0.6 | 0.3 | 13.8 | 8.0 / 15.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 11.6 / 38.8 / 1.40 | - | 0.0 / 0.0 / 0.0 | 0.59 / 0.39 |
| cityRumble | survival | 32 | legacy | 0.3 | 0.3 | 10.2 | 5.5 / 25.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 11.8 / 28.8 / 0.96 | - | 0.0 / 0.0 / 0.0 | 0.53 / 0.33 |
| cityRumble | survival | 32 | evolution | 0.3 | 0.3 | 10.3 | 8.0 / 23.5 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 14.8 / 51.0 / 1.23 | - | 0.0 / 0.0 / 0.0 | 0.58 / 0.28 |

Deathmatch 5:00 on City Rumble, 2 seeds, at 8 and 24 bots (16 bots: table C.2):

| stage | ruleset | bots | variant | n | result | len s | elims | elims/min | 1st s | <=30 s | <=60 s | engaged | engaged 60s | in fire | in fire 60s | gens/fm | aimed | camp | near opp | self | top k | med k | top pw | med pw | ms/tick |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cityRumble | deathmatch 5m | 8 | legacy | 2 | win 2 | 300.0 | 129.5 | 25.9 | 10.7 | 5.5 | 12.0 | 70% | 81% | 23% | 23% | 20.2 | 89% | 1% | 6.1 | 7.5 | 95.5 | 4.8 | 37.0 | 3.0 | 0.52 |
| cityRumble | deathmatch 5m | 8 | evolution | 2 | win 2 | 300.0 | 193.5 | 38.7 | 3.3 | 16.5 | 33.5 | 59% | 54% | 37% | 33% | 25.9 | 87% | 0% | 7.9 | 51.5 | 64.0 | 17.8 | 19.5 | 6.5 | 0.44 |
| cityRumble | deathmatch 5m | 24 | legacy | 2 | win 2 | 300.0 | 517.0 | 103.4 | 6.2 | 19.0 | 68.0 | 82% | 86% | 27% | 29% | 19.2 | 97% | 2% | 3.6 | 21.5 | 159.0 | 5.0 | 37.0 | 3.0 | 1.25 |
| cityRumble | deathmatch 5m | 24 | evolution | 2 | win 2 | 300.0 | 776.0 | 155.2 | 3.6 | 69.0 | 143.0 | 76% | 76% | 46% | 48% | 27.0 | 97% | 0% | 4.3 | 160.5 | 177.0 | 21.3 | 29.0 | 4.0 | 0.92 |

| stage | ruleset | bots | variant | 1st encounter s | empty runs >= 15 s | longest empty s | own / rival / team / veh / stage / crush / melee | live gens (mean / peak / per fighter) | supplies opened (of start, by 60 s, 1st s) | pickups taken / wasted / burned | slot survival spread / cv |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cityRumble | deathmatch 5m | 8 | legacy | 2.8 | 0.0 | 9.6 | 7.5 / 121.0 / 0.0 / 0.5 / 0.0 / 0.0 / 0.5 | 4.9 / 12.5 / 0.70 | - | 0.0 / 0.0 / 0.0 | 0.11 / 0.04 |
| cityRumble | deathmatch 5m | 8 | evolution | 2.3 | 0.0 | 11.8 | 51.5 / 142.0 / 0.0 / 0.0 / 0.0 / 0.0 / 0.0 | 5.7 / 16.0 / 0.90 | - | 0.0 / 0.0 / 0.0 | 0.14 / 0.05 |
| cityRumble | deathmatch 5m | 24 | legacy | 0.6 | 1.0 | 17.1 | 21.5 / 488.5 / 0.0 / 7.0 / 0.0 / 0.0 / 0.0 | 11.2 / 27.0 / 0.58 | - | 0.0 / 0.0 / 0.0 | 0.28 / 0.08 |
| cityRumble | deathmatch 5m | 24 | evolution | 0.6 | 0.5 | 11.9 | 160.5 / 608.0 / 0.0 / 6.0 / 1.0 / 0.0 / 0.5 | 13.6 / 38.0 / 0.83 | - | 0.0 / 0.0 / 0.0 | 0.19 / 0.07 |

**What the new metrics say (still with radial-blind bots):**

1. **First encounter is early, not late**: 0.3-1.1 s with 16 / 24 / 32 bots (the spawns are only 5-8 tiles apart) and
   1.8-6.3 s with 8, mostly identical under legacy and evolution (the first threat is whoever drops a generator
   first). Against the 5-10 s target the opening is not passive at any size; with 8 fighters on Apapa the evolution
   encounter is the latest, 6.3 s (legacy 4.3 s).
2. **Empty traversals**: 0-1.3 runs of 15 s or more per match, longest empty stretch 6.5-19 s. Only Apapa at 8 bots
   (legacy 1.0 runs, 15.4 s) and Lekki Nightworks at 16 (legacy 1.3 runs, 19.1 s; evolution 0.7, 15.4 s) cross the flag
   routinely; the other cells average 0-0.5 runs. Legacy and evolution are comparable.
3. **Causes**: legacy deaths are rival blasts (5-27 per match); evolution deaths are half own blasts (3.5-18 of 7-31),
   which is the bots' blindness to the disc, and the vehicle / stage / crush / melee columns are ~0 (matches end before
   the city closes or traffic matters; Deathmatch 24 bots: 6-7 vehicle kills, 1 stage hazard).
4. **Live generators**: evolution has 1.2-1.5 live generators per living fighter against 0.9-1.3 (legacy), peaks of
   14-58 on the board (legacy 8-32): more fire on the board at every size, which is what the extra starting generator is for.
5. **Supply crates**: 3-6 of 8 are opened per Survival match, nearly all within 60 s; in evolution the first one opens
   after 5-11 s (legacy 7-22 s); pickups taken 1.3-3.5 per match in evolution (legacy 3.3-6.3), 0-0.2 wasted (a supply is a useful basic upgrade),
   0-1.0 burned. Evolution opens fewer than legacy (3.0-6.0 vs 3.8-7.5) because its matches end sooner.
6. **Spawn fairness** (12 seeds, Oshodi and Lekki, 16 and 32 bots): on Oshodi and at 16 bots the mean alive share per slot
   is flat (Oshodi 32 evolution: 0.29-0.58, no slot wins more than 1 of 12 matches). **One signal on Lekki Nightworks
   with 32 bots (evolution)**: the corner pair slot 2 (2,0) / slot 3 (38,30) survives 0.58 / 0.76 of the match with
   only 0.17 / 0.33 kills, and wins 2 + 3 of 12 matches (a fair slot would win 0.4 of 12); slots 16 / 17 (6,4) / (34,26)
   are next (0.66 / 0.62, no wins). That is the pattern the research warns about - a pocket that is safe rather than
   strong - in the scaffold-maze corner of that stage. No null distribution (shuffled slots) was run and the bots are
   radial-blind, so it is a flag, not a verdict: re-run `--arenas rumbleLekkiNight --cases survival:32 --matches 50
   --slots` after the AI merge before touching the layout (the stage file's quadrant is the lever: open the corner
   pocket or add a second exit).
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
## E. Living environments, vehicles and NPCs

Workstream E (decisions RE-E1 to RE-E7). Reusable systems that make a City Rumble stage feel alive, declared as
data by the arena. Branch `claude/wahala-rumble-evolution-v1-env`. Everything here is presentation: nothing is a
simulation entity, nothing flows back into the game.

### E.1 The contract (`src/render/env/types.ts`)

An arena's art entry (`ArenaArt` in `render/arenas/newArenas.ts`) may carry `env`: a `StageEnvironment`, or a
factory `(board: {cols, rows}) => StageEnvironment` (the usual form, so the numbers follow a board resize).
`GameRenderer` creates a `LivingEnvironment` for it when the match loads, updates and disposes it with the other
views, and feeds it the tick's SimEvents; an arena without `env` costs nothing. Coordinates are TILE UNITS with
the board at `[0, cols] x [0, rows]` and y growing south (towards the camera): world = `(tx - cols/2, ty - rows/2)`.

| Field | What it declares |
| --- | --- |
| `traffic[]` | Ambient routes: `kinds` (danfo / bus / keke / okada / car / truck, cycled), a polyline `path`, `count`, `speed` (tiles/s), `spacing`, optional `elevation` (metres, a flyover deck is 6.6), `priority`, `minQuality`, `fade` (shrink in / out at the ends) |
| `crowds[]` | Protected off-board zones: `rect`, `count`, `mood` (waiting / trading / watching / working), `facing`, optional `elevation`, `hiVis`, own `reacts`, `priority`, `minQuality` |
| `reactions` | Default reaction rules: `blast` (radius, minimum blast radius), `elimination`, `stage` (optionally only some hazard styles); each gives a `reaction` (duck / flinch / scatter / cheer / look), a `radius` (tiles from the zone) and a per-person `chance`. A zone's `reacts` replaces the default per kind |
| `lights[]` | Practical lights: position, height, colour, glow size, strength, flicker (steady / fluorescent / sodium / neon), optional pool of light on the street |
| `audio` | NAMES of existing synthesised sounds (ambience loops, crowd one-shots) that give the place its sound. Data only |
| `occlusion` | `lowSouth` (depth of the low strip south of the board, default 2.5 tiles), `maxHeightSouth` (default 1 m), `keepClear` rectangles the art occupies |
| `budget` | Per-tier overrides that may only LOWER the global caps |

How a future arena declares it (Oshodi, Lagos Island Markets, Apapa Docks, Lekki Roadworks, Surulere Stadium):
write `src/render/env/<name>Env.ts` exporting `(board) => StageEnvironment`, add `env: <NAME>_ENV` to the arena's
entry in `newArenas.ts`, and run `tests/render/env-plan.test.ts` (add the arena to its list: it validates routes
against the board for several board sizes). `validateEnvironment` reports routes entering the board (plus a 1.2 tile
margin), an elevated route that is not north of the board, tall vehicles or any person in the low south strip, zones
overlapping the board, a route crossing a zone, overcrowded zones, lights standing on the board and any tier that
exceeds its caps or its planned draw-call target.

### E.2 Three kinds of vehicles, kept apart

| | Drawn by | Simulation | Looks |
| --- | --- | --- | --- |
| Attack vehicles (Danfo, taxi, Keke) | `VehicleViews` | real entities, hit, damage, credit kills | team highlight, the cast's materials |
| Stage-hazard vehicles (`sweep` events) | `StageHazardViews` | real lethal events, telegraphed | warning lane, headlight beams, hazard colours |
| Ambient traffic | `render/env/Traffic.ts` | none | own muted material clones, lamps dimmed, no beams / sprites / lights / telegraph colours, darker grade, off the board |

Ambient vehicles are one `InstancedMesh` per material of each model (about eight draw calls per model, parts merged
by material, all vehicles of a model are instances). Position is a pure function of the plan and the render clock.
They are never drawn on a board tile, deck traffic stands north of the board, and with the follow camera a model
whose vehicles are all out of view is not drawn.

### E.3 People

`render/life/CrowdZones.ts` places each zone's people with the pure plan (`planCrowd`: seeded dart-throwing, trading
pairs face to face, labourers pace, everyone faces the board unless told otherwise) and draws them two ways under
one budget: a few animated skinned rigs (`StreetLife`: seller pairs, touts, labourers, onlookers) and instanced
two-pose figures from `crowd.glb` (a procedural silhouette when the file is missing). Reactions come from
`stimuliFrom(events)`: `generatorExploded` (position, radius), `playerEliminated` (position), `stageWarning` /
`stageStarted` of a lethal hazard (first tile, style). A person answers with probability `chance` (a larger blast
convinces a few more), eases out, holds and walks home; positions are clamped to the zone every frame. Reduced
motion: scatter becomes a flinch in place, traffic runs at 40 %. Visually distinct from fighters: muted darkened
clothes, scale 0.80-0.90 against the cast's 1.0, no team colours, outfits, markers or name tags.

Proof they are not in the game (`tests/living-env.test.ts`): the state has no NPC entities, every elimination
credit (`creditId`, `assistIds`, rewards) is a competitor id, the env and life modules import no stepping /
creating API from the sim, and a 1800-tick bot match ends byte-identical with and without an environment attached.

### E.4 The Danfo departure hazard

`StageHazardDef` sweep gains `depart?: true`: the route starts on a road tile at an inner bay and ends at the board
edge. The Danfo is parked and visible on the bay for the whole telegraph (>= `stage.minLethalWarnTicks`), blinkers
flash faster as the moment nears, two horn rings go out (the horn itself is the existing `danfo_horn` on
`stageWarning`), it rolls back a hand's breadth with its reversing lamps on, then pulls out and accelerates. Lethal
only while it passes (the tile it is on, plus the one it is leaving for the first half of the step), generators on the
lane are set off, a player beside the lane is safe, and the announcement is DELAYED (retried a second later) while the bay is occupied
(player, generator, crate) or anyone on the lane could not walk off it in time (`laneEscapeSteps`: steps to an open tile off the
lane through the live board, times their step ticks plus `stage.escapeInputTicks`, within `warn + tileIndex * stepTicks`).
Simulation timing is the ordinary uniform `stepTicks` because the bots' danger windows read it; the acceleration is
eased in the picture only and never runs ahead of the lethal tile (`render/views/departure.ts`). Rumble stage D
authors it as `{ kind: 'sweep', style: 'danfo', depart: true, routes: [bay ... edge], ... }`;
`tests/rumble-stages.test.ts` accepts a flagged route only if it ends on the edge.

### E.5 Budgets

| Tier | Vehicles / models | People / rigs | Light glows | Planned draw calls (target) |
| --- | --- | --- | --- | --- |
| low | 4 / 1 | 14 / 0 | 4 | 16 (24) |
| medium | 10 / 3 | 36 / 5 | 8 | 41 (60) |
| high | 18 / 4 | 70 / 10 | 14 | 82 (90) |

Shadow casting only on high. Quality changes at run time (auto quality) rebuild the environment for the new tier.

### E.6 Measurements

Production build, Chromium with software WebGL (SwiftShader) on the shared 4-core build machine (load average 10-14),
City Rumble on `rumbleOjuelegba`, 8 competitors, follow camera, local player at the north edge (tile 20, 1) so the
bus stop, the deck and the north street are in view. `?noenv` removes the environment (`scripts`-style debug flag,
read by `GameRenderer`). Draw calls and triangles are `renderer.info.render` of the last frame (shadow pass included).

| Case | With env | Without (`?noenv`) | Added |
| --- | --- | --- | --- |
| 1280 x 720, medium | 728 calls, 2.48 M tris | 676 calls, 2.22 M tris | **+52 calls**, +0.26 M tris |
| 844 x 390, medium | 733 calls, 2.48 M tris | 681 calls, 2.22 M tris | **+52 calls**, +0.26 M tris |
| 1280 x 720, low | 382 calls, 1.05 M tris | 365 calls, 0.94 M tris | **+17 calls**, +0.11 M tris |
| medium, spawn view (env out of view; earlier build with okadas) | 697 | 693 | +4 |

What the environment itself builds (`LivingEnvironment.stats()`, everything counted as visible): low 15 draw calls (4
vehicles, 14 figures, 3 lights), medium 41 (10 vehicles, 5 rigs, 26 figures, 8 lights), high 82 (18 vehicles, 10 rigs, 21
figures); planned targets 24 / 60 / 90. With the follow camera whatever is out of view is hidden, so the added cost
depends on where the camera is (+4 calls at the spawn, +52 at the north edge).

CPU cost of `LivingEnvironment.update` with nothing culled (600 frames, in the page): low 0.03 ms, medium 0.24 ms, high 0.17 ms
per frame; `handleEvents` for one blast 0.09 ms. Frame TIME was not measurable in a meaningful way: SwiftShader on the
loaded machine renders a Rumble frame in tens of seconds, so only the call / triangle counts and the CPU probe are
reported; nobody has measured a real phone.

Screenshots (`docs/screenshots/rumble-evolution/`): `env-medium-north.jpg` (the bus-stop crowd under the bridge, north street), `env-mobile-north.jpg`
(844 x 390), `env-low-north.jpg`, `env-medium-west.jpg`, `env-medium-east.jpg`, `env-deck-traffic.jpg` (close inspect of the stop).

### E.7 Limits and not done

- Not seen in a real browser: the Danfo departure (no arena declares `depart` until stage D authors it; it is covered by
the scenario tests and by `tests/render/departure-view.test.ts`, which drives the real view headlessly), the crowd reactions
(covered by `tests/living-env.test.ts`) and the deck traffic itself (the deck is above the frame at the usual follow-camera
distance; `env-deck-traffic.jpg` is a close inspect of the stop, not of the deck).
- Rows, columns and zone rectangles marked `ALIGN` in `ojuelegbaEnv.ts` are written from the board bounds, not from stage D's
  layout; the existing static art still parks four vehicles on the old deck, which the moving traffic now duplicates.
- `bus` and `truck` are the Danfo model stretched; no separate bus or truck model exists.
- The audio hooks (`audio`) are data: the audio engine does not read `LivingEnvironment.audioHooks()` yet. No recording, voice
  or music was generated; conductor calls are not used (no approved founder clip).
- Deferred: upper-window spectators (needs building facades), a moving machinery set, deck audio passes, the arena's
  own lighting rework (palette hints are in `ojuelegbaEnv.ts`), per-instance animation of vehicle wheels.
- Rigs cast shadows only on high; instanced people never do. Real point lights are not used (glows only).
- Reduced motion is read from `matchMedia` when the match loads; it is not re-read live.
- Debug flag `?noenv` (any arena) turns the environment off for measuring.

### E.8 Late research reconciliation (what changed because of it)

| Research finding | Outcome |
| --- | --- |
| No commercial okadas in Surulere / Lagos Mainland since 2022 | Adopted: no okadas in the Ojuelegba environment; Danfos and buses dominate, a few taxis, sparse kekes, trucks on the flyover only (test) |
| Flyover traffic is visual and non-colliding; underbridge gameplay traffic is the small scheduled set | Adopted: ambient traffic is instanced and never an entity; the departure sweep is the gameplay traffic |
| Provisional low tier: 12-20 people, 2-4 background vehicles, one machinery set, <= 2 break bursts | Adapted: low = 14 people, 4 vehicles; machinery set and break bursts are not part of this workstream (deferred) |
| Civilians in protected strips; short reactions; never obstacles / loot / targets; never hide indicators or warnings | Adopted: zones validated off the board, reactions clamped to the zone, no sim presence (tests) |
| Touts / union fictional | Adopted: no union names or props; ordinary traders are ordinary |
| Departure: horn plus lit road markers, safe pavement recesses, warning > slowest fighter's escape time, suppress when combined with another system | Adopted: horn (existing) + the lane telegraph, safe pockets recorded as data, `laneEscapeSteps` check with `escapeInputTicks` per lane tile (arena data test and live delay), no overlap with other lethal events or the closing city |
| Duck engines / crowds / music when a hazard or generator warning plays; no recordings | Already the case (`eventRouter.ts`, warnings bus never ducked); nothing added |
| Conductor calls only with an approved founder clip | Deferred (no clip, never TTS) |
| Ojuelegba lighting: shade under the deck with a hard sun edge and reflected light, LED / sodium practicals, palette | Adapted: LED (#E8F4FF) and sodium (#FF9F3A) practicals, bounce-light pools under the deck; the sun wall and palette are for the stage art (hints in `ojuelegbaEnv.ts`) |
| Contract records ambient budgets, light limits, occlusion / cutaway, safe pockets, conflicting-event exclusions | Adopted: `budget`, `lights` caps, `occlusion.cutaway` / `keepClear`, `safety.safePockets` / `safety.exclusions` |
| Falling containers / debris at Ojuelegba, crowd surges, NPC shoves, agbero damage, NPCs as obstacles, 150-NPC / Mass crowds, generated audio | Rejected: not built |

### AI follow-up after the economy merge (RE-AI8)

On the merged lead branch (economy: 8 `$` supply crates on Oshodi / Lagos Island / Apapa / Lekki Nightworks,
`radialMaxSquareRadius` 6) `tests/ai/radial-rumble.test.ts` failed with radial 41 vs cross 38 own-blast deaths.
The parity conclusion above did not survive the new layouts. The assertion was kept as it is, and the bots were
improved instead (decision RE-AI8, radial only):

- **Linked-chain worst case for every placement check.** Ticking generators that ONE more generator could link
  (Chebyshev distance <= box a + box b) are assumed to go off with the earliest of their group, so a bot does
  not put a generator into a cluster it cannot leave before the cluster's first blast (`DangerQuery.linkedChains`).
- **Every level sees chains and checks its escape in City Rumble** (`radialProfile`: `chains` on,
  `placeVerify` 1). Traced deaths showed Rookie / Beginner / Casual killed by their own second generator setting
  off the first, or by unchecked placements in a 9 x 9 disc. Every other handicap is unchanged.

Classic: `scripts/ai-fingerprint.ts` and the per-tick intent-hash replay are identical to the Phase 0 baseline
(the merged branch's Classic baseline is itself identical to Phase 0).

**Own-blast deaths, the full schedule, 6 seeds x 3 stages, line-up = the test's** (every level present, seeds 1-6;
"before" = merged HEAD b3ef80d):

| bots | stage | before, radial | now, radial | cross (unchanged by these changes) |
| --- | --- | --- | --- | --- |
| 32 | rumbleOshodi | 35 | 33 | 41 |
| 32 | rumbleApapa | 51 | 21 | 45 |
| 32 | cityRumble | 33 | 24 | 30 |
| 32 | all | 119 | **78** | 116 |
| 16 | rumbleOshodi | 18 | 16 | 19 |
| 16 | rumbleApapa | 21 | 17 | 22 |
| 16 | cityRumble | 23 | 15 | 13 |
| 16 | all | 62 | **48** | 54 |

The test's own cells (32 bots, seeds 1-2, three stages): 26 radial vs 38 cross. A first variant with only the
linked-chain check gave 92 vs 116 at 32 bots but 71 vs 54 at 16 bots (the low levels' self-traps); the
profile change fixed that.

**8 / 16 / 24 / 32 combatants, radial vs cross, deaths by cause** (seeds 1-4 per cell, `simulate --game survival
--players N --matches 4 --seed 1 [--blast plus] --verbose`, load 2-8):

| stage | bots | blast | results (4 seeds) | mean length s | own blast | rival blast | vehicle | stage hazard | crush | other | opponent within 6 | ... with <= 6 left | ms/tick avg | p99 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rumbleOshodi | 8 | radial | 4 won | 62 | 2 | 26 | 0 | 0 | 0 | 0 | 60.9 % | 65.5 % | 0.57 | 5.3 |
| rumbleOshodi | 8 | cross | 4 won | 46 | 3 | 25 | 0 | 0 | 0 | 0 | 67.3 % | 78.0 % | 0.51 | 5.2 |
| rumbleOshodi | 16 | radial | 4 won | 58 | 8 | 52 | 0 | 0 | 0 | 0 | 75.5 % | 78.0 % | 1.01 | 7.1 |
| rumbleOshodi | 16 | cross | 4 won | 38 | 8 | 52 | 0 | 0 | 0 | 0 | 77.6 % | 87.7 % | 0.90 | 8.3 |
| rumbleOshodi | 24 | radial | 4 won | 53 | 16 | 74 | 2 | 0 | 0 | 0 | 79.5 % | 69.8 % | 1.47 | 8.4 |
| rumbleOshodi | 24 | cross | 4 won | 57 | 16 | 73 | 0 | 3 | 0 | 0 | 82.2 % | 75.0 % | 0.99 | 7.4 |
| rumbleOshodi | 32 | radial | 4 won | 41 | 16 | 107 | 0 | 1 | 0 | 0 | 87.7 % | 79.3 % | 2.24 | 12.0 |
| rumbleOshodi | 32 | cross | 4 won | 54 | 15 | 108 | 0 | 1 | 0 | 0 | 83.4 % | 71.2 % | 1.35 | 9.0 |
| rumbleApapa | 8 | radial | 4 won | 62 | 4 | 24 | 0 | 0 | 0 | 0 | 60.6 % | 69.5 % | 0.71 | 6.4 |
| rumbleApapa | 8 | cross | 4 won | 54 | 5 | 23 | 0 | 0 | 0 | 0 | 59.4 % | 75.6 % | 0.46 | 5.0 |
| rumbleApapa | 16 | radial | 4 won | 55 | 6 | 54 | 0 | 0 | 0 | 0 | 71.4 % | 70.4 % | 1.19 | 7.7 |
| rumbleApapa | 16 | cross | 4 won | 66 | 11 | 48 | 0 | 1 | 0 | 0 | 71.5 % | 82.1 % | 0.71 | 6.2 |
| rumbleApapa | 24 | radial | 4 won | 52 | 13 | 79 | 0 | 0 | 0 | 0 | 80.9 % | 70.5 % | 1.66 | 8.7 |
| rumbleApapa | 24 | cross | 4 won | 66 | 19 | 72 | 0 | 1 | 0 | 0 | 81.3 % | 82.5 % | 0.91 | 6.1 |
| rumbleApapa | 32 | radial | 4 won | 62 | 19 | 105 | 0 | 0 | 0 | 0 | 83.0 % | 73.9 % | 1.88 | 9.7 |
| rumbleApapa | 32 | cross | 4 won | 53 | 27 | 96 | 0 | 1 | 0 | 0 | 83.9 % | 82.1 % | 1.36 | 8.3 |
| cityRumble | 8 | radial | 4 won | 55 | 8 | 20 | 0 | 0 | 0 | 0 | 74.3 % | 76.2 % | 0.50 | 5.5 |
| cityRumble | 8 | cross | 4 won | 51 | 5 | 23 | 0 | 0 | 0 | 0 | 73.1 % | 76.4 % | 0.37 | 4.7 |
| cityRumble | 16 | radial | 4 won | 50 | 10 | 50 | 0 | 0 | 0 | 0 | 77.8 % | 69.3 % | 0.89 | 6.9 |
| cityRumble | 16 | cross | 4 won | 75 | 5 | 55 | 0 | 0 | 0 | 0 | 80.7 % | 87.7 % | 0.41 | 4.5 |
| cityRumble | 24 | radial | 4 won | 59 | 11 | 81 | 0 | 0 | 0 | 0 | 83.4 % | 71.3 % | 1.24 | 8.0 |
| cityRumble | 24 | cross | 3 won, 1 draw | 73 | 14 | 79 | 0 | 0 | 0 | 0 | 81.3 % | 73.9 % | 0.79 | 6.1 |
| cityRumble | 32 | radial | 4 won | 44 | 19 | 105 | 0 | 0 | 0 | 0 | 86.0 % | 81.0 % | 1.92 | 10.5 |
| cityRumble | 32 | cross | 4 won | 68 | 21 | 101 | 1 | 1 | 0 | 0 | 87.0 % | 86.6 % | 0.99 | 7.9 |

| bots | blast | own blast | rival blast | vehicle | stage hazard | crush | all |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | cross | 13 | 71 | 0 | 0 | 0 | 84 |
| 8 | radial | 14 | 70 | 0 | 0 | 0 | 84 |
| 16 | cross | 24 | 155 | 0 | 1 | 0 | 180 |
| 16 | radial | 24 | 156 | 0 | 0 | 0 | 180 |
| 24 | cross | 49 | 224 | 0 | 4 | 0 | 277 |
| 24 | radial | 40 | 234 | 2 | 0 | 0 | 276 |
| 32 | cross | 63 | 305 | 1 | 3 | 0 | 372 |
| 32 | radial | 54 | 317 | 0 | 1 | 0 | 372 |

Own blast is now at or below the cross at 16, 24 and 32 combatants (24 / 40 / 54 vs 24 / 49 / 63) and one death
above it at 8 (14 vs 13). cityRumble at 8 / 16 bots is still worse than the cross (8 vs 5, 10 vs 5), where
crowds are thin. Engagement stays in the same band (an opponent within 6 tiles 61-88 % of alive samples).

**Cost, same session, same cells** (radial Survival, CPU ms per tick, average / p99; "before" = merged HEAD):

| stage | bots | before | now |
| --- | --- | --- | --- |
| rumbleOshodi | 24 | 1.47 / 8.4 | 1.47 / 8.4 |
| rumbleOshodi | 32 | 1.94 / 11.1 | 2.24 / 12.0 |
| rumbleApapa | 24 | 1.19 / 7.6 | 1.66 / 8.7 |
| rumbleApapa | 32 | 1.93 / 10.7 | 1.88 / 9.7 |
| cityRumble | 24 | 1.58 / 9.3 | 1.24 / 8.0 |
| cityRumble | 32 | 1.46 / 9.5 | 1.92 / 10.5 |

That is about 10 % more on average: the low levels now verify every placement. Matches also run longer (a
longer match keeps more fighters alive per tick), so the cells are not exactly comparable.

**Test margins now:** friendly-fire placements reaching a teammate 0.072 (of 207, < 0.15), reaching an
opponent 0.807; 32-bot Survival top eliminator power 30 and 27 vs median 4 (> median + 5).

**Tests:** `tests/ai/radial.test.ts` (33 cases; new: the linked-chain worst case in the danger map, a placement
refused next to a cluster about to blow and accepted when the cluster is far in time, the Rumble profile keeps
every handicap except chain blindness / unchecked placements), plus `tests/ai`, `tests/rumble-ai.test.ts`,
`tests/modes-bots.test.ts`, `tests/economy-ai.test.ts`, `tests/rumble-economy-evolution.test.ts`,
`tests/spectators.test.ts`, `tests/radial-blast.test.ts`: 17 files, 197 tests green.

**Still open:** cityRumble at low counts (8 / 16) and the cost increase above.
