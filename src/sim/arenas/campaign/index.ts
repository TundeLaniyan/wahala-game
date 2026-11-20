/**
 * The campaign-only arenas (docs/CAMPAIGN_WORLD.md, decision WX1): each field mission's own painted board. Never in `ARENAS`:
 * no menu, picker, preview, City Rumble / Classic / Team list or multiplayer test sees them; `getArena` finds them by id.
 */
import type { ArenaDef } from '../types';
import { CAMPAIGN_OSHODI_ORITA } from './oshodiOrita';
import { CAMPAIGN_OSHODI_RAILSIDE } from './oshodiRailside';
import { CAMPAIGN_MUSHIN_PARTS_ROW } from './mushinPartsRow';

export const CAMPAIGN_ARENAS: Readonly<Record<string, ArenaDef>> = Object.fromEntries(
  [CAMPAIGN_OSHODI_ORITA, CAMPAIGN_OSHODI_RAILSIDE, CAMPAIGN_MUSHIN_PARTS_ROW].map((a) => [a.id, a]),
);

export const CAMPAIGN_ARENA_IDS: readonly string[] = Object.keys(CAMPAIGN_ARENAS);
