/**
 * CAMPAIGN-ONLY boards (docs/CAMPAIGN_WORLD.md "How to add a campaign area", decisions WX1-WX4): a field mission's own map,
 * painted as letter rows with a district's object kit and assembled into an `ArenaDef` that no menu ever lists.
 *
 * A board is written as rows of characters, exactly as it reads on the screen (north at the top, the camera looking north):
 *
 *   '.'  open floor            '_'  kept-clear floor (no random crate: a plaza, a hold zone, a loading apron)
 *   '='  road / track (open floor, never a crate)
 *   'x'  an authored barrier crate (blast it to open a shortcut)     '$'  a marked supply crate
 *   any letter of the `legend`  a permanent object (a terminal wing, a parked danfo, a stall block ...): '#' in the sim
 *
 * There is no raw '#': every solid tile is a real object of the district (tested), so the play area is closed by buildings,
 * parked buses, walls and fences, never by an invisible edge. The same rows give the simulation's layout and the renderer's
 * cover map, so the two cannot drift apart. Pure data: no rules, no random numbers (the endgame marks use a seeded
 * generator at authoring time, like the community boards).
 */
import type { ArenaDef, ArenaInfo, CoverRect, DistrictDef, StageHazardDef } from '../types';
import type { TilePos } from '../../types';
import type { CoverLegend } from '../community/painter';
import { RADIAL_CLEARANCE, around, balancedSpawns, rumbleStageConfig, trapGrid } from '../rumbleKit';

export type TrapMark = readonly [number, number, 'o' | '~'];

/** The object letters of a district kit: letter -> the renderer's object kind (presentation data). */
export type CampaignLegend = Readonly<Record<string, string>>;

/**
 * A COMMUNITY district's letter kit as a campaign legend (docs/CAMPAIGN_WORLD.md "How to add a campaign area", step 2): the
 * district's own `CoverLegend` (Mushin, Fadeyi/Somolu, Ebute Metta, Lagos Island, Lekki: exported by its Rumble arena
 * module), letter -> family kind. Pass it as `legend` with `cover: board.cover(LEGEND)`.
 */
export function communityLegend(legend: CoverLegend): CampaignLegend {
  return Object.fromEntries(Object.entries(legend).map(([c, d]) => [c, d.kind]));
}

export interface CampaignBoardSpec {
  id: string;
  name: string;
  /** The painted board, north first (see the file header). All rows the same width. */
  rows: readonly string[];
  legend: CampaignLegend;
  /** The human's start tile (spawn slot 0 is the open tile nearest it). */
  start: TilePos;
  /** The sub-areas of the board (named parts of the area: they become `ArenaDef.districts`). */
  subAreas: readonly DistrictDef[];
  /** Whole-match floor traps ('o' pothole, '~' oil); keep them off every patrol route (bots never step on one). */
  traps?: readonly TrapMark[];
  /** Scheduled stage hazards of the board (a sector keeps only those that fit inside it). */
  hazards?: StageHazardDef[];
  /**
   * Where the two mandatory endgame trap waves may land (inclusive rect, open floor only) and their seeds. The waves are a
   * rule of every match (CLAUDE.md); a field mission rarely runs into its last 30 s.
   */
  endgame: { rect: readonly [number, number, number, number]; seeds?: readonly [number, number] };
  info: ArenaInfo;
  /** Spawn slots (at least the mission's 1 + enemies; the field runtime seats everyone on their authored tiles). */
  spawns?: number;
  /**
   * A COMMUNITY district's objects: `board.cover(LEGEND)` of the same painted `Board` the rows come from (the community cover
   * factory draws `ArenaDef.cover`, one object per rectangle). Checked at import: every rectangle stands on its own letters
   * and every letter tile is in exactly one rectangle. Absent = a district with a letter-map cover builder (Oshodi).
   */
  cover?: readonly CoverRect[];
}

/** The sim layout of painted rows: every legend letter becomes '#'. */
export function layoutOf(rows: readonly string[], legend: CampaignLegend): string[] {
  return rows.map((r) => [...r].map((c) => (legend[c] ? '#' : c)).join(''));
}

/** The cover map of painted rows: legend letters kept, everything else '.'. */
export function coverMapOf(rows: readonly string[], legend: CampaignLegend): string[] {
  return rows.map((r) => [...r].map((c) => (legend[c] ? c : '.')).join(''));
}

/** Throws unless `cover` draws exactly the legend letters of `rows`: one rectangle per tile, of that letter's kind. */
export function checkCover(
  id: string,
  rows: readonly string[],
  legend: CampaignLegend,
  cover: readonly CoverRect[],
): void {
  const W = rows[0]!.length;
  const seen = new Uint8Array(W * rows.length);
  for (const c of cover)
    for (let y = c.y; y < c.y + c.h; y++)
      for (let x = c.x; x < c.x + c.w; x++) {
        const ch = rows[y]?.[x];
        if (ch === undefined || legend[ch] !== c.kind)
          throw new Error(`${id}: cover ${c.kind} at ${x},${y} stands on '${ch ?? 'off board'}'`);
        if (seen[y * W + x]++) throw new Error(`${id}: two cover objects on ${x},${y}`);
      }
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (legend[ch] && !seen[y * W + x]) throw new Error(`${id}: '${ch}' at ${x},${y} has no cover object`);
    }),
  );
}

/** `count` endgame marks on open floor inside `rect`, spread out, from a seeded generator (authoring time). */
function endgameMarks(
  layout: readonly string[],
  rect: readonly [number, number, number, number],
  count: number,
  seed: number,
  not: ReadonlySet<string>,
): TrapMark[] {
  const cand: [number, number][] = [];
  for (let y = rect[1]; y <= rect[3]; y++)
    for (let x = rect[0]; x <= rect[2]; x++)
      if ('._'.includes(layout[y]?.[x] ?? '#') && !not.has(`${x},${y}`)) cand.push([x, y]);
  let t = seed >>> 0 || 1;
  const rnd = (): number => {
    t = (Math.imul(t ^ (t >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return t / 4294967296;
  };
  const out: TrapMark[] = [];
  while (out.length < count && cand.length) {
    let best = 0;
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

/**
 * Assembles a campaign-only arena from its painted board. The rules layer is the City Rumble stage's (the radial blast
 * economy and the campaign config come from the mission ruleset, exactly as on the district maps), with no summoned-vehicle
 * lane (a voucher cannot call a vehicle into a closed campaign area) and no forced Wahala Crush (a mission never shrinks).
 */
export function campaignArena(s: CampaignBoardSpec): ArenaDef {
  const W = s.rows[0]!.length;
  const H = s.rows.length;
  for (const r of s.rows) {
    if (r.length !== W) throw new Error(`${s.id}: ragged row "${r}"`);
    // every solid tile is a real object of the kit: no raw concrete, no invisible edge
    if (r.includes('#')) throw new Error(`${s.id}: raw '#' in "${r}" (paint a kit object instead)`);
  }
  if (s.cover) checkCover(s.id, s.rows, s.legend, s.cover);
  const layout = layoutOf(s.rows, s.legend);
  const traps = s.traps ?? [];
  const used = new Set(traps.map(([x, y]) => `${x},${y}`));
  const seeds = s.endgame.seeds ?? [11, 23];
  const wave1 = endgameMarks(layout, s.endgame.rect, 6, seeds[0], used);
  for (const [x, y] of wave1) used.add(`${x},${y}`);
  const wave2 = endgameMarks(layout, s.endgame.rect, 6, seeds[1], used);
  const hazards = s.hazards ?? [];
  const avoid: [number, number][] = [
    ...around(
      layout.flatMap((row, y) => [...row].flatMap((c, x) => (c === '$' ? [[x, y] as [number, number]] : []))),
      2,
    ),
    ...[...traps, ...wave1, ...wave2].map(([x, y]) => [x, y] as [number, number]),
  ];
  const count = s.spawns ?? 12;
  const open = layout.map((r) => r.replace(/_/g, '.'));
  // the Rumble starts keep a blast's way out free of crates; a cramped board falls back to plain open tiles (the field
  // runtime seats every competitor on its authored tile anyway)
  let spawns: TilePos[];
  try {
    spawns = balancedSpawns(open, count, s.start, RADIAL_CLEARANCE, avoid);
  } catch {
    spawns = balancedSpawns(open, count, s.start, [{ x: 0, y: 0 }], avoid);
  }
  const base = rumbleStageConfig({
    core: { w: W, h: H, x0: 0, y0: 0 },
    softDensity: 0.4,
    maxLethalEvents: 1,
  });
  return {
    id: s.id,
    name: s.name,
    kind: 'rumble',
    campaignOnly: true,
    layout,
    coverMap: coverMapOf(s.rows, s.legend),
    ...(s.cover ? { cover: s.cover.map((c) => ({ ...c })) } : {}),
    spawns,
    spawnClearance: RADIAL_CLEARANCE,
    mirrorSoftBlocks: false,
    maxPlayers: spawns.length,
    config: { ...base, vehicles: { ...base.vehicles, lanes: [] } },
    floorTraps: trapGrid(traps, W, H),
    endgameTraps: [trapGrid(wave1, W, H), trapGrid(wave2, W, H)],
    stageHazards: hazards,
    info: s.info,
    districts: s.subAreas.map((d) => ({ ...d, rects: d.rects.map((r) => [...r] as typeof r) })),
  };
}
