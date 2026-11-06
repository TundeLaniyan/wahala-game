# Campaign enemy attacks

Worker `combat-attacks` of the campaign expansion (`docs/CAMPAIGN_EXPANSION_PLAN.md`, decisions EA1-EA7 in `docs/DECISIONS.md`). Simulation and bots only: the views, HUD and mission runtimes read the events and the tables below.

Rules in one paragraph: an enemy seat (`Player.enemyKind`) never uses the generator economy. It acts through the one B press (`Intent.special`, `src/sim/systems/actions.ts` -> `enemyActions.ts`): an adjacent rival is punched, else a thrower with a rival in a clear cardinal line throws, else nothing. Every throw has a visible launch cue before anything moves; the path is known; a rival who leaves it in time is missed. All harm goes through `applyCampaignHit` (combat-core) and is rate limited. Humans keep exactly two buttons.

Fairness update (decisions EF1-EF8, `docs/ENEMY_COMBAT_FAIRNESS.md`): enemy bots heed a generator late while brawling and soon when calm (`enemyAttacks.awareness`), a resolved punch or throw plants the enemy for a recovery (`melee[*].recoveryRootTicks`, `throwRecoveryTicks`), the player's punches on enemy seats lock out for 1.1 s and pass a daze immunity, heavies and bosses are steadfast, field pursuers give up beyond `pursuitGiveUpTiles`.

## Files

| file | what |
| --- | --- |
| `src/sim/systems/projectiles.ts` | launch, flight, collision, `state.projectiles`, `state.enemyFire` |
| `src/sim/systems/enemyActions.ts` | the enemy B press, enemy punch hit, reinforcement calls |
| `src/sim/data/enemyAttacks.ts` | which kind throws what, who calls (data, fixed rotation, no RNG) |
| `src/sim/config.ts` `enemyAttacks` | every number below |
| `src/sim/campaign/tactics.ts` | group tactics -> `NpcDirective` (surround, standoff, block, hold, reinforce) |
| `src/ai/enemyBot.ts` | the enemy controller (`createBot` routes enemy seats to it automatically) |
| `scripts/lib/enemyScene.ts`, `scripts/enemy-balance.ts` | harness and `npm run enemy-balance` |
| `tests/enemy-attacks.test.ts`, `enemy-tactics.test.ts`, `enemy-balance.test.ts` | the tests |

## Event semantics (for views and the HUD)

**`projectileLaunched`** is the CUE. It is emitted the tick the enemy commits. Fields: `id`, `ownerId`, `kind` (`bottle` | `stone` | `brick` | `tool`), `strong`, `fromX/fromY` (the thrower), `path` (tile indices `y * width + x`, in order; the first is the first tile after the thrower; a blocking tile - wall, hard block, crate - is the LAST element so the impact can be drawn), `stepTicks`, `launchTick`, `warnTicks`. Nothing moves for `warnTicks`: draw the whole path as a warning line and the thrower's wind-up. The thrower is planted (`rootedUntil`) for the cue.

**Flight:** the object reaches path tile `i` at `launchTick + warnTicks + (i + 1) * stepTicks` (`arrivalTick(projectile, i)`). Interpolate between tiles; before `launchTick + warnTicks + stepTicks` it is still at the thrower's hand.

**`projectileHit`** ends the object: `id`, `kind`, `victimId` (or null), `result`, `x/y` (the tile it ended on):

| result | meaning |
| --- | --- |
| `damaged`, `dazed`, `defeated` | it hit a rival (the matching `campaignHit` is emitted by `applyCampaignHit` in the same tick) |
| `blockedArmour`, `blockedOkada` | a protection layer absorbed it. Per combat-core (CC2) only a STRONG object (the tool) meets Okada / Armour; a common object that deals a segment (the brick) is a wound |
| `invulnerable` | the rival was inside the free window after an earlier enemy hit: nothing happened |
| `wall` | it hit a wall, a hard block or a crate (x/y is that tile) |
| `blocked` | an ally of the thrower stood on the tile (`victimId` is the ally): stopped harmlessly, it never passes through its own team |
| `expired` | it flew to the end of its range (x/y = last path tile), or the thrower was dazed / downed / out during the cue (then `victimId` null and x/y = the thrower) and the throw was cancelled |

Dodging: a rival counts as hit only if it stands on the path tile when the object arrives there (its sim tile, i.e. the tile it has stepped onto). Stepping off the line before the arrival tick avoids it.

**`attackStarted`** for an enemy punch carries the enemy's REAL `resolveTick` (catalogue start-up plus the enemy's extra wind-up): draw the wind-up until then. A hit emits `attackResolved` (hit true) and a `campaignHit` with `source: 'punch'`.

**`reinforcementCalled`** (`callId`, `callerId`, `enemyKind`, `team`, `x`, `y`, `count`, `untilTick`): a lieutenant or boss asks for help. Nothing is spawned in the sim. The mission / raid runtime decides what answers it (spawn `count` enemies of the caller's `team`); the call stays in `state.enemyFire.calls` until `untilTick`, and idle enemies of that team far from the fight get a `reinforce` directive towards the caller.

## Thrown objects (`config.enemyAttacks.projectiles`; 60 ticks = 1 s, a human walks a tile in 10 ticks)

| object | thrown by | cue (s) | speed (ticks / tile) | range (tiles) | health taken | daze (s) | knockback | thrower cooldown (s) | strong |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bottle | thrower (rotation bottle, stone), lieutenant | 0.60 | 12 | 6 | 0 | 0.60 | 0 | 2.5 | no |
| stone | thrower | 0.60 | 12 | 6 | 0 | 0.20 | 1 | 2.3 | no |
| brick | lieutenant (brick, bottle), boss (brick, tool) | 0.70 | 14 | 5 | 1 | 0.40 | 0 | 3.2 | no |
| tool | heavy, boss | 1.00 | 20 | 6 | 1 | 0.60 | 1 | 4.5 | yes |

A strong object is at least 1.4 times slower and cues at least 1.4 times longer than every common one (tested). Every object is slower than a walking human, so walking away along the line always outpaces it.

## Punches (`config.enemyAttacks.melee`; the animation and start-up come from the catalogue attack, the enemy adds its own wind-up)

| kind | catalogue attack | wind-up (s) | health taken | daze (s) | knockback | cooldown (s) |
| --- | --- | --- | --- | --- | --- | --- |
| agbero | Punch | 0.57 | 1 | 0.40 | 0 | 3.0 |
| guard | Punch | 0.47 | 1 | 0.50 | 0 | 2.6 |
| thrower | Shove | 0.40 | 0 | 0 | 2 | 3.5 |
| heavy | Daze Punch | 0.70 | 1 | 0.67 | 2 | 3.8 |
| lieutenant | Punch | 0.37 | 1 | 0.50 | 1 | 2.4 |
| boss | Daze Punch | 0.60 | 1 | 0.75 | 2 | 3.0 |

The player's Punch starts in 4 ticks (0.07 s) and cuts a pending wind-up short (`AttackSpec.interrupts`), so a fast jab beats any enemy punch (tested). The punch plants the puncher for its wind-up. A rival who began stepping away is missed once the step has crossed half its length (the existing step grace).

## Limits (`config.enemyAttacks`)

| limit | value | why |
| --- | --- | --- |
| `minWarnTicks` | 30 (0.5 s) | no object moves sooner than this after its cue, whatever the data says |
| `minRange` | 2 tiles | a rival next to a thrower is punched or shoved, never thrown at |
| per-enemy cooldown | the table above (>= cue + flight) | one object at a time per thrower |
| `groupGapTicks` | 60 (1 s) | a group (team) throws at most once a second: enemies never all throw in the same tick |
| `maxInFlightPerGroup` / `maxInFlight` | 3 / 5 | hard caps on objects in the air |
| `maxGroupPunches` / `groupPunchGapTicks` | 2 / 42 | at most two wind-ups at once, staggered |
| `victimFreeTicks` | 60 (1 s) | after an enemy hit, the daze plus one more second in which no enemy hit lands (movement is never impossible; shown as `invulnerable`) |
| `aggroTiles` | 11 | farther than this from every rival an enemy holds |
| reinforcement | lieutenant 1 call of 2, boss 2 calls of 2, 20 s apart | when hurt (health at or below half) or alone in the group, with a rival in sight |

## Group tactics (`src/sim/campaign/tactics.ts`, read by bots only through `observe().directive`)

| directive | who | what |
| --- | --- | --- |
| `surround` | guard, agbero, heavy, boss | each enemy of the group that shares a target takes a different open tile next to it (the four neighbours first, the second ring only when they are taken); enemies already standing on one keep it |
| `standoff` | thrower, lieutenant | a tile in a clear cardinal line to the target, `minRange` or more tiles away (3 preferred), different for each; the slot moves back when the target closes in |
| `block` | guard, agbero, heavy | stand on a chokepoint tile marked by the runtime in `state.enemyFire.chokepoints` (`findChokepoint(state, from, to)` finds one). Players do not collide in this engine, so a blocker works by threatening the tile, not by walling it. Never the whole group, never a thrower or the boss |
| `hold` | everyone | no rival within `aggroTiles`: stay put |
| `reinforce` | idle enemies of the caller's team | a call is open: go to the caller |

A mission role's own directive (`src/sim/mission/directives.ts`) wins when a seat has one.

## Measured balance (`npm run enemy-balance -- --seeds 8`, standard bot level, Ojuelegba rumble map, seeds 1..8; measured with combat-core's real `applyCampaignHit`)

1 human (a scripted player who watches the screen: leaves a line on the cue after 18 ticks, steps out of a punch in its last 12 ticks, keeps 3 tiles from the nearest enemy, never fights back) against 4 enemies for 60 s:

| enemies | health lost per minute | throws | punches | earliest defeat of a human who never moves (3 health) |
| --- | --- | --- | --- | --- |
| agbero, agbero, guard, guard | 2.4 | 0 | 10 | 4.8 s |
| guard, guard, heavy, heavy | 2.9 | 14 | 10 | 5.1 s |
| guard, thrower, thrower, heavy | 2.3 | 28 | 9 | 5.5 s |
| heavy, lieutenant, guard, thrower | 1.9 | 29 | 13 | 4.8 s |
| thrower x 4 | 0.0 | 39 | 2 | never (daze only) |

Band asserted by `tests/enemy-balance.test.ts`: 0.3 to 6 health per minute for a dodger, no human defeated before 3.5 s even when standing still, never more than one launch per tick, launches at least 60 ticks apart, at most 3 objects in flight.

Duels (the player's Punch against one enemy, equal 3 health, 32 starts per kind): the player wins every duel (6.3 to 6.9 s on average). Player damage to an enemy is combat-core's (`config.campaign.playerDamage`: a Punch takes 1 segment).

## Using it from a runtime

* Give a seat `enemyKind` (and, with combat-core, `vitals`); `createBot` then plays it with the enemy controller. Put enemies on a different `team` from the human; enemies of any team never hurt each other.
* Call `observe(state, id)` as usual: the directive is attached for enemy seats (outside missions).
* Answer `reinforcementCalled` by spawning `count` enemy seats of `team`; set `state.enemyFire.chokepoints` (via `enemyFireOf(state)`) to mark blockers' tiles.
