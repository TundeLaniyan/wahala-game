# HUD combat: kill feed, shields, QUICK HANDS, Sudden Death, mission panel

Presentation only (decisions HC1-HC5 in `docs/DECISIONS.md`). Nothing here changes a sim rule; every number comes from
the sim state through `src/app/hud.ts`. Reference frames: `docs/screenshots/hud-combat/` (made by
`scripts/hud-combat-shots.mjs`, which also fails when rail text covers the timer, portraits, inventory, controls or the board).

## Where things are

| Layout | Kill feed | Mission panel | Notices (toasts) |
| --- | --- | --- | --- |
| Standard arena, desktop / portrait | the rail beside the board (left column under the portraits), below the mission panel | the rail, first combat block | the rail, below the feed |
| Standard arena, landscape phone (touch controls) | a strip RIGHT of the board, under the right portraits, ending above the action buttons (`railBoxRight`) | the left rail, clipped above the move pad | the left rail |
| City Rumble (follow camera) | the top-left panel under the counter (`RumbleHud`, `<KillFeed />`) | the top-centre rail | the top-centre rail |

Rail order, top to bottom: sudden-death status, arena rule, stage alerts, **mission panel**, **kill feed**, toasts,
kill-streak cards (QUICK HANDS RUNNING / STORED ...), subtitle. What does not fit is clipped at the bottom, so the
most important blocks come first. The mission panel and the kill feed share one `rail-combat` block whose `max-height`
is set from the touch move pad's top (`HudRail`), because the rule banner must keep fitting whole (`e2e/voices.spec.ts`).
Geometry (pure, tested in `tests/ui/hudRail.test.ts`): `railBox` (left), `railBoxRight` (right strip).

## Model functions (pure)

- `src/app/killFeed.ts`: `eliminationLine`, `assistLine`, `killCause` (sentences and cause words), `newKillLines`
  (fresh, unseen eliminations from the state + the local player's assists from events), `pushKillLines` (ordering, cap 4,
  eviction, throttle), `expireKillLines`, `isCrowded`. Constants `KILL_FEED_*`.
- `src/app/combatNotices.ts`: `protectionNotice`, `quickHandsStoredNotice`, `quickHandsResumedNotice` (toast wording).
- `src/ui/combatHudModel.ts`: `shieldChip(me)`, `quickHandsCard(streak, alive)`, `suddenDeathStatus(sd)`, `suddenDeathRule(sd)`.
- `src/ui/missionPanelModel.ts`: `missionPanelModel(view)` from the sim's `MissionView`.
- `MatchController.killFeedFrom` feeds `store.killFeed` every frame; the store is reset when a new game starts (state identity).

## Kill feed rules

1. "YOU ELIMINATED X" / "X ELIMINATED YOU" / "A ELIMINATED B" / "X WAS ELIMINATED" (nobody credited) / "ASSIST ON X", with a cause chip.
2. Newest first, at most 4 lines. The local player's lines live 4 s, others' 2.6 s.
3. With more than 4 competitors: the local player's kills, deaths and assists always show; other fighters' lines are let in
   one per 1.2 s and are the first to be pushed out.
4. A shield that absorbs a hit (`protectionBroken`) is not an elimination: no kill line, a toast "ARMOUR USED" / "OKADA SAVED YOU".

## Checks

`tests/app/killFeed.test.ts`, `tests/ui/combatHud.test.ts` (shield chip, QUICK HANDS states, Sudden Death wording from the real
sim schedule, mission model with hand-built `MissionView` fixtures), `tests/ui/combatHudContrast.test.ts` (AA contrast of every new
text colour on the plate over a white day board and a black night one), `e2e/hud-combat.spec.ts` (desktop + phone: feed in the
rail / side strip / Rumble panel, off the board, clear of the timer, portraits, inventory and controls, nothing over the
bottom row).

## Left over

- The mission panel is tested with fixtures; a real mission (mission-sim workstream) has not been looked at on every phone size.
  In City Rumble the panel would sit in the top-centre rail (over the follow camera's play area); missions are expected on standard arenas.
- Other floating texts over the board that predate this work (pickup names, "OKADA!") are untouched.
