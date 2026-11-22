# Founder Test Lab (temporary)

Decisions TL1-TL5. Open `https://tundelaniyan.github.io/wahala-game/?testlab=1` (any flags may be added, e.g. `&debug`). The
Test Lab replaces the main menu with two sections and launches real gameplay at once: nothing to unlock, no console.
Without `?testlab=1` the game and its six-screen menu are unchanged.

## Using it
Home lists **Full Playtests** and **Isolated Scenarios**. Tap an entry: its card shows the objective, what it launches, a
difficulty (Easy / Normal / Hard, default Normal), **Start Test** and the feedback buttons. In a test the pause menu has
Resume, **Restart Test** (clean start, same level), Controls, Settings and **Return to Test Lab** (asks first). A finished
raid, mission or boss shows its result with Restart and Return; Classic Blast and City Rumble use their real results with the
same two buttons. Esc / back returns one level. **Exit Test Lab** reloads the normal game URL. Layout is for phone landscape:
the page never scrolls, the two lists scroll inside their columns, tap targets are at least 44 px, safe areas are kept.

## Entries
Level means the campaign level for raids, field and boss (enemy level, health, damage) and the bot level for Classic / Rumble.

| Entry | Launches |
| --- | --- |
| Classic Campaign Raid | `warehouseDispatchDepot` (the depot door raid of `oshodi.approach`) through `CampaignController.qaStartRaid` |
| Records Vault, night raid | the complete `recordsVault` raid (flashlight, guard beams, detection), same path |
| Classic Blast | `commands.start` with Classic, Danfo Bus Park, 4 players (1 human, 3 bots), normal rules |
| City Rumble | `commands.start`, Free-for-All, Oshodi Transport Metropolis, 16 fighters |
| Campaign field mission | `startSectionMission('oshodi.approach')` through the real campaign controller (its depot door raises the real raid) |
| Boss encounter | `startMission('oshodi')` through the campaign controller (boss gate opened by `testLabUnlocked`) |
| Characters and performance | Team City Rumble, Lagos Island, 24 fighters, fighter picker, fps line on |

Isolated scenarios are real raids prepared by `testlab/scenarios/defs.ts` (fixed seed, 600 s clock, one life count as the raid).
Each definition's `setup` lines are the whole preparation; outcomes are never scripted.

| Scenario | Setup |
| --- | --- |
| Rear approach | Depot, one guard (others stood down); player 3 tiles directly behind it, outside its view cone |
| Patrol-route ambush | Depot, one guard on its derived loop; player on the open tile within 3 steps of a corner from which fewest loop tiles see it |
| One-hit lethality | Depot, agbero + guard + thrower in a row on one lane (row 5); player at the lane's east end |
| Punch warning and dodge | Depot, one guard waking adjacent to the player at (9,5), two free tiles to step to |
| Pursuit and disengaging | Depot, 3 guards + 2 throwers (throwers start with the guards); player in the open east lane |
| Flashlight and detection | Records Vault, night, one torch guard; player at the entrance in the dark |
| Who am I? Surrounded | Depot, 5 enemies waking on the 5 nearest open tiles (2+ steps) around the player at (11,7); marker switch Original / Indicator / Indicator + Ground (default Indicator) in the entry card, the pause menu and a HUD button |

## Isolation guarantees and how they are enforced
With `?testlab=1` nothing may change the player's campaign save, unlocks, progression, economy, achievements, match
preferences, audio preferences or any other persisted state.
- `testlab/boot.ts` (the first import of `main.tsx`) replaces `window.localStorage` with an in-memory store before the
  settings store, audio prefs, graphics learner, onboarding and campaign load read it. Writes land in a `Map` and die with
  the page; the real save is not even readable (the lab starts from defaults). Only the feedback key passes through.
- If the replacement fails, the lab shows a warning and disables Start Test.
- Every start begins from a fresh in-memory campaign; Restart never inherits the last attempt.
- No backend and no new debug commands are added.
- Tests: `tests/testlab/isolation.test.ts` (writes never reach the real store), `e2e/testlab.spec.ts` (the browser's real
  localStorage is compared before and after play, Restart, Return and Exit).

## Feedback format
Key `wahala.testlab.feedback.v1`: `{ [entryId]: { status: 'pass'|'needsWork'|'failed'|'notTested', note, level? } }`. Notes
are one line, 200 characters at most. Nothing is ever set automatically. **Copy summary** (Home) puts this on the clipboard
(or in a select-all box if the browser blocks it):

```
WAHALA! TEST LAB (2026-11-22 14:03)
Device: 844x390, touch

FULL PLAYTESTS
- [PASS] Classic Campaign Raid (Normal): felt fair
- [NEEDS IMPROVEMENT] Records Vault, night raid (Hard): too dark near the vault door
- [NOT TESTED] Classic Blast
...
Totals: 1 pass, 1 needs improvement, 0 failed, 12 not tested
```

## Removal
1. Delete `src/testlab/`, `src/ui/testlab/`, `tests/testlab/`, `e2e/testlab.spec.ts` and this file.
2. `src/main.tsx`: remove the `./testlab/boot` import. `src/ui/App.tsx` and `src/ui/Hud.tsx`: remove the `lab` / `LAB` lazy
   components and the `testLabActive()` branches (marked TEMPORARY).
3. `src/app/session.ts`: remove `labCampaign`, the `testLabActive` import and the `testLabUnlocked` dep.
4. `src/app/campaign.ts`: remove `testLabUnlocked`, `RaidContext.prepare/seed/timeLimitSec`, the `opts` of `qaStartRaid` and
   the `timeLimitSec` build arg. `src/app/ports.ts` / `MatchController.ts`: remove `RaidMeta.prepare` and its one call.
5. `src/render/playerMarker.ts` belongs to the player-marker work: keep it.
6. Run `npm run check`; note the removal under TL1-TL5.
