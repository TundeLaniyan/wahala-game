/**
 * Assembles a researched community arena (`ArenaDef`) from its painted board and its data: the shared Rumble
 * rules (crush ring by ring around a named core, up to two lethal stage events at once), the explicit summoned-
 * vehicle lanes, floor traps and endgame waves, the stage hazards, the district graph and 32 balanced starts
 * (never on a hazard, a trap or beside a supply crate). Pure data; no rules live here.
 */
import type { ArenaDef, ArenaInfo, DistrictDef, DistrictLink, StageHazardDef } from '../types';
import type { Dir, TilePos } from '../../types';
import { Board } from './painter';
import type { CoverLegend } from './painter';
import { RADIAL_CLEARANCE, around, balancedSpawns, rumbleStageConfig, trapGrid } from '../rumbleKit';

type Mark = readonly [number, number, 'o' | '~'];

export interface CommunitySpec {
  id: string;
  name: string;
  board: Board;
  legend: CoverLegend;
  /** Marked supply crates ('$'), placed on the board. */
  supplies: readonly (readonly [number, number])[];
  /** Authored barrier crates ('x'): blasting one opens a shortcut. */
  barriers?: readonly (readonly [number, number])[];
  /** The core the Survival crush never closes (inclusive origin + size). */
  core: { w: number; h: number; x0: number; y0: number };
  softDensity: number;
  /** Summoned attack-vehicle entry lanes (road mouths only). */
  lanes: readonly [number, number, Dir][];
  traps: readonly Mark[];
  endgame: readonly [readonly Mark[], readonly Mark[]];
  hazards: StageHazardDef[];
  info: ArenaInfo;
  districts: DistrictDef[];
  links: DistrictLink[];
  /** The slot-0 (human) start is the west candidate nearest this tile. */
  start: TilePos;
  boss: string;
  area: string;
}

/**
 * 32 balanced starts. A board that cannot hold 32 returns as many as fit (the arena tests then fail loudly on the
 * count, and the authoring script still prints the board), never throws at import time.
 */
function spawnsFor(
  layout: readonly string[],
  start: TilePos,
  avoid: readonly (readonly [number, number])[],
): TilePos[] {
  for (let n = 32; n >= 2; n -= 2) {
    try {
      return balancedSpawns(layout, n, start, RADIAL_CLEARANCE, avoid);
    } catch {
      /* try fewer */
    }
  }
  return [];
}

export function communityArena(s: CommunitySpec): ArenaDef {
  for (const [x, y] of s.supplies) s.board.set(x, y, '$');
  for (const [x, y] of s.barriers ?? []) s.board.set(x, y, 'x');
  const layout = s.board.layout(s.legend);
  const W = s.board.w;
  const H = s.board.h;
  const avoid: [number, number][] = [...around(s.supplies, 2)];
  for (const h of s.hazards) {
    if (h.kind === 'sweep') for (const r of h.routes) avoid.push(...r);
    if (h.kind === 'strike') for (const z of h.zones) avoid.push(...z);
    if (h.kind === 'push') for (const z of h.zones) avoid.push(...z.tiles);
  }
  for (const [x, y] of [...s.traps, ...s.endgame[0], ...s.endgame[1]]) avoid.push([x, y]);
  return {
    id: s.id,
    name: s.name,
    kind: 'rumble',
    layout,
    cover: s.board.cover(s.legend),
    spawns: spawnsFor(layout, s.start, avoid),
    spawnClearance: RADIAL_CLEARANCE,
    mirrorSoftBlocks: false,
    maxPlayers: 32,
    forcedMode: 'crush',
    config: {
      ...rumbleStageConfig({ core: s.core, softDensity: s.softDensity, maxLethalEvents: 2 }),
      vehicles: { lanes: s.lanes.map(([x, y, d]) => [x, y, d] as [number, number, Dir]) },
    },
    floorTraps: trapGrid(s.traps, W, H),
    endgameTraps: [trapGrid(s.endgame[0], W, H), trapGrid(s.endgame[1], W, H)],
    stageHazards: s.hazards,
    info: s.info,
    districts: s.districts,
    districtLinks: s.links,
    futureBoss: { status: 'reserved', area: s.area, brief: s.boss },
  };
}

export const BOSS_BRIEF = (area: string, what: string): string =>
  `An original, legally distinct ${what} character, loosely inspired by a locally recognised ${area} icon to be chosen after documented local review and approved before any art. No real name, face, voice, clothing, biography, catchphrase or branding. Not implemented in the multiplayer map pass.`;
