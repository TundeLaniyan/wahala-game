/**
 * Ebute Metta / Oyingbo's campaign area (docs/CAMPAIGN_WORLD.md "Ebute Metta", decisions WE1-WE4). The City Rumble map
 * (`rumbleEbuteMetta`) stays the compact competitive interpretation of the district; this is the freight side of the
 * railway the campaign walks at street scale.
 *
 *        (the station: terminus, Station Boulevard, Oyingbo = the City Rumble map)
 *                                   |  the freight line south
 *              ebuteMetta.freightYard (S): cargo streets - level crossing - goods sidings / works compounds
 *                                   |  the goods yard (the railYardGoods raid, a standalone section)
 *
 * Fictional names only (the Bible's naming rule): Iron Lane, the Alafia level crossing, the Ajao works.
 */
import { FREIGHT_YARD_ARENA_ID, FREIGHT_YARD_SUB_AREAS } from '../arenas/campaign/ebuteFreightYard';
import type { CampaignAreaDef, CampaignSubArea } from './areas';
import { areaRow } from './areas';

const purposes = (
  subs: readonly { id: string }[],
  text: Readonly<Record<string, string>>,
): CampaignSubArea[] => subs.map((d) => ({ ...(d as CampaignSubArea), purpose: text[d.id] ?? '' }));

/** The district's field mission, Yard Approach: the cargo streets, the level crossing, the goods sidings and the works. */
export const EBUTE_FREIGHT_YARD: CampaignAreaDef = {
  id: 'ebuteMetta.freightYard',
  districtId: 'ebuteMetta',
  arenaId: FREIGHT_YARD_ARENA_ID,
  name: 'The Iron Lane Freight Yard',
  summary:
    'South of the station, where the freight line leaves the passenger tracks: the Iron Lane cargo streets, the Alafia level crossing, the Oyingbo goods sidings behind the yard fence and the Ajao works compounds with the signal shed.',
  format: 'field',
  missions: ['ebuteMetta.approach'],
  place: {
    compass: 'S',
    from: 'the station (the City Rumble map)',
    neighbours: [
      { areaId: 'station', dir: 'N', via: 'the freight line under the north bridge portal' },
      {
        areaId: 'raid:railYardGoods',
        dir: 'S',
        via: 'the freight line under the south portal to the goods yard',
      },
      { areaId: 'apapaRoad', dir: 'W', via: 'the freight road out of the yard gate' },
    ],
  },
  subAreas: purposes(FREIGHT_YARD_SUB_AREAS, {
    cargo:
      'The entry and the way out: two switch cabinets in the cargo streets, the street patrols looping the warehouses and lock-ups.',
    crossing:
      'The level crossing where the freight road meets the line: a switch cabinet by the track, the switchmen, the relief crew round the goods shed.',
    sidings:
      'Behind the yard fence (its steel gate opens once the cabinets are wrecked): the freight guards on the wagon lanes and the signal cabin to keep.',
    works:
      'The walled compounds and workshops: the last cabinet, the signal shed door and the yard lieutenant walking round it.',
  }),
  sector: {
    id: 'ebuteMetta.freightYard',
    districtId: 'ebuteMetta',
    arenaId: FREIGHT_YARD_ARENA_ID,
    name: 'The Iron Lane freight yard',
    area: 'The whole campaign board: the Iron Lane cargo streets, the Alafia level crossing, the Oyingbo goods sidings and the Ajao works compounds; closed by warehouses north, buildings east and west, lock-ups south and the freight line under its bridge portals.',
    rects: [[2, 2, 47, 27]],
    barricades: [],
    // the sidings gate in the yard fence opens once the switch cabinets are wrecked (a sector transition, decision WE2)
    gates: [{ id: 'sidingsGate', kind: 'gate', tiles: areaRow(13, 37, 39), opensAfterLeg: 0 }],
    viewMargin: 3,
    hazards: 'inside',
  },
  entry: [3, 26],
  exits: [
    { id: 'yardGate', x: 3, y: 24, label: 'YARD GATE', leadsTo: 'apapaRoad' },
    { id: 'shed', x: 41, y: 24, label: 'SIGNAL SHED', leadsTo: 'raid:junctionToolShed' },
  ],
  landmarks: [
    {
      id: 'viaduct',
      name: 'The freight line viaduct',
      kind: 'railViaduct',
      at: [22, 0],
      side: 'north',
      story:
        'The line from the station comes in over the warehouses; the switch cabinets route the Ring’s night freight off it.',
    },
    {
      id: 'trailers',
      name: 'Iron Lane trailer park',
      kind: 'trailerPark',
      at: [0, 15],
      side: 'west',
      story: 'Trailers wait outside the yard gate on the freight road for their loads.',
    },
    {
      id: 'cargoSign',
      name: 'Iron Lane Cargo Terminal',
      kind: 'signBoard',
      at: [0, 6],
      side: 'west',
      story: 'The bonded warehouses’ board over the yard gate road: where the cargo streets begin.',
    },
    {
      id: 'yardLights',
      name: 'Goods sidings floodlights',
      kind: 'floodlight',
      at: [49, 7],
      side: 'east',
      story: 'The sidings work through the night under the yard masts.',
    },
    {
      id: 'works',
      name: 'Ajao works',
      kind: 'smoke',
      at: [49, 22],
      side: 'east',
      story: 'The foundry and welding shops behind the compounds; their smoke hangs over the shed.',
    },
  ],
};

export const EBUTE_METTA_AREAS: readonly CampaignAreaDef[] = [EBUTE_FREIGHT_YARD];
