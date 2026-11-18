# Campaign sector AI: the campaign tactics layer (decisions SA3-SA12)

Branch `claude/wahala-csa-combat` (from production `46f0781` + the sector contract `6359813`, decision SA2: the enemy
variant roster in `src/sim/data/enemyVariants.ts`). Founder direction (2026-11-18, authorised campaign-wide): generators
are the primary weapon; melee assists (interrupt, knockback, stagger, reposition) without a two-punch slowdown ritual or
frame-perfect sequences; enemies are intelligent but readable and fair; no literal 1990s Bomberman AI.

Everything below is pure simulation (`src/sim`) and bots (`src/ai`), deterministic, and lives behind ONE optional key,
`GameConfig.campaignTactics` (`CampaignTacticsConfig`, `src/sim/config.ts`).

## 1. Where it applies

| Match | `campaignTactics` |
| --- | --- |
| Campaign FIELD missions (all 11) | yes, at the save's level (`missionConfigLayer` adds Normal, `buildMissionGame` the Easy / Hard layer) |
| Campaign BOSS missions (all 6) | yes, plus `seatPerception` (the boss and crew are generator bots without `enemyKind`) |
| Raids (door and standalone) | no: Classic raids keep their rules |
| Training Academy | no: its "Generator Tactics" lessons keep the Tactical Trap pilot (`config.tacticalTrap`), unchanged |
| Classic, City Rumble (Survival / Deathmatch / Team), multiplayer, online | no (tested; the pinned digests are unchanged) |

The **Oshodi combat pilot** (`combatPilot` on `oshodi.approach`, decisions CP1-CP12) is superseded: no campaign mission
runs it. Its code stays as an archived replay behind `MissionSpec.archivedPilot` (its reference tests and
`npm run combat-pilot` only; the campaign never sets it), because the renderer and the audio router still read the key.
Its browser spec was removed with it. Delete `FIELD_COMBAT_PILOTS` and `systems/pilotCombat.ts` when the views no longer
need them.

## 2. Behaviour model: one state machine for every variant

The sim runs ONE territorial state machine per enemy seat that has a territory (`src/sim/systems/territory.ts`,
runtime `GameState.territory`, created by the field builder for every enemy except an escape leg's pursuers, which keep
their mission logic). Data changes its numbers, never its shape. Its directive reaches the bot through the existing
pipeline (`mission/field.ts` `fieldDirective` -> `Observation.directive` -> `ai/directive.ts`).

| State | Enters when | Directive to the bot |
| --- | --- | --- |
| `patrol` | it has a patrol route (2+ waypoints) | `patrol` to the next waypoint; a pause at each (`patrolPauseTicks` + jitter) is `hold` |
| `watch` | no route; after returning | `hold` on its centre; it turns a quarter every `lookAroundTicks` (its view cone sweeps) |
| `investigate` | it HEARD a noise it did not see; or lost sight of a pursued human for `loseTicks` | `investigate` to a coarse spot, then `hold` for `searchTicks` |
| `alert` | sight of the human for `noticeTicks`, the human within `closeTiles`, a hit, or an ally's call | `hold` facing him for `alertTicks` (the readable "!") |
| `pursue` | after the alert | `chase` (or the group's `surround` slot), a ranged variant a `standoff` slot at its `preferredRange`, a cover user ducks out of sight after attacking, out of sight it goes to where it last SAW him |
| `return` | the human left its leash | `hold` facing him for `returnWatchTicks` (a thrower keeps throwing), then `return` to the nearest anchor |

Overlay states from the sim itself (never stored): `windup` / `attack` / `recovery` (`enemyAttackPhase`), `stagger`
(`dazedUntil`), `defeated`. `enemyMindView(state, id)` combines them for presentation. Generator evasion is the bot's
planner (it shows as movement).

**Anti-exploit at the boundary.** The leash is measured from the TERRITORY (its centre and every patrol waypoint), never
the post alone, with hysteresis (`pursuitTiles` + `leashSlack`). Giving up starts a watch facing the human. A hit
re-engages it at once and it then chases with NO leash for `hitChaseTicks`; the human stepping back inside its pursuit
range is noticed three times faster. So hitting a returning enemy from just outside its leash brings it straight at you.

**Territory data** (`FieldEnemyDef.territory`, `TerritoryDef` in `src/sim/campaign/types.ts`; every field optional):
`patrol` (waypoint loop), `centre` / `radius` (guard area), `investigateRadius`, `pursuitTiles`, `onReturn`
(`watch` | `walk`), `alertAllies` (tiles; 0 = never), `escape` (`free` | `territory`: escapes prefer refuges inside the
area). `resolveTerritory` completes it from the level and the variant. The field builder clears the crates on the
shortest way between consecutive waypoints so a patrol never stalls.

## 3. Perception (exact rules)

Generators (`src/ai/trapSight.ts`, generalised from the Academy pilot; the bot, never the sim, decides what it knows):

1. **Sight**: within the vision radius (straight distance between tile centres) and a clear grid line of sight: two
   Bresenham traces, ends excluded, blocked by any non-floor tile (concrete, crates) or another living body. A body on the
   generator's tile hides it. Grid space only: no camera, no graphics quality (architecture test).
2. **Calm view cone**: while calm (patrolling, holding its post, walking back; not engaged, not cautious) it notices a
   generator only in the 90-degree cone ahead of its facing or on the eight tiles around it, and only within its trap
   sense's `calmVisionTiles`. Engaged or cautious: full vision all round.
3. **Reaction**: a seen generator becomes a threat `reactTicks x trapSense.reactScale` after it was first seen (x
   `brawlReactScale` again while brawling: pursuing, winding up, recovering).
4. **Memory**: kept while out of sight for `memoryTicks`; a ticking generator with `memoryHoldFuseTicks` (120) of fuse
   left is held until it blows. Stepping in front of it never erases it; one moved while unseen is forgotten.
5. **Watching a placement** (trap sense `seesPlacement`): a generator laid by someone the enemy can see at that moment is
   known even though the placer's body covers it. Never through a wall or another body; never while it reels.
6. **What the planner gets** (`perceivedObservation`): a generator it never saw is ABSENT (not even an obstacle on its
   route); one seen but not yet reacted to is an obstacle with an unreachable fuse; a known one is real. Remote,
   triggered, thrown, carried, its own and its team's generators are always known.
7. **Hearing** (sim, `updateTerritory`): a generator laid within `hearingTiles` (Manhattan) or a blast within
   `hearingTiles x blastHearingScale` that it did not see sends a calm enemy to INVESTIGATE `investigateSpot`: its own
   tile plus `investigateStep` (3) tiles along one of 8 direction bands (`noiseBand`, integer comparisons only), shortened
   to open floor inside its territory. The source tile and the distance are never used: two hidden sources in the same
   band give the same spot (tested). The bot is also cautious for `caution.ticks` (36): no new wind-up or cue, reaction
   halved.
8. **The human** (sim): noticed with the same grid sight (other bodies conceal him) within `noticeTiles`, in the calm
   cone while calm, after `noticeTicks` of accumulated sight; within `closeTiles` (2) at once.
9. **Boss missions**: the boss and crew generator bots plan on the same perceived observation (`ai/seatPerception.ts`;
   perception rows from `seatPerception`: the boss `boss`, crew by role).

Perception per kind (generators: vision / reaction ticks / memory ticks / hearing tiles; the human: notice tiles):

| kind | Easy | Normal | Hard | notice (E / N / H) |
| --- | --- | --- | --- | --- |
| agbero | 5 / 42 / 120 / 3 | 6 / 30 / 150 / 4 | 7 / 22 / 210 / 5 | 6 / 7 / 8 |
| guard | 6 / 38 / 120 / 4 | 7 / 26 / 150 / 5 | 8 / 18 / 210 / 6 | 7 / 8 / 9 |
| thrower | 7 / 36 / 120 / 4 | 8 / 24 / 150 / 5 | 9 / 16 / 210 / 6 | 8 / 9 / 10 |
| heavy | 5 / 48 / 120 / 3 | 6 / 36 / 150 / 4 | 7 / 28 / 210 / 5 | 5 / 6 / 7 |
| lieutenant | 8 / 28 / 210 / 6 | 9 / 16 / 240 / 7 | 10 / 8 / 300 / 8 | 9 / 10 / 11 |
| boss | 9 / 22 / 210 / 7 | 10 / 10 / 240 / 8 | 11 / 8 / 300 / 9 | 9 / 10 / 11 |

Human notice time: 36 / 20 / 10 ticks (Easy / Normal / Hard), x the variant's `noticeScale`.

## 4. Generator evasion and trap sense

Evasion is the bot's ordinary time-expanded planner on the perceived observation, with the enemy's REAL step time (slow,
kind penalty) and real readiness (wind-up, recovery and cue roots, stagger): a committed or slowed enemy cannot plan an
escape it cannot walk. It never starts a wind-up or a cue inside the real (radial) footprint of a generator it knows,
and a thrower never throws while a known generator's reach touches its tile or a neighbour, nor before it has stood still
`throwSettleTicks` (12), nor from a calm state. No random failure anywhere: the differences are perception, reaction,
attention and planning.

| trap sense | variants | react x | brawl x | planner | calm vision (E / N / H) | watches placements (E / N / H) |
| --- | --- | --- | --- | --- | --- | --- |
| none | area boy | 1.25 | 2 | level | 2 / 2 / 3 | no / no / no |
| basic | agbero, bottle thrower, market enforcer, heavy, route marshal | 1 | 1.5 | level | 2 / 3 / 4 | no / no / yes |
| keen | Ring security | 0.8 | 1 | +1 level | 4 / 5 / 6 | no / yes / yes |
| expert | lieutenant, boss | 0.6 | 1 | +2 levels | full | yes / yes / yes |

The planner level is the campaign level's enemy bot level (Easy Beginner, Normal Casual, Hard Standard; decision CI1)
plus the bump, without the bot levels' random hesitation and wandering (the territory decides where it goes).

## 5. Melee and generator balance (no ritual)

The human's landed close attack on a campaign enemy is ONE tactics hit whatever the fighter (`skills.ts` `tacticsHit`):

| effect | Easy | Normal | Hard |
| --- | --- | --- | --- |
| damage | 1 segment | 1 | 1 |
| per-target lockout | 60 ticks | 72 | 84 |
| human recovery after the hit | at most 30 ticks (every fighter can follow up) | 30 | 30 |
| stagger (cuts a wind-up or throw cue short) | 24 ticks | 18 | 14 |
| stagger immunity after it | 48 | 54 | 60 |
| knockback | 1 tile when the tile is free (never a wall, body or generator; can push into a footprint) | same | same |
| slow | 25 % for 90 ticks, never stacked or refreshed, then resisted 120 ticks | same | same |

Steadfast kinds (heavy, boss) are neither staggered nor moved (they keep winding up: step out or punish the recovery).
Enemy recovery frames after losing health are 6 ticks, so a punch then a blast both land. Enemies keep off the human's
tile; an enemy on it is in reach both ways.

| kind | health | punches finish it? | one blast |
| --- | --- | --- | --- |
| agbero | 2 | yes (2 hits, lockout between) | defeats it |
| guard | 3 | yes (3 hits) | defeats it |
| thrower | 2 | yes | defeats it |
| heavy (ARMOURED) | 4 | no: floor 1 | takes 3 |
| lieutenant (ARMOURED) | 8 | no: floor 4 | takes 3 |
| boss (ARMOURED) | 14 | no: floor 7 | takes 3 |

The rule the player learns: **only a blast finishes armoured enemies**. `enemyHealthView` exposes `blastOnly` and
`punchFloor` for the HUD (absent outside the layer).

## 6. Difficulty

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| patrols | clockwork (pause 48, no jitter) | pause 36 +/- 12 (deterministic per seat, lap, waypoint) | pause 24 +/- 18, reverses every second lap |
| pursuit range from the territory | 6 (+ variant) | 8 | 11 |
| lost-sight search / watch after giving up / no-leash chase after a hit | 60 / 60 / 120 ticks | 120 / 90 / 180 | 180 / 120 / 240 |
| ally calls | none | variant radius | x 1.25 |
| group tactics (surround, line-up) | off (plain chase) | on | on |
| cover after attacking (cover users) | off | 3 tiles | 4 tiles |
| guard view sweep | every 120 ticks | 90 | 60 |
| wind-up (ordinary punch) | 60 ticks | 48 | 38 |
| recovery (ordinary) | 48 | 42 | 36 |
| simultaneous wind-ups per group / gap | 1 / 60 | 2 / 48 | 2 / 30 |
| free window after an enemy hit | 90 | 66 | 54 |
| thrower cue (bottle) / recovery / cooldown | 54 / 54 / 210 | 42 / 42 / 180 | 36 / 36 / 150 |

Hard never learns about an unseen generator: its extra strength is watching placements, sharper senses, longer pursuit,
coordination, cover and a better planner.

## 7. Variants (personality data, `ENEMY_VARIANTS[*].personality`)

| variant | base | trap sense | pursuit | notice x | vision | ally call | other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| agbero | agbero | basic | 0 | 1 | 0 | 0 | |
| areaBoy | agbero | none | +4 | 0.5 | -1 | 0 | overcommits: +12 ticks recovery |
| bottleThrower | thrower | basic | 0 | 1 | 0 | 0 | keeps 4 tiles, +6 recovery |
| marketEnforcer | guard | basic | 0 | 1 | 0 | 0 | ducks out of sight after attacking |
| heavyEnforcer | heavy | basic | -2 | 1 | 0 | 0 | steadfast, armoured |
| routeMarshal | guard | basic | -1 | 1 | 0 | 8 | holds junctions, calls the crew |
| ringSecurity | guard | keen | -2 | 1 | 0 | 5 | defends in pairs |
| lieutenant | lieutenant | expert | +2 | 0.75 | 0 | 10 | keeps 3 tiles; armoured |
| boss | boss | expert | +2 | 0.75 | 0 | 10 | armoured |

The 11 field missions carry first variants and territories (`fieldDefs.ts`, helpers `patrol(...)` / `post(...)`):
wardens are agberos (one patrols the park lane), lane blockers heavies, market hawkers and desk auditors market
enforcers, market runners area boys, Kobo marshals route marshals, switchmen / auditors / gate and estate guards Ring
security, pursuers bottle throwers (their kind is unchanged so the escape legs keep their pace). The sector worker will
re-author them.

## 8. Telegraph contract (for the renderer and audio)

State fields (read every frame; nothing here changes a rule):

| what | where |
| --- | --- |
| wind-up of a punch | `Player.attack` (`dir`, `targetId`, `resolveTick`); `enemyAttackPhase(state, p) === 'windup'` |
| throw cue | `state.projectiles[*]` with `launchTick + warnTicks > tick` (path known) |
| recovery (the punish window) | `Player.rootedUntil > tick` after an attack; phase `recovery` |
| stagger | `Player.dazedUntil > tick` |
| slow | `Player.slow` (`until`, `extraStepTicks`) |
| territorial state | `state.territory.minds[id].state` (`patrol` / `watch` / `investigate` / `alert` / `pursue` / `return`), `.target`, `.lastSeen`, `.watchUntil`; `enemyMindView(state, id)` for one readable state |
| blast-only enemy | `enemyHealthView(state, id).blastOnly`, `.punchFloor` |
| variant | `Player.enemyVariant` (`ENEMY_VARIANTS`) |

Events (all existing ones stay; ONE new event, emitted only when `campaignTactics` is present):

| event | when | fields |
| --- | --- | --- |
| `attackStarted` | a punch begins (enemy: its real `resolveTick`) | `playerId`, `skill`, `targetId`, `resolveTick` |
| `enemyCue` `windup` | a punch: the threatened tile (x, y) and `dir`; a throw: the thrower's tile and `dir` | `fromTick`, `untilTick` (= resolve / launch + cue) |
| `projectileLaunched` | a throw's cue (path, `warnTicks`) | as in docs/CAMPAIGN_ATTACKS.md |
| `attackResolved` | the swing resolves: `hit: true` or a visible miss (`hit: false`) | `playerId`, `targetId` |
| `enemyCue` `recovery` | planted from `fromTick` to `untilTick` (after a punch, hit or miss; after a throw's cue) | x, y = the enemy |
| `attackInterrupted`, `enemyCue` `stagger` | the human's hit cut the wind-up / staggered it until `untilTick` | `byId` = the human |
| `enemyCue` `alert` | it spotted the human at (x, y), or an ally's call (`byId` = the caller) | `untilTick` = end of the alert beat |
| `enemyCue` `investigate` | it goes to look at the coarse spot (x, y) | |
| `enemyCue` `lost` | it gave up the chase; watches until `untilTick`, then walks back to (x, y) | |

The audio router handles `enemyCue` as a no-op (the wind-up and hit sounds stay `attackStarted` / `campaignHit`).

## 9. Measurements

`npm run sector-ai -- --seeds 16` (`scripts/sector-ai.ts`, harness `scripts/lib/sectorDrill.ts`): a scripted human with
ordinary intents against the real enemy bots on the Academy pillar board with the field missions' radial blast;
`tests/campaign-tactics-drill.test.ts` asserts the same with 12 seeds. Trapped = defeated by the blast; seen = escaped.

| level | variant | ambush | bait | counter | seen (escaped) |
| --- | --- | --- | --- | --- | --- |
| easy | agbero / area boy / market enforcer / route marshal | 15/16 | 16/16 | 7/16 | 16/16 |
| easy | Ring security | 15/16 | 16/16 | 0/16 | 16/16 |
| normal | agbero / area boy / route marshal | 15/16 | 16/16 | 0/16 | 16/16 |
| normal | market enforcer | 15/16 | 15/16 | 0/16 | 16/16 |
| normal | Ring security | 16/16 | 0/16 | 0/16 | 16/16 |
| hard | agbero / market enforcer / route marshal | 16/16 | 0/16 | 5/16 | 16/16 |
| hard | area boy | 16/16 | 16/16 | 5/16 | 16/16 |
| hard | Ring security | 15/16 | 0/16 | 5/16 | 16/16 |
| any | heavy (armoured: one blast leaves it on 1) | 0 defeated | 16/16 Normal (punch to the floor + blast), 0 Hard | n/a (steadfast) | 16/16 |

- **ambush**: an unaware patroller cannot see round a corner; the generator laid just round the turn of its route,
  timed from its arrival at the far end, catches it at every level. **bait** (swing at the air, lay under your feet in
  its recovery, one punch, leave late) works on Easy and Normal against basic enemies; placement-watchers (Ring security
  on Normal, every brawler but the reckless area boy on Hard) see it laid. **counter** (jab the wind-up, lay during the
  stagger) is the answer to watchers but holds the generator long; it is a weaker strategy, measured honestly.
- **seen**: a badly placed generator in plain view is escaped by every enemy at every level.
- Totals of the three trap strategies over agbero, market enforcer and Ring security (12 seeds, the test): Easy clearly
  above Hard (asserted margin 24 runs).
- Cost: one sight check per generator and at most one body scan per decision, plus one per watched placement
  (`trapSightStats`, asserted); the territory does one person sight check per enemy per tick.

## 10. Limits and handover

- The drill board is the Academy pillar grid; the real field maps are irregular. The sector worker should re-run
  `npm run sector-ai` style drills on the re-authored sectors and tune `territory` data, not the rules.
- Boss missions get perception only; their crews keep their mission roles (no territories), the boss stays a generator
  bot with no health. Boss-fight balance with perception was not measured beyond the existing mission tests.
- The pilot's responsiveness features (press buffer, swing at the air, diagonal reach) went with it; the human's
  punches use the catalogue timing with the capped recovery. A founder feel-test should decide whether to fold the
  press buffer back in.
- No browser check was run on this branch (owned by another worker); `e2e/oshodi-combat-pilot.spec.ts` was removed with
  the pilot.
