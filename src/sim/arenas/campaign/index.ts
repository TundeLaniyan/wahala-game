/**
 * The campaign-only arenas (docs/CAMPAIGN_WORLD.md, decision WX1): each field mission's own painted board. Never in `ARENAS`:
 * no menu, picker, preview, City Rumble / Classic / Team list or multiplayer test sees them; `getArena` finds them by id.
 */
import type { ArenaDef } from '../types';

export const CAMPAIGN_ARENAS: Readonly<Record<string, ArenaDef>> = Object.fromEntries(
  ([] as ArenaDef[]).map((a) => [a.id, a]),
);

export const CAMPAIGN_ARENA_IDS: readonly string[] = Object.keys(CAMPAIGN_ARENAS);
