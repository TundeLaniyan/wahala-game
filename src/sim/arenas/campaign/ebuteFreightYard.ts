/**
 * Campaign area: EBUTE METTA / OYINGBO - THE IRON LANE FREIGHT YARD (the district's field mission, `ebuteMetta.approach`;
 * docs/CAMPAIGN_WORLD.md "Ebute Metta", decisions WE1-WE4). A campaign-only board south of the station, where the freight
 * line leaves the passenger tracks for the goods yards: the working rail yard the City Rumble map compresses into its two
 * track lanes and a few wagons, drawn here at street scale. Four sub-areas (the camera looks north):
 *
 *   cargo     Iron Lane cargo streets (west): bonded warehouses, cargo lock-ups and goods stacks in a street grid, trailers
 *             parked on the freight road; the yard gate and the way in
 *   crossing  the Alafia level crossing (middle): the freight line running north-south under its two bridge portals, the
 *             freight road crossing it, signal posts, the crossing keeper's hut and a goods shed
 *   sidings   the Oyingbo goods sidings (north-east) behind the yard fence and its steel gate: wagons on the sidings, the
 *             signal cabin and its kept-clear apron
 *   works     the Ajao works compounds (south-east): walled compounds, workshops, the signal shed and its door
 *
 * Painted with the Ebute Metta object kit (the district's own `EBUTE_LEGEND`, decision WM1): every solid tile is a real
 * object of the district (warehouses, lock-ups, wagons, trailers, compound walls, workshops, the rail portals). The freight
 * line is walkable track (no train runs into the area, as on Oshodi's siding). Fictional names only.
 */
import { Board } from '../community/painter';
import { EBUTE_LEGEND } from '../rumbleEbuteMetta';
import { campaignArena, communityLegend } from './kit';
import type { ArenaDef, DistrictDef } from '../types';

export const FREIGHT_YARD_ARENA_ID = 'campaignEbuteFreightYard';

const W = 50;
const H = 30;

function paint(): Board {
  const b = new Board(W, H);
  // ---- the edges: warehouses and the station's back north, lock-ups on the camera side, buildings east and west; the
  // freight line leaves the board under its bridge portals north and south
  b.fill(0, 0, W - 1, 1, 'B');
  b.fill(0, H - 2, W - 1, H - 1, 'L');
  b.fill(0, 2, 1, H - 3, 'B').fill(W - 2, 2, W - 1, H - 3, 'B');
  b.fill(22, 0, 23, 1, 'Q').fill(22, H - 2, 23, H - 1, 'Q');

  // ---- the freight road (rows 14-15) from the yard gate to the works, crossing the line at the Alafia level crossing
  b.fill(2, 14, 47, 15, '=');
  // ---- the freight line (x 22-23), portal to portal
  b.fill(22, 2, 23, H - 3, '=');

  // ---- cargo: bonded warehouses north of the road, lock-ups and goods stacks south of it, trailers on the shoulders
  b.fill(4, 3, 8, 5, 'B').fill(12, 3, 16, 5, 'B').fill(18, 3, 19, 4, 'Y');
  b.fill(4, 8, 7, 10, 'L').fill(11, 8, 13, 10, 'L').fill(16, 8, 17, 10, 'Y');
  b.fill(9, 12, 12, 12, 'F');
  b.fill(6, 15, 9, 15, 'F'); // a trailer parked on the freight road
  b.fill(5, 17, 8, 17, 'F');
  b.fill(4, 20, 7, 22, 'L').fill(11, 18, 15, 21, 'B');
  b.fill(6, 25, 7, 26, 'K').fill(10, 24, 11, 25, 'Y').fill(15, 24, 17, 26, 'L');
  b.fill(19, 18, 20, 21, 'L');

  // ---- crossing: signal posts beside the line, the keeper's hut, wagons waiting on the loop siding, a goods shed
  b.set(21, 4, 'Z').set(24, 11, 'Z').set(21, 18, 'Z').set(24, 24, 'Z');
  b.fill(19, 11, 20, 12, 'K');
  b.fill(26, 3, 29, 4, 'W').fill(26, 7, 29, 8, 'W');
  b.fill(27, 14, 30, 14, 'F'); // a low-loader waiting at the crossing
  b.fill(26, 11, 27, 12, 'U');
  b.fill(26, 18, 29, 20, 'V');
  b.fill(26, 23, 28, 24, 'Y').fill(19, 24, 20, 26, 'U');

  // ---- sidings: the yard fence (compound wall) west and south, its steel gate (the sector gate) on the road side
  b.fill(31, 2, 31, 13, 'G').fill(31, 13, 47, 13, 'G');
  b.fill(37, 13, 39, 13, '.');
  b.fill(33, 3, 36, 4, 'W').fill(41, 3, 44, 4, 'W');
  b.fill(33, 7, 34, 8, 'Y').fill(44, 7, 46, 8, 'W');
  b.fill(39, 6, 40, 7, 'C'); // the signal cabin (its apron, the hold zone, is in front of it)
  b.fill(38, 8, 41, 10, '_');
  b.set(36, 10, 'Z').set(43, 11, 'Z');
  b.fill(33, 10, 35, 11, 'W').fill(44, 10, 46, 11, 'Y');

  // ---- works: walled compounds, workshops, the signal shed (its door is the tile south of it), utility cabinets
  b.fill(33, 17, 36, 19, 'G').fill(42, 17, 46, 19, 'V');
  b.fill(39, 21, 43, 23, 'V'); // the signal shed
  b.fill(33, 22, 35, 23, 'U').fill(33, 26, 36, 26, 'G').fill(45, 22, 46, 24, 'G');
  b.fill(39, 24, 43, 25, '_'); // the shed's apron, kept clear for the lorries
  b.fill(43, 15, 46, 15, 'F'); // a tanker parked outside the works

  // ---- crates a player can count on: supply crates in the streets, barrier crates at two corners
  b.set(4, 13, '$').set(18, 22, '$').set(32, 25, '$');
  b.set(18, 13, 'x').set(37, 16, 'x');
  return b;
}

const BOARD = paint();

export const FREIGHT_YARD_ROWS: readonly string[] = BOARD.rows();

export const FREIGHT_YARD_SUB_AREAS: DistrictDef[] = [
  { id: 'cargo', name: 'Iron Lane cargo streets', role: 'street', rects: [[2, 2, 18, 27]] },
  { id: 'crossing', name: 'Alafia level crossing', role: 'rail', rects: [[19, 2, 30, 27]] },
  { id: 'sidings', name: 'Oyingbo goods sidings', role: 'service', rects: [[31, 2, 47, 13]] },
  { id: 'works', name: 'Ajao works compounds', role: 'works', rects: [[31, 14, 47, 27]] },
];

export const CAMPAIGN_EBUTE_FREIGHT_YARD: ArenaDef = campaignArena({
  id: FREIGHT_YARD_ARENA_ID,
  name: 'The Iron Lane Freight Yard',
  rows: FREIGHT_YARD_ROWS,
  legend: communityLegend(EBUTE_LEGEND),
  cover: BOARD.cover(EBUTE_LEGEND),
  start: { x: 3, y: 26 },
  subAreas: FREIGHT_YARD_SUB_AREAS,
  // oil by the parked trailers and the works, a pothole in the cargo street
  traps: [
    [13, 13, '~'],
    [45, 25, '~'],
    [8, 25, 'o'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [2, 16, 30, 27] },
  info: {
    tagline:
      'Campaign area: the Iron Lane cargo streets, the Alafia level crossing, the Oyingbo goods sidings and the Ajao works compounds.',
    lighting: 'Warm hazy afternoon over rail steel and old brick',
    hazards: ['Goods fall from the loading gantries - new crates block your route.'],
  },
});
