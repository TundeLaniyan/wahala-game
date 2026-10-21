import { BALOGUN_MARKET } from './balogunMarket';
import { DANFO_BUS_PARK } from './danfoBusPark';
import type { ArenaDef } from './types';

export type { ArenaDef } from './types';
export { validateArena } from './validate';

/** Every playable arena. Each has its own layout and its own look (see render/themes). */
export const ARENAS: Readonly<Record<string, ArenaDef>> = {
  [DANFO_BUS_PARK.id]: DANFO_BUS_PARK,
  [BALOGUN_MARKET.id]: BALOGUN_MARKET,
};

export const DEFAULT_ARENA_ID = DANFO_BUS_PARK.id;

export function getArena(id: string): ArenaDef {
  const arena = ARENAS[id];
  if (!arena) throw new Error(`Unknown arena "${id}"`);
  return arena;
}
