# Boss balance: the Oshodi boss mission (decisions BB1-BB7)

Branch `claude/wahala-boss-sim`, from production `b6b2367`. Scope: the SIMULATION and AI of the campaign boss mission
`startMission('oshodi')` (Oga Sunmola, the dispatch relays in the dispatch corridor). Presentation (health bar, telegraph
art, defeat animation) is another worker's; what it needs from the sim is listed at the end.

The founder played the real mission on Easy and Normal and found both excessively difficult. This document is the audit
(what the fight actually is, measured), the corrections per level, and the before / after measurements.

## How it was measured

`npm run boss-measure` (`scripts/boss-measure.ts`) plays the REAL mission exactly as `CampaignController.startMission`
builds it (`buildMissionGame`: a fresh save's Rookie crew, the Standard boss floor, the campaign level's health and
tactics layers, three lives, stage hazards and convoys on, crates on, the real boss and crew bots), end to end, with a
scripted player held to a person's limits (`scripts/lib/bossHuman.ts`):

- it sees only what the screen shows: generators, enemies, warnings and hazards within 11 x 7 tiles of itself (the
  follow camera), plus the HUD (the relays, the boss's shield / window / "RESTORING", the anchor ring); never the RNG or
  a bot's plan;
- a new generator / warning / hazard counts only after a reaction time; it decides a few times a second and between
  decisions keeps walking the route it chose, whatever happens;
- it lays a generator only where the target is in its blast and it can walk out (and out of every danger it knows)
  before the fuse, with a margin; it waits for "RESTORING" before going in on the boss; it punches an adjacent enemy only
  from a tile that stays clear for the punch's recovery.

Two players: **fair** (0.3 s to read a cue, 6 decisions a second, 0.5 s of fuse to spare) and **slow** (0.4 s, 4 a
second, 0.75 s). Eight seeds per cell (101, 118, ... 220). The "before" column is the same harness on an untouched copy
of `b6b2367`.

Honest limits: the script never panics, misreads a fuse (it reads the drawn fuse exactly, minus its margin), fumbles a
direction or forgets a generator it saw, and it plans escapes with a breadth-first search a person does by eye. It is
therefore MUCH better at surviving than a person; it is a measuring stick for what costs lives and time, not a model of
the founder. Most of its lost health is its own blast (a 21-tile radial disc in a narrow corridor) when an enemy boxes it
in: the same situation a person meets more often.

## Audit (production `b6b2367`)

| Item | Measured / read from the code |
| --- | --- |
| Boss health | 3 hits, at most one per exposure window, each window opened by breaking a phase (jam 2 of 3, 3 of 4, then all 4 relays inside 40 s). A blast takes exactly one hit. |
| Player health | Easy 5 segments, a blast takes 1; Normal 4, a blast takes 2; Hard 3, a blast takes 2. 3 lives. Recovery 1.5 / 1 / 0.75 s. The player's own blast hurts him. |
| Exposure | 26 / 20 / 15 s, plus up to 12 s while he walks to his post; he is rooted there (damageable "RESTORING") about 22-29 s per fight. Windows missed: 0-0.4 per fight. |
| Speed | Boss 10 ticks a tile, as fast as the player (crew the same: generator bots). |
| **Where the shielded boss is** | He left his booth about 1 s after the countdown in every run, on every level, and hunted the player along the corridor while invulnerable: 23-38 s of every fight more than 5 tiles from his post (seed 118: from (27, 12) to (8, 16) by 8 s). The guard directive's leash was 1 point per tile, weaker than any placement he wanted. |
| **Attack frequency** | 24-35 boss generators per fight, 82-86 % of them within 3 tiles of the player: about one every 3 s of the shielded phases. |
| **Wind-up vs a phone** | The boss's Punch has a 4-tick wind-up (Street Baller's catalogue Punch; the crew: Punch 4, Shove 12, Daze Punch 18). A phone player needs about 15 ticks to read it and up to half a step to start moving: no level left room to step away. The bots use it only to hold a player inside a blast (`ai/skills.ts`: daze him where a blast lands). |
| Dodge by a step | Generators: yes (3 s fuse, footprint drawn). Convoys: yes (2.5-3 s warning, never called unless escapable; 0 damage taken in 96 runs). Punches: no (above). |
| **The window** | The exposed boss kept laying generators (both of his) while he restored: 5-8 a minute of restoring, right where the player has to stand. |
| **Blasts that reached him but did not count** | Of the generators the fair player laid with the exposed boss inside their footprint, only 49 % (Easy), 63 % (Normal), 65 % (Hard) cost him a hit. Two causes: (1) lethality asked `missionBossAbsorbs` about the FIRST hit only; when his own generator's flames were listed first (his generator went off with, or chained, the player's), the player's fire in the same tick was swallowed with it; (2) a crew or boss generator between the player's generator and the boss stops the radial blast wave on its tile, and its own flames are friendly fire, so the player's blast "missed" while visibly blowing up beside him. |
| Generator avoidance / omniscience | Generators: perception-limited (boss vision 9 / 10 / 11 tiles, reaction about 13 / 6 / 5 ticks with the "expert" trap sense; never an unseen generator). Rooted at his anchor it does not matter. Players: the guard engages a player within 5 tiles of his post, then the bot hunts by position with no line of sight (how he found the player 20 tiles away). |
| Crew | 6 Rookie generator bots (variants for trap sense), 3 reinforcements per mission at phase starts, the boss calls 0 / 1 / 2 back per window, escorts body-block on Hard. Damage from crew generators was small (0.1-1.0 segment per fight). |
| Objective pressure | Live relays call a convoy every 10 / 7 / 5 s each (phase 1 / 2 / 3), jams wear off after 25 / 20 / 40 s, runners re-arm a jammed relay in 4 s (phases 2-3). Phase 3 took 17-114 s. Identical on every level. |
| Easy vs Hard | Only the player's health, the window length, the crew calls and escort cover differed. The boss's hunting, his generators, his wind-ups and the objective were the same on Easy as on Hard. |

## Corrections (data in `src/sim/config.ts` `BOSS_BALANCE`, named by Oshodi's recipe)

| # | What | Easy | Normal | Hard |
| --- | --- | --- | --- | --- |
| BB1 | Shielded, the boss never plans a walk or a generator beyond his ground (Manhattan tiles from his post); only an escape crosses it | 3 | 5 | 8 |
| BB2 | Shortest wind-up of any close attack by a boss-mission bot seat (boss and crew), ticks; the bots plan with it | 36 | 30 | 24 |
| BB3 | Generators the boss may have down while exposed at his anchor (his capacity is 2) | 0 | 1 | 2 |
| BB4 | His own fire never swallows the player's in the same tick (lethality asks about a hit that is not his own) | all bosses | all bosses | all bosses |
| BB5 | A crew / boss generator the player's blast sets off beside the exposed boss burns him as the player's fire | yes | yes | yes |
| BB6 | Objective pace x (convoy interval, jam duration, runner re-arm time) | 1.6, 1.5, 2 | 1.25, 1.25, 1.5 | 1, 1, 1 (authored) |

Unchanged on purpose: three hits, the relays and convoys, the anchor and the restore, windows (26 / 20 / 15 s), crew calls
and escort cover, the crew roster, the player's health and lives (campaign-wide, decisions CL), the boss's speed and
perception. Hard keeps the authored objective, the shortest window, the fewest segments, escort cover and two crew
calls; it no longer relies on a 4-tick punch, an invulnerable boss hunting the whole corridor or a hit that disappears.

The other five district bosses and the finale carry no balance (`BossRecipe.balance: null`): their serialised matches
are byte-identical (`tests/raid-ai-isolation.test.ts`), except BB4, which is a correctness fix of the shared rule and
only changes a tick in which the boss's own flames and the player's reach him together.

## Before / after (8 seeds per cell, `npm run boss-measure -- --seeds 8`)

Outcome. Health lost by cause: boss generator / crew generator / convoy / stage / melee / own blast.

| Player | Level | Wins before → after | Mean s | Deaths per fight | Health lost | Lost by cause (after) | Boss hits | Windows missed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fair | Easy | 8/8 → 8/8 | 145 → 83 | 0.3 → 0.1 | 3.0 → 2.3 | 0 / 0.1 / 0 / 0 / 0.3 / 1.9 | 3.0 → 3.0 | 0.3 → 0 |
| fair | Normal | 7/8 → 8/8 | 112 → 106 | 1.5 → 0.6 | 7.0 → 3.9 | 0.5 / 0 / 0 / 0 / 0.1 / 3.3 | 2.9 → 3.0 | 0 → 0 |
| fair | Hard | 5/8 → 8/8 | 118 → 115 | 1.5 → 0.8 | 5.5 → 3.3 | 0.3 / 0 / 0 / 0 / 0 / 3.0 | 2.5 → 3.0 | 0.4 → 0 |
| slow | Easy | 8/8 → 8/8 | 116 → 81 | 0.4 → 0.0 | 3.5 → 0.8 | 0 / 0.1 / 0 / 0 / 0 / 0.6 | 3.0 → 3.0 | 0 → 0 |
| slow | Normal | 7/8 → 8/8 | 136 → 90 | 1.6 → 0.4 | 7.4 → 2.5 | 0.5 / 0.3 / 0 / 0 / 0.3 / 1.5 | 2.9 → 3.0 | 0 → 0 |
| slow | Hard | 8/8 → 8/8 | 111 → 108 | 1.3 → 0.9 | 4.1 → 2.9 | 0.6 / 0 / 0 / 0 / 0.4 / 1.9 | 3.0 → 3.0 | 0.1 → 0 |

Pressure (the audit's items, per fight).

| Player | Level | Shielded boss > 5 tiles from post (s) | Boss generators within 3 of the player / all | Shortest wind-up on the player (ticks) | Aimed generators that cost him a hit |
| --- | --- | --- | --- | --- | --- |
| fair | Easy | 37.9 → 0.0 | 30.1 / 35.1 → 2.6 / 4.1 | 4 → 36 | 49 % → 95 % |
| fair | Normal | 23.1 → 0.5 | 22.1 / 26.8 → 10.1 / 12.5 | 4 → 30 | 63 % → 84 % |
| fair | Hard | 35.5 → 4.3 | 25.1 / 29.4 → 14.3 / 18.6 | 4 → (none started) | 65 % → 90 % |
| slow | Easy | 37.8 → 0.0 | 25.3 / 30.6 → 3.6 / 5.9 | 4 → (none started) | 60 % → 100 % |
| slow | Normal | 31.8 → 0.3 | 28.6 / 35.0 → 7.6 / 11.1 | 4 → 30 | 73 % → 88 % |
| slow | Hard | 25.8 → 2.9 | 19.9 / 24.3 → 11.1 / 15.6 | 4 → 24 | 69 % → 92 % |

Reading it: Easy is now won by both players in about 80 s with practically no health lost (Easy acceptance: won, at most
one life). Normal is won every time with lives to spare and costs about half the health it did. Hard is still the
costliest level (most deaths and the most boss generators near the player; the authored objective pace) but every
remaining loss of health comes from a visible, escapable source. Hard became less punishing than before for these
scripted players: before, its extra cost came mostly from the unfair parts (the hunting invulnerable boss, the 4-tick
punch, the swallowed hits). If playtests find Hard too soft, the fair levers are its ground (8), its window (15 s) and its
crew calls, not the wind-up or the absorption rules.

## Tests

- `tests/boss-balance.test.ts`: the data per level (ground grows, wind-ups >= 20 ticks, Hard = the authored objective);
  only Oshodi carries a balance; the scaled phase numbers; the boss directive's ground / generator cap; real bots: the
  shielded boss stays within his ground but for escapes; the boss and a crew seat start a Punch with the level wind-up,
  the player and a boss without a balance keep the catalogue's; a player who reads it in 18 ticks steps out (whiff); the
  exposed boss's generator cap (Easy 0, Normal 1); BB4 (his generator and the player's together: one hit; it was
  absorbed); BB5 (a crew generator between: the chain costs him a hit); the end is exact (hp 3, 2, 1, 0, one
  `bossDefeated`, one `missionOutcome`, one credited kill, the match ended) and a player falling on his last life in the
  finishing blast still wins.
- `tests/boss-balance-fights.test.ts`: the real mission end to end with the scripted person: Easy won with at most one
  life lost (and the slow player with none), Normal won, no punch faster than the level's wind-up and the booth kept,
  the same seed replays the same fight.
- Updated deliberately: `tests/raid-ai-isolation.test.ts` (the Oshodi boss digest only, see BB7),
  `tests/mission-crew.test.ts` (the recorded flee scene keeps the catalogue wind-ups).

## For the presentation worker / integrator

No new event. Two things the HUD should read:

1. **The wind-up length.** A boss-mission bot's attack now resolves `config.campaignTactics.botMeleeWindupTicks` after it
   starts (30 on Normal), not the catalogue's 4. `p.attack.resolveTick` and the `attackStarted` event's `resolveTick` are
   right; but `render/views/enemyTelegraph.ts` (around line 109) computes the start of a generator-bot seat's wind-up as
   `resolveTick - config.skills.attacks[skill].startupTicks`, so without `windStart` it would draw only the last 4 ticks.
   Use `meleeStartupTicks(state.config, p, a.skill)` (exported from `src/sim`) there instead.
2. **The exposed boss's generator cap / his ground** are rules, not HUD state: `MissionView.boss.restoring` still says
   when a blast lands. Optional reading for a hint: `state.mission.tuning.boss.exposedGenerators` (0 on Easy: "he lays
   nothing while restoring").
