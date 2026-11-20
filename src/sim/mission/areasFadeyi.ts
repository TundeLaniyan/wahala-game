/**
 * Fadeyi/Somolu's campaign areas (docs/CAMPAIGN_WORLD.md "Fadeyi/Somolu", decisions WF1-WF4). The City Rumble map
 * (`rumbleFadeyi`) stays the compact competitive junction (Ikorodu Road, the BRT centreline and its crossings); these are the
 * places round it the campaign walks at street scale:
 *
 *                    (the Fadeyi junction: Ikorodu Road and the BRT centreline = the City Rumble map)
 *                          |                                              |
 *   fadeyiSomolu.tollCorridor (S): the slip, the checkpoint street,   fadeyiSomolu.sideRoutes (NE): the route office, the
 *   the toll plaza and the tool-shed yard (mission 1)                 back lanes, the vehicle pound, the Onipanu slip (mission 2)
 *
 * Fictional names only (the Bible's naming rule): the Kobo checkpoint street, the Kobo vehicle pound, the Ring route office.
 */
import {
  TOLL_CORRIDOR_ARENA_ID,
  TOLL_CORRIDOR_SUB_AREAS,
} from '../arenas/campaign/fadeyiTollCorridor';
import { SIDE_ROUTES_ARENA_ID, SIDE_ROUTES_SUB_AREAS } from '../arenas/campaign/fadeyiSideRoutes';
import type { CampaignAreaDef, CampaignSubArea } from './areas';
import { areaCol } from './areas';

const purposes = (
  subs: readonly { id: string }[],
  text: Readonly<Record<string, string>>,
): CampaignSubArea[] => subs.map((d) => ({ ...(d as CampaignSubArea), purpose: text[d.id] ?? '' }));

/** Mission 1, Toll Approach: the junction approach and the access-control streets the marshals turned into a toll. */
export const FADEYI_TOLL_CORRIDOR: CampaignAreaDef = {
  id: 'fadeyiSomolu.tollCorridor',
  districtId: 'fadeyiSomolu',
  arenaId: TOLL_CORRIDOR_ARENA_ID,
  name: 'The Kobo Toll Corridor',
  summary:
    'South of Ikorodu Road on the Somolu side: the slip down from the highway, the Kobo checkpoint street between its barrier lines, the toll plaza corridor under the Ring toll office and, behind the compound wall and its toll bar, the tool-shed yard.',
  format: 'field',
  missions: ['fadeyiSomolu.approach'],
  place: {
    compass: 'S',
    from: 'the Fadeyi junction (the City Rumble map)',
    neighbours: [
      { areaId: 'interchange', dir: 'N', via: 'the slip road up to the Ikorodu Road barrier (the toll gate)' },
      {
        areaId: 'fadeyiSomolu.sideRoutes',
        dir: 'NE',
        via: 'the Onipanu approach east of the tool-shed yard, across the highway',
      },
    ],
  },
  subAreas: purposes(TOLL_CORRIDOR_SUB_AREAS, {
    slip: 'The entry and the way out: the slip road to the toll gate; a marshal loops the slip shop block.',
    checkpoint:
      'The access-control street: two marshals loop the blocks either side of the barrier lines; the first toll box stands by the kiosk gap.',
    plaza:
      'The checkpoint corridor: toll boxes north and south of the booth islands, the toll heavy minding the nearest one.',
    yard: 'Behind the toll bar (it lifts once the toll boxes are smashed): the tool-shed door and the yard lookout.',
  }),
  sector: {
    id: 'fadeyiSomolu.tollCorridor',
    districtId: 'fadeyiSomolu',
    arenaId: TOLL_CORRIDOR_ARENA_ID,
    name: 'The Kobo toll corridor',
    area: 'The whole campaign board: the Ikorodu Road slip, the Kobo checkpoint street, the toll plaza corridor and the tool-shed yard; closed by the highway barrier and buildings north, buildings east and west, lock-ups south.',
    rects: [[2, 2, 45, 23]],
    barricades: [],
    // the yard's toll bar lifts once the toll boxes are smashed (a sector transition, decision WF2)
    gates: [{ id: 'yardTollBar', kind: 'checkpoint', tiles: areaCol(36, 10, 11), opensAfterLeg: 1 }],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [3, 21],
  exits: [
    { id: 'tollGate', x: 3, y: 2, label: 'TOLL GATE', leadsTo: 'interchange' },
    { id: 'shed', x: 41, y: 18, label: 'TOOL SHED', leadsTo: 'raid:junctionToolShed' },
  ],
  landmarks: [
    {
      id: 'highway',
      name: 'Ikorodu Road',
      kind: 'ikoroduRoad',
      at: [12, 0],
      side: 'north',
      story: 'The divided highway and its BRT lanes beyond the barrier: the junction the slip comes down from.',
    },
    {
      id: 'tollSign',
      name: 'Kobo toll point',
      kind: 'signBoard',
      at: [30, 0],
      side: 'north',
      story: 'The Ring toll office’s board over the plaza: every crossing here pays the marshals.',
    },
    {
      id: 'footbridge',
      name: 'Fadeyi footbridge',
      kind: 'footbridge',
      at: [0, 6],
      side: 'west',
      story: 'The concrete footbridge over the slip, where commuters cross rather than pay at the checkpoint.',
    },
    {
      id: 'stalls',
      name: 'Slip-side stalls',
      kind: 'edgeStalls',
      at: [0, 18],
      side: 'west',
      story: 'The traders along the slip pavement, who pay the marshals to keep their pitch.',
    },
    {
      id: 'rank',
      name: 'Onipanu danfo rank',
      kind: 'danfoRank',
      at: [47, 6],
      side: 'east',
      story: 'Danfos queue beyond the yard for the Onipanu run; the conductors count the toll into the fare.',
    },
    {
      id: 'yardLights',
      name: 'Tool-shed yard lamps',
      kind: 'floodlight',
      at: [47, 18],
      side: 'east',
      story: 'The yard where the Ring keeps the tools that build its barriers.',
    },
  ],
};

/** Mission 2, Junction Run: the Ring-controlled facilities and the side routes linking the junctions. */
export const FADEYI_SIDE_ROUTES: CampaignAreaDef = {
  id: 'fadeyiSomolu.sideRoutes',
  districtId: 'fadeyiSomolu',
  arenaId: SIDE_ROUTES_ARENA_ID,
  name: 'The Somolu Side Routes',
  summary:
    'North-east of the junction on the Somolu side: the Ring route office, the back lanes and their junctions, the Kobo vehicle pound and, behind the route checkpoint, the Onipanu slip road up to the highway.',
  format: 'field',
  missions: ['fadeyiSomolu.junctions'],
  place: {
    compass: 'NE',
    from: 'the Fadeyi junction (the City Rumble map)',
    neighbours: [
      { areaId: 'interchange', dir: 'N', via: 'the Onipanu slip road up to the Ikorodu Road barrier' },
      {
        areaId: 'fadeyiSomolu.tollCorridor',
        dir: 'SW',
        via: 'across the highway from the route office (the west lane)',
      },
    ],
  },
  subAreas: purposes(SIDE_ROUTES_SUB_AREAS, {
    office: 'The entry and the way back: the route office forecourt (ROUTE OFFICE); junction 1 at the lane mouth.',
    lanes:
      'Junctions 1-3 and the kept-clear centre junction; a marshal loops the west block, the crossing crews walk the lanes.',
    pound: 'The crossing crews’ base: the late crews loop the sheds and come out for the centre junction.',
    slip: 'Behind the route checkpoint (it lifts once the centre junction is held): the escape up the slip and its heavy.',
  }),
  sector: {
    id: 'fadeyiSomolu.sideRoutes',
    districtId: 'fadeyiSomolu',
    arenaId: SIDE_ROUTES_ARENA_ID,
    name: 'The Somolu side routes',
    area: 'The whole campaign board: the Ring route office, the Somolu back lanes, the Kobo vehicle pound and the Onipanu slip road; closed by buildings and the highway barrier north, buildings east and west, lock-ups south.',
    rects: [[2, 2, 47, 24]],
    barricades: [],
    // the route checkpoint lifts once the centre junction is held: the way to the slip road (decision WF4)
    gates: [{ id: 'routeCheckpoint', kind: 'checkpoint', tiles: areaCol(34, 13, 14), opensAfterLeg: 1 }],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [4, 12],
  exits: [
    { id: 'routeOffice', x: 5, y: 7, label: 'ROUTE OFFICE', leadsTo: 'fadeyiSomolu.boss' },
    { id: 'slipRoad', x: 45, y: 2, label: 'SLIP ROAD', leadsTo: 'interchange' },
  ],
  landmarks: [
    {
      id: 'highway',
      name: 'Ikorodu Road',
      kind: 'ikoroduRoad',
      at: [43, 0],
      side: 'north',
      story: 'The highway the slip climbs to: the junction the marshals sell by the hour.',
    },
    {
      id: 'officeSign',
      name: 'Kobo route office',
      kind: 'signBoard',
      at: [6, 0],
      side: 'north',
      story: 'The route office where the marshals keep the count of who crossed and who paid.',
    },
    {
      id: 'poundLights',
      name: 'Kobo vehicle pound lamps',
      kind: 'floodlight',
      at: [0, 19],
      side: 'west',
      story: 'The pound where the Ring tows the buses of drivers who would not pay.',
    },
    {
      id: 'footbridge',
      name: 'Onipanu footbridge',
      kind: 'footbridge',
      at: [49, 8],
      side: 'east',
      story: 'The footbridge beside the slip road: the way over the highway once the checkpoint lifts.',
    },
    {
      id: 'rank',
      name: 'Slip road danfo rank',
      kind: 'danfoRank',
      at: [49, 19],
      side: 'east',
      story: 'Danfos wait beside the slip for the junction run.',
    },
  ],
};

export const FADEYI_AREAS: readonly CampaignAreaDef[] = [FADEYI_TOLL_CORRIDOR, FADEYI_SIDE_ROUTES];
