import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, CORNER_SPAWNS, makeLayout, mirror4, trapRows } from './build';

/**
 * Balogun Market: dense trading lanes. Stall counters join pairs of pillars into short walls on rows 3
 * and 7, so the market is a maze of narrow aisles rather than an open grid; the centre stays a
 * crowded square.
 *
 * Stage: goods tumble off the stalls - two new crates/sacks land on open floor away from every player
 * (telegraphed), so the market keeps re-cluttering itself. Spilled palm oil and a sunken drain cover
 * are permanent floor traps.
 */
export const BALOGUN_MARKET: ArenaDef = {
  id: 'balogunMarket',
  name: 'Balogun Market',
  kind: 'standard',
  layout: makeLayout({ addHard: mirror4([[2, 3], [6, 1]]) }),
  spawns: CORNER_SPAWNS,
  spawnClearance: CORNER_CLEARANCE,
  mirrorSoftBlocks: true,
  maxPlayers: 4,
  floorTraps: trapRows([
    [4, 2, '~'],
    [7, 4, 'o'],
  ]),
  endgameTraps: [
    // 0:30 - traders' oil drums tip over, broken paving opens up
    trapRows([
      [2, 4, '~'],
      [6, 0, '~'],
      [5, 2, 'o'],
      [4, 5, 'o'],
    ]),
    // 0:15 - palm oil everywhere
    trapRows([
      [6, 4, '~'],
      [3, 0, '~'],
      [0, 3, 'o'],
    ]),
  ],
  stageHazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 10, everySec: [9, 13], warnSec: 1.5 }],
  info: {
    tagline: 'A dense Lagos Island market: stalls, fabric, carts and bargaining.',
    lighting: 'Bright natural daylight',
    hazards: [
      'Goods tumble off the stalls: new crates land on marked tiles (never next to a player).',
      'Palm-oil spills slide you, a sunken drain trips you.',
    ],
  },
};
