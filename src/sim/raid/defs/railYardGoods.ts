/**
 * Ebute-Metta rail-yard goods shed (docs/CLASSIC_RAIDS.md, docs/CLASSIC_GRID.md): belts and shipments dominate. One long
 * S-shaped conveyor (east along the top, south down the east side, west along the middle) and a short one along the
 * entrance row carry shipments past the three marked goods wagons in the middle row; between the belts the floor is a
 * pillar maze (buffer stops on every (even, even) tile), so the wagon row is reached by one-tile cross aisles. A
 * star-token closet (north-west) opens with the floor switch; the exit (north-east) is behind a gate that opens when
 * the second wave (thrower and heavy, called by the second wagon) is down.
 *
 *      01234567890123456
 *    0 #################
 *    1 #Tj1.........2E.#     T star token   j closet agbero   1 closet door   2 exit gate   E exit
 *    2 #####.#a#.#.#####     a b guards   c thrower   d heavy
 *    3 #.>>>>>>>>>>>>>v#     > < v belts   (the long conveyor starts at the west end of row 3)
 *    4 #.#.#.#c#.#x#..v#     (14,4) is open: the belt corner needs a way off within two steps
 *    5 #...xMS.xM..xM.v#     M marked goods wagons   S sturdy crate
 *    6 #.#.#.#.#.#.#b#v#
 *    7 #.#<<<<<<<<<<<<<#
 *    8 #.#*#.#.#.#d#.#.#     * floor switch
 *    9 #@..>>>>>>>>>#..#     the short conveyor along the entrance row
 *   10 #################
 */
import type { RaidDef } from '../def';

export const RAIL_YARD_GOODS: RaidDef = {
  id: 'railYardGoods',
  arenaId: 'raidRailYardGoods',
  name: 'Goods Shed',
  district: 'Ebute-Metta',
  blurb:
    'A rail-yard goods shed: conveyors never stop, and the crates they carry do not care who is standing there.',
  objective: 'Destroy the 3 marked goods wagons',
  factionId: 'ironLaneSwitchmen',
  layout: [
    '#################',
    '#Tj1.........2E.#',
    '#####.#a#.#.#####',
    '#.>>>>>>>>>>>>>v#',
    '#.#.#.#c#.#x#..v#',
    '#...xMS.xM..xM.v#',
    '#.#.#.#.#.#.#b#v#',
    '#.#<<<<<<<<<<<<<#',
    '#.#*#.#.#.#d#.#.#',
    '#@..>>>>>>>>>#..#',
    '#################',
  ],
  legend: { markedHp: 2, cargoHp: 1, crateHp: 2, barrelHp: 1 },
  waves: [
    {
      name: 'Yard watch',
      trigger: { kind: 'start' },
      enemies: [
        { kind: 'guard', spot: 'a', name: 'Yard Watchman' },
        { kind: 'guard', spot: 'b', name: 'Yard Watchman' },
      ],
    },
    {
      name: 'Switchmen',
      trigger: { kind: 'cargoDestroyed', count: 2 },
      enemies: [
        { kind: 'thrower', spot: 'c', name: 'Signal Thrower' },
        { kind: 'heavy', spot: 'd', name: 'Coupler' },
      ],
    },
  ],
  doors: [
    {
      glyph: '1',
      id: 'closetDoor',
      opensWhen: { kind: 'switch', index: 0 },
      hint: 'Step on the floor switch',
    },
    { glyph: '2', id: 'exitGate', opensWhen: { kind: 'waveCleared', wave: 1 }, hint: 'Clear the switchmen' },
  ],
  rooms: [
    {
      id: 'closet',
      name: 'Ticket closet',
      door: 'closetDoor',
      rect: [1, 1, 2, 1],
      enemies: [{ kind: 'agbero', spot: 'j', name: 'Closet Agbero' }],
    },
  ],
  conveyors: [
    {
      stepTicks: 20,
      shipments: { firstTick: 480, everyTicks: 300, warnTicks: 90, damage: 1, dazeTicks: 30, maxLive: 2 },
    },
    {
      stepTicks: 14,
      shipments: { firstTick: 300, everyTicks: 240, warnTicks: 90, damage: 1, dazeTicks: 24, maxLive: 1 },
    },
  ],
  lives: 3,
  humanMaxHp: 4,
  timeLimitSec: 240,
  parSec: 160,
  bombs: { range: 2, capacity: 2 },
};
