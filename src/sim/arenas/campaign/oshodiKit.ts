/**
 * The Oshodi object kit for campaign boards: the same letters as the Transport Metropolis cover map
 * (`render/arenas/oshodiMetroCoverMap.ts`, checked letter for letter by tests/render/campaign-art.test.ts), so a campaign
 * area of Oshodi is drawn with the district's own terminal wings, danfo ranks, bay shelters, skywalk piers, stalls,
 * container shops, workshops and lock-ups and reads as the same place. Presentation data only.
 */
import type { CampaignLegend } from './kit';

export const OSHODI_KIT: CampaignLegend = {
  Q: 'building', // occupied buildings (the far perimeter, the side edges)
  E: 'lockup', // one-storey lock-ups: the near (camera) edge stays low
  H: 'shop', // shopfronts facing south
  K: 'kiosk', // ticket and phone kiosks
  M: 'stall', // lock-up market stalls
  O: 'container', // shipping-container shops
  T: 'terminal', // terminal wings
  P: 'skyPier', // skywalk / footbridge piers
  U: 'stairTower', // a stair tower up to the walkway
  R: 'portal', // a rail portal / track mouth
  W: 'wall', // parapet / compound wall
  B: 'bus', // parked danfos in a rank
  S: 'shelter', // bay shelters
  C: 'column', // canopy columns
  I: 'island', // kerb islands with a direction sign
  G: 'gantry', // signal gantry feet
  A: 'station', // the station concourse
  L: 'platformPost', // platform canopy posts
  N: 'cabin', // signal cabin and relay cabinets
  Y: 'workshop', // workshops and warehouses
  J: 'skip', // scrap skips
  V: 'pavilion', // a pavilion
  X: 'genHouse', // a generator house
  F: 'arcade', // the low trading arcade
};
