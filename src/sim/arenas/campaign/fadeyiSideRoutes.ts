/**
 * Campaign area: FADEYI/SOMOLU - THE SOMOLU SIDE ROUTES (mission 2, `fadeyiSomolu.junctions`; docs/CAMPAIGN_WORLD.md
 * "Fadeyi/Somolu", decisions WF1, WF4). A campaign-only board north-east of the Fadeyi junction, on the Somolu side of the
 * Onipanu approach: the Ring-controlled facilities and the back lanes linking the junctions, which the City Rumble map
 * leaves out entirely. Four sub-areas (the camera looks north):
 *
 *   office      the Ring route office: the office block, its kept-clear forecourt (ROUTE OFFICE), the compound walls, a
 *               garage and houses down the west lane
 *   lanes       the Somolu back lanes: irregular house blocks, a corner shop row and a walled plot, the three junction posts
 *               and, where the north-south lane crosses the east-west route, the kept-clear CENTRE JUNCTION
 *   pound       the Kobo vehicle pound south of the route: a walled compound of sheds and garages (the crossing crews' base)
 *               and the house row behind it
 *   slip        the Onipanu slip road behind the route's Ring checkpoint (the sector gate: it lifts once the centre junction
 *               is held): the slip up to the highway barrier (SLIP ROAD), garages, shops and stores along it
 *
 * Painted with the Fadeyi letter kit (`fadeyiKit.ts`) on the community `Board`; every solid tile is a real object (buildings,
 * the highway's median barrier above the slip, compound walls, lock-ups). Fictional names only.
 */
import type { DistrictDef } from '../types';
import { fadeyiCampaignArena } from './fadeyiKit';

export const SIDE_ROUTES_ARENA_ID = 'campaignFadeyiSideRoutes';

const seg = (...s: string[]): string => s.join('');
const E = 'BB';
//                    office x2-11    lanes / pound x12-33          wall  slip x35-47
export const SIDE_ROUTES_ROWS: readonly string[] = [
  'B'.repeat(41) + 'DDDDD' + 'BBBB',
  'B'.repeat(41) + 'DDDDD' + 'BBBB',
  seg(E, '..........', '......................', 'V', '..........___', E),
  seg(E, '.BBBBBB...', '.RRRR..RRR...SSSS..RR.', 'V', '.WWW..SSS.==.', E),
  seg(E, '.BBBBBB.K.', '.RRRR..RRR...SSSS..RR.', 'V', '.WWW..SSS.==.', E),
  seg(E, '.BBBBBB...', '.RRRR.........SSSS....', 'V', '..........==.', E),
  seg(E, '.BBBBBB...', '.......RRR...........R', 'V', '.KK..LLLL.==.', E),
  seg(E, '..______..', '.RRR...RRR..RRRR...RRR', 'V', '..........==.', E),
  seg(E, '..______..', '.RRR........RRRR...RRR', 'V', '.SSS..WWW.==.', E),
  seg(E, '..........', '.RRR..VVVV..........RR', 'V', '.SSS..WWW.==.', E),
  seg(E, '.VVV..VVV.', '......VVVV..RRR..R....', 'V', '..........==.', E),
  seg(E, '..........', '..RRRR......RRR..R..RR', 'V', '.MMM..KK..==.', E),
  seg(E, '..........', '..RRRR.....___.......R', 'V', '..........==.', E),
  seg(E, '..........', '...........___........', '.', '============.', E),
  seg(E, '..RRR.....', '...........___........', '.', '============.', E),
  seg(E, '..RRR..KK.', '.VVVVVVxxVVV..VVVVVV..', 'V', '..........SS.', E),
  seg(E, '..RRR.....', '.V..........V......V..', 'V', '.LLL..WW..SS.', E),
  seg(E, '..........', '.V.HHHHH....V.WWW..V..', 'V', '.LLL..WW.....', E),
  seg(E, '.WWW......', '...HHHHH.......WWW....', 'V', '.............', E),
  seg(E, '.WWW..RRR.', '.V.HHHHH....V......V..', 'V', '..HHH...KK...', E),
  seg(E, '..$...RRR.', '.V..........V.HHHH.V..', 'V', '..HHH........', E),
  seg(E, '..........', '.VVVV..VVVVV..HHHH.V..', 'V', '.............', E),
  seg(E, '.LL..KK...', '......................', 'V', '.WW...LLL....', E),
  seg(E, '..........', '...RRRR..RRR..RRRR.$..', 'V', '.WW...LLL....', E),
  seg(E, '..........', '...RRRR..RRR..RRRR....', 'V', '.............', E),
  'L'.repeat(50),
  'L'.repeat(50),
];

export const SIDE_ROUTES_SUB_AREAS: DistrictDef[] = [
  { id: 'office', name: 'Ring route office', role: 'service', rects: [[2, 2, 11, 24]] },
  { id: 'lanes', name: 'Somolu back lanes', role: 'lane', rects: [[12, 2, 33, 14]] },
  { id: 'pound', name: 'Kobo vehicle pound', role: 'works', rects: [[12, 15, 33, 24]] },
  { id: 'slip', name: 'Onipanu slip road', role: 'approach', rects: [[34, 2, 47, 24]] },
];

export const CAMPAIGN_FADEYI_SIDE_ROUTES = fadeyiCampaignArena({
  id: SIDE_ROUTES_ARENA_ID,
  name: 'The Somolu Side Routes',
  rows: SIDE_ROUTES_ROWS,
  start: { x: 4, y: 12 },
  subAreas: SIDE_ROUTES_SUB_AREAS,
  // a pothole in the west lane, oil in the pound and on the slip's garage apron
  traps: [
    [8, 17, 'o'],
    [22, 18, '~'],
    [40, 18, '~'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [12, 2, 33, 14] },
  info: {
    tagline:
      'Campaign area: the Ring route office, the Somolu back lanes, the Kobo vehicle pound and the Onipanu slip road.',
    lighting: 'Flat grey midday over the back lanes',
    hazards: ['Traders drop goods into the lanes - new crates block your route.'],
  },
});
