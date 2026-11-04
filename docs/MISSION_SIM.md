# Mission simulation (campaign runtime)

Branch `claude/wahala-campaign-online-v1`, worker `mission-sim`. The pure runtime that powers a one-player campaign mission. Contracts: `src/sim/mission/types.ts` (read by `src/campaign`, `src/ui/campaign`, `src/app`). Decisions: `docs/DECISIONS.md` MS1-MS14. Layer map: `docs/CAMPAIGN_ARCHITECTURE.md`.

A mission is an ordinary match: `GameOptions.mission = { id, modifiers?, difficulty?, lives?, timeLimitSec? }` and `GameState.mission` (plain JSON). `tick` calls the mission runtime only when `state.mission` exists; in every normal match the key does not exist and the state is byte-for-byte what it was (`tests/mission-regression.test.ts` pins two state hashes recorded on the base commit `321cc5a`).

## API (all from `src/sim`)

| Name | What |
| --- | --- |
| `buildMissionGame({ spec, humanCharacter, seed }): GameOptions` | The mission match: the district's City Rumble arena, 6-9 competitors, seat 0 the human (team 0), seat 1 the boss, seats 2... the crew (all team 1). Pass the result to `createGame`. |
| `missionView(state): MissionView \| null` | The read-only picture for the HUD / renderer markers / app; null outside missions. |
| `getMissionArenaId(id)`, `MISSION_DEFS`, `FACTION_IDS` | The data: arena, objective, factions, crew, phases, numbers (`src/sim/mission/defs.ts`). |
| `directiveFor(state, playerId)` | What a crew bot's role asks of it (also carried by `observe(state, id).directive`). |
| `tuningFor(spec)`, `resolveTuning` | The resolved numbers of a mission with its replay modifiers applied. |
| `state.mission` | `MissionState`: seats and roles (`seats[i].role/factionId/post`), phase, nodes, strikes, boss shield, lives, `outcome`. |
| New `SimEvent`s | `missionStarted`, `missionPhase`, `missionNode`, `missionWarning`, `bossExposed`, `bossShielded`, `bossDefeated`, `missionOutcome`, `missionCallout`. Existing ones (`playerEliminated`, `playerRespawned`, `stageWarning` for railcars, flames) are unchanged. |

`GameKind` gained `'mission'` (`settings.game`). `MissionSpec.timeLimitSec` is an extra optional field (practice / tests); the campaign leaves it out. `NpcDirective.kind` has one extra member, `'flee'`.

## How a mission plays

1. **Match rules** (`modes.ts` `mission`): the Rumble economy (radial blasts, two generators, elimination rewards) on the district stage; **no Wahala Crush, no random hidden pickups** (marked `$` supply crates keep their basic upgrade, as on every Rumble stage); arena stage hazards and the mandatory endgame traps stay on; crate density 0.28 (`MISSION_SOFT_DENSITY`) and a 3 x 3 open patch around every node and post. The clock is the mission's time limit; `evaluateMatchEnd` hands over to `evaluateMission`.
2. **Lives.** The human has `lives` (default 3). Being eliminated spends one; while lives are left they respawn (3 s, spawn protection, upgrades reset); the last one lost = mission **lost**. The crew never respawns; only 'reinforce' events bring a fallen **runner or escort** back (at the start of phases 2 and 3 and after a missed boss window, at most `reinforceMax` = 3 per mission, 3 s warning on the entry tile). Armour / Okada shields behave exactly as elsewhere (one layer absorbs one lethal hit); strike flames are ordinary flames, so spawn protection, shields and credit are the existing systems.
3. **Phases.** Three, each with its own node set and numbers (rising pressure, never waves of enemies). Reaching the goal of a phase starts the next (pending warnings are dropped, landed flames keep burning). The goal of phase 3 **exposes the boss**.
4. **The boss.** Seat 1 (a bot, never easier than Standard). While `boss.shielded` it cannot be eliminated (`lethality.ts` asks `isShieldedBoss`; a flag rather than `protectedUntil`, because the respawn rules drop spawn protection when its owner places a generator). Exposed for `exposeSec` (25 s): eliminating it wins (`defeat: 'eliminated'`). If the window runs out the boss is shielded again and **phase 3 starts again** (`phasesCleared` back to 2); at most `maxExposures` (3) windows in all, then the mission is lost (the boss got away). The shielded boss guards its post (radius 3); the exposed boss flees the human. Elimination credit and kill stats are the existing attribution; **only the human earns elimination rewards** in a mission.
5. **Outcome.** `MissionOutcome` (`result won | lost | timeout`, seconds, lives used, phases cleared, stars, credited kills) in `state.mission.outcome` and in the `missionOutcome` event; the match ends: won = `win` for seat 0, lost = `win` for the boss seat, timeout = `draw / timeout`. Stars: 1 cleared; 2 at most one life lost; 3 also within the par time. A boss defeat on the same tick as the last life still wins.

## Strikes (every mission's pressure)

A strike is **telegraphed, lethal, credited to the boss and never unavoidable** (decision MS2-MS3): `strikes.ts` calls it only when the warning is at least 2.5 s (`MIN_STRIKE_WARN_TICKS`, 3.5 s for a train), the human could walk off its tiles in time (`escapeSteps`), at most 3 are alive at once, and a landing is postponed (bounded, 5 x 24 ticks) while the human cannot move (daze, knockdown, slide, trapdoor). At the landing real flames (owner = the boss seat, `ownerSafe`) burn the floor tiles for `activeTicks`; the boss and crew are the same team, so only the human is hurt. `MissionView.warnings` (kinds `convoy`, `strike`, `contingency`, `window`, `reinforce`) lists tiles and ticks left; the `missionWarning` event fires when one is called.

## The six mechanics (one verb each, node based, data driven)

Node tiles are authored open floor of the district's arena (never road, track, crate or concrete), validated and BFS-reached from the human spawn by `tests/mission-nodes.test.ts`. "Standing" = the human's tile is the node tile (zone radius for junctions). Ticks at 60 per second; numbers are `src/sim/mission/defs.ts`.

| Mission (arena, clock, par) | Verb / objective id | What the human does | Pressure and counter-play | Phase 1 / 2 / 3 |
| --- | --- | --- | --- | --- |
| **oshodi** `rumbleOshodi`, 7 min, 4 min (**vertical slice**) | JAM relays / `dispatchRelays` | Stand on a relay 2.5 s (3 s later) to jam it; progress drains 2 per tick when they leave | Every live relay calls a **convoy strike** (a 12-16 tile segment of one of the four main-road lanes, 3 / 2.75 / 2.5 s warning, 40 ticks of flame) every 10 / 7 / 5 s; a jammed relay is silent and **re-arms** after 25 / 20 / 40 s, or when a **runner** has stood on it 1.5 s (phases 2-3) | jam 2 of 3 / jam 3 of 4, runners re-arm / jam all 4 at once (40 s window) |
| **mushin** `rumbleMushin`, 7 min, 4.5 min | DESTROY parts stacks / `supplyRoutes` | Blast a stack: each separate blast of theirs on its tile is one hit (a chain counts once) | **Market runners** standing on a destroyed stack restock it after 10 / 7 / 5 s (no runner, no restock); near a live stack a goods-fall strike (3 x 3) is called on the human every 8 / 6 / 5 s | 2 of 3 (1 hit) / 3 of 4 (2 hits) / all 4 at once (2 hits) |
| **fadeyiSomolu** `rumbleFadeyi`, 7 min, 4.5 min | HOLD junctions / `junctionAccess` | Stay inside the 3 x 3 zone for 4 / 5 / 5 s; progress freezes while any crew bot (a marshal) is inside it and drains 1 per tick when the human is away | A junction not yet held calls a **marshal strike** (a lane through it, outside the zone) every 9 / 7 / 5 s; **held** junctions stop calling for good and open their `opens` routes (authored soft blocks) | hold 2 of 3 / 3 of 3 / 3 of 3 inside 35 s (a held junction is retaken after) |
| **ebuteMetta** `rumbleEbuteMetta`, 8 min, 5.5 min | HIT switches inside timed windows / `dispatchWindows` | Stand on a switch 1.5 / 1.7 s **only while the rail window is open** (it opens when the railcar has cleared the lane; the arena's own scheduled trains are off) | Each cycle (25 / 22 / 20 s) the arena's `train` stage hazard is telegraphed 4 / 3.75 / 3.6 s ahead (lane lights, bell; the lane is checked escapable), then the window stays open 10 / 8 / 7 s; half a throw is lost when it closes | 2 of 3 / 3 of 4 / all 4 (a thrown switch resets after 25 s) |
| **lagosIsland** `rumbleLagosIsland`, 7 min, 4.7 min | COLLECT and DELIVER ledgers / `evidenceRun` | Stand on a ledger 1 s to pick it up (one at a time), walk it (each step +4 ticks) to the press drop and stand on it 0.5 s | **Auditors** (defenders) chase the carrier; a daze, knockdown, fall or (phase 3) 45 s carried **drops** the ledger back where it was; while carrying, an **audit strike** (3 x 3) is called on the carrier every 9 / 7 / 5 s | deliver 2 of 3 / 3 of 4 / 4 of 5 to a far press |
| **lekki** `rumbleLekki`, 7 min, 4.3 min | SWITCH OFF in order / `contingencyGrid` | Stand on switches 0.5 s each in the signalled order (drawn from the match RNG; shown in `callout` and as the number on each switch label); some switches are decoys | A **wrong or decoy switch** calls a contingency strike (3 x 3) on it and resets the whole sequence; from phase 2 a strike also chases the human every 9 / 7 s | sequence of 3 (of 4 switches) / 4 (of 5) / 5 (of 6) |

The first number of a "1 / 2 / 3" cell is phase 1. Replay modifiers (`MODIFIER_FOR`, decision MS10) are one numeric tweak of their own mission: `rushHourDispatch` pulse x 0.75; `marketDay` restock x 0.7 and one extra runner (9 competitors max); `tollSeason` hold x 1.5; `expressTimetable` window x 0.7; `auditWeek` one more ledger per phase and the clock x 0.85; `longBlackout` the sequence one longer in every phase. A modifier of another mission is ignored.

## Crew: factions and roles

Faction ids (strings; the content worker matches them in `src/campaign`):

| Mission | `factionId` of boss and crew | Suggested `FactionKind` |
| --- | --- | --- |
| oshodi | `eko-dispatch-collective` | transportEnforcers |
| mushin | `ladipo-parts-union` | marketCrew |
| fadeyiSomolu | `brt-route-marshals` | routeMarshals |
| ebuteMetta | `rail-yard-dispatch` | railDispatch |
| lagosIsland | `island-audit-bureau` | officials |
| lekki | `lekki-private-security` | securityContractors |

The human's seat has `factionId: 'player'`. Default boss and crew names are in `MISSION_DEFS` (e.g. "Oga Dispatch", "Mama Spare-Parts", "Marshal Toll", "Yard Master", "The Auditor", "Estate Controller") and are only labels: the campaign content may rename a seat's display name. Crew per mission: oshodi 6 (meleeGuard, rangedAttacker, blocker, 2 runners, escort), mushin 5 (3 runners, meleeGuard, blocker), fadeyi 5 (3 objectiveDefenders, meleeGuard, blocker), ebute 5 (2 objectiveDefenders, runner, blocker, supportUnit), lagos 5 (2 objectiveDefenders = auditors, meleeGuard, bossAssistant, supportUnit), lekki 6 (2 objectiveDefenders, rangedAttacker, meleeGuard, bossAssistant, escort). Total competitors 7-8 with the human and the boss (the `marketDay` modifier adds one runner to Mushin: 8). Crew bots play at `MissionSpec.difficulty` (default Rookie); the boss at that level but never below Standard.

Roles become **directives** (`src/sim/mission/directives.ts`, decision MS5) that bots read from `Observation.directive` (`src/ai/directive.ts`: only the hunt field, its weight and a leash penalty change; every step, placement and escape check is the ordinary bot's):

| Role | Directive | Behaviour |
| --- | --- | --- |
| meleeGuard | `guard` post, radius 3 | holds its post and fights what comes in; chases once the boss is exposed |
| rangedAttacker | `chase` | hunts the human anywhere |
| blocker | `block` post | stands on its lane / choke tile |
| runner | `run` | goes to the objective's restock / re-arm tile (a destroyed stack, a jammed relay) |
| escort | `escort` boss, radius 2 | stays with the boss |
| objectiveDefender | `guard` node (by `anchor`), radius 3 | stays at its node; chases the carrier (evidence run) and the human once the boss is exposed |
| supportUnit | `support` ally, radius 3 | stays with a runner / defender, else the boss |
| bossAssistant | `block` | stands two tiles from the boss towards the human |
| boss | `guard` post / `flee` | guards its post while shielded, flees the human while exposed |

## How to add a mission

1. Add the id to `MissionId` / `MISSION_IDS` and its replay modifier to `MissionModifierId` / `MODIFIER_FOR` (`types.ts`), a faction id to `FACTION_IDS`.
2. Write a `MissionDef` in `defs.ts`: arena, objective, clock, boss post, crew list (roles, posts, `anchor`), three `PhaseDef`s (nodes + the numbers that differ from `BASE_PHASE`; every lethal `warnTicks` is clamped to 2.5 s, 3.5 s for trains). Node tiles must be '.' or '_' tiles of the layout.
3. A new verb: an `Objective` in `objectives/` (`setup`, `update`, `done`, `nodeView`, `runnerTarget`), registered in `objectives/index.ts`, built from `callStrike` for pressure. A modifier: one line in `tuning.ts` and a row in its table.
4. Run `tests/mission-nodes.test.ts` (every node reachable, 6-9 competitors), add the mechanic's positive and failure test next to `tests/mission-objectives.test.ts`.

## Files

`src/sim/mission/`: `types.ts` (contract + runtime state), `defs.ts` (data), `tuning.ts` (modifiers), `build.ts` (`buildMissionGame`, config layer), `state.ts` (`createMissionState`), `runtime.ts` (`updateMission`, `missionAfterEliminations`, `evaluateMission`, boss window, reinforcements, outcome), `rules.ts` (the four questions the core systems ask), `strikes.ts`, `ctx.ts`, `objectives/*` (six mechanics), `directives.ts`, `view.ts`. Hooks in the core (all no-ops without `state.mission`): `tick.ts` (two calls), `state.ts` (`createGame`), `modes.ts`, `systems/match.ts`, `lethality.ts`, `respawn.ts`, `rewards.ts`, `streaks.ts`, `queries.ts` (ledger carry slows steps); `observe.ts` (`directive`); `src/ai` (`directive.ts`, one call in `brain.ts`, one term in `goals.ts`); `src/app/hud.ts` (type only) and `src/audio/eventRouter.ts` (nine silent handlers) so the new types compile.

## Tests

`tests/mission-regression.test.ts` (normal matches unchanged), `mission-nodes.test.ts` (data validity, reachability), `mission-oshodi.test.ts` (the full scripted playthrough, retry loop, loss, timeout, lives, respawns, reinforcements, strike fairness / credit / protection layers), `mission-objectives.test.ts` (the five other mechanics, positive and failure), `mission-crew.test.ts` (roles and directives), `mission-runtime.test.ts` (all six missions to a terminal state, determinism, rules, modifiers, numbers). Helpers: `tests/mission-helpers.ts` (a scripted human that uses only ordinary intents).

## Known limits

- The Oshodi mission has a full playthrough test (stage hazards off, crew idle); the other five are tested per mechanic and as "an idle human cannot win", not played through by a script. Real-play balance (how hard the boss and crew bots are against a person) is untuned: the crew levels, strike cadence and window lengths are first values.
- Strikes are flame lanes and areas, not drawn vehicles; the renderer shows them from `MissionView.warnings` and the flames. The Ebute-Metta railcar is the real `train` stage event (rendered by the existing stage views), driven by the mission's window cycle.
- A strike is only called when it is fair at that moment; when the human is boxed in or a landing is postponed three times over, a pulse is skipped rather than made unfair.
- Single level: junction "routes" open by clearing authored soft blocks (`NodeDef.opens`, none authored yet); there are no skywalks.
- Mission audio is silent (the nine events have no cues yet); no voices, music or recordings were added.
