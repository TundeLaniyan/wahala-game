/**
 * CAMPAIGN AREAS (docs/CAMPAIGN_WORLD.md, decisions WX1-WX4): the campaign-only parts of a district a mission is played in.
 *
 * A district used to be its City Rumble map clipped to a sector (`sectors.ts`). A campaign area is a NEW place of the district
 * with its own painted board (`src/sim/arenas/campaign/`, a campaign-only arena that no menu lists); the Rumble map stays the
 * compact competitive interpretation of the district. Only the mission's own area is built, loaded and simulated.
 *
 * An area definition holds what the mission data does not:
 *
 *   id / districtId / arenaId    a stable area id, its district and its campaign-only board
 *   missions                     the missions played here (`FieldMissionDef.arenaId` / `sectorId` point back; tested)
 *   place                        where it lies in the district (a compass bearing from the interchange and its
 *                                neighbours, with the way through): continuity for the briefings and the docs
 *   subAreas                     the named parts of the board (the arena's `districts`): rects, role, purpose
 *   sector                       the play area as a `MissionSectorDef` (rects, the camera bounds through `viewMargin`, the
 *                                progressive gates that open as legs complete: the "sector transitions")
 *   entry / exits                where the player comes in and the ways on (the mission's start / exit / return markers)
 *   landmarks                    anchors for the presentation and the story: what stands where, and what it means
 *
 * Encounters (patrol routes, posts), objective props (doors, equipment) and checkpoints stay in the mission data
 * (`fieldDefs.ts`), where the runtime reads them; the tests check that they lie inside the area. Pure data.
 */
import type { DistrictDef } from '../arenas/types';
import type { Tile2 } from './defs';
import type { MissionSectorDef } from './sectors';
import type { MissionId } from './types';

export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface CampaignSubArea extends DistrictDef {
  /** What the part is for in the mission (one line, docs). */
  purpose: string;
}

/**
 * A landmark anchor: presentation and story data. `at` is a tile; off-board anchors (a footbridge over the north street, the
 * flyover beyond the edge) use the nearest board tile and a `side`. The renderer's campaign set builder draws `kind` with the
 * district's set kit (`render/arenas/campaign/`); a kind it does not know is skipped, never an error.
 */
export interface CampaignLandmark {
  id: string;
  /** Fictional name shown nowhere yet (docs, future briefings). */
  name: string;
  kind: 'footbridge' | 'flyover' | 'railViaduct' | 'danfoRank' | 'marketUmbrellas' | 'floodlight';
  at: Tile2;
  /** Off the board on this side (beyond the edge objects); absent = on the board's edge objects. */
  side?: 'north' | 'east' | 'west';
  /** What it is in the story (docs). */
  story: string;
}

export interface CampaignExit {
  id: string;
  x: number;
  y: number;
  label: string;
  /** The neighbouring area (or 'interchange', the district core) this way leads to. */
  leadsTo: string;
}

export interface CampaignAreaDef {
  id: string;
  districtId: MissionId;
  /** The campaign-only arena (`CAMPAIGN_ARENAS`). */
  arenaId: string;
  name: string;
  summary: string;
  /**
   * What is played here: field missions (`missions` are field mission ids, the sector is a field sector) or a district's boss
   * mission (`missions` is the district id, the sector is a boss sector: `MissionDef.sectorId`).
   */
  format: 'field' | 'boss';
  missions: readonly string[];
  place: {
    /** Bearing from the district core (the interchange the Rumble map is built round). */
    compass: Compass;
    from: string;
    neighbours: readonly { areaId: string; dir: Compass; via: string }[];
  };
  subAreas: readonly CampaignSubArea[];
  sector: MissionSectorDef;
  entry: Tile2;
  exits: readonly CampaignExit[];
  landmarks: readonly CampaignLandmark[];
}

/** A horizontal run of tiles (x0..x1 on row y). */
export const areaRow = (y: number, x0: number, x1: number): [number, number][] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y] as [number, number]);
/** A vertical run of tiles (y0..y1 on column x). */
export const areaCol = (x: number, y0: number, y1: number): [number, number][] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i] as [number, number]);
