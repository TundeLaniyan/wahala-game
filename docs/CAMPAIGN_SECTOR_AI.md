# Campaign sector AI

<!-- Other sections of this document (enemy AI, campaign combat rules) are written on their own branches. This section
is self-contained so a merge only appends it. -->

## Enemy telegraphs and looks

Branch `claude/wahala-csa-looks` (presentation only; decisions SV1-SV5 in `docs/DECISIONS.md`). Founder problem: enemy
punches were impossible to anticipate from the elevated camera on a phone. Nothing here changes a rule, a timing or a
sim field: the views read the state and the events.

### Where the telegraphs are drawn (SV1)

`EnemyTelegraphViews` (`src/render/views/EnemyTelegraphViews.ts`) is built for every match with campaign enemy seats
(`Player.enemyKind`) or campaign health: field missions, boss missions, raids and the Academy's Generator Tactics
lessons. City Rumble, Classic and online have no `enemyKind` seats and never build it. The Oshodi combat pilot's old
enemy rings moved here; `CombatPilotViews` keeps only the human's swing feedback.

### What each telegraph shows, and from which state (SV2)

`readTelegraph` (`src/render/views/enemyTelegraph.ts`, pure, unit-tested) decides per enemy per frame:

| Telegraph | Read from | Drawn |
| --- | --- | --- |
| **Punch wind-up** | `Player.attack` (pending attack, `resolveTick`, `dir`, `skill`); start = the `attackStarted` tick, or `resolveTick - windupTicks(kind)` when joined late | a thick red ring (dark outline) under the enemy whose centre FILLS and whose pulse quickens as `resolveTick` nears; a fat arrow toward the aimed tile that grows; the aimed tile framed and filling (plus the reach-2 tile of a long attack); corner brackets on the other open neighbours the blow can still find when it resolves (`skills.ts pickTarget` re-picks anyone in reach); a clock over the head whose 12 wedges fill clockwise. The swing clip is stretched so the fist lands at `resolveTick`. |
| **Throw cue** | `state.projectiles` of the enemy before `launchTick + warnTicks` (`path`, `dir`, `strong`) | an amber SIGHT (ring with four ticks, turning) under the thrower, filling; chevrons marching along the path, an X on its last open tile; the clock with sight ticks over the head; the throw clip stretched over the cue. ProjectileViews still draws the held object, the faint path and the flight. |
| **Open (punish now)** | `enemyAttackPhase` = attack / recovery and `tick < rootedUntil` | a cyan BROKEN ring (eight dashes) that turns and shrinks as the window closes. A punch that resolves at the air (`attackResolved`, `hit: false`) also plays the Stumble clip and kicks dust. |
| **Stagger** | `tick < dazedUntil` | a thin yellow ring (PlayerViews already circles dazed stars over the head). |

The wind-up length is never hard-coded: the fill runs from the press to the LIVE `resolveTick`, so a longer or shorter
wind-up from the AI tuning reads the same (tested by moving `resolveTick`).

Readability rules: shape and motion carry the meaning, colour only supports it (solid ring + arrow = punch, sight +
chevrons = throw, broken ring = open, thin ring + stars = stagger; fill, pulse rate and marching chevrons show timing).
Every glyph has a dark outline baked in (reads on a pale yard and on night asphalt), colours are not tone-mapped. Marks
under the enemy are depth-tested (its body stands in front of them); marks on the surrounding tiles and the head clock
draw over everything so the warning on the human's tile is never hidden. The arrow, frame and clock were sized for the
follow camera on a 740 x 360 CSS-px landscape phone (about 32 CSS px a tile).

Cost: eleven floor glyphs and three head glyphs, each one `InstancedMesh` (one draw call, hidden while empty), shared
geometry and materials, no allocation per frame once warm. Not gated by quality: Very Low draws exactly the same.
Measured: see "Measurements" below.

### Wind-up sound (SV3)

Two synthesised one-shots on the warning bus (`src/audio/recipes/gameplay.ts`): `enemy_windup` (a short low rising
growl and breath that stops dead, for a punch) and `enemy_aim` (two dry high clicks rising a step, for a throw). The
router (`attackStarted` from an `enemyKind` seat, `projectileLaunched`) rate-limits them: each at most every 0.35 s and
any two at least 0.15 s apart, so a group winding up together makes one warning. A human's or a multiplayer bot's press
keeps the old quick breath. The throw's whistle now plays when the object leaves the hand (`warnTicks` later). No
recording, voice or music.

### Variant looks (SV4)

`src/assets/enemyLooks.ts` (data) and `src/render/assets/enemyKit.ts` (builder). A seat's variant is
`Player.enemyVariant ?? DEFAULT_VARIANT_OF_KIND[enemyKind]`; a seat whose variant changes after it was drawn is dressed
again. Multiplayer fighters and the human keep their identity kit.

| Variant | Rig, scale | Palette | Headwear | Props |
| --- | --- | --- | --- | --- |
| Agbero | seat's cast, 1.0 | rust tee, denim | cap | - |
| Area Boy | seat's cast, 0.95 | mustard, black | red bandana with knot tails | - |
| Bottle Thrower | seat's cast, 0.98 | faded blue, grey | bucket hat | bottle in the right hand, bottle crate on the back |
| Market Enforcer | seat's cast, 1.03 | market green, brown | knit cap | apron, sack over the shoulder |
| Heavy | Area Boss rig, 1.16 | brown, black | black hard hat, red stripe | padded bulky vest with straps |
| Ring Route Marshal | seat's cast, 1.02 | Ring plum, charcoal | plum beret, plain lime disc | lime sash, baton |
| Ring Security | seat's cast, 1.05 | charcoal, black | patrol cap, lime band | plum vest with lime bands, chest radio, earpiece |
| Lieutenant | seat's cast, 1.08 | deep red, black | flat cap | shades, gold chain; gold leader ring |
| Boss | Area Boss rig, 1.14 | cream suit, black | fedora, gold band | shades, gold chain; gold leader ring |

The Ring palette (plum `#5b2463`, lime `#a8dc3a`) is invented: no police black or blue, no army green or camouflage, no
LASTMA yellow-and-maroon, no FRSC or civil-defence colours, no insignia, text badges or logos. Name tags, health pips
and the head clock rise with a bigger silhouette.

Cost: one shared vertex-coloured material for every kit piece; the pieces of one bone are merged into one geometry,
cached per variant and rig (ten enemies of a variant share the buffers); the recoloured cloth is cached per palette.
A variant adds one mesh per dressed bone (head / chest / spine / right hand: one to three); only head and chest pieces
cast shadows. If the glTF cast fails to load, the procedural fallback gets the headwear and the scale (no props).

**TEMPORARY, needs dedicated 3D production:** every variant look. The kit is primitives on the three hero rigs (and the
Area Boss rig); the vests, apron and sash are boxes, not cloth; the hero rigs' own details (jersey numbers, Lekki Boy's
hood) still show through the palette; faces and bodies are the heroes'. Each variant should become its own skinned
glTF built by `tools/assets/` with the same clip list, named bones and `cloth` material, with props modelled in. The
Ring palette should be checked again by the founder against current Lagos uniforms before any final art.

### Armoured cue (SV5, not done)

The optional "only a blast finishes" glyph on the health pips was skipped: no general sim field says it. The only
signal today is `punchFloor(state, p)` in the Tactical Trap pilot (Academy only). Request to the AI worker below.

### Requests to the enemy AI / combat rules worker

Everything above works from the existing state. Nice to have, never required (each has a fallback in place):

1. `attackStarted` already carries `resolveTick`; if a wind-up is ever extended after the press, keep writing the new
   value to `Player.attack.resolveTick` (the view reads it live). No new event needed.
2. An explicit **counter window** field, e.g. `Player.openUntil?: number` (tick), set when an enemy is punishable after
   a swing or a throw. Today the view infers it from `enemyAttackPhase` + `rootedUntil`, which also covers any other
   rooting of an enemy seat.
3. A **blast-only finish** flag for SV5, e.g. `Player.punchProof?: boolean` (true while a punch can no longer take the
   last health, heavy / lieutenant / boss), or a pure exported `finishableByPunch(state, p): boolean`. The view would
   add a small shield glyph to the health pips; without it nothing is drawn.

### Measurements

See `docs/DECISIONS.md` SV2 / SV4 and the final report of this branch: draw calls counted with
`window.__WAHALA__.renderer().stats().drawCalls` (`?debug`) in Terminal Approach at Low, 740 x 360, all five enemies
beside the human, toggling the kit meshes / the telegraph group on and off; CPU cost of the telegraph update measured
headless.

### Screenshots

`docs/screenshots/campaign-sector-ai/` (landscape phone 740 x 360 CSS px, device scale 2): a punch wind-up on Low and
on High, a throw cue, the open window, and two lineups of the nine variants.
