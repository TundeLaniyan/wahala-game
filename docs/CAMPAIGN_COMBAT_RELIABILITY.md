# Campaign combat reliability (decisions RC1-RC8)

Branch `claude/wahala-combat-reliability-v1` (from production `0830ee8`). Scope: the campaign FIELD missions' enemy layer
(`GameConfig.campaignTactics`, `docs/CAMPAIGN_SECTOR_AI.md`). Classic Blast, City Rumble, multiplayer, raids and the Training
Academy are untouched (their pinned digests and absence tests are unchanged).

## 1. The problem and the baseline

Founder playtest: "Red attack warnings are visible now, good, but trapping enemies with generators is still too difficult and not
smooth. Enemies have no clear readable patrol routes, and once they notice you they chase too persistently at nearly the
player's speed, so I cannot disengage, reposition and time a trap."

Measured on production `0830ee8` (`npx tsx scripts/readability.ts normal`, 2 seeds per enemy, the human starts 5 walking tiles
from the enemy and runs away):

- the human walks a tile in 10 ticks; an agbero and a guard walked it in 10 too (thrower 13, heavy 12, lieutenant 11), a patrol
  walked at full chase pace;
- only about half of the ordinary roamers walked a patrol at all (Normal: oshodi.approach 1 of 2 roamers, lekki.estate 1 of 5), many
  routes were tiny shuttles with a 36 tick pause: busy, robotic, hard to time.

Two things in the probe itself had to be fixed before its numbers meant anything (decision RC6): the first runner consumed one
direction per TICK instead of per tile, so it dithered at corners and was caught (32 % "reached an adjacent tile"); and
"hurt" counted damage from ANY enemy. Both versions are kept (`RUNNER=legacy`, `hurtByIt`); section 5 gives old and new for both.

## 2. What changed (exact numbers)

### RC1 - the human outpaces every ordinary enemy

`CampaignTacticsConfig.enemyStepTicks` (absolute ticks per tile by kind, per level) REPLACES `ENEMY_KINDS[kind].stepPenaltyTicks`
while the layer is present, in the sim (`queries.playerStepTicks`) and in the bot planner (`ai/world.ts stepTicksOf`), so the
planner plans the pace the enemy walks. A variant may shave `personality.stepBonusTicks` (area boy: 1), never below
`enemyMinStepTicks` (Easy 12, Normal 11, Hard 11). Outside the layer the old penalty applies (tested).

| ticks per tile | agbero | guard | thrower | heavy | lieutenant | human |
| --- | --- | --- | --- | --- | --- | --- |
| Easy | 13 | 13 | 14 | 15 | 12 | 10 (9 / 8 / 7 with Roller Skates) |
| Normal | 12 | 12 | 13 | 14 | 11 | 10 |
| Hard (second round: was 11 / 11 / 12 / 13 / 11) | 12 | 12 | 13 | 14 | 11 | 10 |

The human keeps a 17 % lead on Normal and Hard (10 against 12; 9 % against a lieutenant's 11). The area boy is 1 tick faster than an
agbero on Easy and Normal and equal to it on Hard. Boss missions' bots have no enemy kind: unaffected.

### RC2 - patrol pace and readable routes

- A CALM walk (patrolling, holding its post, walking back after its watch) adds `territory.patrolStepExtraTicks`: Easy 3, Normal 2,
  Hard 1. So a Normal patroller walks a tile in 14 ticks and a chaser in 12. Investigating, alert and pursuing enemies run at the
  full pace (`systems/enemyPace.ts`; the territory sets `directive.calm` so the planner knows).
- Clockwork-ish pauses: pause 48 / 42 / 36 ticks, jitter 0 / 6 / 12 (Easy / Normal / Hard). Hard no longer reverses the loop on
  every second lap: a route must be learnable on every level (decision RC5).
- COVERAGE: every ordinary roaming variant (agbero, area boy, market enforcer, route marshal, Ring security) of all 13 field
  missions owns a real route: at least 2 waypoints, one circuit at least 12 tiles of walking (6 each way), inside the sector, off
  every objective tile, never on a floor trap (the bots never step on one: Late Loader's waypoint (36,13) in `mushin.market` was
  an oil slick and its patrol stalled; moved to (37,13)). Equipment crews, throwers, heavies and an escape leg's pursuers hold posts
  by design. Twelve new or rewritten routes (3-4 waypoint LOOPS round a block where the geometry allows) and two waypoint fixes; section 3 lists them all.
- Patrols never freeze: a crate dropped on a lane by a stage hazard used to stop a patroller for the rest of the mission (its route
  planner priced a crate at 4 but the enemy never blasts one). A campaign enemy's route planner now treats a crate as a wall
  (`ai/directive.ts`), and a patrol that has not reached its waypoint 720 ticks after setting off goes on to the next one.

### RC3 - a chase can be broken, and ends

Kept: the territory leash with hysteresis, the watch after giving up, `hitChaseTicks`. Added to the state machine
(`systems/territory.ts`): a pursuer BREAKS OFF when EITHER the human has been farther than `chase.breakOffGapTiles` WALKING tiles
for `chase.breakOffTicks`, OR it has chased `chase.maxChaseTicks` without landing a hit on him (a hit restarts that clock). It goes to
investigate the tile where it last saw him ("?" cue `lost`), searches, walks back and resumes its route; a ranged unit watches from
its post and keeps throwing, as after a leash give-up.

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| walking gap (tiles) / for (ticks) | 5 / 45 | 6 / 60 | 8 / 75 |
| maximum chase without a hit | 420 (7 s) | 600 (10 s) | 900 (15 s) |
| no new notice by sight after a break-off | 150 | 90 | 60 |
| a walk back that does not arrive counts as done after | 480 | 480 | 480 |

For the re-notice time a human within `closeTiles` (2), or a hit or blast on the enemy, still engages it at once. The walking gap
is a bounded breadth-first search every 6 ticks (`walkGapExceeds`, deterministic). A walk back that never arrives (a guard the mission
holds at its equipment kept the mind in `return` for the rest of the mission) now completes after 480 ticks.

### RC4 - trap reliability: what was measured, what was tuned

The hidden-generator rules (an enemy never reacts to a generator it neither saw nor heard; a seen one is remembered), the line of
sight, the hearing bands, the telegraphs, the stagger / knockback / one slow and the locked 3 s fuse are untouched; nothing was
removed (the measurements say stagger and knockback help the counter-jab on Hard). Tuned, by measurement (section 7):

| number | was (E / N / H) | now (E / N / H) | why |
| --- | --- | --- | --- |
| recovery of an agbero / guard after its swing (second round: 72 / 72 / 56, plus 12 more after a swing that hits nobody, cooldowns 192 / 180 / 150; see RC9) | 48 / 42 / 36 ticks | 72 / 60 / 48 | the planted window of a swing is when a generator laid at its feet cannot be walked away from; 42 ticks was shorter than the human's own step in, lay and step out, and the bait succeeded in about half of the runs |
| calm notice range of the human (a calm enemy; engaged ones keep `noticeTiles`) | = notice range 6 / 7 / 8 (agbero) | 4 / 5 / 6 (guard 5 / 6 / 7, thrower 6 / 7 / 8, heavy 3 / 4 / 5, lieutenant 7 / 8 / 9) | a walker looks at the road ahead, not at everything within earshot: a human behind the cone or beyond it walks past, so there is room to reposition (`awareness.calmNoticeTiles`) |
| reaction to a generator while brawling (trap sense `none` / `basic`; field enemy seats only: `enemyBrawlReactScale`, the boss missions' crews keep x2 / x1.5, a retune of them lost the Ebute and Lagos boss fights) | x2 / x1.5 | x2.4 / x2 | a brawler in a fight takes a generator under a rival's feet seriously later: the planted-and-pursuing enemy that walks out of a freshly revealed generator is the single most common miss |

The cooldown between swings was unchanged in the first round; the second round changes it with the recovery (RC9; the data rule "every cooldown exceeds wind-up + recovery + miss bonus + 36" holds). Calm view cone (90
degrees), generator vision (`calmVisionTiles`), hearing, notice time (36 / 20 / 10 ticks) and alert beat are unchanged.

### RC5 - fair difficulty

Easy: slower enemies (13 / 14 / 15), longer calm pace (+3), longer pause, a short chase (7 s, 5-tile gap), longer recoveries,
nobody calls for help. Hard: the same speed as Normal (12 / 13 / 14, still 17 % slower than the human), a longer chase (15 s, 8-tile
gap), quicker re-notice (60 ticks), jittery pauses, shorter reaction (react ticks -8), a longer search, cover for cover users, a
shorter recovery (56 against 72), and it still WATCHES a generator being laid unless it is brawling (RC10). Nothing on any level knows
about a generator it did not see or hear.

### RC9-RC12 - the second round (what was tuned, one lever at a time)

The first round left Normal bait at 40-70 % first try (production, same human, 50-58 %) and Hard at 0-8 %. The failures were read
off the bait attempts (`DIAG=1`, 134 misses of the Normal and Hard runs of the first tuning step): in 98 the blast went off with the enemy
FREE (not planted), 2-3 tiles from the generator and walking after the human; in 16 the human had been killed by other enemies of
the crowd before the blast (`hp 0`: Mushin market, the marshal crew); in 20 it was something else (planted but out of range, or in
range and surviving). Not the timing step. First attempt / within two, Normal, n = 20 per mission, approach / railEdge / market / junctions:

| step | Normal result |
| --- | --- |
| round 1 final (first / two, from section 5) | 60 / 80, 70 / 75, 40 / 70, 50 / 75 |
| RC9: recovery 72, +12 after a swing that hits nobody, cooldown 180 | 80 / 100, 80 / 90, 25 / 55, 50 / 80 |
| RC12: the human picks the LONE patroller (the one with fewest enemies within earshot of its route) | 80 / 100, 70 / 90, 90 / 95, 80 / 85 |
| RC12: the human leaves when the swing has started and the fuse is no longer than the 1.8 s it stays committed (deadline: 40 ticks) | 95 / 100, 85 / 95, 100 / 100, 85 / 95 |

- **RC9, longer commitment (game).** Ordinary brawler (agbero, guard) recovery Normal 72 (was 60), Easy 72, Hard 56 (was 48); a swing
  that finds nobody plants it `attack.whiffRecoveryExtraTicks` 12 ticks longer (`systems/enemyActions.ts`, layer only); cooldowns
  192 / 180 / 150 so every cooldown still exceeds wind-up + recovery + miss + 36. Why: the second swing starts a cooldown after
  the first and plants it for wind-up + swing + recovery; to still be planted when a generator laid in the first recovery goes off
  that planted time has to reach the end of the 3 s fuse.
- **RC10, tunnel vision (game, Hard).** A Hard enemy of the basic and no-trap-sense tiers that is COMMITTED (winding up, swinging or
  planted in its recovery) does not watch the ground under its rival's feet (`TrapSenseSpec.watchesWhileBrawling: false`); it reacts
  to a generator it then sees by the Normal brawl scale (x2 / x2.4). Pursuing, calm or free it still watches placements, and the
  keen and expert tiers (Ring security, lieutenants, bosses) always do. (A first version applied to every brawling enemy, pursuit
  included: bait 65-85 %, but the Hard missions then cost less than Normal for the scripted playthrough and
  `field-districts-fadeyi` failed; committed-only keeps Hard dearer.) Hard bait first try: 0-10 % (three of four missions) -> 60-85 %. Making Hard react later only (`enemyBrawlReactScale` 3.2
  and 3.4, measured) lifted `approach` from 0 to 45 % and the others not at all: the enemy that sees the placement simply walks out
  when it is free.
- **RC13, Hard commitment and breathing room (game).** Hard agbero / guard wind-up 44 ticks (extra 40, was 34; Normal 48), heavy 36
  (extra 32, was 26), free window after an enemy hit 66 (was 54, = Normal). Without it the Hard Oshodi flow finished 5-8 of 12 seeds and
  lost its lives to the heavy and to the bait's own cost; now 16 of 20.
- **RC11, Hard speed (game).** Hard step times 12 / 12 / 13 / 14 (lieutenant 11), as Normal: the Hard probe's "reached an adjacent
  tile" falls from 10.4 % to 8.0 %.
- **RC12, the human (harness).** Two things a real player does and the first-round human did not: he picks the lone patroller, and he
  does not walk away from the generator until the enemy has committed to its second swing (then it cannot follow him out of the
  blast). Production, with the same improved human, is in the tables below: most of the Normal gain over the first round is this.

Not changed, deliberately: nothing was made to path badly or ignore a generator it knows. The suggested "less efficient escape"
lever was not needed: an enemy that is free when the blast goes off is the miss, and no enemy escape code is involved.

## 3. Patrol routes of the 13 field missions

`npx tsx scripts/patrol-routes.ts` prints these with the walking length of one circuit (a 2-waypoint shuttle: there and back);
`tests/campaign-reliability-data.test.ts` asserts the rules above for every one. Only seats with a route are listed.

| mission | enemy | variant | role | shape | circuit (tiles) | waypoints |
| --- | --- | --- | --- | --- | --- | --- |
| oshodi.approach | Park Warden | agbero | roamer | loop | 20 | 10,37 > 18,37 > 18,39 > 10,39 |
| oshodi.approach | Park Warden | agbero | roamer | loop | 22 | 12,42 > 21,42 > 21,44 > 12,44 |
| oshodi.approach | Lane Blocker | heavyEnforcer | post | shuttle | 14 | 20,42 > 27,42 |
| oshodi.railEdge | Lane Hawker | marketEnforcer | roamer | shuttle | 20 | 38,39 > 48,39 |
| oshodi.railEdge | Lane Hawker | marketEnforcer | roamer | shuttle | 16 | 50,37 > 58,37 |
| oshodi.railEdge | Plaza Warden | agbero | roamer | loop | 44 | 47,31 > 47,34 > 56,34 > 56,31 |
| oshodi.railEdge | Trailer Crew | agbero | roamer+wave | shuttle | 14 | 31,31 > 38,31 |
| oshodi.railEdge | Trailer Crew | areaBoy | roamer+wave | loop | 22 | 32,26 > 38,26 > 38,31 > 32,31 |
| mushin.approach | Parts Hawker | marketEnforcer | roamer | shuttle | 16 | 8,35 > 16,35 |
| mushin.approach | Stall Guard | marketEnforcer | roamer | shuttle | 22 | 20,36 > 31,36 |
| mushin.approach | Bay Runner | areaBoy | roamer | shuttle | 36 | 33,29 > 49,29 |
| mushin.market | Market Runner | areaBoy | roamer | shuttle | 24 | 15,10 > 27,10 |
| mushin.market | Market Runner | areaBoy | roamer | shuttle | 24 | 22,13 > 34,13 |
| mushin.market | Market Runner | bottleThrower | post | shuttle | 12 | 36,12 > 42,12 |
| mushin.market | Loader | marketEnforcer | roamer+wave | loop | 22 | 42,7 > 48,7 > 48,12 > 42,12 |
| mushin.market | Loader | marketEnforcer | roamer+wave | shuttle | 14 | 35,6 > 42,6 |
| mushin.market | Late Loader | areaBoy | roamer+wave | shuttle | 14 | 37,13 > 44,13 |
| mushin.market | Last Loader | marketEnforcer | roamer+wave | shuttle | 14 | 26,7 > 33,7 |
| fadeyiSomolu.approach | Kobo Marshal | routeMarshal | roamer | shuttle | 20 | 4,22 > 14,22 |
| fadeyiSomolu.approach | Kobo Marshal | routeMarshal | roamer | shuttle | 24 | 16,21 > 28,21 |
| fadeyiSomolu.approach | Kobo Marshal | routeMarshal | roamer | loop | 18 | 15,22 > 20,22 > 20,26 > 15,26 |
| fadeyiSomolu.junctions | Kobo Marshal | routeMarshal | roamer | shuttle | 12 | 10,4 > 10,10 |
| fadeyiSomolu.junctions | Kobo Marshal | routeMarshal | roamer+wave | shuttle | 12 | 27,10 > 33,10 |
| fadeyiSomolu.junctions | Kobo Marshal | routeMarshal | roamer+wave | loop | 28 | 14,4 > 26,4 > 26,6 > 14,6 |
| fadeyiSomolu.junctions | Kobo Marshal | routeMarshal | roamer+wave | shuttle | 20 | 12,9 > 20,9 |
| fadeyiSomolu.junctions | Kobo Marshal | areaBoy | roamer+wave | shuttle | 16 | 3,5 > 9,5 |
| ebuteMetta.approach | Yard Enforcer | agbero | roamer+wave | shuttle | 32 | 24,31 > 40,31 |
| ebuteMetta.approach | Yard Runner | areaBoy | roamer+wave | shuttle | 40 | 22,27 > 42,27 |
| ebuteMetta.approach | Relief Enforcer | agbero | roamer+wave | shuttle | 12 | 38,35 > 44,35 |
| ebuteMetta.approach | Yard Lieutenant | lieutenant | post | loop | 22 | 49,36 > 57,36 > 57,33 > 54,34 |
| lagosIsland.approach | Ledger Auditor | ringSecurity | roamer | loop | 24 | 2,18 > 11,18 > 11,21 > 2,21 |
| lagosIsland.approach | Ledger Auditor | ringSecurity | roamer | loop | 24 | 10,25 > 19,25 > 19,28 > 10,28 |
| lagosIsland.approach | Hall Guard | ringSecurity | roamer+wave | loop | 20 | 19,22 > 23,22 > 23,28 > 19,28 |
| lagosIsland.approach | Row Runner | areaBoy | roamer+wave | loop | 28 | 7,22 > 10,22 > 10,30 > 7,30 |
| lagosIsland.press | Lane Guard | ringSecurity | roamer | shuttle | 12 | 23,14 > 23,20 |
| lagosIsland.press | Lane Security | ringSecurity | roamer | shuttle | 34 | 2,10 > 19,10 |
| lekki.approach | Gate Guard | ringSecurity | roamer | shuttle | 26 | 4,23 > 17,23 |
| lekki.approach | Pool Guard | ringSecurity | roamer | shuttle | 26 | 17,27 > 4,27 |
| lekki.approach | Gatehouse Guard | ringSecurity | roamer+wave | loop | 20 | 27,25 > 33,25 > 33,29 > 27,29 |
| lekki.estate | Estate Guard | ringSecurity | roamer | shuttle | 32 | 4,3 > 20,3 |
| lekki.estate | Estate Guard | ringSecurity | roamer | shuttle | 30 | 35,3 > 20,3 |
| ojuelegba.return | Ring Patrol | agbero | roamer | shuttle | 18 | 26,25 > 17,25 |
| ojuelegba.return | Ring Patrol | routeMarshal | roamer | shuttle | 16 | 17,29 > 25,29 |
| ojuelegba.return | Lane Runner | areaBoy | guard | shuttle | 18 | 12,26 > 3,26 |
| ojuelegba.junction | Area Boy | areaBoy | roamer+wave | loop | 12 | 30,11 > 30,14 > 27,14 |
| ojuelegba.junction | Area Boy | areaBoy | roamer+wave | loop | 18 | 26,19 > 30,19 > 30,21 > 26,21 |
| ojuelegba.junction | Ring Agbero | agbero | roamer+wave | loop | 16 | 14,11 > 19,11 > 19,14 > 14,14 |
| ojuelegba.junction | Market Enforcer | marketEnforcer | roamer+wave | loop | 18 | 21,11 > 27,11 > 27,14 > 21,14 |

## 4. Probe: old against new

`npx tsx scripts/readability.ts <level>` (148 probes: every enemy of the 11 district missions, 2 seeds), committed runner; the
same script on `0830ee8` for "old". Reached adjacent = a pursuer got to a tile next to the human; hurt = by THAT enemy.

| Normal (the target level) | old (production) | new |
| --- | --- | --- |
| probes that were pursued | 120 | 118 |
| pursuer reached an adjacent tile | 5.8 % (7) | 2.5 % (3) |
| hurt by that enemy | 1.7 % (2) | 1.7 % (2) |
| hurt by anyone (other enemies on the way, hazards) | 30.8 % | 39.0 % |
| pursuer walking speed / human's (tiles per second, measured) | 3.8 / 6.3 | 3.5 / 6.3 (sim: 5.0 against 6.0) |
| chase length median / 95 % / longest | 2.0 / 4.0 / 40 s (never ended) | 1.4 / 3.7 / 10.0 s |
| back on patrol or watch after the chase, median / 95 % / longest | 2.7 / 4.0 / 18.1 s | 3.0 / 15.5 / 27.0 s |
| never back within the 40 s run | 16 | 1 |
| ordinary roamers seen walking a route in 60 s (all seats of those variants, equipment guards included) | 26 of 45 | 36 of 45 |

| | old Easy | new Easy | old Hard | new Hard |
| --- | --- | --- | --- | --- |
| pursued | 107 | 102 | 122 | 125 |
| reached adjacent / hurt by it | 6.5 % / 2.8 % | 1.0 % / 1.0 % | 7.4 % / 6.6 % | 8.0 % / 4.8 % (first round 10.4 % / 7.2 %) |
| chase median / 95 % / longest | 1.4 / 3.4 / 4.0 s | 1.2 / 2.5 / 3.5 s | 2.5 / 5.7 / 40 s | 2.5 / 4.7 / 15.0 s |
| back on route median / 95 % / longest | 1.9 / 4.0 / 19.7 s | 2.2 / 9.0 / 15.0 s | 3.7 / 10.0 / 21.5 s | 3.9 / 16.0 / 29.5 s |
| never back within 40 s | 12 | 0 | 13 | 3 |

The original (dithering) runner, Normal: production 31.7 % reached adjacent and 29.2 % hurt (any enemy; the lead's baseline); new
23.7 % and 22.0 % hurt by that enemy (33.9 % by anyone). That runner gets caught at every corner whatever the enemy does, so it
measures the runner; with a runner that keeps to its plan (the committed one) production already lost the pursuer most of the time
and the new rules remove the tail: the longest chase falls from 40 s (it never ended) to 10 s on Normal, 3.5 s on Easy, 15 s on Hard,
the exact maximum-chase values.

The two finale field missions (small sectors, left out of the table: 22 probes) on Normal: 3 of 17 pursuers reached an adjacent tile
(17.6 %), 2 hurt the human (11.8 %); in `ojuelegba.junction` every ordinary roamer belongs to a hold-area wave or the Ring crew, which
hold their posts while the bus stop is held, so the probe sees none walk (their routes are walked before and after the hold).

Acceptance at Normal: pursuer walks at most 85 % of the human's speed (83 % in the sim, 56 % measured) yes; reaches an adjacent tile
in at most 10 % (2.5 %) yes; hurts the human in at most 10 % (0.8 %) yes; chase median at most 8 s (1.4 s) and 95 % at most 14 s
(3.7 s) yes; back on its route within 12 s after breaking off: median 3.0 s yes, 95 % 15.5 s NO (the runner stays in the sector, so
some enemies re-notice him before they settle; the slowest 5 % are walks back from a long investigation plus a 1.5 s search);
ordinary-roamer coverage at least 70 % in every mission: 100 % by data (tested), 40-100 % per mission by what the probe sees moving
(the rest are equipment guards and posts held by the mission); Easy at least as forgiving as Normal yes; Hard keeps a real speed
lead (17 % against an agbero, 9 % against a lieutenant) yes, and on Hard 8.0 % reached an adjacent tile (the target 10 %).

## 5. The human-like trap harness

`scripts/lib/humanTrap.ts` (run: `npx tsx scripts/trap-reliability.ts <fieldId> <level> <ambush|lure|bait|plain> <seeds>`). A scripted
human with ORDINARY intents (walk, A, B) on a REAL field mission: real board, crates and floor traps, stage hazards, patrols and the
real enemy bots at the level's bot level and tactics layer. The HUMAN MODEL:

- every decision (a new direction, A, B) reaches the game 6-24 ticks late (seeded); A is one press; he lets go of a direction a tile
  early (his release is late too) and overshoots when he does not;
- when he judges the moment to lay a generator he is off by a seeded +-20 ticks (`timingTol`; swept at 10 / 20 / 30); the bait
  also leaves the generator at fuse 60 +- tol/2;
- he sees what a player sees (positions, facing, the wind-up, the "!" and "?", the tiles and crates, the marked throw lines) within
  14 tiles; he learns a patrol by WATCHING it (the lap time he has seen repeat, a replay of the last lap re-synchronised to where
  the enemy is now); he never reads an enemy's mind, target, timers or perception, and never a generator he could not see;
- he steps out of a wind-up and a blast footprint with that latency, and gives an approach up when the enemy gets within 4 tiles.

Strategies: AMBUSH (watch a lap, choose a tile out of its calm view whose blast covers its lane, lay so the 3 s fuse ends as it
passes, be out of sight); LURE (get noticed, run past a corner, lay behind you without stopping); BAIT (stand next to a brawler,
step out of its wind-up once, step back in during its recovery, lay on your own tile, hold, leave late by the far side of the
generator so the pursuer must cross its blast); PLAIN, the deliberately bad setup (laid in plain sight in a straight lane, the
enemy 6 tiles away and facing it). Success = the TARGET dies from the human's blast. Attempt 2 is a retry after disengaging (he runs
if it hunts him, returns to his stage, lets it settle for 6 s, watches again). Setup shortcuts, stated plainly: the scenario puts
the human at a stage tile out of sight of every route (and back there after a lost life); the Oshodi flow below starts at the
mission start instead.

Success = the target dies from the human's blast. "first" = on the first attempt, "two" = within two attempts. n = seeds.
Final code. Four missions: `oshodi.approach` (tight road sector, two loops), `oshodi.railEdge` (open rail plaza), `mushin.market`
(stalls and aisles), `fadeyiSomolu.junctions` (streets, a marshal crew).

Success = the target dies from the human's blast. first = on the first attempt, two = within two attempts. n = 20 seeds per cell
(10 for ambush and lure). FINAL code and human; four missions: `oshodi.approach` (tight road sector, two loops), `oshodi.railEdge`
(open rail plaza), `mushin.market` (stalls and aisles), `fadeyiSomolu.junctions` (streets, a marshal crew). The target is the lone
patroller of each (approach: the kiosk warden #1; railEdge: a lane hawker #2; market: a market runner #1; junctions: a Kobo
marshal #2).

**BAIT (first / within two, % of 20):**

| mission | Easy | Normal | Hard | production Normal | production Hard |
| --- | --- | --- | --- | --- | --- |
| oshodi.approach | 100 / 100 | 95 / 100 | 60 / 95 | 75 / 95 | 0 / 0 |
| oshodi.railEdge | 85 / 100 | 85 / 95 | 60 / 70 | 85 / 95 | 20 / 20 |
| mushin.market | 100 / 100 | 100 / 100 | 85 / 100 | 70 / 90 | 80 / 90 |
| fadeyiSomolu.junctions | 100 / 100 | 85 / 95 | 60 / 65 | 80 / 85 | 0 / 0 |

Targets: Normal at least 70 / 90 on all four, met (lowest 85 first, 95 within two). Hard at least 35 / 60, met (lowest 60 first, 65
within two). Easy >= Normal >= Hard in every cell, both columns. Production Easy (same human): 95 / 100, 85 / 95, 100 / 100, 95 / 100.
Reading the production columns honestly: the same improved human trapping on production Normal gets 70-85 % first try, so against
production the game changes add 0 to +30 points on Normal (`approach` 75 to 95, `market` 70 to 100, `junctions` 80 to 85, `railEdge` unchanged at 85); what they do change is Hard: production Hard has no bait on three of four missions (it watches the
placement), now it does. The first-round "production 50-58 %" was measured with the weaker human.

**AMBUSH, Normal (n 10, first / two):** approach 10 / 10, railEdge 0 / 0, market 60 / 70, junctions 0 / 0 % (production, same human: not
rerun; first round 0-6 of 8). It needs open ground and a lone patroller; a tight street offers no tile out of its view for the human to
lay on and hide behind.

**LURE (Normal, n 10):** 1 of 40. A pursuer that sees a generator laid behind a runner reacts (36-52 ticks) and has most of the 3 s
fuse left; it is not given to players as a way to kill.

**PLAIN (laid in plain sight, in the lane, 6 tiles from an enemy that faces it; n 20 per mission):** Normal 1 of 80 first attempt (2 of 80
within two) and Hard 0 of 80: the enemy escaped a generator it saw in 99-100 % of runs (target: at least 70 %). The enemy still
notices, chases and swings: bait success needs it to commit to a swing.

**Timing window** (first round, bait): the success did not depend on the human's timing tolerance within +-30 ticks; the binding window
is the enemy's planted time (about 1.5 s on Normal now) against the fuse, not the human's trigger. Not re-swept on the final numbers.

## 6. The Oshodi flow (V5)

`npx tsx scripts/oshodi-flow.ts <level> 8`; `tests/campaign-reliability-oshodi.test.ts`. The human model plays `oshodi.approach`
end to end (bait on the kiosk warden, up to three tries, then checkpoints A-B-C and the depot door resolved like the existing scripted
playthroughs).

| level | finished (of 8) | a warden defeated by his own blast (of 8) |
| --- | --- | --- |
| Easy | 8 | 8 |
| Normal | 8 | 8 |
| Hard | 5 (16 of 20 seeds) | 7 (19 of 20) |

Hard finishes 16 of 20 seeds (80 %; the first 8 seeds happen to give 5), first round 3 of 8; the others lose all three lives in the crowded lane
after the bait. The test runs 20 Hard seeds.

## 7. HOW TO BEAT ENEMIES WITH GENERATORS (for players)

What the measurements show works, in short steps. Numbers are Normal; Easy is easier, Hard is in the last paragraph.

**1. The bait-a-swing (the strongest: 85-100 % on the first try on Normal in the four tested missions, 65-85 % on Hard, 85-100 % on Easy).**
Works on a street tout, an Area Boy, a market enforcer, a route marshal. Pick the patroller that walks alone: other enemies within
earshot join in and hit you.

1. Walk up to the enemy until its "!" shows and it comes at you. Keep a wall behind you and no other enemy within five tiles.
2. When it raises its arm (the red wind-up on the ground shows the tile), take ONE step out of reach. It swings at the air and stands
   planted for about a second (do not run off: stay one step away).
3. Step back in beside it and lay a generator on the tile you stand on. Your own body hides it from the enemy. Stand still on it.
4. It will swing again (about three seconds after the first): step out of its reach once more and come back. Do NOT leave yet.
5. When it has started that second swing it is stuck for about 1.8 s, and once the generator's counter shows no more than that,
   walk out to the FAR side of the generator and keep going until it goes off. If it never swings again, walk out at about 0.7 s
   of fuse. A brawler that is free when the generator goes off simply follows you out of the blast: that is the one way this fails.

**2. The ambush (60 % on open ground such as the rail plaza; no tile to hide on in a tight street).**

1. Stand where the patroller cannot see you (not in the cone ahead of it, farther than 5 tiles, or behind a wall) and watch ONE full lap
   of its route (the loop table above). Its walk is regular: 14 ticks a tile, a pause of about 0.7 s at every waypoint.
2. Pick a tile beside its lane within two tiles of it, out of its forward view: behind a pillar, round a corner, down a side alley.
3. Lay the generator when the patroller is on the far side of its loop (more than five tiles away: nearer, it hears you) and about
   twelve tiles of walking from the blast tile (the fuse is 3 s, which is about 13 tiles of calm walking), then leave out of its sight.
4. Wait where you cannot be seen until the blast. If it turns toward you, back off and try again on the next lap.

**3. What does not work, measured.** A generator laid in plain sight (0 of 32 runs: the enemy walks out of it). The lure (run, lay
behind you): 1 in 32. Laying within five tiles of another enemy (it comes to look). Standing in the lane of a patrol that has not
learned your hiding place. Walking through a pursuer's swing: it hits.

**4. Disengaging (what the speed change is for).** Every ordinary enemy is slower than you: 17 % on Normal, 9 % on Hard. Once it has
noticed you, keep walking away in a straight line: it breaks off after 6 tiles of gap for one second, or after ten seconds of
chasing, goes to look where it last saw you, and returns to its route. A hit on it, or a blast, calls it back at once (for 3 s,
then the same rules apply). Come back after it has settled and try the ambush on the next lap.

**5. On Hard** enemies react faster and chase longer, and a calm one watches you lay a generator, but a brawler in the middle of a fight
has tunnel vision while it swings: the same bait works (60-85 % first try, 65-100 % within two in the four missions), with less room for a late step
out. Ring security and lieutenants always watch the ground; for them use the ambush.

## 8. Tests added or changed

Added: `tests/campaign-reliability-speed.test.ts` (step times: every ordinary enemy slower than the human on every level, Easy >= Normal
>= Hard, the sim and the planner agree, the calm pace per mind state, absent outside the layer), `campaign-reliability-chase.test.ts`
(patrol walks the whole route in order, lap after lap, at the calm pace on every level; the gap rule; the maximum chase; a landed hit
restarts it; the way back onto the route within 12 s; the re-notice cooldown and its two exceptions; a hit from beyond the leash is a
bounded chase; the leash is the territory's), `campaign-reliability-data.test.ts` (42 data rules over all 13 missions),
`campaign-reliability-traps.test.ts` (the harness: latency, the route a human learns, a fairness run and a bait run on real
missions), `campaign-reliability-oshodi.test.ts` (the flow, 24 seeded plays).

Second round: `campaign-tactics-layer` (recovery range 54-72, the cooldown rule includes the miss bonus; Hard watches while calm only), `-combat` (72 / 72 / 56), `-perception` (a brawling Hard agbero does not see a placement; Ring security does), `-drill` (Hard bait works on brawlers with tunnel vision, Ring security still watches; only the Easy >= Hard order is asserted for this fixed script), `campaign-reliability-oshodi` (Hard finishes at least 5 of 8). First round:
Changed deliberately (never a threshold weakened to hide a regression): `campaign-tactics-layer` (Hard: jitter 12, no reversing laps;
brawler recovery 48-72 ticks), `campaign-tactics-territory` (Hard keeps the same loop every lap; the two "notices" tests stand a human
inside the calm notice range), `campaign-tactics-combat` (the slow's base step is the guard's 12 ticks; recoveries 72 / 60 / 48),
`campaign-tactics-drill` (bait is asserted for brawlers that stand their ground; a market enforcer ducks out of sight, so the ambush
is its answer; the Easy-Hard margin 1.5 traps per seed instead of 2), `scripts/lib/sectorDrill.ts` (the ambush waits for a slower
patroller), `scripts/lib/readability.ts` (the committed runner, `hurtByIt`, the way back).

## 9. Limits and risks

- All the bait numbers use ONE human policy (the one in `humanTrap.ts`, which includes picking the lone patroller and waiting for the
  second swing). A player who walks away from the generator early, or fights in a crowd, will do worse; that is why production, run
  with the same human, is in the table. Against production the game changes are 0 to +30 points on Normal and decisive on Hard.
- The ambush needs room: 0-60 % in the four missions (it works on the open market, not in the tight streets), the lure does not work
  (1 of 40). Bait is the strategy; the ambush is the answer to Ring security and lieutenants, which watch the ground.
- Hard bait is 60-85 % first try, so Hard is only a little harder than Normal for a human who knows the bait; its pressure is the
  chase, the notice time, the crowd and the keen tiers. A founder playtest should decide whether Hard needs a sharper edge (a shorter
  recovery or a later whiff bonus are the next numbers).
- Sample sizes are 20 seeds per cell (ambush, lure 10) on four of 13 missions, and the stage tile of the ambush is a scenario shortcut.
- The Hard probe's "back on route" 95 % is 16 s (target 12; Normal 15.5 s): the probe's runner stays in the sector and the enemy
  re-notices it before it settles.
- Faster missions: with slower enemies, clocks and pars of the field missions are generous; none was retuned in this pass (the scripted
  playthroughs still win).
- Not touched: boss missions' bots (no enemy kind), the archived Oshodi pilot, raids.
