import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, inAndOut, makeLayout, mirror4, trapRows } from './build';

/**
 * Danfo Bus Park: 15 x 11 playable tiles. Concrete pillars sit on every odd/odd tile so each even
 * row and even column is a clear lane (the lanes vehicles can use). Soft blocks are filled in with
 * 4-fold mirror symmetry so every spawn faces the same layout.
 *
 * Stage: the side-street bays. A Danfo noses into the arena along row 4 or 6 from the east or west
 * street, four tiles deep, then reverses out (telegraphed 2 s). The bay tiles are road: never crates.
 * Engine-oil stains and broken tarmac by the shelters are permanent floor traps.
 */
const BAYS = [
  inAndOut([0, 4], [3, 4]),
  inAndOut([0, 6], [3, 6]),
  inAndOut([14, 4], [11, 4]),
  inAndOut([14, 6], [11, 6]),
];

export const DANFO_BUS_PARK: ArenaDef = {
  id: 'danfoBusPark',
  name: 'Danfo Bus Park',
  kind: 'standard',
  layout: makeLayout({ roads: mirror4([[0, 4], [1, 4], [2, 4], [3, 4]]) }),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  floorTraps: trapRows([
    [5, 2, '~'],
    [6, 4, 'o'],
  ]),
  endgameTraps: [
    // 0:30 - spilled diesel spreads across the bays, the worn tarmac gives way
    trapRows([
      [4, 0, '~'],
      [6, 4, '~'],
      [2, 3, 'o'],
      [7, 2, 'o'],
    ]),
    // 0:15 - the whole lot is slick
    trapRows([
      [4, 4, '~'],
      [0, 4, 'o'],
      [6, 1, '~'],
    ]),
  ],
  stageHazards: [
    { kind: 'sweep', style: 'danfo', routes: BAYS, stepTicks: 9, firstAtSec: 12, everySec: [13, 19], warnSec: 2 },
  ],
  info: {
    tagline: 'A rough Lagos transport terminal: conductors, traders and exhaust smoke.',
    lighting: 'Warm late afternoon',
    hazards: [
      'Danfos pull into the side bays (rows beside the middle) and reverse out - flashing lane and horn 2 s before.',
      'Oil stains slide you, broken tarmac trips you.',
    ],
  },
};
