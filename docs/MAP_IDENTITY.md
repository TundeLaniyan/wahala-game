# Map identity: the three anchors of each City Rumble area

Branch `worktree-agent-ac54580a27ea8e5c3` (from `claude/wahala-campaign-online-v1` at `321cc5a`). Presentation only: no file under `src/sim` changed, no layout, no collision, no rule. The data table is `src/render/arenas/anchors.ts` (`MAP_ANCHORS`, three fictional or generic anchors per area, read by the campaign briefings); `tests/render/map-anchors.test.ts` checks it.

Images are real frames of the real game (software WebGL, 1280 x 720, medium quality, HUD hidden, simulation frozen after staging the local player on a tile), taken with `scripts/map-identity-shots.mjs`. They live in `docs/screenshots/map-identity/` as `before_<arena>_<shot>.jpg` (base `321cc5a`) and `after_<arena>_<shot>.jpg` (this branch). JPEG instead of PNG to stay under 500 KB each. `follow-*` shots use the normal City Rumble follow camera on the player standing on the named tile; `whole` is the whole-board overview (the camera the player gets with the overview toggle).

## 1. What the gameplay camera can and cannot show

The City Rumble follow camera (`render/cameraRig.ts`, ACTION framing, stadium mode) sits about 8.1 m up and 9.4 tiles south of the player (41 degrees, 38 degree lens, distance 12.4 on a large board) and never rotates or zooms. Working it through:

* The top edge of the frame is a ray 22 degrees below the horizon. A point `d` tiles north of the player is only visible below about `4.3 - 0.4 d` metres: 4.3 m on the player's row, 3.1 m three tiles north, 2.1 m at 5.5 tiles, 1.1 m at 8 tiles, nothing beyond about 10.7 tiles.
* So a tall far structure (a 26 m pylon, a 24 m clock tower, a viaduct 11 tiles behind the wall, a station roof at 10 m) is **never** in the follow frame. Only its lowest metres appear, and only when it is within a few tiles. The whole-board overview is the only frame that shows such things whole.
* The sides see about +-6.4 tiles at the player's depth (more near the top edge), the south about 4 tiles.
* Things nearer the camera than the player appear lower in frame and may be tall (up to about 5 m at 4 tiles south) but then they occlude: the existing see-through dither handles that.

Consequence for the design: every anchor gets (a) a **ground-level expression** (a facade, a board, a floor painting, a low structure within a few tiles of the board edge, readable below about 2.5 m) and, where it is a tall thing, (b) the **tall expression** that the overview shows. Boards are hung at 2.0 to 2.8 m or lower; a board behind a portico roof is invisible from 41 degrees (found and fixed on the Fadeyi frontage).

## 2. The anchor table and status

Status: **fixed** = built or rebuilt here and checked in the frames; **documented** = already strong, unchanged (reference arenas); **weak** = readable in the overview but only partly in the follow frame (see section 5).

| Area | Anchor id | Name | Gameplay frame | Overview | Status |
|---|---|---|---|---|---|
| Ojuelegba | `ojuelegba-flyover` | Underbridge Flyover | `follow-north` | yes | documented |
| | `ojuelegba-link-bridges` | Blue-Roofed Link Bridges | `follow-north` (mouths) | yes | documented |
| | `ojuelegba-direction-gantry` | Direction Gantry | overview only | yes | documented |
| Oshodi | `oshodi-terminal-canopy` | Interchange Terminal Canopy | `follow-north` | yes | documented |
| | `oshodi-skywalk` | Covered Skywalk | overview | yes | documented |
| | `oshodi-expressway` | Elevated Expressway | overview | yes | documented |
| Mushin | `mushin-red-line-station` | Red Line Station | red-and-white "RED LINE STATION" boards on the north shop row | green roof, plate, viaduct, train | fixed (follow: weak) |
| | `mushin-footbridge` | Red Line Footbridge | `follow-footbridge` at the west mouth | yes | fixed (new) |
| | `mushin-idi-oro-hall` | Idi-Oro Fresh Food Hall | `follow-idioro` | green roof, board | fixed |
| Fadeyi | `fadeyi-footbridge` | Highway Footbridge | `follow-footbridge` at the east mouth | stairs, deck, BRT plate | fixed (moved in, lowered) |
| | `fadeyi-brt-lane` | BRT Centreline | `follow-brt` | yes | documented |
| | `fadeyi-bank-frontage` | White Frontage Block | `follow-bank` | yes | fixed (portico) |
| Lagos Island | `lagos-cathedral` | Old Eko Cathedral | `follow-cathedral` (frontage) | nave, tower, spire | fixed |
| | `lagos-civic-dome` | Eko Civic Hall Dome | `follow-civic` (portico) | copper-green dome | fixed (new) |
| | `lagos-textile-maze` | Textile Stall Maze | `follow-textile` | yes | documented |
| Lekki | `lekki-link-bridge` | Lagoon Link Bridge | deck, parapet, lamps and the seawall name plate at the north rows | pylon and both stay fans | fixed (follow: weak) |
| | `lekki-admiralty-way` | Admiralty Way | `follow-admiralty` | road lettering | fixed (new) |
| | `lekki-lit-plaza` | Illuminated Plaza Fountain | `follow-plaza` | fountain and light ring | fixed (new) |
| Ebute-Metta | `ebute-station-sign` | Station Name Plate | `follow-station` | yes | fixed |
| | `ebute-signal-gantry` | Signal Gantry | `follow-gantry` | yes | fixed (new) |
| | `ebute-rail-yard` | Working Rail Yard | `follow-yard` | yes | fixed (partly) |

How each anchor is drawn and tested: anchors built as off-board set pieces tag a mesh with `userData.anchor = id` (`tagAnchor`; found after the headless build in `map-anchors.test.ts`); anchors that are board cover, floor paintings or signs are referenced by id in a comment next to the code in the module named in `ANCHOR_MODULES`, and the test reads the module source.

## 3. What was built, area by area

### Ojuelegba and Oshodi (reference quality, unchanged)

Only comment lines naming the anchors were added (`ojuelegbaLandmarks.ts`, `oshodiMetroTerminal.ts`, `oshodiMetroLandmarks.ts`); their looks, geometry and fog are untouched, and the `after_` frames equal the `before_` frames. The flyover with its green gantry and the two blue-roofed link bridges read in the overview and, at the north rows, in the follow frame; Oshodi's terminals, truss skywalk and the elevated expressway read in the overview and the follow frame at the north of the plaza. No visibility fix was needed.

### Mushin

* **Red Line station** (`mushin-red-line-station`): the viaduct and station are far behind the north edge (out of the follow frame by section 1), so the station roof is bigger, the plate now says `MUSHIN  •  RED LINE` in the red-and-white livery (white on red), and the north shop row of the Ojuwoye grid carries two red-and-white `RED LINE STATION →` direction boards at 2.8 m so the line reads at ground level. Frames: `follow-redline`, `whole`.
* **Footbridge** (`mushin-footbridge`, new, `footbridge.ts` style `steel`): a steel bridge with a red-and-white fascia, stair runs at both ends and a `RED LINE ← MUSHIN STATION` gate board over the main road at the west road mouth, 2.9 tiles beyond the wall, deck 4 m. Frame: `follow-footbridge` (player on the west mouth tile).
* **Idi-Oro hall** (`mushin-idi-oro-hall`): the signboard moved down to 2.45 m and made larger, two painted produce boards (yam / plantain, pepper / tomato) on the wall at 1.15 m, green roof and crates as before. Frame: `follow-idioro`.

### Fadeyi

* **Footbridge** (`fadeyi-footbridge`): the old bridge stood 11 tiles beyond the east edge, out of every follow frame. It is now the shared `footbridge.ts` (style `concrete`) 3.6 tiles beyond the east wall, deck 4 m, stair runs both ends, a `BRT ONLY  •  ONIPANU` gate board. Frame: `follow-footbridge` (player on the east road mouth).
* **BRT lane** (`fadeyi-brt-lane`): the blue lane, median barriers, shelters and the painted BRT words were already readable; unchanged. Frame: `follow-brt`.
* **Frontage** (`fadeyi-bank-frontage`): a columned portico with steps, an entablature and a blue pediment sheet were added to the three-storey white frontage, and its fictional name board (`LAGOON TRUST FINANCE`) now hangs on the front of the entablature at 2.7 m (it was at 5.8 m, and a first attempt on the wall behind the columns was hidden by the portico roof). Frame: `follow-bank`.

### Lagos Island

* **Cathedral** (`lagos-cathedral`): the three heritage rects north of the civic square are now three different buildings. The middle one is the cathedral frontage: a grey neo-gothic west front with a pointed portal, a rose window, two lit lancets, stepped buttresses with pinnacles, a stepped gable and a small cross, and a plate `OLD EKO CATHEDRAL` (fictional). Behind it the set cathedral is taller (nave 10 m, tower 28 m with a spire, lit pointed windows, a rose window) and the north skyline leaves a gap so it stands clear. Frames: `follow-cathedral`, `whole`.
* **Civic dome** (`lagos-civic-dome`, new): the west rect is a pale columned portico under a pediment with a drum and a copper-green stacked-ring dome with a lantern, plate `EKO CIVIC HALL` (fictional). Frames: `follow-civic`, `whole`.
* **Brazilian-quarter flavour**: the east rect keeps the heritage row with a pastel wash and arched, shuttered windows.
* **Textile maze** (`lagos-textile-maze`): the Balogun-style stalls and umbrellas were already the strongest feature of the overview and the follow frame; unchanged. Frame: `follow-textile`.

### Lekki

* **Link bridge** (`lekki-link-bridge`, `lekkiBridge.ts`): a fictional cable-stayed bridge: a white pylon with two legs, flared feet and cross struts, 18 stay cables per fan side, a deck with parapets and lamp standards, three buses crossing. The old bridge was 15 tiles behind a tall perimeter wall; it is now 2.4 m beyond the seawall, the deck at 1.7 m, and the north perimeter rects (`building`, x < 40) are drawn as a low quay apron with a railing and lamp standards so the lagoon is open to the camera (solid tiles unchanged). The north edge stalls and umbrellas, which stood on the water, are gone, the lagoon plane was hidden under the ground plane (the water now shows), and two `LAGOON LINK BRIDGE` plates sit on the seawall face in front of the pylon. Frames: `follow-bridge`, `whole`.
* **Admiralty Way** (`lekki-admiralty-way`): a public street name used only as a street sign. Blue-and-white blade street-name plates on the cover blocks that flank the boulevard (at the junction corners) and `ADMIRALTY WAY` painted along the lanes (twice). No business is replicated. Frame: `follow-admiralty`.
* **Lit plaza** (`lekki-lit-plaza`): the two kiosk tiles in the middle of the paved plaza, on the boulevard's axis, are drawn as a lit fountain (basin, glowing water, tiered column, jets, a ring of 14 warm lights, four lamp standards, a `ADMIRALTY PLAZA` plate) and the floor carries a paving medallion with 24 inlaid lights. Frame: `follow-plaza`.

### Ebute-Metta

* **Station name plate** (`ebute-station-sign`): the `EBUTE-METTA / STATION  •  PLATFORMS 1-4` plate moved from 4.9 m to 2.35 m, grew to 4.6 x 0.92 m, white on green; the platform posts carry blue-and-white `EBUTE-METTA` name boards. Frame: `follow-station`.
* **Signal gantry** (`ebute-signal-gantry`, new): each rail portal now carries a steel signal gantry (two masts, a beam, three colour-light heads, lit on both faces) and a face-mounted double lamp over the arch; the signal cabin has a semaphore mast. Frames: `follow-gantry`, `follow-yard`.
* **Rail yard** (`ebute-rail-yard`): the wagons, ballast and solid portals were already there; the cabin now has a `YARD CABIN  •  KEEP CLEAR` board and the semaphore, and the gantries frame the tracks. Frame: `follow-yard`.

## 4. Haze

Fog is distance fog from the camera. The follow camera never sees fog (everything is within 25 m of it) so haze only matters in the overview, where it hid the bridge, the cathedral and the viaduct. Changed in each arena's own look (`RUMBLE_*_LOOK`, `fog.near / far`), keeping the colours and the mood; the night looks derive from them.

| Arena | Fog near / far before | after |
|---|---|---|
| Lekki | 36 / 126 | 84 / 300 |
| Mushin, Fadeyi, Lagos Island, Ebute-Metta | 32-34 / 112-120 | 62 / 220 |
| Ojuelegba, Oshodi | unchanged | unchanged |

No new quality-ladder budget was added (fog is a per-arena constant, not a quality field).

## 5. What is still weak, and what needs bespoke art or review

* **Lekki bridge in the follow frame.** By section 1 a pylon cannot be in the follow frame. From the north promenade rows the player sees the deck, parapet, lamp standards, the lower ends of the stays and the name plates; the pylon and both fans are whole only in the overview. A better follow-frame read needs either a camera allowance for the lagoon side or a bespoke low-poly bridge model (`tools/assets`) with a pylon that leans toward the camera; both were out of scope.
* **Mushin Red Line station in the follow frame.** The viaduct is a distant backdrop; the follow frame carries only the red-and-white boards and the footbridge. The station roof, viaduct and train are the overview's.
* **Footbridges** read from the road mouths and at the board's side edges; a player in the middle of the board sees only the stair runs, if anything.
* **Software WebGL only.** Frame times are not measured; draw calls and triangles are (section 6).
* The water of Lagos Island and Ebute-Metta is, like Lekki's was, a plane at `STREET - 0.12` under the ground plane at -0.31 and is not visible; fixing it is a one-line change per arena but changes those looks, so it was left alone.
* **Art review.** The cathedral and the civic hall are generic stone/cream/copper-green massing with fictional names, not replicas of any real building; the pastel row is a colour reference only. The bridge is generic (no real pylon proportions), "Red Line", "BRT" and "Admiralty Way" are public line, system and street names used as signs only. `LAGOON TRUST FINANCE`, `YARD CABIN`, `EKO CIVIC HALL` and `OLD EKO CATHEDRAL` are invented. A legal and cultural review should still confirm the cathedral's small cross (a religious symbol on a fictional building), the Red Line livery colours against the real operator's, and that no board reads as a real business.
* No music, voice or ambience was added; briefings may quote the anchor names (`MAP_ANCHORS`) only.

## 6. Performance

Method: `scripts/map-identity-perf.mjs` walks `renderer().scene` after the match starts and counts visible meshes (an upper bound of draw calls: no culling, no LOD) and triangles. It is deterministic for a build, unlike a frame's `stats()` (which swings by 30 % with culling and the traffic on screen). Medium quality, base `321cc5a` against this branch.

| Arena | Meshes before | after | delta | Triangles before | after | delta |
|---|---|---|---|---|---|---|
| Ojuelegba | 548 | 548 | +0 (+0.0 %) | 1,733,329 | 1,733,329 | +0 (+0.0 %) |
| Oshodi | 630 | 630 | +0 (+0.0 %) | 3,203,932 | 3,203,934 | +2 (+0.0 %) |
| Mushin | 631 | 632 | +1 (+0.2 %) | 1,752,382 | 1,749,629 | -2,753 (-0.2 %) |
| Fadeyi | 571 | 571 | +0 (+0.0 %) | 1,617,709 | 1,618,341 | +632 (+0.0 %) |
| Lagos Island | 633 | 630 | -3 (-0.5 %) | 1,739,596 | 1,740,168 | +572 (+0.0 %) |
| Lekki | 579 | 596 | +17 (+2.9 %) | 1,560,136 | 1,529,654 | -30,482 (-2.0 %) |
| Ebute-Metta | 618 | 618 | +0 (+0.0 %) | 1,726,452 | 1,726,990 | +538 (+0.0 %) |

The new geometry is small everywhere: the biggest mesh change is Lekki (+17 meshes: the bridge's materials and its three instanced buses), and its triangle count still falls because the tall north perimeter blocks became a low seawall. Ojuelegba is identical; Oshodi differs only by two triangles of run-to-run variation (its source changed by comment lines only).

Frame `stats()` numbers printed next to each image by the shot script vary too much between frames to be a budget measure.

## 7. Reproducing

```
npx vite build && npx vite preview --port 5231            # base or this branch
WAHALA_CHROMIUM=/opt/pw-browsers/chromium SHOT_URL=http://localhost:5231/wahala-game/ \
  node scripts/map-identity-shots.mjs docs/screenshots/map-identity after rumbleLekki
WAHALA_CHROMIUM=... SHOT_URL=... node scripts/map-identity-perf.mjs
npx vitest run tests/render/map-anchors.test.ts
```

The shot positions are in `SHOTS` at the top of `scripts/map-identity-shots.mjs`.

## 8. Frames

Each shot: the base frame (`before_<arena>_<shot>.jpg`), then this branch (`after_<arena>_<shot>.jpg`); the reference arenas show the base frame only. Tile positions are in `scripts/map-identity-shots.mjs`.

### Ojuelegba (unchanged: before = after)

`follow-centre`

![before rumbleOjuelegba follow-centre](screenshots/map-identity/before_rumbleOjuelegba_follow-centre.jpg)

`follow-north`

![before rumbleOjuelegba follow-north](screenshots/map-identity/before_rumbleOjuelegba_follow-north.jpg)

`whole`

![before rumbleOjuelegba whole](screenshots/map-identity/before_rumbleOjuelegba_whole.jpg)

### Oshodi (unchanged: before = after)

`follow-plaza`

![before rumbleOshodi follow-plaza](screenshots/map-identity/before_rumbleOshodi_follow-plaza.jpg)

`follow-north`

![before rumbleOshodi follow-north](screenshots/map-identity/before_rumbleOshodi_follow-north.jpg)

`whole`

![before rumbleOshodi whole](screenshots/map-identity/before_rumbleOshodi_whole.jpg)

### Mushin

`follow-redline`

![before rumbleMushin follow-redline](screenshots/map-identity/before_rumbleMushin_follow-redline.jpg)
![after rumbleMushin follow-redline](screenshots/map-identity/after_rumbleMushin_follow-redline.jpg)

`follow-footbridge`

![before rumbleMushin follow-footbridge](screenshots/map-identity/before_rumbleMushin_follow-footbridge.jpg)
![after rumbleMushin follow-footbridge](screenshots/map-identity/after_rumbleMushin_follow-footbridge.jpg)

`follow-idioro`

![before rumbleMushin follow-idioro](screenshots/map-identity/before_rumbleMushin_follow-idioro.jpg)
![after rumbleMushin follow-idioro](screenshots/map-identity/after_rumbleMushin_follow-idioro.jpg)

`whole`

![before rumbleMushin whole](screenshots/map-identity/before_rumbleMushin_whole.jpg)
![after rumbleMushin whole](screenshots/map-identity/after_rumbleMushin_whole.jpg)

### Fadeyi

`follow-footbridge`

![before rumbleFadeyi follow-footbridge](screenshots/map-identity/before_rumbleFadeyi_follow-footbridge.jpg)
![after rumbleFadeyi follow-footbridge](screenshots/map-identity/after_rumbleFadeyi_follow-footbridge.jpg)

`follow-brt`

![before rumbleFadeyi follow-brt](screenshots/map-identity/before_rumbleFadeyi_follow-brt.jpg)
![after rumbleFadeyi follow-brt](screenshots/map-identity/after_rumbleFadeyi_follow-brt.jpg)

`follow-bank`

![before rumbleFadeyi follow-bank](screenshots/map-identity/before_rumbleFadeyi_follow-bank.jpg)
![after rumbleFadeyi follow-bank](screenshots/map-identity/after_rumbleFadeyi_follow-bank.jpg)

`whole`

![before rumbleFadeyi whole](screenshots/map-identity/before_rumbleFadeyi_whole.jpg)
![after rumbleFadeyi whole](screenshots/map-identity/after_rumbleFadeyi_whole.jpg)

### Lagos Island

`follow-cathedral`

![before rumbleLagosIsland follow-cathedral](screenshots/map-identity/before_rumbleLagosIsland_follow-cathedral.jpg)
![after rumbleLagosIsland follow-cathedral](screenshots/map-identity/after_rumbleLagosIsland_follow-cathedral.jpg)

`follow-civic`

![before rumbleLagosIsland follow-civic](screenshots/map-identity/before_rumbleLagosIsland_follow-civic.jpg)
![after rumbleLagosIsland follow-civic](screenshots/map-identity/after_rumbleLagosIsland_follow-civic.jpg)

`follow-textile`

![before rumbleLagosIsland follow-textile](screenshots/map-identity/before_rumbleLagosIsland_follow-textile.jpg)
![after rumbleLagosIsland follow-textile](screenshots/map-identity/after_rumbleLagosIsland_follow-textile.jpg)

`whole`

![before rumbleLagosIsland whole](screenshots/map-identity/before_rumbleLagosIsland_whole.jpg)
![after rumbleLagosIsland whole](screenshots/map-identity/after_rumbleLagosIsland_whole.jpg)

### Lekki

`follow-bridge`

![before rumbleLekki follow-bridge](screenshots/map-identity/before_rumbleLekki_follow-bridge.jpg)
![after rumbleLekki follow-bridge](screenshots/map-identity/after_rumbleLekki_follow-bridge.jpg)

`follow-admiralty`

![before rumbleLekki follow-admiralty](screenshots/map-identity/before_rumbleLekki_follow-admiralty.jpg)
![after rumbleLekki follow-admiralty](screenshots/map-identity/after_rumbleLekki_follow-admiralty.jpg)

`follow-plaza`

![before rumbleLekki follow-plaza](screenshots/map-identity/before_rumbleLekki_follow-plaza.jpg)
![after rumbleLekki follow-plaza](screenshots/map-identity/after_rumbleLekki_follow-plaza.jpg)

`whole`

![before rumbleLekki whole](screenshots/map-identity/before_rumbleLekki_whole.jpg)
![after rumbleLekki whole](screenshots/map-identity/after_rumbleLekki_whole.jpg)

### Ebute-Metta

`follow-station`

![before rumbleEbuteMetta follow-station](screenshots/map-identity/before_rumbleEbuteMetta_follow-station.jpg)
![after rumbleEbuteMetta follow-station](screenshots/map-identity/after_rumbleEbuteMetta_follow-station.jpg)

`follow-yard`

![before rumbleEbuteMetta follow-yard](screenshots/map-identity/before_rumbleEbuteMetta_follow-yard.jpg)
![after rumbleEbuteMetta follow-yard](screenshots/map-identity/after_rumbleEbuteMetta_follow-yard.jpg)

`follow-gantry`

![before rumbleEbuteMetta follow-gantry](screenshots/map-identity/before_rumbleEbuteMetta_follow-gantry.jpg)
![after rumbleEbuteMetta follow-gantry](screenshots/map-identity/after_rumbleEbuteMetta_follow-gantry.jpg)

`whole`

![before rumbleEbuteMetta whole](screenshots/map-identity/before_rumbleEbuteMetta_whole.jpg)
![after rumbleEbuteMetta whole](screenshots/map-identity/after_rumbleEbuteMetta_whole.jpg)
