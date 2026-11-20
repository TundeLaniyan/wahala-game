/**
 * LEKKI PHASE 1's letters for campaign boards (docs/CAMPAIGN_WORLD.md "Lekki Phase 1", decision WL1): the City Rumble Lekki
 * `CoverLegend` (`rumbleLekki.ts`, unchanged) plus one campaign-only object the Rumble map never needed, the estate's
 * electrical substation ('T': a fenced transformer pad, drawn by `render/arenas/campaign/lekkiCampaign.ts`). The community
 * campaign kit takes it as is (`communityLegend(LEKKI_CAMPAIGN_LEGEND)`, `board.cover(LEKKI_CAMPAIGN_LEGEND)`).
 *
 *   B building   G glass block   S shop      V compound wall   R villa     K kiosk / gatehouse booth
 *   A arts shed  H hoarding      P palm      F fuel canopy     L lock-up   M stall   C club frontage
 *   T substation (campaign only)
 */
import type { CoverLegend } from '../community/painter';
import { LEKKI_LEGEND } from '../rumbleLekki';

export const LEKKI_CAMPAIGN_LEGEND: CoverLegend = {
  ...LEKKI_LEGEND,
  T: { kind: 'substation', maxRun: 4 },
};
