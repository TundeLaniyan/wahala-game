import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, line, makeLayout, trapRows } from './build';

/**
 * Oshodi Interchange: a junction under the flyovers. Two carriageways (rows 4 and 6, either side of the flyover piers) cross the whole
 * arena with no crates on them; under the flyover in the middle the pillars are replaced by two wide
 * piers. (Road columns as well were tried first: bot matches fell to ~20 s; with
 * two carriageways bot matches last ~25 s - the fastest standard arena after the Power Yard, by
 * design - decision N8.)
 *
 * Stage: traffic. Buses and kekes cross a whole carriageway at speed, one at a time, each telegraphed
 * 2 s ahead (flashing lane, horn). Anyone on the lane when the vehicle reaches them is out (Okada
 * absorbs); generators on the lane are set off.
 */
const ROAD_ROWS = [4, 6];
const roads = ROAD_ROWS.flatMap((y) => line([0, y], [14, y]));

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
      routes: [line([0, 4], [14, 4]), line([14, 6], [0, 6]), line([14, 4], [0, 4]), line([0, 6], [14, 6])],
      stepTicks: 5,
      firstAtSec: 8,
      everySec: [5, 9],
      warnSec: 2,
    },
  ],
  info: {
    tagline: 'Chaos under the Oshodi flyovers: buses, kekes and hawkers in the traffic haze.',
    lighting: 'Bright late morning, traffic haze',
    hazards: [
      'Buses and kekes race along the two marked carriageways - the lane flashes 2 s before. Off the road!',
      'A generator on the road is set off by the traffic.',
    ],
  },
};
