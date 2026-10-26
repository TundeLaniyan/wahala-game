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
