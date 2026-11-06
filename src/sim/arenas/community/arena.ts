/**
 * Assembles a researched community arena (`ArenaDef`) from its painted board and its data: the shared Rumble
 * rules (crush ring by ring around a named core, up to two lethal stage events at once), the explicit summoned-
 * vehicle lanes, floor traps and endgame waves, the stage hazards, the district graph and 32 balanced starts
 * (never on a hazard, a trap or beside a supply crate). Pure data; no rules live here.
 */
import type { ArenaDef, ArenaInfo, CoverRect, DistrictDef, DistrictLink, StageHazardDef } from '../types';
import type { Dir, TilePos } from '../../types';
import type { Board } from './painter';
import type { CoverLegend } from './painter';
import { RADIAL_CLEARANCE, around, balancedSpawns, rumbleStageConfig, trapGrid } from '../rumbleKit';

type Mark = readonly [number, number, 'o' | '~'];

export interface CommunitySpec {
  id: string;
  name: string;
  board: Board;
  legend: CoverLegend;
  /**
   * The object list, when the board is not painted in one piece (Ebute-Metta keeps its original objects' variants and adds the
   * expansion's own). Default: every connected run of the painted board's letters. Must match the board's letters exactly.
   */
  cover?: CoverRect[];
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
  /** Seeds of the two endgame trap waves: six marks each, drawn deterministically on open floor inside the core. */
  endgameSeeds?: readonly [number, number];
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
  // kept-clear plazas ('_') are open floor too: starts may stand on them
  const rows = layout.map((r) => r.replace(/_/g, '.'));
  const gaps = (s: readonly TilePos[]): number[] =>
    [8, 16, 32].map((n) => {
      let m = Infinity;
      const t = s.slice(0, n);
      for (let i = 0; i < t.length; i++)
        for (let j = i + 1; j < t.length; j++)
          m = Math.min(m, Math.abs(t[i]!.x - t[j]!.x) + Math.abs(t[i]!.y - t[j]!.y));
      return m;
    });
  // the farthest-point pick depends on where it starts: try the preferred start and its west neighbours, keep the
  // spread that best meets 8 / 16 / 32 starts at least 12 / 8 / 4 tiles apart (deterministic, authoring time)
  const starts: TilePos[] = [start];
  for (let dy = -6; dy <= 6; dy += 2)
    for (let dx = -6; dx <= 6; dx += 2) starts.push({ x: start.x + dx, y: start.y + dy });
  let best: TilePos[] = [];
  let bestScore = -1;
  for (const st of starts) {
    for (let n = 32; n >= 2; n -= 2) {
      let got: TilePos[];
      try {
        got = balancedSpawns(rows, n, st, RADIAL_CLEARANCE, avoid);
      } catch {
        continue; // try fewer
      }
      const g = gaps(got);
      const score = n === 32 ? Math.min(g[0]! / 12, g[1]! / 8, g[2]! / 4) : -1 + n / 100;
      if (score > bestScore) {
        bestScore = score;
        best = got;
      }
      break;
    }
    if (bestScore >= 1) break;
  }
  return best;
}

/** `count` trap marks on open floor ('.', '_', '=') inside the core, spread out, drawn with a seeded generator. */
function coreMarks(
  layout: readonly string[],
  core: { w: number; h: number; x0: number; y0: number },
  count: number,
  seed: number,
  not: ReadonlySet<string>,
): Mark[] {
  const cand: [number, number][] = [];
  for (let y = core.y0; y < core.y0 + core.h; y++)
    for (let x = core.x0; x < core.x0 + core.w; x++)
      if ('._='.includes(layout[y]?.[x] ?? '#') && !not.has(`${x},${y}`)) cand.push([x, y]);
  let t = seed >>> 0 || 1;
  const rnd = (): number => {
    t = (Math.imul(t ^ (t >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return t / 4294967296;
  };
  const out: Mark[] = [];
  while (out.length < count && cand.length) {
    // the candidate farthest (Manhattan) from the marks so far, among a few random draws: spread without a pattern
    let best = -1;
    let bestD = -1;
    for (let k = 0; k < 6; k++) {
      const i = Math.floor(rnd() * cand.length);
      const [x, y] = cand[i]!;
      const d = out.length ? Math.min(...out.map(([a, b]) => Math.abs(a - x) + Math.abs(b - y))) : 99;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    const [x, y] = cand.splice(best, 1)[0]!;
    out.push([x, y, out.length % 2 === 0 ? 'o' : '~']);
  }
  return out;
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
  const seeds = s.endgameSeeds ?? [11, 23];
  const used = new Set<string>([...s.traps].map(([x, y]) => `${x},${y}`));
  const wave1 = coreMarks(layout, s.core, 6, seeds[0], used);
  for (const [x, y] of wave1) used.add(`${x},${y}`);
  const wave2 = coreMarks(layout, s.core, 6, seeds[1], used);
  for (const [x, y] of [...s.traps, ...wave1, ...wave2]) avoid.push([x, y]);
  return {
    id: s.id,
    name: s.name,
    kind: 'rumble',
    layout,
    cover: s.cover ?? s.board.cover(s.legend),
    spawns: spawnsFor(layout, s.start, avoid),
    spawnClearance: RADIAL_CLEARANCE,
    mirrorSoftBlocks: false,
    maxPlayers: 32,
    forcedMode: 'crush',
    config: (() => {
      const base = rumbleStageConfig({ core: s.core, softDensity: s.softDensity, maxLethalEvents: 2 });
      // keep the shared stage's public-vehicle list (the Okada, decision VG1) next to this board's own lanes
      return {
        ...base,
        vehicles: { ...base.vehicles, lanes: s.lanes.map(([x, y, d]) => [x, y, d] as [number, number, Dir]) },
      };
    })(),
    floorTraps: trapGrid(s.traps, W, H),
    endgameTraps: [trapGrid(wave1, W, H), trapGrid(wave2, W, H)],
    stageHazards: s.hazards,
    info: s.info,
    districts: s.districts,
    districtLinks: s.links,
    futureBoss: { status: 'reserved', area: s.area, brief: s.boss },
  };
}

export const BOSS_BRIEF = (area: string, what: string): string =>
  `An original, legally distinct ${what} character, loosely inspired by a locally recognised ${area} icon to be chosen after documented local review and approved before any art. No real name, face, voice, clothing, biography, catchphrase or branding. Not implemented in the multiplayer map pass.`;
