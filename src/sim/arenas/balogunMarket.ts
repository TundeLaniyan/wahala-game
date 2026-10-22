import { DANFO_BUS_PARK } from './danfoBusPark';
import type { ArenaDef } from './types';

/**
 * Balogun Market: the dense Lagos Island open-air textile and street-food market.
 * Preserves the 15x11 competitive grid, 4-fold mirror symmetry, vehicle lanes, and spawn clearances.
 */
export const BALOGUN_MARKET: ArenaDef = {
  ...DANFO_BUS_PARK,
  id: 'balogunMarket',
  name: 'Balogun Market',
};
