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
import { fieldMissionOf } from './fieldDefs';
import { MISSION_DEFS } from './defs';
import { FINALE_BOSS_SECTORS, FINALE_SECTORS } from './finaleDefs';
import { CAMPAIGN_AREA_DEFS } from './campaignAreas';
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
  /**
   * The board the sector is stamped on: a campaign area's own campaign-only arena (`areas.ts`, decision WX2). Absent = the
   * district's City Rumble arena (the district sectors, DS1-DS8).
   */
  arenaId?: string;
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
  // Oshodi's two field missions play on their own campaign areas now (decisions WX5-WX9, `campaignAreas.ts`)
  // Mushin's Spare-Parts Row and Aisle Sweep play on their own campaign areas now (`mushin.partsRow`, `mushin.marketHall`,
  // decisions WM2-WM5, `areasMushin.ts`)
  // Fadeyi/Somolu's two field missions play on their own campaign areas now (decisions WF1-WF4, `campaignAreas.ts`)
  // Ebute-Metta's field mission plays on its own campaign area now (decisions WE1-WE3, `campaignAreas.ts`)
  // Lagos Island's two field missions play on their own campaign areas now (decisions WE5-WE8, `campaignAreas.ts`)
  // ---------------------------------------------------------------- Lekki
  // Lekki's two field missions play on their own campaign areas now (decisions WL1-WL5, `areasLekki.ts`)
];

/**
 * RETIRED district sectors, kept only where something still replays them: the old Terminal Approach sector of the Oshodi
 * City Rumble map is the board of the ARCHIVED combat pilot's replay (decision WX8, `archivedFieldDefs.ts`). Found by
 * `getSector`, never in `MISSION_SECTOR_IDS`.
 */
const LEGACY_SECTORS: readonly MissionSectorDef[] = [
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
];

// the Ojuelegba finale's field sectors (19, 20) follow the districts' (decision FN3; data in finaleDefs.ts); the campaign
// areas' play areas last (decision WX2: a campaign area's sector is its whole board's play area and its gates)
const fieldSectors: readonly MissionSectorDef[] = [
  ...defs,
  ...FINALE_SECTORS,
  ...CAMPAIGN_AREA_DEFS.filter((a) => a.format === 'field').map((a) => a.sector),
];

/** The field missions' sectors, one per field mission. */
export const MISSION_SECTORS: Readonly<Record<string, MissionSectorDef>> = Object.fromEntries(
  fieldSectors.map((d) => [d.id, d]),
);

export const MISSION_SECTOR_IDS: readonly string[] = fieldSectors.map((d) => d.id);

/**
 * Oshodi's boss mission, "Dispatch relays" (decision WX9): played on the City Rumble map's DISPATCH CORRIDOR, the band
 * of the main road, the interchange plaza, the expressway junction, the railway edge and the market front (rows 10-22),
 * where every relay node, the convoy lanes, the boss post and his crew are. Ring cordons close every street north
 * (the skywalk quarter) and south (the Cappa works, the bus park): jersey barriers, parked danfos, steel gates, Ring
 * checkpoints and a rail barrier by the platforms. The main road's mouths stay the board's own edges; the railcar,
 * the traffic waves and the bus departures run wholly inside, so the stage hazards stay on.
 */
const OSHODI_BOSS_SECTOR: MissionSectorDef = {
  id: 'oshodi.dispatchCorridor',
  districtId: 'oshodi',
  name: 'The dispatch corridor',
  area: 'The main road band of the interchange: the plaza, the junction, the railway edge and the market front, where the dispatch relays and the boss are; Ring cordons close the skywalk quarter north and the Cappa works and the bus park south.',
  rects: [[0, 10, 62, 22]],
  barricades: [
    // north: the skywalk quarter's streets
    b('northWest', 'barrier', row(9, 2, 9)),
    b('arcadeGap', 'gate', row(9, 14, 15)),
    b('towerQueue', 'checkpoint', row(9, 20, 25)),
    b('skywalkRank', 'bus', row(9, 29, 35)),
    b('platformNorth', 'barrier', row(9, 38, 41)),
    b('marketGate', 'gate', row(9, 45, 48)),
    b('marketAlley1', 'barrier', row(9, 50, 50)),
    b('marketAlley2', 'barrier', row(9, 56, 56)),
    b('marketAlley3', 'barrier', row(9, 60, 60)),
    // south: the Cappa works, the pitch and the freight yard
    b('worksRank', 'bus', row(23, 2, 9)),
    b('worksLane', 'barrier', row(23, 12, 14)),
    b('worksGate', 'gate', row(23, 17, 18)),
    b('pitchWest', 'barrier', row(23, 22, 26)),
    b('pitchCordon', 'barrier', row(23, 28, 31)),
    b('pitchPost', 'checkpoint', row(23, 32, 35)),
    b('platformSouth', 'rail', row(23, 38, 40)),
    b('yardFence', 'barrier', row(23, 45, 52)),
    b('yardRank', 'bus', row(23, 53, 56)),
    b('yardGate', 'gate', row(23, 57, 60)),
  ],
  viewMargin: 3,
  hazards: 'inside',
};

/**
 * Boss-mission sectors (`MissionDef.sectorId`, decision FN7): the Ojuelegba finale's boss and Oshodi's dispatch corridor
 * (WX9); a campaign area of the boss format would add its own.
 */
export const BOSS_SECTORS: Readonly<Record<string, MissionSectorDef>> = Object.fromEntries(
  [
    ...FINALE_BOSS_SECTORS,
    OSHODI_BOSS_SECTOR,
    ...CAMPAIGN_AREA_DEFS.filter((a) => a.format === 'boss').map((a) => a.sector),
  ].map((d) => [d.id, d]),
);

const LEGACY: Readonly<Record<string, MissionSectorDef>> = Object.fromEntries(
  LEGACY_SECTORS.map((d) => [d.id, d]),
);

export function getSector(id: string): MissionSectorDef {
  const def = MISSION_SECTORS[id] ?? BOSS_SECTORS[id] ?? LEGACY[id];
  if (!def) throw new Error(`unknown mission sector ${id}`);
  return def;
}

/**
 * The sector a mission is played in, or null: a field mission's own `sectorId`, or a boss mission's `MissionDef.sectorId`
 * (only the Ojuelegba finale's boss has one, decision FN7), unless `noSector` (a debug flag).
 */
export function missionSectorOf(spec: MissionSpec): MissionSectorDef | null {
  if (spec.noSector) return null;
  const id = spec.fieldId ? fieldMissionOf(spec).sectorId : MISSION_DEFS[spec.id]?.sectorId;
  return id ? getSector(id) : null;
}
