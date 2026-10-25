import type { ArenaDef } from './types';
import { inAndOut, line, trapRows } from './build';
import { RUMBLE_CLEARANCE, mirrorQuadrant, pairedSpawns, rumbleStageConfig } from './rumbleKit';

/**
 * City Rumble V2, F1 - Oshodi Rush Hour: the interchange at full daytime load (41 x 31).
 *
 * Layout intent: LONG LANES AND TRAFFIC CROSS-FIRE. Two dual carriageways run the whole width (rows 6-7
 * and 23-24, opposite directions), two dual roads the whole height (columns 10-11 and 29-30), and the
 * BRT corridor runs under the flyover along the centre row (15), between the rows of flyover piers
 * (13 and 17). The roads carve the city into nine bus-park / market blocks on the classic pillar grid,
 * and every road is a crate-free firing lane: generator blasts and vehicle attacks reach a long way,
 * so the safe ground is the blocks between the roads. In the four corner blocks a Danfo bay opens off
 * the outer edge (row 3 / 27).
 *
 * Stage: traffic (buses and kekes race a whole lane, both directions, 2 s telegraph) and Danfos
 * nosing into the corner bays and reversing out. Up to two lethal events at once on this big board.
 */
const W = 41;
const H = 31;

const QUADRANT = [
  '..........==.........',
  '.#.#.#.#.#==.#.#.#.#.',
  '..........==.........',
  '======.#.#==.#.#.#.#.',
  '..........==.........',
  '.#.#.#.#.#==.#.#.#.#.',
  '=====================',
  '=====================',
  '..........==.........',
  '.#.#.#.#.#==.#.#.###.',
  '..........==.........',
  '.#.###.#.#==.###.#.#.',
  '..........==.........',
  '.##..##...==..##...##',
  '..........==.........',
  '=====================',
];

const layout = mirrorQuadrant(QUADRANT, W, H);

export const RUMBLE_OSHODI: ArenaDef = {
  id: 'rumbleOshodi',
  name: 'Oshodi Rush Hour',
  kind: 'rumble',
  layout,
  spawns: pairedSpawns(layout, 32, { x: 4, y: H - 5 }),
  spawnClearance: RUMBLE_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 32,
  forcedMode: 'crush',
  config: rumbleStageConfig({ core: { w: 13, h: 9 }, softDensity: 0.5 }),
  floorTraps: trapRows(
    [
      [3, 6, 'o'],
      [2, 3, '~'],
      [16, 7, 'o'],
    ],
    W,
    H,
  ),
  // the mandatory endgame waves land in the core under the flyover (x 14-26, y 11-19)
  endgameTraps: [
    trapRows(
      [
        [16, 12, '~'],
        [18, 14, 'o'],
        [14, 14, 'o'],
      ],
      W,
      H,
    ),
    trapRows(
      [
        [17, 12, 'o'],
        [16, 14, '~'],
        [20, 12, '~'],
      ],
      W,
      H,
    ),
  ],
  stageHazards: [
    {
      kind: 'sweep',
      style: 'traffic',
      routes: [
        line([0, 6], [W - 1, 6]),
        line([W - 1, 7], [0, 7]),
        line([0, 23], [W - 1, 23]),
        line([W - 1, 24], [0, 24]),
        line([10, 0], [10, H - 1]),
        line([11, H - 1], [11, 0]),
        line([29, 0], [29, H - 1]),
        line([30, H - 1], [30, 0]),
        line([0, 15], [W - 1, 15]),
        line([W - 1, 15], [0, 15]),
      ],
      stepTicks: 4,
      firstAtSec: 12,
      everySec: [5, 9],
      warnSec: 2,
    },
    {
      kind: 'sweep',
      style: 'danfo',
      routes: [
        inAndOut([0, 3], [5, 3]),
        inAndOut([W - 1, 3], [W - 6, 3]),
        inAndOut([0, H - 4], [5, H - 4]),
        inAndOut([W - 1, H - 4], [W - 6, H - 4]),
      ],
      stepTicks: 6,
      firstAtSec: 20,
      everySec: [9, 14],
      warnSec: 2,
    },
  ],
  info: {
    tagline: 'The interchange at rush hour: flyovers, BRT lane, Danfos and kekes in every direction.',
    lighting: 'Bright midday, exhaust haze',
    hazards: [
      'Buses and kekes race along the marked carriageways, the BRT lane and the cross roads - the lane flashes 2 s before.',
      'Danfos nose into the corner bays and reverse out (2 s warning).',
      'From 2:00 left the outer streets fill with concrete; the square under the flyover never closes.',
    ],
  },
};
