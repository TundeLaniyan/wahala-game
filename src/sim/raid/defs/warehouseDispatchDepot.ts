/**
 * THE VERTICAL SLICE: the Oshodi dispatch depot (docs/CLASSIC_RAIDS.md). Destroy the 3 marked dispatch crates:
 * two in the hall (each behind crates and pillars), the third in the north bay, locked until the depot guards are
 * down. A conveyor carries shipments down the east lane (the way to the exit). Two optional rooms: the Armour locker
 * (north-west, opens when the lock-box crate in the hall is blasted) and the first-aid cupboard (south, opens when the
 * floor switch in the belt lane is stepped on). The second wave (two throwers and a lieutenant) arrives when the first
 * crate goes. The exit (south-east) opens when the third crate is down.
 *
 *      01234567890123456
 *    0 #################
 *    1 #A..#..x..xK#.M.#     A Armour plate (room 1)   K lock-box crate   M marked crates (cargo-0..2 in reading order)
 *    2 #...1.......2...#     1 Armour-locker door   2 bay door
 *    3 #...#.#.#.#.#...#
 *    4 #####.......#####
 *    5 #.....xa...b#dv.#     a b c  depot guards (wave 1)   d e  throwers   f  lieutenant (wave 2)
 *    6 #.....#.#.#.#.v.#     v conveyor belt (east lane, shipments slide south)
 *    7 #......xMx....v.#
 *    8 #.....#.#.#.#*v.#     * floor switch
 *    9 #....e..xMxc..v.#
 *   10 #...#..f.######.#
 *   11 #@..#....3.H.#.E#     3 first-aid door   H heal segment   @ entrance   E exit
 *   12 #################
 */
import type { RaidDef } from '../def';

export const WAREHOUSE_DISPATCH_DEPOT: RaidDef = {
  id: 'warehouseDispatchDepot',
  arenaId: 'raidWarehouseDispatchDepot',
  name: 'Dispatch Depot',
  district: 'Oshodi',
  blurb: 'A cramped Oshodi warehouse where the dispatch crates are sorted before they go out on the belts.',
  objective: 'Destroy the 3 marked dispatch crates',
  factionId: 'oritaWardens',
  layout: [
    '#################',
    '#A..#..x..xK#.M.#',
    '#...1.......2...#',
    '#...#.#.#.#.#...#',
    '#####.......#####',
    '#.....xa...b#dv.#',
    '#.....#.#.#.#.v.#',
    '#......xMx....v.#',
    '#.....#.#.#.#*v.#',
    '#....e..xMxc..v.#',
    '#...#..f.######.#',
    '#@..#....3.H.#.E#',
    '#################',
  ],
  legend: { markedHp: 2, cargoHp: 1, crateHp: 2, barrelHp: 1 },
  waves: [
    {
      name: 'Depot guards',
      trigger: { kind: 'start' },
      enemies: [
        { kind: 'guard', spot: 'a', name: 'Depot Guard' },
        { kind: 'guard', spot: 'b', name: 'Depot Guard' },
        { kind: 'guard', spot: 'c', name: 'Depot Guard' },
      ],
    },
    {
      name: 'Throwers and the lieutenant',
      trigger: { kind: 'cargoDestroyed', count: 1 },
      enemies: [
        { kind: 'thrower', spot: 'd', name: 'Bottle Boy' },
        { kind: 'thrower', spot: 'e', name: 'Bottle Boy' },
        { kind: 'lieutenant', spot: 'f', name: 'Shift Lead' },
      ],
    },
  ],
  doors: [
    {
      glyph: '1',
      id: 'armourDoor',
      opensWhen: { kind: 'destroyed', id: 'goods-0' },
      hint: 'Blast the lock-box crate',
    },
    {
      glyph: '2',
      id: 'bayDoor',
      opensWhen: { kind: 'waveCleared', wave: 0 },
      hint: 'Clear the depot guards',
    },
    {
      glyph: '3',
      id: 'firstAidDoor',
      opensWhen: { kind: 'switch', index: 0 },
      hint: 'Step on the floor switch',
    },
  ],
  rooms: [
    { id: 'armourLocker', name: 'Armour locker', door: 'armourDoor', rect: [1, 1, 3, 3] },
    { id: 'firstAid', name: 'First-aid cupboard', door: 'firstAidDoor', rect: [10, 11, 12, 11] },
  ],
  conveyors: [
    {
      stepTicks: 24,
      shipments: { firstTick: 600, everyTicks: 420, warnTicks: 90, damage: 1, dazeTicks: 30, maxLive: 1 },
    },
  ],
  lives: 3,
  humanMaxHp: 4,
  timeLimitSec: 240,
  parSec: 150,
  bombs: { range: 2, capacity: 2 },
};
