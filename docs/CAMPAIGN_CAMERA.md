# Campaign camera, minimap and asset lifecycle

Branch `claude/wahala-cg-camera` (from production `0b89d09`). Decisions CF1-CF7 (`docs/DECISIONS.md`). Not merged, not deployed.

Founder: missions still opened on too much of the environment; the player should see their immediate surroundings and be followed. This pass fixes the causes in the camera itself (no overlay), keeps the minimap to what the player has discovered, stops the per-match GPU leak, and adds the measurement tool the campaign workers share.

## 1. Causes found

| Where | What it did in a campaign mission |
| --- | --- |
| `render/cameraDirector.ts` `ESTABLISH = 0.5` | The first half of every countdown was the `overview` shot: for a field mission the whole sector fitted to the screen (`fitRect`, up to 30 x 19 tiles), for a boss or the finale (no sector) the **whole district** (63 x 47 tiles for Oshodi). This is the "opens on too much of the environment" the founder saw. |
| `render/cameraModes.ts` `cameraModeFor(arenaId)` | The mode came from the arena id: a mission on a district map got City Rumble's `stadium` camera, a raid the fixed whole-board `arena` camera, and a NEW campaign-only map (the world worker's) would have got the fixed `arena` camera: its whole map on one screen for the entire mission. |
| The stadium framing itself | Built for a 32-fighter crowd: the focus sits low in the HUD-free band (`FOCUS_BAND_Y = -0.12`) and large boards pull back 12 % (`LARGE_ZOOM`). Measured at 740 x 360: 7.2 tiles visible north of the fighter but only **2.8 south**, where enemies' wind-ups and escape routes were off screen. |
| Arena bounds | A boss or finale (no sector) used the `free` shot: no bounds at all. A dead fighter waiting to respawn on a large board, or a lost match, cut to the **whole-district overview** (`isLargeBoard` -> `overview`), a full-city flash on every respawn. |
| `render/cameraRig.ts` `inBounds` | A hard clamp of the goal: the view slid at full speed into the sector edge and stopped dead (the damping hid most of it, but the pose could pass the edge while the distance was still easing). |
| Minimap (`ui/minimapModel.ts`) | Crops to the sector's clip (good), but a boss showed the whole district with every street and crate, as if all of it were playable. |
| Background world, sector clip (`render/sectorClip.ts`) | Not a cause. The clip already builds nothing beyond the sector plus the view's reach; the arena's set (backdrop) is built in full but sits outside the follow view and is frustum-culled. It was only on screen because of the establishing overview. |
| "Intro camera" | There is no separate intro camera: the boss introduction is a menu screen; the in-match intro is the countdown establishing shot above. |

## 2. What changed

### Camera mode `campaign` (CF1)

`cameraModeForMatch(state)`: a campaign mission (`state.mission`: field, boss, finale, the combat pilot) or a classic raid uses the new `campaign` mode; everything else is chosen by arena exactly as before (`arena` for standalone Classic, `stadium` for City Rumble; `tests/render/camera.test.ts` and `tests/rumble-camera.test.ts` unchanged and passing). `?cam=stadium` still overrides. The mode is decided from the match, never from an arena id, so a campaign-only map needs no registration. The O key / camera button toggles any follow camera (it already did for field missions on Rumble maps).

### The shot (`cameraDirector.ts` `campaignShot`, CF2-CF4)

- **Opening:** no establishing overview. The countdown opens on the fighter from 1.3 times the play distance and glides in by mid-countdown (smoothstep goal, smoothed by the rig), so the first frame already shows the fighter and the few streets round them.
- **Play:** the follow camera on the fighter with a small look-ahead. Dangers that can reach the fighter (a generator whose cross covers them, a vehicle about to pass) widen the view, but only inside a 7 x 5 tile box round the fighter (`clampKeep`). Rivals do not pull the view (it would breathe in and out all the time in a crowded mission).
- **Framing (measured, CF2):** the focus sits at 0.2 of the HUD-free band (above centre, so the near side gets room) and the distance is 1.15 times the action camera's. See section 3.
- **Bounds:** the sector's box (or, without a sector, the board plus 2 world units; a raid's board plus 1.2) with the rig's HUD margins. A respawn wait keeps watching the fighter's spot; a win ends on a close-up of the winner (0.8); a loss stays on the fighter. Never the whole district.
- **The player's setting is respected (CF4):** with the whole-view setting (`cameraView: 'overview'`, Settings or O), the campaign shows the bounded overview (the sector, the raid board) and never the city. The default remains the follow view.

### The rig (`cameraRig.ts`, CF3)

- `softClamp`: the look-at point eases into the bound over the last 1.6 world units (continuous, continuous slope, never past the limit) instead of stopping dead.
- While the distance is still easing (the opening glide, a danger leaving the frame), the smoothed position is held inside the bounds for the distance the camera has now, so the view never passes the sector edge in between. It only binds in those moments.
- `shot.bandY` places the focus in the band; `shot.fixedIfFits` lets a raid keep the fixed framing (below).

### Raids (CF5)

A raid that fits the screen keeps the fixed whole-board camera, identical to Classic Battle; a raid that does not follows the fighter, bounded to its board, with exact grid movement unchanged (the camera is presentation only). "Fits" is decided per screen by the rig (`boardFitsFixed`): the whole-board view's tiles are at least 95 % of the size the standard 15 x 11 board gets on that same screen, or at least 25 px (what the standard board gets on a 740 x 360 phone, 25.5 px: the size Classic Battle is played at on the smallest supported phone), or at least as big as the follow camera's. In practice only the two 17-wide raids follow, and only on phones narrower than about 800 px.

Measured tile size at the board's centre (CSS px):

| Board (raids) | 1280 x 720 fixed | 740 x 360 fixed | 844 x 390 fixed | Follow tile (740 / 844 / desktop) | Result |
| --- | --- | --- | --- | --- | --- |
| 13 x 9 (Junction Tool Shed, Standby Plant) | 64.3 | 29.5 | 34.0 | 40.0 / 43.3 / 79.4 | fixed everywhere |
| 15 x 11 (Parts Storeroom; the standard board) | 56.3 | 25.5 | 29.4 | | fixed everywhere |
| 15 x 13 (Records Vault) | 50.0 | 24.8 (97 %) | 28.5 (97 %) | | fixed everywhere |
| 17 x 11 (Rail Yard Goods) | 56.3 | 23.0 (90 %) | 26.6 (90 %, >= 25 px) | | follows at 740 x 360; fixed at 844 x 390 and on desktop |
| 17 x 13 (Warehouse Dispatch Depot) | 50.0 | 22.4 (88 %) | 25.9 (88 %, >= 25 px) | | follows at 740 x 360; fixed at 844 x 390 and on desktop |

Following a raid on a 740 x 360 phone, the fighter on every open tile of both following raids stays within 0.75 of the screen centre horizontally (clear of the raid cross and the action buttons) and inside the HUD-free band (`tests/render/campaign-camera.test.ts`). Standalone Classic is untouched.

## 3. Framing measurements (CF2)

Visible floor round the fighter in open ground (tiles; the HUD-free band; Oshodi district, play phase):

| Framing | Screen | North | South | West / East |
| --- | --- | --- | --- | --- |
| Stadium (before) | 740 x 360 | 7.2 | 2.8 | 7.0 |
| Stadium (before) | 1280 x 720 | 7.6 | 2.9 | 6.1 |
| Campaign (focus 0.2, zoom 1.15) | 740 x 360 | 6.6 | 5.0 | 9.0 |
| Campaign | 844 x 390 | 6.6 | 5.0 | 9.4 |
| Campaign | 1280 x 720 | 6.9 | 5.1 | 7.8 |

Candidates measured (740 x 360, north / south): focus -0.12 zoom 1.3: 9.4 / 3.7; focus 0 zoom 1.2: 8.0 / 4.1; focus 0.1 zoom 1.3: 8.0 / 5.0; focus 0.2 zoom 1.1: 6.3 / 4.8; **focus 0.2 zoom 1.15: 6.6 / 5.0**; focus 0.2 zoom 1.3: 7.4 / 5.7. The chosen pair is the closest to the target ("about 5-6 tiles on every side") with the smallest pull-back: the three-quarter perspective always shows more ground to the north than the south, and the sides are set by the screen's aspect. Tiles stay about 40 px on a 740 x 360 phone (the whole-board Classic camera gives the standard board 25.5 px there), so generators, red ground telegraphs and escape routes read clearly.

First frame of a mission (the countdown's opening shot, 740 x 360; `tests/render/campaign-camera.test.ts`): the visible floor is 17 % (Oshodi approach, rail edge, boss), 24 % (Mushin approach) and 34 % (Ojuelegba return, a 45 x 33 board) of the board, always smaller than the old establishing view, and holds the fighter. Where the fighter starts at a sector edge (Oshodi approach starts two tiles from the west barricades) the camera stays on the sector, so the fighter sits left of centre with the 5 tiles of street up to the barricades in view.

Smoothness (real movement, `tick`, oshodi.approach walked from the gate to the far end of the sector at 60 frames a second): the camera moves at most 0.095 world units in a frame (walking is about 0.11) and its speed changes by at most 0.029 a frame (the look-ahead flipping when the fighter turns), on 740 x 360 and 1280 x 720; it stops against the soft edge, never past it.

## 4. Minimap (CF7)

`ui/minimapDiscovery.ts`: a per-match bitset in the UI, kept in a `WeakMap` by the match's state object (a raid entered from a field mission keeps the field state, so the map remembers on the way back), never in the simulation (the state is byte-identical after an update, tested). Discovered tiles:

- the mission's sector (its rects, the playable area the barricades close) from the start;
- every tile within 6 (Chebyshev) of a tile the human has stood on (about what the follow camera shows);
- the route to the current objective (`fieldGoal`, or a boss phase's live nodes): the shortest path through anything but concrete from where the human stands when the objective changes, one tile each side, and 2 tiles round the objective. Recomputed only when the objective changes (one breadth-first search of at most 75 x 39 tiles).

Undiscovered tiles draw flat and dark: no streets, buildings, crates, barricades, hazards, generators or rivals. The objectives, telegraphed strikes, the closing city and the fighter always show. The camera's field-of-view box on the map is the campaign framing's (18 x 11.5 tiles). City Rumble is unchanged (no discovery). No fog-of-war renderer: the static map layer is redrawn only when the discovered set grows.

At the start of the Oshodi rail edge mission the map knows under 30 % of the district (the sector, the fighter's surroundings and the route to the first objective); a boss starts with under 20 %.

## 5. Asset lifecycle (CF6)

**The leak:** every match start left about 42 textures and 4 geometries on the GPU (baseline `0b89d09`: 175 -> 217 -> 259 textures over three starts of oshodi.approach).

**Traced** in the browser with a probe on `renderer.properties.get` and `renderBufferDirect` over three loads of one mission, keeping only resources used in load 2, not used in load 3 and never disposed: all 42 textures were **12 x 12 float `DataTexture`s, the bone textures three.js creates for each `Skeleton`**. `AssetLibrary.instance` clones a rig with `SkeletonUtils.clone`, which gives every copy (fighters, enemies, street life, crowds) its own skeleton; the renderer makes a skeleton's bone texture the first time it draws it, and only `Skeleton.dispose()` releases it. Nothing called it. The earlier note (docs/CAMPAIGN_SECTOR_AI.md, "Still open": "library GLB textures, the ImageBitmap map / normal / ao that every match copies") was a misattribution: the library's GLB maps are shared by every copy and were never duplicated. The 4 geometries: the environment map's sky dome and sun sphere (built for PMREM and dropped), the arena floor plane and the contact-shadow plane (and its material).

**Fixed:** `releaseSkeletons(root)` (asset library) disposes each skeleton under a root once; `GameRenderer.unload` calls it on the whole scene before clearing it, so every consumer, present and future, is covered (a copy drawn again simply gets a new bone texture). `lighting.ts` disposes the sky scene after the environment is built and the sun's shadow map with the match; `ArenaView` owns and disposes its floor and contact geometries, the contact material and the slab-atlas floor maps it loads (never a shared cached texture). The procedural fallbacks and the adaptive quality controller are untouched (no shared resource is disposed).

Found by the restart runs as well: each raid door's 18 boxes and the crowd zones' pose geometries (section 6), both now released with their views.

**Proved:** `e2e/campaign-camera.spec.ts` (four starts in one page, A A B A: the counts stay flat) and `scripts/campaign-perf.mjs --restarts=3` (section 6).

## 6. Measurements

`scripts/campaign-perf.mjs` (reusable by the world worker and the integrator; every hook it needs exists on `0b89d09`). The baseline table is `docs/measurements/campaign-guidance-expansion-baseline.md`.

**Software rendering:** Chromium with SwiftShader (software WebGL) on four shared container cores. Frame times are hundreds of milliseconds to seconds a frame and only a handful of frames fit in a sample: they compare builds on the same machine and are not phone timings. No claim about real phones is made.

One mission per fresh page (740 x 360), production `0b89d09` before and this branch after (`scripts/campaign-perf.mjs default low,high`; the full rows, with the transfer sizes, are in `docs/measurements/campaign-guidance-expansion-baseline.md`):

| mission | quality | draw calls before / after | triangles before / after | geometries before / after | textures before / after | build ms before / after | frame mean ms before / after (frames) | AI ms / tick before / after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `field:oshodi.approach` | low | 228 / 231 | 867009 / 867173 | 254 / 214 | 175 / 139 | 2301.1 / 4269.6 | 1054.1 (4) / 1112.2 (4) | 0.31 / 0.44 |
| `field:oshodi.railEdge` | low | 317 / 286 | 752587 / 717589 | 300 / 234 | 207 / 164 | 3965.9 / 4172.5 | 1184.5 (4) / 1047.8 (5) | 0.9 / 0.91 |
| `boss:oshodi` | low | 179 / 182 | 1229833 / 1234675 | 299 / 221 | 205 / 155 | 7395.7 / 5156.8 | 2322.3 (3) / 1551.4 (3) | 1.93 / 1.27 |
| `field:mushin.approach` | low | 216 / 220 | 684344 / 686978 | 316 / 212 | 202 / 148 | 5850.6 / 3816 | 1207 (4) / 981 (5) | 0.59 / 0.59 |
| `field:ojuelegba.return` | low | 235 / 238 | 676391 / 676412 | 298 / 230 | 201 / 173 | 10996.3 / 2137 | 1604.5 (3) / 589.8 (8) | 0.37 / 0.2 |
| `raid:warehouseDispatchDepot` | low | 336 / 321 | 548122 / 536916 | 270 / 265 | 209 / 204 | 8204.9 / 2022.9 | 3023.5 (2) / 704.1 (6) | 0 / 0 |
| `raid:junctionToolShed` | low | 278 / 289 | 454570 / 454581 | 246 / 244 | 199 / 199 | 4548.7 / 1785.6 | 2319.1 (2) / 997.2 (5) | 0 / 0 |
| `field:oshodi.approach` | high | 513 / 515 | 2184929 / 2185105 | 294 / 269 | 231 / 196 | 8733.3 / 3669.4 | 3520 (2) / 2638 (4) | 1.17 / 0.31 |
| `field:oshodi.railEdge` | high | 630 / 589 | 1824073 / 1771469 | 337 / 308 | 268 / 235 | 16535 / 3969.9 | 3490 (3) / 2298.3 (4) | 1.67 / 1.48 |
| `boss:oshodi` | high | 476 / 477 | 2985180 / 2979636 | 336 / 303 | 307 / 267 | 9170.2 / 4233.1 | 4355.8 (3) / 2501.6 (2) | 2.15 / 1.37 |
| `field:mushin.approach` | high | 559 / 563 | 2097902 / 2100532 | 353 / 303 | 276 / 242 | 2354.7 / 3736.8 | 2359.6 (2) / 2330 (4) | 1.11 / 0.88 |
| `field:ojuelegba.return` | high | 517 / 523 | 1668071 / 1668141 | 321 / 275 | 257 / 238 | 8502.1 / 3979.2 | 3826 (3) / 1752 (3) | 0.86 / 0.42 |
| `raid:warehouseDispatchDepot` | high | 596 / 578 | 1462653 / 1457918 | 280 / 278 | 252 / 248 | 6213 / 2085.7 | 5103.4 (1) / 2703.6 (3) | 0 / 0 |
| `raid:junctionToolShed` | high | 522 / 521 | 1310040 / 1310016 | 250 / 248 | 242 / 242 | 3406.8 / 2412.1 | 4921.4 (1) / 4818 (1) | 0.01 / 0 |

Reading it: the camera does not change the scene that is built, so draw calls and triangles stay within a few per cent (the follow view and the old one both see a sector-sized patch once play starts; the warehouse raid now follows on this phone: -4 % draw calls). Live geometries and textures at the first start are lower (oshodi.approach 254 / 175 -> 214 / 139 on low): the GPU only uploads what has been drawn, and the old opening overview drew every rig and object of the sector or district once. Initial load: 19,897 KB (14,277 KB gzip) against 19,895 KB (14,275 KB): +2 KB of code. Build and frame times on software WebGL vary more between identical runs than between the builds (and part of the baseline run shared the machine with the "before" screenshot run); no claim is made from them.

GPU resources across restarts, one page, low (`--restarts`, `--cycles`):

| Sequence | Before (`0b89d09`) geometries / textures | After |
| --- | --- | --- |
| oshodi.approach x3 | 254 / 175, 258 / 217, 262 / 259 | 214 / 139, 214 / 139, 214 / 139 |
| then the Oshodi boss, then oshodi.approach | 316 / 330, 282 / 376 | 227 / 156, 220 / 145 |
| A B A B A B A (oshodi.approach, boss) | | 214 / 139, 227 / 156, 220 / 145, 227 / 156, 220 / 145, 227 / 156, 220 / 145 |
| warehouse raid x3 | 270 / 209, 292 / 260, 314 / 311 | 265 / 204, 265 / 204, 265 / 204 |
| then oshodi.approach, then the raid | 339 / 353, 347 / 410 | 236 / 192, 270 / 205 |

After the fixes the same mission restarts flat, and alternating missions stays bounded: the first visit of another mission leaves a handful of shared, cached resources (6 geometries, 6 textures for the boss's enemy looks; 5 / 1 for the raid) that later visits reuse.

Two more owners were found by the restart runs: each raid start left its doors' 18 boxes (`views/RaidViews.ts`, now disposed with the door), and a mission whose living environment has crowd zones (the boss on the whole district) left 6 crowd pose geometries (`life/CrowdZones.ts`, baked copies from `assets.parts`, now the crowd's own).

## 7. Screenshots

`docs/screenshots/campaign-guidance-expansion/camera/` (taken with `scripts/campaign-camera-shots.mjs`): `before/` is production `0b89d09`, `after/` this branch; `<mission>-<screen>-start.jpg` is the first frame of the mission (the countdown's opening shot) and `-play.jpg` the follow camera in play, on a 740 x 360 and an 844 x 390 phone (device scale 2) and a 1280 x 720 desktop.

What they show (740 x 360): **before**, the Oshodi approach opens on the whole sector (the fighters are a few pixels tall) and the Oshodi boss on the **whole 63 x 47 district**; the warehouse raid is the fixed whole-board view with 22 px tiles. **After**, every mission opens on the fighter and the few streets round them (the boss: the "You" fighter at the depot corner, the buses and stalls next to them, the minimap showing only the discovered streets and the route), play follows them, and the warehouse raid scrolls with 40 px tiles. At 844 x 390 and on desktop the raid keeps the fixed view.

Known look: where the fighter stands at a sector's south edge (the Oshodi approach start is two rows from it), the bound lets the view show the sector's 3-tile `viewMargin` of street beyond it (sector data), so the lower part of the screen is wall and pavement; the stadium camera, with its focus lower on screen, rarely reached that bound. The world worker's maps can set a smaller `viewMargin` (the rig never uses less than its own HUD margin, 2.2 on a phone).

## 8. Tests

- `tests/render/campaign-camera.test.ts`: the modes (campaign / arena / stadium, override), standalone Classic framing and City Rumble's shot unchanged; every listed mission's first frame centred on the fighter, a small part of the board and smaller than the old establishing view (740 x 360 and desktop); the countdown glide; the whole-view setting; at least 4.8 / 6 / 6 / 6 tiles south / north / west / east (740 x 360, 844 x 390, desktop); a real-movement walk to the sector's far end with no jump and never past the edge; `softClamp`; raids follow or stay fixed as in the table (740 x 360, 844 x 390, desktop) and keep the fighter clear of the screen edges on every open tile; `releaseSkeletons`.
- `tests/render/minimap-discovery.test.ts`: the sector, the surroundings and the objective route are known, the district's far corners are not; discovery grows with a real walk; the route is not recomputed every frame; the map's layers leave out undiscovered crates, rivals and hazards but keep the objectives; no discovery in City Rumble or Classic; the match state is untouched.
- `e2e/campaign-camera.spec.ts`: on a 740 x 360 phone a field mission's first frames show under 40 % of the district and hold the fighter, a walk moves the camera, a 17 x 13 raid scrolls and a 13 x 9 raid stays fixed; on desktop four starts (A A B A) keep the GPU counts flat; no page errors. `e2e/raid-render.spec.ts` now expects the `campaign` mode for a raid (it was `arena`) and still requires the whole board in view at 1280 x 720 and 844 x 390.
- Existing camera tests unchanged and passing: `tests/render/camera.test.ts`, `tests/render/camera-sector.test.ts`, `tests/rumble-camera.test.ts`, `tests/input-raid-cross.test.ts`, `e2e/campaign-sectors.spec.ts`, `e2e/rumble.spec.ts`.

## 9. For the other workers and the integrator

- A campaign-only map needs nothing for the camera: a mission state (`state.mission`) gets the campaign camera, its sector (or its whole board) bounds the view, and the minimap discovers it.
- **HUD rail in a following raid (open, for the guidance worker):** in a raid that follows (the 17-wide raids on a 740 x 360 phone), the board's screen corners leave the screen, so `renderer.boardScreenCorners()` (the HUD rail's sizing, `ui/HudRail.tsx`) reports off-screen points and the rail falls back to its minimum width over the board's upper-left tiles (visible in `after/warehouseDispatchDepot-phone740-play.jpg`: the DESTROY MARKED CARGO block). The rail should treat a following raid like the Rumble follow camera (`__WAHALA__.camera().framing === 'follow'`; the renderer's `cameraStatus()`). Not changed here: `ui/HudRail.tsx` is the guidance worker's. `e2e/raid-render.spec.ts` checks the rail at 844 x 390, where every raid is fixed.
- `__WAHALA__.camera()` reports the mode, the framing (`fixed` / `follow` / `overview`) and the visible floor in grid tiles, for e2e checks of new maps.
- `scripts/campaign-perf.mjs [missions] [low,high] [--restarts=N] [--dist=<dir>]` compares maps; pass `--dist` pointing at the build that is being served so the gzip column is right.
