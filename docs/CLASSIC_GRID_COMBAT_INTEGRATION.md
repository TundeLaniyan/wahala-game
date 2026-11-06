# Classic grid, checkpoint clarity and fair enemy combat: integration report

Branch `claude/wahala-classic-grid-combat-v1`, from the deployed release `a4fe457`. **Not merged, not deployed.** Founder review first.
Detail per part: `CLASSIC_GRID.md` (raid layouts, before/after boards and metrics), `CHECKPOINT_CLARITY.md` (markers and wording),
`ENEMY_COMBAT_FAIRNESS.md` (measured enemy behaviour, before/after tables, the Normal baseline). Decisions: CG1-CG9, CK1-CK8, EF1-EF8.

## Root causes

1. **Open raids.** Four of the six classic raids were authored as open floors: the depot had 54 open 2x2 squares (18 open 3x3) and
   only half its pillar lattice; the rail yard 74 / 37 with 7 of 28 pillars; the storeroom and the vault's bottom hall were patchy.
   Cross bombs need corridors: in a hall every blast has a free side step, so nothing can be trapped. Movement itself was already
   cardinal; no clipping was found.
2. **Checkpoints.** Walk-through checkpoints complete the instant you step on the current one (no waiting); the warehouse door needs a
   1 s hold. Both were drawn with the same pad and filling ring, so a walk-through checkpoint looked like a "wait here" pad; the text did
   not say "no waiting"; on phones the objective could be cut off; the compass could prefer an optional door.
3. **Enemies.** Campaign enemies ran the full multiplayer bot planner (perfect fuse knowledge: 81-88 % of basic enemies in a fresh
   blast cross walked out), had no punishable recovery after attacking, and the player's melee carried the multiplayer anti-chain limits
   (3 s per-target lockout), so a 2-health guard took 3+ s of standing next to it. Repeated interruption was NOT a cause (0 chains
   measured); the frequency of interruptions was.

## What changed (summary; the per-part documents have the detail)

- **Raids (CG):** the depot, rail yard, storeroom and vault are classic pillar mazes (open 2x2 now 0 / 3 / 0 / 1, open 3x3 0, pillar
  lattice 32/34, 27/28, 24/24, 29/30); every mechanic kept; a shape rule in `raidProblems` (`src/sim/raid/shape.ts`) rejects any raid with
  an open 3x3, more than 4 open 2x2 (only in rooms, at belts or at the entrance/exit) or under 85 % of the lattice; raid pillars drawn at
  72 % height so corridors stay visible from the fixed camera. Tool shed and standby plant were already classic (one crate moved so the
  entrance pocket has two exits).
- **Checkpoints (CK):** a tall beacon for walk-through checkpoints (current bright gold with an arrow, later faint, reached ones flash and
  keep a tick), a different square pad with a fill ring for hold-to-interact doors, a "HOLD 0.4 / 1.0 s" bar in the rail, a reached notice
  with the next objective, GO TO / HOLD / DEFEAT / ESCAPE / RETURN tags with "walk through, no waiting", "all must go down", "fights
  optional", and plain objective lines for all eleven field missions. No rule, timing or position changed.
- **Enemies (EF, campaign seats only; multiplayer byte-identical):** limited bomb awareness (late notice of a generator while brawling,
  a seeded slip), a rooted recovery after punches and throws, no attacks from inside a noticed blast cross, a 1.1 s cap on the player's
  per-enemy lockout, steadfast heavies/bosses against jabs, field pursuers give up beyond 14 tiles, and a fix for field seat 1 being
  forced to Standard. Normal baseline = the Casual bot level (Standard = candidate Hard; Rookie/Beginner = candidate Easy).
- **Integration (this report):** the fairness harness now picks fights by walking distance; on the maze depot straight-line distance put
  an enemy "two tiles away" behind a pillar and the scripted player bombed a wall until the clock ran out.

## Verification

- Unit: the integrated targeted set (raids, enemies, field, missions, campaign, app, ui, render, input, audio, blast rules, combat,
  architecture): 1882 of 1883 passed in the integrated run; the one failure (the depot fairness test on the new maze) was fixed in
  the harness and that file re-run passes 18/18 (the whole set was not re-run after the fix); multiplayer hash and bot-digest
  regressions unchanged.
- Active enemies (real bots, real raid runtime, scripted player using only walk / generator / punch): the maze depot is completed in
  11 of 12 seeds at Normal (Casual) with 0-1 deaths, 0-3 health lost and no interruption chain. The miss (seed 2) is a timeout, not a
  defeat: the lieutenant hovers round a pillar corner, out of every cross, while the scripted player keeps bombing from one corridor
  mouth. A human would come round the other side; it is listed below.
- Browser smoke (built preview, desktop and phone): checkpoint clarity (reach, notice, door hold, raid start), field mission, raid with
  cross bombs and cargo destroyed, enemy projectile, field to raid and back, boss bar, campaign death and respawn, mobile cross, no
  blast toggle in Rumble: 21 passed, 1 skipped (a phone-only test on the desktop project). Production build and the static check pass.
- One browser run of the maze depot with the real enemy bots awake (`docs/screenshots/classic-grid-combat/`): enemies act, no page
  errors; the health loss in the second picture is the scripted player's own blast (it walked only two tiles), shown as "HIT BY BLAST".

## Still needs human gameplay verification

- How the mazes FEEL to play with real hands: trap opportunities, whether corridors are too tight on a phone, belt crossings in the yard.
- Advanced enemies hovering: a lieutenant can stay out of every cross at a pillar corner without committing to an attack. If that reads
  as "it just runs away", the next step is an anti-hover commitment (after N seconds near the player without attacking, it must close in).
- Brawling enemies walking past a fresh generator: focused or stupid? The recovery roots have no pose yet (a held stance would help).
- The 14-tile field give-up on real maps; mandatory `clearGroup` legs played end to end with active bots.
- Checkpoint beacons on Oshodi's yellow bus rows (the arrow carries it there) and the door marker partly behind the south wall.

## Integration with the other session's branch

`origin/claude/wahala-lagos-enhancement-v1` (`a583e0b` when checked; 13 commits) shares the base `a4fe457`. Files changed on both:
`docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, `src/campaign/content/sections.ts`, `src/render/assets/obstacleStyles.ts`,
`src/sim/config.ts`, `src/sim/index.ts`, `src/sim/mission/fieldDefs.ts`. A dry-run merge (nothing merged) conflicts in four files:
the two docs (both append; keep both), `src/sim/index.ts` (both add export lines; keep both) and one Ebute-Metta leg in `fieldDefs.ts`
(keep their moved coordinates `ebuteX(...)` with this branch's plain objective line). The other three shared files merge cleanly.
Semantic note for the difficulty work: this branch adds campaign-only knobs (`config.enemyAttacks.awareness`, recovery roots,
`campaign.vsEnemy.targetLockoutTicks`, `pursuitGiveUpTiles`, `ENEMY_KINDS[kind].steadfast`) that Easy / Hard should scale, and sets the
Normal enemy bot level to Casual.

## Follow-up review: the seed-2 timeout and the meaning of the rate test

**Seed 2 (depot, Casual, the default scripted player) is a scripted-strategy stall, not an AI defect.** Measured over the run:
the lieutenant attacked throughout (53 throws, 5 punches, the last at 238 s), was hit 4 times, and holds its corridor at x = 11
(tiles (11,1) / (11,2) / (12,2) / (11,3)). The scripted player stood in the bay mouth ((13,3) / (14,3) / (13,2)) and laid 45 of its
generators after the first minute on the SAME tile (13,2), whose cross the lieutenant leaves by the corner refuge each time.
The same seed with only the scripted player's timing changed is completed: slower reactions 140 s; a longer fuse margin 57 s
(the lieutenant hit 8 times). A bomb-only player (no punches) loses at 101 s. No AI change was made.

**Why "5 of seeds 1-6" stays meaningful.** The runs are deterministic (same seeds, same code, same result), so the rate only moves
when behaviour changes; it now also requires that a run which does not complete ends by the clock (a stand-off), never by the
human being defeated, with no interruption chain and at most one death per run. The core rules behind it are pinned exactly in
`tests/raid-maze-combat.test.ts` with the real enemy bot: a guard in a dead end behind a generator is defeated; a guard at a
junction escapes a single cross unhurt; a lieutenant shut in a corridor by two generators is hurt and survives (8 health); a
lieutenant at a junction escapes one predictable bomb; a lieutenant with a clear line throws (with a cue >= the minimum); a guard
next to the human punches. Negative control: with the enemy bot switched off, the four AI-dependent tests fail and the two trap
tests still pass.
