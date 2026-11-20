/**
 * Campaign area: LAGOS ISLAND - THE PRESS YARDS (mission 2, `lagosIsland.press`; docs/CAMPAIGN_WORLD.md "Lagos Island",
 * decisions WE7-WE8). A campaign-only board north-east of the records office, where the Ring hides its receipt presses in the
 * island's infrastructure compounds: a place the City Rumble map leaves out, drawn at street scale. Four sub-areas (the
 * camera looks north):
 *
 *   streets     the back streets (west): old houses, lock-ups and kiosks along narrow secondary streets; the press gate
 *   substation  the Ireti substation (north middle): a walled compound of transformer halls and switch kiosks
 *   pumps       the Olumo pump house yard (south middle): pump halls, the water tanks' plinths, stores and a tree line
 *   lane        the press lane (east): a narrow lane between the compounds and the houses, closed by a Ring checkpoint until
 *               the presses are wrecked, down to the Marina road
 *
 * Painted with the Lagos Island object kit (the district's own `LAGOS_ISLAND_LEGEND`, decision WM1): every solid tile is a
 * real object (houses, office towers, lock-ups, kiosks, compound walls, the corrugated pump and transformer halls, trees).
 * Fictional names only.
 */
import { Board } from '../community/painter';
import { LAGOS_ISLAND_LEGEND } from '../rumbleLagosIsland';
import { campaignArena, communityLegend } from './kit';
import type { ArenaDef, DistrictDef } from '../types';

export const PRESS_YARDS_ARENA_ID = 'campaignLagosPressYards';
/** The row of the press lane's Ring checkpoint (x 40-41): the sector gate that lifts once the presses are wrecked. */
export const PRESS_LANE_GATE_Y = 13;

const W = 50;
const H = 28;

function paint(): Board {
  const b = new Board(W, H);
  // ---- the edges: office towers north, lock-ups on the camera side, buildings east and west
  b.fill(0, 0, W - 1, 1, 'O');
  b.fill(0, H - 2, W - 1, H - 1, 'L');
  b.fill(0, 2, 1, H - 3, 'B').fill(W - 2, 2, W - 1, H - 3, 'B');

  // ---- streets: old houses in blocks along the secondary streets, lock-ups and kiosks, a tree at a corner
  b.fill(5, 2, 8, 4, 'B').fill(11, 3, 14, 5, 'B');
  b.fill(2, 10, 4, 12, 'B').fill(7, 9, 9, 12, 'B').fill(12, 9, 15, 11, 'L');
  b.fill(4, 15, 7, 17, 'B').fill(10, 14, 11, 15, 'K').fill(13, 15, 16, 18, 'B');
  b.fill(2, 20, 3, 22, 'L').fill(6, 21, 9, 23, 'B').fill(12, 22, 15, 24, 'B');
  b.set(10, 19, 'T');

  // ---- substation: the compound wall with two gateways, transformer halls, switch kiosks
  b.fill(18, 2, 18, 11, 'V').fill(18, 11, 35, 11, 'V');
  b.fill(18, 5, 18, 6, '.').fill(24, 11, 25, 11, '.').fill(32, 11, 33, 11, '.');
  b.fill(21, 3, 25, 4, 'Q').fill(29, 3, 34, 4, 'Q');
  b.fill(21, 7, 22, 8, 'K').fill(26, 7, 29, 8, 'Q').fill(33, 7, 34, 8, 'K');
  b.fill(36, 2, 37, 9, 'B');

  // ---- pumps: pump halls, stores, the tank plinths' wall, a tree line along the street
  b.fill(20, 14, 24, 16, 'Q').fill(28, 14, 33, 15, 'Q');
  b.fill(20, 19, 21, 21, 'L').fill(25, 19, 28, 20, 'V').fill(31, 18, 33, 21, 'Q');
  b.fill(19, 24, 23, 24, 'V').fill(27, 23, 29, 24, 'L').fill(33, 24, 35, 24, 'L');
  b.set(36, 15, 'T').set(36, 19, 'T');

  // ---- lane: the houses that close the press lane west and east, its head yard, the lane itself (x 40-41) to the Marina
  b.fill(38, 13, 39, 25, 'B').fill(42, 13, 47, 25, 'B');
  b.fill(38, 13, 39, 13, 'V').fill(42, 13, 47, 13, 'V');
  b.fill(42, 17, 44, 25, '.').fill(42, 17, 42, 18, 'K'); // a back court off the lane
  b.fill(43, 3, 46, 5, 'O').fill(40, 7, 41, 8, 'K').fill(44, 8, 46, 10, 'L');

  // ---- crates a player can count on
  b.set(3, 6, '$').set(26, 22, '$').set(30, 9, '$');
  b.set(16, 12, 'x').set(37, 12, 'x');
  return b;
}

const BOARD = paint();

export const PRESS_YARDS_ROWS: readonly string[] = BOARD.rows();

export const PRESS_YARDS_SUB_AREAS: DistrictDef[] = [
  { id: 'streets', name: 'Back streets', role: 'lane', rects: [[2, 2, 17, 25]] },
  { id: 'substation', name: 'Ireti substation', role: 'works', rects: [[18, 2, 47, 12]] },
  { id: 'pumps', name: 'Olumo pump house yard', role: 'service', rects: [[18, 13, 37, 25]] },
  { id: 'lane', name: 'The press lane', role: 'street', rects: [[38, 13, 47, 25]] },
];

export const CAMPAIGN_LAGOS_PRESS_YARDS: ArenaDef = campaignArena({
  id: PRESS_YARDS_ARENA_ID,
  name: 'The Press Yards',
  rows: PRESS_YARDS_ROWS,
  legend: communityLegend(LAGOS_ISLAND_LEGEND),
  cover: BOARD.cover(LAGOS_ISLAND_LEGEND),
  start: { x: 3, y: 3 },
  subAreas: PRESS_YARDS_SUB_AREAS,
  // oil by the transformer halls, a pothole in the back street
  traps: [
    [27, 9, '~'],
    [11, 20, 'o'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [2, 13, 17, 25] },
  info: {
    tagline:
      'Campaign area: the back streets, the Ireti substation, the Olumo pump house yard and the press lane.',
    lighting: 'Bright hazy island midday over warm masonry',
    hazards: ['Bales fall from the store lofts - new crates block your route.'],
  },
});
