/**
 * FADEYI/SOMOLU's campaign letter kit (docs/CAMPAIGN_WORLD.md "Fadeyi/Somolu", decision WF1): the City Rumble Fadeyi's own
 * `CoverLegend` (`FADEYI_LEGEND`, unchanged) plus the one community piece its Ring-controlled facilities need that the
 * compact highway board never drew:
 *
 *   B building   S shop   L lock-up   M stall   K kiosk / toll booth   W workshop / garage   R house   C BRT shelter
 *   D median barrier (jersey barrier: the access-control lines)   T bank frontage   V compound wall
 *   H warehouse  (the vehicle pound's sheds, the yard's stores: the community `warehouse` family)
 *
 * A campaign board paints its rows with these letters on the community `Board`; `fadeyiCampaignArena` hands them to the
 * campaign kit with the district's cover (`Board.cover`), checked letter for letter at import. Pure data.
 */
import { Board } from '../community/painter';
import type { CoverLegend } from '../community/painter';
import { FADEYI_LEGEND } from '../rumbleFadeyi';
import { campaignArena, communityLegend } from './kit';
import type { CampaignBoardSpec } from './kit';
import type { ArenaDef } from '../types';

export const FADEYI_CAMPAIGN_LEGEND: CoverLegend = {
  ...FADEYI_LEGEND,
  H: { kind: 'warehouse', maxRun: 6 },
};

/** The community board of painted rows (north first; every row the same width). */
export function fadeyiBoard(rows: readonly string[]): Board {
  const b = new Board(rows[0]!.length, rows.length);
  b.stamp(0, 0, rows);
  return b;
}

/** A Fadeyi/Somolu campaign arena from its painted rows (the community kit: `campaignArena` with the district's cover). */
export function fadeyiCampaignArena(spec: Omit<CampaignBoardSpec, 'legend' | 'cover'>): ArenaDef {
  const b = fadeyiBoard(spec.rows);
  return campaignArena({
    ...spec,
    rows: b.rows(),
    legend: communityLegend(FADEYI_CAMPAIGN_LEGEND),
    cover: b.cover(FADEYI_CAMPAIGN_LEGEND),
  });
}
