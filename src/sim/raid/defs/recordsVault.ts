/**
 * Island records vault (docs/CLASSIC_RAIDS.md): tight rooms and a sequence of doors. Four chambers stacked south to
 * north, each behind a door: the entrance hall (door 1 opens when its two guards are down) -> the registry (door 2
 * opens when its marked cabinet is destroyed; the archive guards and their lieutenant appear) -> the archive (door 3
 * opens when the lieutenant is down) -> the vault with two marked cabinets and two barrels. A small Armour closet
 * hides in the archive (its door opens when the jammed shelf is destroyed). The exit is in the entrance hall.
 *
 *      012345678901234
 *    0 ###############
 *    1 #....BM.MB....#     the vault: M marked cabinets, B barrels
 *    2 #.#.#.#.#.#.#.#
 *    3 #######3#######     3 vault door
 *    4 #..h...g.i.4.A#     the archive: h i guards, g lieutenant; 4 closet door; A Armour plate
 *    5 #.#S#.#.#S#.#.#     S shelves
 *    6 #######2#######     2 archive door
 *    7 #....M.....x..#     the registry
 *    8 #.#.#.#.#.#.#.#
 *    9 #######1#######     1 registry door
 *   10 #.............#
 *   11 #@..a.....b..E#     a b guards   @ entrance   E exit
 *   12 ###############
 */
import type { RaidDef } from '../def';

export const RECORDS_VAULT: RaidDef = {
  id: 'recordsVault',
  arenaId: 'raidRecordsVault',
  name: 'Records Vault',
  district: 'Lagos Island',
  blurb:
    'A government records vault: four locked chambers, one corridor of doors, and every file someone wants gone.',
  objective: 'Destroy the 3 marked record cabinets',
  factionId: 'ledgerBureau',
  layout: [
    '###############',
    '#....BM.MB....#',
    '#.#.#.#.#.#.#.#',
    '#######3#######',
    '#..h...g.i.4.A#',
    '#.#S#.#.#S#.#.#',
    '#######2#######',
    '#....M.....x..#',
    '#.#.#.#.#.#.#.#',
    '#######1#######',
    '#.............#',
    '#@..a.....b..E#',
    '###############',
  ],
  legend: { markedHp: 2, cargoHp: 1, crateHp: 2, barrelHp: 1 },
  waves: [
    {
      name: 'Hall guards',
      trigger: { kind: 'start' },
      enemies: [
        { kind: 'guard', spot: 'a', name: 'Door Warden' },
        { kind: 'guard', spot: 'b', name: 'Door Warden' },
      ],
    },
    {
      name: 'Archive guards and their lieutenant',
      trigger: { kind: 'doorOpened', door: 'archiveDoor' },
      enemies: [
        { kind: 'guard', spot: 'h', name: 'Archive Guard' },
        { kind: 'lieutenant', spot: 'g', name: 'Chief Clerk' },
        { kind: 'thrower', spot: 'i', name: 'File Thrower' },
      ],
    },
  ],
  doors: [
    {
      glyph: '1',
      id: 'registryDoor',
      opensWhen: { kind: 'waveCleared', wave: 0 },
      hint: 'Clear the hall guards',
    },
    {
      glyph: '2',
      id: 'archiveDoor',
      opensWhen: { kind: 'cargoDestroyed', count: 1 },
      hint: 'Destroy the registry cabinet',
    },
    { glyph: '3', id: 'vaultDoor', opensWhen: { kind: 'lieutenantDown' }, hint: 'Take down the Chief Clerk' },
    {
      glyph: '4',
      id: 'closetDoor',
      opensWhen: { kind: 'destroyed', id: 'crate-1' },
      hint: 'Blast the jammed shelf',
    },
  ],
  rooms: [{ id: 'armourCloset', name: 'Armour closet', door: 'closetDoor', rect: [12, 4, 13, 5] }],
  conveyors: [],
  lives: 3,
  humanMaxHp: 4,
  timeLimitSec: 270,
  parSec: 180,
  bombs: { range: 2, capacity: 2 },
};
