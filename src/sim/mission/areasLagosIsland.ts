/**
 * Lagos Island's campaign areas (docs/CAMPAIGN_WORLD.md "Lagos Island", decisions WE5-WE8). The City Rumble map
 * (`rumbleLagosIsland`) stays the compact competitive interpretation of the district; these are two different places the
 * campaign walks at street scale.
 *
 *          (Balogun, Broad Street, the civic square, the Marina = the City Rumble map)
 *                 |                                            |
 *   lagosIsland.ledgerLanes (NW): the cloth lanes and   lagosIsland.pressYards (NE): the back streets and the
 *   the market road to the Ledger House records yard    infrastructure compounds round the press lane
 *                 \______ the back streets behind the records yard ______/
 *
 * Fictional names only (the Bible's naming rule): the Ileri cloth lanes, the Oke-Ayo market road, Ledger House, the
 * Olumo pump house, the Ireti substation.
 */
import { LEDGER_LANES_ARENA_ID, LEDGER_LANES_SUB_AREAS } from '../arenas/campaign/lagosLedgerLanes';
import {
  PRESS_LANE_GATE_Y,
  PRESS_YARDS_ARENA_ID,
  PRESS_YARDS_SUB_AREAS,
} from '../arenas/campaign/lagosPressYards';
import type { CampaignAreaDef, CampaignSubArea } from './areas';
import { areaCol, areaRow } from './areas';

const purposes = (
  subs: readonly { id: string }[],
  text: Readonly<Record<string, string>>,
): CampaignSubArea[] => subs.map((d) => ({ ...(d as CampaignSubArea), purpose: text[d.id] ?? '' }));

/** Mission 1, Ledger Row: the cloth lanes and the market road to the counter hall and the Ledger House records yard. */
export const LAGOS_LEDGER_LANES: CampaignAreaDef = {
  id: 'lagosIsland.ledgerLanes',
  districtId: 'lagosIsland',
  arenaId: LEDGER_LANES_ARENA_ID,
  name: 'The Ledger Lanes',
  summary:
    'Behind the Balogun trading maze: the Ileri cloth lanes, the Oke-Ayo market road the hand carts take to the offices, the traders’ counter hall court and, behind its compound wall, the Ledger House records yard where the Ring stamps its forged ledgers.',
  format: 'field',
  missions: ['lagosIsland.approach'],
  place: {
    compass: 'NW',
    from: 'the trading quarter (the City Rumble map)',
    neighbours: [
      { areaId: 'balogun', dir: 'S', via: 'the cloth lanes, out through the row gate' },
      { areaId: 'lagosIsland.pressYards', dir: 'E', via: 'the back streets behind the records yard' },
    ],
  },
  subAreas: purposes(LEDGER_LANES_SUB_AREAS, {
    lanes:
      'The entry and the way out: stall blocks and lock-ups in narrow lanes; a runner loops the lanes alone.',
    road: 'The market road the auditors walk and the row heavy holds; the hand-cart route to the records gate.',
    hall: 'The counter hall court to take back and keep for 25 seconds; an auditor loops the court, the hall watch rounds the kiosks.',
    records:
      'Behind the records gate (it opens once the hall is kept): the stamp machines in the yard, the annexe door and its heavy.',
  }),
  sector: {
    id: 'lagosIsland.ledgerLanes',
    districtId: 'lagosIsland',
    arenaId: LEDGER_LANES_ARENA_ID,
    name: 'The ledger lanes',
    area: 'The whole campaign board: the Ileri cloth lanes, the Oke-Ayo market road, the counter hall court and the Ledger House records yard; closed by office towers and the old registry north, buildings east and west and lock-ups south.',
    rects: [[2, 2, 49, 25]],
    barricades: [],
    // the records yard's steel gate opens once the counter hall is kept (a sector transition, decision WE6)
    gates: [{ id: 'recordsGate', kind: 'gate', tiles: areaCol(38, 17, 19), opensAfterLeg: 1 }],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [3, 24],
  exits: [
    { id: 'rowGate', x: 3, y: 21, label: 'ROW GATE', leadsTo: 'balogun' },
    { id: 'annexe', x: 44, y: 24, label: 'RECORDS ANNEXE', leadsTo: 'raid:recordsVault' },
  ],
  landmarks: [
    {
      id: 'towers',
      name: 'The Broad Street towers',
      kind: 'officeSkyline',
      at: [20, 0],
      side: 'north',
      story:
        'The office towers of the business district stand over the lanes; the Ring’s auditors work out of them.',
    },
    {
      id: 'cloth',
      name: 'Ileri cloth market',
      kind: 'clothStalls',
      at: [0, 12],
      side: 'west',
      story: 'The cloth traders whose ledgers the Ring stamps and taxes.',
    },
    {
      id: 'registry',
      name: 'Ledger House',
      kind: 'signBoard',
      at: [51, 6],
      side: 'east',
      story: 'The records office (fictional) where the forged ledgers are stamped and filed.',
    },
    {
      id: 'bridge',
      name: 'The island bridge approach',
      kind: 'bridgeDeck',
      at: [44, 0],
      side: 'north',
      story: 'The elevated approach from the mainland; its traffic never stops over the records yard.',
    },
  ],
};

/** Mission 2, Press Run: the back streets and the infrastructure compounds round the press lane. */
export const LAGOS_PRESS_YARDS: CampaignAreaDef = {
  id: 'lagosIsland.pressYards',
  districtId: 'lagosIsland',
  arenaId: PRESS_YARDS_ARENA_ID,
  name: 'The Press Yards',
  summary:
    'North-east of the records office: the narrow back streets behind the old houses, the walled Ireti substation and the Olumo pump house yard where the Ring hides its receipt presses, and the press lane, the only way out.',
  format: 'field',
  missions: ['lagosIsland.press'],
  place: {
    compass: 'NE',
    from: 'the trading quarter (the City Rumble map)',
    neighbours: [
      { areaId: 'lagosIsland.ledgerLanes', dir: 'W', via: 'the back streets behind the records yard' },
      { areaId: 'marina', dir: 'S', via: 'the press lane down to the Marina road' },
    ],
  },
  subAreas: purposes(PRESS_YARDS_SUB_AREAS, {
    streets:
      'The entry: the back streets between the old houses; Ring security walks the middle street end to end.',
    substation: 'The walled substation: presses among the transformer halls, a pressman minding them.',
    pumps: 'The pump house yard: presses by the pump halls and the water tanks, a thrower watching the yard.',
    lane: 'The press lane, the only way out: its guards block it until they are beaten, then the escape down it.',
  }),
  sector: {
    id: 'lagosIsland.pressYards',
    districtId: 'lagosIsland',
    arenaId: PRESS_YARDS_ARENA_ID,
    name: 'The press yards',
    area: 'The whole campaign board: the back streets, the Ireti substation, the Olumo pump house yard and the press lane; closed by office towers north, buildings east and west and lock-ups south.',
    rects: [[2, 2, 47, 25]],
    barricades: [],
    // the press lane's checkpoint lifts once the presses are wrecked (a sector transition, decision WE8)
    gates: [
      {
        id: 'laneCheckpoint',
        kind: 'checkpoint',
        tiles: areaRow(PRESS_LANE_GATE_Y, 40, 41),
        opensAfterLeg: 0,
      },
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [3, 3],
  exits: [
    { id: 'pressGate', x: 3, y: 8, label: 'PRESS GATE', leadsTo: 'lagosIsland.ledgerLanes' },
    { id: 'pressLane', x: 41, y: 24, label: 'PRESS LANE', leadsTo: 'marina' },
  ],
  landmarks: [
    {
      id: 'gantry',
      name: 'Ireti substation gantry',
      kind: 'gantry',
      at: [27, 0],
      side: 'north',
      story:
        'The substation feeds the island’s offices; the Ring runs its presses off its lines after hours.',
    },
    {
      id: 'substationSign',
      name: 'Ireti Substation',
      kind: 'signBoard',
      at: [49, 5],
      side: 'east',
      story: 'The board on the substation’s back wall (fictional), over the press lane’s head.',
    },
    {
      id: 'tank',
      name: 'Olumo pump house tank',
      kind: 'waterTower',
      at: [49, 20],
      side: 'east',
      story: 'The pump house’s raised tank stands over the press lane: the landmark you run for.',
    },
    {
      id: 'traders',
      name: 'Back-street traders',
      kind: 'clothStalls',
      at: [0, 15],
      side: 'west',
      story: 'The traders of the back streets, who sell the forged receipts on without knowing.',
    },
  ],
};

export const LAGOS_ISLAND_AREAS: readonly CampaignAreaDef[] = [LAGOS_LEDGER_LANES, LAGOS_PRESS_YARDS];
