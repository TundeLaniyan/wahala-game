# Mission guidance: briefings, objective HUD and target pins

Worker `cg-guidance` (branch `claude/wahala-cg-guidance`, from production `0b89d09`). Founder feedback: players entered missions, Junction Blast raids above all, without knowing what to destroy, capture, activate or reach. The objective is now explained visually before play, reinforced in play, and confirmed when it completes. Decisions MG1-MG9 in `docs/DECISIONS.md`. Presentation and wording only: no rule, timing, position or save field changed.

Everything is DATA-DRIVEN from the mission, leg, boss-recipe and raid data. No UI or render code names a mission id or a coordinate, so the district re-authoring of the other workers (new arenas, moved checkpoints and equipment) flows through unchanged.

## What the player sees

| When | What | Where |
| --- | --- | --- |
| Before every field mission and standalone raid (map Start / Replay, Continue story) | The briefing screen: district and mission title, the picture of the actual target, ONE main objective with its real count ("DESTROY 3 RELAY BOXES"), one or two action lines ("USE GENERATOR BLASTS: ..." only where blasts are the only way), the blast pattern as words and a 5 x 5 diagram, the route as numbered steps (the main step gold), START MISSION and Back. A replay (mission cleared) shows the compact card: the picture and one line | `ui/campaign/MissionBriefScreen.tsx` (menu screen `missionBrief`) |
| Before a boss mission | The same card at the top of the existing boss briefing (compact once the district was cleared); the boss introduction and loadout are unchanged | `ui/campaign/BriefingScreen.tsx` |
| A field door hands over to its raid | The raid's instructions over the HELD raid (no tick runs, the field is held underneath): the marked crate, "DESTROY 3 MARKED CARGO", "CROSS-SHAPED BLASTS: a generator blasts along its row and column, walls stop it. Range 2 tiles each way.", the legend TARGET / OBSTACLE / EXIT, "When the last one goes, the exit opens in the south-east corner", START RAID | `ui/campaign/RaidBriefOverlay.tsx` |
| Pause | The same card, compact (the raid's while a raid is played) | `ui/campaign/MissionPauseInfo.tsx` |
| In play, the rail / mission dock | The objective block now leads with the objective's glyph, has a done / total counter ("DESTROY RELAY BOX 1/3", "SECURE RAIL PLAZA 12/25 s", "DESTROY MARKED CARGO 0/3"; checkpoints keep "1 OF 3") and the way there along the walkable route ("↗ 8 TILES", "→ 2 TILES · BLAST A PATH", "→ NO OPEN ROUTE") | `ui/FieldGoal.tsx`, `ui/RaidGoal.tsx` |
| A target completes | A rail notice with the count and the next step: "MARKED CARGO DOWN 1/3 ✓ · NEXT: MARKED CARGO", "... 3/3 ✓ · NEXT: REACH THE EXIT", "RELAY BOX WRECKED 1/3 ✓ · NEXT: DESTROY RELAY BOX"; in the world the target's pin pops and a wrecked piece of equipment throws a gold sparkle and ring (raid cargo already had its gold sparkle) | `app/raidNotices.ts`, `app/fieldGoal.ts`, `render/views/ObjectiveMarkers.ts`, `FieldEquipmentViews.ts` |
| In the world | A small pin over every LIVE target of the current objective, wearing the target's glyph: marked cargo (crate with the target cross), raid floor switches (smaller), the raid exit once open, the current destroy leg's equipment, the door of a door leg, the area of a hold leg, the escape exit and the return marker. Ordinary crates, barrels and later legs' targets wear none. Drawn over walls (no depth test), about half a tile, above the object; it goes faint when the fighter is next to its target | `render/views/ObjectiveMarkers.ts`, `objectivePins.ts` |
| Field missions, target off screen | The edge compass points along the first steps of the walkable route, not the straight line | `ui/MissionCompass.tsx`, `missionCompassModel.ts` |

### Glyphs (one shape per kind of thing, never colour alone)

| Glyph | Shape | Used for |
| --- | --- | --- |
| `cargo` | crate with the target cross | raid marked cargo (the briefing picture, the legend TARGET, the rail, the pin) |
| `crate` | crate with plain planks | ordinary crates / barrels (legend OBSTACLE); never pinned |
| `equipment` | cabinet with a power bolt | field equipment, boss objective nodes |
| `door` | door in its frame | field doors |
| `exit` | arrow out of a frame | raid exit, field escape exit, return marker |
| `checkpoint` | flag | walk-through checkpoints (their beacon keeps its arrow) |
| `area` | corner brackets and a dot | hold areas |
| `enemies` | two figures | a group to defeat |
| `switch` | floor plate and lever | raid floor switches |
| `boss` | crown | the boss step of a boss briefing |

Pin colour repeats the meaning (gold = destroy / hold, cyan = door, green = exit, white = switch); the shape alone already says it.

## Data model

- `app/missionBrief.ts` (pure, tested for all 21 missions and 6 raids): `missionBrief(sectionMissionId)` and `raidBrief(raidId)` return `{ objective: { verb, count, unit, line }, picture: { glyph, model, label }, action[], blast, blastRule, blastsOnly, steps[], legend[], exit, compact }`.
  - Field: the main leg is the first `destroyTargets` leg, else the door, the hold area, the group, the escape, the checkpoints (MG2). Counts: targets of the leg, enemies of the group, `holdSec`, markers. A door step names the raid behind it and its marked-cargo count.
  - Boss: the first phase of the boss's verb with the goal the sim resolves (`tuningFor`), every phase as a step, "BLAST <BOSS> 3 TIMES" from `recipe.hits`; the phase-one callout is the second half of the action line.
  - Raid: the number of `M` tiles of the layout, the marked hp, the bomb range, which obstacle kinds the layout holds, where the `E` tile is (corner / side of the board).
  - Blast pattern words come from `BLAST_RULE_BY_GAME`: field and boss missions "ROUND BLASTS" (radial), raids "CROSS-SHAPED BLASTS". A raid briefing never says round, radial or disc (tested).
- `app/routeGuide.ts`: `routeCue(grid, from, to)` (BFS over `state.tiles`; a solid target is reached from a neighbour; open floor first, then through crates, else a direction with no route) and `RouteCache` (recomputes only when the human's tile, the target or the half-second revision changes). `buildHud` puts the field cue in `HudSnapshot.fieldCue` and passes a route function to `raidGuidance`.
- `render/objectiveGlyphs.ts`: the glyph path data (SVG in the UI, `Path2D` in the pin textures).
- `render/briefPreview.ts` (loaded on demand, 1.9 kB): renders the in-game object once with the game's builders (`buildEquipmentPiece`, `markedCargoMaterial` + `cargoBoxGeometry`, `buildIcon`) in a throwaway offscreen WebGL renderer into a PNG data URL, cached per model. Without WebGL the card shows the glyph. Checkpoints, areas, groups and exits are light / floor effects with no still object: their picture is the glyph.
- `render/views/objectivePins.ts`: which targets wear a pin (pure, from `state.mission.field` / `state.raid`).
- Raid hand-over: `CampaignController.enterRaid` sets `CampaignUi.raidBrief` and `host.holdBriefing(true)`; `MatchController.holdBriefing` stops the fixed step like the load hold; START (`startRaidFromBrief`), leaving, retrying or the map release it.

## Cost

- Route BFS: about 0.1 ms on a whole district board (49 x 35 class; tested under 2 ms), run only when the human's tile or the target changes, or twice a second.
- Pins: one sprite each (at most a dozen), one cached 128 x 160 texture per glyph and tone. No new `QualityProfile` field; the pins are the same on every preset.
- Preview: one offscreen render per target kind per session, before the match (or under the held raid).

## Screenshots

`docs/screenshots/campaign-guidance-expansion/guidance/`, made with `scripts/guidance-shots.mjs` on the Low preset (`?q=low`): phone landscape 740 x 360 and 844 x 390 at device scale 2 (`-phone740`, `-phone844`) and desktop 1280 x 720 (`-desktop`). Scenarios: `brief` (the first field mission's briefing), `boss` (the Oshodi boss briefing with the card), `railedge` (Rail Edge on its relay-box leg: equipment pins, "DESTROY RELAY BOX 0/3", "← 2 TILES"), `raidbrief` (the depot raid's instructions over the held raid), `raid` (cargo pins, 0/3, the route cue), `raidexit` (after the last cargo: the exit pin, "EXIT REACH THE EXIT"), `pause` (the compact card in the pause menu). Reviewed: the cards fit both phone sizes without a page scroll; the raid briefing fills a 740 x 360 screen with START RAID on it; the rail's objective block stays left of the board and above its bottom row; the pins read at phone size (small: about half a tile). `e2e/mission-guidance.spec.ts` also writes its own pictures to `e2e-shots/` (not committed).

## Tests

- `tests/app/missionBrief.test.ts`: every mission id, objectives against the real legs / phases / layouts, counts, "USE GENERATOR BLASTS" exactly where only blasts work, raids cross and never radial, exit position, legend.
- `tests/app/routeGuide.test.ts`: the arrow round a wall, a solid target, a route through crates, a sealed target, the cache, the BFS cost.
- `tests/app/missionGuidance.test.ts`: the counter after a real blast wrecks a piece / marked cargo, the notices, the exit guidance after the last cargo.
- `tests/app/missionBriefFlow.test.ts`: Continue opens the briefing with no match under it, START plays it, a locked mission opens nothing; the raid is held under its briefing (real frames, no tick) until START, and leaving drops the hold.
- `tests/render/objective-pins.test.ts`, `tests/ui/missionBriefCard.test.ts`, `tests/ui/missionCompassRoute.test.ts`.
- `e2e/mission-guidance.spec.ts` (desktop and mobile): the field briefing (objective, live picture, START), the route cue, the pause review; the raid briefing at the door with the raid held, the cargo pins, three marked crates destroyed by generators laid with the `place` intent (counter, notices, pins), then the exit pin and guidance; rail blocks clear of the board's bottom row and the fighter.

## Gaps

- The preview is a still: no turntable. Checkpoints, areas, groups and exits use the glyph as the picture.
- The raid briefing comes back on every door entry of a first play (compact only on a replay of a cleared field mission).
- Retry from the result screen restarts at once without the briefing (the player has just played it).
- Pins are not drawn for boss-mission nodes: those keep their existing beacons and icons (`MissionViews.ts`).
