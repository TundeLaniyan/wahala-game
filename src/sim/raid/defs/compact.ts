/**
 * The compact raid TEMPLATE (docs/CLASSIC_RAIDS.md, "How to add a raid"): a 13 x 9 board that any district can reuse
 * with a few parameters, so every `RaidId` has a playable raid without a hand-drawn layout. Two waves of two, three
 * marked crates (one in a sealed corner behind a door, two in the lanes; every enemy spot is joined to the entrance by
 * open floor, docs/CLASSIC_GRID.md), optional barrels, an optional short conveyor
 * with shipments in the entrance lane, and a corner door that opens by a floor switch or when the first wave is down.
 *
 *      0123456789012
 *    0 #############
 *    1 #..c..x.1.M.#     c d  second-wave spots   a b  first-wave spots   1 corner door   * floor switch (optional)
 *    2 #.#.#.#.#####
 *    3 #..M..a.x.M*#
 *    4 #.#.#.#.#.#.#
 *    5 #...x...b.xd#
 *    6 #.#.#.#.#.#.#
 *    7 #@..x...x..E#     the optional belt is three '>' tiles at x 5-7
 *    8 #############
 */
import type { EnemyKind, RaidId } from '../../campaign/types';
import type { RaidDef } from '../def';

const BASE: readonly string[] = [
  '#############',
  '#..c..x.1.M.#',
  '#.#.#.#.#####',
  '#..M..a.x.M*#',
  '#.#.#.#.#.#.#',
  '#...x...b.xd#',
  '#.#.#.#.#.#.#',
  '#@..x...x..E#',
  '#############',
];

export interface CompactRaidOptions {
  id: RaidId;
  arenaId: string;
  name: string;
  district: string;
  blurb: string;
  objective: string;
  factionId: string;
  /** Tiles (x, y) that hold a barrel instead of what the template has there ('.' or 'x'). */
  barrels: [number, number][];
  /** The corner door opens when the floor switch is stepped on (else when the first wave is down). */
  switchDoor: boolean;
  /** A three-tile conveyor with shipments in the entrance lane. */
  belt: boolean;
  firstWave: [EnemyKind, EnemyKind];
  secondWave: [EnemyKind, EnemyKind];
  timeLimitSec: number;
  parSec: number;
}

function layoutFor(o: CompactRaidOptions): string[] {
  const grid = BASE.map((r) => r.split(''));
  const set = (x: number, y: number, c: string, allowed: string): void => {
    const was = grid[y]![x]!;
    if (!allowed.includes(was)) throw new Error(`${o.id}: cannot put ${c} on ${was} at ${x},${y}`);
    grid[y]![x] = c;
  };
  for (const [x, y] of o.barrels) set(x, y, 'B', '.x');
  if (!o.switchDoor) set(11, 3, '.', '*');
  if (o.belt) for (const x of [5, 6, 7]) set(x, 7, '>', '.');
  return grid.map((r) => r.join(''));
}

export function compactRaid(o: CompactRaidOptions): RaidDef {
  const name = (kind: EnemyKind): string =>
    ({
      agbero: 'Agbero',
      guard: 'Guard',
      thrower: 'Thrower',
      heavy: 'Heavy',
      lieutenant: 'Lieutenant',
      boss: 'Boss',
    })[kind];
  return {
    id: o.id,
    arenaId: o.arenaId,
    name: o.name,
    district: o.district,
    blurb: o.blurb,
    objective: o.objective,
    factionId: o.factionId,
    layout: layoutFor(o),
    legend: { markedHp: 2, cargoHp: 1, crateHp: 2, barrelHp: 1 },
    waves: [
      {
        name: 'First watch',
        trigger: { kind: 'start' },
        enemies: [
          { kind: o.firstWave[0], spot: 'a', name: name(o.firstWave[0]) },
          { kind: o.firstWave[1], spot: 'b', name: name(o.firstWave[1]) },
        ],
      },
      {
        name: 'Reinforcements',
        trigger: { kind: 'cargoDestroyed', count: 2 },
        enemies: [
          { kind: o.secondWave[0], spot: 'c', name: name(o.secondWave[0]) },
          { kind: o.secondWave[1], spot: 'd', name: name(o.secondWave[1]) },
        ],
      },
    ],
    doors: [
      o.switchDoor
        ? {
            glyph: '1',
            id: 'cornerDoor',
            opensWhen: { kind: 'switch', index: 0 },
            hint: 'Step on the floor switch',
          }
        : {
            glyph: '1',
            id: 'cornerDoor',
            opensWhen: { kind: 'waveCleared', wave: 0 },
            hint: 'Clear the first watch',
          },
    ],
    rooms: [],
    conveyors: o.belt
      ? [
          {
            stepTicks: 20,
            shipments: {
              firstTick: 420,
              everyTicks: 300,
              warnTicks: 90,
              damage: 1,
              dazeTicks: 30,
              maxLive: 1,
            },
          },
        ]
      : [],
    lives: 3,
    humanMaxHp: 4,
    timeLimitSec: o.timeLimitSec,
    parSec: o.parSec,
    bombs: { range: 2, capacity: 2 },
  };
}
