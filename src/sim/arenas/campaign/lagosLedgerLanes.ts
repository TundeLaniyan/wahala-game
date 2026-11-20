/**
 * Campaign area: LAGOS ISLAND - THE LEDGER LANES (mission 1, `lagosIsland.approach`; docs/CAMPAIGN_WORLD.md "Lagos Island",
 * decisions WE5-WE6). A campaign-only board behind the Balogun trading maze, where the cloth lanes and the market access
 * road lead to the Ring's records office: the commercial quarter the City Rumble map compresses into its stall rows and
 * its Broad Street offices, drawn here at street scale. Four sub-areas (the camera looks north):
 *
 *   lanes     Ileri cloth lanes (west): stall blocks, lock-ups and shopfronts in narrow staggered lanes; the row gate
 *   road      the Oke-Ayo market road (south middle): the hand-cart road from the lanes to the offices, kiosks and stalls
 *   hall      the traders' counter hall court (north middle): the counter hall's arcade round a kept-clear court
 *   records   Ledger House records yard (east), behind its walled compound and steel gate: the records office tower, the
 *             old registry, the annexe and its door, the stamp machines in the yard
 *
 * Painted with the Lagos Island object kit (the district's own `LAGOS_ISLAND_LEGEND`, decision WM1): every solid tile is a
 * real object (office towers, shopfronts, stalls, lock-ups, arcades, the compound wall, heritage frontage). Fictional names.
 */
import { Board } from '../community/painter';
import { LAGOS_ISLAND_LEGEND } from '../rumbleLagosIsland';
import { campaignArena, communityLegend } from './kit';
import type { ArenaDef, DistrictDef } from '../types';

export const LEDGER_LANES_ARENA_ID = 'campaignLagosLedgerLanes';

const W = 52;
const H = 28;

function paint(): Board {
  const b = new Board(W, H);
  // ---- the edges: office towers north (the old registry's frontage over the records yard), lock-ups on the camera side,
  // buildings east and west
  b.fill(0, 0, W - 1, 1, 'O').fill(39, 0, 49, 1, 'H');
  b.fill(0, H - 2, W - 1, H - 1, 'L');
  b.fill(0, 2, 1, H - 3, 'B').fill(W - 2, 2, W - 1, H - 3, 'B');

  // ---- lanes: shopfronts on the north lane, staggered stall blocks and lock-ups, the arcade along the market road
  b.fill(3, 3, 7, 4, 'S').fill(10, 3, 15, 4, 'S');
  b.fill(3, 7, 5, 8, 'M').fill(8, 7, 9, 8, 'M').fill(12, 7, 15, 8, 'L');
  b.fill(5, 11, 7, 12, 'M').fill(10, 11, 12, 12, 'L').fill(15, 11, 16, 12, 'M');
  b.fill(3, 15, 4, 16, 'M').fill(7, 15, 10, 16, 'S').fill(13, 15, 14, 16, 'M');
  b.fill(5, 19, 8, 20, 'L').fill(11, 19, 14, 21, 'S');
  b.fill(7, 23, 9, 24, 'M').fill(14, 24, 16, 24, 'K');
  b.fill(18, 3, 19, 8, 'A').fill(18, 12, 19, 15, 'A').fill(18, 19, 19, 22, 'A');

  // ---- road: the market road north-south (x 20-21), turning east along y 18-19 to the records gate
  b.fill(20, 2, 21, 25, '=').fill(22, 18, 37, 19, '=');
  b.fill(23, 21, 26, 22, 'M').fill(29, 21, 31, 23, 'S').fill(34, 21, 36, 22, 'M');
  b.fill(24, 15, 25, 16, 'K').fill(28, 15, 29, 16, 'M').fill(33, 15, 34, 16, 'K');
  b.fill(28, 24, 31, 24, 'K');

  // ---- hall: the counter hall's arcade round its court, shopfronts on its sides, two trees
  b.fill(24, 3, 36, 4, 'A');
  b.fill(24, 7, 25, 11, 'S').fill(35, 7, 36, 11, 'S');
  b.fill(27, 6, 33, 10, '_'); // the counter hall court (the hold zone), kept clear
  b.set(28, 13, 'T').set(32, 13, 'T');

  // ---- records: the compound wall with its steel gate (the sector gate) on the road, the records office tower, the old
  // registry and the annexe (its door is the tile south of it), a gatehouse kiosk
  b.fill(38, 2, 38, 25, 'V');
  b.fill(38, 17, 38, 19, '.');
  b.fill(42, 3, 48, 7, 'O');
  b.fill(40, 10, 43, 12, 'H').fill(46, 10, 48, 13, 'V');
  b.fill(42, 21, 46, 23, 'H'); // the records annexe
  b.fill(40, 16, 40, 17, 'K').fill(45, 16, 47, 17, 'L');
  b.set(48, 18, 'T').set(48, 24, 'T');

  // ---- crates a player can count on
  b.set(3, 10, '$').set(17, 23, '$').set(36, 24, '$');
  b.set(22, 10, 'x').set(26, 17, 'x');
  return b;
}

const BOARD = paint();

export const LEDGER_LANES_ROWS: readonly string[] = BOARD.rows();

export const LEDGER_LANES_SUB_AREAS: DistrictDef[] = [
  { id: 'lanes', name: 'Ileri cloth lanes', role: 'street', rects: [[2, 2, 19, 25]] },
  { id: 'road', name: 'Oke-Ayo market road', role: 'lane', rects: [[20, 14, 37, 25]] },
  { id: 'hall', name: 'Counter hall court', role: 'plaza', rects: [[20, 2, 37, 13]] },
  { id: 'records', name: 'Ledger House records yard', role: 'service', rects: [[38, 2, 49, 25]] },
];

export const CAMPAIGN_LAGOS_LEDGER_LANES: ArenaDef = campaignArena({
  id: LEDGER_LANES_ARENA_ID,
  name: 'The Ledger Lanes',
  rows: LEDGER_LANES_ROWS,
  legend: communityLegend(LAGOS_ISLAND_LEGEND),
  cover: BOARD.cover(LAGOS_ISLAND_LEGEND),
  start: { x: 3, y: 24 },
  subAreas: LEDGER_LANES_SUB_AREAS,
  // oil by the market road's kiosks, a pothole in the cloth lanes
  traps: [
    [11, 14, 'o'],
    [27, 15, '~'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [2, 2, 19, 25] },
  info: {
    tagline:
      'Campaign area: the Ileri cloth lanes, the Oke-Ayo market road, the counter hall court and the Ledger House records yard.',
    lighting: 'Bright hazy island midday over warm masonry',
    hazards: ['Traders drop bales into the lanes - new crates block your route.'],
  },
});
