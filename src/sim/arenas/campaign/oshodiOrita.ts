/**
 * Campaign area: OSHODI - ORITA GATE AND THE DISPATCH DEPOT (mission 1, `oshodi.approach`; docs/CAMPAIGN_WORLD.md, decisions
 * WX5-WX7). A campaign-only board south-west of the interchange: the place the City Rumble map compresses into its bus
 * park, drawn here at street scale. Four sub-areas, west to east (the camera looks north):
 *
 *   orita      Orita Gate loading street: the danfo rank in its bays, bay shelters, the ticket kiosk
 *   forecourt  the terminal forecourt under the south wing: canopy columns, ticket kiosks, the loading street
 *   market     Papa Kekere market lanes: stall blocks and container shops in a staggered grid
 *   depot      the dispatch depot yard behind its steel gate: warehouses, skips, the generator house, the depot door
 *
 * Painted with the Oshodi object kit (`oshodiKit.ts`); every solid tile is a real object. Fictional names only.
 */
import { Board } from '../community/painter';
import { campaignArena } from './kit';
import type { ArenaDef, DistrictDef } from '../types';
import { OSHODI_KIT } from './oshodiKit';

export const ORITA_ARENA_ID = 'campaignOshodiOrita';

const W = 46;
const H = 26;

function paint(): string[] {
  const b = new Board(W, H);
  // ---- the edges: the terminal's south wing and the buildings north, lock-ups on the camera side, buildings east / west
  b.fill(0, 0, 11, 1, 'Q').fill(12, 0, 29, 1, 'T').fill(30, 0, 45, 1, 'Q');
  b.fill(0, 24, 45, 25, 'E');
  b.fill(0, 2, 1, 23, 'Q').fill(44, 2, 45, 23, 'Q');

  // ---- orita: the danfo rank (two bays of two buses), shelters, the ticket kiosk, lock-ups by the gate
  b.fill(3, 3, 6, 3, 'B').fill(3, 6, 6, 6, 'B');
  b.set(8, 3, 'S').set(8, 6, 'S');
  b.fill(5, 14, 7, 15, 'K');
  b.fill(7, 20, 10, 21, 'E');
  // the block between the rank and the forecourt (the loading street passes south of it)
  b.fill(11, 2, 11, 7, 'Q');

  // ---- forecourt: canopy columns under the wing, ticket kiosks, a bay shelter
  for (const x of [14, 19, 24, 29]) b.set(x, 3, 'C');
  b.fill(16, 6, 17, 6, 'K').fill(25, 6, 26, 6, 'K');
  b.set(21, 6, 'S');

  // ---- the bus-loading street (rows 9-10) with its kerb islands
  b.fill(2, 9, 30, 10, '=');
  b.fill(16, 9, 17, 10, 'I').fill(24, 9, 25, 10, 'I');

  // ---- market: shopfronts on the west side, stall blocks and container shops in a staggered grid
  b.fill(11, 12, 11, 13, 'H').fill(11, 16, 11, 17, 'H').fill(11, 20, 11, 21, 'H');
  b.fill(13, 12, 15, 13, 'M').fill(19, 12, 21, 13, 'M').fill(25, 12, 27, 13, 'M');
  b.fill(13, 16, 15, 17, 'O').fill(18, 16, 20, 17, 'M').fill(23, 16, 26, 17, 'O');
  b.fill(14, 20, 16, 21, 'M').fill(20, 20, 22, 21, 'M').fill(26, 20, 28, 21, 'M');

  // ---- the depot fence (its steel gate opens once the checkpoints are walked: the sector gate) and the yard
  b.fill(31, 2, 31, 23, 'W');
  b.fill(31, 20, 31, 22, '.');
  b.fill(33, 3, 37, 6, 'Y').fill(40, 3, 43, 6, 'Y');
  b.fill(34, 10, 39, 12, 'Y'); // the dispatch depot (its door is the tile south of it)
  b.fill(32, 13, 43, 15, '_'); // the loading apron in front of the depot doors, kept clear for the lorries
  b.fill(41, 10, 41, 11, 'J');
  b.fill(33, 17, 35, 18, 'O').fill(39, 17, 40, 18, 'X').fill(42, 20, 43, 20, 'J');

  // ---- crates a player can count on: two supply crates, barrier crates at the market's corners
  b.set(9, 11, '$').set(22, 22, '$');
  b.set(17, 22, 'x').set(29, 11, 'x');
  return b.rows();
}

export const ORITA_ROWS: readonly string[] = paint();

export const ORITA_SUB_AREAS: DistrictDef[] = [
  { id: 'orita', name: 'Orita Gate loading street', role: 'park', rects: [[2, 2, 10, 23]] },
  { id: 'forecourt', name: 'Terminal forecourt', role: 'concourse', rects: [[11, 2, 30, 10]] },
  { id: 'market', name: 'Papa Kekere market lanes', role: 'street', rects: [[11, 11, 30, 23]] },
  { id: 'depot', name: 'Dispatch depot yard', role: 'works', rects: [[31, 2, 43, 23]] },
];

export const CAMPAIGN_OSHODI_ORITA: ArenaDef = campaignArena({
  id: ORITA_ARENA_ID,
  name: 'Orita Gate and the Dispatch Depot',
  rows: ORITA_ROWS,
  legend: OSHODI_KIT,
  start: { x: 3, y: 21 },
  subAreas: ORITA_SUB_AREAS,
  // oil in the bus bays and by the depot's generator house, a pothole in the market's back lane
  traps: [
    [4, 4, '~'],
    [38, 19, '~'],
    [24, 23, 'o'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [12, 11, 30, 23] },
  info: {
    tagline:
      'Campaign area: the Orita Gate danfo rank, the terminal forecourt, the Papa Kekere market lanes and the dispatch depot yard.',
    lighting: 'Hazy midday over the interchange',
    hazards: ['Traders drop goods into the lanes - new crates block your route.'],
  },
});
