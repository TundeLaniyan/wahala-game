# Lekki Phase 1: Admiralty Way interlocking road (Part B)

Branch `claude/wahala-lagos-enhancement-v1`, decisions LK1-LK5; integration branch `claude/wahala-campaign-integration-v1`, decisions LK6-LK8.

**Founder clarification (integration).** "Amarite Way" in the first brief was a transcription error for **Admiralty Way** in Lekki Phase 1, and the road chosen here is the right one. Every identifier, file, script and this doc are renamed to Admiralty Way. The founder's requirements, and where each is met:

| Requirement | How |
| --- | --- |
| The whole paved carriageway is interlocking, both directions | Every Admiralty Way road tile from the plaza (y 10) to the expressway (y 29), x 20-23, both carriageways: 68 tiles, including the approach rows y 17 and y 21 that were asphalt (LK6, tested tile by tile). |
| Block shapes, joints, arrangement and concrete colour readable at the gameplay camera | Unchanged zig-zag blocks (0.36 x 0.18 tile, LK4), tone a touch darker so the road no longer reads as pale as the pavement (LK8). See `after_*_gameplay.jpg`. |
| Continuous paving, not tiles, a checkerboard or asphalt | One lattice per segment, clipped to the road, no tile seams; tested: a row tiles with no gap or overlap. |
| Kerbs, median, streetlights, lane markings coherent | Black-and-white kerbs on both road edges (the generic pass) and on the painted median; white lane dashes mid-carriageway; the existing streetlights and `ADMIRALTY WAY` floor words unchanged. |
| Natural junction transitions | At Freedom Way (y 18, y 21) and the expressway (y 30): a cast-concrete edge restraint, a soldier course across the road and a stop line on the approaching lane; the median ends in rounded dark-nosed kerbs short of each junction (LK7). See `after_*_junction*.jpg`. |
| Flat and navigable, no per-block collision or meshes | Floor-canvas paint only; the sim layout is byte-identical and its 524 road tiles are pinned by the test. |
| Distinguishable from other arenas' asphalt | Light grey blocks with visible joints next to Freedom Way's dark asphalt in the same frame. |

The text below is the Lagos branch's original record; its coverage ("two straight segments, 60 tiles", "both junctions stay asphalt") is superseded by the table above.

## Reference (founder photographs, viewed this session)
Two road views and one close-up. The road: a broad **divided** carriageway paved in **pale-to-medium grey interlocking concrete blocks**, a **planted median** edged by **black-and-white painted kerbs**, white dashed lane lines, tall double-arm streetlights, shops, banks and mid-rise buildings, utility poles and overhead wires. The close-up: closely fitted **zig-zag (stepped "Z") blocks** in rows, every second row offset, thin joints, a faint dusty grey with small weeds, a slightly rough surface. It is neither asphalt nor a square checker nor a large tiled floor. The photographs are references only: they are **not** shipped and no pixel of them is used.

## What was built
- `src/render/arenas/community/pavers.ts`: an **original procedural** material. A block is a rectangle with two stepped notches (an eight-point outline) so neighbours lock; blocks repeat every 0.7 of their length and alternate rows are shifted by half a period. Block tone is `[158,160,156]` +/- 9 levels with a faint dust wash; joints are a low-contrast `rgba(92,94,92,.85)` 2.4 px line; the roughness map is rougher than asphalt (205 vs 160). Deterministic (the floor's seeded random).
- `src/render/arenas/lekkiAdmiralty.ts` (was `lekkiAmarite.ts`): the one place that says which tiles are paved (`ADMIRALTY_WAY_PAVED`, was `AMARITE_WAY_PAVED`), plus the painted median (grass strip on the centre line, black-and-white kerb stripes on both edges, a half-tile stripe length) and the white lane dashes at the middle of each carriageway.
- `community/floor.ts` gained an optional `paved` hook (run right after the asphalt, before kerbs and lane lines); only Lekki uses it. Every other arena and road is byte-identical.
- Scale is deliberately larger than life. The floor is one canvas, capped at 2560 px (about 45 px per tile on the 57-column Lekki board). A real 20 x 10 cm block would be sub-pixel noise that shimmers, so a block is **0.36 x 0.18 tile (about 16 x 8 texels)**: readable at the gameplay camera, still small against a 1-tile lane. Joints are low-contrast and tone variation small, to stay calm under mip-mapping (anisotropy 8 is already on). Whether it shimmers in motion could only be judged from stills here; flagged below.
- **Geometry, routes and obstacles are untouched.** It is floor paint only: the median is a painted strip, not an obstacle, every tile stays walkable. The road's lamps, kerb stripes, junction paint and the `ADMIRALTY WAY` floor words are kept (the words are drawn over the paving).

## Assumptions (flagged for founder review)
1. **Which road (resolved: Admiralty Way, founder confirmed).** The repository has no road called Amarite Way (the map names are Admiralty Way, Freedom Way and the expressway) and a web search found no source for the name. The photographs show a commercial divided road, which matches the map's commercial N-S boulevard (the straight run of Admiralty Way, x 20-23). **Only its two straight segments are paved** (y 10-16 and y 22-29, 60 tiles). Freedom Way, the expressway and both junctions stay asphalt (tested). 
2. **Median.** The map has no median tiles and the geometry must not change, so the median is painted (0.4 tile wide) on the centre line rather than built.
3. **Colour.** In the game's daylight the blocks read paler than the dusk photographs. Tone is one constant (`ADMIRALTY_PAVERS.tone`, darkened a little on the integration branch, LK8).
4. **Block shape.** A stepped "Z" matching the close-up as I read it; the real block may be a slightly different uni-pave profile.

## Evidence
Screenshots (`docs/screenshots/lekki-admiralty/`, produced by `scripts/admiralty-shots.mjs`; the Lagos branch's own `after_*` frames are kept as `lagos-branch_*`, the `after_*` frames are the integration branch's, with `_junction` and `_junction_close` views added; the existing `scripts/map-identity-shots.mjs follow-admiralty` frame is also there):
- gameplay camera, desktop 1280x720: `before_desktop_gameplay.jpg` / `after_desktop_gameplay.jpg`
- close view of the pattern: `before_desktop_close.jpg` / `after_desktop_close.jpg`
- phone 844x390 (device scale 2): `before_mobile_*` / `after_mobile_*`
- the original map-identity framing: `before_rumbleLekki_follow-admiralty.jpg` / `after_...`

## Performance
Floor-canvas paint only: no mesh, no texture, no draw call. Same canvas size and upload as before. Measured on the same frame, draw calls and triangles are unchanged within the run-to-run spread (identical builds vary 448 to 519 calls with scene staging); phone medium 541 / 1,937,053 before and after, phone low 250 calls / 0.79 M triangles. Software GL only, no real device.

## Tests
`tests/render/lekki-admiralty-pavers.test.ts`: the block outline, that a row is tiled with no gap and no overlap (random-point check, 4 rows), alternate rows offset by half a period, the block is 12-24 texels long at the Lekki canvas scale, every paved tile is a road tile of the existing map in columns 20-23, none in Freedom Way, its junctions or the expressway, most road tiles stay asphalt, and the board size is unchanged. Integration: every Admiralty Way road tile is paved (both directions, plaza to expressway), none of Freedom Way's or the expressway's, and the board's road-tile count (524) is pinned.

## Limitations
Shimmer in motion is unverified (stills only); the colour and the road choice need a founder look; the blocks are larger than real ones by design; the dusk lighting of the photographs is not reproduced.
