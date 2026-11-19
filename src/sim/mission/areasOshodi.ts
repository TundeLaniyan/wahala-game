/**
 * Oshodi's campaign areas (docs/CAMPAIGN_WORLD.md "Oshodi", decisions WX5-WX9). The City Rumble map (`rumbleOshodi`) stays
 * the compact competitive interpretation of the district; these are the places the campaign walks at street scale.
 *
 *              (the interchange: terminal, expressway, rail)
 *                                |
 *   oshodi.orita (SW) --- depot back lane --- oshodi.railside (SE)
 *
 * Fictional names only (the Bible's naming rule): Orita Gate, Papa Kekere market, the Ayo Bridge footbridge.
 */
import { ORITA_ARENA_ID, ORITA_SUB_AREAS } from '../arenas/campaign/oshodiOrita';
import type { CampaignAreaDef, CampaignSubArea } from './areas';
import { areaCol } from './areas';

const purposes = (
  subs: readonly { id: string }[],
  text: Readonly<Record<string, string>>,
): CampaignSubArea[] => subs.map((d) => ({ ...(d as CampaignSubArea), purpose: text[d.id] ?? '' }));

/** Mission 1, Terminal Approach: Orita Gate, the terminal forecourt, the Papa Kekere market and the dispatch depot. */
export const OSHODI_ORITA: CampaignAreaDef = {
  id: 'oshodi.orita',
  districtId: 'oshodi',
  arenaId: ORITA_ARENA_ID,
  name: 'Orita Gate and the Dispatch Depot',
  summary:
    'The terminal approach south-west of the interchange: the Orita Gate danfo rank, the forecourt under the terminal wing, the Papa Kekere market lanes and the Ring dispatch depot behind its steel gate.',
  format: 'field',
  missions: ['oshodi.approach'],
  place: {
    compass: 'SW',
    from: 'the interchange (the City Rumble map)',
    neighbours: [
      { areaId: 'interchange', dir: 'N', via: 'the terminal wing (the forecourt is its south apron)' },
      { areaId: 'oshodi.railside', dir: 'E', via: 'the depot back lane east of the yard' },
    ],
  },
  subAreas: purposes(
    // the board's parts, with what each is for in the mission
    ORITA_SUB_AREAS,
    {
      orita: 'The entry and the way out: the danfo rank and the kiosk warden that teaches the first trap.',
      forecourt: 'Checkpoints A and B under the canopy columns, a marshal walking the forecourt.',
      market: 'Checkpoint C at the depot fence; a warden loops a stall block, a tout throws down the lanes.',
      depot: 'Behind the steel gate (open once the checkpoints are walked): the depot door and its heavy.',
    },
  ),
  sector: {
    id: 'oshodi.orita',
    districtId: 'oshodi',
    arenaId: ORITA_ARENA_ID,
    name: 'Orita Gate and the dispatch depot',
    area: 'The whole campaign board: the Orita Gate rank, the terminal forecourt, the Papa Kekere market and the depot yard; closed by the terminal wing, the buildings east and west and the lock-ups south.',
    rects: [[2, 2, 43, 23]],
    barricades: [],
    // the depot's steel gate opens once the three checkpoints are walked (a sector transition, decision WX6)
    gates: [{ id: 'depotGate', kind: 'gate', tiles: areaCol(31, 20, 22), opensAfterLeg: 0 }],
    viewMargin: 2,
    hazards: 'inside',
  },
  entry: [3, 21],
  exits: [
    { id: 'oritaGate', x: 4, y: 18, label: 'ORITA GATE', leadsTo: 'interchange' },
    { id: 'depot', x: 36, y: 13, label: 'DISPATCH DEPOT', leadsTo: 'raid:warehouseDispatchDepot' },
  ],
  landmarks: [
    {
      id: 'flyover',
      name: 'The Orita flyover',
      kind: 'flyover',
      at: [22, 0],
      side: 'north',
      story: 'The expressway deck over the terminal: the same flyover the interchange map runs under.',
    },
    {
      id: 'rank',
      name: 'Orita Gate danfo rank',
      kind: 'danfoRank',
      at: [0, 8],
      side: 'west',
      story: 'Yellow danfos queue beyond the gate for the loading street; the conductors call the routes.',
    },
    {
      id: 'market',
      name: 'Papa Kekere market',
      kind: 'marketUmbrellas',
      at: [20, 23],
      story: 'The traders under their umbrellas whose lanes the wardens tax.',
    },
    {
      id: 'depotLights',
      name: 'Dispatch depot floodlights',
      kind: 'floodlight',
      at: [44, 12],
      side: 'east',
      story: 'The Ring dispatch depot: where the convoys of the boss mission are sent out.',
    },
  ],
};

export const OSHODI_AREAS: readonly CampaignAreaDef[] = [OSHODI_ORITA];
