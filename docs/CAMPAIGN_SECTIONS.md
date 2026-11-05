# Campaign sections: districts reclaimed piece by piece

Branch `claude/wahala-campaign-online-v1`, worker `field-sections`. Plan: `CAMPAIGN_EXPANSION_PLAN.md`. Decisions: `DECISIONS.md` FS1-FS12. Everything is front-end only (static build, online and voice flags off).

## 1. Structure

Every mission district (not the Ojuelegba hub) has three sections, played in order. A section holds one or more missions; it is cleared when all of them are.

1. **Approach**: a FIELD mission with a door to a raid.
2. **Middle**: a second field mission, or a standalone raid.
3. **Boss**: the existing boss mission, unchanged (reward, unlocks, replay modifier, phases). Playable only once sections 1 and 2 are cleared. Clearing it clears the district, exactly as before.

Two formats live inside sections: a **field mission** is a route on the district's City Rumble arena (follow camera, radial blasts); a **raid** is a compact classic mission (`src/sim/raid`, cross blasts). A field mission can raise a raid through a **door**; the raid is played, and the player returns to the field map on the tile in front of the door.

## 2. Table

| District | Section 1 (field, door -> raid) | Section 2 | Boss |
| --- | --- | --- | --- |
| Oshodi | `oshodi.approach` Terminal Approach: 3 checkpoints, door `depot` -> `warehouseDispatchDepot`, return | `oshodi.railEdge` Rail Edge (field): clear 2 hawkers, escape the trailer hand to the footbridge, return | Oga Sunmola (`dispatchRelays`) |
| Mushin | `mushin.approach` Spare-Parts Row: 3 markers, door -> `partsStoreroom`, return | `mushin.market` Aisle Sweep (field): clear 3 runners, 2 markers, optional bonus door -> `partsStoreroom` | Madam Ronke |
| Fadeyi/Somolu | `fadeyiSomolu.approach` Toll Approach: clear 2 marshals, 2 posts, door -> `junctionToolShed` | `fadeyiSomolu.junctions` Junction Run (field): 3 posts, escape the marshal | Marshal Kobo |
| Ebute-Metta | `ebuteMetta.approach` Yard Approach: 3 markers, door -> `junctionToolShed` | `ebuteMetta.railYard` Rail Yard Goods: a STANDALONE raid (`railYardGoods`) | Ikenna Wayside |
| Lagos Island | `lagosIsland.approach` Ledger Row: clear 2 auditors, 2 counters, door -> `recordsVault` | `lagosIsland.press` Press Run (field): 2 desks, escape the bureau auditor | Barrister Quill |
| Lekki | `lekki.approach` Gate Approach: 2 markers, door -> `standbyPlant` | `lekki.estate` Estate Sweep (field): clear the patrol, 2 posts, escape the hounds | Bamidele Halcyon |

Real vs placeholder: all eleven field missions are real sim data (tiles checked for reachability and escape fairness by `tests/field-nodes.test.ts`) but only **Oshodi section 1 has a scripted full playthrough** (`tests/field-missions.test.ts`, `tests/app/campaign-sections-flow.test.ts`); the others are tested per mechanic and for data validity, and are untuned against real play. Oshodi has intro/outro scenes and a Read-more text; the other districts have one-line objective cards and two-sentence summaries. Four districts' doors reuse another district's raid layout (only six raid ids exist): Fadeyi and Ebute both use `junctionToolShed`, Mushin's bonus door reuses `partsStoreroom`. Section rewards are small titles (`reward.section.<mission>`), kept apart from boss rewards.

## 3. Field mission legs (`src/sim/mission/field.ts`, data `fieldDefs.ts`)

A section field mission is a `state.mission` with `field` set (`MissionSpec.fieldId`); the boss missions never touch this code. Legs run in order; the last is always the return route.

| Leg | Done when | Failure |
| --- | --- | --- |
| `reachMarkers` | the human stands on each marker in order (lit one at a time) | clock |
| `clearGroup` | every enemy of the group is out (existing eliminations; campaign damage from combat-core applies to the fights themselves) | clock, lives |
| `escapeRoute` | the human reaches the exit; the group's bots hunt from the leg's start; a pursuer next to you for 40 ticks catches you | a catch costs a life, puts you on the checkpoint, sends the pursuers home |
| `door` | stand on the door for 60 ticks: `state.mission.pendingRaid` (a `RaidRequest`) is raised and the field waits; `resolveRaid(state, doorId, outcome)` answers | failed raid: a life lost, the door stays open; abandoned: no cost |
| `returnRoute` | stand on the return marker | clock, lives |

`resolveRaid` marks the door (done / failed / idle), carries `hpLeft` into the human's vitals when they have them (never above the maximum), counts a three-star raid as a bonus (it can earn the third star), advances the route when the door was the current leg, and puts the human on the return tile with 2 s of protection. A stale or mismatched answer changes nothing. Optional doors (`required: false`) are open from the start and only pay the bonus. `missionView` gains optional fields (`format: 'field'`, `fieldId`, `phaseText`, `legIndex`, `legCount`, `legKind`, `doors`, `pendingRaid`); the objective is the new `ObjectiveKind` member `fieldRoute`. The boss seat is `-1` (no boss); a lost life respawns at the checkpoint.

Stars: 1 cleared; 2 with at most one life lost; 3 also within the par time or with a three-star raid.

## 4. Save and resume (`src/campaign`)

`CampaignSave` is version 2: `sections` (status, attempts, clears, best stars of all 18) and `missions` (the 12 field and raid missions) plus `sectionRewards`. Only `cleared` is authoritative; `available`/`locked` are derived (`sectionStatus`, `missionStatus`) and written back by `refreshSections`. **Migration**: a v1 save (and the older list shape) loads as v2; every cleared district marks all its sections and missions cleared and pays their section rewards, so nothing is lost; repair never lets a mission count as cleared when an earlier one is not or its district is locked. Pure reducers `applySectionResult` (field outcome with `sectionMissionId`) and `applyRaidResult` (standalone raid): a loss or timeout only counts an attempt, a locked or unknown result is ignored, rewards are paid once, best stars and time are kept. A boss win (`applyMissionResult`) clears the district's sections too. `nextMission(save)` is the suggested mission: the map opens on its district and Continue starts it (the boss goes to its briefing). A mission in progress is **not** saved: only finished results are, so closing the page mid-mission restarts that mission.

## 5. App transition (`src/app`)

`MatchController.playRaid` keeps the running field state alive and PAUSED, plays the raid as the game in play (the renderer is handed the raid state), and `resumeField` swaps the field back, after `CampaignController` has answered the door with `resolveRaid` (its events are shown with the next frame). The raid ends on `state.raid.outcome` (raid-sim) or, as a safety net, when its match ends. Pause menu inside a raid: Resume, Retry raid (fresh raid, field still underneath), Leave raid (abandon, back in the field, door open), Back to campaign map (nothing saved). After a field mission the section result screen unlocks the next section and returns to the map (`ResultScreen` delegates to `SectionResultScreen` when `campaign.sectionResult` is set). Raid building is injectable (`CampaignDeps.buildRaid`, default `buildRaidGame` from `src/sim/raid/build`).

## 6. Tests

`tests/field-nodes.test.ts` (data), `tests/field-missions.test.ts` (every leg, door, resolveRaid, return, scripted Oshodi section 1), `tests/campaign-sections.test.ts` (content, status, reducers, migration, repair, save and resume), `tests/app/campaign-sections-flow.test.ts` (the vertical slice through the real controllers, raid failure and retry, pause actions, boss gate), `tests/ui/sectionScreens.test.ts`, `e2e/campaign.spec.ts`.

## 7. Known limits

`src/sim/raid/build.ts` here is a minimal stub with raid-sim's signature (the integrator keeps raid-sim's real file). Door raids do not feed the section's stars except through the three-star bonus. Enemy fights in field missions use the ordinary bots; the enemy kinds and projectile attacks of the expansion plan are not assigned to field enemies yet. Mid-mission save is out of scope.
