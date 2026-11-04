# Mission presentation

Branch `claude/wahala-campaign-online-v1`, worker `mission-presentation`. How a campaign mission is **seen**: world markers for the objective, the telegraphed strikes and the boss, an objective compass, the minimap layer and where the mission panel sits. Presentation only: every picture is read from the sim's `missionView(state)` (and `state.mission` for numbers the view does not carry); nothing here decides a rule. Mission rules: `docs/MISSION_SIM.md`. HUD rules: `docs/HUD_COMBAT.md` (decision HC5), `CLAUDE.md` (no transient text over the board).

## Why

A real Oshodi screenshot (`docs/screenshots/missions/oshodi-desktop.png`) showed a playable mission with no way to play it: the panel hung top-centre of City Rumble's HUD on top of the board, the follow camera shows about a dozen tiles of a 49 x 35 district so the relays were off screen with nothing pointing at them, the convoy lane was invisible until it burned, nobody could tell the boss from the crew, and the minimap showed none of it.

## What is drawn

| Thing | Where | Drawn as |
| --- | --- | --- |
| Objective node | `render/views/MissionViews.ts` | A pad (dark disc with a bright rim, a square bracketed zone for a 3 x 3 junction), a 3D icon (below), a thin beam of light while it wants the player, a progress ring that fills clockwise from 12 o'clock by `fraction`, a green tick when done |
| Telegraphed warning tiles | same | Per tile: a hatch that grows to fill the tile as the landing nears, a glow, and an outlined edge that brightens; flashes in the last quarter |
| Boss | same | A ring under him (and a bubble / halo), see the legend |
| Crew | same | One small ring in the role colour under each crew fighter that is alive |
| Compass | `ui/MissionCompass.tsx`, `ui/missionCompassModel.ts` | A pointer on the screen edge with the distance in tiles |
| Minimap | `ui/Minimap.tsx`, `ui/minimapModel.ts` | Nodes, warning tiles and the boss |
| Panel | `ui/MissionDock.tsx` | The right column under the minimap (City Rumble) / the rail (a standard arena) |

No text anywhere in the world: every label ("RELAY 2", "CONVOY 2s") lives in the panel (CLAUDE.md HUD rule). Icons are procedural low-poly shapes, one merged vertex-coloured mesh per marker (`render/views/missionIcons.ts`).

### Icons by objective kind

| Objective (`ObjectiveKind`) | Node | Icon |
| --- | --- | --- |
| `dispatchRelays` (Oshodi) | relay | Radio mast with two cross-bars, a red lamp, a dish and an orange cabinet |
| `supplyRoutes` (Mushin) | parts stack | Three stacked tyres, a crate and a wrench |
| `junctionAccess` (Fadeyi / Somolu) | junction | Toll barrier (two posts, red and white bar) and a cone, inside a 3 x 3 square zone |
| `evidenceRun` (Lagos Island) | ledger / `press` | Ledger folder with loose sheets and a ribbon; the press drop is a small printing press with rollers |
| `contingencyGrid` (Lekki) | switch | Electrical cabinet with a red and a green lamp and a lever |
| `dispatchWindows` (Ebute-Metta) | switch | Rail switch lever: base plate, stand, tilted lever with a red ball, an amber signal lamp |

### Colour legend

| Colour | Means |
| --- | --- |
| Gold (pulsing pad, beam) | Do this now: a `live` or `idle` node, or a node being worked |
| Gold pad + green ring filling | `progress`: the ring is the channel / hold / blast progress |
| Green pad + tick, ring full | `done` (jammed, destroyed, held, collected, thrown, switched off) |
| Dim grey pad, no beam | `locked` (for example the rail window is closed) |
| Red hatch | Lethal strike, convoy or contingency strike: the tiles will burn when the edge reaches the tile |
| Amber hatch | The rail lane: a railcar will cross it |
| Blue hatch | Reinforcements will arrive on this tile |
| Blue bubble and ring on a fighter | The boss is shielded |
| Flashing red / gold ring, halo, beam and a gold arc draining clockwise | The boss is exposed; the arc is the window left |
| Green ring fading out | The boss is defeated |
| Small role-colour ring under a crew fighter | melee guard orange, ranged red, blocker grey, runner cyan, escort violet, defender gold, support teal, boss assistant pink |

The warning countdown needs no number: the hatched square fills the tile (30 % to 96 %) from the moment it is called until it lands, the edge frame brightens, and the last quarter flashes. The total time of a warning is the largest `remainingTicks` seen for it (the view gives warnings no id: `warningKey` = kind + first tile + size).

### Perf and rules of the view

`MissionViews` is created only when `state.mission` exists (`GameRenderer.loadGame`), so a normal match builds nothing; without a mission it would idle (`group.visible = false`). Materials and geometries are shared: ring arcs come from a pool of 49 geometries (steps of 1/48), icons are built once per kind, the three warning layers and the crew pips are `TileOverlay` instances (one draw call each, capacity 256 / 16). In the follow camera a marker off screen is not drawn (`FrameContext.inView`). There is no new `QualityProfile` field. `?nomarkers` leaves the view out (for measuring).

Measured with `renderer.stats()` on the Oshodi staging of `scripts/mission-presentation-shots.mjs` (software GL, desktop 1280 x 720, Auto quality, camera identical in both runs; draw calls and triangles are deterministic, fps is not):

PERF_TABLE

## Compass

The follow camera hides most of the district, so a small pointer sits on the **screen edge** towards the nearest live objective node (the exposed boss during his window), with the distance in tiles ("26 tiles").

- Target (`compassTarget`): live or in-progress nodes first; with none, idle nodes (junctions, ledgers) but never the idle press drop; the exposed boss; nothing when everything is done / locked, the mission is over or the fighter is down.
- Placement (`placeCompass`): on the line from the player's screen position to the target, on the inset edge of the canvas (never the centre), slid along the edge past the other HUD blocks (timer, buttons, left panel, right column, inventory, action buttons, move pad). Hidden while the target is on screen (its marker in the world is enough).
- Reads the camera through `GameRenderer.projectTiles` (`CameraRig.projectTilesNdc`) and `session.projectTilesToPage`; drawn straight on the DOM at 20 fps, no React state per frame. `data-shown`, `data-target`, `data-kind` and `data-tiles` are on `[data-testid="mission-compass"]`.

## Minimap

`minimapMission(state)` (pure, tested) adds a mission layer to the City Rumble map: nodes as gold dots with a pulsing ring (green and ringed while worked, green when done, grey when locked, a square for the press drop), warning tiles (red strikes and convoys, amber rail lane, blue reinforcements, blinking in the last 2 s), and a ring round the boss (blue shielded, flashing red / gold exposed, green defeated).

## Where the panel sits

- **City Rumble** (every mission): the right column under the minimap (`.rumble-right` > `.minimap` + `.mission-dock`, `ui/MissionDock.tsx`). The follow camera fills the screen with the board, so the corner columns are the only quiet places (the roster list is the left one). On phones the dock ends above the touch action buttons; what does not fit is clipped at the bottom (phase and warnings first).
- **Standard arenas** (tests, future modes): unchanged, a block of the rail (`ui/HudRail.tsx`).

Panel contents are unchanged (decision HC5): phase pips, objective and progress bar, callout, boss state with the exposed countdown, lives, time and the warnings with their seconds. `MissionPanel.css` rules apply in both homes; `tests/ui/combatHudContrast.test.ts` still checks every colour on the plate.

## Audio

Existing synthesised cues only (no new recipe, recording, music or voice): `missionPhase` cleared `pickup_rare`, started `ui_start`; `missionNode` done `pickup_1`; `missionWarning` strike / convoy `crush_warning`, rail lane `rail_bell`, reinforcements `ui_count`; `bossExposed` `ui_go` (ducks the warning bus); `bossShielded` after a missed window `ui_back`; `bossDefeated` `win_sting`. The start, the callout and the outcome stay silent (the HUD and the match-end sting carry them).

## Decisions

- **MP1** World markers are flat pads plus a small icon, not text: no label over the board, readable on the follow camera and the overview. Colour carries the state, shape carries the kind (a colour-blind player still sees a filling ring, a tick and a hatch).
- **MP2** Warnings are drawn per tile with a filling hatch rather than a number, so the player reads "what burns and how soon" from the floor.
- **MP3** The compass hides when the target is on screen and slides past HUD blocks; it never moves the camera (the camera stays the follow camera).
- **MP4** The mission panel moves to the right column in City Rumble (supersedes the top-centre rail of HC5 for the stadium camera only).
- **MP5** Mission audio reuses existing recipes; nothing new is generated.

## Tests

`tests/render/mission-markers.test.ts` (look functions, icons, the view against a simulated mission: no-op without a mission, marker per node of all six missions, hatch per telegraphed tile, boss bubble / ring / arc / fade, crew pips), `tests/ui/missionCompass.test.ts` (target choice, edge placement, avoiding HUD blocks, the minimap layer), `tests/audio/engine.test.ts` (the cue mapping), `e2e/mission-presentation.spec.ts` (a real Oshodi mission: panel in the right column, clear of the other HUD blocks, markers per node, compass on the edge).

## Screenshots

`docs/screenshots/mission-presentation/` (made with `scripts/mission-presentation-shots.mjs`; the state is staged through `__WAHALA__.controller().state`, then the real sim ticks on):

SHOT_LIST

## Still missing (art and polish)

- No real 3D models: the icons are procedural boxes, cylinders and tori. Hand-made glTF props (`tools/assets/`) would let a relay look like a Lagos roadside mast, a parts stack like an actual spare-parts heap, a barrier like the toll gate it is.
- No railcar / convoy vehicle is drawn for a strike: the lane is hatched and the flames burn, but no truck drives down it (a convoy "vehicle" would need the stage-hazard vehicle meshes; the Ebute-Metta railcar is the existing `train` stage view).
- The boss has no portrait or banner marker: he is the ring and bubble under a normal fighter; a crown or sash on his rig would help when he stands among crew.
- No decoy cue for the Lekki switches beyond the gold target: the signalled order is the panel's callout, not a number over each switch (no world text); the compass points at the next switch only.
- Beams and halos are additive; on a very bright day board they are subtle (the pad's dark disc carries the marker there).
- The crew pips show roles by colour only; there is no legend in the game UI (it lives here).
- Mission FX: no particles on a jam, a hold completing or a boss window opening beyond the existing explosion / sparkle effects.
