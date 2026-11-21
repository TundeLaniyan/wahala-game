# WAHALA! 3D character roster production (all 18 characters)

Branch `ccr-5b343a94-mqq1vh` (worktree `wahala-agbero`), based on production `514be88`. **Not merged, not deployed.** Nothing in
`src/sim`, `src/ai`, `src/input`, combat timings, hit detection, collision, mission data, UI or Classic AI / lighting work
(`claude/wahala-classic-ai-lighting-v1`) was touched. All changes are presentation / asset / tooling.

## 1. Honest status: no character is production-ready

| Tier (brief section 8) | Meaning | Characters |
| --- | --- | --- |
| Production-ready | credible, rigged, performant **and validated in gameplay on real hardware, founder-approved** | **none** |
| Visual candidate | recognisable role, costume and silhouette at the gameplay camera; real anatomy and a real face; reasonably faithful; needs artist refinement | Agbero, Area Boy, Heavy Enforcer, Ring Route Marshal, Freight Security Guard, Lekki Boy, Campus Queen, Oga Sunmola, Marshal Kobo, Ikenna Wayside, Barrister Quill |
| Technical prototype | works in game, but a visible weakness in costume read or fidelity | Bottle Thrower, Market Enforcer, Ring Lieutenant, Street Baller\*, Madam Ronke, Steward Halcyon, The Landlord |

\* **Street Baller was built from the written brief only.** The supplied pack's `01_Street_Baller_Turnaround.jpeg` and
`01b_Street_Baller_Motion_Study.jpeg` are both the *WAHALA! Navigation & UI Refinement* mock-up, not a character sheet; his approved
turnaround is **missing**. Do not treat him as validated against artwork. (The handover archive and `handover/*.md`,
`reference/characters/` were also not present in the session; the same 19-image pack from the first assignment was used.)

All 18 are visibly **stylised**: real MakeHuman anatomy, hands with fingers and a face with brows/lips/eyelids, garments cut from the body
surface with printed or colour-blocked fabric, props and headgear, but **no sculpted cloth wrinkles, no normal maps, no hand-painted
surface wear**. None matches the Gemini concept sheets' painterly realism. See section 8.

## 2. Roster checklist

Per-character figures (approved reference beside the new model, front / three-quarter / side) are in `docs/screenshots/roster/<id>.jpg`.
Static data is from `tools/assets/glb_report.py`; gzip is the transfer size of the GLB. All files share the 22-bone skeleton (tested).

| # | Character | File | Tier | Tris | Mats | Tex | KB (gzip) | Clips | Load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Agbero / Park Enforcer | `lazy/char_agbero` | visual candidate | 17,556 | 5 | 1 | 1037 (378) | 13 | lazy |
| 2 | Area Boy | `lazy/char_areaBoy` | visual candidate | 18,647 | 4 | 1 | 1082 (401) | 13 | lazy |
| 3 | Bottle Thrower | `lazy/char_bottleThrower` | technical prototype | 16,085 | 4 | 1 | 1006 (356) | 14 | lazy |
| 4 | Market Enforcer | `lazy/char_marketEnforcer` | technical prototype | 20,041 | 4 | 1 | 1086 (385) | 13 | lazy |
| 5 | Heavy Enforcer | `lazy/char_heavyEnforcer` | visual candidate | 25,460 | 5 | 1 | 1305 (478) | 13 | lazy |
| 6 | Ring Route Marshal | `lazy/char_routeMarshal` | visual candidate | 21,480 | 6 | 1 | 1185 (440) | 13 | lazy |
| 7 | Freight Security Guard | `lazy/char_ringSecurity` | visual candidate | 20,796 | 6 | 1 | 1138 (412) | 13 | lazy |
| 8 | Ring Lieutenant | `lazy/char_lieutenant` | technical prototype | 20,733 | 6 | 1 | 1130 (407) | 13 | lazy |
| 9 | Street Baller\* | `char_streetBaller` | technical prototype | 17,639 | 6 | 2 | 1168 (454) | 16 | eager |
| 10 | Campus Queen | `char_campusQueen` | visual candidate | 21,902 | 7 | 2 | 1270 (453) | 16 | eager |
| 11 | Lekki Boy | `char_lekkiBoy` | visual candidate | 17,149 | 6 | 2 | 1118 (398) | 16 | eager |
| 12 | Oga Sunmola | `lazy/char_bossOgaSunmola` | visual candidate | 18,426 | 6 | 2 | 1168 (425) | 16 | lazy |
| 13 | Madam Ronke | `lazy/char_bossMadamRonke` | technical prototype | 21,692 | 7 | 2 | 1251 (440) | 16 | lazy |
| 14 | Marshal Gbenga Kobo | `lazy/char_bossMarshalKobo` | visual candidate | 19,509 | 6 | 1 | 1162 (399) | 16 | lazy |
| 15 | Ikenna Wayside | `lazy/char_bossIkennaWayside` | visual candidate | 20,188 | 6 | 1 | 1190 (401) | 16 | lazy |
| 16 | Barrister Quill | `lazy/char_bossBarristerQuill` | visual candidate | 19,309 | 7 | 2 | 1215 (441) | 16 | lazy |
| 17 | Steward (Bamidele) Halcyon | `lazy/char_bossStewardHalcyon` | technical prototype | 15,561 | 4 | 1 | 1042 (360) | 16 | lazy |
| 18 | The Landlord (provisional) | `lazy/char_bossTheLandlord` | technical prototype | 22,489 | 6 | 2 | 1304 (486) | 16 | lazy |

The previous Agbero prototype (tube-built, `char_agbero.glb` in commit `20d9c5e4`) is superseded: it reached the *technical prototype*
tier and its visual-fidelity problems were the reason for this pipeline change. The previous hero models are kept, unbundled, in
`src/assets/legacy-models/` (`char_<hero>_v1.glb`) for rollback.

Existing character budgets in `docs/ASSET_PIPELINE.md` ("<= 9k triangles") were already exceeded by the shipped cast (14-17k). The new models
are **15.5k-25.5k**, i.e. heavier than the cast they replace (the Heavy Enforcer is the heaviest). A lower-detail profile is one parameter
(`finish_skin` / garment budgets in `tools/assets3/roster.py`); it has not been needed or measured against a phone yet.

## 3. Tooling decision (brief section 5)

| Option | Result |
| --- | --- |
| Blender | **Available**: `pip install bpy` installs Blender 5.3 as a Python module here (headless, no purchase). Used for UV / decimation experiments; **not** in the shipped build path (its Decimate modifier cannot protect a face and keep UV seams and skin weights consistent, so a purpose-built quadric decimator, `tools/assets3/qem.py`, is used). |
| Base anatomy | **CC0 MakeHuman assets** (base mesh, 1,554 morph targets, default rig and skin weights), cloned with `tools/assets3/fetch_makehuman.sh` (pinned commit). Licence: CC0 1.0 for the base mesh, targets, rig, clothes and poses; MakeHuman states it claims nothing over outputs. The AGPL MakeHuman **source code** is neither used nor distributed. Provenance in `docs/ASSETS.md`. |
| Sculpting / artist assets | **Not available** and not purchased. Needed for the concept-level fidelity (section 8). |
| External image-to-3D services | Not used (no reference images were uploaded anywhere). |

## 4. Pipeline (reproducible, deterministic)

```
tools/assets3/fetch_makehuman.sh        CC0 data -> tools/assets3/vendor (gitignored); export MAKEHUMAN_DATA=...
tools/assets3/mhbody.py                 morph (gender / age / muscle / weight / height / race macros + detail targets), pose to the game's
                                        relaxed A-pose with curled fingers, 163-bone weights -> the existing 22-bone skeleton
tools/assets3/qem.py                    quadric-error decimation: importance (face, hands), locked UV seams, UV + weight interpolation
tools/assets3/charkit.py                parts, SDF clipping (clean hems / openings), garment shells from the body surface, primitives, export
tools/assets3/costume.py + patterns.py  tops, trousers, skirts, robes, vests, sleeves, gloves, belts, necklaces, sashes, decals, printed fabrics
tools/assets3/kit_head.py, kit_shoes.py caps, helmets, peaked caps, beret, fila, gele, afro, locs; sneakers and boots fitted to the foot
tools/assets3/skinbake.py               UV-space skin texture: brows, lips, eye sockets, stubble / beard, scars, painted short hair
tools/assets3/roster.py, roster_fighters.py   the 18 character definitions (`python3 tools/assets3/roster.py [id ...]`, ~10 s each)
tools/assets/enemy_clips.py             enemy clips (Idle / Walk / Run / Windup / Strike / Alert ...) and hero variants (below)
```

```bash
pip install bpy numpy scipy pillow                   # bpy is only needed for tools/assets3/bl.py experiments
eval "$(tools/assets3/fetch_makehuman.sh)"           # prints: export MAKEHUMAN_DATA=...
python3 tools/assets3/roster.py                      # all 18 -> src/assets/models/{,lazy/}char_<id>.glb (about 3 minutes)
python3 tools/assets/glb_report.py src/assets/models/lazy/char_areaBoy.glb
node tools/viewer/roster-sheet.mjs out.png three areaBoy,hero:streetBaller   # contact sheets (dev server running)
```

Why this beats the tube-built Agbero: real proportions and posture, hands with fingers, an actual face (brow, nose, lips, eyelids), a painted
skin texture, garments with correct hems/openings, per-character body type (a heavyweight, a lean runner, an older woman, a stout elder).
What it still cannot do: sculpted surface detail and baked normal maps (needs a modelling artist or a sculpt tool).

## 5. Rigging and animation

* Same 22-bone skeleton as the hero cast, so `RiggedCharacter`, the mixer, x-ray silhouettes, the rim light and every existing clip work
  (tested for all 18). The head scale is carried in the GLB (`headScale`, `headFit` node extras) instead of the cast's fixed 0.82.
* **Enemies** (8): Idle, Walk (patrol), Run (pursuit), Windup + Strike (punch, stretched over the sim's wind-up), Alert (generator /
  intruder awareness), Push, Stumble, Dazed, DieBlast, DieVehicle, Win, Lose; the Bottle Thrower also has Throw. No clip changes any timing:
  the wind-up reuses the sim's own `attackStarted` / `resolveTick`.
* **Heroes and bosses** (10): the full fighter set (16 clips; bosses in missions are generator-bot fighters). Hero-specific clips named as the
  game already requests them: **Campus Queen `Place`** = a fast standing drop, **Lekki Boy `Kick`** (used for his Daze Punch) = a
  daze punch, not a kick; her shove uses `Push` (a two-handed shove). Street Baller keeps the standard punch. (Concept images that show kicks or
  new abilities were **not** implemented: the football volley, VFX, shields, etc.)
* Not done: bespoke per-boss clips (the shared fighter clips are used; Oga's agbada, Ronke's gele and the Landlord's cane do not simulate cloth
  or physics), the seated "defeat against tyres" poses, facial expressions, finger animation, a visible bottle leaving the Thrower's hand.

## 6. Integration

* `AssetLibrary`: eager `models/*.glb` (boot preload, unchanged behaviour) and on-demand `models/lazy/*.glb` (`ensure`, `canEnsure`,
  `lazyIds`). Only the three heroes (needed by menus and every match) are eager; the 15 enemy and boss models load when a seat needs them.
* `enemyLooks.ts`: every ordinary variant names its model; bosses are keyed by seat name (`BOSS_MODELS`); `dedicatedModelOf` resolves it.
  `PlayerViews` requests a seat's model once, draws the previous look until it arrives (or forever if it failed), then re-dresses the seat.
  `?legacyEnemies` forces the previous enemy / boss look for comparison. Heroes: a model that fails to load falls back to the existing procedural
  fighter (the engine's original behaviour); the previous GLBs are in `legacy-models/` and git history.
* Preserved: AI, generator-first combat, movement and collision, telegraphs, damage and health, campaign progression, UI, adaptive graphics,
  match loading, per-slot hue identities (the `cloth` material is recoloured by vertex colour as before; patterned garments keep their print).

## 7. Validation and measurements

Tests: typecheck, ESLint, `tests/render/roster-models.test.ts` (57: all 18 GLBs share the skeleton, role clips, budgets, head extras; every
lazy file is an enemy / boss model; name-to-model wiring), `tests/render/agbero-model.test.ts` (clip aliasing, cues, fallback), full unit
suite: 293 files, **4,623 passed + 3 fixed** (the three `fighter-identity` tests parse the hero GLBs in Node, which cannot decode embedded
textures; a shared helper `tests/glbNoTextures.ts` strips them, assertions unchanged). The Playwright browser suite was **not** run (CI
shards it; it is the next gate before any merge).

**Performance (production build, `scripts/campaign-perf.mjs` with `PERF_QUERY`, software WebGL / SwiftShader, 740x360, 4-13 frames per
run: relative numbers only; this is NOT phone performance and no real phone was available).** New models vs the previous look
(`?legacyEnemies`; the heroes are the new models in both runs):

| mission | quality | fetched on demand | draw calls | triangles | textures | frame mean ms | p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| field `oshodi.railEdge` (5 enemy variants) | low, legacy | 48 KB | 206 | 536,834 | 179 | 484 | 600 |
| field `oshodi.railEdge` | low, **new** | 5,566 KB | 180 | 526,543 | 202 | 577 | 817 |
| field `oshodi.railEdge` | high, legacy | 43 KB | 531 | 1,521,852 | 279 | 1,242 | 1,917 |
| field `oshodi.railEdge` | high, **new** | 5,566 KB | 485 | 1,505,175 | 302 | 1,220 | 1,583 |
| boss `oshodi` (Oga Sunmola) | low, legacy | 132 KB | 238 | 847,088 | 181 | 691 | 817 |
| boss `oshodi` | low, **new** | 1,300 KB | 238 | 847,087 | 181 | 656 | 800 |
| boss `oshodi` | high, legacy | 127 KB | 563 | 2,904,538 | 277 | 1,915 | 2,667 |
| boss `oshodi` | high, **new** | 1,295 KB | 563 | 2,904,538 | 277 | 1,767 | 2,467 |

* **Boot download is unchanged in kind**: 20,600 KB (14,545 KB gzip) in both runs; only the three heroes are eager (about +0.7 MB over
  production, which was about 19.9 MB before this work); the models in a mission are fetched on demand (5.6 MB for the five-variant field
  mission, 1.3 MB for a boss mission; crew seats in boss missions are fighters and need no enemy model).
* **Draw calls and triangles are equal or slightly lower** than the previous look. The boss mission's triangle counts match because the boss
  was outside the measured frame; the boss model's cost shows only in the fetch.
* **Frame time shows no consistent change**: differences go both ways (field low: new 19% slower, p95 +36%; high: about 2% faster; boss: 5-8%
  faster). With so few software-rendered frames this cannot resolve a few percent, **and the low-quality field result may be a real regression**
  (about 23 more GPU textures: each new model has a 1024 px skin texture, about 5.6 MB of GPU memory with mipmaps). Mitigations that need no new
  assets: build enemies with `tex_res=512` (4x less texture memory) and the low-detail triangle profile. A phone test is required before approval.
* Load/parse cost: each model is 1.0-1.3 MB (0.36-0.49 MB gzip), 214-250 KB of that animation data; parsing took about 6-8 ms per model for the
  v1 rigs in Node (not re-measured per roster model).

## 8. Known differences from the Gemini concepts

* **Surface and cloth detail**: the concept sheets are painterly realistic with wrinkles, leather, stitching and wear. These models are
  smooth, colour-blocked or printed, with simple props. At the gameplay camera the read is correct; close up the gap is large
  (compare `docs/screenshots/roster/*.jpg`).
* **Faces**: real face geometry and painted brows/lips/stubble, but only one neutral expression, and a few pixels at game distance.
* **Hands**: five-finger hands, rigid, in one relaxed curl (the rig has no finger bones).
* **Per character** (headline gaps): Market Enforcer apron / blouse layering and print; Madam Ronke gele shape, wrapper silhouette, lace
  and ledger fidelity; Halcyon's tunic reads close to a suit; The Landlord is very dark with a simple plaid sash and a plain cane;
  Lieutenant's navy-on-black detail is lost at game lighting; Bottle Thrower's pack and bottles are simple; Barrister Quill's brocade is a
  tile print; Heavy Enforcer reads as armoured and bulky but not with the concept's volume of gear.
* **Fictional branding**: the Ring insignia (an orange emblem) is colour / patch geometry only; the text decals ("RING ROUTE CONTROL") are
  **not** produced. No real government insignia is used. No firearms or sci-fi armour.
* **Body types** come from the MakeHuman macros; faces share one base head modified by a few detail targets, so facial identity is limited.

## 9. Blockers / decisions for the founder

1. **Quality ceiling.** With the available tools the result is a *stylised visual-candidate* tier. Reaching the approved concept fidelity needs
   a character artist (sculpt, retopology, texture painting, normal-map baking in Blender / ZBrush) working to the **existing 22-bone skeleton**,
   so every clip and the integration here are reused as is. `tools/assets3` is a good block-out and a reproducible import path
   (`char_<id>.glb`, node names, skeleton, clip names, `headScale` / `headFit` extras, materials `skin`/`cloth`/`pattern`/`decal`...).
2. **Street Baller reference is missing** (section 1).
3. **Phone performance is unmeasured.** Triangle counts (15-25k) exceed the old 9k guidance; a low-detail profile is available if a real phone needs it.
4. Approve (or not) the heavier lazy-model delivery (about 17 MB of on-demand models) and the +0.7 MB eager hero increase.
5. Bosses currently use fighter clips; if bespoke boss animation (e.g. agbada sleeve motion, Ronke's ledger gesture) is wanted, it needs an artist
   or approval for new clip work.

Nothing was deployed or merged.
