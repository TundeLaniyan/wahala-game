/**
 * Campaign area: FADEYI/SOMOLU - THE KOBO TOLL CORRIDOR (mission 1, `fadeyiSomolu.approach`; docs/CAMPAIGN_WORLD.md
 * "Fadeyi/Somolu", decisions WF1-WF3). A campaign-only board south of Ikorodu Road, on the Somolu side: the junction
 * approach the City Rumble map compresses into its two corner side roads, drawn here as the street the Kobo Marshals turned
 * into a toll. Four sub-areas, west to east (the camera looks north):
 *
 *   slip        the Ikorodu Road slip: the slip road down from the highway barrier (the TOLL GATE), a kiosk, shops, houses
 *   checkpoint  the Kobo checkpoint street: the approach road between two lines of jersey barriers with gaps and toll
 *               kiosks, shop and workshop blocks north, lock-ups, houses and garages south
 *   plaza       the toll plaza corridor: the road widened into lanes between booth islands, the Ring toll office north,
 *               workshops and stalls south
 *   yard        the tool-shed yard behind the compound wall: its toll bar (a Ring checkpoint, the sector gate) lifts once
 *               the toll boxes are smashed; garages, stores and the TOOL SHED door on its kept-clear apron
 *
 * Painted with the Fadeyi letter kit (`fadeyiKit.ts`) on the community `Board`; every solid tile is a real object (the
 * highway's median barrier north of the slip, buildings, lock-ups, the compound wall). Fictional names only.
 */
import type { DistrictDef } from '../types';
import { fadeyiCampaignArena } from './fadeyiKit';

export const TOLL_CORRIDOR_ARENA_ID = 'campaignFadeyiTollCorridor';

const seg = (...s: string[]): string => s.join('');
const E = 'BB';
//                     slip x2-10      checkpoint x11-24   plaza x25-35    wall  yard x37-45
export const TOLL_CORRIDOR_ROWS: readonly string[] = [
  'BBDDDD' + 'B'.repeat(42),
  'BBDDDD' + 'B'.repeat(42),
  seg(E, '____.....', '..............', '...........', 'V', '.........', E),
  seg(E, '.==.KK...', '.SSSS..WWW.MMM', '..BBBBBBB..', 'V', '.WWW..HHH', E),
  seg(E, '.==......', '.SSSS..WWW.MMM', '..BBBBBBB..', 'V', '.WWW..HHH', E),
  seg(E, '.==.SSSS.', '..............', '..BBBBBBB..', 'V', '......HHH', E),
  seg(E, '.==.SSSS.', '.MMM...SSSS...', '...........', 'V', '.........', E),
  seg(E, '.==.SSSS.', '.MMM...SSSS...', '...........', 'V', '..HHHH...', E),
  seg(E, '.==......', '..............', '===========', 'V', '..HHHH...', E),
  seg(E, '.==...DDD', 'DDDD..DDDD.KDD', '==DDDKDDD==', 'V', '.........', E),
  seg(E, '=========', '==============', '===========', '.', '=====....', E),
  seg(E, '=========', '==============', '===========', '.', '=====....', E),
  seg(E, '......DDD', 'DD.DDDD.K.DDDD', '==DDDKDDD==', 'V', '......WW.', E),
  seg(E, '....KK...', '..............', '===========', 'V', '......WW.', E),
  seg(E, '.........', '.LLLL..RRRR.LL', '...........', 'V', '.........', E),
  seg(E, '....RRRR.', '.LLLL..RRRR.LL', '.WWW...MMM.', 'V', '..WWWWW..', E),
  seg(E, '....RRRR.', '.......RRRR...', '.WWW...MMM.', 'V', '..WWWWW..', E),
  seg(E, '.KK.RRRR.', '..............', '.........x.', 'V', '..WWWWW..', E),
  seg(E, '.........', '.RRR..WWWW..MM', '...SSSS....', 'V', '._______.', E),
  seg(E, '.........', '.RRR..WWWW..MM', '...SSSS....', 'V', '._______.', E),
  seg(E, '.....LLL.', '.RRR.......x..', '.....$.....', 'V', '.........', E),
  seg(E, '.....LLL.', '..............', '.LL....KK..', 'V', '.LL...HH.', E),
  seg(E, '.......$.', '......LLL.....', '...........', 'V', '.........', E),
  seg(E, '.........', '..............', '...........', 'V', '.........', E),
  'L'.repeat(48),
  'L'.repeat(48),
];

export const TOLL_CORRIDOR_SUB_AREAS: DistrictDef[] = [
  { id: 'slip', name: 'Ikorodu Road slip', role: 'approach', rects: [[2, 2, 10, 23]] },
  { id: 'checkpoint', name: 'Kobo checkpoint street', role: 'street', rects: [[11, 2, 24, 23]] },
  { id: 'plaza', name: 'Toll plaza corridor', role: 'concourse', rects: [[25, 2, 35, 23]] },
  { id: 'yard', name: 'Tool-shed yard', role: 'works', rects: [[36, 2, 45, 23]] },
];

export const CAMPAIGN_FADEYI_TOLL_CORRIDOR = fadeyiCampaignArena({
  id: TOLL_CORRIDOR_ARENA_ID,
  name: 'The Kobo Toll Corridor',
  rows: TOLL_CORRIDOR_ROWS,
  start: { x: 3, y: 21 },
  subAreas: TOLL_CORRIDOR_SUB_AREAS,
  // a pothole in the checkpoint street's back lane, oil under the plaza stalls and by the yard's stores
  traps: [
    [14, 21, 'o'],
    [30, 22, '~'],
    [41, 21, '~'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [11, 14, 35, 23] },
  info: {
    tagline:
      'Campaign area: the Ikorodu Road slip, the Kobo checkpoint street, the toll plaza corridor and the tool-shed yard.',
    lighting: 'Flat grey midday over the junction approach',
    hazards: ['Traders drop goods onto the pavements - new crates block your route.'],
  },
});
