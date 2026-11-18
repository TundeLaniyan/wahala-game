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

### Awareness markers and armour cue (SV6-SV8)

Branch `claude/wahala-csa-polish`, presentation only. Screenshots (landscape phone 740 x 360, dsf 2, Low):
`awareness-alert-low-740x360.jpg`, `awareness-query-lost-low-740x360.jpg`, `field-windup-low-740x360.jpg`,
`armour-needs-blast-low-740x360.jpg` in `docs/screenshots/campaign-sector-ai/`.

| Mark | Signal | Drawn |
| --- | --- | --- |
| **Spotted you** | `enemyCue` `alert`, or the mind entering `alert` | orange warning triangle with a dark "!" where the head clock sits: pops (overshoot), holds the alert beat (clamped 0.6-1.2 s), fades |
| **Going to look** | `enemyCue` `investigate`, or the mind entering `investigate` (a lost chase has no event) | pale-blue round plate with a dark "?", sways gently for about 1.1 s, fades |
| **Lost you** | `enemyCue` `lost`, or the mind entering `return` (a search that found nothing has no event) | grey round plate with three dark dots that sinks and fades over 0.9 s |
| **Armoured** | `enemyHealthView(...).blastOnly` | a steel-blue heater shield, a badge at the left end of the name tag, shown with the pips |
| **Needs a blast** | the same, with `hp <= punchFloor` | the shield turns amber, pulses, and a red-orange starburst appears behind it; a boss / lieutenant (bar in the rail) shows it over its head only at the floor or just hurt |

`src/render/views/enemyAwareness.ts` (pure, unit-tested) maps the cue or state change to a mark and its look per tick
of age; `EnemyTelegraphViews` draws it, `DamageViews` the shield (`armourCue` in `damageModel.ts`). An event and the
state change it reports fold into one mark. Marks are timed in sim ticks (a pause holds them), never drawn while the
wind-up clock shows (the clock is the more urgent read), and pursuit has none (the chase reads by itself). Each mark is
outlined geometry, not text or a texture: a world-space icon attached to the enemy, not HUD text over the board.
Reduced motion keeps only the fade. Not gated by quality.

Sound (SV7): `enemy_alert` (a dry two-note "hey!" rising a fourth, warning bus, at most every 0.6 s: an ally's call
that alerts a crew in one tick is one sting) and `enemy_query` (a soft breathy glide up, effects bus, at most every
0.8 s, never within 0.4 s after a sting). `lost` stays silent. Synthesised; no recording.

Cost: three mark batches and two shield batches, each one `InstancedMesh` (one draw call while visible, none while
unused); the marks carry a per-instance opacity attribute (one shader variant). Headless, `update()` for three enemies
costs about 1.0 us a frame without marks and 2.3 us with three marks up; no allocation per frame once warm (tested).

Browser probe: `e2e/campaign-combat-readability.spec.ts` (desktop and phone) starts Terminal Approach with
`__WAHALA__.startFieldMission`, stages a warden in front of the human and asserts the "!" mark, then a punch wind-up
(`telegraphStats().melee`), then the Lane Blocker's shield and its "needs a blast" state (`renderer().damageStats()`).

Readability judgement from the screenshots: the "!" triangle and the "?" plate read at a glance at phone size; the
three-dot plate is quieter by design. The shield badge is small (about 17 CSS px) and partly covers the first letters of
the name tag, and when the human stands beside the enemy it can overlap the human's own tag; the starburst makes the
"needs a blast" state distinct from the plain shield. A HUD-rail badge on the boss bar would need `blastOnly` in the
`src/app` HUD snapshot (not done here).

### Measurements

See `docs/DECISIONS.md` SV2 / SV4 and the final report of this branch: draw calls counted with
`window.__WAHALA__.renderer().stats().drawCalls` (`?debug`) in Terminal Approach at Low, 740 x 360, all five enemies
beside the human, toggling the kit meshes / the telegraph group on and off; CPU cost of the telegraph update measured
headless.

### Screenshots

`docs/screenshots/campaign-sector-ai/` (landscape phone 740 x 360 CSS px, device scale 2): a punch wind-up on Low and
on High, a throw cue, the open window, and two lineups of the nine variants.

# Part 2. the campaign tactics layer (decisions SA3-SA12)

Branch `claude/wahala-csa-combat` (from production `46f0781` + the sector contract `6359813`, decision SA2: the enemy
variant roster in `src/sim/data/enemyVariants.ts`). Founder direction (2026-11-18, authorised campaign-wide): generators
are the primary weapon; melee assists (interrupt, knockback, stagger, reposition) without a two-punch slowdown ritual or
frame-perfect sequences; enemies are intelligent but readable and fair; no literal 1990s Bomberman AI.

Everything below is pure simulation (`src/sim`) and bots (`src/ai`), deterministic, and lives behind ONE optional key,
`GameConfig.campaignTactics` (`CampaignTacticsConfig`, `src/sim/config.ts`).

## 1. Where it applies

| Match | `campaignTactics` |
| --- | --- |
| Campaign FIELD missions (all 11) | yes, at the save's level (`missionConfigLayer` adds Normal, `buildMissionGame` the Easy / Hard layer) |
| Campaign BOSS missions (all 6) | yes, plus `seatPerception` (the boss and crew are generator bots without `enemyKind`) |
| Raids (door and standalone) | no: Classic raids keep their rules |
| Training Academy | no: its "Generator Tactics" lessons keep the Tactical Trap pilot (`config.tacticalTrap`), unchanged |
| Classic, City Rumble (Survival / Deathmatch / Team), multiplayer, online | no (tested; the pinned digests are unchanged) |

The **Oshodi combat pilot** (`combatPilot` on `oshodi.approach`, decisions CP1-CP12) is superseded: no campaign mission
runs it. Its code stays as an archived replay behind `MissionSpec.archivedPilot` (its reference tests and
`npm run combat-pilot` only; the campaign never sets it), because the renderer and the audio router still read the key.
Its browser spec was removed with it. Delete `FIELD_COMBAT_PILOTS` and `systems/pilotCombat.ts` when the views no longer
need them.

## 2. Behaviour model: one state machine for every variant

The sim runs ONE territorial state machine per enemy seat that has a territory (`src/sim/systems/territory.ts`,
runtime `GameState.territory`, created by the field builder for every enemy except an escape leg's pursuers, which keep
their mission logic). Data changes its numbers, never its shape. Its directive reaches the bot through the existing
pipeline (`mission/field.ts` `fieldDirective` -> `Observation.directive` -> `ai/directive.ts`).

| State | Enters when | Directive to the bot |
| --- | --- | --- |
| `patrol` | it has a patrol route (2+ waypoints) | `patrol` to the next waypoint; a pause at each (`patrolPauseTicks` + jitter) is `hold` |
| `watch` | no route; after returning | `hold` on its centre; it turns a quarter every `lookAroundTicks` (its view cone sweeps) |
| `investigate` | it HEARD a noise it did not see; or lost sight of a pursued human for `loseTicks` | `investigate` to a coarse spot, then `hold` for `searchTicks` |
| `alert` | sight of the human for `noticeTicks`, the human within `closeTiles`, a hit, or an ally's call | `hold` facing him for `alertTicks` (the readable "!") |
| `pursue` | after the alert | `chase` (or the group's `surround` slot), a ranged variant a `standoff` slot at its `preferredRange`, a cover user ducks out of sight after attacking, out of sight it goes to where it last SAW him |
| `return` | the human left its leash | `hold` facing him for `returnWatchTicks` (a thrower keeps throwing), then `return` to the nearest anchor |

Overlay states from the sim itself (never stored): `windup` / `attack` / `recovery` (`enemyAttackPhase`), `stagger`
(`dazedUntil`), `defeated`. `enemyMindView(state, id)` combines them for presentation. Generator evasion is the bot's
planner (it shows as movement).

**Anti-exploit at the boundary.** The leash is measured from the TERRITORY (its centre and every patrol waypoint), never
the post alone, with hysteresis (`pursuitTiles` + `leashSlack`). Giving up starts a watch facing the human. A hit
re-engages it at once and it then chases with NO leash for `hitChaseTicks`; the human stepping back inside its pursuit
range is noticed three times faster. So hitting a returning enemy from just outside its leash brings it straight at you.

**Territory data** (`FieldEnemyDef.territory`, `TerritoryDef` in `src/sim/campaign/types.ts`; every field optional):
`patrol` (waypoint loop), `centre` / `radius` (guard area), `investigateRadius`, `pursuitTiles`, `onReturn`
(`watch` | `walk`), `alertAllies` (tiles; 0 = never), `escape` (`free` | `territory`: escapes prefer refuges inside the
area). `resolveTerritory` completes it from the level and the variant. The field builder clears the crates on the
shortest way between consecutive waypoints so a patrol never stalls.

## 3. Perception (exact rules)

Generators (`src/ai/trapSight.ts`, generalised from the Academy pilot; the bot, never the sim, decides what it knows):

1. **Sight**: within the vision radius (straight distance between tile centres) and a clear grid line of sight: two
   Bresenham traces, ends excluded, blocked by any non-floor tile (concrete, crates) or another living body. A body on the
   generator's tile hides it. Grid space only: no camera, no graphics quality (architecture test).
2. **Calm view cone**: while calm (patrolling, holding its post, walking back; not engaged, not cautious) it notices a
   generator only in the 90-degree cone ahead of its facing or on the eight tiles around it, and only within its trap
   sense's `calmVisionTiles`. Engaged or cautious: full vision all round.
3. **Reaction**: a seen generator becomes a threat `reactTicks x trapSense.reactScale` after it was first seen (x
   `brawlReactScale` again while brawling: pursuing, winding up, recovering).
4. **Memory**: kept while out of sight for `memoryTicks`; a ticking generator with `memoryHoldFuseTicks` (120) of fuse
   left is held until it blows. Stepping in front of it never erases it; one moved while unseen is forgotten.
5. **Watching a placement** (trap sense `seesPlacement`): a generator laid by someone the enemy can see at that moment is
   known even though the placer's body covers it. Never through a wall or another body; never while it reels.
6. **What the planner gets** (`perceivedObservation`): a generator it never saw is ABSENT (not even an obstacle on its
   route); one seen but not yet reacted to is an obstacle with an unreachable fuse; a known one is real. Remote,
   triggered, thrown, carried, its own and its team's generators are always known.
7. **Hearing** (sim, `updateTerritory`): a generator laid within `hearingTiles` (Manhattan) or a blast within
   `hearingTiles x blastHearingScale` that it did not see sends a calm enemy to INVESTIGATE `investigateSpot`: its own
   tile plus `investigateStep` (3) tiles along one of 8 direction bands (`noiseBand`, integer comparisons only), shortened
   to open floor inside its territory. The source tile and the distance are never used: two hidden sources in the same
   band give the same spot (tested). The bot is also cautious for `caution.ticks` (36): no new wind-up or cue, reaction
   halved.
8. **The human** (sim): noticed with the same grid sight (other bodies conceal him) within `noticeTiles`, in the calm
   cone while calm, after `noticeTicks` of accumulated sight; within `closeTiles` (2) at once.
9. **Boss missions**: the boss and crew generator bots plan on the same perceived observation (`ai/seatPerception.ts`;
   perception rows from `seatPerception`: the boss `boss`, crew by role).

Perception per kind (generators: vision / reaction ticks / memory ticks / hearing tiles; the human: notice tiles):

| kind | Easy | Normal | Hard | notice (E / N / H) |
| --- | --- | --- | --- | --- |
| agbero | 5 / 42 / 120 / 3 | 6 / 30 / 150 / 4 | 7 / 22 / 210 / 5 | 6 / 7 / 8 |
| guard | 6 / 38 / 120 / 4 | 7 / 26 / 150 / 5 | 8 / 18 / 210 / 6 | 7 / 8 / 9 |
| thrower | 7 / 36 / 120 / 4 | 8 / 24 / 150 / 5 | 9 / 16 / 210 / 6 | 8 / 9 / 10 |
| heavy | 5 / 48 / 120 / 3 | 6 / 36 / 150 / 4 | 7 / 28 / 210 / 5 | 5 / 6 / 7 |
| lieutenant | 8 / 28 / 210 / 6 | 9 / 16 / 240 / 7 | 10 / 8 / 300 / 8 | 9 / 10 / 11 |
| boss | 9 / 22 / 210 / 7 | 10 / 10 / 240 / 8 | 11 / 8 / 300 / 9 | 9 / 10 / 11 |

Human notice time: 36 / 20 / 10 ticks (Easy / Normal / Hard), x the variant's `noticeScale`.

## 4. Generator evasion and trap sense

Evasion is the bot's ordinary time-expanded planner on the perceived observation, with the enemy's REAL step time (slow,
kind penalty) and real readiness (wind-up, recovery and cue roots, stagger): a committed or slowed enemy cannot plan an
escape it cannot walk. It never starts a wind-up or a cue inside the real (radial) footprint of a generator it knows,
and a thrower never throws while a known generator's reach touches its tile or a neighbour, nor before it has stood still
`throwSettleTicks` (12), nor from a calm state. No random failure anywhere: the differences are perception, reaction,
attention and planning.

| trap sense | variants | react x | brawl x | planner | calm vision (E / N / H) | watches placements (E / N / H) |
| --- | --- | --- | --- | --- | --- | --- |
| none | area boy | 1.25 | 2 | level | 2 / 2 / 3 | no / no / no |
| basic | agbero, bottle thrower, market enforcer, heavy, route marshal | 1 | 1.5 | level | 2 / 3 / 4 | no / no / yes |
| keen | Ring security | 0.8 | 1 | +1 level | 4 / 5 / 6 | no / yes / yes |
| expert | lieutenant, boss | 0.6 | 1 | +2 levels | full | yes / yes / yes |

The planner level is the campaign level's enemy bot level (Easy Beginner, Normal Casual, Hard Standard; decision CI1)
plus the bump, without the bot levels' random hesitation and wandering (the territory decides where it goes).

## 5. Melee and generator balance (no ritual)

The human's landed close attack on a campaign enemy is ONE tactics hit whatever the fighter (`skills.ts` `tacticsHit`):

| effect | Easy | Normal | Hard |
| --- | --- | --- | --- |
| damage | 1 segment | 1 | 1 |
| per-target lockout | 60 ticks | 72 | 84 |
| human recovery after the hit | at most 30 ticks (every fighter can follow up) | 30 | 30 |
| stagger (cuts a wind-up or throw cue short) | 24 ticks | 18 | 14 |
| stagger immunity after it | 48 | 54 | 60 |
| knockback | 1 tile when the tile is free (never a wall, body or generator; can push into a footprint) | same | same |
| slow | 25 % for 90 ticks, never stacked or refreshed, then resisted 120 ticks | same | same |

Steadfast kinds (heavy, boss) are neither staggered nor moved (they keep winding up: step out or punish the recovery).
Enemy recovery frames after losing health are 6 ticks, so a punch then a blast both land. Enemies keep off the human's
tile; an enemy on it is in reach both ways.

| kind | health | punches finish it? | one blast |
| --- | --- | --- | --- |
| agbero | 2 | yes (2 hits, lockout between) | defeats it |
| guard | 3 | yes (3 hits) | defeats it |
| thrower | 2 | yes | defeats it |
| heavy (ARMOURED) | 4 | no: floor 1 | takes 3 |
| lieutenant (ARMOURED) | 8 | no: floor 4 | takes 3 |
| boss (ARMOURED) | 14 | no: floor 7 | takes 3 |

The rule the player learns: **only a blast finishes armoured enemies**. `enemyHealthView` exposes `blastOnly` and
`punchFloor` for the HUD (absent outside the layer).

## 6. Difficulty

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| patrols | clockwork (pause 48, no jitter) | pause 36 +/- 12 (deterministic per seat, lap, waypoint) | pause 24 +/- 18, reverses every second lap |
| pursuit range from the territory | 6 (+ variant) | 8 | 11 |
| lost-sight search / watch after giving up / no-leash chase after a hit | 60 / 60 / 120 ticks | 120 / 90 / 180 | 180 / 120 / 240 |
| ally calls | none | variant radius | x 1.25 |
| group tactics (surround, line-up) | off (plain chase) | on | on |
| cover after attacking (cover users) | off | 3 tiles | 4 tiles |
| guard view sweep | every 120 ticks | 90 | 60 |
| wind-up (ordinary punch) | 60 ticks | 48 | 38 |
| recovery (ordinary) | 48 | 42 | 36 |
| simultaneous wind-ups per group / gap | 1 / 60 | 2 / 48 | 2 / 30 |
| free window after an enemy hit | 90 | 66 | 54 |
| thrower cue (bottle) / recovery / cooldown | 54 / 54 / 210 | 42 / 42 / 180 | 36 / 36 / 150 |

Hard never learns about an unseen generator: its extra strength is watching placements, sharper senses, longer pursuit,
coordination, cover and a better planner.

## 7. Variants (personality data, `ENEMY_VARIANTS[*].personality`)

| variant | base | trap sense | pursuit | notice x | vision | ally call | other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| agbero | agbero | basic | 0 | 1 | 0 | 0 | |
| areaBoy | agbero | none | +4 | 0.5 | -1 | 0 | overcommits: +12 ticks recovery |
| bottleThrower | thrower | basic | 0 | 1 | 0 | 0 | keeps 4 tiles, +6 recovery |
| marketEnforcer | guard | basic | 0 | 1 | 0 | 0 | ducks out of sight after attacking |
| heavyEnforcer | heavy | basic | -2 | 1 | 0 | 0 | steadfast, armoured |
| routeMarshal | guard | basic | -1 | 1 | 0 | 8 | holds junctions, calls the crew |
| ringSecurity | guard | keen | -2 | 1 | 0 | 5 | defends in pairs |
| lieutenant | lieutenant | expert | +2 | 0.75 | 0 | 10 | keeps 3 tiles; armoured |
| boss | boss | expert | +2 | 0.75 | 0 | 10 | armoured |

The 11 field missions carry first variants and territories (`fieldDefs.ts`, helpers `patrol(...)` / `post(...)`):
wardens are agberos (one patrols the park lane), lane blockers heavies, market hawkers and desk auditors market
enforcers, market runners area boys, Kobo marshals route marshals, switchmen / auditors / gate and estate guards Ring
security, pursuers bottle throwers (their kind is unchanged so the escape legs keep their pace). The sector worker will
re-author them.

## 8. Telegraph contract (for the renderer and audio)

State fields (read every frame; nothing here changes a rule):

| what | where |
| --- | --- |
| wind-up of a punch | `Player.attack` (`dir`, `targetId`, `resolveTick`); `enemyAttackPhase(state, p) === 'windup'` |
| throw cue | `state.projectiles[*]` with `launchTick + warnTicks > tick` (path known) |
| recovery (the punish window) | `Player.rootedUntil > tick` after an attack; phase `recovery` |
| stagger | `Player.dazedUntil > tick` |
| slow | `Player.slow` (`until`, `extraStepTicks`) |
| territorial state | `state.territory.minds[id].state` (`patrol` / `watch` / `investigate` / `alert` / `pursue` / `return`), `.target`, `.lastSeen`, `.watchUntil`; `enemyMindView(state, id)` for one readable state |
| blast-only enemy | `enemyHealthView(state, id).blastOnly`, `.punchFloor` |
| variant | `Player.enemyVariant` (`ENEMY_VARIANTS`) |

Events (all existing ones stay; ONE new event, emitted only when `campaignTactics` is present):

| event | when | fields |
| --- | --- | --- |
| `attackStarted` | a punch begins (enemy: its real `resolveTick`) | `playerId`, `skill`, `targetId`, `resolveTick` |
| `enemyCue` `windup` | a punch: the threatened tile (x, y) and `dir`; a throw: the thrower's tile and `dir` | `fromTick`, `untilTick` (= resolve / launch + cue) |
| `projectileLaunched` | a throw's cue (path, `warnTicks`) | as in docs/CAMPAIGN_ATTACKS.md |
| `attackResolved` | the swing resolves: `hit: true` or a visible miss (`hit: false`) | `playerId`, `targetId` |
| `enemyCue` `recovery` | planted from `fromTick` to `untilTick` (after a punch, hit or miss; after a throw's cue) | x, y = the enemy |
| `attackInterrupted`, `enemyCue` `stagger` | the human's hit cut the wind-up / staggered it until `untilTick` | `byId` = the human |
| `enemyCue` `alert` | it spotted the human at (x, y), or an ally's call (`byId` = the caller) | `untilTick` = end of the alert beat |
| `enemyCue` `investigate` | it goes to look at the coarse spot (x, y) | |
| `enemyCue` `lost` | it gave up the chase; watches until `untilTick`, then walks back to (x, y) | |

The audio router handles `enemyCue` as a no-op (the wind-up and hit sounds stay `attackStarted` / `campaignHit`).
Since SV7 the router gives `alert` and `investigate` their own synthesised cues ("Awareness markers and armour cue"); the other kinds stay silent.

## 9. Measurements

`npm run sector-ai -- --seeds 16` (`scripts/sector-ai.ts`, harness `scripts/lib/sectorDrill.ts`): a scripted human with
ordinary intents against the real enemy bots on the Academy pillar board with the field missions' radial blast;
`tests/campaign-tactics-drill.test.ts` asserts the same with 12 seeds. Trapped = defeated by the blast; seen = escaped.

| level | variant | ambush | bait | counter | seen (escaped) |
| --- | --- | --- | --- | --- | --- |
| easy | agbero / area boy / market enforcer / route marshal | 15/16 | 16/16 | 7/16 | 16/16 |
| easy | Ring security | 15/16 | 16/16 | 0/16 | 16/16 |
| normal | agbero / area boy / route marshal | 15/16 | 16/16 | 0/16 | 16/16 |
| normal | market enforcer | 15/16 | 15/16 | 0/16 | 16/16 |
| normal | Ring security | 16/16 | 0/16 | 0/16 | 16/16 |
| hard | agbero / market enforcer / route marshal | 16/16 | 0/16 | 5/16 | 16/16 |
| hard | area boy | 16/16 | 16/16 | 5/16 | 16/16 |
| hard | Ring security | 15/16 | 0/16 | 5/16 | 16/16 |
| any | heavy (armoured: one blast leaves it on 1) | 0 defeated | 16/16 Normal (punch to the floor + blast), 0 Hard | n/a (steadfast) | 16/16 |

- **ambush**: an unaware patroller cannot see round a corner; the generator laid just round the turn of its route,
  timed from its arrival at the far end, catches it at every level. **bait** (swing at the air, lay under your feet in
  its recovery, one punch, leave late) works on Easy and Normal against basic enemies; placement-watchers (Ring security
  on Normal, every brawler but the reckless area boy on Hard) see it laid. **counter** (jab the wind-up, lay during the
  stagger) is the answer to watchers but holds the generator long; it is a weaker strategy, measured honestly.
- **seen**: a badly placed generator in plain view is escaped by every enemy at every level.
- Totals of the three trap strategies over agbero, market enforcer and Ring security (12 seeds, the test): Easy clearly
  above Hard (asserted margin 24 runs).
- Cost: one sight check per generator and at most one body scan per decision, plus one per watched placement
  (`trapSightStats`, asserted); the territory does one person sight check per enemy per tick.

## 10. Limits and handover

- The drill board is the Academy pillar grid; the real field maps are irregular. The sector worker should re-run
  `npm run sector-ai` style drills on the re-authored sectors and tune `territory` data, not the rules.
- Boss missions get perception only; their crews keep their mission roles (no territories), the boss stays a generator
  bot with no health. Boss-fight balance with perception was not measured beyond the existing mission tests.
- The pilot's responsiveness features (press buffer, swing at the air, diagonal reach) went with it; the human's
  punches use the catalogue timing with the capped recovery. A founder feel-test should decide whether to fold the
  press buffer back in.
- No browser check was run on this branch (owned by another worker); `e2e/oshodi-combat-pilot.spec.ts` was removed with
  the pilot.

# Campaign sectors and enemy AI

Branch family `claude/wahala-csa-*` (base `46f0781` + contract `6359813`). Each worker of this pass keeps its own section under its own heading; the lead merges them.

## District-sector architecture

Branch `claude/wahala-csa-sectors`. Decisions DS1-DS10 (`docs/DECISIONS.md`). Not merged, not deployed.

### Why

A field mission used to be played on its district's whole City Rumble map (41 x 31 to 75 x 39 tiles) although its route sat in a corner: a lot of map to wander, a follow camera free to show the whole city, and a scene the size of the district built for a route that uses a tenth of it. A field mission now plays in a **sector**: a recognisable part of the district, closed by real street objects, with the camera, the minimap and the renderer kept to it.

### How it is built (option c: keep the district, stamp a sector)

The district keeps its full layout (City Rumble, the boss missions and multiplayer use it unchanged). The sector is data plus a one-time stamp in the simulation:

| Piece | File | What |
| --- | --- | --- |
| Data | `src/sim/mission/sectors.ts` | `MissionSectorDef { id, districtId, name, area, rects: [x0, y0, x1, y1][] (inclusive; two make an L), barricades: { id, kind: 'bus' \| 'barrier' \| 'gate' \| 'rail' \| 'checkpoint', tiles }[], gates?: { ...barricade, opensAfterLeg }[], viewMargin, hazards: 'inside' \| 'none' }`, one per field mission (`FieldMissionDef.sectorId`) |
| Stamp | `src/sim/mission/sector.ts` `applySector` | called by `createGame` right after `placeSupplies` and before the floor hazards, the endgame traps and `createStage`: every barricade / closed gate tile becomes `Tile.Hard`, its hidden pickup and supply entry are dropped, and `GameState.sector = { id, rects, blocked, gates, clip, viewMargin, hazards }` is set. It draws no random number (tested: the RNG state after creation is the unstamped one) |
| Lookup | `missionSectorOf(spec)` | a field mission's `sectorId`, unless `MissionSpec.noSector` (the `?nosector` debug flag). Boss missions get none in this pass; a `MissionDef.sectorId` read here is all a boss sector needs later |
| Questions | `inSector(state, x, y)` | `true` without a sector, so every other match pays one property read |

**No sector, no change.** Without a sector the `sector` key does not exist: City Rumble, Classic, raids, the boss missions and multiplayer states (and their digests, `tests/enemy-fairness.test.ts`) are byte-identical; `observe()` adds `sector` only when there is one.

### What the core systems do inside a sector

| System | Rule | Where |
| --- | --- | --- |
| Stage hazards | policy `inside`: a scheduled hazard stays on only when every tile of every route (sweep) or zone (strike, push) lies inside the rects; a strike on a player and a drop always fit; `none` turns them all off. A route half inside would stop at a barricade, so it is off rather than trimmed. The arenas' own rules (Oshodi's rail lanes, warnings, fairness) are untouched: in these eleven sectors every sweep is off | `state.ts` `hazardFitsSector` |
| Drops | fallen goods land on in-sector tiles only | `systems/stage.ts` |
| Manholes | a trapdoor whose far end lies outside carries nobody (refused when armed and when resolved; the shared `manholePartners` cache is untouched) | `systems/stage.ts` |
| Respawns | `chooseSpawn` only uses in-sector tiles (the field runtime then puts the human on the checkpoint anyway) | `systems/respawn.ts` |
| Vehicles | a border entry is legal only when its tile lies inside the sector (a lane mouth outside would drive along closed streets into a barricade). Data, not an arena-id branch; none of the eleven sectors contains a lane mouth, so a voucher cannot call a vehicle inside them (field missions rarely give one) | `systems/entries.ts` `inSectorOnly` |
| Seats | posts snap to free floor inside the sector, never onto a barricade | `fieldState.ts` |
| The route | a sector is small, so the route never depends on blasting crates: between consecutive stops (start, markers, door, exit, return) the path with the fewest crates is cleared (decision DS6). Crates elsewhere stay for cover and traps | `fieldState.ts` `clearRoute` |
| Gates | a gate barricade opens (concrete to floor, `sectorGateOpened` event, the drawn object hides) when the leg it waits for is completed. Mechanism and tests only: no sector uses one yet | `sector.ts` `openSectorGates` |

### The eleven sectors

Sizes are walkable layout tiles inside the rects (and their share of the district). Every authored tile (start, markers, exits, doors, door return tiles, posts, the combat pilot's extra posts) lies inside; no marker, post, exit or door was moved, and no enemy entry was edited.

| Mission | Sector | Rects | Size | Boundary objects | Portion of the district |
| --- | --- | --- | --- | --- | --- |
| `oshodi.approach` | `oshodi.terminalApproach` | [2, 37, 35, 44] | 188 (10 %) | 4 barrier, 1 checkpoint, 2 bus, 1 gate (18 tiles) | The two southern stall streets from the Orita gate to the dispatch depot entrance: the terminal alleys north closed by bollards, a danfo rank and a Ring checkpoint; the depot gate and a parked bus east |
| `oshodi.railEdge` | `oshodi.railEdge` | [31, 26, 60, 34] + [37, 35, 60, 44] | 368 (19 %) | 2 rail, 2 barrier, 3 bus, 2 gate (31 tiles) | The interchange plaza at the end of the rail line, the east market lanes and the footbridge stairs: the rail buffer fence north, a bus and a yard fence west, the depot wall south-west |
| `mushin.approach` | `mushin.sparePartsRow` | [2, 28, 50, 36] | 349 (30 %) | 5 barrier, 5 bus, 1 checkpoint (24 tiles) | The southern stall rows, the back aisle and the loading bay to the parts storeroom; the lanes north to the motor road closed by parked danfos, barriers and a Ring checkpoint |
| `mushin.market` | `mushin.northAisles` | [2, 2, 50, 13] | 369 (31 %) | 2 gate, 2 barrier, 1 checkpoint (10 tiles) | The northern market blocks from the market gate to the top street; the five alley mouths onto the motor road closed |
| `fadeyiSomolu.approach` | `fadeyiSomolu.tollRoad` | [2, 21, 41, 30] | 309 (28 %) | 5 barrier, 3 bus, 1 checkpoint, 1 gate (48 tiles) | The southern block: the toll approach road, the tool shed and the plaza; the expressway kerb lined with barriers, parked buses and the Ring toll post |
| `fadeyiSomolu.junctions` | `fadeyiSomolu.northJunctions` | [2, 2, 41, 11] | 302 (27 %) | 5 barrier, 3 bus, 1 checkpoint, 1 gate (45 tiles) | The northern block of junction streets and the route office up to the slip road; the expressway kerb lined, the side road railed off |
| `ebuteMetta.approach` | `ebuteMetta.yardApproach` | [15, 26, 57, 36] | 375 (21 %) | 7 barrier, 1 checkpoint, 2 bus, 1 rail, 3 gate (40 tiles) | The southern yard streets from the yard gate past the sidings to the signal box and shed; the rail line ends at a buffer stop, the yard fence closes the east |
| `lagosIsland.approach` | `lagosIsland.ledgerRow` | [2, 18, 23, 30] | 224 (17 %) | 10 barrier, 1 gate, 1 checkpoint, 3 bus (42 tiles) | The south-west office block: the ledger counters and the records annexe; the marina road and the side street lined, bollards in the alleys north |
| `lagosIsland.press` | `lagosIsland.pressGrid` | [2, 2, 23, 15] + [22, 16, 23, 21] | 198 (15 %) | 8 barrier, 2 bus, 1 checkpoint, 2 gate (29 tiles) | The north-west grid of ledger offices and the press lane down the side street |
| `lekki.approach` | `lekki.gateApproach` | [2, 21, 33, 29] | 225 (16 %) | 2 gate, 2 checkpoint, 8 barrier, 3 bus (42 tiles) | The south-west estate block (garden, pool edge, standby plant) with the closed stretch of the estate road: Ring gatehouses close the road at both ends |
| `lekki.estate` | `lekki.northEstate` | [2, 2, 36, 9] + [24, 6, 54, 14] | 402 (29 %) | 7 barrier, 2 gate, 1 checkpoint, 1 bus (27 tiles) | The north drive, the central lawn and the east lawn down to the service road; a Ring gatehouse across the estate road |

The two missions of a district never share more than 15 % of their tiles (tested). `scripts/sector-ascii.ts <fieldId> ['[[x0,y0,x1,y1],...]']` prints a mission's board with its sector, its authored tiles and every leak of a trial rect set, grouped into runs (one barricade each): the authoring tool these were made with.

### Boundary presentation

`src/render/views/SectorBarricades.ts` builds the barricades as a `BoardCover` from the community cover kit (shared materials, the sign atlas, merged meshes per chunk) and the cast's danfo model (a procedural bus without it), merged with the arena's own cover by `mergeCovers` (`arenas/boardCover.ts`): the arena view draws no pillar on a barricade tile, `coveredAt` / `reach` / the view-clear bounds see each barricade as one fading object, and the occlusion fade works on them exactly as on buildings.

| Kind | Object |
| --- | --- |
| `bus` | a parked danfo every two tiles along the run (alternate directions, a route card towards the play area), a jersey block and a bollard on an odd tile |
| `barrier` | concrete jersey barriers with red / white reflective stripes and a steel crowd rail on top (it reads as closed, not as a step), yellow-black bollards at both ends, a ROAD CLOSED board on a long run, a cone |
| `gate` | a corrugated steel gate wall: posts, painted sheet panels with rust at the foot, rails, a padlocked chain, a NO ENTRY board |
| `rail` | a rail-yard buffer: heavy posts, a red-and-white buffer beam with a red lamp, a mesh fence behind, a DANGER - RAIL LINE board |
| `checkpoint` | a Ring checkpoint: a kiosk (window band, overhanging roof, red beacon, a RING CHECKPOINT / STOP - SHOW PASS board) and a red-and-white boom over orange / white water-filled barriers |

No soft `x` barrier (a blast would open the sector), no invisible wall. Names are fictional. Screenshots: `docs/screenshots/campaign-sector-ai/` (phone 740 x 360 at device scale 2, and desktop close-ups), taken with `scripts/sector-shots.mjs` (`:inspect` gives an unclamped close-up of a tile).

### Camera and minimap

- **Follow camera** (`render/cameraDirector.ts` `sectorBounds`, `render/cameraRig.ts` `inBounds`): with a sector the follow shot carries `bounds` (the rects' bounding box in world units and the sector's `viewMargin`). The rig keeps the HUD-free band within the box plus a margin of `max(viewMargin, its own HUD margin)` on the sides and the south (so a player at the box's edge is never pushed under the on-screen controls: the bug the City Rumble `free` shot avoids) and `viewMargin` to the north; along an axis where the box is narrower than the view the view is centred on it. City Rumble without a sector keeps its free follow shot (`tests/rumble-camera.test.ts` unchanged).
- **Overview / establishing shot**: framed on the sector (`fitRect`, the same fit as the whole arena, cached per screen layout), not the whole city.
- **Minimap** (`ui/minimapModel.ts` `minimapCrop`, `ui/Minimap.tsx`): crops to the sector's clip (bigger cells in the same box), dims the streets beyond the barricades, draws barricades orange and never as the closing city.

### Render cost

`render/sectorClip.ts` `renderClip`: the sector clip grown by 6 rows north (the three-quarter camera sees furthest above the band), 3 columns each side and 2 rows south. Outside it nothing is built: the arena's cover objects (`CoverFactory` takes an optional `clip`; the community factory and the Oshodi cover skip objects with no tile inside it; without a clip their output is unchanged), the arena view's per-tile pillars and crates, and the living environment's traffic routes, crowd zones and lights (`clipEnvironment`). Field equipment (below) has its own small view and is never drawn as a crate. Everything built is disposed by the existing view / cover dispose paths (the barricade covers own their materials, geometries and sign atlas).

Measurement: `scripts/sector-perf.mjs` loads every field mission through the debug handle `__WAHALA__.startFieldMission(id, { noSector })` with and without its sector, on the low and high presets, and reports the scene build time (`stats().loadMs`, `renderer.loadGame` timed), draw calls and triangles after the camera settled, live geometries / textures, and frame time mean / p95 over 4 s of play; `--leak` loads three missions in one page. Results below. **Software rendering (SwiftShader on 4 shared cores): the numbers compare the two variants on the same machine; they are not phone timings and no claim about real phones is made.**

| Mission | Quality | Build ms sector / whole | Draw calls | Triangles | Geometries | Textures | Frame mean ms | Frame p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `oshodi.approach` | low | 3199 / 2317.7 | 219 / 205 | 876210 / 1282342 (-32 %) | 246 / 295 | 181 / 188 | 796.9 / 498.5 | 1799.9 / 1100 |
| `oshodi.railEdge` | low | 1508.8 / 1838 | 217 / 210 | 583606 / 905937 (-36 %) | 286 / 292 | 180 / 178 | 371 / 641.4 | 783.2 / 1400 |
| `mushin.approach` | low | 1903 / 2378.2 | 200 / 185 | 633121 / 738677 (-14 %) | 309 / 290 | 191 / 182 | 662.9 / 682 | 1516.7 / 1550 |
| `mushin.market` | low | 2538.1 / 2439.9 | 165 / 162 | 550776 / 726299 (-24 %) | 249 / 289 | 173 / 182 | 575.8 / 637.5 | 1299.9 / 1499.9 |
| `fadeyiSomolu.approach` | low | 2678.5 / 2207.6 | 188 / 185 | 476217 / 578349 (-18 %) | 278 / 261 | 185 / 184 | 642.5 / 534.6 | 1616.7 / 1366.6 |
| `fadeyiSomolu.junctions` | low | 2082.4 / 2262.7 | 198 / 191 | 505820 / 566616 (-11 %) | 253 / 264 | 173 / 183 | 533.9 / 673.1 | 1116.6 / 1766.6 |
| `ebuteMetta.approach` | low | 2089.5 / 2438.3 | 192 / 199 | 690086 / 942082 (-27 %) | 249 / 266 | 157 / 157 | 590.2 / 681.7 | 1383.3 / 1483.2 |
| `lagosIsland.approach` | low | 2655.3 / 2000.1 | 251 / 239 | 670833 / 813396 (-18 %) | 269 / 292 | 173 / 176 | 583.8 / 669 | 1316.7 / 1616.6 |
| `lagosIsland.press` | low | 2695.2 / 2478.8 | 226 / 211 | 661177 / 716954 (-8 %) | 281 / 295 | 175 / 176 | 618.3 / 405.8 | 1466.6 / 916.7 |
| `lekki.approach` | low | 1805.2 / 1605.8 | 273 / 244 | 513524 / 655016 (-22 %) | 281 / 279 | 178 / 177 | 305.9 / 314.1 | 666.6 / 700 |
| `lekki.estate` | low | 1554.4 / 1325.4 | 184 / 177 | 451682 / 505752 (-11 %) | 274 / 276 | 178 / 178 | 341.8 / 347.8 | 750 / 800 |
| `oshodi.approach` | high | 1763.4 / 2036.5 | 505 / 506 | 2204586 / 3045230 (-28 %) | 286 / 332 | 237 / 290 | 1235.2 / 943.6 | 3249.8 / 1649.9 |
| `oshodi.railEdge` | high | 1566.7 / 2177.1 | 516 / 515 | 1584131 / 2695772 (-41 %) | 323 / 329 | 241 / 280 | 886.9 / 1146.6 | 1966.6 / 2799.9 |
| `mushin.approach` | high | 1935.6 / 1901.6 | 563 / 519 | 2080995 / 2221560 (-6 %) | 346 / 346 | 265 / 294 | 794.1 / 798.6 | 2433.1 / 2250 |
| `mushin.market` | high | 1666 / 1924.7 | 539 / 532 | 1939613 / 2262680 (-14 %) | 321 / 345 | 284 / 294 | 892.5 / 846.6 | 2133.2 / 1416.6 |
| `fadeyiSomolu.approach` | high | 2043.4 / 1611.6 | 503 / 481 | 2019281 / 2403763 (-16 %) | 287 / 270 | 250 / 274 | 744.1 / 795.2 | 2100 / 2266.6 |
| `fadeyiSomolu.junctions` | high | 1753.4 / 1479.8 | 457 / 470 | 1854416 / 2310576 (-20 %) | 264 / 273 | 253 / 273 | 802.8 / 1066.8 | 1933.3 / 2783.1 |
| `ebuteMetta.approach` | high | 2027.2 / 1878.3 | 509 / 512 | 1977958 / 2481499 (-20 %) | 302 / 317 | 230 / 273 | 1023.3 / 943.3 | 2733.3 / 2183.3 |
| `lagosIsland.approach` | high | 2399.9 / 1793.9 | 575 / 578 | 2046014 / 2540731 (-19 %) | 292 / 323 | 247 / 260 | 1119.7 / 972.8 | 1599.9 / 1966.6 |
| `lagosIsland.press` | high | 1924.9 / 1605.8 | 569 / 566 | 2126469 / 2499941 (-15 %) | 297 / 326 | 254 / 260 | 671.8 / 1509.7 | 1899.9 / 2349.9 |
| `lekki.approach` | high | 2673.5 / 2687.9 | 632 / 605 | 2009870 / 2303314 (-13 %) | 312 / 310 | 243 / 252 | 1356.6 / 1490.5 | 3516.6 / 2049.9 |
| `lekki.estate` | high | 2762.3 / 1986.4 | 514 / 490 | 1757226 / 1885060 (-7 %) | 299 / 299 | 243 / 253 | 1020.1 / 800.1 | 1500 / 2333.2 |

Mean triangle change on low: -20 % (range -36 to -8 %).

Mean triangle change on high: -18 % (range -41 to -6 %).

Reading it: the sector cuts the **triangles** drawn in play (the cover, crates and ambient traffic beyond the clip are gone; the biggest cuts are where the whole district showed busy terminal or yard scenery around the sector) and the live **geometries** in most missions; **draw calls** stay about the same (the follow camera sees the same amount of street; the barricades add a few merged meshes, one per material); **frame times** on software WebGL (300-1500 ms a frame, 4-14 frames a sample) are too noisy to rank either variant, and **build times** vary from run to run by more than the difference (the same mission measured twice differed by up to 1.3 s). Raw rows: `docs/measurements/campaign-sector-perf.md`.

**Leak check** (`--leak`, the same mission loaded three times in one page, low): before this branch every match start left about 118 geometries and 48 textures on the GPU (whole district: 295 -> 413 -> 531 geometries; the sector: 243 -> 335 -> 427). The set's backdrop never released what it built into its tree (baked statics, set pieces, per-match canvas boards); `assets/backdrop.ts` now disposes them on unload: geometries 243 -> 247 -> 251 (sector) and 295 -> 305 -> 315 (whole district). **Still open (pre-existing, not from the sectors):** about 48 textures per start, all library model textures (`ImageBitmap` map / normal / ao of the set's and the arena's GLB props) that each match takes a fresh copy of; to be traced in the asset library. The barricade covers and the equipment view release everything they own (`tests/render/sector-render.test.ts` builds and disposes them).

### Generator-sensitive objectives (shared leg kinds)

Two new field leg kinds for all districts and the finale (`FieldLegDef`, `src/sim/mission/field.ts`). **Not assigned to any existing mission** (the district worker does that); scenario tests run them on a test-only mission.

| Leg | Rule | View fields | Events |
| --- | --- | --- | --- |
| `destroyTargets { targets: { id, kind: 'relayBox' \| 'tollBox' \| 'switchCabinet' \| 'partsCage' \| 'controlPoint', x, y, label, hp? }[], crew? }` | each piece of Ring equipment stands from the start as a solid soft tile (blocks walking, stops a flame arm, hides nothing). Only a blast set off by the human takes a hit point, one per separate blast (`mission/equipment.ts`, hooked into `destroySoftBlocks` like raid cargo); melee never damages tiles, and a vehicle, the closing city or an enemy's blast leave it standing; stage hazards never touch soft tiles. A piece wrecked before its leg counts when the leg comes. The `crew` group guards the nearest standing piece during the leg | `fieldGoal.verb: 'destroy'`, `fieldGoal.targets { left, total }`, nodes of kind `target` (`tg:<id>`, progress by hit points), `progress` "equipment wrecked" | `fieldTargetHit { targetId, label, x, y, hpAfter, maxHp, left, byId }` (cargo cues in the audio router; `hpAfter` 0 = wrecked) |
| `holdArea { area: { x, y, radius, label }, holdSec, waves?: { group, atSec }[] }` | time accrues while the human is inside the square zone and no living enemy is (contested = frozen, outside = frozen, never lost). A wave group holds its post until `atSec` after the leg starts, then moves into the zone and fights for it | `fieldGoal.verb: 'secure'`, `fieldGoal.area { ticks, goalTicks, fraction, inside, contested, x, y, radius }`, a zone node of kind `area`, `progress` "seconds held" | the existing `missionNode` progress events |

HUD words (`app/fieldGoal.ts`): DESTROY / SECURE tags, "RELAY BOX (2 LEFT)", "JUNCTION 2.4 / 20.0 s", notes BLASTS ONLY / STAY INSIDE THE AREA / CLEAR THEM OUT OF THE AREA. The equipment is drawn by `render/views/FieldEquipmentViews.ts` (a steel cabinet per kind with a hazard stripe and a blinking red warning light, a scorched stump and debris when wrecked). Leg texts must follow `tests/field-checkpoint-clarity.test.ts`: "Destroy the N ..." and "Keep the ... for N seconds" (the word "hold" stays the door's).

### For the district worker

- Give a mission a new leg by data only (`fieldDefs.ts`); put its equipment and zone inside the sector on open floor; the route clearing and the tests pick them up (`fieldRouteStops`, `fieldTargetTiles`).
- A gate that opens between legs: add it to the sector's `gates` with `opensAfterLeg` (its tiles must be open layout floor at the rect edge); the leak test counts it as closed.
- Moving a marker or a post: keep it inside the rects; `npx tsx scripts/sector-ascii.ts <fieldId>` shows the board.

### Tests

`tests/mission-sectors.test.ts` (data: sizes, every authored tile inside, barricades on open edge tiles, no leaks; per mission and two seeds: a flood from the start never leaves the rects and reaches every target; the route needs no blasting; no sector, no key; the stamp draws no random number; determinism; hazards / drops / manholes / respawns / vehicle entries; gates), `tests/field-sector-legs.test.ts` (both leg kinds), `tests/render/camera-sector.test.ts` (bounds on desktop and a 740 x 360 phone from every corner, the overview, no change without a sector, the minimap crop), `tests/render/sector-render.test.ts` (barricade objects, merged covers, gate hide, cover / environment clipping), `tests/field-nodes.test.ts` (its walks now go round barricades), `e2e/campaign-sectors.spec.ts` (phone landscape: the sector loads, its barricades are built, the camera stays on it from every corner).

# Part 3. Bosses (decisions BX1-BX8)

Branch `claude/wahala-csa-bosses` (from `4f2d2a9`). Founder direction (2026-11-18): keep the six boss mechanics and
technical identities (Oga Sunmola, Madam Ronke, Marshal Gbenga Kobo, Ikenna Wayside, Barrister Tolani Quill, Bamidele
Halcyon; the code labels are unchanged), make generators essential and the vulnerability readable, no boss carried by
repeated melee. Everything is pure simulation data and rules (`src/sim/mission/`), read by the HUD rail and the
renderer; the ids, rewards, unlocks, consequence flags and replay modifiers are unchanged (Toll Season reworded, BX5).

## 1. The loop (every boss)

1. **Break the district's equipment with blasts.** The phase's objective (the district verb, section 2) is broken only
   by the human's generator blasts; standing on a node or punching does nothing to it. One blast counts once.
2. **The boss is EXPOSED** (`bossExposed`, HUD "BOSS EXPOSED 0:20", gold restore ring on the anchor). His shield is
   down; he walks to his ANCHOR (his post, or the node broken last) to restore it. The countdown waits while he walks
   (at most 12 s), then runs for the level's window.
3. **At his anchor he is committed**: within one tile of it he is rooted until the window ends ("RESTORING: BLAST
   NOW"), so a generator laid beside him lands. He still punches (normal wind-up, drawn by the telegraph view) and his
   escorts come for you; on Normal / Hard he calls fallen crew back (telegraphed on their posts).
4. **A blast that reaches him costs one hit** (`bossHit`; any lethal event: a blast, a vehicle, a train). He reels for
   1.5 s, re-shields and the next phase starts. Three hits in all; the third eliminates him (`bossDefeated`).
5. **A punch only interrupts**: a landed punch on the exposed boss adds 1.5 s to the window (twice per window at most,
   `bossInterrupted`). It never takes a hit.
6. **A missed window** re-shields him and rebuilds the SAME phase (its nodes reset). Five windows in all (three hits and
   two misses); then he gets away and the mission is lost. The clock and the lives end a mission as before.

## 2. The six bosses

| boss (code label) | objective broken by blasts | district twist kept | anchor | crew variants (role) |
| --- | --- | --- | --- | --- |
| Oga Sunmola (`oshodi`) | relays: one blast jams a relay | live relays call convoy lanes; jams wear off (25 / 20 / 40 s); runners re-arm a jammed relay in 4 s from phase 2 | his post (dispatch stage) | agbero guard, bottle-thrower spotter, heavy blocker, area-boy runners, Ring-security escort |
| Madam Ronke (`mushin`) | parts stacks: 1 / 2 / 2 separate blasts | runners restock a destroyed stack; goods-fall strikes near live stacks | the stack broken last (she comes to restock it) | area-boy runners, market-enforcer stall guard, heavy blocker |
| Marshal Gbenga Kobo (`fadeyiSomolu`) | toll boxes: a blast while NO marshal stands in the 3 x 3 zone (a marshal inside shields it) | broken boxes open routes and stop their marshal strikes; phase 3 boxes are rebuilt after 35 s | his post (painted box) | route marshals at the junctions, route-marshal toll guard, heavy blocker |
| Ikenna Wayside (`ebuteMetta`) | dispatch switches: a blast only inside the open rail window (lay it ~3 s early) | telegraphed railcar windows; phase 3 switches reset after 40 s | his post (signal cabin) | Ring-security signal guards, area-boy runner, heavy blocker, agbero yard hand |
| Barrister Tolani Quill (`lagosIsland`) | ledger cabinets: a blast opens one; step on it to take the ledger, carry it to the press | auditors chase the carrier; a daze or fall drops it (back to its open cabinet); audit strikes; 45 s carry limit in phase 3 | her post (office) | market-enforcer auditors, Ring-security records guard, heavy assistant, bottle-thrower clerk |
| Bamidele Halcyon (`lekki`) | private systems: blasted in the signalled order; a blast on a wrong one calls a contingency strike and resets | lettered order, decoys, contingency strikes between switches | the panel broken last (he comes to reset it) | Ring-security contractors, gate guard and escort, bottle-thrower marksman, heavy aide |

The boss himself is the expert `boss` variant (watches placements in sight, sharp reaction, no omniscience).

## 3. Numbers per level

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| window (restore time at the anchor) | 26 s | 20 s | 15 s |
| walk grace (countdown waits while he walks) | 12 s | 12 s | 12 s |
| crew called back when a window opens | 0 | 1 | 2 |
| escorts body-block the line to the human | no | no | yes |
| punch interrupt | +1.5 s, twice | +1.5 s, twice | +1.5 s, twice |
| hits / windows allowed | 3 / 5 | 3 / 5 | 3 / 5 |
| human health, recovery, enemy perception | the campaign level (CL1-CL7, SA9) | | |

The window is the fairness lever: a generator laid 14 s into the window lands on Easy and Normal, not on Hard
(tested). Travel to the anchor plus a 3 s fuse always fits the Hard window, because the countdown waits for the boss.

## 4. Measurements (`npm run boss-audit`)

A scripted player with ordinary intents (`scripts/lib/bossFight.ts`) plays whole boss missions against the real boss
and crew bots, crates and stage hazards on, the campaign's three lives. **generator**: breaks every node the way the
district asks, blasts crew in its way, jabs an adjacent crew member, waits beside the boss's anchor and lays a
generator when he is restoring; it never punches the boss. **punch**: never lays a generator, stands on nodes, punches
every adjacent rival. The "before" column replays the old verbs (`--legacy`: stand to jam / hold / throw / collect /
switch, chase the exposed boss) on the commit before this branch with the same player.

| boss | level | before: generator wins (2 seeds) | after: generator wins (3 seeds) | after: median clear | after: lives lost (all runs) |
| --- | --- | --- | --- | --- | --- |
| Oga Sunmola | Easy / Normal / Hard | 0/2, 0/2, 0/2 (stuck in phase 1-2) | 3/3, 3/3, 3/3 | 157 / 178 / 154 s | 0 / 1 / 1 |
| Madam Ronke | Easy / Normal / Hard | 0/2, 0/2, 1/2 | 2/3, 3/3, 3/3 | 317 / 354 / 239 s | 1 / 3 / 2 |
| Marshal Gbenga Kobo | Easy / Normal / Hard | 0/2, 0/2, 0/2 | 3/3, 3/3, 3/3 | 113 / 134 / 109 s | 0 / 0 / 0 |
| Ikenna Wayside | Easy / Normal / Hard | 0/2, 0/2, 0/2 | 3/3, 2/3, 3/3 | 224 / 440 / 209 s | 0 / 2 / 3 |
| Barrister Tolani Quill | Easy / Normal / Hard | 0/2, 0/2, 0/2 | 3/3, 3/3, 3/3 | 232 / 233 / 279 s | 0 / 1 / 2 |
| Bamidele Halcyon | Easy / Normal / Hard | 1/2, 1/2, 1/2 | 3/3, 3/3, 3/3 | 155 / 157 / 170 s | 0 / 0 / 1 |
| **all six** | Easy / Normal / Hard | 1/12, 1/12, 2/12 | 17/18, 17/18, 18/18 | | 1 / 7 / 9 |

| pure punch player (Normal) | before (2 seeds each) | after (2 seeds each) |
| --- | --- | --- |
| phases broken | Oshodi 1, Fadeyi 1, Ebute 0-2, Lagos 2, Lekki 3 (every phase, by standing) | 0 everywhere |
| boss exposures reached | Lekki 3 per fight, Lagos 1.5 | 0 |
| boss hits / wins | 0 / 0 | 0 / 0 |

Reading it: before, the stand-on verbs made the objectives a crowd-control test (a scripted player standing on a relay
is punched off it by the crew) and the exposed boss fled, so neither a generator plan nor melee could finish him. After,
every phase is a short blast job and every exposure a readable ambush at a known spot: the generator plan wins nearly
every fight at every level, pure punching does nothing. Easy and Hard differ mostly in risk (1 against 9 lives lost
over 18 fights), not in clear time: the scripted player always reaches the anchor inside even the Hard window. The
before column's 4 wins over 36 fights (Easy / Normal / Hard, 2 seeds) are Lekki 3 and Mushin 1.

## 5. The boss recipe API (for a new boss, no engine code)

A boss mission is a `MissionDef` (`src/sim/mission/defs.ts`) with an `objective` verb, three `phases` of nodes, a `boss`
post, a `crew` and a `recipe`. The recipe (`BossRecipe`, `src/sim/mission/boss.ts`) is plain data:

```ts
recipe: bossRecipe({                       // DEFAULT_BOSS_RECIPE plus the boss's own overrides
  hits: 3,                                 // blast hits that defeat him: one per exposure window (one per phase)
  exposeSec: { easy: 26, normal: 20, hard: 15 }, // the restore time at the anchor, per campaign level
  maxExposures: 5,                         // windows in all (hits + windows he may survive), then he gets away
  anchor: 'post',                          // 'post' | 'lastBroken': where he restores his shield
  walkGraceSec: 12,                        // the countdown waits while he walks to the anchor, at most this long
  restoreRadius: 1,                        // within this many tiles of the anchor he is committed (rooted)
  interruptSec: 1.5, interruptMax: 2,      // what a landed punch adds to the window, how often per window
  reelSec: 1.5,                            // the daze after a hit, while the shield closes
  callRoles: ['escort', 'meleeGuard'],     // fallen crew of these roles come back when a window opens ...
  callCount: { easy: 0, normal: 1, hard: 2 }, // ... at most this many per window
  escortCover: { easy: false, normal: false, hard: true }, // escorts body-block the line to the human
}),
crew: [{ role: 'escort', name: '...', post: [x, y], variant: 'ringSecurity' }, ...], // variant = perception personality
```

- **Objective -> exposure link**: any objective verb in `OBJECTIVES` works unchanged: when `done(ctx) >= goal` the runtime
  exposes the boss (`runtime.clearPhase`). A new verb is a new `Objective` (setup / update / done / nodeView /
  runnerTarget); break its nodes with `freshBlasts(ctx, node)` (`objectives/types.ts`) so only the human's blasts count.
- **Exposure window**: resolved per level into `MissionTuning.boss` (`BossTuning`, ticks) by `resolveTuning(def, spec,
  level)`; the level is read from `config.campaignTactics.level`.
- **Hits**: `rules.missionBossAbsorbs` (lethality) records one hit per window; `runtime.resolveBossHit` starts the next
  phase. `hits` above 3 repeat the last phase; fewer end the fight early (the last hit always eliminates).
- **Escort waves**: `callRoles` / `callCount` per window (telegraphed `reinforce` warnings on the seats' posts, outside the
  mission's `reinforceMax`, which still governs the runner / escort returns at a phase start).
- **Crew roles** (`NpcRole`, `directives.ts`): meleeGuard, rangedAttacker, blocker, runner, escort, objectiveDefender,
  supportUnit, bossAssistant; the boss's own directive is `guard` while shielded and `block` on the anchor while exposed.
- **Presentation for free**: `missionView(state).boss` carries `hitsLeft`, `maxHits`, `exposeTotalTicks`, `anchor`,
  `restoring`; events `bossExposed` (anchor, hits), `bossHit`, `bossInterrupted`, `bossShielded`, `bossDefeated`; the HUD
  rail shows BLASTS LEFT and the hint, the world draws the anchor ring and the boss's shield / countdown arc, and the
  enemy telegraph view draws the boss's and crew's punch wind-ups (`telegraphKindOf`).

A territorial enforcer (the Ojuelegba finale) can use `anchor: 'lastBroken'` to make him come to the equipment the
player broke, a longer `walkGraceSec` for a big map, `callRoles` for his waves, and crew `variant`s for readable roles.

## 6. Limits and handover

- The boss and crew are still generator bots without `Vitals` (the campaign's one-hit generator fight); the boss's
  three hits live in the mission state (`MissionBossState.hp`), not in the enemy health system. `enemyHealthView`
  does not apply to them; the HUD reads `missionView(state).boss`.
- The scripted player is a competent bot, not a human: it uses each window once and never baits the escorts. Clear
  times above are its times; a human should be faster on Easy and slower on Hard. Re-run `npm run boss-audit` after any
  boss tuning.
- The crews' variant LOOKS are not drawn (they are generator bots; the look system dresses `enemyKind` seats only):
  their roles read through the existing role pips; their behaviour reads through the variant perception.
- No browser screenshots were taken of the anchor ring; the Playwright specs that cover the mission panel and the
  briefing text were run (see the status entry).
