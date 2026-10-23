import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, line, makeLayout, mirror4, trapRows } from './build';

/**
 * Lagos Lagoon Jetty: a waterfront loading jetty with water along the north and south edges. Mooring
 * bollards stand in the second lane in from each corner (instead of the pillar beside it), so the
 * waterline rows are long and open while the planks behind them are cut into short runs.
 *
 * Stage: wet planks (slippery: a one-tile slide) and lagoon wash. A wave is telegraphed along the north
 * or south waterline; when it breaks, everyone on that edge row slides one tile inland and generators
 * there are doused into duds (they still go off from fire or vehicles).
 */
export const LAGOON_JETTY: ArenaDef = {
  id: 'lagoonJetty',
  name: 'Lagos Lagoon Jetty',
  kind: 'standard',
  layout: makeLayout({
    removeHard: mirror4([[3, 1]]),
    addHard: mirror4([[3, 2]]),
  }),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  config: { hazards: { oilSlideTiles: 1 } },
  floorTraps: trapRows([
    [5, 0, '~'],
    [4, 4, '~'],
    [7, 2, '~'],
  ]),
  endgameTraps: [
    trapRows([
      [2, 4, '~'],
      [6, 0, '~'],
      [5, 2, 'o'],
      [6, 4, 'o'],
    ]),
    trapRows([
      [0, 4, '~'],
      [3, 0, 'o'],
      [6, 2, '~'],
    ]),
  ],
  stageHazards: [
    {
      kind: 'push',
      style: 'wash',
      douse: true,
      zones: [
        { tiles: line([0, 0], [14, 0]), dir: 'down' },
        { tiles: line([0, 10], [14, 10]), dir: 'up' },
      ],
      firstAtSec: 12,
      everySec: [11, 16],
      warnSec: 2,
    },
  ],
  info: {
    tagline: 'Misty waterfront: canoes, cargo, rusting containers and wet planks.',
    lighting: 'Misty sunrise',
    hazards: [
      'Wet planks: you slide one extra tile.',
      'Lagoon wash: a marked waterline row floods - it pushes you a tile inland and soaks generators into duds.',
    ],
  },
};
