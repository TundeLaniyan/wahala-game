# Classic raid combat correction: patrols, generator ambushes, pursuit and escapable punches

Decisions AM1-AM6 (docs/DECISIONS.md). Branch `claude/wahala-classic-combat-v2`, from production `acaeae7`. Classic raids
only: every rule below is reached through the raid's own config (`raidTacticsFor`, `RAID_ENEMY_ATTACKS`, `classicRaid`)
or the raid enemy bot's directive; field missions, bosses, the Academy, Classic Blast, City Rumble and multiplayer play
byte-for-byte as before (`tests/raid-ai-isolation.test.ts`).

## Why the previous raid AI passed its tests and failed the founder

The RA work measured the AI's internals (reversals, a staged corner drill, a scripted *fighter*), never the player's
opportunity. Measured on the live raids (`scripts/raid-live.ts`, `scripts/raid-ambush.ts`):

1. **Patrol timing drifted.** The general bot planner re-thinks on its own cadence; between two waypoints it stood up to
   ~0.5 s on a corridor tile, a different tile each lap. A route that is the same shape but not the same timing cannot
   be ambushed (a generator has a 3 s fuse and a 0.6 s flame).
2. **Enemies were barely slower than the player** (11-12 ticks a tile chasing against his 10): "too fast".
3. **Pursuit was cheap and crowded.** Calm 24-39 % of the time, the rest hunting or investigating; allies alerted each
   other, a called wave hunted with no leash for 8-12 s, and up to 4 ordinary enemies hunted at once.
4. **Calm guards saw a generator 2-3 tiles ahead** and escaped with a perfect planner: a generator on a guard's way
   was seen and avoided almost always.
5. **On Easy a sprung ambush did not kill:** Easy's "blasts hurt less" (`campaign.damage.blast` 1, meant for the
   player) also applied to enemies, and a guard has 2 health. Easy was the hardest level to ambush on.
6. **Punch warnings were not escapable.** Wind-ups were 22-34 ticks (0.37-0.57 s) against a phone player's reaction
   plus half a step (about 21 ticks: no margin), and at impact the punch hit the human on ANY tile next to the enemy
   (and along its line for reach-2 attacks), not the tile its telegraph showed.

## What changed

| # | Change | Where |
| --- | --- | --- |
| AM1 | **Clockwork patrols.** A calm patrolling raid enemy takes the next step towards its waypoint the moment it is free to move (shortest walk, fixed tie-break), unless a generator it knows of or a flame is about (then the planner's danger handling decides). Every lap now has the same timing. | `ai/enemyBot.ts` `patrolStep` |
| AM2 | **Group pressure.** At most 1 / 2 / 3 ordinary enemies (agbero, guard, thrower, heavy) hunt the player at once (Easy / Normal / Hard). Another that notices him, hears a call or is called in watches from its ground ("?") and goes back to its route; a hit or the player at arm's length still turns it (self-defence). A called wave wakes calm on Easy and hunts 4 / 8 s on Normal / Hard (was 8 / 10 / 12 s). Lieutenants and bosses are not capped. | `territory.ts` `alert` / `holdBack`, `classicRaid.maxChasers` |
| AM3 | **Pace and pursuit.** Ordinary enemies 15 / 13 / 12 ticks a tile chasing (the player 10), +3 / +3 / +2 on a calm walk; chases end sooner (4 / 6 / 9 s maximum, a smaller leash and walking gap) and a given-up enemy does not re-notice him for 5 / 3 / 2 s; it notices from 4 / 5 / 6 tiles (calm 3 / 4 / 5) after 0.75 / 0.5 / 0.25 s of sight. | `RAID_TACTICS_LEVELS` |
| AM4 | **Escapable, committed punches.** Ordinary wind-ups 54-60 / 44-50 / 34-40 ticks (agbero / guard); the strike lands only on the telegraphed tile (or on a player still under half-way off it); one wind-up at a time (two on Hard), 1.5 / 1 / 0.7 s apart within a group, and after a hit no enemy can hit him again for 2.5 / 2 / 1.5 s. | `RAID_ENEMY_ATTACKS`, `skills.ts` `committedTarget` |
| AM5 | **Fair generator awareness.** A calm walker sees a generator on its way only from 1 / 2 / 3 tiles (in its view cone, walls block) and takes it in 1.5 / 1.2 / 1 x slower. A generator it never saw is still not in its plan; one it legitimately sees in time is escaped. | `RAID_TACTICS_LEVELS.trapSense` |
| AM7 | **The warning matches the hit.** The raid punch telegraph marks only the committed tile; the brackets on the enemy's other neighbours (the old any-side reach) are gone in raids. | `render/views/enemyTelegraph.ts` |
| AM6 | **A sprung ambush is a kill at every level.** A blast defeats an agbero, guard or thrower outright; a heavy, lieutenant or boss loses at least 2. The human's own damage table per level is unchanged. | `lethality.ts` `raidBlastDamage`, `classicRaid.blastDefeats` |

## Measurements (before = production `acaeae7`, same scripts, 6 raids x 4 seeds = 24 runs per level)

The ambusher (`scripts/lib/ambusher.ts`): a scripted player with a player's limits (it learns a guard's lap only by
watching it twice, decides five times a second, plants out of the guard's line of sight for its next pass, retreats off
its path; hunted, it breaks contact or defends itself; with nothing to ambush it works the objective).

| Level | Raids completed | Ambushes that killed their guard | Kills by blast / by punch | Enemy punches on him (landed) | Most ordinary hunting at once | Time unhunted |
| --- | --- | --- | --- | --- | --- | --- |
| Easy, before | 24/24 | 4 of 23 (17 %) | 26 / 66 | 171 (20) | 3 | 72 % |
| Easy, after | 24/24 | 12 of 17 (71 %) | 36 / 46 | 125 (1) | 2 | 81 % |
| Normal, before | 24/24 | 6 of 17 (35 %) | 22 / 71 | 143 (19) | 4 | 72 % |
| Normal, after | 24/24 | 16 of 17 (94 %) | 50 / 42 | 109 (2) | 3 | 78 % |
| Hard, before | 24/24 | 4 of 7 (57 %) | 19 / 84 | 153 (15) | 3 | 66 % |
| Hard, after | 24/24 | 8 of 12 (67 %) | 21 / 79 | 149 (2) | 3 | 68 % |

The fair-fight player (`scripts/raid-live.ts`: fights what is near, works the objective): enemy time calm 38 / 39 / 24 %
-> 60 / 40 / 32 %; ordinary enemies hunting at once at most 4 / 2 / 3 -> 2 / 2 / 2; punches landing on him 28 / 14 /
16 -> 1 / 12 / 5 (this player sidesteps late on purpose); damage per run 0.88 / 0.29 / 0.50 -> 0.04 / 0.46 / 0.25.

Punch timing (wind-up minimum / mean, ticks): 22 / 29 at every level before; 48 / 54, 40 / 46, 32 / 36 after. A phone
player needs about 21 (0.25 s reaction with input, plus half of a 10-tick step): the margin went from 1-8 ticks to
27-33 (Easy), 19-25 (Normal), 11-15 (Hard).

Hard deaths of the ambusher rose 0.29 -> 0.46 per run: 1.17 of its 1.42 damage per run is its own blasts (its
defensive generator use when cornered), not the enemies (2 punches landed in 24 runs).

## Acceptance tests (deterministic, the real raids and bots: `tests/raid-combat-acceptance.test.ts`)

A a guard's lap watched twice predicts the next ones to the tile (>97 % of ticks, every level); B a generator planted
out of sight for the guard's next pass kills it (Easy, Normal); C dropped in plain view in front of it, the guard sees
and escapes it (Normal, Hard); D with six enemies called in and the player standing in the open, at most the cap (+1
for self-defence) hunt him, and 25 s after he slips away none does; E the wind-up leaves a reaction plus half a step,
stepping off the telegraphed tile makes it miss, and a player who ends up on another side of the enemy is not hit; F the
ambusher completes three raids on Normal with ambushes that kill, at most 2 punches landing.

## Rendered evidence

`docs/screenshots/classic-raid-combat/` (`scripts/ambush-shots.mjs`: the real game in a browser, phone landscape, Low;
the only staging is the generator drop itself): 1 the guard on its rounds and the generator ticking where it will walk,
the player waiting at the entrance; 2 the blast catches it at the corner (its HUD card crossed out); 3 after, nobody
hunting; 4 a punch wind-up telegraph (the arrow and the one threatened tile).

## Not established by tests

Whether this FEELS right in a human's hands on a phone; how readable the routes are without a visual aid (no route
marking was added: the routes are now learnable by watching, a marking is a possible next step if the founder wants one);
Hard's ambush rate rests on 12 planted ambushes.

## v3: rear approaches, one-blast kills, room to breathe (decisions CV1-CV7)

Branch `claude/wahala-classic-raid-v3`, from production `ee939a3`, after the founder's Android test of the AM build.
Same scope rule: Classic raids only, everything through `classicRaid` / `RAID_ENEMY_ATTACKS`.

### What the founder saw, and the cause in the sim

| Founder report | Cause |
| --- | --- |
| Enemies detect him while facing away | "Too close" was 2 tiles (Manhattan) whatever the facing; the eight tiles round a calm guard, the three behind it included, were always in view; a calm guard punched anyone next to it, which turned it round and alerted it. |
| A rear approach to lay a generator is impossible | The above, plus the click of a generator being laid was heard 1-3 tiles away. |
| Ordinary enemies survive direct blasts | A raid enemy takes 12-18 ticks a tile. The flame test used only the tile it had just stepped onto, while it was still drawn on the tile it was leaving. A guard that knew a generator could also stand beside it and step out at the last moment. (Spawn protection, about 2 s after a wave appears, is real and unchanged.) |
| Gangs attack continuously, no room to disengage | The lieutenant hunted on top of the chaser cap; on Normal a called wave was two throwers plus the lieutenant. |
| Punches hard to evade | Easy / Normal wind-ups left 19-33 ticks over a 21-tick phone reaction. |
| Opening raid too demanding | The above, and the depot's "Shift Lead" (8 health) needed 4 blasts at every level. |

### What changed

CV1 no eyes in the back of the head (the near ring and "too close" need the player in front or beside; Easy: in front
only; a calm guard swings only at someone it sees); CV2 a laid generator is silent on Easy and Normal (1 tile on Hard),
and a calm guard sees a generator only ahead (Hard: and beside it); CV3 fire also catches an enemy in the first half of
leaving a tile; CV4 Easy takes a seen generator in more slowly, posts turn every 4 / 2.5 s; CV5 a guard that knows a
generator leaves its cross at once and never walks into a known one; CV6 the lieutenant shares the chaser cap on Easy and
Normal and falls to 2 / 3 / 4 blasts; CV7 Easy and Normal wind-ups 8 ticks longer. Details and numbers:
docs/DECISIONS.md "CV".

### The rear approach (acceptance test G)

Depot guard C holds its post at (11,9) and turns a quarter every few seconds; guard B walks the column above it. The
player waits at (9,7), out of both sights. When he has seen C face the wall (a 0.25 s reaction) and B walking away, he
walks (10,7), (11,7), (11,8) up behind C, lays a generator, and walks back. Every input is a real intent. Easy and Normal:
C never notices him and the blast kills it. Hard: the click is heard and C gets clear.

### Measurements (before = production `ee939a3`)

Opening raid (`scripts/raid-first.ts`, 8 seeds a level, a fair 0.3 s player and a slow 0.5 s one): all completed
before and after; time with nobody hunting the fair player 54 / 54 / 45 % -> 69 / 59 / 51 % (Easy / Normal / Hard); most
enemies hunting at once 2 / 3 / 3 -> 2 / 2 / 3. All raids: enemy time calm with the fair-fight player 62 / 40 / 32 % ->
76 / 52 / 29 %, punches landed 1 / 12 / 5 -> 4 / 4 / 1 (24 runs a level); the ambusher's ambushes killing their guard
71 / 94 / 67 % -> 73 / 100 / 100 %, its damage per run 1.00 / 0.83 / 1.58 -> 0.46 / 0.21 / 1.13, the mean spell with
nobody hunting it 11.8 / 10.3 / 9.3 s -> 18.9 / 15.3 / 9.7 s. Easy punches landed on the ambusher rose 1 -> 8 in
24 runs: it now walks up behind guards, and one that turns finds it at arm's length.

### Not established

The scripted players were not in difficulty before either (they completed every opening raid unhurt before and after);
they measure pressure and opportunity, not how it feels. No physical phone playtest was possible here: the founder's
test remains the acceptance gate.
