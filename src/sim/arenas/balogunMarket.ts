import { DANFO_BUS_PARK } from './danfoBusPark';
import type { ArenaDef } from './types';
import { mirroredTraps } from './traps';

/**
 * Balogun Market: the dense Lagos Island open-air textile and street-food market.
 * Preserves the 15x11 competitive grid, 4-fold mirror symmetry, vehicle lanes, and spawn clearances.
 */
export const BALOGUN_MARKET: ArenaDef = {
  ...DANFO_BUS_PARK,
  id: 'balogunMarket',
  name: 'Balogun Market',
  // Spilled palm oil between the stalls, a sunken drain cover.
  hazardLayout: mirroredTraps([
    [4, 2, '~'],
    [7, 4, 'o'],
  ]),
  endgameTraps: [
    // 0:30 - traders' oil drums tip over, broken paving opens up
    mirroredTraps([
      [2, 4, '~'],
      [6, 0, '~'],
      [5, 2, 'o'],
      [4, 5, 'o'],
    ]),
    // 0:15 - palm oil everywhere
    mirroredTraps([
      [6, 4, '~'],
      [3, 0, '~'],
      [0, 3, 'o'],
    ]),
  ],
};
