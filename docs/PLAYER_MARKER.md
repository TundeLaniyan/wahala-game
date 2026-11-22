# Player identification marker

Branch `claude/wahala-player-marker` (from production `ee939a3`), decisions PI1-PI6 in `DECISIONS.md`. Render-only: no sim, AI or input change.

## Why the old marker failed

The local player was marked by a slot-coloured ring (the same ring every fighter has), a "You" name tag in the same small font and plate as every rival's name tag, and a 0.48-tile chevron 0.4 tiles above that tag. At the fixed whole-arena camera (a phone shows a fighter about 35 CSS px tall):

- **Size and style:** the chevron is a quarter of a tile, with no outline, and the "You" tag is indistinguishable from "Door Warden" next to it. Nothing in the picture says "this one is mine" except a colour the ring already shares.
- **Crowds:** rivals stand in the player's screen column (the camera looks over the board's rows), so their name tags and heads sit exactly where the chevron and the "You" tag float; in the night vault the dark plates of five tags overlap into a smear.
- **Contrast:** a pale green chevron on a pale day floor and a green name on a dark plate in the dark vault both lose against the board; the rings of the rivals are as bright as the player's.
- **Depth:** both sprites already skip the depth test, so occlusion by bodies is not the cause; scale, sameness and tag clutter are.

## What changed

`src/render/playerMarker.ts` holds the style (`original` | `indicator` | `indicatorGround`, default `indicator`) and the pure prominence curve; `src/render/views/youMarker.ts` is the one sprite (and one optional floor mesh) per local human; `PlayerViews` reads `playerMarkerMode()` every frame. `__WAHALA__.playerMarker(mode?)` (with `?debug`) reads or switches it live.

| Style | Draws |
| --- | --- |
| `original` | Exactly what the game drew: the chevron and the "You" name tag. |
| `indicator` (default) | One "YOU" tag instead of both: a dark plate with a dark outer halo, a hairline and a pointer in the fighter's colour, pointing at the head. Rival name tags and every ring are unchanged. |
| `indicatorGround` | The indicator plus a faint floor-contact tint with a thin crescent toward the camera, opacity 0.34-0.54 (the ring is 0.98). An experiment the founder has not approved; reachable only by `setPlayerMarkerMode`. |

Behaviour of the tag: local human only (none in attract or bot-only matches); hidden while the player is down and shown again on respawn; steady during spawn protection; lifted with an Okada rider. Prominence runs from 0 (alone: 0.78 scale, 0.62 opacity) to 1 (1.12 scale, full opacity) from the summed proximity of living rivals within about 2 tiles (full at 1.2, none at 2.4) or standing in the player's screen column; eased fast up, slowly down. No depth test or write, render order 40 (above the name tags at 31, the chevron at 32, stars and badges at 33), fog and tone mapping off. One sprite, one cached texture per colour, no lights, no per-frame allocation; it has no quality rung because it costs two triangles.

The ground mark and the tag are the only additions; a stacked scene remains hard to read by bodies alone (a rival directly north hides the player's head), which is what the tag is for and why the ground style exists as an experiment.

## Measurements

`__WAHALA__.stats()` (median of five samples, software rendering, crowded scene, marker style switched live on the same frame of the same scene; `measurements.json`). The marker is inside the scene's own frame-to-frame noise (+-5 draw calls from fx and ambient) and adds two triangles.

| Scene | Quality | Draw calls original / indicator / ground | Triangles original / indicator / ground |
| --- | --- | --- | --- |
| Day, phone | Low | 259 / 260 / 261 | 435179 / 435246 / 435162 |
| Day, desktop | Low | 255 / 254 / 255 | 433260 / 433279 / 433247 |
| Day, desktop | High | 529 / 531 / 530 | 1283042 / 1283073 / 1282984 |
| Night, phone | Low | 237 / 233 / 233 | 317825 / 317817 / 317817 |
| Night, desktop | High | 354 / 350 / 349 | 570889 / 570881 / 570879 |

(The day High phone original sample, 539 / 1416269, caught the one-time on-demand model upload before settling; the other samples are within noise.)

## Screenshots

`docs/screenshots/player-marker/`, made by `scripts/player-marker-shots.mjs` (a staged crowd: the human with the rivals adjacent; `scene-quality-device-mode.jpg` plus `-crop.jpg` close-ups around the player):

- Day (Classic match on Danfo Bus Park, 3 rivals) and night (Records Vault raid, 5 enemies), at Low and High, on phone landscape 844x390 at deviceScaleFactor 2 and on desktop 1280x720.
- Modes: `original`, `indicator`, `indicatorGround`, and `indicator-alone` (nobody near: the subtle state).
- `measurements.json`: the draw calls and triangles above, all rows.

## Tests

`tests/render/player-marker.test.ts`: the style switch and default; `original` unchanged; only the local human; prominence rises with rivals and relaxes without popping; hidden when dead; drawn on top (no depth test, highest render order). Run: `npx vitest run tests/render/player-marker.test.ts`.

## v2: the Ground style was invisible (Test Lab round 2, decision TL8)

The founder liked Indicator and Indicator + Ground, but switching between the styles in the Test Lab showed no obvious
difference. Checked in a real browser (phone landscape, the Test Lab's "Player-identification variants" scene): the switch
was never broken. The entry card, the pause menu and the HUD button all call `setPlayerMarkerMode`, `PlayerViews` reads
`playerMarkerMode()` every frame (one module instance, no stale React state), `__WAHALA__.playerMarker()` followed every tap,
and Original showed the old chevron and "You" name tag while Indicator showed the YOU plate in their place. What could not be
seen was Ground against Indicator: a 30 % white tint under a one-pixel crescent at 0.34-0.54 opacity. The floor mark is now a
soft disc with a dark-outlined ring in the fighter's colour, 1.75 tiles wide (the fighter's own ring: 0.96) at about
0.6-0.85 opacity with a slow small pulse. Still render-only, a flat decal with no light or depth write, and `indicator`
remains the default. Screenshots: `docs/screenshots/player-marker/lab-*-v2.jpg` (Test Lab depot scene, phone landscape
844x390 at 2x; `scripts/player-marker-v2-shots.mjs`). Tests: `tests/render/player-marker.test.ts` (three styles, three sets of
visible parts; mark size and opacity), `tests/testlab/marker-switch.test.ts` (the switch reaches the renderer),
`e2e/testlab.spec.ts` (real pixels around the player differ between the three styles).

