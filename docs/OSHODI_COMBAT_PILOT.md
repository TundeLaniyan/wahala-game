# Oshodi Mission 1 combat pilot (decisions CP1-CP12)

Branch `claude/wahala-oshodi-combat-pilot-v1`, from the deployed release `b55e95f`. **An experiment for founder
playtesting: not merged, not deployed, not extended to any other mission.**

Founder report: in Oshodi Terminal Approach, guards punch and interrupt the player, throwers keep throwing, generators
are hard to place under pressure and enemies escape them, punching feels slow or ineffective, and the player spends the
fight retreating. Goal: responsive fighting where ordinary enemies fall to 2-3 punches, while generators stay a valuable
tactical weapon.

## Scope and how it is switched on

- **Only `oshodi.approach`** (Terminal Approach) runs the pilot. `src/sim/mission/combatPilot.ts` maps that one field
  mission to the pilot. The mission's config layer (`missionConfigLayer`) then adds `config.combatPilot` and the pilot's
  enemy-attack tuning, and `buildMissionGame` adds the pilot's Easy / Hard adjustment and its two extra enemies.
- Every other match has **no `combatPilot` key**, so the rules are exactly as before. That covers the other field
  missions, the Dispatch Depot and every classic raid (cross blasts, built separately by `buildRaidGame`), the boss
  missions, City Rumble, Classic, and multiplayer / online. Every pilot rule is behind that key (`systems/pilotCombat.ts`
  plus one-line gates in `skills.ts`, `actions.ts`, `tick.ts`, `movement.ts`, `enemyActions.ts`, `campaignDamage.ts`,
  `lethality.ts` and `ai/enemyBot.ts`). Tested in `tests/oshodi-combat-pilot.test.ts`. The unchanged regression suites
  pass: blast rules, mission regression hashes, the multiplayer bot digest, enemy fairness and raids.
- **To remove it**, delete the `'oshodi.approach'` entry of `FIELD_COMBAT_PILOTS`. The rules code stays inert.
- Unchanged: checkpoints, the depot door hold, the raid hand-over and return, objectives, save progression, the
  difficulty selector, lives and the respawn lifecycle.

## How it was measured

`npm run combat-pilot` (`scripts/combat-pilot.ts`, harness `scripts/lib/pilotFight.ts`) plays the REAL Terminal Approach
mission through the real `tick` with ordinary intents and the real enemy bots at the campaign level's bot level
(Normal = Casual). The same script ran on a pristine `b55e95f` worktree (before) and on this branch (after). Full output
is in `docs/measurements/oshodi-combat-pilot-before.md` and `-after.md`.

1. **Duel**: B tapped 5 times a second next to an enemy that does nothing.
2. **One press under fire**: a guard (or two) brawl at the human's side. The human presses A or B once, at every third
   tick of a 4 s window (80 fresh runs). The press counts as accepted if it laid a generator or started a punch within
   1/3 s.
3. **Fights**: a scripted fighter against active bots, 8 seeds, 60 s, stopping at the first lost life. The fighter
   walks, steps off seen thrown-object lines, steps out of a wind-up it won't beat, taps B at an adjacent enemy, and
   lays a generator when an enemy is in its footprint and a way out exists. It plays at two speeds:
   - **fast**: 0.3 s reactions, 5 taps/s;
   - **slower**: 0.5 s reactions, 3 taps/s. This is the closer guide to a touch player.

## Root causes (measured on `b55e95f`, Normal)

1. **Two of the three playable characters cannot defeat anyone by punching.** Lekki Boy's Daze Punch and Campus Queen's
   Shove take **0** health from an enemy (`campaign.playerDamage.daze/shove = 0`). In the duel, both failed to drop a
   guard, a thrower or a heavy in 20 s. The Daze Punch also has an 18-tick startup and a 4 s recovery.
2. **The default punch only lands about once a second.** Street Baller's Punch has 1 s of hit recovery plus a 1.1 s
   per-target lockout. 5 of 7 taps did nothing, and a guard took 1.28 s. Every enemy also gets **1 s of invulnerability
   frames** after any hit.
3. **Punch and generator cancel each other out.** Those frames swallow a blast that goes off within 1 s of a punch, so
   punching an enemy next to a generator protects it.
4. **Enemies stand inside the player.** Players may share a tile, so a guard would walk onto the human's tile and stay
   there. Melee reaches only the four neighbouring tiles, so neither side can hit, and the guard waits until the human
   moves. In the press test **only 3 of 80 B presses (4 %) started a punch**. An earlier version of the harness, whose
   fighter held its tile, won **0 of 8** punch-only guard fights.
5. **A press that does nothing looks ignored.** The swing animation plays on `skillUsed`, which fires only on a hit. B
   with nobody adjacent (or still recovering) does nothing at all: no swing, no sound, no miss.
6. **Enemy punches have no telegraph on the board.** Only a sound; the thrown-object cue was the only drawn wind-up.
7. **Generators rarely kill.** 88 of 95 guards (93 %) caught in a fresh footprint walked out of it. Generator-only vs one
   guard won only 5 of 8 fights, taking 32.6 s per kill. The enemy AI's "am I standing in the blast?" check also used
   the plus shape on this radius-blast map: a guard diagonal to a generator thought it was safe and could start a
   wind-up there.
8. **Presses during hit-stun are dropped silently.** A or B pressed during a daze (0.4-0.67 s after an enemy punch, up
   to 0.67 s from the heavy) is ignored by `isActing`, and nothing says so. A press on a busy tile or with every socket
   in use is ignored the same way. In the press test the guard was inside the human, so no press happened during a
   daze. With the pilot the guard fights properly and 7 of 80 presses landed in hit-stun: all were carried out.
9. **The heavy dominates.** 13.2 segments/min taken, dazed 14.7 % of the fight (40-tick daze and a 2-tile knockback).
   Thrown bottles interrupted the fast fighter 12.9 times a minute while it punched a thrower.

## Changes (Normal values; all numbers in `src/sim/config.ts`)

| # | Change | Numbers |
| --- | --- | --- |
| CP1 | **Gate**: one map entry switches the pilot on for `oshodi.approach`; `config.combatPilot` absent elsewhere. | `mission/combatPilot.ts` |
| CP2 | **One pilot punch against enemies, whatever the fighter** (multiplayer fighters keep their catalogue). | startup 5 ticks, 1 segment, hit recovery 24, whiff recovery 16 |
| CP3 | **Enemy durability**: guard 3, thrower 2, heavy 5 (agbero 2). A blast takes **3** from an enemy (the human still takes 2). Enemy recovery frames are 6 ticks, and a pilot punch neither waits for frames nor starts them, so a punch and a blast combine. | `enemyHp`, `blastDamageVsEnemy`, `enemyFramesTicks` |
| CP4 | **Every accepted press swings, at once**: the swing clip at the press, a whoosh (`punchSwing`) and a white arc on the faced tile. A hit adds the impact flash and a knock sound. Nobody in reach is a visible miss that takes nothing. **Reach** covers the own tile, the 4 neighbours and the 4 diagonals (forgiving under the high camera). | `diagonal: true` |
| CP5 | **Input buffer**: a B or A press the human cannot act on yet (hit-stun, the punch's own swing / recovery) is kept and done on the first tick it can be. It waits through a hold-up of up to 0.75 s, plus 0.25 s. A refused generator says why: **NO SOCKET** (all in use) / **TILE TAKEN**, or WAIT if a long stun outlasts the buffer (`placeRefused`). | `inputBufferTicks` 15 |
| CP6 | **Readable enemy attacks with a counter window**: the guard wind-up is 0.57 s (was 0.47), with 0.6 s planted after its swing (was 0.4). Heavy: 0.57 s wind-up, 0.83 s planted, 1-tile knockback (was 2). Thrower: 0.8 s planted after a throw (was 0.6), bottle and stone cues 0.7 s (were 0.6), 3 s cooldown. A shorter hit-stun on the human: guard punch 0.3 s (was 0.5), heavy 0.4 s (0.67), bottle 0.33 s (0.6). | `OSHODI_PILOT_ENEMY_ATTACKS` |
| CP7 | **Groups take turns**: one wind-up at a time per group, 0.6 s apart. After an enemy hit, 1.25 s pass before another enemy can hurt the human (was 1 s). | `maxGroupPunches` 1, `groupPunchGapTicks` 36, `victimFreeTicks` 75 |
| CP8 | **Stagger without stun-lock, both ways**: a punch staggers an ordinary enemy for 0.2 s and cuts its wind-up short. The enemy is then immune to stagger for 0.9 s (punches still take health). The interrupted swing does not waste its cooldown: it can swing back 2 ticks after the stagger. Rhythm: hit, hit, dodge or eat the counter, hit. The heavy reels only on every third punch. | `staggerTicks` 12, `staggerImmunityTicks` 54, `counterSwingTicks` 2, `steadfastPoise` 3 |
| CP9 | **Enemies keep off the human's tile**; an enemy punch also reaches a human who walks onto the enemy. | `enemiesKeepOffHuman` |
| CP10 | **The enemy AI reads the real radius footprint** before committing to a wind-up (pilot only; elsewhere the plus test is unchanged). | `ai/enemyBot.ts` `inCross` |
| CP11 | **Roster**: a second Park Warden by the first (two ordinary enemies at once) and a Bottle Boy thrower by the yard gate (a mixed group). Both are seated after the original three, so the original seats keep their ids; fights stay optional. | `FIELD_COMBAT_PILOTS.extraEnemies` |
| CP12 | **Levels**: on top of the ordinary Easy / Normal / Hard differences (health 5 / 4 / 3, recovery frames, enemy bots Beginner / Casual / Standard), Easy gives a longer stagger, a slower counter-swing and a longer free window. Hard gives a 6-segment heavy, a shorter stagger, two wind-ups at once and a quicker guard. | `OSHODI_PILOT_LEVELS` |

## Before / after (Normal, 8 seeds)

Punch-only duel (B tapped 5 times a second at an idle enemy):

| fighter | guard before | guard after | thrower before / after | heavy before / after |
| --- | --- | --- | --- | --- |
| Street Baller | 2 punches, 1.28 s (5 of 7 taps did nothing) | 3 punches, 1.07 s | 1.28 s / 0.58 s | 3 punches 2.48 s / 5 punches 2.03 s |
| Lekki Boy | **never** (0 damage in 20 s) | 3 punches, 1.07 s | never / 0.58 s | never / 2.03 s |
| Campus Queen | **never** (0 damage in 20 s) | 3 punches, 1.07 s | never / 0.58 s | never / 2.03 s |

One press under fire (80 single presses):

| press | before | after |
| --- | --- | --- |
| A, a guard brawling at your side | 80 / 80 | 80 / 80 (7 of them during hit-stun) |
| B, a guard brawling at your side | **3 / 80 (4 %)** | 80 / 80 |
| B, two guards | **3 / 80** | 80 / 80 |

Fights on the real map (won, seconds to clear, health segments taken a minute, deaths). The fast player taps 5 times a
second and reacts in 0.3 s; the slower player taps 3 times a second and reacts in 0.5 s:

| encounter | before | after |
| --- | --- | --- |
| guard, punch only (fast) | 8/8, 1.5 s, 0.0, 0 | 8/8, 1.3 s, 0.0, 0 |
| guard, punch only (slower) | 8/8, 1.7 s, 0.0, 0 | 8/8, 1.4 s, 11.0 (about 0.25 segments a guard), 0 |
| thrower, punch only | 8/8, 2.9 s, 0 dmg but 12.9 interruptions/min | 8/8, 2.1 s, 0 dmg, 0 interruptions |
| guard, generators only | **5/8, 32.6 s**, 0.7, 0; 88 of 95 caught walked out | **8/8, 5.5 s**, 1.4, 0; 5 of 13 walked out |
| thrower, generators only | 7/8, 12.9 s, 0, 1 death; 20 of 28 walked out | 7/8, 8.2 s, 0, 1 death; 13 of 20 walked out |
| guard + thrower, mixed | 8/8, 4.5 s, 0.0, 0 | 8/8, 2.9 s, 0.0, 0 |
| 2 guards, punch only (fast / slower) | 7/8, 4.0 s, 0.0 / 7/8, 4.8 s, 3.8 | 8/8, 2.8 s, 0.0 / 8/8, 3.2 s, 7.0 |
| guard + thrower, mixed (slower) | 8/8, 4.8 s, 1.6, 17.3 interruptions/min | 8/8, 3.3 s, 4.6, 16.0 interruptions/min |
| heavy, punch only (fast) | 8/8, 4.5 s, 13.2, dazed 14.7 % | 8/8, 4.0 s, 15.0, dazed 10.0 % |
| heavy, punch only (slower) | 8/8, 4.3 s, 0.0 | 8/8, 3.7 s, 4.0 |
| heavy, mixed (slower) | 8/8, 5.9 s, 7.7 | 8/8, 5.4 s, 11.1 |

Chained interruptions (an enemy hit less than 1 s after the last daze ended): 0 in every run, before and after.

Easy / Hard (`npm run combat-pilot -- --level easy|hard --only fight`): the slower player takes 0 / 11.0 / 39.6 segments
a minute against one guard (Easy / Normal / Hard), 0 / 7.0 / 22.4 against two guards, and 0 / 4.6 / 19.5 against guard +
thrower. Human health is 5 / 4 / 3. One oddity: on Easy the fast player takes about 0.25 segments a guard (10.8 a
minute; 0 on Normal and Hard). The cause was not investigated: probably the Beginner bot's different timing
(hesitation pauses) together with Easy's slower counter-swing. The amounts are small. No run on any level lost a life except the generator-only thrower fight (one death
on Normal and before the pilot). Full tables: `docs/measurements/oshodi-combat-pilot-easy.md`,
`docs/measurements/oshodi-combat-pilot-hard.md`.

Reading the numbers:
- A fast, attentive player beats an ordinary guard without being hit. A slower player loses a segment now and then:
  the guard's counter-swing lands when they keep tapping instead of stepping out of the red ring.
- The heavy is the enemy that hurts. Trading blows with it costs about one segment, as intended.
- Generators went from a slow, unreliable weapon (32.6 s a guard) to a decisive one (5.5 s a guard): one blast drops
  any ordinary enemy. The enemy AI still reads a generator it has had time to see and walks out of it (38 % of guards
  and 65 % of throwers caught in a fresh footprint escaped).

## What the founder should feel-test

- Whether a guard's counter-swing after the first punch reads in time on a phone, from the red ring and the stretched
  swing.
- Whether the 0.4 s punch rhythm feels responsive enough, or whether it should drop to 0.33 s (20 ticks). At 20 ticks a
  fast player kills a guard before its counter-swing lands, and the guards stopped hurting anyone in the first
  measurement.
- Whether the diagonal reach is forgiving in a good way or ever hits something the player did not mean to.
- The heavy: five punches, every third one makes it reel.
- The Bottle Boy at the yard gate during the door hold.

## Not changed / known limits

- The Dispatch Depot raid and every other raid keep their balance (cross blasts, their throwers and guards). If the
  founder's thrower complaint was mostly about the raid, the pilot does not touch it yet.
- The enemy AI still escapes a footprint it has had time to see (EF1 awareness unchanged). That is deliberate: enemies
  do not stand beside obvious explosives.
- Presentation: the rings and arcs reuse existing effects and clips; there is no new animation asset. The procedural
  fallback character (if a model fails to load) shows the rings but no swing clip.
- **Respawn freeze**: this branch starts from the released `b55e95f`, which does not have the respawn-freeze hotfix
  (`ce57237` / `5869154`, unreleased when the pilot branched). A death from an enemy punch or thrown object still leaves
  the human down with no respawn, as on the release. `tests/oshodi-combat-pilot.test.ts` pins this with an `it.fails`
  tripwire. When the pilot is reconciled with a release that ships the hotfix, that test fails until it becomes an
  ordinary `it`. The hotfix's own tests then pass on the merged code (checked on a local merge, see below).

## Playtest instructions (founder)

1. Campaign -> Oshodi -> **Terminal Approach** (the first section). Normal difficulty is the tuned level.
2. **Punches**: walk up to the first Park Warden past checkpoint A and tap B. Each tap swings at once. Three punches drop
   a warden. When a red ring closes in under a warden, its punch is coming: step away or finish it.
3. **Counter window**: after a warden or the heavy swings, a cyan ring means it is planted. Punish it.
4. **Two wardens**: the second Park Warden stands just below the first. Only one of them winds up at a time.
5. **Heavy** (Lane Blocker, past checkpoint B): five punches, and every third one makes it reel. Watch for its slower
   red ring, or use a generator.
6. **Generators**: tap A to lay one; a blast drops any warden or thrower outright. Punch a warden next to your generator
   to hold it in the blast. Tapping A with your socket in use says NO SOCKET.
7. **Thrower** (Bottle Boy, by checkpoint C and the depot door): its throw cue shows on the ground. Close in after a
   throw (it stays planted for 0.8 s) and two punches drop it.
8. Then the depot door, the raid and the walk back to Orita Gate, as before.

Controls: **keyboard** arrows / WASD move, Space or J = A (generator, hold = remote), K / E / F / L / Shift = B (punch,
hold = remote). **Touch**: left thumbstick, GENERATOR and B buttons on the right. **Gamepad**: left stick / d-pad,
A = generator, B / X = punch (`input/gamepad.ts`). All three go through the same `Intent`, so the buffer and the punch
behave the same on every device.

## Tests (what was run on this branch)

- `npx tsc --noEmit`, `npx eslint .`: clean. Prettier on every changed file.
- `npx vitest run`: 220 files, 3490 passed, 1 expected fail (the respawn-hotfix tripwire above), 7 skipped. Includes
  `tests/oshodi-combat-pilot.test.ts` (22: the gate, scenarios 1-8 and 10) and the unchanged regression suites: blast
  rules, mission regression hashes, the multiplayer digest, enemy fairness, raids, bosses, other field missions,
  Rumble, audio and app.
- `npm run build`: passes.
- Playwright (`--trace off`, served from the build), desktop and mobile (844 x 390 touch): `e2e/oshodi-combat-pilot.spec.ts`
  (real keyboard and real touch buttons: a swing at the air takes nothing, three punches drop a warden, A lays a
  generator, a second A is refused, no page errors) and `e2e/checkpoint-clarity.spec.ts` (checkpoints, door hold, raid
  start). All 4 passed. The full release suite was not run (by instruction).
- Reconciliation check on a LOCAL scratch merge of this branch with `claude/wahala-respawn-freeze-hotfix-v1`
  (`5869154`; not pushed): only `docs/DECISIONS.md` conflicts (both append); `tick.ts` merges cleanly; the hotfix's
  `campaign-respawn-lifecycle` / `campaign-respawn-controller` tests and the pilot tests pass, 46 / 46, with the
  tripwire flipped to `it`.
- Screenshots: `docs/screenshots/oshodi-combat-pilot/{desktop,mobile}-windup.png` (a warden winding up: the red ring).
