/**
 * The registry of campaign areas (docs/CAMPAIGN_WORLD.md; the types are `areas.ts`). One entry per area, district by
 * district; `sectors.ts` registers each area's play area as a sector, `tests/campaign-world.test.ts` checks every area
 * against its board and its missions.
 */
import type { CampaignAreaDef } from './areas';

export const CAMPAIGN_AREA_DEFS: readonly CampaignAreaDef[] = [];

export const CAMPAIGN_AREAS: Readonly<Record<string, CampaignAreaDef>> = Object.fromEntries(
  CAMPAIGN_AREA_DEFS.map((a) => [a.id, a]),
);

/** The campaign area drawn on this arena, or null (every non-campaign arena). */
export function campaignAreaOfArena(arenaId: string): CampaignAreaDef | null {
  return CAMPAIGN_AREA_DEFS.find((a) => a.arenaId === arenaId) ?? null;
}
