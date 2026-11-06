# Classic raids

Branch `claude/wahala-campaign-online-v1`, worker `raid-sim`. A classic raid is a compact FIXED-SCREEN mission inspired by the original four-player mode, played by one human against enemies: cardinal grid movement, cross bombs, marked cargo, crates and barrels, enemy waves, conveyor belts with telegraphed shipments, locked areas, optional side rooms and an extraction. Plan: `CAMPAIGN_EXPANSION_PLAN.md`. Decisions: `DECISIONS.md` RD1-RD12. Contracts: `src/sim/raid/types.ts` (view, runtime state), `src/sim/raid/def.ts` (authored data), `src/sim/campaign/types.ts` (`RaidId`, `RaidOutcome`, `RaidRequest`).

A raid is an ordinary match: `GameOptions.raid = RaidSpec` and `GameState.raid` (plain JSON). `tick` calls the raid runtime only when `state.raid` exists, so every other match is byte-for-byte what it was (`tests/raid-core.test.ts` re-runs the two pinned hashes of `tests/mission-regression.test.ts`).

## API (all from `src/sim`)

| Name | What |
| --- | --- |
| `buildRaidGame({ raidId, humanCharacter, seed, hp?, lives?, maxHp?, difficulty?, timeLimitSec? }): GameOptions` | The raid match: seat 0 the human (team 0), seats 1... the enemies (team 1, `enemyKind`, dormant until their wave). `hp` is the health the player brings in. Pass to `createGame`. |
| `raidView(state): RaidView \| null` | The read-only picture for the HUD / renderer (null outside raids). Extras beyond the contract: `seats` (every enemy seat, dormant ones `active: false`), `bonuses`, `switches`, `hint`. |
| `RAID_DEFS`, `RAID_IDS`, `raidArenaId(id)` | The data (`src/sim/raid/defs/*`). |
| `abandonRaid(state, events)` | The player leaves on purpose: outcome `abandoned`, no stars. |
| `state.raid.outcome` / event `raidOutcome` | `RaidOutcome` (`result`, `seconds`, rooms opened / total, cargo, `hpLeft`, `livesUsed`, `stars`, `failedBy?`). |
| `RAID_ARENAS`, `RAID_ARENA_IDS`, `getArena(id)` | The boards (`kind: 'raid'`), kept out of `ARENAS`. |
| `enemySeats`, `parseRaidLayout`, `raidProblems`, `RAID_TUNING`, `raidDirectiveFor` | Data helpers and the numbers. `analyseRaid` (`src/sim/raid/analysis.ts`) is the static solvability proof. |

New events (`SimEvent`): `cargoHit`, `cargoDestroyed`, `raidDoorOpened`, `raidRoomOpened`, `raidWaveStarted`, `raidExtractionOpened`, `raidOutcome` (contract) plus `raidShipmentWarning { shipmentId, beltId, tiles, warnTicks }` and `raidBonusTaken { roomId, kind, x, y }`. `cargoDestroyed` is also sent for a shipment broken by a blast (`id` starts with `shipment-`). Existing events are unchanged (`campaignHit` for shipment damage, `playerRespawned`, `blockDestroyed` for plain crates, `generatorExploded`, `matchEnded`).

## Tile legend (one character per tile, board at most 17 x 13)

| Glyph | Meaning |
| --- | --- |
| `#` | indestructible wall |
| `.` | open floor |
| `x` | plain crate (the ordinary soft block, one blast) |
| `M` | MARKED cargo, the objective (hp 2); ids `cargo-0..` in reading order |
| `K` | unmarked cargo (hp 1), ids `goods-N`; scenery, or a "lock-box" a door waits for |
| `S` | sturdy crate (hp 2), ids `crate-N` |
| `B` | barrel (hp 1), ids `barrel-N`; explodes when destroyed |
| `@` / `E` | the entrance (spawn and respawn) / the extraction tile (opens when the objective is done) |
| `^ > v <` | conveyor belt tile carrying things that way; a run of belts is one conveyor (matched to `conveyors[]` in reading order of its first tile) |
| `*` | floor switch (the human stepping on it presses it for good) |
| `1`-`9` | a door, closed = wall (`doors[]` names its condition) |
| `a-u w y z` | an enemy spot (`v` is a belt and `x` a crate) |
| `A` `H` `T` | a room bonus: an Armour plate / one health segment / a star token |

The arena the engine sees is the normalised layout (`#` walls and doors, `x` every destructible, `.` the rest), so the tile map is built with no raid special case. Cargo, crates and barrels are soft tiles; the entity in `state.raid.cargo` carries the hit points.

## Mechanics

| Mechanic | Rule | Failure / edge | Test |
| --- | --- | --- | --- |
| Cross bombs | `BLAST_RULE_BY_GAME.raid = 'cross'`: the plus, range from the raid (2), stopped by concrete, absorbed by the first crate | no diagonal flame, nothing past range or a wall | `raid-cargo` |
| Cargo | one hit per SEPARATE blast (a chain counts once); at 0 the tile opens and `cargoDestroyed` fires; only flames hurt it | out of range or behind a wall = untouched; unmarked cargo and crates never count towards the objective | `raid-cargo` |
| Barrels | destroyed -> 6 ticks later a plus (reach 1, 30 ticks) credited to whoever lit it; hits cargo, plain crates, other barrels (chain) and players | explodes once | `raid-cargo` |
| Waves | dormant seats; trigger -> `raidWaveStarted` -> 1.5 s of spawn warning -> enemies appear; cleared when all are down; no respawn | blocked spot waits, then shifts | `raid-flow` |
| Belts | a standing player is carried one tile per `stepTicks` (cardinal); walking beats it; a crate, wall or generator ahead = stays | every belt tile is within two steps of non-belt floor | `raid-belts`, `raid-layouts` |
| Shipments | telegraphed >= 1.25 s (`raidShipmentWarning`, `RaidView.warnings`); then one tile per `stepTicks`; hit through `applyCampaignHit` source `hazard`, once per victim; stopped by a wall; destroyed by a flame | sidestepping during the telegraph = no hit; a delayed launch keeps the whole telegraph | `raid-belts` |
| Locked areas | doors open on a condition (cargo count, one named crate, wave cleared, switch, lieutenant down, another door) and stay open | stays shut while the condition is unmet | `raid-flow` |
| Side rooms | behind doors, never required; bonus taken by walking on it; may hold a small enemy group; counted in the outcome | skipping all of them still completes | `raid-slice`, `raid-flow` |
| Extraction | the last marked cargo opens it (`raidExtractionOpened`, once); standing on it completes the raid | before the objective it does nothing | `raid-flow` |
| Lives | 3; a fall spends one; back at the entrance after 1.5 s with spawn protection and full health | the last life lost = `failed` (`lives`); the clock = `failed` (`time`) | `raid-slice` |
| Stars | 1 completed; +1 no life lost; +1 inside par; +1 star token; max 3 | failed / abandoned = 0 | `raid-flow` |

## The layouts

All six are validated by `tests/raid-layouts.test.ts` (data, size, belts, and the `analyseRaid` closure: every marked cargo can be bombed from a tile the player can leave in time, the exit, every room, switch and enemy spot is reachable once the doors that can open have opened).

### warehouseDispatchDepot - the vertical slice (Oshodi, 17 x 13)

"Destroy the 3 marked dispatch crates." Wave 1: three guards (`a b c`). Wave 2 (called by the first crate): two throwers (`d e`) and a lieutenant (`f`). One locked area: the north bay (door `2`, opens when wave 1 is down; `cargo-0` inside). Conveyor: belt `v` down the aisle between the racks at x 13 (beside the east lane), 24 ticks per tile, first shipment at 10 s, then every 7 s, 1.5 s telegraph. Optional rooms: the Armour locker (door `1` opens when the lock-box crate `K` is blasted; `A`) and the first-aid cupboard (door `3` opens on the floor switch `*` beside the belt; `H`). The exit opens when the third crate falls (the way there crosses the belt). Since the classic grid (`docs/CLASSIC_GRID.md`) the board is a pallet-rack maze: a rack column on every (even, even) tile. 240 s, par 150 s. A scripted human with ordinary intents completes it in `tests/raid-slice.test.ts`.

```
     01234567890123456
  0  #################
  1  #A..#..x...K#.M.#
  2  #.#.1.#.#.#.2.#.#
  3  #...#.....x.#...#
  4  #####.#.#.#.#####
  5  #....x.a...bdv..#
  6  #.#.#.#.#x#.#v#.#
  7  #..x..x.M...*v..#
  8  #.#x#.#.#.#.#v#.#
  9  #.x..e..xMxc.v..#
 10  #.#.#x#f#######.#
 11  #@.......3.H.#.E#
 12  #################
```

### partsStoreroom - barrels and shelves (Mushin, 15 x 11)

Three parts stacks: the middle one is hemmed in by two barrels (blow a barrel and its blast hits the stack; two barrels = destroyed), one sits between two shelving posts in the south-west, one in the office (door `2`, opens when two stacks are down; two drums side by side just inside the door chain). A shelving-post maze since the classic grid (`docs/CLASSIC_GRID.md`). Guards in the aisles; the office opening wakes a thrower and a heavy. First-aid cupboard (door `3`) opens when the guards are down. 210 s, par 140 s.

```
     012345678901234
  0  ###############
  1  #.....2BB...M.#
  2  #.#S#.#.#.#.#.#
  3  #.....#########
  4  #.#b#.#.#.#a#.#
  5  #.S.x..BMB..S.#
  6  #.#.#.#.#.#.#.#
  7  #.x...x.x..d..#
  8  #.#M#.#.#.#.###
  9  #@...E.c...3.H#
 10  ###############
```

### railYardGoods - belts and shipments (Ebute-Metta, 17 x 11)

One long S-shaped conveyor (east along the top, south down the east side, west along the middle; 30 tiles, 20 ticks each, up to two shipments) and a short one along the entrance row. Three goods wagons in the middle row, reached by one-tile cross aisles between buffer-stop pillars (the classic grid, `docs/CLASSIC_GRID.md`; (14,4) stays open so the belt corner can be left within two steps). The floor switch opens the ticket closet (star token `T`, with a closet agbero `j` who appears when it opens); the exit gate (door `2`) opens when the second wave (thrower and heavy, called by the second wagon) is down. 240 s, par 160 s.

```
     01234567890123456
  0  #################
  1  #Tj1.........2E.#
  2  #####.#a#.#.#####
  3  #.>>>>>>>>>>>>>v#
  4  #.#.#.#c#.#x#..v#
  5  #...xMS.xM..xM.v#
  6  #.#.#.#.#.#.#b#v#
  7  #.#<<<<<<<<<<<<<#
  8  #.#*#.#.#.#d#.#.#
  9  #@..>>>>>>>>>#..#
 10  #################
```

### recordsVault - tight rooms and a door sequence (Lagos Island, 15 x 13)

Four chambers, each behind a door: the entrance hall (door `1`: its two guards down) -> the registry (door `2`: its cabinet destroyed; wakes the archive guards and the Chief Clerk lieutenant) -> the archive (door `3`: the lieutenant down) -> the vault with two cabinets and two barrels. An Armour closet at the east end of the archive (door `4`: blast the jammed shelf beside it). The exit is in the entrance hall. Since the classic grid (`docs/CLASSIC_GRID.md`) each chamber is a one-tile corridor with alcoves between filing posts; the spawn pocket at (2,10) gives the first bomb two ways out. 270 s, par 180 s.

```
     012345678901234
  0  ###############
  1  #....BM.MB....#
  2  #.#.#.#.#.#.#.#
  3  #######3#######
  4  #.#h#S#g#i#S#A#
  5  #...........4.#
  6  #######2#######
  7  #....M.....x..#
  8  #.#.#.#.#.#.#.#
  9  #######1#######
 10  #..x#.#.#x#.#.#
 11  #@..a.....b..E#
 12  ###############
```

### junctionToolShed (Fadeyi / Somolu) and standbyPlant (Lekki) - the compact template (13 x 9)

`src/sim/raid/defs/compact.ts` builds a `RaidDef` from a handful of parameters on one 13 x 9 board: three marked crates (one in a sealed corner behind a door), two waves of two, optional barrels, an optional three-tile conveyor with shipments in the entrance lane, and a corner door that opens by a floor switch or when the first wave is down. The shed (barrels, switch, no belt, 180 s) and the plant (a belt, door by wave, 190 s):

```
 junctionToolShed          standbyPlant
     0123456789012             0123456789012
  0  #############          0  #############
  1  #..c..x.1.M.#          1  #..c..x.1.M.#
  2  #.#.#.#.#####          2  #.#.#.#.#####
  3  #..M..a.xBM*#          3  #.BM..a.x.M.#
  4  #.#.#.#.#.#.#          4  #.#.#.#.#.#.#
  5  #.B.x...b.xd#          5  #...x...b.xd#
  6  #.#.#.#.#.#.#          6  #.#.#.#.#.#.#
  7  #@..x...x..E#          7  #@..x>>>x..E#
  8  #############          8  #############
```

## How to add a raid

1. Add the id to `RaidId` (`src/sim/campaign/types.ts`) if it is new.
2. Write a `RaidDef` in `src/sim/raid/defs/<name>.ts` (or call `compactRaid({...})`): the layout from the legend above, `legend` hit points, `waves` (trigger + enemies by spot letter), `doors` (glyph + condition + hint), `rooms` (rect around exactly one bonus glyph), `conveyors` (one per belt run), lives, clock, par, bombs. Register it in `defs/index.ts` and give it an arena (`src/sim/arenas/raid<Name>.ts` = `raidArena(def)`, listed in `RAID_ARENAS`).
3. Run `tests/raid-layouts.test.ts`: `raidProblems` names data mistakes; `analyseRaid` names unreachable cargo, exits, rooms, doors that can never open. Draw so that every marked crate has a straight line of at most two tiles from floor with a way out of the blast. `raidProblems` also runs the classic-grid shape rule (`src/sim/raid/shape.ts`, `docs/CLASSIC_GRID.md`): pillars on the (even, even) tiles, no open 3x3, open 2x2 only in a room, by a belt or at the entrance / exit; `tests/raid-classic-grid.test.ts` adds the fairness checks (two escape directions at the entrance, every enemy spot joined to the entrance on the bot's board).
4. Numbers that are not per raid are in `src/sim/raid/tuning.ts`; log any tuning change in `DECISIONS.md`.

## What other layers must know

- Seat 0 is the human; enemy seats are `players[1..]` with `enemyKind`; a dormant seat is `alive: false` with a position on its spot, so renderers must use `RaidView.seats[].active` (or the wave warnings) rather than `alive` to decide whether to draw an enemy.
- The doors, cargo and shipments are drawn from `RaidView`; the tile map shows doors and cargo as solid, a destroyed one as floor. A shipment in `warn` phase has `warnTicks > 0` and is not yet dangerous.
- The field mission hands health in with `buildRaidGame({ hp })` and reads `state.raid.outcome.hpLeft` back; `abandonRaid` ends a raid from the pause menu.
- Enemy behaviour: raid enemies have no generator economy (`capacity` 0). Until `combat-attacks` provides group tactics they follow `raidDirectiveFor` through `Observation.directive`.
- Shipment damage goes through `applyCampaignHit` (combat-core), so armour, Okada, recovery frames and health apply as everywhere.

## Known limits

- The raid board is single level and the camera is the fixed whole-arena one; there is no render, UI or touch work here (other workers).
- Enemy projectiles and attacks are `combat-attacks`' work; the scripted tests use idle enemies, and bot-driven runs are checked only for determinism and stability, not balance.
- Numbers (clocks, par times, shipment cadence, lives) are first values, untuned against real play.
- Generators on a belt are not carried; a shipment is not blocked by a generator.
