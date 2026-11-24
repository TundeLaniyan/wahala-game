# Boss and backup fighters protecting the jammer (task PI-1D, decision PI8)

Branch `claude/wahala-pi-campaign` (from production `9491d92`). A separate campaign enhancement, NOT an Easy-boss
regression: the founder wants stronger bosses and their backup fighters to actively protect the jammer as the difficulty
rises. Scope: Oga Sunmola's Oshodi mission (`startMission('oshodi')`), the only boss with a balance (BB1-BB7); the other five
bosses and the finale are untouched.

**What "the jammer" is here.** The code has no object called a jammer. The device the player must reach and disable is the
**dispatch relay**: the player JAMS it with one generator blast that reaches its tile (`mission/objectives/relays.ts`; the
mission copy says "Jam the relays"; `src/testlab/registry.ts` already names this item "Normal / Hard jammer-defence
tuning"). Three or four relays per phase stand on the 63-tile dispatch corridor (x 3 to 61); the boss's booth is at (27, 12).
If the founder meant something else, the lever below (`BossBalance.relayGuards`) is the one place to change.

## 1. What protects the relays today (measured, before any change)

`scripts/boss-jammer.ts` plays the real mission with the scripted player of docs/BOSS_BALANCE.md (`fair` 0.3 s reactions,
`slow` 0.4 s) and measures, over the objective phases (boss shielded, relays live): **guarded** = the share of live-relay time
with a living hostile (boss or crew) within 4 tiles of the relay; **contested** = the same, only while the player is within
8 tiles of that relay (his approach); **approach to jam** = seconds from first coming within 8 tiles to the jam.

Roles today (`mission/directives.ts`, Oshodi crew): the boss guards his booth (ground 3 / 5 / 8 tiles from it, BB1); the marshal
(meleeGuard) guards the booth and chases only when the boss is exposed; the lane blocker stands on its lane tile; the escort
stays on the boss; the spotter chases the player everywhere; the two runners re-arm JAMMED relays. Nobody is assigned to a
LIVE relay. Result, 32 seeds per cell, before:

| player | level | guarded | contested | approach to jam | who is near a live relay (share of its time) |
| --- | --- | --- | --- | --- | --- |
| fair | Normal | 41 % | 48 % | 4.6 s | boss 17, escort 18, marshal 18, runners 18, blocker 16, spotter 6 |
| slow | Normal | 38 % | 39 % | 4.5 s | similar |
| fair | Hard | 41 % | 55 % | 5.2 s | boss 20, escort 21, marshal 20, runners 17, blocker 19, spotter 3 |
| slow | Hard | 40 % | 42 % | 4.5 s | similar |

(Easy, 8 seeds: 35 % / 33 % guarded, contested 37 % / 32 %.) So protection is FLAT across the levels, about 40 %, and it is by
accident: relay 2 of each phase happens to lie near the booth, and the runners hover. The boss's own reach already scales
(ground 3 / 5 / 8: with 8 he covers relay 2 of phases 1 and 2, with 5 only relay 2 of phase 3), the rest does not.

## 2. The change (small, config-driven, off on Easy)

`BossBalance.relayGuards` (`config.ts`): how many backup fighters defend the live relays while the boss is shielded and the
relays are the objective. **Easy 0, Normal 1, Hard 2**, `relayGuardRadius` 2. They are drafted in the order marshal, lane
blocker, escort (a fallen one is replaced by the next); the first stands within 2 tiles of the live relay nearest the player,
the second at the next nearest ...; each is a plain `guard` directive, so it hunts the player when he comes inside, and it
returns to its own role the moment the boss is exposed (`mission/relayGuard.ts`, one pure function read by `directiveFor`).
The boss himself, the spotter, the runners, every number of BB1-BB6 and every other boss are unchanged. Nothing is stored in
the state where it is 0.

### Easy is the production fight, bit for bit

`scripts/boss-trace.ts` folds every tick of a whole fight (every seat's tile, health, step, the relays, the phase, the
generators) into one hash. Production `9491d92` vs this branch, `--level easy --seeds 8`, both players: **16 of 16 fights
identical** (also with the feature on for the other levels). Normal and Hard: 16 of 16 differ. Pinned in
`tests/boss-relay-guard.test.ts` (two Easy seeds), plus `tests/boss-balance*.test.ts`, `tests/mission-boss*.test.ts`,
`tests/raid-ai-isolation.test.ts` (the other five bosses, byte-identical) all green.

## 3. Before / after (32 seeds per cell, seeds 101 + 17 k)

| player | level | wins | mean s | lives lost | phase 3 s | guarded | contested | approach to jam |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fair | Normal | 31/32 -> 32/32 | 103 -> 107 | 0.8 -> 0.6 | 46.9 -> 50.3 | 41 -> 41 % | 48 -> 55 % | 4.6 -> 4.5 s |
| slow | Normal | 32/32 -> 32/32 | 93 -> 103 | 0.3 -> 0.6 | 35.7 -> 48.4 | 38 -> 40 % | 39 -> 57 % | 4.5 -> 4.4 s |
| fair | Hard | 32/32 -> 31/32 | 141 -> 139 | 0.8 -> 1.0 | 75.5 -> 74.8 | 41 -> 50 % | 55 -> 70 % | 5.2 -> 5.1 s |
| slow | Hard | 32/32 -> 32/32 | 114 -> 134 | 0.7 -> 0.7 | 50.6 -> 70.2 | 40 -> 50 % | 42 -> 67 % | 4.5 -> 4.5 s |

Alternatives measured (same 32 seeds): Hard with ONE guard: contested 60 % / 54 %, slow time 114 -> 130 s, fair 141 -> 151 s,
31/32 and 32/32; an earlier 8-seed run with two guards looked much harder (fair Hard phase 3 48 -> 128 s) and a third guard
cost a win: it did not hold at 16 and 32 seeds, so the 8-seed numbers of this task (and the 8-seed ones of BB) are noisy at
the level of +/- 25 %. Three guards at Normal / Hard were not taken forward (51-60 % guarded, 7/8 wins at 8 seeds, not
re-measured at 32).

## 4. Reading it, honestly

- The change does what it says: where the player meets the relays, someone is there. On Hard the share of his approaches
  that meet a defender goes 55 / 42 % -> 70 / 67 %, on Normal 48 / 39 % -> 55 / 57 %.
- It does NOT make the scripted player slower to jam a relay: approach to jam stays 4.4 to 5.2 s at every level. The scripted
  player lays its generator from a distance and walks out; a guard standing beside the relay is not an obstacle to that. What
  moves is phase 3 (all four relays at once, the only phase where nothing can be skipped): +36 % (slow) and +7 % (fair) on
  Normal, +39 % (slow) and 0 % (fair) on Hard. Phases 1 and 2 need only 2 of 3 / 3 of 4 relays, so the player simply goes to the
  unguarded ones.
- Win rate is not moved (a one-fight difference in 32, in both directions, level by level). Whole-fight time moves little
  (Normal +4 / +11 %, Hard -2 / +18 %); lives lost +/- 0.3. Hard melee health lost 0.1 -> 0.3 a fight.
- So the shipped numbers are small and justified by "defenders exist where the player goes, more of them on Hard", not by a
  measured jump in difficulty. If the founder wants Hard to bite harder, the fair levers are `relayGuards.hard` 3,
  `relayGuardRadius`, and the boss's ground (BB1), each to be re-measured with `npx tsx scripts/boss-jammer.ts --seeds 32
  --level hard --guards N` (the flag overrides the level's number for the run).
- A scripted player never feels a guard: it does not panic when a marshal walks up to the relay it is aiming at. The real test
  is the founder's Normal / Hard play.

## 5. Not verified

- No physical-phone or founder play; no browser check of the fight (the change is sim-only, no render, UI or audio change; the
  guard's walk to a relay is plain `guard` movement the renderer already draws).
- The relay choice is a pure function of the player's position each tick, with no hysteresis: a guard can change its mind when
  the player is about equally near two relays. The real bots re-plan every few ticks; this was not seen to oscillate in the
  runs, but it is not tested for.
- The Test Lab entry still says Normal / Hard jammer-defence tuning is "a separate design item"; its wording was not touched.
