# Classic lighting: readable raids and one night raid

Branch `claude/wahala-cl-night` (from production `514be88`). Decisions NL1-NL9 (`docs/DECISIONS.md`). Founder brief:
some Classic environments were excessively dark. Do not brighten everything; ship two categories only:

1. **Normal stages**: properly lit and readable (own fighter, enemies, cover, generators and blast warnings, objectives,
   exits, corridors), restrained, not washed out.
2. **Deliberately dark stages**: genuine darkness where a flashlight and selective light are gameplay, and only with
   working light tools. A dark stage whose flashlight does not work never ships.

## P0: the defect (every raid wore the bus park)

`render/arenas/raidArt.ts` keyed the raid art table by RAID id (`warehouseDispatchDepot`), but `GameState.arenaId` of a
raid is its SIM arena id (`raidWarehouseDispatchDepot`, `RaidDef.arenaId`), and its fallback looped `ARENAS`, which by
design excludes raid boards (`RAID_ARENAS`). So no raid board ever found its art: `arenaLook()` fell back to Danfo Bus
Park (smoggy late-afternoon brown, exposure 1.04, four sodium lamps that Low drops), `arenaSet()` to the bus park set
and the floor to the bus park tarmac. Every raid since the raid art landed (decision RR9) rendered as a brown bus park
with the designed warehouse / yard / storeroom art never shown.

**Fix (NL1):** the variant is chosen per raid id (`RAID_VARIANT_BY_RAID`) and registered under the raid's sim arena id
for every id in `RAID_ARENA_IDS` (`raidVariantOfArena`, `raidArtTable`). `tests/render/raid-art.test.ts` builds a real
game of every raid and checks its look, set and floor are its variant's (never the bus park's).

Measured on the rendered picture (`scripts/classic-lighting-shots.mjs`, desktop 1280 x 720, software GL, seed 7, past
the countdown; floor = mean / p10 / p90 luminance 0-255 of the open floor; fighter / enemies = contrast against the
floor around them; draw calls and triangles of the frame):

| Raid (variant) | Before (bus park), Low: floor mean / p10 / p90, fighter | After, Low | After, High |
| --- | --- | --- | --- |
| Dispatch Depot (warehouse) | 61 / 41 / 80, 0.33 (350 draws, 547k tris) | 84 / 37 / 117, 0.80 (274, 373k) | 108 / 54 / 161, 0.89 (406, 694k) |
| Parts Storeroom (storeroom) | 54 / 34 / 75, 0.33 | 76 / 49 / 94, 0.66 | 74 / 47 / 96, 0.68 |
| Junction Tool Shed (yard) | 53 / 29 / 76, 0.25 | 128 / 98 / 155, 0.61 | 104 / 63 / 142, 0.57 |
| Rail Yard Goods (yard) | 52 / 30 / 71, 0.45 | 98 / 30 / 151, 0.74 | 100 / 43 / 141, 0.78 |
| Standby Plant (warehouse) | 51 / 29 / 76, 0.23 | 102 / 51 / 133, 0.71 | 120 / 66 / 158, 0.86 |
| Records Vault (storeroom) | 64 / 45 / 80, 0.40 | the night raid (below) | |

Judged on the pictures: before, every raid was the same smog-brown bus park with brown pillars on brown tarmac; after,
the warehouse reads as cold concrete with dark racking blocks, the storeroom as damp grey concrete under the deck, the
yard as warm sunlit cinder. None is washed out (the brightest, the sunlit tool shed, has p90 155 / 255) and none is
muddy on Low, so **no raid look was retuned**: the darkness was the defect, not the looks. The obstacle "top face vs
floor" contrast is low for the concrete looks (0.03-0.09) but the blocks separate by their dark sides and shadows,
which that number does not sample; the fighter's contrast is the number that doubled.

## Readability measurement (NL2)

Two checks, one on the rendered pixels (the real one) and one in code (the guard rail):

- `scripts/classic-lighting-shots.mjs <outDir> <targets> [low,high] [desktop,phone]` starts each raid (`raid:<id>`) or
  standard Classic match (`arena:<id>`), plays past the countdown, screenshots, and measures the PNG in the page with
  the renderer's own camera: the walkable floor's mean / p10 / p50 / p90 luminance (0-255, a 7 x 7 px window at every
  open tile's centre), the solid tiles' top faces, the obstacle-vs-floor contrast `|solid - floor| / max`, the local
  fighter's chest-height window against the floor around him, and the same for every enemy.
- `src/render/readability.ts` `readabilityIndex(look, 'low' | 'high')`: light reaching the floor (hemisphere, the
  sun's vertical share, the lamps on High only), Low's x1.3 hemisphere lift for a look with lamps (as `lighting.ts`
  does), floor tint, exposure, then the fog at the fixed camera's ~20 units. `tests/render/classic-readability.test.ts`
  keeps every lit raid look between the approved standard arenas and a wash-out ceiling, on Low and on High.

Standard Classic arenas, measured with the same script on desktop Low (reported, NOT changed: competitive art; the
brief allows a change only when a board is clearly unreadable on Low, and none is):

| Arena | Floor mean / p10 / p50 / p90 | Obstacle contrast | Fighter contrast | Verdict |
| --- | --- | --- | --- | --- |
| Yaba After Dark | 45 / 16 / 24 / 117 | 0.39 | 0.28 | the darkest floor (median 24): dark asphalt read through its lit blue power tiles and crate tops; readable, deliberately night. High 48 / 17 / 31 / 121 (Low loses little) |
| Lekki Roadworks | 40 / 24 / 34 / 62 | 0.05 | 0.53 | night shift: dim but even; tyre stacks and crates separate by shape |
| Danfo Bus Park | 44 / 27 / 41 / 67 | 0.12 | 0.18 | muddy brown on Low: the weakest fighter contrast measured; readable, but the first candidate if the founder wants a Low lift |
| Balogun Market | 81 / 50 / 85 / 108 | 0.12 | 0.41 | readable |

For scale: the lit raids after the fix measure 76-128 on Low, the bus-park-looking raids before it 51-64.

Gameplay overlays (blast danger lanes, vehicle lanes, raid warnings: `TileOverlay`) are now `fog: false` (NL3): a
warning is never washed towards the fog colour, in any arena. They were already unlit (`MeshBasicMaterial`), so no
light or darkness changes them.

## P1: the night raid (Records Vault)

**Choice (NL4):** the Records Vault, a night break-in on Lagos Island: four chambers stacked south to north behind a
corridor of doors (entrance hall, registry, archive, vault). Its walls and doors are exactly what makes a flashlight
matter (light stops at every wall, a door opening reveals a dark room), the chambers are small enough that a 5-tile
beam explores one at a time, and its enemies are door wardens, archive guards and a chief clerk (torch carriers) plus a
file thrower who stands in the dark. It already wore the under-bridge storeroom art. No other raid changes.

**Data (additive sim data only):** `RaidDef.lighting?: RaidLighting` (`mode: 'night'`, `practicals` (x, y, radius),
`torchKinds`). The vault: three small lamps (the entrance, the exit sign, the registry desk), torches on `guard` and
`lieutenant`. A raid without `lighting` is lit exactly as before.

**Light rule (`src/sim/raid/light.ts`, pure, deterministic, integer levels):**

| Light | Shape | Occlusion |
| --- | --- | --- |
| Fighter's flashlight | a cone in `Player.facing`, 5 tiles ahead, 3 / 3 / 5 / 5 / 7 tiles wide; level 255 near to ~65% at the end, edges a little dimmer | the straight line from the fighter's tile to the target tile (sampled at twice the tile rate) must cross no solid tile; a solid tile is lit (its face), nothing behind it |
| Personal radius | the 8 tiles around the fighter, always lit (walls included) | none |
| Guard torch | a cone in the guard's facing (`torchFacing`, today `Player.facing`), 4 ahead, 1 / 3 / 3 / 3 wide; never the guard's own tile | same as the flashlight |
| Lamps | a disc of `radius` around the lamp tile | same |
| Blast flames | the burning tile (240) and its four neighbours (120) | none |

`raidLightMap(state)` returns the three channels (fighter / guards / lamps) as `Uint8Array`s, reusing a buffer;
`tileRevealed(map, x, y, viewer)` is the rule for what the fighter can see: lit by ANY light (`>= LIGHT_TUNING.lit`, 48)
or within the personal radius. A guard's torch therefore never reveals the guard himself, but a fellow guard pointing at
him does.

**Darkness technique (NL5), no extra pass, no shadow, no new dynamic light:**

- The light map goes into a 15 x 13 RGBA `DataTexture` (one texel per tile, linear filtering for soft tile edges),
  eased per tile at ~14/s so a turning cone sweeps instead of snapping (`render/views/NightLightViews.ts`).
- The grit patch (`render/grit.ts`), which every lit material of the scene already carries, gained one block before
  `opaque_fragment`: from the fragment's world position it samples the map and multiplies the lit colour by a cold
  shade (`0x2a3a52`) where the tile is dark and by the light's tint (warm white flashlight, pale blue-white torches,
  sodium lamps) where it is lit. In every other match one uniform test skips it. Off the board everything is dark
  (unlit set bulbs and signs keep glowing).
- Per-material share `uNightK` from an ancestor's `userData.nightK`: generators keep part of their own light (0.45), so
  a generator in the dark is still a findable shape (NL6). Raid cargo / doors take the mask through a weathering-free
  grit class `night` (only in a night raid; lit raids keep `none`).
- Beams: one additive open cone per light (the fighter's warm, each torch carrier's cold; at most 9 draws), from hand
  height down to the floor, as long as the line of light along the facing (`reachAlong`, clipped at the first solid
  tile), turning with a shortest-angle lerp; a tiny shader fades it towards its silhouette so it reads as a soft beam,
  not a paper wedge. The floor light IS the mask, i.e. the rule's tile set (visual = rule).
- Quality: the mask, the eased levels, the lit tile sets and the hiding never read the preset (tested headless and in
  Playwright: Low and High light the same tiles). Only the beam's segment count does (10 on Low / Very Low, 16 above).
  The night look has no point lamps, so Low and High light the same way (Low's lamp drop and x1.3 lift do not apply).

**Hiding (NL7):** an enemy whose tile (and the tile its step started from) is not revealed is drawn like one off
screen (`PlayerViews.cull`: model, ring, name, badges hidden; its animation time is replayed when it shows again), and
gets no health pips (`DamageViews`). Awareness marks ("!", "?") and every attack telegraph stay: they are warnings
about the fighter, and a thrower's aimed tiles must always read. Objectives: a marked crate's floor ring glows only as
far as light reaches it; the objective pins stay (they are guidance, like the rail and the route arrow) but a pin over
a dark target is drawn at 55%, full once lit. Generator blast lanes are unlit, fog-free overlays above the mask:
always legible in the dark.

**Toggle (NL8):** none in play. The game has exactly two action buttons on every device and no third permanent button
may be added; the flashlight is always on and needs no aiming (it follows movement). `?nonight` (URL, measurement only)
renders the vault without its dark for comparisons; it is not a setting.

**Evidence** (`docs/screenshots/classic-lighting/night-recordsVault-*`: desktop 1280 x 720 and phone 844 x 390 at scale
2, Low and High, the fighter walking east along the entrance hall; and a generator laid at the entrance with its blast
lanes in the dark):

| Shot | Floor mean / p90 | Lit tiles: flashlight / torches / lamps | Hidden enemies | Fighter contrast |
| --- | --- | --- | --- | --- |
| Low desktop, walking east | 31 / 81 | 15 / 12 / 24 | 1 of 2 | 0.46 |
| Low phone | 30 / 83 | 15 / 12 / 24 | 1 of 2 | 0.09 (the warden stands on him) |
| High desktop | 28 / 70 | 15 / 6 / 24 | 1 of 2 | 0.31 |
| High phone | 28 / 70 | 15 / 6 / 24 | 1 of 2 | 0.24 |
| Low / High, blast warning | 25 / 64 | 9 / 7 / 24 | 1 of 2 | 0.62 / 0.68 |

(The torch counts differ between the Low and High runs because the wardens had turned differently in real time; the
frozen same-tick comparison in `e2e/night-raid.spec.ts` checks Low and High light the same tiles.) Judged on the
pictures: the board is genuinely dark (floor median 15 / 255, the cold residue), the hall reads along the flashlight
and around the entrance lamp, the registry desk lamp and the exit sign are islands of warm light, the warden standing
in the dark east of the hall is not drawn while his torch cone shows where he looks, the fighter and the warden next to
him read, and the blast lanes of a generator in the dark read in red over the black floor. The tuning took three
passes: the first beams were bright paper wedges hiding the floor (now a soft-edged cone at a fraction of the
strength), the first shade (`0x16202e`) left no trace of the maze (now `0x2a3a52`), and the lit-area look was raised
(exposure 1.18 -> 1.32, fill 1.2 -> 1.45) so a lit tile reads like a normal stage.

Not done / limits: the lit cone is tile-based, so its edge is soft but blocky at a wall's corner; the fighter's
flashlight points where he last moved or acted (`facing`), so standing still it keeps its direction; the "!" mark of an
enemy hidden in the dark still shows (a warning about the fighter, by design).

## P1b: light-based detection (designed, not implemented)

To be built after the raid enemy AI (territories, patrols, sight, facing) lands, on exactly the tile sets above:

- **Seen in a torch:** a guard notices the fighter when the fighter's tile is in THAT guard's lit torch set
  (`lightCone` with `torchFacing`, the same occlusion: no detection through walls or crates), within 4 tiles, in front
  of him (the cone is the facing), for a reaction time before the alert: about 0.5 s at the far end of the cone, 0.25 s
  at 1-2 tiles; leaving the cone before it elapses resets it (no instant detection).
- **Seen by his own light:** the fighter's beam is visible to a guard who has line of light (`lineOfLight`) to any tile
  of the fighter's lit cone within the guard's view; it extends the guard's detection range modestly (+1 tile, and
  +0.15 s slower reaction), never through walls. A fighter standing still facing a wall lights only the wall.
- **Dark is not invisible:** adjacent (Chebyshev 1) a guard notices by contact as today; noise rules (generators,
  blasts) stay the AI worker's.
- **Fairness:** the guard's cone the player sees is the cone that detects (same `raidLightMap` channel), every alert
  shows the "!" mark, and detection never depends on quality. Tests: detection only inside the drawn cone, never
  through a wall, the reaction time holds, the fighter's beam extends range by exactly one tile.

Implemented now for it: `src/sim/raid/light.ts` (`raidLightMap`, `lightCone`, `lineOfLight`, `tileRevealed`,
`torchFacing`, `carriesTorch`), exported from `src/sim`.

## Performance

Measured with `scripts/campaign-perf.mjs raid:recordsVault low,high` (740 x 360, software GL), the night raid against
the same raid with `QUERY='&nonight'` (no mask, no beams), on the same build:

| Records Vault | Draw calls | Triangles | Geometries | Textures |
| --- | --- | --- | --- | --- |
| Low, night / no night | 272 / 271 | 335,157 / 335,077 | 189 / 188 | 151 / 151 |
| High, night / no night | 382 / 381 | 600,292 / 600,164 | 190 / 189 | 157 / 157 |

The night adds one draw per visible beam (here only the fighter's: the perf script measures before the wardens
appear; at most 9 with every torch carrier alive, all sharing one geometry), 80 (Low) or 128 (High) triangles per beam, one
geometry and one 15 x 13 texture (the light map; the 1 x 1 default map is shared by every match). CPU: `raidLightMap`
for the vault with four torch carriers costs **4.4 us** a frame and the whole `NightLightViews.update` (eased levels,
texture bytes, beams, hiding) **68 us** (Node micro-benchmark, 20,000 frames): under 0.5% of a 60 fps frame. GPU: one
extra texture fetch and a few ALU ops per fragment of lit materials in a night raid only; elsewhere a single uniform
branch. Frame times could not be compared on this machine (another session's software-GL browser kept the 4 cores at
load 8; the perf script got 2-3 frames in 4 s either way), so no frame-time claim is made, and nothing is claimed for
phones. The lit raids got cheaper with the fix (the bus park set they used to load was heavier): Dispatch Depot on Low
350 -> 274 draws, 547k -> 373k triangles.

Bundle: main chunk +10.2 KB raw / +3.6 KB gzip (2,114,687 -> 2,124,895 bytes), the three.js chunk +17 bytes.

## Files

`src/sim/raid/light.ts`, `src/sim/raid/def.ts` (`RaidLighting`), `src/sim/raid/defs/recordsVault.ts`,
`src/render/nightMask.ts`, `src/render/grit.ts`, `src/render/views/NightLightViews.ts`, `src/render/GameRenderer.ts`,
`src/render/views/{PlayerViews,DamageViews,RaidViews,ObjectiveMarkers,TileOverlay,types}.ts`,
`src/render/arenas/raidArt.ts`, `src/render/arenas/raidStoreroom.ts` (`RAID_STOREROOM_NIGHT_LOOK`),
`src/render/readability.ts`; tests `tests/raid-light.test.ts`, `tests/render/{raid-art,night-raid,classic-readability}.test.ts`,
`e2e/night-raid.spec.ts`; tools `scripts/classic-lighting-shots.mjs`, `scripts/campaign-perf.mjs` (`QUERY`).
Screenshots: `docs/screenshots/classic-lighting/`.
