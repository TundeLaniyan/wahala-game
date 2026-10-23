import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, line, makeLayout, trapRows } from './build';

/**
 * Oshodi Interchange: a junction under the flyovers. Two road rows (2 and 8) and two road columns
 * (4 and 10) cross the arena with no crates on them; under the flyover in the middle the pillars are
 * replaced by two wide piers.
 *
 * Stage: traffic. Buses and kekes cross a whole road lane at speed, one lane at a time, each telegraphed
 * 2 s ahead (flashing lane, horn). Anyone on the lane when the vehicle reaches them is out (Okada
 * absorbs); generators on the lane are set off.
 */
const ROAD_ROWS = [2, 8];
const ROAD_COLS = [4, 10];
const roads = [
  ...ROAD_ROWS.flatMap((y) => line([0, y], [14, y])),
  ...ROAD_COLS.flatMap((x) => line([x, 0], [x, 10])),
];

export const OSHODI_INTERCHANGE: ArenaDef = {
  id: 'oshodiInterchange',
  name: 'Oshodi Interchange',
  kind: 'standard',
  layout: makeLayout({
    removeHard: [[5, 5], [7, 5], [9, 5]],
    addHard: [[6, 5], [8, 5]],
    roads,
  }),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  floorTraps: trapRows([[6, 0, 'o']]),
  endgameTraps: [
    trapRows([
      [2, 0, '~'],
      [6, 2, 'o'],
      [4, 4, '~'],
      [6, 3, 'o'],
    ]),
    trapRows([
      [0, 4, '~'],
      [3, 2, 'o'],
      [6, 4, '~'],
    ]),
  ],
  stageHazards: [
    {
      kind: 'sweep',
      style: 'traffic',
      routes: [line([0, 2], [14, 2]), line([14, 8], [0, 8]), line([4, 0], [4, 10]), line([10, 10], [10, 0])],
      stepTicks: 5,
      firstAtSec: 8,
      everySec: [6, 10],
      warnSec: 2,
    },
  ],
  info: {
    tagline: 'Chaos under the Oshodi flyovers: buses, kekes and hawkers in the traffic haze.',
    lighting: 'Bright late morning, traffic haze',
    hazards: [
      'Buses and kekes cross the marked road lanes - the lane flashes 2 s before. Off the road!',
      'A generator on the road is set off by the traffic.',
    ],
  },
};
