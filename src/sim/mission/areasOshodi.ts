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
import { RAILSIDE_ARENA_ID, RAILSIDE_SUB_AREAS } from '../arenas/campaign/oshodiRailside';
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

/** Mission 2, Rail Edge: the siding rail plaza, the Ayo market lanes, the relay service corridor, the footbridge approach. */
export const OSHODI_RAILSIDE: CampaignAreaDef = {
  id: 'oshodi.railside',
  districtId: 'oshodi',
  arenaId: RAILSIDE_ARENA_ID,
  name: 'The Railside Streets',
  summary:
    'East of the depot, where the commuter line leaves the interchange: the siding and its rail plaza, the Ayo market lanes beside it, the relay service corridor and, behind the station barrier, the footbridge approach.',
  format: 'field',
  missions: ['oshodi.railEdge'],
  place: {
    compass: 'SE',
    from: 'the interchange (the City Rumble map)',
    neighbours: [
      { areaId: 'oshodi.orita', dir: 'W', via: 'the depot back lane (the west end of the market lanes)' },
      { areaId: 'interchange', dir: 'N', via: 'the commuter line along the north fence' },
      { areaId: 'interchange', dir: 'NE', via: 'the Ayo footbridge over the line' },
    ],
  },
  subAreas: purposes(RAILSIDE_SUB_AREAS, {
    plaza: 'The relay box by the buffer stop and the plaza to hold; the trailer crews walk the siding.',
    market: 'The entry: two hawkers loop the stall blocks (the first leg).',
    service:
      'Two relay boxes by the mast shed and in the yard; a warden rounds the shed, a heavy minds the boxes.',
    footbridge:
      'Behind the station barrier (it lifts once the plaza is held): the escape to the footbridge, the park gate.',
  }),
  sector: {
    id: 'oshodi.railside',
    districtId: 'oshodi',
    arenaId: RAILSIDE_ARENA_ID,
    name: 'The railside streets',
    area: 'The whole campaign board: the siding rail plaza, the Ayo market lanes, the relay service corridor and the footbridge approach; closed by the rail fence and buildings north, buildings east and west, lock-ups south.',
    rects: [[2, 2, 45, 25]],
    barricades: [],
    // the station's barrier lifts once the plaza is held: the way to the footbridge (a sector transition, decision WX8)
    gates: [{ id: 'stationBarrier', kind: 'checkpoint', tiles: areaCol(36, 10, 12), opensAfterLeg: 2 }],
    viewMargin: 2,
    hazards: 'inside',
  },
  entry: [3, 24],
  exits: [
    { id: 'footbridge', x: 42, y: 6, label: 'FOOTBRIDGE', leadsTo: 'interchange' },
    { id: 'parkGate', x: 44, y: 24, label: 'PARK GATE', leadsTo: 'oshodi.boss' },
  ],
  landmarks: [
    {
      id: 'line',
      name: 'The commuter line',
      kind: 'railViaduct',
      at: [12, 0],
      side: 'north',
      story:
        'The line out of the interchange runs past the siding on its viaduct; the relay boxes signal its convoys.',
    },
    {
      id: 'footbridge',
      name: 'Ayo footbridge',
      kind: 'footbridge',
      at: [45, 6],
      side: 'east',
      story: 'The footbridge over the line: the way out when the trailer hand comes after you.',
    },
    {
      id: 'rank',
      name: 'Park gate danfo rank',
      kind: 'danfoRank',
      at: [45, 20],
      side: 'east',
      story: 'Danfos waiting by the park gate for the interchange run.',
    },
    {
      id: 'market',
      name: 'Ayo market',
      kind: 'marketUmbrellas',
      at: [2, 18],
      side: 'west',
      story: 'The hawkers who work for the trailer crews sell along these lanes.',
    },
  ],
};

export const OSHODI_AREAS: readonly CampaignAreaDef[] = [OSHODI_ORITA, OSHODI_RAILSIDE];
