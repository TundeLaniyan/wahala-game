# Classic lighting: readable raids and one night raid

Branch `claude/wahala-cl-night` (from production `514be88`). Decisions NL1-NL3 (`docs/DECISIONS.md`). Founder brief:
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

The standard Classic arenas are measured with the same script and reported (not changed) with the night raid commit.


Gameplay overlays (blast danger lanes, vehicle lanes, raid warnings: `TileOverlay`) are now `fog: false` (NL3): a
warning is never washed towards the fog colour, in any arena. They were already unlit (`MeshBasicMaterial`), so no
light or darkness changes them.

## Files

`src/render/arenas/raidArt.ts`, `src/render/readability.ts`, `src/render/views/TileOverlay.ts`; tests
`tests/render/{raid-art,classic-readability}.test.ts`; tool `scripts/classic-lighting-shots.mjs`. Screenshots:
`docs/screenshots/classic-lighting/`.
