import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, line, makeLayout, trapRows } from './build';

/**
 * Third Mainland Checkpoint: an elevated bridge corridor. The middle row is the open carriageway (no
 * pillars, no crates) through a checkpoint; the rest is the classic grid of barrier pillars.
 *
 * Stage: wind and traffic. Gusts off the lagoon are telegraphed (flags, arrows) and slide every player
 * one tile east or west; a car occasionally rushes through the checkpoint lane (telegraphed 2 s).
 */
const CARRIAGEWAY = line([0, 5], [14, 5]);
const EVERYWHERE: [number, number][] = [];
for (let y = 0; y < 11; y++) for (let x = 0; x < 15; x++) EVERYWHERE.push([x, y]);

export const THIRD_MAINLAND: ArenaDef = {
  id: 'thirdMainland',
  name: 'Third Mainland Checkpoint',
  kind: 'standard',
  layout: makeLayout({ pillar: (x, y) => x % 2 === 1 && y % 2 === 1 && y !== 5, roads: CARRIAGEWAY }),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  endgameTraps: [
    trapRows([
      [2, 2, '~'],
      [6, 0, 'o'],
      [4, 4, '~'],
      [7, 2, 'o'],
    ]),
    trapRows([
      [0, 4, 'o'],
      [5, 2, '~'],
      [3, 0, '~'],
    ]),
  ],
  stageHazards: [
    {
      kind: 'push',
      style: 'gust',
      zones: [
        { tiles: EVERYWHERE, dir: 'right' },
        { tiles: EVERYWHERE, dir: 'left' },
      ],
      firstAtSec: 14,
      everySec: [12, 17],
      warnSec: 1.8,
    },
    {
      kind: 'sweep',
      style: 'checkpoint',
      routes: [CARRIAGEWAY, [...CARRIAGEWAY].reverse()],
      stepTicks: 5,
      firstAtSec: 22,
      everySec: [15, 22],
      warnSec: 2,
    },
  ],
  info: {
    tagline: 'Golden hour on the Third Mainland Bridge: guardrails, lagoon and skyline.',
    lighting: 'Sunset / golden hour',
    hazards: [
      'Gusts: arrows show the wind 1.8 s ahead, then everyone slides one tile that way.',
      'A car rushes through the middle checkpoint lane - it flashes 2 s before.',
    ],
  },
};
