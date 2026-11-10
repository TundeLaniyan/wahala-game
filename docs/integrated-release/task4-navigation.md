# Integrated release, Task 4: modern, forgiving navigation (decisions NV1-NV4)

Branch `claude/wahala-rel-task4-navigation`, from `e5f4269`. Input-layer and UI changes only: the simulation's movement
rules (one orthogonal tile per step, collisions, step timing) are untouched, so Classic raids and Rumble movement stay
deterministic.

## Audit: what existed, what was added, what was omitted

Movement numbers for tuning: a step takes 10 ticks at base speed (`movement.stepTicksBySpeedLevel` 10 / 9 / 8 / 7,
minimum 5; enemies slower), one tile per step, 60 ticks a second.

| Requirement | State before | This release |
| --- | --- | --- |
| 4A one pending direction, newest wins | **Exists**: `MoveGate.pending`, a new press replaces it (MI2) | kept |
| 4A bounded early-turn window | **Exists**: a press waits 10 ticks (14 assisted); a turn pressed while walking is carried 1 tile (Off) / up to 2 tiles when it really opens (`TURN_REACH_TILES`, assisted); a tapped turn is remembered 24 ticks (keyboard / gamepad Auto, touch Beginner) | kept |
| 4A keep moving legally while the turn is blocked | **Partial**: only within the 2-tile carry; a turn pressed further ahead bumped the wall and the player STOPPED, even with the walk key still held | **Added NV1** (keyboard, gamepad): walk on while both directions are held, take the turn on the first legal tile |
| 4A re-attempt a held direction when it becomes legal | **Partial**: a held direction repeats at the step cadence (bump guard 24 ticks, retried at once when it would act) | NV1 re-checks the turn every step while walking on |
| 4A cancellation / expiry | **Exists**: the press expires; releasing stops repeating; a route lapses | NV1 ends the moment either key is released; reversals never continued |
| 4A same on keyboard, gamepad, touch | **Partial**: the gamepad D-pad used a fixed up > down > left > right priority, so a thumb rolled onto UP+RIGHT never asked for RIGHT | **Added NV2**: newest D-pad button wins, all held buttons reported (like keys). Touch: see NV1 note |
| 4B centreline corrections near an opening | **Exists** (the grid has no off-centre positions; the equivalents are): sidestep to the single opening one tile along a wall, corridor bend following, the 2-step corner route for a leaning thumb (MV1, MV3, AS4) at the full level (touch Auto, or Settings On for keyboard / gamepad); never through solids, never more than one obstacle, never against a newer input | kept unchanged |
| 4C deadzone, hysteresis, cardinal snap, smooth, floating, cancel on lift, multitouch | **Exists**: `VirtualStick` dead zone 24 % / release 16 % of the radius, a 1.35x switch ratio, a following origin, one finger owns the stick (others free for A / B), lift / cancel / lost capture / resize release it; gamepad stick dead zone 0.5, release 0.35, 1.25x hysteresis | kept |
| 4D thumb-reachable buttons, hit areas, safe areas, landscape | **Exists**: two buttons in the lower right (MC3), >= 44 px (e2e menu sweep), safe-area insets, a reserved 36vh control strip on landscape phones | kept |
| 4D simultaneous movement + attack, no dropped presses | **Exists**: separate pointer sources per finger; A / B tap fires on press; touch presses kept while dazed (MI1, Beginner); the combat pilot buffers A / B in Terminal Approach | kept (B / attack logic is Task 5's) |
| 4D optional larger controls | **Missing** | **Added NV3**: Settings > Controls > Control size (Normal / Large) |
| 4D optional vibration | **Missing** | **Added NV4**: Settings > Controls > Vibration (On / Off), Android only in practice |
| Left-handed / D-pad layout | Missing (a D-pad cross exists, used in raids only) | **Omitted**: mirroring needs the HUD rail, minimap, stick zone, the 36vh camera strip (`render/cameraRig.ts PHONE_CONTROL_STRIP`) and the action cluster's diagonal to move together, and the board camera keeps the right-hand strip free; a cross-pad option outside raids needs its own layout fitting. Neither fits cleanly without a settings / layout rework |

## Decisions

| # | Decision | Where |
| --- | --- | --- |
| NV1 | **Held-turn continuation (keyboard and gamepad).** A perpendicular turn asked for while it is blocked, with the way the player walks STILL held (a second key or D-pad button), keeps the player walking that way tile after tile; the turn is re-checked every step and taken on the first legal tile. Both directions are the player's own current input, so there is no reach limit and no danger veto. It ends when either is released; a reversal is never continued; Settings > Assisted movement Off keeps the old gate exactly. **Not on the touchscreen**: the thumb's lean is the approved 2-step corner route (MV3 / AS4) and must never become a slide along a wall (a regression test pins that); touch keeps its 2-tile early turn and corner route. | `input/moveGate.ts` `alongHeld` |
| NV2 | **Gamepad D-pad: newest button wins** and every held D-pad direction is reported (as with keys), so rolling the thumb from UP onto UP+RIGHT asks for RIGHT while UP stays held (NV1). Raids still send one direction (the newest). The analogue stick is unchanged. | `input/gamepad.ts`, `input/InputManager.ts` |
| NV3 | **Settings > Control size (Normal / Large)**: Large scales the floating stick by 1.15 (radius cap 83 px; dead / release zones keep their share) and the A / B cluster by 15 %. On a landscape phone the cluster stays inside its 36vh strip (no tile is covered); there A grows 23 -> 26vh and B 20.5 -> 23vh, still diagonal and apart. Default Normal (unchanged layout). The raid cross keeps its own sizing. | `ui/TouchControls.tsx`, `ui/styles.css`, `input/joystick.ts` |
| NV4 | **Settings > Vibration (On / Off)**: a 12 ms tick when a touch action button goes down, 40 ms when the local player is hurt or dazed, a short pattern when knocked out. Only through `navigator.vibrate` (Android Chrome; iOS and desktops have none), only for touch play, never for keyboard / gamepad. Presentation only. | `platform/haptics.ts`, `app/MatchController.ts` |

## Tests

- `tests/input-navigation-buffer.test.ts` (real InputManager + real sim, deterministic): a one-tile market passage with
  the turn asked 5 tiles early (keyboard and gamepad: walks on, turns at the gap, never stalls); Off keeps the old stop;
  releasing the walk key cancels, releasing the turn key goes straight past the gap; reversal; newest direction wins;
  touch keeps AS4 / MV3 (no wall slide; the 2-tile early turn still works); a generator ahead is never walked through;
  another fighter in the corridor; a crate corner opening mid-walk; quick alternating taps stay one tile each; the
  D-pad roll; Large stick config; settings sanitising; the vibration patterns. Without NV1 five of them fail.
- Existing suites: input-*, corner-movement, mobile-*, gamepad, raid input (cross, grid), app, ui, render, architecture:
  89 files, 1151 tests passed.
- `e2e/navigation-buffer.spec.ts`: desktop keyboard (5-tile early turn into the passage) and phone (thumb 2-tile early
  turn, Large controls grow) both pass on a production build.

## Not verified

- Real Android vibration (headless Chromium has no motor; the call path and the pattern are unit-tested).
- Large controls were measured on the 844 x 390 phone project only.
