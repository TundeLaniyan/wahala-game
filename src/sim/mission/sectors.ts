/**
 * District SECTOR data (docs/CAMPAIGN_SECTOR_AI.md, "District-sector architecture", decisions DS1-DS8): the part of a
 * district's City Rumble map a mission is played in. The district keeps its whole layout; the sector is stamped into
 * the board at match creation (`sector.ts`).
 *
 *   rects       inclusive tile rectangles [x0, y0, x1, y1] (two or three make an L or a T); the play area
 *   barricades  the tiles just outside the rects (or on their edge) that close every opening of the rects: they become
 *               concrete and are drawn as believable objects - a parked danfo, a jersey barrier with bollards, a steel
 *               gate wall, a Ring checkpoint kiosk, a rail barrier (render/views/SectorBarricades.ts). Never soft crates
 *               (a blast would open them) and never an invisible wall
 *   gates       optional barricades that OPEN (concrete -> floor) once a given leg is completed
 *   viewMargin  tiles of scenery the follow camera may show beyond the rects (also the render clip and the minimap crop)
 *   hazards     'inside': keep only the arena's scheduled hazards whose every tile lies inside the rects (drops land
 *               inside only); 'none': no scheduled hazard (manholes keep working inside)
 *
 * `tests/mission-sectors.test.ts` floods every sector from its mission's start and proves the play area never leaves
 * the rects, that every authored tile is inside, and that every leg target is reachable.
 */
import { FIELD_MISSION_DEFS } from './fieldDefs';
import type { MissionId, MissionSpec } from './types';

/** Inclusive tile rectangle [x0, y0, x1, y1]. */
export type SectorRect = readonly [number, number, number, number];

/** What a barricade is, for the renderer. */
export type BarricadeKind = 'bus' | 'barrier' | 'gate' | 'rail' | 'checkpoint';

export interface SectorBarricadeDef {
  id: string;
  kind: BarricadeKind;
  tiles: readonly (readonly [number, number])[];
}

export interface SectorGateDef extends SectorBarricadeDef {
  /** The gate opens when the field leg with this index is completed. */
  opensAfterLeg: number;
}

export type SectorHazardPolicy = 'inside' | 'none';

export interface MissionSectorDef {
  id: string;
  districtId: MissionId;
  /** Short name of the portion of the district ("Terminal approach streets"). */
  name: string;
  /** One line on what part of the district it is and what bounds it (docs table). */
  area: string;
  rects: readonly SectorRect[];
  barricades: readonly SectorBarricadeDef[];
  gates?: readonly SectorGateDef[];
  viewMargin: number;
  hazards: SectorHazardPolicy;
}

type T = readonly [number, number];
/** A horizontal run of tiles (x0..x1 on row y). */
const row = (y: number, x0: number, x1: number): T[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y] as const);
/** A vertical run of tiles (y0..y1 on column x). */
const col = (x: number, y0: number, y1: number): T[] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i] as const);
const b = (id: string, kind: BarricadeKind, tiles: T[]): SectorBarricadeDef => ({ id, kind, tiles });

const defs: MissionSectorDef[] = [
  // ---------------------------------------------------------------- Oshodi
  {
    id: 'oshodi.terminalApproach',
    districtId: 'oshodi',
    name: 'Terminal approach streets',
    area: 'The two southern stall streets from the Orita gate to the dispatch depot entrance; closed by the terminal wall, a danfo rank and a Ring checkpoint on the alleys north, the depot gate and a parked bus east.',
    rects: [[2, 37, 35, 44]],
    barricades: [
      b('alley1', 'barrier', row(36, 2, 2)),
      b('alley2', 'barrier', row(36, 7, 8)),
      b('alley3', 'checkpoint', row(36, 13, 14)),
      b('alley4', 'barrier', row(36, 19, 20)),
      b('rank', 'bus', row(36, 25, 27)),
      b('alley5', 'barrier', row(36, 35, 35)),
      b('depotGate', 'gate', col(36, 37, 39)),
      b('depotBus', 'bus', col(36, 41, 44)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  {
    id: 'oshodi.railEdge',
    districtId: 'oshodi',
    name: 'Rail edge, market and footbridge',
    area: 'The interchange plaza at the end of the rail line, the east market lanes and the footbridge stairs; closed by the rail buffer fence north, a bus and a yard fence west, the depot wall south-west.',
    rects: [
      [31, 26, 60, 34],
      [37, 35, 60, 44],
    ],
    barricades: [
      b('railFenceW', 'rail', row(25, 32, 35)),
      b('railFenceE', 'rail', row(25, 38, 40)),
      b('northLane', 'barrier', row(25, 45, 47)),
      b('northBus', 'bus', row(25, 55, 58)),
      b('plazaBus', 'bus', col(30, 26, 28)),
      b('plazaFence', 'gate', col(30, 29, 32)),
      b('depotCorner', 'barrier', row(35, 35, 36)),
      b('depotWall', 'gate', col(36, 36, 39)),
      b('depotBus', 'bus', col(36, 41, 44)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  // ---------------------------------------------------------------- Mushin
  {
    id: 'mushin.sparePartsRow',
    districtId: 'mushin',
    name: 'Spare-parts row and loading bay',
    area: 'The southern stall rows, the back aisle and the loading bay to the parts storeroom; the lanes north to the motor road are closed by parked danfos, barriers and a Ring checkpoint.',
    rects: [[2, 28, 50, 36]],
    barricades: [
      b('lane1', 'barrier', row(27, 2, 3)),
      b('plazaBus', 'bus', row(27, 7, 9)),
      b('plazaBar', 'barrier', row(27, 10, 11)),
      b('rowBusW', 'bus', row(27, 13, 15)),
      b('rowBusE', 'bus', row(27, 16, 18)),
      b('lane2', 'barrier', row(27, 22, 22)),
      b('lane3', 'barrier', row(27, 26, 26)),
      b('ringPost', 'checkpoint', row(27, 29, 30)),
      b('bayBus', 'bus', row(27, 33, 35)),
      b('lane4', 'barrier', row(27, 42, 42)),
      b('eastBus', 'bus', row(27, 48, 50)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  {
    id: 'mushin.northAisles',
    districtId: 'mushin',
    name: 'North market aisles and top street',
    area: 'The northern market blocks from the market gate to the top street; the five alley mouths onto the motor road are closed by steel gates, barriers and a Ring checkpoint.',
    rects: [[2, 2, 50, 13]],
    barricades: [
      b('mouth1', 'gate', row(14, 8, 9)),
      b('mouth2', 'barrier', row(14, 17, 18)),
      b('mouth3', 'checkpoint', row(14, 25, 26)),
      b('mouth4', 'barrier', row(14, 34, 35)),
      b('mouth5', 'gate', row(14, 42, 43)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  // ---------------------------------------------------------------- Fadeyi / Somolu
  {
    id: 'fadeyiSomolu.tollRoad',
    districtId: 'fadeyiSomolu',
    name: 'Toll approach and shed yard',
    area: 'The southern block between the expressway and the back wall: the toll approach road, the tool shed and the plaza; the expressway kerb is lined with barriers, parked buses and the Ring toll post, the side road is railed off.',
    rects: [[2, 21, 41, 30]],
    barricades: [
      b('kerb1', 'barrier', row(20, 2, 7)),
      b('kerbBus1', 'bus', row(20, 8, 10)),
      b('kerb2', 'barrier', row(20, 11, 17)),
      b('kerbBus2', 'bus', row(20, 18, 20)),
      b('kerb3', 'barrier', row(20, 21, 28)),
      b('tollPost', 'checkpoint', row(20, 29, 31)),
      b('kerb4', 'barrier', row(20, 32, 37)),
      b('kerbBus3', 'bus', row(20, 38, 41)),
      b('sideRoadN', 'barrier', col(42, 21, 23)),
      b('sideRoadS', 'gate', col(42, 26, 30)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  {
    id: 'fadeyiSomolu.northJunctions',
    districtId: 'fadeyiSomolu',
    name: 'North junction streets',
    area: 'The northern block of junction streets and the route office up to the slip road; the expressway kerb is lined with barriers, a danfo rank and a Ring post, the side road is railed off.',
    rects: [[2, 2, 41, 11]],
    barricades: [
      b('kerb1', 'barrier', row(12, 2, 6)),
      b('kerbBus1', 'bus', row(12, 7, 9)),
      b('kerb2', 'barrier', row(12, 10, 16)),
      b('ringPost', 'checkpoint', row(12, 17, 19)),
      b('kerb3', 'barrier', row(12, 20, 26)),
      b('kerbBus2', 'bus', row(12, 27, 29)),
      b('kerb4', 'barrier', row(12, 30, 37)),
      b('kerbBus3', 'bus', row(12, 38, 41)),
      b('sideRoadN', 'barrier', col(42, 5, 6)),
      b('sideRoadS', 'gate', col(42, 9, 11)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  // ---------------------------------------------------------------- Ebute-Metta
  {
    id: 'ebuteMetta.yardApproach',
    districtId: 'ebuteMetta',
    name: 'Yard streets and the sidings',
    area: 'The southern yard streets from the yard gate past the lock-ups to the signal shed, and behind the sidings gate the wagon lanes, the signal cabin and the track end; the rail line ends at a buffer stop, the yard fence closes the east, Murtala Muhammed Way is lined with barriers and a parked bus.',
    // the yard streets, then the sidings north of them (closed until the switch cabinets are wrecked: decision DB2)
    rects: [
      [15, 26, 57, 36],
      [38, 20, 57, 25],
    ],
    barricades: [
      b('mouth1', 'barrier', row(25, 17, 19)),
      b('mouth2', 'barrier', row(25, 26, 27)),
      b('mouth3', 'checkpoint', row(25, 31, 33)),
      // the wall between the streets and the sidings (the sidings gate is its east end)
      b('yardBus', 'bus', row(25, 38, 40)),
      b('yardBar', 'barrier', row(25, 41, 45)),
      b('bufferStop', 'rail', row(25, 46, 47)),
      b('yardBar2', 'barrier', row(25, 48, 48)),
      b('westN', 'barrier', col(14, 26, 27)),
      b('westM', 'gate', col(14, 31, 32)),
      b('westS', 'barrier', col(14, 35, 36)),
      b('yardFenceN', 'gate', col(58, 27, 31)),
      b('yardFenceS', 'gate', col(58, 32, 36)),
      // the sidings: the street west of the signal cabin, Murtala Muhammed Way north, the timber yard east
      b('cabinStreet', 'barrier', row(22, 37, 37)),
      b('roadBarW', 'barrier', row(19, 42, 45)),
      b('trackBuffer', 'rail', row(19, 46, 47)),
      b('roadBus', 'bus', row(19, 48, 51)),
      b('roadBarE', 'barrier', row(19, 52, 55)),
      b('roadBarEnd', 'barrier', row(19, 57, 57)),
      b('timberN', 'barrier', col(58, 20, 20)),
      b('timberS', 'gate', col(58, 23, 24)),
    ],
    gates: [{ id: 'sidingsGate', kind: 'gate', tiles: row(25, 53, 57), opensAfterLeg: 0 }],
    viewMargin: 3,
    hazards: 'inside',
  },
  // ---------------------------------------------------------------- Lagos Island
  {
    id: 'lagosIsland.ledgerRow',
    districtId: 'lagosIsland',
    name: 'Ledger row and records annexe',
    area: 'The south-west office block: the ledger counters and the records annexe; the marina road is lined with barriers and parked buses, the side street is railed off and the alleys north carry bollards.',
    rects: [[2, 18, 23, 30]],
    barricades: [
      b('alley1', 'barrier', row(17, 4, 4)),
      b('alley2', 'barrier', row(17, 7, 7)),
      b('alley3', 'gate', row(17, 10, 11)),
      b('alley4', 'barrier', row(17, 13, 13)),
      b('alley5', 'barrier', row(17, 16, 16)),
      b('alley6', 'barrier', row(17, 19, 19)),
      b('laneTop', 'checkpoint', row(17, 22, 23)),
      b('sideKerb1', 'barrier', col(24, 18, 22)),
      b('sideBus', 'bus', col(24, 23, 25)),
      b('sideKerb2', 'barrier', col(24, 26, 30)),
      b('marina1', 'barrier', row(31, 2, 7)),
      b('marinaBus', 'bus', row(31, 8, 10)),
      b('marina2', 'barrier', row(31, 11, 16)),
      b('marinaBus2', 'bus', row(31, 17, 19)),
      b('marina3', 'barrier', row(31, 22, 23)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  {
    id: 'lagosIsland.pressGrid',
    districtId: 'lagosIsland',
    name: 'Ledger grid and press lane',
    area: 'The north-west grid of ledger offices and the press lane down the side street; the side road is lined with barriers, buses and a Ring checkpoint, the alleys south carry bollards.',
    rects: [
      [2, 2, 23, 15],
      [22, 16, 23, 21],
    ],
    barricades: [
      b('kerb1', 'barrier', col(24, 2, 6)),
      b('kerbBus1', 'bus', col(24, 7, 9)),
      b('kerb2', 'barrier', col(24, 10, 13)),
      b('ringPost', 'checkpoint', col(24, 14, 15)),
      b('kerb3', 'barrier', col(24, 16, 18)),
      b('kerbBus2', 'bus', col(24, 19, 21)),
      b('alley1', 'barrier', row(16, 4, 4)),
      b('alley2', 'barrier', row(16, 7, 7)),
      b('alley3', 'gate', row(16, 10, 11)),
      b('alley4', 'barrier', row(16, 13, 13)),
      b('alley5', 'barrier', row(16, 16, 16)),
      b('alley6', 'barrier', row(16, 19, 19)),
      b('laneEnd', 'gate', row(22, 22, 23)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  // ---------------------------------------------------------------- Lekki
  {
    id: 'lekki.gateApproach',
    districtId: 'lekki',
    name: 'Garden wall approach',
    area: 'The south-west estate block: the garden, the pool edge and the standby plant, with the closed stretch of the estate road; Ring gatehouses close the road at both ends, barriers line the expressway kerbs.',
    rects: [[2, 21, 33, 29]],
    barricades: [
      b('gardenGate1', 'gate', row(20, 8, 9)),
      b('gardenGate2', 'gate', row(20, 14, 15)),
      b('gatehouseN', 'checkpoint', row(20, 20, 23)),
      b('kerbN', 'barrier', row(20, 24, 25)),
      b('kerbNBus', 'bus', row(20, 28, 30)),
      b('eastLawn', 'barrier', col(34, 24, 25)),
      b('eastCorner', 'barrier', col(34, 29, 29)),
      b('kerbS0', 'barrier', row(30, 2, 2)),
      b('kerbS1', 'barrier', row(30, 5, 9)),
      b('kerbS2', 'bus', row(30, 12, 14)),
      b('kerbS3', 'barrier', row(30, 15, 16)),
      b('kerbS4', 'barrier', row(30, 19, 19)),
      b('gatehouseS', 'checkpoint', row(30, 20, 23)),
      b('kerbS5', 'barrier', row(30, 24, 29)),
      b('kerbSBus', 'bus', row(30, 30, 33)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
  {
    id: 'lekki.northEstate',
    districtId: 'lekki',
    name: 'North drive and east lawn',
    area: 'The north drive, the central lawn and the east lawn down to the service road; a Ring gatehouse closes the estate road, the estate wall and barriers close the lawn edges.',
    rects: [
      [2, 2, 36, 9],
      [24, 6, 54, 14],
    ],
    barricades: [
      b('westLawn', 'barrier', row(10, 5, 7)),
      b('lawnEdge', 'barrier', row(10, 12, 15)),
      b('estateWall', 'gate', row(10, 16, 19)),
      b('gatehouse', 'checkpoint', row(10, 20, 23)),
      b('roadSide', 'barrier', col(23, 13, 14)),
      b('south1', 'barrier', row(15, 24, 25)),
      b('south2', 'barrier', row(15, 30, 31)),
      b('southBus', 'bus', row(15, 34, 36)),
      b('south3', 'barrier', row(15, 42, 42)),
      b('south4', 'barrier', row(15, 48, 48)),
      b('serviceGate', 'gate', row(15, 54, 54)),
    ],
    viewMargin: 3,
    hazards: 'inside',
  },
];

export const MISSION_SECTORS: Readonly<Record<string, MissionSectorDef>> = Object.fromEntries(
  defs.map((d) => [d.id, d]),
);

export const MISSION_SECTOR_IDS: readonly string[] = defs.map((d) => d.id);

export function getSector(id: string): MissionSectorDef {
  const def = MISSION_SECTORS[id];
  if (!def) throw new Error(`unknown mission sector ${id}`);
  return def;
}

/**
 * The sector a mission is played in, or null: a field mission's own `sectorId` (unless `noSector`, a debug flag). Boss
 * missions have none in this pass (a `MissionDef.sectorId` can be read here later without touching the stamp).
 */
export function missionSectorOf(spec: MissionSpec): MissionSectorDef | null {
  if (spec.noSector || !spec.fieldId) return null;
  const id = FIELD_MISSION_DEFS[spec.fieldId]?.sectorId;
  return id ? getSector(id) : null;
}
