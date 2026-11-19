/**
 * Campaign area: OSHODI - THE RAILSIDE STREETS (mission 2, `oshodi.railEdge`; docs/CAMPAIGN_WORLD.md, decisions WX5, WX8).
 * A campaign-only board east of the depot, along the commuter line where it leaves the interchange: the railway edge the
 * City Rumble map compresses into its two track lanes, drawn here at street scale. Four sub-areas (the camera looks north):
 *
 *   plaza      the rail plaza at the end of the siding: the buffer stop and its relay cabin, platform posts, the kept-clear
 *              plaza the trailer crews want back
 *   market     the informal market lanes south of it: stall blocks and container shops, where the hawkers walk
 *   service    the service corridor east of the market: the relay mast shed, workshops, skips and the generator house
 *   footbridge the footbridge approach behind the station's barrier gate: the stair tower, the piers, a danfo rank and the
 *              park gate
 *
 * Painted with the Oshodi object kit (`oshodiKit.ts`); every solid tile is a real object. Fictional names only.
 */
import { Board } from '../community/painter';
import { campaignArena } from './kit';
import type { ArenaDef, DistrictDef } from '../types';
import { OSHODI_KIT } from './oshodiKit';

export const RAILSIDE_ARENA_ID = 'campaignOshodiRailside';

const W = 48;
const H = 28;

function paint(): string[] {
  const b = new Board(W, H);
  // ---- the edges: the rail fence along the line north-west, buildings north-east and on the sides, lock-ups south
  b.fill(0, 0, 23, 1, 'W').fill(24, 0, 47, 1, 'Q');
  b.fill(0, 26, 47, 27, 'E');
  b.fill(0, 2, 1, 25, 'Q').fill(46, 2, 47, 25, 'Q');

  // ---- the siding along the north edge (walkable: no train runs into the area) and its buffer stop's relay cabin
  b.fill(2, 2, 33, 3, '=');
  b.fill(34, 2, 35, 3, 'N');

  // ---- plaza: platform posts, the kept-clear plaza, a container shop, the containers stacked against the service yard
  for (const x of [5, 9, 13]) b.set(x, 5, 'L');
  b.fill(5, 6, 11, 10, '_');
  b.fill(14, 7, 16, 8, 'O');
  b.fill(18, 5, 19, 9, 'O');

  // ---- market: stall blocks and container shops in a staggered grid; workshops close it from the service corridor
  b.fill(3, 13, 5, 14, 'M').fill(8, 13, 10, 14, 'M').fill(13, 13, 15, 14, 'M').fill(18, 13, 19, 14, 'M');
  b.fill(4, 17, 7, 18, 'O').fill(11, 17, 13, 18, 'M').fill(16, 17, 19, 18, 'O');
  b.fill(3, 21, 5, 22, 'M').fill(9, 21, 11, 22, 'M').fill(15, 21, 17, 22, 'M');
  b.fill(21, 12, 22, 15, 'Y').fill(21, 20, 22, 25, 'Y');

  // ---- service: the relay mast shed, skips, the generator house, a shed and the workshops
  b.fill(24, 6, 28, 8, 'Y');
  b.fill(32, 6, 32, 7, 'J');
  b.fill(31, 12, 32, 13, 'X');
  b.fill(24, 12, 27, 13, 'Y');
  b.fill(25, 20, 29, 22, 'Y');
  b.set(33, 21, 'J');

  // ---- the station's barrier wall (its gate lifts once the plaza is held: the sector gate) and the footbridge approach
  b.fill(36, 2, 36, 25, 'W');
  b.fill(36, 10, 36, 12, '.');
  b.fill(41, 3, 43, 5, 'U'); // the footbridge stair tower (the exit is the tile at its foot)
  b.fill(39, 9, 40, 10, 'P').fill(43, 11, 44, 12, 'P');
  b.fill(38, 17, 41, 17, 'B').fill(38, 20, 41, 20, 'B');
  b.set(43, 18, 'S');
  b.set(38, 6, 'K').fill(41, 14, 42, 15, 'O');

  // ---- crates a player can count on: supply crates in the market and the corridor, barrier crates at the lane ends
  b.set(7, 24, '$').set(34, 17, '$');
  b.set(20, 11, 'x').set(23, 17, 'x');
  return b.rows();
}

export const RAILSIDE_ROWS: readonly string[] = paint();

export const RAILSIDE_SUB_AREAS: DistrictDef[] = [
  { id: 'plaza', name: 'Siding rail plaza', role: 'rail', rects: [[2, 2, 19, 10]] },
  { id: 'market', name: 'Ayo market lanes', role: 'street', rects: [[2, 11, 20, 25]] },
  {
    id: 'service',
    name: 'Relay service corridor',
    role: 'service',
    rects: [
      [20, 2, 35, 10],
      [21, 11, 35, 25],
    ],
  },
  { id: 'footbridge', name: 'Footbridge approach', role: 'concourse', rects: [[36, 2, 45, 25]] },
];

export const CAMPAIGN_OSHODI_RAILSIDE: ArenaDef = campaignArena({
  id: RAILSIDE_ARENA_ID,
  name: 'The Railside Streets',
  rows: RAILSIDE_ROWS,
  legend: OSHODI_KIT,
  start: { x: 3, y: 24 },
  subAreas: RAILSIDE_SUB_AREAS,
  // oil on the siding by the buffer stop, potholes in the corridor and by the bus rank
  traps: [
    [30, 3, '~'],
    [34, 24, 'o'],
    [44, 21, 'o'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 26, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [2, 11, 35, 25] },
  info: {
    tagline:
      'Campaign area: the siding rail plaza, the Ayo market lanes, the relay service corridor and the footbridge approach.',
    lighting: 'Hazy midday over the interchange',
    hazards: ['Traders drop goods into the lanes - new crates block your route.'],
  },
});
