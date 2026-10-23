import type { ArenaSet } from './common';
import { BUS_PARK_SET } from './busPark';
import { MARKET_SET } from './market';
import { ROADWORKS_SET } from './roadworks';

export type { ArenaSet, SetContext } from './common';

/** The surroundings of each arena (presentation only; the grid itself is src/sim/arenas). */
const SETS: Record<string, ArenaSet> = {
  danfoBusPark: BUS_PARK_SET,
  balogunMarket: MARKET_SET,
  lekkiRoadworks: ROADWORKS_SET,
};

export function arenaSet(arenaId: string): ArenaSet {
  return SETS[arenaId] ?? BUS_PARK_SET;
}
