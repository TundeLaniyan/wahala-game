# Lekki Phase 1: interlocking concrete road network

Branch `claude/wahala-lekki-interlock-redesign-v1`, from the production release `b55e95f` (gh-pages `build.json`). Decisions LI1-LI6. **For founder visual review: not merged, not deployed.** Supersedes the road-surface part of `docs/LEKKI_ADMIRALTY_WAY.md` (the Admiralty-only, canvas-painted pavers).

## 1. What changed, where

Coverage is classified from the arena's own map (`src/render/arenas/lekkiRoads.ts`), not from hand-drawn rectangles:

| Class | Tiles | What it is | Surface |
| --- | --- | --- | --- |
| `localRoad` | 239 | every road tile (`=`) outside the Expressway Gateway rows: **Admiralty Way** (x 20-23, the plaza to the expressway), **Freedom Way** (y 18-20, edge to edge) and **their crossing** | interlocking paving |
| `estateStreet` | 257 | the open floor of the **Freedom Way Estates** district (role "street"): the residential streets between the walled compounds, including the lane clearings beside Admiralty Way | interlocking paving |
| `expressway` | 285 | road tiles in the Expressway Gateway rows (y 30-34, both board edges): the six-lane Lekki-Epe Expressway | **asphalt kept** |

**Boundary roads.** The expressway is the regional road outside the Phase 1 street network, so it keeps its asphalt; Admiralty Way, the only local road that meets it, ends against it with a pale cast-concrete edge restraint and a stop line (a block road's real ending). Freedom Way runs off both board edges and is paved to the edge. Where an estate street meets open ground that is not road (the Ikate leisure ground at x 36/37), a cast-concrete edge restraint finishes the paving; where paving meets a pavement the existing black-and-white kerbs stay.

**Not paved (not road):** the Admiralty Commerce forecourts and shopfront pavements, the promenade and its plaza (its own slabs and medallion), the Ikate leisure ground and sports court, the sandy Coastal Access lanes, and the gateway's roadside pavements.

**Preserved:** road widths and alignment, the sim layout (524 road tiles, collision, routes: tested byte-identical), buildings, pavements, kerbs, the Admiralty Way median with its black-and-white kerbs, lane lines, stop lines, the `ADMIRALTY WAY` road words, streetlights, trees, landmarks. No other district or arena changes (`PAVED_ARENAS` has one entry; every other floor is drawn exactly as before).

## 2. Why the previous surface looked artificial (from the founder's screenshots and the code)

1. **Resolution.** The blocks were painted into the arena's single floor canvas, capped at 2560 px: about **45 px per tile** on the 57-column Lekki board. A block was ~16 x 8 texels, so its notches were one or two texels: the "interlock" degraded into blurred staircase strips.
2. **Shape and scale.** A stepped "Z" read as a staircase or brick bond, not the I-shaped (dog-bone) road paver of the references; and at 0.36 tile per block (about six times real size) it read as oversized tiles.
3. **Flat and over-contrasted.** Uniform light-grey bodies with a dark 2.4 px grout line and no bevel: a printed decal, not a surface with depth; too pale beside the pavements.
4. **Pattern resets.** Each segment was clipped and restarted its own lattice, with soldier courses at the cuts; spreading that over a network multiplies seams at every junction.

The canvas approach cannot be fixed by tuning: the texel budget is the limit. It is therefore **replaced for the paving** and kept for everything it does well (ground, markings, kerbs, the median, words).

## 3. The new technique (LI1-LI3)

- **A dedicated paver texture** (`src/render/arenas/paving/interlock.ts`, pure and tested): 512 x 512, seamless, **I-shaped blocks** (2:1, flared ends, waisted middle) in courses offset by half a block so every flared end sits in the waist of the blocks beside it; thin sand-filled joints at about two thirds of the block tone; a soft chamfer darkening each block edge (the small bevel of a real paver, baked: subtle depth with no lighting cost and no shimmer); aggregate speckle and faint mottling; block-to-block tone variation of +/- 6.5 % (never a checkerboard); medium grey. Original and procedural: the reference photographs are not shipped and no pixel of them is used.
- **Drawn by the floor shader** (`paving/material.ts`): the floor canvas marks paved tiles with one reserved key colour (`paving/floorKey.ts`); a patch of the floor's existing material samples the paver texture in **world tile coordinates** wherever the canvas shows the key. Anything painted over the key (kerbs, lane lines, the median, stop lines, words) differs from it and stays on top; the road edge blends over a fraction of a canvas texel.
- **One lattice for the whole network:** all courses run east-west, continuously through every segment and junction: no seam at tile or road boundaries, no reset at intersections, no distorted blocks at corners.
- **Scale and stability:** a block is **0.22 tile** (about 18 x 9 screen px at the desktop gameplay camera), and the texture holds about **190 texels per tile** (4x the floor canvas), so blocks are crisp up close; the GPU mip chain (trilinear, anisotropic) fades them to an even grey as they get small (tested: a 16 x 16 box average of the texture varies under 4 %). A few percent of world-space tone drift, computed only on paved pixels, hides the 2.64-tile repeat.
- **Cost:** no mesh, no extra draw call; one 512 x 512 RGBA texture per Lekki floor (1 MB, about 1.3 MB with mips), owned and disposed with the floor; one extra texture read per floor pixel and a little arithmetic on paved pixels; the texels are computed once per page (about 0.3 s in Node, at arena load).

Why not individual meshes or a separate road mesh: blocks as meshes would cost hundreds of thousands of triangles; a separate road overlay mesh would hide the markings painted in the floor canvas and add a draw call. The shader patch keeps everything the floor already has.

## 4. Evidence (`docs/screenshots/lekki-interlock/`)

All frames are the real game (`scripts/lekki-paving-shots.mjs`), HUD hidden, medium quality, the production build `b55e95f` as **before** and this branch as **after**. File names: `<before|after>_<desktop|mobile>_<day|night>_<view>.jpg`.

| View | Desktop day | Desktop night | Phone (844 x 390) day | Phone night |
| --- | --- | --- | --- | --- |
| Normal gameplay camera on Admiralty Way (`gameplay`) | yes | yes | yes | yes |
| Close inspection of the blocks (`close`) | yes | | yes | |
| Admiralty Way x Freedom Way crossing, gameplay and close (`junction`, `junction_close`) | yes | junction | junction | |
| Freedom Way east (`freedom`), an estate street (`estates`), the expressway edge (`edge`) | yes | | | |
| Wide overview of Lekki Phase 1 (`overview`) | yes | yes | yes | |

**Moving camera:** `motion_<before|after>_<desktop|mobile>.gif`, 16 frames of a slow pan along Admiralty Way (0.07 tile across and 0.05 tile down per frame, never a whole block) at the gameplay zoom.

**Shimmer measurement** (software GL; frames analysed in the scratchpad, method below):

| | Fine-detail energy variation over the pan (`hf_cv`) | Residual flicker after local alignment, mean / 90th percentile |
| --- | --- | --- |
| Desktop before | 4.03 % | 1.32 % / 1.98 % |
| Desktop after | 3.85 % | 1.71 % / 2.46 % |
| Phone before | 7.52 % | 2.08 % / 6.79 % |
| Phone after | 4.06 % | 1.60 % / 2.29 % |

Method: the pan frames are aligned strip by strip (strips at constant depth, phase correlation with sub-pixel refinement); a surface that aliases changes its look between frames even when perfectly aligned. The old painted pattern's worst phone frames (the 6.8 % tail) were the shimmer; the new texture's residual is low and even. The desktop mean is a little higher than before simply because the new surface carries real fine detail (block joints) that the resampling of the analysis does not reproduce exactly.

**Reference comparison:** the founder's photographs (two road views, three paver close-ups) beside the in-game close and gameplay views were sent with the review report; they are not committed because some of the photographs are third-party (watermarked) images.

## 5. Performance (software GL in this container; no real device was available)

Comparable scenes: the same frozen gameplay view on Admiralty Way, both builds, alternating runs, the median of six samples per run.

| | Draw calls | Triangles | GPU textures | Geometries / programs | fps (runs) | Render (smoothed, runs) |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop medium, before | 859 | 2,544,311 | 289 | 311 / 53 | 20, 21, 19 | 2632, 2479, 2480 |
| Desktop medium, after | 859 | 2,544,311 | 290 | 311 / 53 | 19, 21, 20 | 2438, 2652, 2391 |
| Phone low, before | 530 | 1,207,595 | 241 | 294 / 43 | 20, 18, 21 | 1445, 1326, 1561 |
| Phone low, after | 530 | 1,207,579 | 242 | 294 / 43 | 20, 20, 18 | 1570, 1426, 1386 |

Draw calls, triangles, geometries and shader programs are unchanged; one texture is added (the paver texture). Frame rate and render time are within the run-to-run spread. A first version spent noise arithmetic on every floor pixel and showed a 2-3 fps dip on the phone-low software rasteriser; it was trimmed to paved pixels only and re-measured as above. Arena load time is unchanged within noise (about 19-22 s per load here, dominated by software GL). On a real GPU one more texture read on the floor is negligible, but **real-device performance has not been verified**.

## 6. Tests

`tests/render/lekki-interlock-roads.test.ts` (14): the I-block shape (flared ends 1.25-1.7 x the waist), consistent block lookup, the half-block course offset; the texture is seamless (same block, edge and tone one repeat later), deterministic, has thin joints (3-12 % of texels) darker than the blocks but never black (0.58-0.8 of block luminance), medium grey, +/- 6.5 % block variation without checkerboard alternation, and fades evenly when minified; the coverage (Admiralty Way and Freedom Way end to end, every road tile outside the expressway paved, the expressway including both board edges not paved, the estate streets paved and nothing else); the sim board and its 524 road tiles unchanged; only Lekki in `PAVED_ARENAS`; the shader patch replaces the map lookup, adds its uniforms, composes the program key with other patches and installs once. Existing render, arena, Rumble and living-environment suites pass.

## 7. Limitations and things to judge

- **Orientation:** one course direction (east-west) for the whole network keeps it continuous through junctions; on Admiralty Way the courses therefore run across the direction of travel, on Freedom Way along it.
- **Estate streets** are paved because the map names that district's open floor as streets; if the founder sees them as private compound frontage, `LEKKI_PAVED` drops the class in one line.
- **Block scale** (0.22 tile) is about three times a real 20 cm block, chosen so the interlock still reads at the gameplay camera; the founder may prefer smaller (more texture, less pattern) or larger.
- **Depth** is baked (chamfer and joint darkening), not normal-mapped: no dynamic glints from explosions or lamps on block edges. Chosen for stability (no shimmer) and phone cost.
- **Markings** (kerbs, lane lines, words, the median) are still the floor canvas's resolution: slightly softer than the blocks up close.
- **Grime and decals** from the existing weathering pass and blast scorches still lie over the paving, as on every surface.
- **Software GL only:** shimmer and frame rate were measured with SwiftShader; a real phone may differ.

## Coverage revised (decision LI7)
The founder later narrowed the coverage: only Admiralty Way (x 20-23, y 10-29, its Freedom Way crossing box included) is
paved; Freedom Way outside the box and the expressway are asphalt, the estate streets un-paved. The material described
above (LI1-LI3) is unchanged. See `docs/integrated-release/task2-lekki-paving.md`.

