# Campaign enemy combat fairness (decisions EF1-EF8)

Founder playtest: campaign enemies punch and interrupt the player while others throw, avoid generators and escape so well
that the player struggles to defeat them and feels forced to flee rather than fight. This document is the investigation
(with numbers, measured on `a4fe457`), the changes, the before / after measurements and the knobs a difficulty layer
should scale. Everything here applies only to campaign enemy seats (`Player.enemyKind`) and to players with campaign
health (`vitals`); multiplayer bots and rules are byte-identical (EF8).

## How it is measured

`npm run enemy-fairness -- --seeds 12 --level casual` (`scripts/enemy-fairness.ts`, harness `scripts/lib/fairHuman.ts`).
A scripted human with ORDINARY intents only (walk, A = lay a generator, B = punch when adjacent) and only what is on the
screen, against ACTIVE enemy bots (the real `createBot` enemy controller, their real directives):

- he leaves a cross / flame / seen projectile line (time-aware walk), or - "linger" - keeps brawling inside his own cross
  until the fuse leaves only the walk out plus 0.75 s; he reads a thrown object's cue and a wind-up after `reactTicks`
  (18 = 0.3 s; the SLOWER player 30 = 0.5 s); he jabs a wind-up he can interrupt, else steps out of it in its last 12
  ticks; he punches an adjacent enemy; he lays a generator when an enemy (or the crate he works on) is in its cross and a
  way out exists; otherwise he walks to the nearest firing tile;
- the BOMBER variant never presses B (does generator placement alone work?);
- (a) each kind alone and mixed groups on an empty classic 15 x 11 pillar grid (90 s, stops at his first defeat);
  (b) the Dispatch Depot raid with its waves, doors, belts, lives and clock (the raid worker is rebuilding raid layouts
  as pillar mazes; these numbers are for the current depot).

Columns: won; kills / enemies; seconds per kill (last kill time / kills); blast / punch kills; health segments lost to
enemies per minute; interruptions per minute (enemy hits that dazed, shoved or hurt him); chained = an enemy hit less
than 1 s after the previous one's daze ended; deaths; generators laid with an enemy in the cross; escapes = enemies that
stood in a fresh cross and were not hurt by that blast.

## Findings (before, `a4fe457`)

1. **Bomb-threat detection was the multiplayer planner's.** `ai/enemyBot.ts` ran the ordinary `Brain` of the seat's
   level with only placement / rewards switched off: danger map of every generator from the tick it lands, exact fuses,
   time-expanded escape search, a reflex veto every tick. At Casual it took others' generators into account 90 ticks
   before they blow (Standard: always). Result against the pure bomber at Casual: 81 % (agbero), 81 % (guard), 88 %
   (thrower) of the enemies standing in a fresh cross walked out of it; 26 % for the slow heavy. Seconds per bomb kill:
   agbero 21.7, guard 17.8 (2 of 12 runs lost), thrower 27.3 (3 of 12 not killed in 90 s).
2. **Escape quality by kind / level.** Pure bomber vs a mixed agbero + guard + thrower group: Casual 7/12 won, 4 deaths;
   Standard 2/12 won, 10 deaths, 6.3 segments lost a minute - the "forced to flee" feeling: a player who relies on
   generators cannot clear a group at Standard.
3. **Health and mobility** (`data/enemies.ts`): agbero 1, guard 2, thrower 2, heavy 3 (setup may raise to 4),
   lieutenant 8, boss 14 segments; a blast takes 2, a Punch 1. Ticks per tile 10 / 10 / 13 / 12 / 11 / 10. The target
   table (agbero 1 blast or 1 punch, guard 1 blast or 2 punches, thrower 1 blast, heavy 2 blasts) was already met by the
   numbers: the problem was landing them, not the numbers.
4. **Throwers** (`config.enemyAttacks`): range 5-6, cue 0.6-1.0 s, own cooldown 2.3-4.5 s, one throw per group per
   second, <= 3 in flight per group. Planted only for the cue, then free to walk at once: nothing to punish.
5. **Melee**: wind-up 0.37-0.7 s (planted), cooldown 2.4-3.8 s, at most 2 wind-ups per group, 0.7 s apart. After the
   punch the enemy could move at once (no recovery).
6. **Combined attacks**: `enemyFire.victimSafeUntil` is shared by punches and projectiles: after any enemy hit nobody
   can hurt the human for its daze + `victimFreeTicks` (1 s). Measured chained interruptions: 0 in every run (before and
   after); a human who never moves survives 4.8 s against 4 enemies with 3 segments. The cap already held; the feeling
   came from the frequency (2.9-6.5 interruptions a minute against two guards for a 0.3-0.5 s player), not chains.
7. **Daze / knockback on the human**: 0.2-0.75 s dazes, up to 2 tiles of knockback, 1 s of recovery frames after damage.
8. **The player's melee vs enemies** used the multiplayer anti-chain rules: Punch hit recovery 1 s, per-target lockout
   3 s, and a 1 s daze immunity that made the target unpunchable. A guard (2) needed 3 s of standing next to it; the
   equal-health duel (`npm run enemy-balance`) took 6.3-6.9 s for every kind.
9. **Open boards** give every enemy a perpendicular exit one step away, so a cross never traps: escapes from a fresh
   cross were 88-94 % on the semi-open depot against 62-88 % on the pillar grid. Trapping needs corridors; all the trap
   numbers here are on a classic grid.
10. **Raids vs field missions**: raids and field missions pass the save's level (default Rookie) to every enemy, but
    `MatchController.startMission` lifted seat 1 to Standard (the boss floor) even in a field mission, where seat 1 is an
    ordinary enemy (a bug). `ENEMY_KINDS[kind].difficulty` is never read. Raid directives (chase within 5-9 tiles by
    kind, else guard the spot, radius 2) and field directives (guards hold a post, radius 3, hunting intruders within 5;
    ranged enemies chase within 9) take precedence over the group tactics, so surround / standoff only run where no role
    is set. Field escape pursuers chased the whole board until they caught you.

## Changes

| # | Rule (campaign enemy seats only) | Numbers (`config`) |
| --- | --- | --- |
| EF1 | **Perception.** The enemy bot hands its planner the observation with every generator it does not heed yet shown as an obstacle with an unreachable fuse. CALM (no rival within `focusTiles`): heeded `reactTicks` after it appears. BRAWLING (a rival within `focusTiles`, or its own wind-up / recovery): heeded only when its fuse is down to `alertTicks`, sometimes later (`slipChance` x `slipTicks`, the bot's own seeded RNG, once per generator). The moment it is heeded the planner re-plans at once with the full escape search. Remote, triggered, own and burning danger is always seen; nothing is ever added to the observation. | `enemyAttacks.awareness` (agbero 20/6/24/0.3/12, guard 16/6/30/0.2/12, thrower 16/6/36/0.2/12, heavy 30/6/36/0.35/16, lieutenant 10/4/80/0.1/10, boss 6/4/110/0.05/8) |
| EF2 | **Commitment, the punishable window.** A resolved enemy punch (hit or miss) plants the enemy for `recoveryRootTicks`; a throw plants the thrower for its cue plus `throwRecoveryTicks`. The bot never starts a punch or a throw inside the cross of a generator it heeds (never suicidal). | melee `recoveryRootTicks` agbero 30, guard 24, thrower 30, heavy 40, lieutenant 14, boss 10; `throwRecoveryTicks` thrower 36, heavy 30, lieutenant 18, boss 12 |
| EF3 | **The player's punches against enemies.** Per-target lockout capped at `campaign.vsEnemy.targetLockoutTicks` (1.1 s, just past the enemy's 1 s recovery frames), and a running daze immunity no longer blocks the punch: it takes its segment without a new daze. Multiplayer lockout (3 s) and every attack on the human are unchanged. | `campaign.vsEnemy.targetLockoutTicks` 66 |
| EF4 | **Steadfast heavies.** A heavy (and a boss) still loses the segment but is neither dazed nor interrupted by the player's jab: trading blows costs you; step out of the swing, punish the recovery or use a generator. | `ENEMY_KINDS.heavy/boss.steadfast` |
| EF5 | **Interruption-free window kept and pinned.** No change to `victimFreeTicks` (1 s): the shared window already covers a punch followed by another enemy's throw; now tested. | `enemyAttacks.victimFreeTicks` 60 |
| EF6 | **Field pursuers give up.** An escape-leg pursuer chases while the human is within `pursuitGiveUpTiles` (Chebyshev) and otherwise holds where it stands (taking up the chase again if he comes back). | `enemyAttacks.pursuitGiveUpTiles` 14 |
| EF7 | **Field seat 1 is an enemy, not a boss**: the Standard floor applies only to a seat without `enemyKind`. | `app/MatchController.ts` |
| EF8 | **Multiplayer untouched**: every rule is behind `enemyKind` / `vitals`; a bot-vs-bot digest (classic 4 levels, Rumble 6 levels) recorded on `a4fe457` is pinned. | `scripts/lib/mpDigest.ts` |

**Normal baseline = Casual enemy bots** (EF1-EF4 at the values above). Casual plans properly but late (22-tick reaction,
re-plan every 18-26 ticks), has no chain awareness and no safety margin (a two-generator box works) and picks a worse
goal 20 % of the time. Standard adds chains, a margin and a keener hunt (a good Hard); Rookie / Beginner add hesitation
pauses and wandering (Easy). Integration branch (decision CI1): the campaign level now maps Easy / Normal / Hard to Beginner / Casual / Standard for
field-mission and raid enemies.

## Before / after at the Normal baseline (Casual bots, 12 seeds)

(a) Classic 15 x 11 grid, the fighting human (punches and generators):

| fight | before: won, s/kill, blast/punch, dmg/min, interr./min, deaths | after |
| --- | --- | --- |
| agbero | 12/12, 2.4, 0/12, 0.00, 0.0, 0 | 12/12, 2.4, 0/12, 0.00, 0.0, 0 |
| guard | 12/12, 6.0, 0/12, 0.00, 0.0, 0 | 12/12, 3.6, 0/12, 0.00, 0.0, 0 |
| thrower | 12/12, 13.9, 3/9, 0.00, 0.7, 0 | 12/12, 14.1, 3/9, 0.00, 0.0, 0 |
| heavy | 12/12, 9.2, 7/5, 1.63, 1.6, 0 | 12/12, 9.1, 8/4, 0.00, 0.0, 0 |
| lieutenant | 11/12, 35.1, 5/6, 3.15, 3.3, 1 | 12/12, 40.2, 0/12, 0.75, 0.7, 0 |
| 2 guards | 12/12, 4.4, 9/15, 2.87, 2.9, 0 | 12/12, 2.6, 0/24, 0.00, 0.0, 0 |
| agbero + guard + thrower | 12/12, 3.9, 3/33, 0.85, 0.8, 0 | 12/12, 4.5, 4/32, 0.37, 0.4, 0 |
| guard + thrower + heavy | 12/12, 5.5, 5/31, 0.91, 1.5, 0 | 12/12, 5.6, 8/28, 0.30, 1.8, 0 |

(a2) The pure BOMBER (never punches) - "are basic enemies killed by ordinary bomb placement?":

| fight | before: won, s/kill, dmg/min, deaths, escapes | after |
| --- | --- | --- |
| agbero | 12/12, 21.7, 0.92, 0, 81 % | 12/12, 17.0, 1.18, 0, 75 % |
| guard | 10/12, 17.8, 4.01, 2, 81 % | 11/12, 14.5, 6.19, 1, 72 % |
| thrower | 9/12, 27.3, 0.00, 0, 88 % | 12/12, 28.8, 0.00, 0, 84 % |
| heavy | 12/12, 14.3, 1.74, 0, 26 % | 12/12, 18.6, 1.07, 0, 59 % |
| agbero + guard + thrower | 7/12, 10.1, 3.81, 4, 76 % | 11/12, 11.1, 2.96, 1, 76 % |

(a3) The SLOWER player (0.5 s reactions):

| fight | before: won, s/kill, dmg/min, interr./min, deaths | after |
| --- | --- | --- |
| guard | 12/12, 6.0, 3.33, 3.3, 0 | 12/12, 3.7, 0.00, 0.0, 0 |
| heavy | 12/12, 9.7, 0.52, 0.5, 0 | 12/12, 9.0, 5.00, 5.0, 0 (10 of 12 by blast) |
| 2 guards | 12/12, 4.7, 6.45, 6.4, 0 | 12/12, 3.0, 0.00, 0.0, 0 |
| guard + thrower + heavy | 11/12, 5.2, 3.91, 4.6, 1 | 12/12, 5.0, 2.33, 2.7, 0 |

(b) Dispatch Depot raid, active waves (6 enemies: 3 guards, then 2 throwers and a lieutenant):

| player | before: completed, s/kill, dmg/min, interr./min, deaths | after |
| --- | --- | --- |
| fighting human | 12/12, 10.1, 3.37, 3.8, 9 | 12/12, 10.7, 0.84, 1.0, 0 |
| slower player | 11/12, 12.8, 2.05, 2.5, 5 | 11/12, 12.4, 0.49, 0.8, 1 |

Chained interruptions: 0 in every run before and after. At Standard (a candidate Hard) the bomber vs the mixed group
went from 2/12 won, 10 deaths to 7/12, 5 deaths, and the depot from 11/12, 8 deaths to 12/12, 2 deaths.

(c) Multiplayer: `multiplayerDigest` (Danfo Bus Park, Standard / Skilled / Casual / Expert, 3600 ticks; Ojuelegba Rumble,
six levels, 2400 ticks) is identical on `a4fe457` and after (`99e2881a:9435/46073eec`, `6699ed4:27237/6899a648`);
`tests/blast-rules.test.ts` and `tests/mission-regression.test.ts` hashes unchanged.

`npm run enemy-balance` (decision EA5 harness, melee squads): dodger health lost a minute 0.5-2.5 (before 1.7-3.0), a still human's
earliest defeat 4.8 s (unchanged); the equal-health duel is now 2.5-3.0 s instead of 6.3-6.9 s (EF3).

## What still needs a human feel-test

- Whether a brawling guard walking past a fresh generator reads as "focused on me" or as "stupid" (EF1 `alertTicks`);
  the calm reaction (`reactTicks`) keeps them from strolling into generators when nobody is near.
- The heavy's steadfast swing (EF4): a slower player now takes 5 segments a minute when he trades with a heavy; is the
  wind-up (0.7 s) readable enough on a phone to step out of?
- The recovery roots (EF2) need a visible pose / tell in the view (presentation work: today only the wind-up and the cue
  are drawn).
- Field escape legs with the 14-tile give-up on each real field map; mandatory `clearGroup` legs are only easier
  (EF1-EF3) but were not replayed end to end with active bots.
- The harness human jabs at 0.3 s; a touch player is slower - the slower-player tables are the closer guide.

## Knobs for Easy / Normal / Hard

The difficulty branch should scale (all campaign-only, in `config` or the bot level):

1. the enemy bot level per difficulty (Normal = Casual; Easy = Rookie / Beginner; Hard = Standard);
2. `enemyAttacks.awareness[kind]`: `alertTicks` (the main bomb-kill knob: x0.8 Easy, x1.5-2 Hard), `reactTicks`,
   `slipChance`, `focusTiles`;
3. `melee[kind].recoveryRootTicks` and `throwRecoveryTicks` (the punishable window: longer on Easy);
4. `campaign.vsEnemy.targetLockoutTicks` (player punch rhythm; never below `campaign.invulnTicks`);
5. `victimFreeTicks`, `maxGroupPunches`, `groupGapTicks`, `groupPunchGapTicks` (pressure; keep the free window >= 1 s);
6. `pursuitGiveUpTiles` (field escape legs) and the raid `AGGRO_RANGE` (still a constant in `raid/directives.ts`);
7. `ENEMY_KINDS[kind].steadfast` (Easy could turn it off for the heavy).
