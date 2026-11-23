# Founder Test Lab (temporary)

Decisions TL1-TL9. Open `https://tundelaniyan.github.io/wahala-game/?testlab=1` (any flags may be added, e.g. `&debug`). The
Test Lab replaces the main menu with the tests and launches real gameplay at once: nothing to unlock, no console.
Without `?testlab=1` the game and its six-screen menu are unchanged.

## Using it
Home lists **Tests Requiring Review** (prominent, numbered, in the order to try them) and a collapsed **Completed Tests**
list (tap its header to open it; the approved tests stay launchable). Tap an entry: its card shows the objective, **what to
look for**, what it launches, a difficulty (Easy / Normal / Hard, default Normal; City Rumble has its own set-up instead),
**Start Test** and the feedback buttons. In a test the pause menu has Resume, **Restart Test** (clean start, same level and
set-up), Controls, Settings and **Return to Test Lab** (asks first). A finished raid, mission or boss shows its result with
Restart and Return; Classic Blast and City Rumble use their real results with the same two buttons. Esc / back returns one
level. **Exit Test Lab** reloads the normal game URL. Layout is for phone landscape: the page never scrolls, the lists scroll
inside their columns, tap targets are at least 44 px, safe areas are kept.

## Tests Requiring Review (decisions TB4, SDT1-SDT2, PM1)
The five open checks of the final polish round, in the order to try them. Everything the founder already approved on a phone
(City Rumble parity, occluded building visibility, the Easy boss, the Classic rear ambush, one-hit lethality) moved to
Completed Tests; ids and stored feedback are unchanged.

| # | Entry (id) | Launches | What to look for |
| --- | --- | --- | --- |
| 1 | Sudden Death presentation and timer (`suddenDeath`) | The game's own Sudden Death test match (`commands.start('suddenDeathTest')`): a real City Rumble on Ojuelegba, you and two bots, straight into the sudden-death round | The main timer reads SUDDEN DEATH with the blast countdown and the blast number; a short announcement appears in the side rail and goes by itself; nothing over the middle of the board; the winner stands in the victory pose |
| 2 | Combined player marker (`identifyPlayer`) | Depot, five enemies waking close around you (no switch: Indicator + Ground is the standard) | The YOU plate follows you, the floor ring stays readable when crowded, neither hides a blast lane, one of each |
| 3 | Team blast warnings, friendly fire OFF (`teamBlastFfOff`) | Team Blast scene (below) | A teammate's blast is emerald dashed tiles and does not hurt you; a rival's or your own is red with hazard stripes; in the chain wave the rival's link is red |
| 4 | Team blast warnings, friendly fire ON (`teamBlastFfOn`) | The same scene with friendly fire ON | Nothing is emerald: the teammate's blast is red and striped, and hurts |
| 5 | Team blast overlap and danger priority (`teamBlastOverlap`) | Overlapping and three-at-once waves, friendly fire OFF | A tile any dangerous blast reaches is red and striped; only teammate-only tiles are emerald |

### Team Blast scene (TB4)
A small REAL Team Rumble on the Lagos Island stage: you and the other seat of your team (the sim seats teams alternately, so
that is seat 2) against two rivals. The match options are the normal game's (`buildMatchOptions`, team ruleset, friendly fire
as named), the other seats stand still and lay generators with the real `place` intent every 9 s (a director feeding intents,
as the Training Academy does), so each generator has its real owner, fuse, range, chain behaviour and damage; the stage's
hazards and the crowd are switched off so only the blasts are in the picture. Lay your own with A (a dangerous blast for you).
Waves repeat: teammate alone, rival alone, teammate and rival side by side, a chain (the teammate's generator sets the rival's
off), and for the overlap entry three at once. A fallen fighter respawns as in any Team Rumble. The viewer-relative rules are
in `docs/DECISIONS.md` (TB1-TB4); `tests/testlab/team-blast.test.ts` runs every wave through the real tick and checks the
labels against real damage; `e2e/team-blast.spec.ts` checks what the real renderer draws.

### City Rumble set-up (TL6)
The card holds the same choices a normal match reads: mode (Free-for-All, Team Deathmatch, Last Player Standing), stage (every
City Rumble stage), fighters (8 / 16 / 24 / 32), **bot level (all seven, Rookie first)**, one level or a mixed roster, 3 or
5 minutes (the respawn modes), friendly fire (Team) and your fighter. **Use Current Rumble Settings** copies the player's real
saved `GameSettings` (these fields plus the camera view, touch assist, movement style and control size); the lab opens on them
when something is saved (the game's defaults otherwise, said on the card), and any change marks the set-up Custom. **Will
start** lists the exact configuration, line by line, before Start; the copied feedback summary carries the same one-line
configuration. Start runs the normal `commands.start` with those settings; the seed is random like the normal game (`?seed=N`
fixes it). The real saved settings are read once, read-only (`realSnapshot.ts`, below) and never written.

Why the lab felt harder (decision TL6): it mapped Easy / Normal / Hard to Beginner / Casual / Standard bots, a normal match
defaults to Rookie. Nothing in the engine or the AI differed, and none changed. `tests/testlab/rumble-parity.test.ts` proves the
lab's launch and the normal menu's launch with the same settings and seed build identical `GameOptions` and initial state and
play identically for 240 ticks with the real bots.

## Completed Tests
Launchable exactly as before: City Rumble parity, Occluded building visibility, the Oshodi boss (Easy approved; Normal / Hard jammer-defence tuning is a separate design item), Classic rear ambush, One-hit lethality, Classic Campaign Raid, Records Vault night raid, Classic Blast, Campaign field mission,
Characters and performance (Team Rumble, Lagos Island, 24 fighters, fighter picker, fps line) and the five isolated scenarios
below (rear approach, patrol ambush, punch dodge, pursuit, flashlight). Level means the campaign level for raids, field and
boss (enemy level, health, damage) and the bot level for Classic Blast and the Characters entry.

Isolated scenarios are real raids prepared by `testlab/scenarios/defs.ts` (fixed seed, 600 s clock, one life count as the raid).
Each definition's `setup` lines are the whole preparation; outcomes are never scripted.

| Scenario | Setup |
| --- | --- |
| Rear approach | Depot, one guard (others stood down); player 3 tiles directly behind it, outside its view cone |
| Patrol-route ambush | Depot, one guard on its derived loop; player on the open tile within 3 steps of a corner from which fewest loop tiles see it |
| One-hit lethality (agbero / guard / thrower) | Depot, ONE ordinary enemy of the chosen kind at the entrance post (2, 11) facing east; player at (1, 9), two steps from the tile behind it (1, 11) |
| Punch warning and dodge | Depot, one guard waking adjacent to the player at (9,5), two free tiles to step to |
| Pursuit and disengaging | Depot, 3 guards + 2 throwers (throwers start with the guards); player in the open east lane |
| Flashlight and detection | Records Vault, night, one torch guard; player at the entrance in the dark |
| Combined player marker | Depot, 5 enemies waking on the 5 nearest open tiles (2+ steps) around the player at (11,7); the combined Indicator + Ground marker is the game's standard (decision PM1), no switch |

### Why one-hit lethality is a post (TL9)
A calm raid enemy sees nothing behind it (CV1) and does not hear a generator laid beside it on Easy and Normal (CV2); a
generator's cross (range 2, 3 s fuse) then kills an agbero, guard or thrower in one blast (`blastDefeats`). Patrolling guards walk
away, so the scenario uses the posts the sim gives the entrance tiles (no loop or run fits within 3 tiles of the entrance, so
the route is `post`). The post turns a quarter every 4 s (Easy) / 2.5 s (Normal): lay within about 1.5 s of its waking on
Normal. The column-13 posts are on a conveyor belt and walk away; the entrance post is not. `tests/testlab/one-hit.test.ts`
plays each kind at Easy and Normal with intents only and checks the kill is the human's blast and nothing was forced.

## Isolation guarantees and how they are enforced
With `?testlab=1` nothing may change the player's campaign save, unlocks, progression, economy, achievements, match
preferences, audio preferences or any other persisted state.
- `testlab/boot.ts` (the first import of `main.tsx`) replaces `window.localStorage` with an in-memory store before the
  settings store, audio prefs, graphics learner, onboarding and campaign load read it. Writes land in a `Map` and die with
  the page; the real save is not readable by the game (the lab starts from defaults). Only the feedback key passes through.
- The one exception is a read-only snapshot of the player's real saved MATCH SETTINGS (`wahala.settings.v1`), taken once by
  `installIsolation` before the swap (`testlab/realSnapshot.ts`: one `getItem`, no write, no removal) so City Rumble can
  reproduce a normal match. Nothing else is read; the snapshot is never written back.
- If the replacement fails, the lab shows a warning and disables Start Test.
- Every start begins from a fresh in-memory campaign; Restart never inherits the last attempt.
- No backend and no new debug commands are added.
- Tests: `tests/testlab/isolation.test.ts` (writes never reach the real store; the snapshot is taken once, by reading only),
  `e2e/testlab.spec.ts` (the browser's real localStorage is compared before and after play, Restart, Return, Exit and a
  Use Current Rumble Settings run).

## Feedback format
Key `wahala.testlab.feedback.v1`: `{ [entryId]: { status: 'pass'|'needsWork'|'failed'|'notTested', note, level?, detail? } }` (`detail` is the City Rumble configuration or the chosen one-hit enemy at the time of marking; ids never change, so earlier feedback stays attached). Notes
are one line, 200 characters at most. Nothing is ever set automatically. **Copy summary** (Home) puts this on the clipboard
(or in a select-all box if the browser blocks it):

```
WAHALA! TEST LAB (2026-11-22 14:03)
Device: 844x390, touch

TESTS REQUIRING REVIEW
- [NEEDS IMPROVEMENT] City Rumble parity (Free-for-All · 16 fighters · 5 min · Oshodi Transport Metropolis · Rookie bots): bots sharper than normal
- [NOT TESTED] Occluded building visibility
...
COMPLETED TESTS
- [PASS] Classic Campaign Raid (Normal): felt fair
...
Totals: 1 pass, 1 needs improvement, 0 failed, 15 not tested
```

## Removal
1. Delete `src/testlab/`, `src/ui/testlab/`, `tests/testlab/`, `e2e/testlab.spec.ts` and this file. Keep `buildMatchOptions`
   (`app/names.ts`) and `parseSettings` (`app/settings.ts`): the normal game uses them.
2. `src/main.tsx`: remove the `./testlab/boot` import. `src/ui/App.tsx` and `src/ui/Hud.tsx`: remove the `lab` / `LAB` lazy
   components and the `testLabActive()` branches (marked TEMPORARY).
3. `src/app/session.ts`: remove `labCampaign`, the `testLabActive` import and the `testLabUnlocked` dep.
4. `src/app/campaign.ts`: remove `testLabUnlocked`, `RaidContext.prepare/seed/timeLimitSec`, the `opts` of `qaStartRaid` and
   the `timeLimitSec` build arg. `src/app/ports.ts` / `MatchController.ts`: remove `RaidMeta.prepare` and its one call.
5. `src/render/playerMarker.ts` belongs to the player-marker work: keep it.
6. Run `npm run check`; note the removal under TL1-TL5.
