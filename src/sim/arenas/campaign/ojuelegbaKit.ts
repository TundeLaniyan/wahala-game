/**
 * The OJUELEGBA object kit for campaign boards (decision WL6): the same letters as the Underbridge cover map
 * (`render/arenas/ojuelegbaCoverMap.ts`, checked letter for letter by tests/render/campaign-art.test.ts), so a campaign area of
 * the finale is drawn with the reference arena's own hammerhead piers (and the flyover overhead), packed danfos, shops,
 * workshops, kiosks, stalls, tyre racks, the bus stop and the lock-ups, and reads as the same junction. Ojuelegba is not a
 * community-painted district: like Oshodi it has its own cover builder, so it follows the Oshodi pattern (a letter kit here,
 * the district's cover builder on the area's letter map in `render/arenas/campaign/ojuelegbaCampaign.ts`). Presentation data.
 */
import type { CampaignLegend } from './kit';

export const OJUELEGBA_KIT: CampaignLegend = {
  P: 'pier', // hammerhead piers of the flyover (2 x 2): the deck runs on over them
  D: 'danfo', // parked danfos lying east-west, nose to tail
  N: 'danfoNS', // parked danfos lying north-south
  H: 'shop', // shops facing south (fascia boards, shutters)
  Q: 'building', // occupied buildings (the perimeter)
  O: 'workshop', // repair workshops with roller shutters
  C: 'container', // a shipping-container shop
  W: 'wall', // a yard wall
  I: 'island', // kerb islands, the railed refuge
  K: 'kiosk', // kiosks and ticket booths
  T: 'stall', // lock-up market stalls
  L: 'lockup', // low lock-ups on the camera edge
  S: 'shed', // a corner shed
  Y: 'tyres', // tyre racks
  B: 'busStop', // the bus stop shelter
  G: 'genHouse', // a generator house
  J: 'skip', // a steel skip
};
