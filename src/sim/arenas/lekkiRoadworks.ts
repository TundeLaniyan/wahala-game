import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, makeLayout, trapRows } from './build';

/**
 * Lekki Roadworks: a night-shift construction site on the classic grid, with potholes (a stumble)
 * and oil / hydraulic-fluid slicks (a slide) dug into the open lanes. 'o' = pothole, '~' = oil.
 *
 * Stage: the crane drops debris. A rival's tile (only when they have a free tile to step to) is marked
 * 1.6 s ahead; whoever is on it when it lands is out (an Okada absorbs it).
 */
export const LEKKI_ROADWORKS: ArenaDef = {
  id: 'lekkiRoadworks',
  name: 'Lekki Roadworks',
  kind: 'standard',
  layout: makeLayout(),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  floorTraps: trapRows([
    [6, 4, 'o'],
    [4, 2, 'o'],
    [2, 5, '~'],
    [7, 2, '~'],
  ]),
  endgameTraps: [
    // 0:30 - the excavators break through: trenches and hydraulic-fluid leaks
    trapRows([
      [2, 3, 'o'],
      [5, 0, 'o'],
      [6, 2, '~'],
      [4, 4, '~'],
    ]),
    // 0:15 - the whole cut collapses into potholes
    trapRows([
      [0, 4, 'o'],
      [3, 2, 'o'],
      [6, 5, '~'],
    ]),
  ],
  stageHazards: [
    {
      kind: 'strike',
      style: 'debris',
      zones: [],
      targetPlayers: true,
      activeSec: 0.25,
      firstAtSec: 15,
      everySec: [10, 15],
      warnSec: 1.6,
    },
  ],
  info: {
    tagline: 'Night shift on the Lekki expressway: excavators, cranes and floodlights.',
    lighting: 'Night - industrial floodlights',
    hazards: [
      'Crane debris falls on a marked tile 1.6 s after the warning - step off it.',
      'Potholes trip you, hydraulic-fluid slicks slide you.',
    ],
  },
};
