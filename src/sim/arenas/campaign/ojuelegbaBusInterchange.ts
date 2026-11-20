/**
 * Campaign area: OJUELEGBA - THE UNDERBRIDGE BUS INTERCHANGE (finale mission 20, `ojuelegba.junction`; docs/CAMPAIGN_WORLD.md
 * "The Ojuelegba finale", decisions WL6, WL9). A campaign-only board north of the junction the City Rumble map is built
 * round: where the flyover runs on north over the bus stops, the under-bridge market and the Ring's control yard. Four
 * sub-areas (the camera looks north):
 *
 *   westRoad     the west approach road: the kerb, a kiosk row, the WEST PAVEMENT
 *   busStop      under the deck: hammerhead piers in two bents, the bus stop island with its shelter, the through road
 *   market       the under-bridge market south of the road: stall blocks and container shops between the piers
 *   ringYard     the Ring's control yard east: workshops, the generator house, skips, a danfo rank by its gate
 *
 * Painted with the Ojuelegba object kit (`ojuelegbaKit.ts`); the flyover deck (x 15-30) is drawn overhead over the piers.
 * Every solid tile is a real object. Fictional names only.
 */
import { Board } from '../community/painter';
import { campaignArena } from './kit';
import type { ArenaDef, DistrictDef } from '../types';
import { OJUELEGBA_KIT } from './ojuelegbaKit';

export const BUS_INTERCHANGE_ARENA_ID = 'campaignOjuelegbaBusInterchange';

const W = 48;
const H = 28;

function paint(): string[] {
  const b = new Board(W, H);
  // ---- the edges: occupied buildings north and on the sides, low lock-ups on the camera side
  b.fill(0, 0, W - 1, 1, 'Q');
  b.fill(0, 26, W - 1, 27, 'L');
  b.fill(0, 2, 1, 25, 'Q').fill(46, 2, 47, 25, 'Q');

  // ---- the through road (rows 11-13) from the west approach under the deck to the yard's gate
  b.fill(2, 11, 45, 13, '=');
  b.fill(9, 11, 10, 13, 'I'); // a kerb island splitting the west mouth

  // ---- the west approach: kiosks and a container shop on the pavements, a shed by the corner
  b.fill(3, 4, 4, 5, 'K').fill(8, 4, 10, 5, 'C').fill(3, 8, 5, 8, 'T');
  b.fill(4, 16, 6, 17, 'C').fill(9, 17, 10, 18, 'K').fill(3, 21, 5, 22, 'S').fill(9, 22, 11, 23, 'T');

  // ---- under the deck: two bents of hammerhead piers north of the road, two south, the bus stop island
  b.fill(16, 3, 17, 4, 'P').fill(28, 3, 29, 4, 'P');
  b.fill(16, 16, 17, 17, 'P').fill(28, 16, 29, 17, 'P');
  b.fill(21, 6, 23, 6, 'B').fill(20, 9, 24, 9, 'I'); // the shelter, and the island's kerb along the road
  b.fill(13, 6, 14, 7, 'K').fill(31, 6, 32, 7, 'K');
  b.fill(20, 3, 23, 3, 'T').fill(11, 9, 12, 9, 'Y'); // a stall line under the north girder, tyres by the west kerb

  // ---- the under-bridge market: stall blocks and container shops in a staggered grid round the south piers
  for (const [x, y, ch] of [
    [20, 16, 'T'],
    [24, 16, 'C'],
    [13, 19, 'T'],
    [18, 21, 'C'],
    [22, 20, 'T'],
    [27, 21, 'T'],
    [31, 19, 'C'],
    [14, 23, 'T'],
    [24, 24, 'T'],
  ] as const)
    b.fill(x, y, x + 2, y + 1, ch);

  // ---- the Ring's control yard: its wall west (an opening on the road and one south), workshops, the generator house
  b.fill(35, 2, 35, 9, 'W').fill(35, 15, 35, 19, 'W');
  b.fill(38, 3, 43, 5, 'O').fill(38, 16, 40, 18, 'G').fill(43, 16, 44, 16, 'J');
  b.fill(42, 20, 43, 23, 'N').fill(38, 22, 39, 23, 'Y');
  b.fill(39, 8, 41, 9, 'C');

  // ---- crates: supply crates, barrier crates on two shortcuts
  b.set(7, 20, '$').set(26, 7, '$').set(44, 8, '$');
  b.set(19, 14, 'x').set(35, 22, 'x');
  return b.rows();
}

export const BUS_INTERCHANGE_ROWS: readonly string[] = paint();

export const BUS_INTERCHANGE_SUB_AREAS: DistrictDef[] = [
  { id: 'westRoad', name: 'West approach road', role: 'approach', rects: [[2, 2, 12, 25]] },
  { id: 'busStop', name: 'Underbridge bus stop', role: 'underbridge', rects: [[13, 2, 34, 13]] },
  { id: 'market', name: 'Underbridge market', role: 'street', rects: [[13, 14, 34, 25]] },
  { id: 'ringYard', name: 'Ring control yard', role: 'service', rects: [[35, 2, 45, 25]] },
];

export const CAMPAIGN_OJUELEGBA_BUS_INTERCHANGE: ArenaDef = campaignArena({
  id: BUS_INTERCHANGE_ARENA_ID,
  name: 'Ojuelegba Underbridge Interchange',
  rows: BUS_INTERCHANGE_ROWS,
  legend: OJUELEGBA_KIT,
  start: { x: 4, y: 19 },
  subAreas: BUS_INTERCHANGE_SUB_AREAS,
  // oil under the deck by the bus stop island and in the yard, a pothole in the market's back lane
  traps: [
    [33, 4, '~'],
    [41, 13, '~'],
    [19, 25, 'o'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 22, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [13, 14, 34, 25] },
  info: {
    tagline:
      'Campaign area: the west approach road, the bus stop under the flyover, the under-bridge market and the Ring control yard.',
    lighting: 'Late afternoon, deep bridge shadow',
    hazards: ['Vendors dump barrows and tyres in the lanes - new crates block your route.'],
  },
});
