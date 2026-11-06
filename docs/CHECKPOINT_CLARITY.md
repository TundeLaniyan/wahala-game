# Checkpoint clarity (field missions)

Worker `checkpoint-ux`, from the deployed release `a4fe457`. Founder playtest: in **Oshodi Terminal Approach** (`oshodi.approach`, the first campaign field mission) the checkpoints were hard to find and looked like something you had to wait on. Presentation and wording only: no rule, timing or position changed (decisions CK1-CK8 in `docs/DECISIONS.md`).

## What the code did (confirmed on `a4fe457`)

- `src/sim/mission/field.ts`: a `reachMarkers` checkpoint completes **the instant** the human stands on the CURRENT marker tile; only the current one counts (later ones are `locked`, standing on them does nothing). The last one of the leg completes the leg.
- The depot door needs a **hold**: `DOOR_HOLD_TICKS = 60` (1 s) standing on it; stepping off drains the hold 2 per tick (`fieldDefs.ts`, `updateDoors`).
- Presentation drew both with the **same** round pad, the same barrier icon and the same progress ring (`MissionViews.ts`, `iconFor('fieldRoute') = 'barrier'`), so a walk-through checkpoint looked like a hold pad. The leg text was "Walk the bay checkpoints to the depot yard." / "Step on the depot door and hold: the warehouse raid."
- More confusion found on the way: the panel showed **BOSS SHIELDED** and a **BOSS DEFENCES 3 OF 3** bar in a field mission that has no boss; on a phone in landscape the right column was so full (health, the boss bar) that the **objective was clipped away entirely**; the compass picked the nearest live node, so an optional bonus door (Mushin market) could win over the route.

## What changed

| Area | Change | Where |
| --- | --- | --- |
| View data (read-only) | `MissionNodeView.kind` (`checkpoint` / `hold` / `enemies` / `exit` / `return`) and `optional`; `MissionView.fieldGoal` (verb, the CURRENT target node, its step "1 of 3", the door hold in ticks with `standing`, enemies left, fights optional); `MissionView.route` (every checkpoint of the legs so far: done / live / locked) | `sim/mission/types.ts`, `field.ts` (`goalView`, `routeView`, `nodeKindOf`) |
| World: walk-through | A tall column of light with a bright core, a flag on a pole, a floor ring with a ripple and a gold **waypoint arrow** above the CURRENT checkpoint (drawn over roofs and buses); later checkpoints of the leg are a faint short grey column with a small grey flag; a reached one bursts white then green for 1.2 s, then settles as a small green flag with a tick. Never a filling ring. Escape exits and the return marker use the same beacon | `render/views/CheckpointBeacons.ts`, `checkpointStyle.ts` |
| World: hold | Doors are a different object: a **square** dark pad with a door-sill bar, a steel-door icon, a dim full ring track and the hold progress ring around it (wider than a node ring), in **cyan** (the HUD's HOLD colour) while it wants the player | `MissionViews.ts`, `missionIcons.ts` (`door`), `missionTextures.ts` (`holdPadTexture`) |
| HUD: objective block | First block of the City Rumble right column (and of the rail on a standard arena): a tag **GO TO / HOLD / DEFEAT / ESCAPE / RETURN**, the target ("CHECKPOINT A", "DISPATCH DEPOT DOOR", "2 ENEMIES LEFT", "FOOTBRIDGE", "ORITA GATE"), the step ("1 OF 3") and short notes ("WALK THROUGH, NO WAITING", "STAND STILL ON IT", "ALL MUST GO DOWN", "DON'T LET THEM CATCH YOU", "FIGHTS OPTIONAL") | `ui/FieldGoal.tsx` + `.css`, `ui/missionPanelModel.ts` (`fieldGoalModel`), `app/fieldGoal.ts` (wording) |
| HUD: door hold bar | Inside the objective block: a bar and **"HOLD 0.4 / 1.0 s"** with a hint (STEP ON THE DOOR / STAY ON IT / STEP BACK ON / RAID STARTING); green while filling, amber while draining. Right column only: never the board's centre or the bottom row | same |
| HUD: reach feedback | A rail notice the moment a checkpoint is walked through: **"CHECKPOINT A ✓ · NEXT: CHECKPOINT B"**, the last one "CHECKPOINT C ✓ · NEXT: HOLD THE DISPATCH DEPOT DOOR"; other legs "ENEMIES DOWN ✓ · NEXT: ...", "RAID DONE ✓ · NEXT: RETURN TO ORITA GATE". It comes from comparing two views (not from events), so it also works after a raid and under debug stepping | `app/fieldGoal.ts` (`fieldNotices`), `app/MatchController.ts` (`publishHud`) |
| Panel | A field mission shows no boss row and no boss-defences bar; its generic "FOLLOW THE ROUTE" line gives way to the objective block | `ui/MissionPanel.tsx`, `ui/campaignHealthModel.ts` |
| Compass | Always the CURRENT objective node of a field mission (`fieldGoal.nodeId`); without one, required nodes before optional bonus doors | `ui/missionCompassModel.ts` |
| Minimap | The current objective is bigger with a pulsing white halo and drawn on top; doors are squares; later checkpoints are small | `ui/minimapModel.ts`, `ui/Minimap.tsx` |
| Wording | Every leg of the eleven field missions, the return line (`returnLegText`), Oshodi's third marker "YARD GATE" -> "CHECKPOINT C" (Ebute-Metta's return marker is also YARD GATE), the Oshodi approach briefing card and section summary | `sim/mission/fieldDefs.ts`, `campaign/content/sections.ts` |

## Marker legend (field missions)

| In the world | Means | HUD tag |
| --- | --- | --- |
| Gold column, flag, ripple and a gold arrow above it | The checkpoint to walk to NOW: step on it, no waiting | GO TO |
| Faint short grey column, small grey flag | A later checkpoint of this leg (standing on it does nothing yet) | |
| White-green burst, then a small green flag and a tick | Walked through | |
| Square cyan pad, steel-door icon, ring filling green | A door: stand on it for 1 s, the ring is the hold | HOLD |
| Round gold pad with a beam (between the enemies) | The group to defeat | DEFEAT |
| Gold beacon at the exit / the gate | Escape to it / return to it (walk-through) | ESCAPE / RETURN |

## Wording

| Mission | Leg | Before | After |
| --- | --- | --- | --- |
| oshodi.approach | checkpoints | Walk the bay checkpoints to the depot yard. | Walk through the 3 checkpoints. No need to stop. |
| | door | Step on the depot door and hold: the warehouse raid. | Stand on the depot door for 1 second to raid it. |
| oshodi.railEdge | defeat | Put down the hawkers holding the market lane. | Defeat the 2 hawkers in the market lane. |
| | escape | The trailer crew is after you: reach the footbridge first. | Escape to the footbridge before the trailer hand catches you. |
| mushin.approach | checkpoints | Follow the row of stalls to the storeroom lane. | Walk through the 3 checkpoints along the stalls. |
| | door | Hold on the storeroom door: the parts raid. | Stand on the storeroom door for 1 second to raid it. |
| mushin.market | defeat | Clear the runners working the north aisles. | Defeat the 3 market runners in the north aisles. |
| | checkpoints | Check the two far stalls on the top street. | Walk through the 2 checkpoints on the top street. |
| fadeyiSomolu.approach | defeat | Move the marshals off the approach road. | Defeat the 2 marshals on the approach road. |
| | checkpoints | Walk the two toll posts to the shed. | Walk through the 2 toll posts. |
| | door | Hold on the tool-shed door: the shed raid. | Stand on the tool-shed door for 1 second to raid it. |
| fadeyiSomolu.junctions | checkpoints | Walk the junction posts, west to east. | Walk through the 3 junction posts, west to east. |
| | escape | The marshals are on you: reach the north slip road. | Escape to the slip road before the marshal catches you. |
| ebuteMetta.approach | checkpoints | Follow the yard fence to the signal box. | Walk through the 3 checkpoints to the signal box. |
| | door | Hold on the shed door: the tool-shed raid. | Stand on the signal-shed door for 1 second to raid it. |
| lagosIsland.approach | defeat | Move the auditors off the west row. | Defeat the 2 auditors on the west row. |
| | checkpoints | Walk the two ledger counters. | Walk through the 2 ledger counters. |
| | door | Hold on the annexe door: the records raid. | Stand on the annexe door for 1 second to raid it. |
| lagosIsland.press | checkpoints | Collect the audit slips at both desks. | Walk through the 2 desks to collect the audit slips. |
| | escape | The bureau knows: reach the press lane before the auditors. | Escape to the press lane before the auditor catches you. |
| lekki.approach | checkpoints | Slip along the garden wall past the gatehouse. | Walk through the 2 checkpoints along the garden wall. |
| | door | Hold on the plant door: the standby-plant raid. | Stand on the plant door for 1 second to raid it. |
| lekki.estate | defeat | Clear the patrol on the north drive. | Defeat the 2 guards on the north drive. |
| | checkpoints | Check the two security posts on the east lawn. | Walk through the 2 security posts on the east lawn. |
| | escape | The hounds are loose: get to the service road. | Escape to the service road before the hound catches you. |
| every mission | return | Done here. Walk back to X to finish. | Return to X to finish. |
| oshodi.approach | briefing card | Walk the checkpoints, raid the depot, come back out. | Walk through 3 checkpoints, stand 1 s on the depot door, return. |

The counts are checked against the data (`tests/field-checkpoint-clarity.test.ts`: the defeat count equals the group size, "1 second" equals `DOOR_HOLD_TICKS`). Mandatory vs optional is explicit: DEFEAT legs say "ALL MUST GO DOWN"; on every GO TO / HOLD / RETURN leg with enemies on the map the block says "FIGHTS OPTIONAL"; ESCAPE says "DON'T LET THEM CATCH YOU"; a bonus door's hold says "(BONUS)".

## Screenshots

`docs/screenshots/checkpoint-clarity/`, made with `scripts/checkpoint-clarity-shots.mjs` (`before-*` from a build of `a4fe457`, `after-*` from this branch; the human is staged through the debug state and the sim is frozen, so only `stepTicks` moves it; the match clock therefore reads 5:58 in all of them). Desktop 1280 x 720, phone landscape 844 x 390 at 2x, portrait 390 x 844 for the campaign map only (a match in portrait shows the rotate card).

| Scenario | Before | After |
| --- | --- | --- |
| `start`: spawn | A small round pad hidden behind the buses; the panel says FOLLOW THE ROUTE, BOSS SHIELDED and BOSS DEFENCES 3 OF 3; on the phone the objective is clipped away | Gold column and arrow over the bus row; "GO TO CHECKPOINT A 1 OF 3 / WALK THROUGH, NO WAITING / FIGHTS OPTIONAL" first in the right column (also on the phone); no boss rows |
| `checkpoint`: three tiles short of A | An orange ring the size of a tile, half under a bus | The beacon and arrow right ahead, the minimap ring on A |
| `reached`: just after A | The pad turns green; nothing else says anything | "CHECKPOINT A ✓ · NEXT: CHECKPOINT B" in the rail, the block says GO TO CHECKPOINT B 2 OF 3, A bursts green, B is the new gold beacon |
| `door`: 0.4 s on the door | The same round pad and a thin ring; "0/1 RAID DONE" | A square cyan pad with a door and the hold ring; "HOLD DISPATCH DEPOT DOOR", the bar 40 %, "HOLD 0.4 / 1.0 s · STAY ON IT" |
| `drain` (after only): a step off | | The bar amber and shrinking, "STEP BACK ON" |
| `map` (portrait): campaign map | "Take the checkpoints", "Walk the checkpoints, raid the depot, come back out." | "Walk through the checkpoints", "Walk through 3 checkpoints, stand 1 s on the depot door, return." |

(In `drain` and the phone `door` shot three notices are stacked because the staging walks A, B and C within a few ticks; in play they are 10 tiles apart and come one at a time.)

## Tests

- `tests/field-checkpoint-clarity.test.ts`: node kinds, only the current checkpoint live, the goal moving on the reach tick, a later checkpoint doing nothing (unchanged rule), the hold fill / drain in ticks and its readout, panel / boss bar / tags for every leg kind, compass = current checkpoint (and route before an optional door), minimap current marker, reach notices, wording of all eleven missions.
- `tests/render/checkpoint-beacons.test.ts`: the pure beacon look (current, later, reached flash then settle) and the view on a simulated mission: beacons for checkpoints, one hold pad for the door, different objects, the flash on reach, the door ring filling in the HOLD colour.
- `tests/ui/fieldGoal.test.ts`: static render of the block (GO TO, HOLD with "HOLD 0.4 / 1.0 s" filling then draining), the panel without a boss row, WCAG AA contrast of every colour of `FieldGoal.css` by day and night.
- `e2e/checkpoint-clarity.spec.ts` (desktop and mobile): starts `oshodi.approach` through the campaign, stages checkpoint A, asserts the notice, the next objective and the beacon state, walks B and C, asserts the hold bar idle -> filling (HOLD 0.4 / 1.0 s) -> draining, then holds a full second and asserts the warehouse raid starts.

## Gaps

- The beacon colours follow the mission legend (gold = do this); on Oshodi's yellow danfo rows the gold column is less loud than on grey floor; the dark-outlined arrow carries it there.
- The door has no waypoint arrow (its cyan beam, the compass and the HUD block point at it); a door hidden behind a wall south of it (the depot) shows its icon and ring through the occlusion dither only.
- The reach flash and notices have no new sound: the existing `missionNode` / `missionPhase` cues play (no new audio by rule).
