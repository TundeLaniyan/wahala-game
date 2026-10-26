# WAHALA! - City Rumble Evolution V1

Branch `claude/wahala-rumble-evolution-v1` (from `claude/wahala-stitch-uiux-v1` @ `408fb4d`). Founder brief of
2026-10-26: evolve City Rumble into a distinctive Lagos street-combat mode; Classic Battle keeps its established
gameplay. Decisions are section **RE** of `DECISIONS.md` (prefix per workstream: RE-A movement, RE-B blast, RE-C
economy, RE-D Ojuelegba, RE-E living environment, RE-AI bots, RE-L lead). This file is the lead's contract for the
parallel workstreams, then the delivery report.

The GitHub Pages preview is NOT published from this branch (`ci.yml` deploys only from `claude/wahala-stitch-uiux-v1`);
the CI optimisation work lives on its own branch and is not touched here.

The founder's three Lagos research reports and the prototype-decision briefing were not available in the build
session; the cultural and environment detail comes from the earlier stage research in `RUMBLE_STAGES_V2.md` and the
brief itself. No combat rule, engine, health model or Unreal system was adopted from research.

## 1. Shared simulation contracts (lead, Phase 0 - already in the code)

| Contract | Where | Notes |
| --- | --- | --- |
| Radial blast | `generator.blastMode = 'radial'`, `sim/systems/blastShape.ts` (`radialFootprint`, `radialOffsets`, `inDisc`, `lineBetween`, `radialRadius`, `radialSquareRadius`), exported from `src/sim` | THE one implementation: `explosions.ts` flames, `previewBlast` (renderer danger footprint) and the bots must all call it. Disc `dx^2+dy^2 <= R^2+R`, R = `min(range, maxRange)`; reached = outward wave (concrete never entered; crate / other generator hit but passes nothing) AND clear centre line (crosses only open floor without generators; exact corners go diagonal). Hot Fuel passes one crate. Square Blast in radial = the full square of radius `min(R + square - 1, radialMaxSquareRadius)` (RE-B4). Flames on the generator's row / column keep `dir` (+ `tip`); the others carry `radial: true`. `generatorExploded.radial` marks a radial blast. |
| Rumble rules | `RUMBLE_ECONOMY` in `config.ts`, merged by `modes.ts` for survival / deathmatch / team | `blastMode: 'radial'`, `maxRange: 5` (radius cap), `baseCapacity: 2`. Classic untouched (`plus`, 1 generator). |
| Authored cover | layout chars in `ArenaDef.layout`: `_` kept-clear floor (no random crate), `x` barrier (always a crate), `$` supply crate (always a crate, hides one of `config.supply.kinds`, match RNG) | `GameState.supplies` / `Observation.supplies` = tile indices of standing supply crates (public marking; content hidden). Destroyed once, never refilled. Non-mirrored arenas (`mirrorSoftBlocks: false`) now draw random crates over the whole board. |
| Attack lanes | `config.vehicles.lanes: [x, y, inwardDir][] \| null` (arena config) | When set, `allBorderEntries` (and so the vehicle UI, one-press auto vehicle and bots) only offer those border road mouths. |
| Districts | `ArenaDef.districts?: DistrictDef[]`, `districtLinks?: DistrictLink[]` (`sim/arenas/types.ts`) | Data only: named rectangles + connections (`open` / `chokepoint` / `breach`). Tests and the minimap / bots may read them; no rule may branch on a district id. |

Tests: `tests/radial-blast.test.ts`, `tests/rumble-evolution-contracts.test.ts`.

Rules for everyone: nobody redefines the blast, movement or collision interfaces above. Need a change? Ask the lead.
`src/sim` stays pure and deterministic; balance numbers live in `config.ts`; arenas are data; rules never test an
arena id; bots see only `observe()`.

## 2. Workstreams and file ownership

| Stream | Owns |
| --- | --- |
| A Assisted movement | `src/input/*` (new `moveAssist.ts`), `ui/TouchControls.tsx` + touch CSS, the movement-assist part of `app/MatchController.ts` (the `IntentContext` it builds), the `assistedMovement` setting (`app/settings.ts` field + Settings > Controls / Accessibility toggle in `ui/menu/SettingsScreen.tsx`), `tests/input-*.test.ts`, `e2e/mobile.spec.ts` |
| AI Bots | `src/ai/*`, `tests/ai/*`, `tests/rumble-ai.test.ts`, `tests/modes-bots.test.ts`, `tests/economy-ai.test.ts` (AI-side expectations), `scripts/simulate.ts` |
| C Economy + measurement | `sim/systems/{rewards,pickups,drops,attribution}.ts`, `config.ts` reward / supply / Rumble economy numbers (lead-reviewed), supply-crate visuals in `render/views/` (soft block marking), new `scripts/rumble-metrics.ts`, `tests/economy*.test.ts` (economy-side), `tests/rumble-economy-evolution.test.ts` |
| D Ojuelegba | `sim/arenas/rumbleOjuelegba.ts`, `render/arenas/rumbleOjuelegbaArt.ts` (+ new `render/arenas/ojuelegba*.ts` helpers), its `newArenas.ts` / `arenaLook.ts` entries, its preview `public/previews/rumbleOjuelegba.jpg`, `tests/rumble-ojuelegba.test.ts`, the Ojuelegba rows of `tests/rumble-stages.test.ts` |
| E Living environment | `render/life/*` (traffic, crowds, reactions), `render/fx/Ambient.ts`, new reusable `render/env/*` (the `StageEnvironment` presentation contract), the Danfo-departure hazard (`sim/systems/stage.ts` + `StageHazardStyle`), `tests/stage-hazards.test.ts`, `tests/render/*` for its modules |
| Lead | everything in section 1, `types.ts` / `config.ts` / `tick.ts` / `sim/index.ts` shape, merges, docs, cross-system regression, final verification |

Shared files (`types.ts`, `config.ts`, `sim/index.ts`, `settings.ts`, `GameRenderer.ts`): append small fields you
need, never reorder, and say so in your report.

## 3. Rules for every stream

- Read `CLAUDE.md` first. Work on your own branch in your worktree, based on this branch; commit meaningful steps.
- Run `npx tsc --noEmit`, `npx eslint <your files>` and the vitest files covering your area. The full suite takes
  ~3 min on the idle 4-core machine, which is shared by several streams: prefer targeted runs. Playwright only for
  your own spec (`WAHALA_CHROMIUM=/opt/pw-browsers/chromium`).
- Every bug fix / mechanic gets a scenario test. Never weaken an existing test; if a deliberate rule change moves an
  expectation, change it to the new rule and say why in the test.
- Log gameplay / tuning decisions in `DECISIONS.md` section RE with your prefix.
- Never claim something works without a test or a real browser check. Report exactly what is done and not done.

## E. Living environments, vehicles and NPCs

Workstream E (decisions RE-E1 to RE-E7). Reusable systems that make a City Rumble stage feel alive, declared as
data by the arena. Branch `claude/wahala-rumble-evolution-v1-env`. Everything here is presentation: nothing is a
simulation entity, nothing flows back into the game.

### E.1 The contract (`src/render/env/types.ts`)

An arena's art entry (`ArenaArt` in `render/arenas/newArenas.ts`) may carry `env`: a `StageEnvironment`, or a
factory `(board: {cols, rows}) => StageEnvironment` (the usual form, so the numbers follow a board resize).
`GameRenderer` creates a `LivingEnvironment` for it when the match loads, updates and disposes it with the other
views, and feeds it the tick's SimEvents; an arena without `env` costs nothing. Coordinates are TILE UNITS with
the board at `[0, cols] x [0, rows]` and y growing south (towards the camera): world = `(tx - cols/2, ty - rows/2)`.

| Field | What it declares |
| --- | --- |
| `traffic[]` | Ambient routes: `kinds` (danfo / bus / keke / okada / car / truck, cycled), a polyline `path`, `count`, `speed` (tiles/s), `spacing`, optional `elevation` (metres, a flyover deck is 6.6), `priority`, `minQuality`, `fade` (shrink in / out at the ends) |
| `crowds[]` | Protected off-board zones: `rect`, `count`, `mood` (waiting / trading / watching / working), `facing`, optional `elevation`, `hiVis`, own `reacts`, `priority`, `minQuality` |
| `reactions` | Default reaction rules: `blast` (radius, minimum blast radius), `elimination`, `stage` (optionally only some hazard styles); each gives a `reaction` (duck / flinch / scatter / cheer / look), a `radius` (tiles from the zone) and a per-person `chance`. A zone's `reacts` replaces the default per kind |
| `lights[]` | Practical lights: position, height, colour, glow size, strength, flicker (steady / fluorescent / sodium / neon), optional pool of light on the street |
| `audio` | NAMES of existing synthesised sounds (ambience loops, crowd one-shots) that give the place its sound. Data only |
| `occlusion` | `lowSouth` (depth of the low strip south of the board, default 2.5 tiles), `maxHeightSouth` (default 1 m), `keepClear` rectangles the art occupies |
| `budget` | Per-tier overrides that may only LOWER the global caps |

How a future arena declares it (Oshodi, Lagos Island Markets, Apapa Docks, Lekki Roadworks, Surulere Stadium):
write `src/render/env/<name>Env.ts` exporting `(board) => StageEnvironment`, add `env: <NAME>_ENV` to the arena's
entry in `newArenas.ts`, and run `tests/render/env-plan.test.ts` (add the arena to its list: it validates routes
against the board for several board sizes). `validateEnvironment` reports routes entering the board (plus a 1.2 tile
margin), an elevated route that is not north of the board, tall vehicles or any person in the low south strip, zones
overlapping the board, a route crossing a zone, overcrowded zones, lights standing on the board and any tier that
exceeds its caps or its planned draw-call target.

### E.2 Three kinds of vehicles, kept apart

| | Drawn by | Simulation | Looks |
| --- | --- | --- | --- |
| Attack vehicles (Danfo, taxi, Keke) | `VehicleViews` | real entities, hit, damage, credit kills | team highlight, the cast's materials |
| Stage-hazard vehicles (`sweep` events) | `StageHazardViews` | real lethal events, telegraphed | warning lane, headlight beams, hazard colours |
| Ambient traffic | `render/env/Traffic.ts` | none | own muted material clones, lamps dimmed, no beams / sprites / lights / telegraph colours, darker grade, off the board |

Ambient vehicles are one `InstancedMesh` per material of each model (about eight draw calls per model, parts merged
by material, all vehicles of a model are instances). Position is a pure function of the plan and the render clock.
They are never drawn on a board tile, deck traffic stands north of the board, and with the follow camera a model
whose vehicles are all out of view is not drawn.

### E.3 People

`render/life/CrowdZones.ts` places each zone's people with the pure plan (`planCrowd`: seeded dart-throwing, trading
pairs face to face, labourers pace, everyone faces the board unless told otherwise) and draws them two ways under
one budget: a few animated skinned rigs (`StreetLife`: seller pairs, touts, labourers, onlookers) and instanced
two-pose figures from `crowd.glb` (a procedural silhouette when the file is missing). Reactions come from
`stimuliFrom(events)`: `generatorExploded` (position, radius), `playerEliminated` (position), `stageWarning` /
`stageStarted` of a lethal hazard (first tile, style). A person answers with probability `chance` (a larger blast
convinces a few more), eases out, holds and walks home; positions are clamped to the zone every frame. Reduced
motion: scatter becomes a flinch in place, traffic runs at 40 %. Visually distinct from fighters: muted darkened
clothes, scale 0.80-0.90 against the cast's 1.0, no team colours, outfits, markers or name tags.

Proof they are not in the game (`tests/living-env.test.ts`): the state has no NPC entities, every elimination
credit (`creditId`, `assistIds`, rewards) is a competitor id, the env and life modules import no stepping /
creating API from the sim, and a 1800-tick bot match ends byte-identical with and without an environment attached.

### E.4 The Danfo departure hazard

`StageHazardDef` sweep gains `depart?: true`: the route starts on a road tile at an inner bay and ends at the board
edge. The Danfo is parked and visible on the bay for the whole telegraph (>= `stage.minLethalWarnTicks`), blinkers
flash faster as the moment nears, two horn rings go out (the horn itself is the existing `danfo_horn` on
`stageWarning`), it rolls back a hand's breadth with its reversing lamps on, then pulls out and accelerates. Lethal
only while it passes (the tile it is on, plus the one it is leaving for the first half of the step), generators on the
lane are set off, a player beside the lane is safe, and the announcement is DELAYED (retried a second later) while the bay is occupied
(player, generator, crate) or anyone on the lane could not walk off it in time (`laneEscapeSteps`: steps to an open tile off the
lane through the live board, times their step ticks plus `stage.escapeInputTicks`, within `warn + tileIndex * stepTicks`).
Simulation timing is the ordinary uniform `stepTicks` because the bots' danger windows read it; the acceleration is
eased in the picture only and never runs ahead of the lethal tile (`render/views/departure.ts`). Rumble stage D
authors it as `{ kind: 'sweep', style: 'danfo', depart: true, routes: [bay ... edge], ... }`;
`tests/rumble-stages.test.ts` accepts a flagged route only if it ends on the edge.

### E.5 Budgets

| Tier | Vehicles / models | People / rigs | Light glows | Planned draw calls (target) |
| --- | --- | --- | --- | --- |
| low | 4 / 1 | 14 / 0 | 4 | 16 (24) |
| medium | 10 / 3 | 36 / 5 | 8 | 41 (60) |
| high | 18 / 4 | 70 / 10 | 14 | 82 (90) |

Shadow casting only on high. Quality changes at run time (auto quality) rebuild the environment for the new tier.

### E.6 Measurements

Production build, Chromium with software WebGL (SwiftShader) on the shared 4-core build machine (load average 10-14),
City Rumble on `rumbleOjuelegba`, 8 competitors, follow camera, local player at the north edge (tile 20, 1) so the
bus stop, the deck and the north street are in view. `?noenv` removes the environment (`scripts`-style debug flag,
read by `GameRenderer`). Draw calls and triangles are `renderer.info.render` of the last frame (shadow pass included).

| Case | With env | Without (`?noenv`) | Added |
| --- | --- | --- | --- |
| 1280 x 720, medium | 728 calls, 2.48 M tris | 676 calls, 2.22 M tris | **+52 calls**, +0.26 M tris |
| 844 x 390, medium | 733 calls, 2.48 M tris | 681 calls, 2.22 M tris | **+52 calls**, +0.26 M tris |
| 1280 x 720, low | 382 calls, 1.05 M tris | 365 calls, 0.94 M tris | **+17 calls**, +0.11 M tris |
| medium, spawn view (env out of view; earlier build with okadas) | 697 | 693 | +4 |

What the environment itself builds (`LivingEnvironment.stats()`, everything counted as visible): low 15 draw calls (4
vehicles, 14 figures, 3 lights), medium 41 (10 vehicles, 5 rigs, 26 figures, 8 lights), high 82 (18 vehicles, 10 rigs, 21
figures); planned targets 24 / 60 / 90. With the follow camera whatever is out of view is hidden, so the added cost
depends on where the camera is (+4 calls at the spawn, +52 at the north edge).

CPU cost of `LivingEnvironment.update` with nothing culled (600 frames, in the page): low 0.03 ms, medium 0.24 ms, high 0.17 ms
per frame; `handleEvents` for one blast 0.09 ms. Frame TIME was not measurable in a meaningful way: SwiftShader on the
loaded machine renders a Rumble frame in tens of seconds, so only the call / triangle counts and the CPU probe are
reported; nobody has measured a real phone.

Screenshots (`docs/screenshots/rumble-evolution/`): `env-medium-north.jpg` (the bus-stop crowd under the bridge, north street), `env-mobile-north.jpg`
(844 x 390), `env-low-north.jpg`, `env-medium-west.jpg`, `env-medium-east.jpg`, `env-deck-traffic.jpg` (close inspect of the stop).

### E.7 Limits and not done

- Not seen in a real browser: the Danfo departure (no arena declares `depart` until stage D authors it; it is covered by
the scenario tests and by `tests/render/departure-view.test.ts`, which drives the real view headlessly), the crowd reactions
(covered by `tests/living-env.test.ts`) and the deck traffic itself (the deck is above the frame at the usual follow-camera
distance; `env-deck-traffic.jpg` is a close inspect of the stop, not of the deck).
- Rows, columns and zone rectangles marked `ALIGN` in `ojuelegbaEnv.ts` are written from the board bounds, not from stage D's
  layout; the existing static art still parks four vehicles on the old deck, which the moving traffic now duplicates.
- `bus` and `truck` are the Danfo model stretched; no separate bus or truck model exists.
- The audio hooks (`audio`) are data: the audio engine does not read `LivingEnvironment.audioHooks()` yet. No recording, voice
  or music was generated; conductor calls are not used (no approved founder clip).
- Deferred: upper-window spectators (needs building facades), a moving machinery set, deck audio passes, the arena's
  own lighting rework (palette hints are in `ojuelegbaEnv.ts`), per-instance animation of vehicle wheels.
- Rigs cast shadows only on high; instanced people never do. Real point lights are not used (glows only).
- Reduced motion is read from `matchMedia` when the match loads; it is not re-read live.
- Debug flag `?noenv` (any arena) turns the environment off for measuring.

### E.8 Late research reconciliation (what changed because of it)

| Research finding | Outcome |
| --- | --- |
| No commercial okadas in Surulere / Lagos Mainland since 2022 | Adopted: no okadas in the Ojuelegba environment; Danfos and buses dominate, a few taxis, sparse kekes, trucks on the flyover only (test) |
| Flyover traffic is visual and non-colliding; underbridge gameplay traffic is the small scheduled set | Adopted: ambient traffic is instanced and never an entity; the departure sweep is the gameplay traffic |
| Provisional low tier: 12-20 people, 2-4 background vehicles, one machinery set, <= 2 break bursts | Adapted: low = 14 people, 4 vehicles; machinery set and break bursts are not part of this workstream (deferred) |
| Civilians in protected strips; short reactions; never obstacles / loot / targets; never hide indicators or warnings | Adopted: zones validated off the board, reactions clamped to the zone, no sim presence (tests) |
| Touts / union fictional | Adopted: no union names or props; ordinary traders are ordinary |
| Departure: horn plus lit road markers, safe pavement recesses, warning > slowest fighter's escape time, suppress when combined with another system | Adopted: horn (existing) + the lane telegraph, safe pockets recorded as data, `laneEscapeSteps` check with `escapeInputTicks` per lane tile (arena data test and live delay), no overlap with other lethal events or the closing city |
| Duck engines / crowds / music when a hazard or generator warning plays; no recordings | Already the case (`eventRouter.ts`, warnings bus never ducked); nothing added |
| Conductor calls only with an approved founder clip | Deferred (no clip, never TTS) |
| Ojuelegba lighting: shade under the deck with a hard sun edge and reflected light, LED / sodium practicals, palette | Adapted: LED (#E8F4FF) and sodium (#FF9F3A) practicals, bounce-light pools under the deck; the sun wall and palette are for the stage art (hints in `ojuelegbaEnv.ts`) |
| Contract records ambient budgets, light limits, occlusion / cutaway, safe pockets, conflicting-event exclusions | Adopted: `budget`, `lights` caps, `occlusion.cutaway` / `keepClear`, `safety.safePockets` / `safety.exclusions` |
| Falling containers / debris at Ojuelegba, crowd surges, NPC shoves, agbero damage, NPCs as obstacles, 150-NPC / Mass crowds, generated audio | Rejected: not built |
