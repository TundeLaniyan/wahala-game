/**
 * Campaign area: MUSHIN - THE LADIPO SIDE STREETS AND THE SUPPLIER YARD (mission 1, `mushin.approach`; docs/CAMPAIGN_WORLD.md
 * "Mushin", decisions WM2-WM3). A campaign-only board north-west of the Idi-Oro road: the parts market the City Rumble map
 * compresses into its Ladipo quarter, drawn here at street scale. Four sub-areas (the camera looks north):
 *
 *   gateStreet   Row Gate street (west): the entry and the way out, a narrow side street of workshops and parts stalls
 *   stallRow     Spare-parts row (north middle): shopfronts, parts stalls and tyre heaps in a staggered grid
 *   backAisle    the engine-testing back aisle (south middle): workshops and lock-ups, the cross street to the yard wall
 *   yard         the supplier yard behind its steel gate (east): warehouses, the parts cages on the loading apron, the
 *                storeroom and its door
 *
 * Painted with the Mushin letters (`MUSHIN_LEGEND`) and drawn by the community campaign kit (WM1); every solid tile is a real
 * object. Fictional names only.
 */
import { Board } from '../community/painter';
import { MUSHIN_LEGEND } from '../rumbleMushin';
import { campaignArena, communityLegend } from './kit';
import type { ArenaDef, DistrictDef } from '../types';

export const PARTS_ROW_ARENA_ID = 'campaignMushinPartsRow';

const W = 48;
const H = 26;

function paint(): Board {
  const b = new Board(W, H);
  // ---- the edges: tall buildings north, east and west, low lock-ups on the camera side
  b.fill(0, 0, W - 1, 1, 'B').fill(0, H - 2, W - 1, H - 1, 'L');
  b.fill(0, 2, 1, H - 3, 'B').fill(W - 2, 2, W - 1, H - 3, 'B');

  // ---- gateStreet (x 2-11): workshops on the west kerb, parts stalls and a heap on the east kerb, the gate lock-ups south
  b.fill(2, 3, 3, 5, 'W').fill(2, 8, 3, 10, 'W').fill(2, 14, 3, 16, 'W');
  b.fill(7, 3, 8, 4, 'P').fill(7, 7, 8, 8, 'P').set(7, 10, 'H');
  b.fill(7, 14, 8, 15, 'P').fill(6, 18, 7, 18, 'K');
  b.fill(9, 21, 11, 22, 'L');
  b.fill(10, 3, 11, 10, 'S'); // the back of the stall row's west shops (the side street's east frontage)

  // ---- stallRow (x 12-31, y 2-11): shopfronts north, parts stalls in a staggered grid, tyre heaps
  b.fill(13, 2, 30, 2, 'S');
  b.fill(14, 4, 16, 5, 'P').fill(19, 4, 21, 5, 'P').fill(24, 4, 26, 5, 'P').fill(29, 4, 30, 5, 'H');
  b.fill(13, 7, 14, 8, 'H').fill(17, 7, 19, 8, 'P').fill(22, 7, 24, 8, 'P').fill(27, 7, 29, 8, 'P');
  b.fill(14, 10, 16, 10, 'P').fill(20, 10, 22, 10, 'P').fill(26, 10, 28, 10, 'P');

  // ---- the cross street (y 12-13) runs from the gate street to the yard wall; the engine back aisle south of it:
  // workshops on the cross street, lock-ups, a tyre heap, workshops on the south kerb
  b.fill(13, 14, 15, 15, 'W').fill(19, 14, 21, 15, 'W').fill(25, 14, 28, 15, 'W');
  b.fill(12, 18, 14, 19, 'L').fill(17, 18, 19, 19, 'L').fill(23, 18, 25, 19, 'L').fill(29, 17, 30, 18, 'H');
  b.fill(15, 21, 16, 22, 'W').fill(20, 21, 22, 22, 'W').fill(26, 21, 27, 21, 'K');

  // ---- the yard wall (its steel gate opens once the checkpoints are walked: the sector gate) and the supplier yard
  b.fill(32, 2, 32, 23, 'C');
  b.fill(32, 18, 32, 20, '.');
  b.fill(34, 3, 38, 6, 'G').fill(41, 3, 45, 6, 'G');
  b.fill(33, 9, 45, 11, '_'); // the loading apron in front of the warehouses, kept clear for the lorries
  b.fill(39, 8, 40, 8, 'K'); // the gate-keeper's kiosk between the warehouse doors
  b.fill(36, 14, 42, 16, 'G'); // the parts storeroom (its door is the tile south of it)
  b.fill(44, 14, 45, 15, 'H').fill(34, 13, 34, 15, 'C');
  b.fill(37, 20, 40, 21, 'W').fill(43, 19, 44, 20, 'H').fill(34, 22, 35, 23, 'K');

  // ---- crates a player can count on: supply crates in the gate street and the back aisle, barrier crates at lane ends
  b.set(5, 13, '$').set(27, 21, '$');
  b.set(11, 12, 'x').set(31, 9, 'x');
  return b;
}

const BOARD = paint();
export const PARTS_ROW_ROWS: readonly string[] = BOARD.rows();

export const PARTS_ROW_SUB_AREAS: DistrictDef[] = [
  { id: 'gateStreet', name: 'Row Gate street', role: 'street', rects: [[2, 2, 11, 23]] },
  { id: 'stallRow', name: 'Spare-parts row', role: 'works', rects: [[12, 2, 31, 11]] },
  { id: 'backAisle', name: 'Engine back aisle', role: 'lane', rects: [[12, 12, 31, 23]] },
  { id: 'yard', name: 'Supplier yard', role: 'service', rects: [[32, 2, 45, 23]] },
];

export const CAMPAIGN_MUSHIN_PARTS_ROW: ArenaDef = campaignArena({
  id: PARTS_ROW_ARENA_ID,
  name: 'The Ladipo Side Streets and the Supplier Yard',
  rows: PARTS_ROW_ROWS,
  legend: communityLegend(MUSHIN_LEGEND),
  cover: BOARD.cover(MUSHIN_LEGEND),
  start: { x: 3, y: 22 },
  subAreas: PARTS_ROW_SUB_AREAS,
  // oil by the gate street's workshops and in the supplier yard, a pothole in the back aisle (off every patrol route)
  traps: [
    [5, 6, '~'],
    [9, 17, 'o'],
    [43, 8, '~'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [12, 2, 31, 23] },
  info: {
    tagline:
      'Campaign area: the Row Gate side street, the spare-parts row, the engine back aisle and the supplier yard.',
    lighting: 'Hot, hazy mainland afternoon under tarpaulins and corrugated roofs',
    hazards: ['Traders drop goods into the aisles - new crates block your route.'],
  },
});
