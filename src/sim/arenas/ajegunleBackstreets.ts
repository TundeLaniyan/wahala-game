import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, makeLayout, mirror4, trapRows } from './build';

/**
 * Ajegunle Backstreets: tight residential lanes between compound walls. Extra wall stubs turn the open
 * grid into alleys; four connected manhole pairs link opposite sides of the neighbourhood.
 *
 * Stage: manholes. Stepping onto an open manhole drops you through to its partner (same number, both
 * glow). It only works when the far end is clear (no generator, block or fire), never twice within
 * 2.5 s, and arriving never sends you back.
 */
const MANHOLES: [[number, number], [number, number]][] = [
  [
    [2, 4],
    [12, 6],
  ],
  [
    [12, 4],
    [2, 6],
  ],
  [
    [6, 0],
    [8, 10],
  ],
  [
    [8, 0],
    [6, 10],
  ],
];

export const AJEGUNLE_BACKSTREETS: ArenaDef = {
  id: 'ajegunleBackstreets',
  name: 'Ajegunle Backstreets',
  kind: 'standard',
  layout: makeLayout({
    addHard: mirror4([
      [4, 1],
      [6, 3],
    ]),
    roads: MANHOLES.flat(),
  }),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  endgameTraps: [
    trapRows([
      [2, 2, 'o'],
      [5, 0, '~'],
      [4, 4, 'o'],
      [6, 2, '~'],
    ]),
    trapRows([
      [0, 4, 'o'],
      [3, 2, '~'],
      [4, 5, 'o'],
    ]),
  ],
  stageHazards: [{ kind: 'teleport', style: 'manhole', pairs: MANHOLES }],
  info: {
    tagline: 'Tight Ajegunle lanes: compound walls, washing lines and street football.',
    lighting: 'Overcast afternoon',
    hazards: [
      'Numbered manholes connect in pairs: step on one to pop out of its partner.',
      'They only work if the far end is clear, and rest 2.5 s after each trip.',
    ],
  },
};
