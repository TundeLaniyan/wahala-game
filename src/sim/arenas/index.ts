import { DANFO_BUS_PARK } from './danfoBusPark';
import type { ArenaDef } from './types';

export type { ArenaDef } from './types';

export const ARENAS: Readonly<Record<string, ArenaDef>> = {
  [DANFO_BUS_PARK.id]: DANFO_BUS_PARK,
};

export const DEFAULT_ARENA_ID = DANFO_BUS_PARK.id;

export function getArena(id: string): ArenaDef {
  const arena = ARENAS[id];
  if (!arena) throw new Error(`Unknown arena "${id}"`);
  return arena;
}
