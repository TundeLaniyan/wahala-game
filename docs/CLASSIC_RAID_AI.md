# Classic raid enemy AI

Branch `claude/wahala-cl-raid-ai` (from production `514be88`). Decisions RA1-RA7 in `docs/DECISIONS.md`. Scope: `src/sim` and
`src/ai` only; no render, UI or audio change (the existing awareness marks and cues now also show in raids, because raids
now emit the same `enemyCue` events and carry `state.territory`).

Founder problem: in Classic campaign raids (`settings.game === 'raid'`, cross blasts) enemies moved unpredictably, changed
direction all the time and escaped almost every generator, so a player could neither read a patrol nor trap it. The open
field missions had been fixed by the campaign tactics layer (decisions SA*/RC*, `docs/CAMPAIGN_SECTOR_AI.md`); this branch
applies the same principles to raids without turning Classic into City Rumble: grid, cardinal cross blasts, fuse and blast
rules, crates, doors, objectives, waves, belts and the raid clock are untouched, and so is raid combat (enemy health,
punches, recovery frames).

## 1. Root causes (verified)

| Cause | Where | Effect |
| --- | --- | --- |
| Raid enemies ran the competitive `Brain` with the bot levels' random `wander` (Beginner 2.5, Casual 1), `hesitate`, `mistake` and a 20-30 tick re-plan cadence, steered only by `raidDirectiveFor`: hold within 2 tiles of the spot, chase within `AGGRO_RANGE` | `ai/enemyBot.ts` `enemyProfile`, `raid/directives.ts` | Inside the guard radius every tile scores within about 1 of another, so the random term picked the direction: 31 (Normal) to 66 (Easy) reversals per enemy-minute, all of them churn; on Hard (wander 0) they stood still |
| No perception in raids: `EnemyBot.perceive` kept every generator at its true position (EF1). A calm enemy took it seriously `reactTicks` (6-30) after it appeared, through walls and at any distance, then `alert()` forced an exact time-expanded escape | `ai/enemyBot.ts`, `config.enemyAttacks.awareness` | No generator could be hidden: a generator on a guard's path was dodged the same whether it saw it or not |
| Planner / sim step mismatch for enemy seats: `stepTicksOf` added the kind's `stepPenaltyTicks` (and `readyTick` the `rootedUntil`) only under `tacticalTrap` / `campaignTactics`, the sim always | `ai/world.ts`, `systems/queries.ts` | A heavy (12 ticks) or thrower (13) planned at 10, fell behind its plan every step or two, re-planned off-plan and re-rolled its random wander |
| Raid enemies walked at the player's pace (agbero, guard, boss 10 ticks a tile) on every level, although `campaign/levels.ts` promised slower raid enemies on Easy | `data/enemies.ts` | Nothing could be outwalked or timed |

## 2. What changed

**RA1 - the tactics layer in raids, without its combat model.** `raidConfigLayer` adds `campaignTactics: raidTacticsFor('normal')`,
`buildRaidGame` the Easy / Hard one over it (Normal adds no options config, as before). `raidTacticsFor(level)` is the field
layer's level (`campaignTacticsFor`) with the raid's own numbers (`RAID_TACTICS_LEVELS`) and `classicRaid` set. Every combat
hook of the layer now reads `tacticsCombat(config)`, which is `undefined` when `classicRaid` is present: enemy health, the
tactics hit, armour and punch floors, the armoured blast rule, enemy recovery frames, keep-off-the-human and same-tile
reach, the whiff extra and the variant recovery bonus stay the raid's (`skills.ts`, `lethality.ts`, `campaignDamage.ts`,
`enemyActions.ts`, `pilotCombat.ts`, `campaignView.ts`, `enemyCues.ts`, `ai/world.ts`). The enemy attack timings
(`config.enemyAttacks`) are not layered either. What raids do get: sight / memory / hearing (`ai/trapSight.ts`), the
territorial state machine (`systems/territory.ts`), the pace (`systems/enemyPace.ts`, and with it the planner/sim
agreement of `ai/world.ts`), group tactics on Normal / Hard, the cues. A raid seat with a mind follows
`territoryDirective` (`raidDirectiveFor` defers to it; the old hold/chase rule remains only for a raid without the layer).

**RA2 - readable routes derived from the board** (`src/sim/raid/routes.ts`, data `classicRaid.routes`). Each enemy gets
its territory when it wakes (`waves.ts`), so wave enemies get theirs when they appear. Deterministic, no RNG:

| Kind | Style | Route |
| --- | --- | --- |
| agbero, guard | loop (prefer 12 tiles, at most 16) | the rectangle of open floor round 1-4 pillar blocks through its spot, walked one way (odd seat clockwise, even seat anticlockwise), the four corners its waypoints; no loop fits: the longest straight corridor run (at most 7 tiles) walked end to end |
| lieutenant | loop (prefer 16, at most 20) | the same, wider |
| heavy | beat (3 tiles) | a short back-and-forth in front of its spot |
| thrower, boss | post | holds its spot facing down its longest open lane; its view sweeps a quarter turn every `lookAroundTicks` |

A route tile is open floor when it wakes, never a belt, never within 3 tiles of the entrance, and never a tile another
enemy's route walks (an alcove spot takes its route from a tile at most 2 steps away). A pause at each waypoint (Easy 48,
Normal 36, Hard 24 ticks, no jitter, no reversed laps): the look round the corner. Crates are walls to an enemy route (it
never blasts them); a lane closed later is skipped after `patrolStuckTicks`. `npx tsx scripts/raid-routes.ts [raidId]`
prints every route on its board.

**RA3 - fair pursuit.** The territory's machine: notice (grid sight in the calm cone within `calmNoticeTiles`, all round
within `noticeTiles` once engaged, `closeTiles` 2 at once, a hit) -> alert beat -> pursue (Normal / Hard: group sides) ->
leash from the territory (`pursuitTiles` 4 / 5 / 7 + 2), break-off on a walking gap or after `maxChaseTicks` (360 / 480 /
720) -> search where it last saw him -> walk back -> its route. Ordinary enemies are slower than the player (10 ticks a
tile) on every level and slower still on a calm walk; sim and planner agree:

| ticks / tile (chase, calm) | agbero, guard | thrower | heavy | lieutenant |
| --- | --- | --- | --- | --- |
| Easy | 12, 15 | 14, 17 | 15, 18 | 12, 15 |
| Normal | 11, 13 | 13, 15 | 13, 15 | 11, 13 |
| Hard | 11, 12 | 12, 13 | 13, 14 | 11, 12 |
| before | 10 | 13 | 12 | 11 |

**RA4 - fair generator awareness.** The layer's perception on raid numbers: sight with wall and body occlusion (two
Bresenham traces, `systems/sight.ts`), calm cone (90 degrees, `calmVisionTiles` 2 / 3 / 3), reaction after first sight,
memory, watching a placement (trap sense), hearing a generator laid through walls but only 1 / 2 / 3 tiles away (a raid
loop of 8 tiles is never more than 4 away; the field's 4-6 heard everything) which makes it cautious and sends it to look
along a coarse direction band. An unseen generator is absent from its plan; a seen one not yet reacted to is an obstacle;
a known one is planned round with its real fuse. Two raid-only additions in `EnemyBot`: a known generator is avoided for
its whole fuse (no bot-level `lookahead`: it never waits beside one it has seen to step out at the last moment), and a
brawling enemy (chasing, winding up) takes a generator it sees seriously later (reaction x4 / x3.5 / x2.5 on Easy /
Normal / Hard, the ordinary trap sense; the field's x2): tunnel vision, so a generator laid in a chase can still catch it.

**RA5 - commitment.** No random wander or hesitation (the territory decides where it goes); a new order from the territory
(the next waypoint, a pause over, a chase begun or ended) is acted on at once instead of at the next routine re-plan, so
the clockwork keeps its timing; goals are sticky because the directive is.

**RA6 - roles.** Only the thrower keeps its distance in a raid (`RaidRouteStyle.keepsDistance`, read from the seat's kind
at the moment it pursues): a lieutenant closes in as raid lieutenants always did (it still throws from a clear line) and
never takes a group throwing slot; it plans at its
level's bot (+1 on Hard) instead of +2 levels. A wave the player's own action calls in (a marked crate, a door, a cleared
wave) wakes alerted to him and hunts him for at most `calledChaseTicks` (480 / 600 / 720) with no leash, gap or max-chase
break-off; losing sight of him still sends it to search. Waves present from the start (`start`, `ticks`) wake calm.

**RA7 - one sight rule, readable by presentation** (below).

## 3. Before / after

`npx tsx scripts/raid-ai.ts --seeds 8` on every raid at Easy / Normal / Hard (the campaign's enemy bot level per level,
Beginner / Casual / Standard). "Before" = the same script on production `514be88`'s `src`. The harness is
`scripts/lib/raidAi.ts`; full play is the fair-fight scripted human (`scripts/lib/fairHuman.ts`), which since this branch,
in raids, walks up to an enemy it cannot fire at and hunts the last wave when the open exit is still behind its gate
(both trees measured with that harness).

Movement, the human idle at the entrance for 60 s (calm enemies):

| | Easy before / after | Normal before / after | Hard before / after |
| --- | --- | --- | --- |
| reversals per enemy-minute | 65.5 / 15.9 | 30.8 / 19.2 | 0 (stood still) / 22.9 |
| of which not at a route end (churn) | 65.5 / 0.0 | 30.8 / 0.2 | 0 / 0.0 |
| calm steps per enemy-minute | 139 / 95 | 49 / 119 | 0 / 146 |
| predictable calm steps (same way as last time from the same approach) | 61 % / 100 % | 71 % / 100 % | - / 100 % |

The remaining reversals are the ends of corridor runs and heavy beats (a turn with a reason).

Generator drills (first-wave calm enemies, not armoured; 6 raids x 8 seeds):

| | Easy before / after | Normal before / after | Hard before / after |
| --- | --- | --- | --- |
| corner ambush on its route (laid 2 tiles past a corner, unseen, unheard, timed to its arrival): trapped | no routes / 49 of 49 | no routes / 23 of 32 (72 %) | no routes / 2 of 8 (25 %) |
| generator on its coming path, seen or not: trapped | 9 of 84 (11 %) / 15 of 79 (19 %) | 8 of 47 (17 %) / 16 of 80 (20 %) | none staged (stood still) / 12 of 80 (15 %) |
| unseen-at-laying ambush anywhere on its path: trapped | 0 of 1 / 4 of 30 | - / 3 of 30 | - / 0 of 17 |
| generator laid next to it in plain view with a way out: caught | 2 of 48 / 3 of 40 | 0 of 70 / 2 of 31 | 0 of 80 / 0 of 29 |

Full play (fair-fight scripted human, 6 raids x 8 seeds per level):

| | Easy before / after | Normal before / after | Hard before / after |
| --- | --- | --- | --- |
| completed | 48 / 48 of 48 | 47 / 48 of 48 | 47 / 47 of 48 |
| health lost per run (mean of raids) | 1.75 / 1.04 | 1.40 / 1.40 | 0.82 / 1.00 |
| lives lost per run | 0.06 / 0.00 | 0.09 / 0.06 | 0.09 / 0.11 |
| escapes from a fresh cross (enemy in the cross the tick laid, in view) | 85 % / 76 % | 85 % / 86 % | 87 % / 86 % |

`scripts/enemy-fairness.ts --only raid --seeds 8` (Dispatch Depot, Casual): completed 8/8 -> 8/8, kills by blast 11 -> 15
(of 47 -> 48), damage taken per minute 0.94 -> 0.10, escapes from a fresh cross 87 % -> 88 %; the slower player 7/8 -> 8/8.
`scripts/district-play.ts raids`: depot 6/6 (84 s) -> 6/6 (75 s), storeroom 6/6 (45 s) -> 6/6 (52 s), tool shed 5/6 -> 6/6.

Reading: patrols are now readable and repeatable, and the trap a player prepares from them (round a corner, timed) works on
Easy and Normal and sometimes on Hard. A generator laid in plain view during a fight is still mostly escaped, by design
(a visible threat gets an intelligent escape after a reaction time; tunnel vision makes it later, not blind); the fair-fight
script lays only such generators, so that column barely moves. Hard reacts faster and hears 3 tiles, so its ambushes need
better timing (laid 4+ tiles away).

## 4. Interface for the lighting worker (night raid, torches, light detection)

- **Facing.** Every raid enemy has `Player.facing` (`'up' | 'down' | 'left' | 'right'`) in `GameState`: it is the direction
  its calm view cone opens (`inViewCone`, 90 degrees ahead plus the eight tiles round it). Movement sets it, the territory
  turns it to the human when alerted / watching him and sweeps it a quarter turn every `lookAroundTicks` at a post. A torch
  beam drawn along `facing` shows exactly what the enemy can notice while calm.
- **What it looks at now.** `enemyLookout(state, id)` (`src/sim`, pure): `{ x, y, facing, calm, noticeTiles }` - whether
  the cone applies this tick (patrol, watch, walking back) or it looks all round (alerted, pursuing, searching), and its
  current notice range in tiles. Null for a seat without a mind.
- **The sight rule.** `enemySeesPerson(view, observer, target, { range, calm })` (`systems/sight.ts`, pure, deterministic):
  calm -> cone first, then grid line of sight with walls, crates and other bodies blocking, within `range`. The territory
  calls only this to notice the human. A light-exposure term extends it by changing the RANGE passed to `canSeePlayer`
  inside it (for example `range + litBonus` when the target is lit, less when dark), never the line rule; its numbers go
  in the config next to `awareness.noticeTiles` / `calmNoticeTiles` (`CampaignTacticsConfig`, raid values in
  `RAID_TACTICS_LEVELS`). Generator sight is the separate `canSeeTile` used by `ai/trapSight.ts` (vision per kind in
  `perception`).
- **Events.** Raids now emit `enemyCue` (`alert`, `investigate`, `lost`, `windup`, `recovery`) and keep
  `state.territory.minds[id].state`, so the existing awareness marks work in raids as they do in field missions.

## 5. Tests

`tests/raid-ai.test.ts` (new): guard A walks its loop corner by corner, same way every lap; the same seed walks the same
tiles; on every raid and level churn < 1 reversal a minute and > 95 % predictable steps; every derived route is open floor,
straight legs, off belts and the entrance, never shared; archetypes; a generator behind the pillar catches a guard that
never saw it at every level (Hard too), the same generator in plain view is escaped by a real walk; the sight rule never
sees through a pillar or outside the calm cone; measured corner ambushes trap more than half on Easy and Normal while plain
view is escaped; several enemies never all dodge; chase, lose behind a door, search, back on the route; a called wave wakes
alerted and the first wave calm; pace slower than the player with Easy slowest; the planner's step time equals the sim's
for every raid enemy and a planted enemy cannot plan a step; `enemyLookout`; determinism.

`tests/raid-ai-isolation.test.ts` (new): bot-play digests (state and event stream) of the 13 field missions at each level,
the six boss missions, every Academy lesson, Classic and two City Rumble rulesets, recorded on `514be88` before this work:
unchanged. With `tests/enemy-fairness.test.ts` EF8 (multiplayer) and `tests/mission-regression.test.ts` also unchanged.

Changed on purpose: `tests/campaign-tactics-layer.test.ts` asserted the layer ABSENT in raids; it now asserts the raid
layer is present with `classicRaid`, `tacticsCombat` off, raid enemy health and the raid's own enemy attacks.
`tests/raid-core.test.ts` asserted the old hold/chase directive; it now asserts the route directive and a chase once the
guard notices the player, and keeps the old rule for a raid built without the layer.

## 6. Limits

- Routes are derived, not authored: the maze decides them. A spot in a belt-locked alcove holds a post (the rail yard's
  heavy); a raid can override a route only by changing the board. An authored `RaidDef` route field would be the next step.
- The fair-fight script lays generators only in plain view, so it does not exercise the ambushes the routes make possible;
  the drills do. It still times out rarely in a stand-off with a thrower that holds the bay door's line (1 of 144 runs
  after: depot, Hard; 2 of 144 before: tool shed timeouts).
- Hard's corner ambush rate (25 % of 8 staged) rests on few cases; Hard hears 3 tiles, which excludes most corner layings.
- Escape from a visible threat stays strong on every level (a fair rule); only perception (walls, cone, hearing range,
  tunnel vision) and commitment make traps work.
- Field missions keep the combat pilot's mismatch where it still exists (the archived `combatPilot` replay without the
  layer plans enemy seats at the player's pace); it is not played by the campaign and fixing it would change its pinned
  replay, so it is left and noted here.
