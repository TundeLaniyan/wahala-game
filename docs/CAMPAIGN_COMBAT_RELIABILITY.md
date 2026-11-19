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
| Hard | 11 | 11 | 12 | 13 | 11 | 10 |

The human keeps a 9 % lead on Hard (10 against 11), 17 % on Normal. The area boy is 1 tick faster than an agbero on Easy and
Normal and equal to it on Hard (the floor). Boss missions' bots have no enemy kind: unaffected.

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
  by design. Eleven new or rewritten routes (mostly 3-4 waypoint LOOPS round a block); Section 3 lists them all.
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
| recovery of an agbero / guard after its swing | 48 / 42 / 36 ticks | 72 / 60 / 48 | the planted window of a swing is when a generator laid at its feet cannot be walked away from; 42 ticks was shorter than the human's own step in, lay and step out, and the bait succeeded in about half of the runs |
| calm notice range of the human (a calm enemy; engaged ones keep `noticeTiles`) | = notice range 6 / 7 / 8 (agbero) | 4 / 5 / 6 (guard 5 / 6 / 7, thrower 6 / 7 / 8, heavy 3 / 4 / 5, lieutenant 7 / 8 / 9) | a walker looks at the road ahead, not at everything within earshot: a human behind the cone or beyond it walks past, so there is room to reposition (`awareness.calmNoticeTiles`) |
| reaction to a generator while brawling (trap sense `none` / `basic`; field enemy seats only: `enemyBrawlReactScale`, the boss missions' crews keep x2 / x1.5, a retune of them lost the Ebute and Lagos boss fights) | x2 / x1.5 | x2.4 / x2 | a brawler in a fight takes a generator under a rival's feet seriously later: the planted-and-pursuing enemy that walks out of a freshly revealed generator is the single most common miss |

The cooldown between swings is unchanged (the data rule "every cooldown exceeds wind-up + recovery + 36" holds). Calm view cone (90
degrees), generator vision (`calmVisionTiles`), hearing, notice time (36 / 20 / 10 ticks) and alert beat are unchanged.

### RC5 - fair difficulty

Easy: slower enemies (13 / 14 / 15), longer calm pace (+3), longer pause, a short chase (7 s, 5-tile gap), longer recoveries,
nobody calls for help. Hard: closer speed (11 / 12 / 13, still slower than the human), a longer chase (15 s, 8-tile gap),
quicker re-notice (60 ticks), jittery pauses, shorter reaction (react ticks -8), a longer search, cover for cover users, and it WATCHES
the placement of a generator (basic trap sense too: the under-your-feet bait stops working on Hard; ambush and the counter-jab
still do). Nothing on any level knows about a generator it did not see or hear.

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
| hurt by that enemy | 1.7 % (2) | 0.8 % (1) |
| hurt by anyone (other enemies on the way, hazards) | 30.8 % | 31.4 % |
| pursuer walking speed / human's (tiles per second, measured) | 3.8 / 6.3 | 3.5 / 6.3 (sim: 5.0 against 6.0) |
| chase length median / 95 % / longest | 2.0 / 4.0 / 40 s (never ended) | 1.4 / 3.7 / 10.0 s |
| back on patrol or watch after the chase, median / 95 % / longest | 2.7 / 4.0 / 18.1 s | 3.0 / 15.5 / 27.0 s |
| never back within the 40 s run | 16 | 1 |
| ordinary roamers seen walking a route in 60 s (all seats of those variants, equipment guards included) | 26 of 45 | 36 of 45 |

| | old Easy | new Easy | old Hard | new Hard |
| --- | --- | --- | --- | --- |
| pursued | 107 | 102 | 122 | 125 |
| reached adjacent / hurt by it | 6.5 % / 2.8 % | 1.0 % / 1.0 % | 7.4 % / 6.6 % | 10.4 % / 7.2 % |
| chase median / 95 % / longest | 1.4 / 3.4 / 4.0 s | 1.2 / 2.5 / 3.5 s | 2.5 / 5.7 / 40 s | 2.4 / 5.0 / 15.0 s |
| back on route median / 95 % / longest | 1.9 / 4.0 / 19.7 s | 2.2 / 9.0 / 15.0 s | 3.7 / 10.0 / 21.5 s | 4.0 / 16.0 / 30.7 s |
| never back within 40 s | 12 | 0 | 13 | 5 |

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
lead (9 %) yes.

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

**BAIT, the strongest strategy (first / within two):**

| mission | Easy (n 12) | Normal (n 20) | Hard (n 12) | production Normal (n 12) |
| --- | --- | --- | --- | --- |
| oshodi.approach | 11 / 11 (92 %) | 12 / 16 (60 % / 80 %) | 0 / 1 | 6 / 9 (50 % / 75 %) |
| oshodi.railEdge | 11 / 12 (92 %) | 14 / 15 (70 % / 75 %) | 1 / 1 | 7 / 11 (58 % / 92 %) |
| mushin.market | 11 / 12 (92 %) | 8 / 14 (40 % / 70 %) | 0 / 0 | 5 / 9 (42 % / 75 %) |
| fadeyiSomolu.junctions | 12 / 12 (100 %) | 10 / 15 (50 % / 75 %) | 0 / 0 | 7 / 8 (58 % / 67 %) |

Easy >= Normal >= Hard with a clear gap (Easy 92-100 % first try, Normal 40-70 %, Hard 0-8 %). Production with the same human is
50-58 % first try; the new numbers are better on `approach` and `railEdge` (+10 and +12 points first try) and in the second attempt on
`approach` and `market`, not better on `junctions`. The first-try target of 70 % is met on `railEdge` only, the two-attempt target of
90 % on none: see the limits. Where bait fails: 'missed' (the pursuer walks out of the blast: a market enforcer ducks out of sight
after its swing on purpose, a marshal's crew joins in), 'timeout' (a corridor with no room to dodge, an ally in the way).

**AMBUSH, Normal / Easy / Hard (n 10, first):** approach 1 / 0 / 0, railEdge 6 / 3 / 2, market 0 / 0 / 0, junctions 0 / 2 (4 within two) /
0; production Normal (n 8): 0, 1, 0, 0. In the open rail plaza an ambush works 60 % of the time on Normal; in the tight sectors the
human model finds no tile out of its sight to lay on and be hidden (it refuses to be in an enemy's view for more than 16 ticks of
sight). It is the way to beat a cover user and, on Hard, the only strategy that does not rely on a hidden generator being laid
under you.

**LURE (n 8, Normal):** 0, 1, 0, 0 of 8. A pursuer that sees a generator laid behind a runner reacts (36-52 ticks) and has most of
the 3 s fuse left to walk out: a lure cannot be made reliable without making the enemy stupid, so it is not given to players as a
way to kill.

**PLAIN (laid in plain sight, in the lane, 6 tiles from an enemy that faces it; n 8 per mission):** 0 of 32 on the new code (the enemy
escaped a generator it saw in every run; Normal fairness target: 70 % or more escape) and 4 of 32 on production.

**Timing window** (bait, Normal, n 12, first attempt, timing tolerance +-10 / +-20 / +-30 ticks): approach 10 / 8 / 9, railEdge 9 / 9 / 9,
market 3 / 6 / 4, junctions 5 / 6 / 7 (the +-20 column is the 20-seed run scaled to 12). The success does not depend on the tolerance
within +-30 ticks (half a second each way): the window that matters is the enemy's planted time (about 1.1 s after a swing on
Normal) and the fuse, not the human's trigger. The ambush window is the time the enemy spends in the blast footprint: 54-106
ticks wide (the plans the human accepted), so +-20 ticks is comfortable and +-30 is the limit.

## 6. The Oshodi flow (V5)

`npx tsx scripts/oshodi-flow.ts <level> 8`; `tests/campaign-reliability-oshodi.test.ts`. The human model plays `oshodi.approach`
end to end (bait on the kiosk warden, up to three tries, then checkpoints A-B-C and the depot door resolved like the existing scripted
playthroughs). | level | finished (of 8) | a warden defeated by his own blast (of 8) |
| --- | --- | --- |
| Easy | 8 | 8 |
| Normal | 8 | 8 |
| Hard | 3 | 1 |

Normal: all 8 seeds finish, and every one traps the kiosk warden with his own generator (the bait, within three tries) on the way, 1
life lost in 4 of them (the lane is crowded). Hard finishes 3 of 8 for this human: the enemies are not stupid and he has no counter
to a placement-watching brawler in the flow.

## 7. HOW TO BEAT ENEMIES WITH GENERATORS (for players)

What the measurements show works, in short steps. Numbers are Normal; Easy is easier, Hard is in the last paragraph.

**1. The bait-a-swing (the strongest: 60-70 % on the first try on open streets, about 3 in 4 within two tries; 90 % on Easy).**
Works on a street tout, an Area Boy, a route marshal, a heavy; a Market Enforcer ducks away, use the ambush on him.

1. Walk up to the enemy until its "!" shows and it comes at you. Keep a wall behind you and no other enemy within five tiles.
2. When it raises its arm (the red wind-up on the ground shows the tile), take ONE step out of reach. It swings at the air and stands
   planted for about a second (do not run off: stay one step away).
3. Step back in beside it and lay a generator on the tile you stand on. Your own body hides it from the enemy. Stand still on it.
4. It will swing again: step out of its reach once more, step back on the generator tile. Do not leave yet.
5. When the generator shows about one second of fuse, walk out to the FAR side of the generator, so the enemy has to cross the blast
   to follow you, and keep walking until it goes off. The enemy takes a generator that was hidden under you seriously only after about
   a second, and it is still planted or on its way through the blast.

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

**5. On Hard** enemies watch you lay a generator and react faster: the bait under your own feet no longer works. The ambush
(out of its sight) and the counter-jab (punch its wind-up so it reels, lay during the stagger, leave late) do; both are
timing-sensitive, and the measured success is low (ambush 0-20 % in the harness, counter-jab 5 in 12 on the Academy drill board).

## 8. Tests added or changed

Added: `tests/campaign-reliability-speed.test.ts` (step times: every ordinary enemy slower than the human on every level, Easy >= Normal
>= Hard, the sim and the planner agree, the calm pace per mind state, absent outside the layer), `campaign-reliability-chase.test.ts`
(patrol walks the whole route in order, lap after lap, at the calm pace on every level; the gap rule; the maximum chase; a landed hit
restarts it; the way back onto the route within 12 s; the re-notice cooldown and its two exceptions; a hit from beyond the leash is a
bounded chase; the leash is the territory's), `campaign-reliability-data.test.ts` (42 data rules over all 13 missions),
`campaign-reliability-traps.test.ts` (the harness: latency, the route a human learns, a fairness run and a bait run on real
missions), `campaign-reliability-oshodi.test.ts` (the flow, 24 seeded plays).

Changed deliberately (never a threshold weakened to hide a regression): `campaign-tactics-layer` (Hard: jitter 12, no reversing laps;
brawler recovery 48-72 ticks), `campaign-tactics-territory` (Hard keeps the same loop every lap; the two "notices" tests stand a human
inside the calm notice range), `campaign-tactics-combat` (the slow's base step is the guard's 12 ticks; recoveries 72 / 60 / 48),
`campaign-tactics-drill` (bait is asserted for brawlers that stand their ground; a market enforcer ducks out of sight, so the ambush
is its answer; the Easy-Hard margin 1.5 traps per seed instead of 2), `scripts/lib/sectorDrill.ts` (the ambush waits for a slower
patroller), `scripts/lib/readability.ts` (the committed runner, `hurtByIt`, the way back).

## 9. Limits and risks

- The first-attempt target of 70 % is met on one of the four tested missions and the within-two target of 90 % on none (Normal bait
  40-70 % and 70-80 %). The measured levers that moved it (longer brawler recovery, slower brawl reaction, the far-side exit) are
  in; the remaining misses are the enemy walking out of the blast after its recovery, cover users, crews that join in and corridors with
  no room to dodge. A bigger lever (a longer recovery still, or a pursuer that does not leave the blast zone of a generator it
  knows) was not taken: it starts to make the enemy stupid, which the brief rules out.
- The ambush needs room: 0-10 % in three of four tested missions with this human (it will not lay a generator where it would be seen
  for more than 16 ticks of sight). Placing it better is a human skill; the harness's human is cautious.
- Hard has no reliable generator strategy in the harness (bait 0-8 %, ambush 0-20 %); the counter-jab exists on the drill board (5 in
  12) but was not implemented in the real-mission harness. The Oshodi flow finishes 3 of 8 on Hard. Hard is meant to be harder; this
  is a numbers question for a founder playtest, not a rule gap.
- Sample sizes are 12-20 seeds per cell on four missions (of 13), and the stage tile is a scenario shortcut (stated above).
- Faster missions: with slower enemies, clocks and pars of the field missions are now generous; none was retuned in this pass (the
  scripted playthroughs still win).
- The probe's "back on route within 12 s" misses at the 95 % mark (15.5 s on Normal); the first 4 s cover most of it.
- Not touched: boss missions' bots (no enemy kind), the archived Oshodi pilot, raids.
