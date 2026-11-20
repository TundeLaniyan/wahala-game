/**
 * The Ojuelegba finale's campaign areas (docs/CAMPAIGN_WORLD.md "The Ojuelegba finale", decisions WL6-WL9). The City Rumble
 * map (`rumbleOjuelegba`, the reference arena the story opens on) stays exactly as it is; the finale's two field missions walk
 * the streets round it that it does not have, drawn with its own pieces so the return reads as the same junction:
 *
 *                     ojuelegba.busInterchange (N): the flyover running on north over the bus stops,
 *                     the under-bridge market and the Ring's control yard (mission 20)
 *                                         |
 *                     the junction (the City Rumble map; the boss's danfo yard is its east pocket)
 *                                         |
 *                     ojuelegba.southStreets (S): the motor park, the shop street, the vulcanisers' yard
 *                     and the corner under the flyover's south ramp (mission 19)
 *
 * Fictional names only (the Bible's naming rule): the Ijoko motor park, the Kekere shop street.
 */
import { SOUTH_STREETS_ARENA_ID, SOUTH_STREETS_SUB_AREAS } from '../arenas/campaign/ojuelegbaSouthStreets';
import {
  BUS_INTERCHANGE_ARENA_ID,
  BUS_INTERCHANGE_SUB_AREAS,
} from '../arenas/campaign/ojuelegbaBusInterchange';
import type { CampaignAreaDef, CampaignSubArea } from './areas';
import { areaCol, areaRow } from './areas';

const purposes = (
  subs: readonly { id: string }[],
  text: Readonly<Record<string, string>>,
): CampaignSubArea[] => subs.map((d) => ({ ...(d as CampaignSubArea), purpose: text[d.id] ?? '' }));

/** Mission 19, Return to Ojuelegba: the motor park, the shop street, the vulcanisers' yard and the flyover ramp corner. */
export const OJUELEGBA_SOUTH_STREETS: CampaignAreaDef = {
  id: 'ojuelegba.southStreets',
  districtId: 'ojuelegba',
  arenaId: SOUTH_STREETS_ARENA_ID,
  name: 'Ojuelegba South Streets',
  summary:
    'South of the junction, the way home: the Ijoko motor park where the danfos drop you, the Kekere shop street and its back street, the vulcanisers yard behind the Ring barrier, and the corner under the flyover south ramp behind the Ring gate.',
  format: 'field',
  missions: ['ojuelegba.return'],
  place: {
    compass: 'S',
    from: 'the junction under the flyover (the City Rumble map)',
    neighbours: [
      {
        areaId: 'junction',
        dir: 'N',
        via: 'the corner under the flyover south ramp (the junction is just beyond it)',
      },
      { areaId: 'shopfrontLane', dir: 'NE', via: 'the Kekere shop street runs on into the shopfront lane' },
    ],
  },
  subAreas: purposes(SOUTH_STREETS_SUB_AREAS, {
    rampCorner:
      'Behind the Ring gate (open once its locks are blasted): the piers, the bus stop and the JUNCTION CORNER.',
    tyreYard:
      'Behind the lane barrier (open once its locks are blasted): the gate locks, the lock guard and the lane runner.',
    shopStreet: 'A Ring patrol loops the shops; the barrier heavy minds the barrier locks at the street end.',
    motorPark: 'The entry: the danfos drop you here and a Ring patrol loops a danfo row.',
  }),
  sector: {
    id: 'ojuelegba.southStreets',
    districtId: 'ojuelegba',
    arenaId: SOUTH_STREETS_ARENA_ID,
    name: 'The south streets',
    area: 'The whole campaign board: the motor park, the Kekere shop street, the vulcanisers yard and the ramp corner; closed by buildings north, east and west and the lock-ups south.',
    rects: [[2, 2, 45, 25]],
    barricades: [],
    // the Ring's two gates (decision FN3, kept): the lane barrier opens when its locks are blasted (leg 1), the corner gate
    // when its gate locks are (leg 2)
    gates: [
      { id: 'laneBarrier', kind: 'gate', tiles: areaCol(13, 19, 22), opensAfterLeg: 1 },
      { id: 'cornerGate', kind: 'gate', tiles: areaRow(12, 2, 7), opensAfterLeg: 2 },
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [44, 24],
  exits: [
    { id: 'junctionCorner', x: 7, y: 3, label: 'JUNCTION CORNER', leadsTo: 'junction' },
    { id: 'motorPark', x: 44, y: 22, label: 'IJOKO MOTOR PARK', leadsTo: 'ojuelegba.busInterchange' },
  ],
  landmarks: [
    {
      id: 'flyover',
      name: 'The Ojuelegba flyover',
      kind: 'flyover',
      at: [7, 0],
      side: 'north',
      story:
        'The flyover the story opens under: its south ramp comes down over the corner, the junction beyond.',
    },
    {
      id: 'danfos',
      name: 'Ijoko motor park rank',
      kind: 'danfoRank',
      at: [47, 14],
      side: 'east',
      story: 'The danfos that brought you home queue for the next run; the conductors call the routes.',
    },
    {
      id: 'traders',
      name: 'Kekere street traders',
      kind: 'marketUmbrellas',
      at: [23, 0],
      side: 'north',
      story: 'The traders of the back street: the first faces to see the Ring pushed out of the lane.',
    },
    {
      id: 'vulcaniser',
      name: 'The vulcaniser',
      kind: 'smoke',
      at: [0, 18],
      side: 'west',
      story: 'The vulcaniser burning tyre wire behind the yard: the smoke you can see from the motor park.',
    },
  ],
};

/** Mission 20, Hold the Junction: the west road, the bus stop under the deck, the under-bridge market, the Ring yard. */
export const OJUELEGBA_BUS_INTERCHANGE: CampaignAreaDef = {
  id: 'ojuelegba.busInterchange',
  districtId: 'ojuelegba',
  arenaId: BUS_INTERCHANGE_ARENA_ID,
  name: 'Ojuelegba Underbridge Interchange',
  summary:
    'North of the junction, where the flyover runs on over the bus stops: the west approach road, the bus stop island under the deck, the under-bridge market between the piers and the Ring control yard behind its wall.',
  format: 'field',
  missions: ['ojuelegba.junction'],
  place: {
    compass: 'N',
    from: 'the junction under the flyover (the City Rumble map)',
    neighbours: [
      { areaId: 'junction', dir: 'S', via: 'the through road south under the deck to the pier court' },
      { areaId: 'serviceLoop', dir: 'SE', via: 'the Ring yard gate to the rear service loop' },
    ],
  },
  subAreas: purposes(BUS_INTERCHANGE_SUB_AREAS, {
    westRoad: 'The entry and the way out: the kerb islands, kiosks and the WEST PAVEMENT.',
    busStop: 'The bus stop to keep for 25 s; a Ring agbero loops the kiosks under the north girder.',
    market:
      'The lieutenant minds the control box by the south pier; a market enforcer and a Ring guard loop the stalls.',
    ringYard:
      'The east wave comes from here: two area boys loop the workshops; a control box stands by the yard.',
  }),
  sector: {
    id: 'ojuelegba.busInterchange',
    districtId: 'ojuelegba',
    arenaId: BUS_INTERCHANGE_ARENA_ID,
    name: 'The underbridge interchange',
    area: 'The whole campaign board: the west approach road, the bus stop under the deck, the under-bridge market and the Ring control yard; closed by buildings north, east and west and the lock-ups south.',
    rects: [[2, 2, 45, 25]],
    barricades: [],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [4, 19],
  exits: [
    { id: 'westPavement', x: 5, y: 14, label: 'WEST PAVEMENT', leadsTo: 'junction' },
    { id: 'yardGate', x: 44, y: 14, label: 'YARD GATE', leadsTo: 'ojuelegba.boss' },
  ],
  landmarks: [
    {
      id: 'flyover',
      name: 'The Ojuelegba flyover',
      kind: 'flyover',
      at: [22, 0],
      side: 'north',
      story: 'The flyover runs on north over the bus stops: the same deck the junction sits under.',
    },
    {
      id: 'danfos',
      name: 'Interchange danfo rank',
      kind: 'danfoRank',
      at: [0, 12],
      side: 'west',
      story: 'Danfos waiting at the west mouth: the conductors want the bus stop back.',
    },
    {
      id: 'market',
      name: 'Underbridge market',
      kind: 'marketUmbrellas',
      at: [0, 22],
      side: 'west',
      story: 'The traders who sell under the bridge: the Ring taxes every stall from its control yard.',
    },
    {
      id: 'yardLights',
      name: 'Ring yard floodlights',
      kind: 'floodlight',
      at: [47, 10],
      side: 'east',
      story: 'The Ring yard lamps: the control boxes it runs the junction from.',
    },
  ],
};

export const OJUELEGBA_AREAS: readonly CampaignAreaDef[] = [
  OJUELEGBA_SOUTH_STREETS,
  OJUELEGBA_BUS_INTERCHANGE,
];
