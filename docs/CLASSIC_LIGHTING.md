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
  shade (`0x6a7c9c`, about 20% of the lit light, NL14) where the tile is dark and by the light's tint (warm white flashlight, pale blue-white torches,
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

**Evidence** (`docs/screenshots/classic-lighting/night-recordsVault-*`: desktop 1280 x 720 Low and High, phone 844 x 390
at scale 2 Low, the fighter walking east along the entrance hall; and a generator laid at the entrance with its blast
lanes in the dark, Low and High). "Dark" = tiles no light reaches (`night.level` < 0.05), screen values 0-255:

| Shot | Dark floor / dark solid (contrast) | Lit floor | Dark / lit | Lit tiles: flashlight / torches / lamps | Hidden |
| --- | --- | --- | --- | --- | --- |
| Low desktop, walking east | 24.4 / 23.4 (0.04) | 62.6 | 0.39 | 15 / 10 / 24 | 0 of 2 (both in a torch) |
| High desktop | 27.9 / 23.7 (0.15) | 57.2 | 0.49 | 15 / 10 / 24 | 0 of 2 |
| Low phone | 23.4 / 23.0 (0.01) | 63.9 | 0.37 | 15 / 10 / 24 | 0 of 2 |
| Low / High, blast warning | 23 / 21 (0.10) | 55 | 0.43 | 9 / 7 / 24 | 1 of 2 |

Before the NL14 retune the unlit floor measured a median of 15 (near black) and the maze outside the light could not be
seen at all. Now (shade `0x6a7c9c`, about 20% of the lit light in linear terms; night look exposure 1.5) the pillar
lattice, the chamber walls and the corridors read as dim cold silhouettes on desktop and phone, enemies outside the
light are still not drawn, and the lit hall, the entrance lamp, the registry desk lamp and the exit sign read like a
normal stage. The top-face contrast number stays low because a block and the floor at the same light have similar
tops; they separate by their dark sides and shadows, which the number does not sample. Blast lanes in a night raid are
a separate alpha-blended, non-tone-mapped overlay in full red (NL15): the earlier additive red over the cold floor read
pale magenta. The vault's entrance cross shows its whole extent (centre, one up, two east): its other arms end at walls
(range 2), which is why it looks short; no tile was missing. Lit matches' lanes are unchanged. (The torch counts vary
between runs because the wardens turn in real time; `e2e/night-raid.spec.ts` compares Low and High on one frozen tick.)
The tuning took four passes: bright paper-wedge beams (now soft-edged at a fraction of the strength), a black maze
(shade `0x16202e` -> `0x2a3a52` -> `0x6a7c9c`), and a dim lit area (exposure 1.18 -> 1.32 -> 1.5, fill 1.2 -> 1.45).

Not done / limits: the lit cone is tile-based, so its edge is soft but blocky at a wall's corner; the fighter's
flashlight points where he last moved or acted (`facing`), so standing still it keeps its direction; the "!" mark of an
enemy hidden in the dark still shows (a warning about the fighter, by design).

## P1b: light-based detection (implemented, on the raid AI)

Built on the merged raid AI (`785f84c`, decisions RA1-RA9, docs/CLASSIC_RAID_AI.md) without changing its shape:
`src/sim/systems/nightSight.ts` (`nightNotice`), called from `updateTerritory` for a CALM enemy only (the territory's
`calmNow`: patrolling, holding its post, walking back). Decisions NL10-NL13.

- **Only in a night raid with detection on.** `RaidDef.lighting.detection` (the Records Vault: `true`) makes
  `raidConfigLayer` / `buildRaidGame` add `config.nightSight` (`NIGHT_SIGHT_LEVELS`, `config.ts`). Without it
  `nightNotice` returns null and the territory runs its own code path untouched: lit raids, field missions, bosses,
  Academy, Classic, Rumble and multiplayer are byte-identical (`tests/raid-ai-isolation.test.ts`,
  `tests/mission-regression.test.ts`, and new full-raid digests of the lit raids at every level recorded on `785f84c`).
  Setting `detection: false` keeps the night visuals with the raid AI's own sight (the off switch).
- **Seen in a torch:** a calm torch carrier sees the fighter only when the fighter's tile is one of ITS OWN lit torch
  tiles (`lightCone` with `torchFacing`, the cone the renderer draws: 4 ahead, 1 / 3 / 3 / 3 wide, occluded on the grid)
  AND the raid AI's person-sight rule holds (`enemySeesPerson`, calm cone, Bresenham line, bodies block) with a range
  one tile past the cone (the cone is measured along / across the facing, the sight range is Euclidean). RA7 holds: the
  light term only narrows where and how far, the line rule is the AI's. Never through a wall or a crate (both lines).
- **Reaction:** the alert needs `reactNearTicks` consecutive ticks of sight at 1-2 tiles, rising linearly (integer) to
  `reactFarTicks` at the cone's reach; leaving the cone resets the count to 0 (the lit rule only decays it). Normal
  15-30 ticks (0.25-0.5 s), Easy 20-36, Hard 12-24: the only difficulty term (NL12). The existing "!" (`enemyCue`
  `alert`) is the alert; no meter, no new UI.
- **Seen by his own light:** when the guard has a line of light to a lit FLOOR tile of the fighter's beam (his cone,
  not his personal radius; a wall he shines into does not count) inside the guard's calm view cone, the torch cone is
  `beamBonusTiles` (1) longer: 5 ahead instead of 4, never 6, never through a wall. The extra row is not drawn as torch
  light, but a fighter standing there is in his own personal light, so he is only ever noticed where light is.
- **In the dark:** a calm guard without a torch (the file thrower), or with the fighter outside its torch tiles,
  notices him only at contact (Chebyshev 1, `contactTiles`, instead of the lit raid's Manhattan `closeTiles` 2) or by
  the territory's unchanged hearing (a generator laid within its hearing range sends it to investigate).
- **Engaged enemies** (alert, pursuing, investigating, watching him after a leash) are not asked: the AI worker's
  all-round sight and memory apply unchanged, so a chase in the dark is as before.
- **Deterministic** (integer ticks, no RNG, no quality input: the sim has none).

**Tests** (`tests/raid-night-detection.test.ts`, 11 scenarios on the vault with its interior cleared): on every tile of
the board a calm warden notices the fighter exactly on its torch tiles (and those are the renderer's guard channel); a
tile inside the 90-degree calm cone but outside the narrow torch is noticed by the lit rule and not by night; a wall or a
crate in between stops it (removing it restores it); the reaction is exactly 15 ticks at 2 tiles, longer at 4, and a
one-tick exit restarts it; Easy / Normal / Hard numbers per level; the fighter's beam takes the reach from 4 to 5, never
6, and not through a wall; touching his back alerts at once, two tiles behind does not; a torchless thrower never sees
him; a pursuing warden keeps all-round sight; only the vault carries `nightSight`; the lit raids' full-raid digests are
unchanged.

**Measured** (`npx tsx scripts/raid-ai.ts --seeds 8 --only play --raids recordsVault [--nonight]`: the fair-fight
scripted player, 8 seeds a level; `detections` counts minds turning `alert`):

| Records Vault | Completed | Mean s | Health lost / run | Lives lost / run | Detections / run |
| --- | --- | --- | --- | --- | --- |
| Easy, night / no night detection | 8/8 / 8/8 | 71 / 65 | 3.00 / 2.75 | 0.00 / 0.00 | 5.3 / 5.6 |
| Normal, night / no night detection | 8/8 / 8/8 | 66 / 66 | 1.63 / 2.25 | 0.00 / 0.25 | 10.1 / 11.5 |
| Hard, night / no night detection | 8/8 / 8/8 | 56 / 64 | 1.00 / 1.25 | 0.13 / 0.25 | 5.6 / 5.5 |

The night raid stays beatable at every level and the light does not give the fighter away: detections are within one
of the lit rule's, health lost is about the same (the scripted player fights in the open and never sneaks, so most
alerts come from contact and fights, which the night does not change). Verdict: fair, shipped ON. What it does not
show: a sneaking player's advantage (no stealth script exists); that is the next measurement if stealth becomes a goal.

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
`src/render/readability.ts`, `src/sim/systems/nightSight.ts` (+ the hook in `systems/territory.ts`, `config.ts`
`NIGHT_SIGHT_LEVELS`, `raid/build.ts`), `src/render/views/OverlayViews.ts` (night lanes); tests `tests/raid-light.test.ts`,
`tests/raid-night-detection.test.ts`, `tests/render/{raid-art,night-raid,classic-readability}.test.ts`,
`e2e/night-raid.spec.ts`; tools `scripts/classic-lighting-shots.mjs`, `scripts/campaign-perf.mjs` (`QUERY`), `scripts/raid-ai.ts` (`--nonight`,
detections).
Screenshots: `docs/screenshots/classic-lighting/`.
