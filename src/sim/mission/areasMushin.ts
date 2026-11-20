/**
 * Mushin's campaign areas (docs/CAMPAIGN_WORLD.md "Mushin", decisions WM2-WM5). The City Rumble map (`rumbleMushin`) stays the
 * compact competitive interpretation of the district; these are the places the campaign walks at street scale.
 *
 *                 (the Idi-Oro road and the transit square = the City Rumble map)
 *                                    |
 *   mushin.partsRow (NW) ---- the yard service lane ---- mushin.market (NE)
 *
 * Fictional names only (the Bible's naming rule): Row Gate, the Iya Ronke supplier yard, the Alaba Ojo market hall.
 */
import { PARTS_ROW_ARENA_ID, PARTS_ROW_SUB_AREAS } from '../arenas/campaign/mushinPartsRow';
import type { CampaignAreaDef, CampaignSubArea } from './areas';
import { areaCol } from './areas';

const purposes = (
  subs: readonly { id: string }[],
  text: Readonly<Record<string, string>>,
): CampaignSubArea[] => subs.map((d) => ({ ...(d as CampaignSubArea), purpose: text[d.id] ?? '' }));

/** Mission 1, Spare-Parts Row: the Row Gate side street, the spare-parts row, the engine back aisle, the supplier yard. */
export const MUSHIN_PARTS_ROW: CampaignAreaDef = {
  id: 'mushin.partsRow',
  districtId: 'mushin',
  arenaId: PARTS_ROW_ARENA_ID,
  name: 'The Ladipo Side Streets and the Supplier Yard',
  summary:
    'The parts market north-west of the Idi-Oro road: the Row Gate side street, the spare-parts row under its umbrellas, the engine-testing back aisle and, behind its steel gate, the supplier yard with the parts cages and the storeroom.',
  format: 'field',
  missions: ['mushin.approach'],
  place: {
    compass: 'NW',
    from: 'the Idi-Oro road (the City Rumble map)',
    neighbours: [
      { areaId: 'interchange', dir: 'S', via: 'the Row Gate side street down to the main road' },
      { areaId: 'mushin.market', dir: 'E', via: 'the yard service lane behind the warehouses' },
    ],
  },
  subAreas: purposes(PARTS_ROW_SUB_AREAS, {
    gateStreet:
      'The entry and the way out: workshops and parts stalls along a narrow side street, the ROW GATE return.',
    stallRow: 'Checkpoint STALL ROW in the stall grid; a parts hawker loops the middle blocks.',
    backAisle: 'Checkpoint BACK AISLE by the yard gate; a stall guard loops the workshops and lock-ups.',
    yard: 'Behind the steel gate (open once the checkpoints are walked): the parts cages, the cage minder, the storeroom door.',
  }),
  sector: {
    id: 'mushin.partsRow',
    districtId: 'mushin',
    arenaId: PARTS_ROW_ARENA_ID,
    name: 'The Ladipo side streets and the supplier yard',
    area: 'The whole campaign board: the Row Gate side street, the spare-parts row, the engine back aisle and the supplier yard; closed by the buildings north, east and west and the lock-ups south.',
    rects: [[2, 2, 45, 23]],
    barricades: [],
    // the supplier yard's steel gate opens once the two checkpoints are walked (a sector transition, decision WM2)
    gates: [{ id: 'yardGate', kind: 'gate', tiles: areaCol(32, 18, 20), opensAfterLeg: 0 }],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [3, 22],
  exits: [
    { id: 'rowGate', x: 4, y: 20, label: 'ROW GATE', leadsTo: 'interchange' },
    { id: 'storeroom', x: 39, y: 17, label: 'PARTS STOREROOM', leadsTo: 'raid:partsStoreroom' },
  ],
  landmarks: [
    {
      id: 'redLine',
      name: 'Mushin Red Line station',
      kind: 'redLine',
      at: [22, 0],
      side: 'north',
      story:
        'The Red Line runs on its viaduct behind the shop row; the same station the City Rumble map looks up at.',
    },
    {
      id: 'association',
      name: 'Row Gate Spares Association',
      kind: 'signBoard',
      at: [12, 0],
      side: 'north',
      story: 'The traders who pay the Ring for their pitches meet under this board.',
    },
    {
      id: 'spill',
      name: 'The parts spill',
      kind: 'partsSpill',
      at: [0, 9],
      side: 'west',
      story: 'The parts market does not stop at the street: tyres, rims and drums spill past the gate.',
    },
    {
      id: 'testing',
      name: 'Engine-testing smoke',
      kind: 'smoke',
      at: [26, 0],
      side: 'north',
      story: 'Mechanics run engines on the stands behind the row all day.',
    },
    {
      id: 'yardLights',
      name: 'Supplier yard floodlights',
      kind: 'floodlight',
      at: [47, 10],
      side: 'east',
      story: "Iya Ronke's supplier yard: where the Ring keeps the hoarded parts under lights.",
    },
  ],
};

export const MUSHIN_AREAS: readonly CampaignAreaDef[] = [MUSHIN_PARTS_ROW];
