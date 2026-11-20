/**
 * Campaign area: LEKKI PHASE 1 - THE PALMGROVE INNER ESTATE AND THE CORALVIEW SUBSTATION (mission 2, `lekki.estate`;
 * docs/CAMPAIGN_WORLD.md "Lekki Phase 1", decisions WL1, WL4-WL5). A campaign-only board east of the Freedom Way estates: the
 * inside of a gated estate the City Rumble map only shows as walled blocks, with the utilities that serve it. Four sub-areas
 * (the camera looks north):
 *
 *   drive        the Palmgrove north drive: the estate road between villa compounds, palms on the footpath
 *   waterWorks   the estate water works south of it: the pump house, borehole sheds, the treatment tanks and their stores
 *   substation   behind the inner estate gate: the Coralview substation, transformer pads in a fenced yard, the control room
 *   serviceLane  the estate service lane along the south, from the water works to the substation's back fence
 *
 * Painted with Lekki's own letters (`lekkiLegend.ts`, including the campaign-only substation 'T'); every solid tile is a real
 * object. Asphalt roads only (decision LI7). Fictional names only.
 */
import { Board } from '../community/painter';
import { campaignArena, communityLegend } from './kit';
import type { ArenaDef, DistrictDef } from '../types';
import { LEKKI_CAMPAIGN_LEGEND } from './lekkiLegend';

export const INNER_ESTATE_ARENA_ID = 'campaignLekkiInnerEstate';

const W = 48;
const H = 28;

function paint(): Board {
  const b = new Board(W, H);
  // ---- the edges: villas and blocks north, low lock-ups on the camera side, blocks east and west
  b.fill(0, 0, W - 1, 1, 'B')
    .fill(4, 0, 11, 1, 'R')
    .fill(18, 0, 25, 1, 'R')
    .fill(30, 0, 37, 1, 'G');
  b.fill(0, 26, W - 1, 27, 'L');
  b.fill(0, 2, 1, 25, 'B').fill(46, 2, 47, 25, 'B');

  // ---- the drive: the estate road (rows 4-5) with a footpath north of it, villa compounds south of it
  b.fill(2, 4, 28, 5, '=');
  for (const [x, ch] of [
    [3, 'R'],
    [9, 'V'],
    [15, 'R'],
    [21, 'V'],
  ] as const)
    b.fill(x, 7, x + 3, 8, ch);
  b.set(26, 8, 'P').set(7, 10, 'P').set(25, 11, 'P');
  b.fill(13, 10, 14, 11, 'K'); // the residents' association kiosk
  b.fill(3, 10, 5, 11, 'V').fill(19, 10, 22, 11, 'R');

  // ---- the inner estate gate (col 29 rows 3-6: the sector gate) and the substation's fence
  b.fill(29, 2, 29, 2, 'V').fill(29, 7, 29, 20, 'V');
  b.fill(30, 20, 45, 20, 'V');

  // ---- the substation: four transformer pads, the control room, cable trenches between them (kept clear)
  b.fill(33, 4, 35, 5, 'T').fill(39, 4, 41, 5, 'T');
  b.fill(33, 10, 35, 11, 'T').fill(39, 10, 41, 11, 'T');
  b.fill(43, 8, 44, 12, 'B');
  b.fill(32, 15, 36, 16, 'L').fill(40, 15, 41, 17, 'H');
  b.fill(36, 7, 38, 8, '_'); // the switching apron between the pads

  // ---- the water works: the pump house, borehole sheds, the treatment tanks behind a hoarding, the stores
  b.fill(4, 14, 8, 16, 'B');
  b.fill(12, 13, 14, 14, 'L').fill(12, 17, 14, 18, 'L');
  b.fill(18, 13, 23, 13, 'H').fill(18, 14, 19, 16, 'T');
  b.fill(23, 16, 26, 18, 'G');
  b.set(10, 19, 'P').set(21, 19, 'P');
  b.fill(4, 19, 6, 19, 'L').fill(25, 13, 27, 13, 'H');

  // ---- the service lane along the south (rows 22-23) and its pavement stalls
  b.fill(2, 22, 45, 23, '=');
  b.fill(8, 25, 9, 25, 'M').fill(20, 25, 21, 25, 'K').fill(34, 25, 35, 25, 'M');

  // ---- crates: supply crates, a barrier crate in the substation's back fence (blast it for the short way out)
  b.set(7, 11, '$').set(26, 21, '$').set(44, 18, '$');
  b.set(31, 20, 'x').set(16, 20, 'x');
  return b;
}

const BOARD = paint();
export const INNER_ESTATE_ROWS: readonly string[] = BOARD.rows();

export const INNER_ESTATE_SUB_AREAS: DistrictDef[] = [
  { id: 'drive', name: 'Palmgrove north drive', role: 'street', rects: [[2, 2, 28, 11]] },
  { id: 'waterWorks', name: 'Palmgrove water works', role: 'service', rects: [[2, 12, 28, 20]] },
  { id: 'substation', name: 'Coralview substation', role: 'works', rects: [[29, 2, 45, 20]] },
  { id: 'serviceLane', name: 'Estate service lane', role: 'lane', rects: [[2, 21, 45, 25]] },
];

export const CAMPAIGN_LEKKI_INNER_ESTATE: ArenaDef = campaignArena({
  id: INNER_ESTATE_ARENA_ID,
  name: 'Palmgrove and the Coralview Substation',
  rows: INNER_ESTATE_ROWS,
  legend: communityLegend(LEKKI_CAMPAIGN_LEGEND),
  cover: BOARD.cover(LEKKI_CAMPAIGN_LEGEND),
  start: { x: 3, y: 3 },
  subAreas: INNER_ESTATE_SUB_AREAS,
  // oil by the transformer pads, a pothole in the service lane, a wet patch by the pump house
  traps: [
    [37, 13, '~'],
    [30, 24, 'o'],
    [10, 15, '~'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 26, everySec: [15, 21], warnSec: 1.5 }],
  endgame: { rect: [2, 12, 28, 25] },
  info: {
    tagline:
      'Campaign area: the Palmgrove north drive, the estate water works, the Coralview substation and the estate service lane.',
    lighting: 'Clear coastal afternoon',
    hazards: ['Vendors drop goods into the lanes - new crates block your route.'],
  },
});
