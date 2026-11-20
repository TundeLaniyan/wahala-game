/**
 * Lekki Phase 1's campaign areas (docs/CAMPAIGN_WORLD.md "Lekki Phase 1", decisions WL1-WL5). The City Rumble map
 * (`rumbleLekki`) stays the compact competitive interpretation of Phase 1 and Ikate; these are the places the campaign walks
 * at street scale, both south and east of the Freedom Way estates the Rumble map draws as walled blocks:
 *
 *        (Admiralty Way, Freedom Way, the promenade = the City Rumble map)
 *                         |                              |
 *   lekki.estateGate (S): the Seabreeze gate,  --- the back service road ---  lekki.innerEstate (E): the Palmgrove drive,
 *   its service roads and the standby plant                                   the utility compound and the substation
 *
 * Fictional names only (the Bible's naming rule): Seabreeze Estate, Coral Close, Palmgrove, the Coralview substation.
 */
import { ESTATE_GATE_ARENA_ID, ESTATE_GATE_SUB_AREAS } from '../arenas/campaign/lekkiEstateGate';
import { INNER_ESTATE_ARENA_ID, INNER_ESTATE_SUB_AREAS } from '../arenas/campaign/lekkiInnerEstate';
import type { CampaignAreaDef, CampaignSubArea } from './areas';
import { areaCol } from './areas';

const purposes = (
  subs: readonly { id: string }[],
  text: Readonly<Record<string, string>>,
): CampaignSubArea[] => subs.map((d) => ({ ...(d as CampaignSubArea), purpose: text[d.id] ?? '' }));

/** Mission 1, Gate Approach: the garden walk, the estate gate road, the Coral Close service road and the plant yard. */
export const LEKKI_ESTATE_GATE: CampaignAreaDef = {
  id: 'lekki.estateGate',
  districtId: 'lekki',
  arenaId: ESTATE_GATE_ARENA_ID,
  name: 'The Seabreeze Estate Gate',
  summary:
    'South of the Freedom Way estates: the Seabreeze garden walk, the palm avenue up to the Ring gatehouse and its checkpoint boom, the Coral Close service road with the staff quarters, and behind the boom the back service road and the standby plant yard.',
  format: 'field',
  missions: ['lekki.approach'],
  place: {
    compass: 'S',
    from: 'Admiralty Way and Freedom Way (the City Rumble map)',
    neighbours: [
      {
        areaId: 'boulevard',
        dir: 'N',
        via: 'the estate wall north of the garden walk (Freedom Way beyond it)',
      },
      { areaId: 'lekki.innerEstate', dir: 'NE', via: 'the back service road north of the plant yard' },
      { areaId: 'expressway', dir: 'S', via: 'the staff bus stop on the Coral Close service road' },
    ],
  },
  subAreas: purposes(ESTATE_GATE_SUB_AREAS, {
    gardens:
      'Two guards loop the villa compounds and a heavy watches the walk mouth; one standby feeder stands on the walk.',
    gateRoad: 'The gatehouse road to keep for 25 s under the palms while the gatehouse guards come for it.',
    serviceRoad:
      'The entry and the way out: the staff bus kiosks, the side gate, the gatehouse guards round the staff quarters.',
    plantYard:
      'Behind the checkpoint boom (it lifts once the road is held): three feeders, the feeder tech and the plant door.',
  }),
  sector: {
    id: 'lekki.estateGate',
    districtId: 'lekki',
    arenaId: ESTATE_GATE_ARENA_ID,
    name: 'The Seabreeze estate gate',
    area: 'The whole campaign board: the garden walk, the estate gate road, the Coral Close service road and the standby plant yard; closed by the villas and glass blocks north, blocks east and west and the lock-ups south.',
    rects: [[2, 2, 45, 25]],
    barricades: [],
    // the Ring's checkpoint boom across the gate road lifts once the road is held (a sector transition, decision WL2)
    gates: [{ id: 'gateBoom', kind: 'checkpoint', tiles: areaCol(30, 11, 15), opensAfterLeg: 0 }],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [3, 24],
  exits: [
    { id: 'sideGate', x: 3, y: 16, label: 'SIDE GATE', leadsTo: 'expressway' },
    { id: 'plant', x: 39, y: 6, label: 'STANDBY PLANT', leadsTo: 'raid:standbyPlant' },
  ],
  landmarks: [
    {
      id: 'towers',
      name: 'Phase One towers',
      kind: 'glassTowers',
      at: [24, 0],
      side: 'north',
      story: 'The glass towers along Admiralty Way stand over the estate wall: the boulevard is just beyond.',
    },
    {
      id: 'staffBus',
      name: 'Coral Close staff bus stop',
      kind: 'danfoRank',
      at: [0, 22],
      side: 'west',
      story: 'The staff buses from the expressway drop the estate workers here; the side gate is theirs.',
    },
    {
      id: 'gatehouse',
      name: 'Seabreeze gatehouse',
      kind: 'gatehouseSign',
      at: [0, 13],
      side: 'west',
      story:
        'The estate name board over the gate road: the Ring runs the gate now and charges every visitor.',
    },
    {
      id: 'plantLights',
      name: 'Standby plant floodlights',
      kind: 'floodlight',
      at: [47, 6],
      side: 'east',
      story:
        'The plant that keeps the estates lit through every outage; the Ring sells its power back to them.',
    },
  ],
};

/** Mission 2, Estate Sweep: the Palmgrove drive, the water works, the Coralview substation and the estate service lane. */
export const LEKKI_INNER_ESTATE: CampaignAreaDef = {
  id: 'lekki.innerEstate',
  districtId: 'lekki',
  arenaId: INNER_ESTATE_ARENA_ID,
  name: 'Palmgrove and the Coralview Substation',
  summary:
    'East of the Freedom Way estates, inside the Palmgrove estate wall: the north drive between villa compounds, the estate water works, the Coralview substation behind the inner estate gate, and the service lane along the back fence.',
  format: 'field',
  missions: ['lekki.estate'],
  place: {
    compass: 'E',
    from: 'Admiralty Way and Freedom Way (the City Rumble map)',
    neighbours: [
      { areaId: 'boulevard', dir: 'W', via: 'the Palmgrove drive west to Freedom Way' },
      {
        areaId: 'lekki.estateGate',
        dir: 'SW',
        via: 'the estate service lane to the Seabreeze back service road',
      },
      {
        areaId: 'ikate',
        dir: 'N',
        via: 'the villas north of the drive (the Ikate leisure edge beyond them)',
      },
    ],
  },
  subAreas: purposes(INNER_ESTATE_SUB_AREAS, {
    drive:
      'The entry: an estate marshal loops the villa compounds, the drive heavy and the terrace thrower hold the drive.',
    waterWorks:
      'A Ring guard loops the pump house; the borehole sheds and the treatment tanks give the cover.',
    substation:
      'Behind the inner estate gate (open once the drive patrol is down): five control points, two grid techs, the hound kennels.',
    serviceLane:
      'The escape: run from the hounds to the service lane; the back fence has a barrier to blast for the short way.',
  }),
  sector: {
    id: 'lekki.innerEstate',
    districtId: 'lekki',
    arenaId: INNER_ESTATE_ARENA_ID,
    name: 'Palmgrove and the substation',
    area: 'The whole campaign board: the Palmgrove north drive, the estate water works, the Coralview substation and the estate service lane; closed by villas north, blocks east and west and the lock-ups south.',
    rects: [[2, 2, 45, 25]],
    barricades: [],
    // the inner estate gate on the drive opens once the drive patrol is down (a sector transition, decision WL4)
    gates: [{ id: 'lawnGate', kind: 'gate', tiles: areaCol(29, 3, 6), opensAfterLeg: 0 }],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [3, 3],
  exits: [
    { id: 'estateGate', x: 3, y: 6, label: 'ESTATE GATE', leadsTo: 'boulevard' },
    { id: 'serviceLane', x: 32, y: 24, label: 'SERVICE LANE', leadsTo: 'lekki.estateGate' },
  ],
  landmarks: [
    {
      id: 'powerLine',
      name: 'The Coralview 33 kV line',
      kind: 'powerLine',
      at: [38, 0],
      side: 'north',
      story:
        'The line that feeds the substation: the Ring switches the estates on and off from its control points.',
    },
    {
      id: 'waterTower',
      name: 'Palmgrove water tower',
      kind: 'waterTower',
      at: [0, 15],
      side: 'west',
      story:
        'The estate water tower over the pump house: residents queue at its tap when the Ring cuts the power.',
    },
    {
      id: 'estateSign',
      name: 'Palmgrove Estate',
      kind: 'gatehouseSign',
      at: [0, 4],
      side: 'west',
      story: 'The estate name board over the drive: the Ring took the gate and the substation together.',
    },
    {
      id: 'kennelLights',
      name: 'Substation floodlights',
      kind: 'floodlight',
      at: [47, 10],
      side: 'east',
      story: 'The substation yard lamps over the hound kennels in its east corners.',
    },
  ],
};

export const LEKKI_AREAS: readonly CampaignAreaDef[] = [LEKKI_ESTATE_GATE, LEKKI_INNER_ESTATE];
