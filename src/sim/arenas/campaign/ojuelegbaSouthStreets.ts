/**
 * Campaign area: OJUELEGBA - THE SOUTH STREETS (finale mission 19, `ojuelegba.return`; docs/CAMPAIGN_WORLD.md "The Ojuelegba
 * finale", decisions WL6-WL8). A campaign-only board south of the junction the City Rumble map is built round: the way home
 * the story opens on, from the motor park where the danfos drop you, along the shop street the Rumble map's shopfront lane
 * runs into, through the vulcanisers' yard, to the corner under the flyover's south ramp. Four sub-areas (camera looks north):
 *
 *   rampCorner   under the flyover's south ramp: hammerhead piers, the bus stop, the JUNCTION CORNER (behind the Ring's gate)
 *   tyreYard     the vulcanisers' yard: tyre racks, workshops, the generator house, a skip (behind the lane barrier)
 *   shopStreet   the Kekere shop street and its back street: shops, stall blocks and container shops
 *   motorPark    the Ijoko motor park: danfos parked in rows and bays, ticket kiosks, the dispatcher's shed
 *
 * Painted with the Ojuelegba object kit (`ojuelegbaKit.ts`): the reference arena's own pieces, the flyover deck carried on
 * over the ramp's piers. Every solid tile is a real object. Fictional names only.
 */
import { Board } from '../community/painter';
import { campaignArena } from './kit';
import type { ArenaDef, DistrictDef } from '../types';
import { OJUELEGBA_KIT } from './ojuelegbaKit';

export const SOUTH_STREETS_ARENA_ID = 'campaignOjuelegbaSouthStreets';

const W = 48;
const H = 28;

function paint(): string[] {
  const b = new Board(W, H);
  // ---- the edges: occupied buildings north and on the sides, low lock-ups on the camera side
  b.fill(0, 0, W - 1, 1, 'Q');
  b.fill(0, 26, W - 1, 27, 'L');
  b.fill(0, 2, 1, 25, 'Q').fill(46, 2, 47, 25, 'Q');

  // ---- the ramp corner: two bents of hammerhead piers under the deck (x 3-12), the bus stop between them, kerb islands
  b.fill(4, 3, 5, 4, 'P').fill(10, 3, 11, 4, 'P');
  b.fill(4, 8, 5, 9, 'P').fill(10, 8, 11, 9, 'P');
  b.fill(6, 6, 8, 6, 'B');
  b.set(2, 6, 'I').set(12, 6, 'I');
  // closed from the rest: a yard wall east of the corner (col 13) and shops along its south side (the Ring's gate, row 12
  // x 2-7, is the sector gate)
  b.fill(13, 2, 13, 12, 'W');
  b.fill(8, 12, 12, 12, 'H');

  // ---- the tyre yard (x 2-12, rows 13-25): tyre racks, workshops, the generator house and a skip; its east side is the
  // lane barrier's wall (col 13, the barrier itself rows 19-22)
  b.fill(13, 13, 13, 18, 'W').fill(13, 23, 13, 25, 'W');
  b.fill(4, 15, 5, 16, 'Y').fill(9, 15, 11, 16, 'O');
  b.fill(2, 20, 4, 20, 'Y').fill(7, 19, 9, 21, 'O');
  b.fill(10, 24, 11, 24, 'J').fill(3, 23, 4, 24, 'G');

  // ---- the shop street (rows 18-23 open lane) with shops along its north side, the back street's stall blocks above
  b.fill(15, 14, 19, 16, 'H').fill(22, 14, 26, 16, 'H').fill(29, 14, 31, 16, 'H');
  b.fill(16, 24, 18, 25, 'T').fill(23, 24, 25, 25, 'T').fill(30, 24, 31, 25, 'T');
  // the street's middle: a run of market stalls and kiosks with gaps, so the lane is two lanes round them
  b.fill(16, 20, 18, 20, 'T').set(21, 20, 'K').fill(25, 20, 27, 20, 'T').fill(30, 20, 31, 20, 'C');
  for (const [x, y, ch] of [
    [15, 3, 'T'],
    [21, 3, 'C'],
    [27, 3, 'T'],
    [18, 7, 'C'],
    [24, 7, 'T'],
    [15, 10, 'T'],
    [21, 10, 'T'],
    [27, 10, 'C'],
  ] as const)
    b.fill(x, y, x + 2, y + 1, ch);

  // ---- the motor park: danfos in rows and bays, ticket kiosks, the dispatcher's shed, a tyre rack
  b.fill(35, 3, 40, 3, 'D').fill(35, 7, 38, 7, 'D').fill(42, 4, 43, 5, 'N');
  b.fill(35, 11, 36, 12, 'N').fill(39, 11, 40, 12, 'N').fill(43, 10, 44, 11, 'N');
  b.fill(36, 15, 39, 15, 'D').fill(42, 15, 44, 16, 'S');
  b.fill(34, 19, 35, 19, 'K').fill(40, 20, 41, 20, 'K');
  b.fill(36, 23, 39, 23, 'D').set(44, 20, 'Y').fill(43, 18, 44, 19, 'N');

  // ---- crates: supply crates, barrier crates on two shortcuts (blast them)
  b.set(32, 9, '$').set(6, 18, '$').set(28, 21, '$');
  b.set(33, 13, 'x').set(20, 12, 'x');
  return b.rows();
}

export const SOUTH_STREETS_ROWS: readonly string[] = paint();

export const SOUTH_STREETS_SUB_AREAS: DistrictDef[] = [
  { id: 'rampCorner', name: 'Flyover ramp corner', role: 'underbridge', rects: [[2, 2, 12, 11]] },
  { id: 'tyreYard', name: 'Vulcanisers yard', role: 'works', rects: [[2, 12, 13, 25]] },
  { id: 'shopStreet', name: 'Kekere shop street', role: 'lane', rects: [[13, 2, 33, 25]] },
  { id: 'motorPark', name: 'Ijoko motor park', role: 'park', rects: [[34, 2, 45, 25]] },
];

export const CAMPAIGN_OJUELEGBA_SOUTH_STREETS: ArenaDef = campaignArena({
  id: SOUTH_STREETS_ARENA_ID,
  name: 'Ojuelegba South Streets',
  rows: SOUTH_STREETS_ROWS,
  legend: OJUELEGBA_KIT,
  start: { x: 44, y: 24 },
  subAreas: SOUTH_STREETS_SUB_AREAS,
  // oil in the motor park bays and by the generator house, a pothole in the back street
  traps: [
    [41, 9, '~'],
    [6, 24, '~'],
    [24, 5, 'o'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [14, 2, 33, 25] },
  info: {
    tagline:
      'Campaign area: the Ijoko motor park, the Kekere shop street, the vulcanisers yard and the corner under the flyover ramp.',
    lighting: 'Late afternoon, deep bridge shadow',
    hazards: ['Vendors dump barrows and tyres in the lanes - new crates block your route.'],
  },
});
