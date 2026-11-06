# Classic grid: the raid boards as Bomberman mazes

Worker `raid-geometry`, from the release `a4fe457`. Decisions `DECISIONS.md` CG1-CG8. Screenshots: `docs/screenshots/classic-grid/` (`before_<raid>.jpg` on `a4fe457`, `after_<raid>.jpg` on this branch, desktop 1280 x 720, plus the depot on a phone in landscape, 844 x 390), taken with `scripts/raid-board-shots.mjs` (the real raid through `?debug`'s `campaign().debugStartRaid`).

## The problem

Founder playtest: the classic raids did not play like Bomberman. Movement was already cardinal; the placement of the permanent blocks and crates was the problem. Large open halls (the depot's west hall and east bay, the floor between the rail-yard belts, the storeroom aisles, the vault's bottom hall) meant a cross bomb never closed a lane: there was always a diagonal step out, so it could not trap anyone and the enemies always escaped.

## The rule (`src/sim/raid/shape.ts`, run by `raidProblems` on every raid)

A raid layout is measured at the start of play: walls, closed doors and every destructible (`x M K S B`) are solid; floor, belts, switches, spots, bonuses, entrance and exit are walkable.

| Measure | Rule | Why this number |
| --- | --- | --- |
| open 3x3 (a 3 x 3 square of walkable tiles) | **0**, anywhere, rooms included | a 3 x 3 field is where a cross bomb is useless: every tile has a diagonal refuge two steps away |
| open 2x2 (a 2 x 2 square of walkable tiles) | **at most 4** per raid, and **each one** must lie inside a side room's rect, touch a belt tile, or touch the entrance / exit tile | in a full pillar lattice every 2 x 2 window holds a pillar, so an open 2x2 exists only where a pillar was left out on purpose: a spawn pocket (two ways out for the first bomb), a belt corner (a way off the belt within two steps), a room |
| pillar lattice | **>= 85 %** of the (even x, even y) interior tiles outside side rooms and belts are permanent walls | the classic layout: pillars on the even/even tiles, one-tile corridors on the odd rows and columns. 85 % leaves room for a door or a deliberate pocket on a lattice tile; the redrawn raids are at 94-100 % |

A layout that breaks the rule cannot be built (`parseRaidLayout` throws on any `raidProblems`). `tests/raid-classic-grid.test.ts` pins the numbers, runs the rule on all six raids and proves it rejects the old open depot and a depot with a single pillar knocked out.

Fairness checks that go with it (same test file, plus `tests/raid-layouts.test.ts`):

- **Entrance**: a bomb laid on the entrance has a safe tile through at least **two** different first steps within the fuse (no unavoidable self-trap at spawn).
- **Enemy spots**: every spot is floor with a way out, and a BFS on the enemy's own board (`ai/world.ts` over `observe()`: walls, closed doors, crates, cargo and barrels block) reaches the entrance from it with the doors that are open when that seat appears (`analyseRaid().doorsAtWaveStart` / `doorsInOrder`). Enemies never lay generators (RD7), so a spot sealed by crates would be a guard who never arrives.
- **Same blocked tiles for bot and sim**: for every tile, the bot's `blocked` and `walk` equal `!canPlayerEnter` (start, doors open, cargo gone, a generator down, and mid-raid). They already agreed (`observe()` hands the bot `state.tiles`); the test keeps it that way.
- **Solvability** (`analyseRaid`, unchanged): every marked cargo destroyable from a tile that can be left in time, extraction reachable after the objective, rooms, switches and doors reachable. **Belts**: every belt tile within two steps of non-belt floor.

## Metrics, before (`a4fe457`) and after

Measured with `raidShape` (the counts treat crates as solid; the playtest brief counted a little differently: depot 54 / 18, rail yard 74 / 37, storeroom 19 / -, vault 12 / -, but the picture is the same).

| Raid | open 2x2 | open 3x3 | pillar lattice | stray open 2x2 |
| --- | --- | --- | --- | --- |
| warehouseDispatchDepot (17 x 13) | 45 -> **0** | 16 -> **0** | 16/32 -> **32/34** | 32 -> **0** |
| railYardGoods (17 x 11) | 58 -> **3** (belt corner) | 18 -> **0** | 7/28 -> **27/28** | 12 -> **0** |
| partsStoreroom (15 x 11) | 11 -> **0** | 0 -> **0** | 4/24 -> **24/24** | 10 -> **0** |
| recordsVault (15 x 13) | 12 -> **1** (spawn pocket) | 0 -> **0** | 18/29 -> **29/30** | 10 -> **0** |
| junctionToolShed (13 x 9) | 0 | 0 | 15/15 | 0 |
| standbyPlant (13 x 9) | 0 | 0 | 15/15 | 0 |

The depot lattice is 32/34 because its two doors stand on lattice tiles ((4,2) Armour locker, (12,2) bay); both have walls above and below, so opening them makes no open square.

## The boards (before -> after)

`#` wall (on an (even, even) tile it is a pillar: rack column, shelving post, buffer stop, filing post), `x` crate, `M` marked cargo, `K` unmarked cargo, `S` sturdy crate, `B` barrel, `^ > v <` belts, `*` switch, `1-9` doors, letters enemy spots, `A H T` room bonuses, `@` entrance, `E` exit.

### warehouseDispatchDepot (the vertical slice)

```
 before                      after
     01234567890123456           01234567890123456
  0  #################        0  #################
  1  #A..#..x..xK#.M.#        1  #A..#..x...K#.M.#
  2  #...1.......2...#        2  #.#.1.#.#.#.2.#.#
  3  #...#.#.#.#.#...#        3  #...#.....x.#...#
  4  #####.......#####        4  #####.#.#.#.#####
  5  #.....xa...b#dv.#        5  #....x.a...bdv..#
  6  #.....#.#.#.#.v.#        6  #.#.#.#.#x#.#v#.#
  7  #......xMx....v.#        7  #..x..x.M...*v..#
  8  #.....#.#.#.#*v.#        8  #.#x#.#.#.#.#v#.#
  9  #....e..xMxc..v.#        9  #.x..e..xMxc.v..#
 10  #...#..f.######.#       10  #.#.#x#f#######.#
 11  #@..#....3.H.#.E#       11  #@.......3.H.#.E#
 12  #################       12  #################
```

How it plays now: the entrance corner opens two ways (north up column 1, east along row 11), each turning a corner within three steps. The hall is a grid of one-tile aisles between rack columns; a bomb in any aisle closes it, so the guards (`a b c` on the top aisle and by the south crates) can be cornered against crates or the rack ends, while a player at a junction steps round a rack to dodge. The middle marked crate (8,7) sits in an aisle between two racks: bomb it from (7,7) or (9,7), then duck north or south. The south crate (9,9) is boxed by crates and the first-aid wall: open the crate beside it or bomb down the (9,7)-(9,8) aisle. The belt now runs down its own aisle at x 13 between racks; a shipment there is a moving trap, and the way off is a junction row (5, 7 or 9) one step away. Wave 2 comes from the belt head (`d`, beside the shipments), the west aisles (`e`) and the south corridor (`f`), i.e. from three sides of the hall. The bay (behind door 2) and the Armour locker are rings round one rack, with the door as the only way in or out.

### railYardGoods

```
 before                      after
     01234567890123456           01234567890123456
  0  #################        0  #################
  1  #Tj1.........2E.#        1  #Tj1.........2E.#
  2  ####....a....####        2  #####.#a#.#.#####
  3  #.>>>>>>>>>>>>>v#        3  #.>>>>>>>>>>>>>v#
  4  #.....#.c.#....v#        4  #.#.#.#c#.#x#..v#
  5  #..x.MSx.M.x.M.v#        5  #...xMS.xM..xM.v#
  6  #.....#...#.b..v#        6  #.#.#.#.#.#.#b#v#
  7  #.#<<<<<<<<<<<<<#        7  #.#<<<<<<<<<<<<<#
  8  #.*...#.....d...#        8  #.#*#.#.#.#d#.#.#
  9  #@..>>>>>>>>>#..#        9  #@..>>>>>>>>>#..#
 10  #################       10  #################
```

How it plays now: the belts stay straight lanes (they carry players), but the floor between them is a maze of buffer stops: the wagon row (row 5) is reached only by one-tile cross aisles from the belts. A bomb in a cross aisle seals it and its blast runs onto the belts, so standing in an aisle while a shipment is telegraphed is a real trap; the escape is along the wagon row to the next aisle. The north corridor (row 1) has four aisles down to the top belt. The guards come from the north aisle (`a`) and the east aisle by the third wagon (`b`); the switchmen from the middle (`c`) and the south aisles (`d`). (14,4) is the one deliberate gap: the belt corner at (15,3) needs a way off within two steps.

### partsStoreroom

```
 before                      after
     012345678901234             012345678901234
  0  ###############          0  ###############
  1  #.....2.B...M.#          1  #.....2BB...M.#
  2  #.#S#.#.B.....#          2  #.#S#.#.#.#.#.#
  3  #.....#########          3  #.....#########
  4  #..b.....a....#          4  #.#b#.#.#.#a#.#
  5  #.#S#.#S#.#S#.#          5  #.S.x..BMB..S.#
  6  #......BMB..d.#          6  #.#.#.#.#.#.#.#
  7  #.#.#.#.#.#.#.#          7  #.x...x.x..d..#
  8  #.xMx......####          8  #.#M#.#.#.#.###
  9  #@...E.c...3.H#          9  #@...E.c...3.H#
 10  ###############         10  ###############
```

How it plays now: the shelving posts stand on the classic lattice (before they sat on the odd rows, so rows 4 and 6 were open bands). The barrel aisle is row 5: the marked stack (8,5) sits between two drums and two posts, reachable only through the drums, so the chain explosion is the way in, and anyone standing next to a drum when it goes is caught. The south-west stack (3,8) sits between two posts: bomb it from (3,7) and step east. The office opens behind two drums just inside its door (a chain), and its alcoves (7,2) (9,2) (11,2) (13,2) are dead ends: bombing the office stack from (13,1) is a self-trap, from (11,1) the alcove (9,2) is the refuge. The guards start in the north aisles (`b`, `a`); the office wave comes from the south corridor (`c`) and the east aisle (`d`).

### recordsVault

```
 before                      after
     012345678901234             012345678901234
  0  ###############          0  ###############
  1  #....BM.MB....#          1  #....BM.MB....#
  2  #.#.#.#.#.#.#.#          2  #.#.#.#.#.#.#.#
  3  #######3#######          3  #######3#######
  4  #..h...g.i.4.A#          4  #.#h#S#g#i#S#A#
  5  #.#S#.#.#S#.#.#          5  #...........4.#
  6  #######2#######          6  #######2#######
  7  #....M.....x..#          7  #....M.....x..#
  8  #.#.#.#.#.#.#.#          8  #.#.#.#.#.#.#.#
  9  #######1#######          9  #######1#######
 10  #.............#         10  #..x#.#.#x#.#.#
 11  #@..a.....b..E#         11  #@..a.....b..E#
 12  ###############         12  ###############
```

How it plays now: every chamber is a one-tile corridor with alcoves between filing posts (the archive's posts moved from row 5 to row 4, the standard parity). A bomb in the corridor sweeps it; the alcoves are the only refuge, and an enemy in an alcove with a bomb at its mouth is trapped. The hall guards (`a b`) walk the bottom corridor towards the entrance; the archive wave stands in the alcoves under the vault door (`h g i`), so the archive door opens onto the corridor they guard, and a bomb in it sweeps their alcove mouths. The vault itself (two cabinets between two barrels) is still bombed from the doorway (7,1) with the escape down through the open door. The one open square is the spawn pocket (2,10): without it the entrance corner would have one way out. The Armour closet is now the two tiles (13,4)-(13,5) behind door 4 at (12,5); the jammed shelf beside it is (11,4).

### junctionToolShed and standbyPlant (compact template)

Already classic grids; one marked crate moved from (1,5) to (3,3) (replacing a crate) so the first bomb at the entrance has two ways out and every enemy spot is joined to the entrance by open floor (before, the entrance pocket was sealed by crates and the marked crate, and the guards could not reach the player until crates were blown). Ids in reading order: `cargo-1` is now (3,3).

## Cross bombs and movement on the maze (tests)

- `tests/raid-classic-grid.test.ts` section 4: in the new depot a cross blast stops at pillars and walls, breaks the first crate of an arm and burns nothing behind it, hits the marked cargo once; a bomb at (5,7) traps a rival at (4,7) (crate behind, pillars beside: every tile it can reach burns, it is hit), and a rival at the junction (11,7) next to a bomb at (10,7) escapes round the rack corner to (11,6) or (11,8) unhurt (the diagonal refuge stays legitimate).
- `tests/input-raid-grid.test.ts`: on the real depot board with full assistance on, keyboard (two arrows), gamepad (diagonal d-pad), the touch stick swept round the clock at a junction and in an aisle, a flick across a pillar corner, and the raid cross never move the player diagonally, round a pillar corner or into a pillar; the match controller turns the input layer cardinal-only when a raid starts; and the simulation, fed random moves on every raid for 30 s, never moves a player more than one orthogonal tile or onto a solid tile. No clipping was found, so no input or movement code changed.

## Changed coordinates (for other workers' scripts)

| Raid | Was | Now |
| --- | --- | --- |
| depot | belt x 14 (y 5-9) | belt x 13 (y 5-9) |
| depot | switch (13,8) | switch (12,7) |
| depot | thrower spot `d` (13,5) | (12,5) |
| depot | Armour door (4,2), bay door (12,2), entrance, exit, rooms, all cargo, spots `a b c e f` | unchanged |
| depot | the board centre (8,6) | a pillar (it was a wall before too); the pressure test now stands the human on the nearest floor (8,5) |
| storeroom | marked stack between barrels (8,6), barrels (7,6) (9,6); office barrels (8,1) (8,2) | (8,5), barrels (7,5) (9,5); office barrels (7,1) (8,1) (ids unchanged) |
| storeroom | guards `a` (9,4), `b` (3,4); heavy `d` (12,6); shelves S (3,2) (3,5) (7,5) (11,5) | `a` (11,4), `b` (3,4); `d` (11,7); shelves (3,2) (2,5) (12,5) |
| rail yard | switch (2,8); guard `b` (12,6); heavy `d` (12,8) | switch (3,8); `b` (13,6); `d` (11,8) |
| vault | shelves (3,5) (9,5); closet rect [12,4,13,5], door 4 (11,4) | shelves (5,4) (11,4); closet [13,4,13,5], door 4 (12,5) |
| compact | marked crate (1,5) (`cargo-2`) | (3,3) (`cargo-1`; the old (10,3) crate is now `cargo-2`) |

Test helpers updated: `tests/raid-slice.test.ts` and `tests/app/campaign-slice-real-raid.test.ts` walk to the switch at (12,7); `tests/raid-belts.test.ts` uses x 13; `tests/raid-cargo.test.ts` and `tests/raid-flow.test.ts` use the new tiles; `tests/assistRig.ts` takes an optional ready-made `state`. `e2e/campaign-expansion-smoke.spec.ts` needed no change: it finds a marked crate with two free tiles in a line by searching the state ((9,7)-(10,7) east of the middle crate).
