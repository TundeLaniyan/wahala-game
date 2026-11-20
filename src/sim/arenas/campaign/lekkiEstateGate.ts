/**
 * Campaign area: LEKKI PHASE 1 - THE SEABREEZE ESTATE GATE AND ITS SERVICE ROADS (mission 1, `lekki.approach`;
 * docs/CAMPAIGN_WORLD.md "Lekki Phase 1", decisions WL1-WL3). A campaign-only board south of the estates the City Rumble map
 * compresses into its Freedom Way compounds: the gated approach every estate in Phase 1 has, drawn at street scale. Four
 * sub-areas (the camera looks north):
 *
 *   gardens      the residents' garden walk: villa compounds behind high walls, palms, the narrow walks between them
 *   gateRoad     the estate gate road: a palm avenue up to the Ring's gatehouse booths and the checkpoint boom
 *   serviceRoad  the service road along the south: staff quarters, the staff bus kiosks, the side gate the staff use
 *   plantYard    behind the checkpoint: the back service road, the standby plant hall, its transformer pad and stores
 *
 * Painted with Lekki's own letters (`lekkiLegend.ts`, the Rumble legend plus the substation); every solid tile is a real
 * object. Asphalt roads only: Admiralty Way's interlocking paving (decision LI7) is not on this board. Fictional names only.
 */
import { Board } from '../community/painter';
import { campaignArena, communityLegend } from './kit';
import type { ArenaDef, DistrictDef } from '../types';
import { LEKKI_CAMPAIGN_LEGEND } from './lekkiLegend';

export const ESTATE_GATE_ARENA_ID = 'campaignLekkiEstateGate';

const W = 48;
const H = 28;

function paint(): Board {
  const b = new Board(W, H);
  // ---- the edges: villas and glass blocks beyond the estate wall north, low lock-ups on the camera side, blocks east / west
  b.fill(0, 0, W - 1, 1, 'B')
    .fill(10, 0, 15, 1, 'G')
    .fill(34, 0, 39, 1, 'G');
  b.fill(0, 26, W - 1, 27, 'L');
  b.fill(0, 2, 1, 25, 'B').fill(46, 2, 47, 25, 'B');

  // ---- gardens: two staggered rows of villa compounds (villa + its high wall) between 2-wide walks, palms at the corners
  for (const [x, ch] of [
    [4, 'R'],
    [11, 'V'],
    [18, 'R'],
    [25, 'V'],
  ] as const)
    b.fill(x, 4, x + 3, 5, ch);
  for (const [x, ch] of [
    [7, 'V'],
    [14, 'R'],
    [21, 'V'],
  ] as const)
    b.fill(x, 8, x + 3, 9, ch);
  b.fill(2, 8, 3, 9, 'R');
  b.fill(27, 8, 28, 9, 'R');
  for (const [x, y] of [
    [9, 4],
    [16, 5],
    [23, 4],
    [5, 8],
    [12, 9],
    [19, 8],
    [26, 9],
  ] as const)
    b.set(x, y, 'P');

  // ---- the gate road: a palm avenue (rows 11 and 15), three lanes of asphalt, the gatehouse booths by the boom
  b.fill(2, 12, 19, 14, '=');
  b.fill(20, 12, 29, 14, '_'); // the checkpoint apron in front of the boom (slabs, speed humps), kept clear
  for (const x of [4, 9, 14, 19]) b.set(x, 11, 'P').set(x + 2, 15, 'P');
  b.fill(27, 11, 28, 11, 'K').fill(27, 15, 28, 15, 'K');

  // ---- the checkpoint line: the plant compound's wall, the boom across the road (the sector gate, col 30 rows 11-15)
  b.fill(30, 2, 30, 10, 'V').fill(30, 16, 30, 25, 'V');

  // ---- the service road and the staff quarters north of it
  b.fill(2, 21, 29, 22, '=');
  b.fill(4, 17, 7, 19, 'S');
  b.fill(11, 17, 14, 18, 'L');
  b.fill(19, 17, 22, 19, 'S');
  b.fill(26, 17, 28, 19, 'G');
  b.fill(6, 24, 7, 24, 'K').fill(12, 24, 13, 25, 'M').fill(18, 24, 19, 24, 'K').fill(24, 24, 25, 25, 'M');

  // ---- the plant yard: the back service road, the standby plant hall (its door is the tile south of it), its transformer
  // pad, the estate office and the stores
  b.fill(32, 2, 33, 25, '=');
  b.fill(36, 3, 42, 5, 'B');
  b.fill(35, 6, 43, 7, '_'); // the plant's apron, kept clear for the fuel bowser
  b.fill(42, 10, 44, 11, 'T');
  b.fill(36, 13, 39, 15, 'G');
  b.fill(42, 15, 44, 16, 'H');
  b.fill(36, 19, 39, 20, 'L').fill(42, 20, 44, 21, 'L');
  b.fill(36, 24, 37, 24, 'K');
  b.fill(36, 10, 38, 10, 'H'); // the fenced cable-drum store
  b.set(44, 13, 'K'); // the meter booth
  b.set(34, 9, 'P').set(34, 18, 'P');

  // ---- crates a player can count on: two supply crates, barrier crates on two shortcuts
  b.set(10, 16, '$').set(40, 23, '$');
  b.set(10, 20, 'x').set(29, 7, 'x');
  return b;
}

const BOARD = paint();
export const ESTATE_GATE_ROWS: readonly string[] = BOARD.rows();

export const ESTATE_GATE_SUB_AREAS: DistrictDef[] = [
  { id: 'gardens', name: 'Seabreeze garden walk', role: 'plaza', rects: [[2, 2, 29, 10]] },
  { id: 'gateRoad', name: 'Estate gate road', role: 'approach', rects: [[2, 11, 29, 15]] },
  { id: 'serviceRoad', name: 'Coral Close service road', role: 'street', rects: [[2, 16, 29, 25]] },
  { id: 'plantYard', name: 'Standby plant yard', role: 'works', rects: [[30, 2, 45, 25]] },
];

export const CAMPAIGN_LEKKI_ESTATE_GATE: ArenaDef = campaignArena({
  id: ESTATE_GATE_ARENA_ID,
  name: 'The Seabreeze Estate Gate',
  rows: ESTATE_GATE_ROWS,
  legend: communityLegend(LEKKI_CAMPAIGN_LEGEND),
  cover: BOARD.cover(LEKKI_CAMPAIGN_LEGEND),
  start: { x: 3, y: 24 },
  subAreas: ESTATE_GATE_SUB_AREAS,
  // a pothole on the service road, oil by the plant's bowser apron, sand washed onto the garden walk
  traps: [
    [16, 22, 'o'],
    [44, 8, '~'],
    [2, 11, 'o'],
  ],
  hazards: [{ kind: 'drop', style: 'merch', count: 2, firstAtSec: 24, everySec: [14, 20], warnSec: 1.5 }],
  endgame: { rect: [2, 11, 29, 25] },
  info: {
    tagline:
      'Campaign area: the Seabreeze estate gate, its garden walk, the Coral Close service road and the standby plant yard.',
    lighting: 'Clear coastal afternoon',
    hazards: ['Vendors drop goods into the lanes - new crates block your route.'],
  },
});
