/**
 * Mushin parts storeroom (docs/CLASSIC_RAIDS.md): shelves, barrels and chain explosions. Destroy the 3 marked parts
 * stacks: one hemmed in by two barrels in the middle aisle (blow a barrel and its blast hits the stack), one behind
 * shelves in the south-west, one in the office, which opens once two stacks are down. Guards stand in the aisles;
 * when the office opens the second wave (a thrower and a heavy) comes out. A first-aid cupboard (south-east) opens
 * once the guards are down.
 *
 *      012345678901234
 *    0 ###############
 *    1 #.....2.B...M.#     2 office door   B barrel   M marked parts stack
 *    2 #.#S#.#.B.....#     S shelf (sturdy crate)
 *    3 #.....#########
 *    4 #..b.....a....#     a b guards (wave 1)
 *    5 #.#S#.#S#.#S#.#
 *    6 #......BMB..d.#     c thrower, d heavy (wave 2)
 *    7 #.#.#.#.#.#.#.#
 *    8 #.xMx......####
 *    9 #@...E.c...3.H#     3 cupboard door   H heal segment   @ entrance   E exit
 *   10 ###############
 */
import type { RaidDef } from '../def';

export const PARTS_STOREROOM: RaidDef = {
  id: 'partsStoreroom',
  arenaId: 'raidPartsStoreroom',
  name: 'Parts Storeroom',
  district: 'Mushin',
  blurb: 'Spare-parts shelves, oil drums and a back office: one spark and the whole aisle goes up.',
  objective: 'Destroy the 3 marked parts stacks',
  factionId: 'sparehandRunners',
  layout: [
    '###############',
    '#.....2.B...M.#',
    '#.#S#.#.B.....#',
    '#.....#########',
    '#..b.....a....#',
    '#.#S#.#S#.#S#.#',
    '#......BMB..d.#',
    '#.#.#.#.#.#.#.#',
    '#.xMx......####',
    '#@...E.c...3.H#',
    '###############',
  ],
  legend: { markedHp: 2, cargoHp: 1, crateHp: 2, barrelHp: 1 },
  waves: [
    {
      name: 'Aisle guards',
      trigger: { kind: 'start' },
      enemies: [
        { kind: 'guard', spot: 'a', name: 'Shelf Guard' },
        { kind: 'guard', spot: 'b', name: 'Shelf Guard' },
      ],
    },
    {
      name: 'The back office',
      trigger: { kind: 'doorOpened', door: 'officeDoor' },
      enemies: [
        { kind: 'thrower', spot: 'c', name: 'Spanner Thrower' },
        { kind: 'heavy', spot: 'd', name: 'Drum Lifter' },
      ],
    },
  ],
  doors: [
    {
      glyph: '2',
      id: 'officeDoor',
      opensWhen: { kind: 'cargoDestroyed', count: 2 },
      hint: 'Destroy two parts stacks',
    },
    {
      glyph: '3',
      id: 'cupboardDoor',
      opensWhen: { kind: 'waveCleared', wave: 0 },
      hint: 'Clear the aisle guards',
    },
  ],
  rooms: [{ id: 'cupboard', name: 'First-aid cupboard', door: 'cupboardDoor', rect: [12, 9, 13, 9] }],
  conveyors: [],
  lives: 3,
  humanMaxHp: 4,
  timeLimitSec: 210,
  parSec: 140,
  bombs: { range: 2, capacity: 2 },
};
