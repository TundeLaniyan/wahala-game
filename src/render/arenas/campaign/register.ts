/**
 * Registers every campaign-only arena with its district's presentation (docs/CAMPAIGN_WORLD.md "How to add a campaign
 * area", decision WX3): the district's look and night look, its floor materials, its cover builder on the area's own letter
 * map, its environment and a set built from its set kit with the area's landmark anchors (data). A new area needs no code
 * here once its district has a kit: its painted board and its landmarks are enough.
 */
import { CAMPAIGN_ARENA_IDS, campaignAreaOfArena } from '../../../sim';
import type { CampaignAreaDef } from '../../../sim';
import type { ArenaArt } from '../newArenas';
import { OSHODI_METRO_LOOK, OSHODI_METRO_NIGHT_LOOK } from '../oshodiMetroArt';
import {
  oshodiCampaignCover,
  oshodiCampaignEnv,
  oshodiCampaignFloor,
  oshodiCampaignSet,
} from './oshodiCampaign';

/** A district's campaign kit: how its areas are drawn. */
type DistrictKit = (area: CampaignAreaDef) => ArenaArt;

const KITS: Readonly<Partial<Record<string, DistrictKit>>> = {
  oshodi: (area) => ({
    look: OSHODI_METRO_LOOK,
    nightLook: OSHODI_METRO_NIGHT_LOOK,
    set: oshodiCampaignSet(area),
    floor: oshodiCampaignFloor(area.arenaId),
    cover: oshodiCampaignCover(area.arenaId),
    env: oshodiCampaignEnv(area),
  }),
};

/** The presentation of every campaign arena whose district has a kit (an area without one draws the defaults). */
export function campaignArtTable(): Record<string, ArenaArt> {
  const out: Record<string, ArenaArt> = {};
  for (const id of CAMPAIGN_ARENA_IDS) {
    const area = campaignAreaOfArena(id);
    const kit = area ? KITS[area.districtId] : undefined;
    if (area && kit) out[id] = kit(area);
  }
  return out;
}
