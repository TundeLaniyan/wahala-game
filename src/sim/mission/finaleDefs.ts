/**
 * The OJUELEGBA FINALE (missions 19-21 of the campaign, docs/CAMPAIGN_SECTOR_AI.md "Part: Ojuelegba finale", decisions
 * FN1-FN10): two field missions and the boss mission "Break the Ring", all on the Ojuelegba Underbridge City Rumble arena
 * (`rumbleOjuelegba`, 45 x 33), which stays UNCHANGED: each mission is a SECTOR stamped over it (the reference layout and
 * its cover map are never edited).
 *
 *   19 `ojuelegba.return`    Return to Ojuelegba   the shop lane and the street corner: trap the Ring patrols, blast the two
 *                                                  gate locks, and the Ring's steel gate across the corner opens (a sector
 *                                                  gate that opens between legs); no door raid (no existing raid layout fits)
 *   20 `ojuelegba.junction`  Hold the Junction     the pier court under the flyover: keep the bus stop against waves, then
 *                                                  wreck the Ring control boxes a lieutenant guards
 *   21 `ojuelegba` (boss)    Break the Ring        the danfo pocket and the repair court: shut the enforcer's control points
 *                                                  down with blasts (the `controlPoints` verb on the boss recipe), blast him
 *                                                  when he comes to re-lock the one broken last
 *
 * The enforcer's name is a WORKING TITLE ("The Landlord", provisional: founder decision pending, docs/STORY_BIBLE.md
 * 12.3); nothing here gives him a biography. Every tile is authored open floor of the arena ('.' or '_'), inside its
 * sector, checked by tests/campaign-finale-data.test.ts. Pure data; types are imported only (no runtime cycle).
 */
import { ticks } from '../config';
import { bossRecipe } from './boss';
import type { MissionDef, NodeDef } from './defs';
import type { FieldEnemyDef, FieldMarkerDef, FieldMissionDef } from './fieldDefs';
import type { BarricadeKind, MissionSectorDef, SectorBarricadeDef } from './sectors';

type T = readonly [number, number];
const row = (y: number, x0: number, x1: number): T[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y] as const);
const col = (x: number, y0: number, y1: number): T[] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i] as const);
const b = (id: string, kind: BarricadeKind, tiles: T[]): SectorBarricadeDef => ({ id, kind, tiles });
const m = (x: number, y: number, label: string): FieldMarkerDef => ({ x, y, label });

// ------------------------------------------------------------------ sectors (three distinct parts of the junction)

/** Mission 19: the Shopfront Lane and the street corner north of it, closed from the junction by a Ring gate. */
export const RETURN_SECTOR: MissionSectorDef = {
  id: 'ojuelegba.shopfrontReturn',
  districtId: 'ojuelegba',
  name: 'Shopfront lane and the street corner',
  area: 'The shop lane from the danfo pocket crossing to its west end, and the street corner above it; the Ring has chained a steel gate across the corner, parked danfos and a checkpoint close the road beyond and the crossing east.',
  rects: [
    [0, 22, 30, 30],
    [0, 19, 8, 21],
  ],
  barricades: [
    b('roadDanfos', 'bus', row(18, 0, 4)),
    b('roadCheckpoint', 'checkpoint', row(18, 5, 8)),
    b('pavement', 'barrier', row(19, 9, 9)),
    b('laneMouth', 'barrier', row(25, 31, 31)),
    b('refugeDanfos', 'bus', col(31, 28, 30)),
  ],
  // the Ring's two gates (decision FN3): the steel barrier across the lane bend opens when its two locks are blasted
  // (leg 1); the gate across the corner when its two gate locks are (leg 2)
  gates: [
    { id: 'laneBarrier', kind: 'gate', tiles: col(14, 25, 30), opensAfterLeg: 1 },
    { id: 'cornerGate', kind: 'gate', tiles: row(22, 1, 6), opensAfterLeg: 2 },
  ],
  viewMargin: 3,
  hazards: 'inside',
};

/** Mission 20: the pier court under the flyover and the through road between the piers (the junction itself). */
export const JUNCTION_SECTOR: MissionSectorDef = {
  id: 'ojuelegba.pierJunction',
  districtId: 'ojuelegba',
  name: 'The junction under the flyover',
  area: 'The pier court and the through road between the bridge piers, with the bus stop on the south pavement; Ring checkpoints close the road at both ends, barriers the pavements, a steel gate the workshop-yard partition.',
  rects: [[10, 11, 30, 21]],
  barricades: [
    b('yardPartition', 'gate', row(10, 22, 22)),
    b('westKerb', 'barrier', col(9, 13, 14)),
    b('westRoad', 'checkpoint', col(9, 15, 18)),
    b('westPavement', 'barrier', row(19, 9, 9)),
    b('eastCorner', 'barrier', row(11, 31, 31)),
    b('eastKerb', 'barrier', row(14, 31, 31)),
    b('eastRoad', 'checkpoint', col(31, 15, 18)),
    b('eastPavement', 'bus', col(31, 19, 21)),
  ],
  viewMargin: 3,
  hazards: 'inside',
};

/**
 * Mission 21 (the boss, decision FN7): the eastern danfo pocket (the impound) and the repair court of the rear service
 * loop behind it. The boss recipe reads `MissionDef.sectorId`, the human starts on `MissionDef.start`.
 */
export const BOSS_SECTOR: MissionSectorDef = {
  id: 'ojuelegba.danfoYard',
  districtId: 'ojuelegba',
  name: 'The danfo pocket and the repair court',
  area: 'The eastern danfo pocket where the impounded bus stands, the departure strip and the repair court of the service loop behind it; the road west is closed by a Ring checkpoint, the pavements and the shop lane by barriers and parked danfos, the service loop by steel gates.',
  rects: [
    [31, 11, 44, 32],
    [32, 2, 43, 10],
  ],
  barricades: [
    b('loopNorth', 'gate', row(2, 31, 31)),
    b('loopNorth2', 'gate', row(3, 31, 31)),
    b('loopMiddle', 'barrier', row(6, 31, 31)),
    b('loopSouth', 'barrier', row(8, 31, 31)),
    b('courtCorner', 'barrier', row(11, 30, 30)),
    b('kerbNorth', 'barrier', row(14, 30, 30)),
    b('roadWest', 'checkpoint', col(30, 15, 18)),
    b('pavementSouth', 'barrier', col(30, 19, 21)),
    b('laneMouth', 'bus', row(25, 30, 30)),
    b('refugeDanfos', 'bus', col(30, 28, 30)),
  ],
  viewMargin: 3,
  hazards: 'inside',
};

export const FINALE_SECTORS: readonly MissionSectorDef[] = [RETURN_SECTOR, JUNCTION_SECTOR];
/** Sectors of boss missions (looked up by `MissionDef.sectorId`; kept apart from the field missions' one-to-one list). */
export const FINALE_BOSS_SECTORS: readonly MissionSectorDef[] = [BOSS_SECTOR];

// ------------------------------------------------------------------ field missions 19 and 20

const enemy = (
  role: FieldEnemyDef['role'],
  name: string,
  x: number,
  y: number,
  group: string,
  variant: FieldEnemyDef['variant'],
  territory: FieldEnemyDef['territory'] = {},
  radius?: number,
): FieldEnemyDef => ({
  role,
  name,
  post: [x, y],
  group,
  variant,
  territory,
  ...(radius !== undefined ? { radius } : {}),
});

/**
 * 19: home along the shop lane from the danfo-pocket end: trap the Ring patrols, blast the locks of the barrier across
 * the lane bend (it opens), blast the gate locks at the corner (the gate opens), walk through to the junction corner.
 */
export const RETURN_MISSION: FieldMissionDef = {
  id: 'ojuelegba.return',
  sectorId: RETURN_SECTOR.id,
  districtId: 'ojuelegba',
  name: 'Return to Ojuelegba',
  start: [29, 29],
  returnMarker: m(4, 20, 'JUNCTION CORNER'),
  legs: [
    { kind: 'clearGroup', text: 'Defeat the 2 Ring patrols on the shop lane.', group: 'patrol' },
    {
      kind: 'destroyTargets',
      text: 'Destroy the 2 barrier locks at the lane bend.',
      crew: 'barrierGuard',
      targets: [
        { id: 'barrierNorth', kind: 'controlPoint', x: 15, y: 26, label: 'BARRIER LOCK' },
        { id: 'barrierSouth', kind: 'controlPoint', x: 15, y: 29, label: 'BARRIER LOCK' },
      ],
    },
    {
      kind: 'destroyTargets',
      text: 'Destroy the 2 gate locks at the lane corner.',
      crew: 'lockGuards',
      targets: [
        { id: 'lockWest', kind: 'controlPoint', x: 2, y: 23, label: 'GATE LOCK' },
        { id: 'lockEast', kind: 'controlPoint', x: 5, y: 23, label: 'GATE LOCK' },
      ],
    },
  ],
  doors: [],
  enemies: [
    enemy('meleeGuard', 'Ring Patrol', 22, 25, 'patrol', 'agbero', {
      patrol: [
        [26, 25],
        [17, 25],
      ],
    }),
    enemy('meleeGuard', 'Ring Patrol', 20, 29, 'patrol', 'routeMarshal', {
      patrol: [
        [17, 29],
        [25, 29],
      ],
    }),
    enemy('blocker', 'Barrier Heavy', 17, 27, 'barrierGuard', 'heavyEnforcer', {
      radius: 1,
      pursuitTiles: 3,
    }),
    enemy(
      'meleeGuard',
      'Lock Guard',
      4,
      25,
      'lockGuards',
      'marketEnforcer',
      { radius: 2, pursuitTiles: 5 },
      2,
    ),
    enemy('meleeGuard', 'Lane Runner', 10, 26, 'lockGuards', 'areaBoy', {
      patrol: [
        [12, 26],
        [3, 26],
      ],
    }),
  ],
  timeLimitSec: 420,
  parSec: 150,
};

/** 20: keep the bus stop against the Ring's waves, then wreck the control boxes the lieutenant guards. */
export const JUNCTION_MISSION: FieldMissionDef = {
  id: 'ojuelegba.junction',
  sectorId: JUNCTION_SECTOR.id,
  districtId: 'ojuelegba',
  name: 'Hold the Junction',
  start: [11, 19],
  returnMarker: m(14, 19, 'WEST PAVEMENT'),
  legs: [
    {
      kind: 'holdArea',
      text: 'Keep the bus stop for 25 seconds.',
      area: { x: 20, y: 19, radius: 2, label: 'BUS STOP' },
      holdSec: 25,
      waves: [
        { group: 'waveEast', atSec: 2 },
        { group: 'waveNorth', atSec: 12 },
      ],
    },
    {
      kind: 'destroyTargets',
      text: 'Destroy the 3 Ring control boxes under the bridge.',
      crew: 'ringCrew',
      targets: [
        { id: 'boxNorth', kind: 'switchCabinet', x: 20, y: 12, label: 'CONTROL BOX' },
        { id: 'boxPier', kind: 'switchCabinet', x: 26, y: 13, label: 'CONTROL BOX' },
        { id: 'boxEast', kind: 'switchCabinet', x: 30, y: 20, label: 'CONTROL BOX' },
      ],
    },
  ],
  doors: [],
  enemies: [
    enemy('meleeGuard', 'Area Boy', 30, 14, 'waveEast', 'areaBoy', { radius: 1, pursuitTiles: 2 }),
    enemy('meleeGuard', 'Area Boy', 29, 19, 'waveEast', 'areaBoy', { radius: 1, pursuitTiles: 2 }),
    enemy('meleeGuard', 'Ring Agbero', 15, 11, 'waveNorth', 'agbero', { radius: 1, pursuitTiles: 2 }),
    enemy('meleeGuard', 'Market Enforcer', 27, 11, 'waveNorth', 'marketEnforcer', {
      radius: 1,
      pursuitTiles: 2,
    }),
    enemy('meleeGuard', 'Ring Lieutenant', 25, 12, 'ringCrew', 'lieutenant', { radius: 2, pursuitTiles: 3 }),
    enemy('meleeGuard', 'Ring Security', 28, 19, 'ringCrew', 'ringSecurity', { radius: 2, pursuitTiles: 3 }),
  ],
  timeLimitSec: 480,
  parSec: 240,
};

export const FINALE_FIELD_DEFS: readonly FieldMissionDef[] = [RETURN_MISSION, JUNCTION_MISSION];

// ------------------------------------------------------------------ 21: Break the Ring (the boss)

const n = (id: string, x: number, y: number, extra: Partial<NodeDef> = {}): NodeDef => ({
  id,
  x,
  y,
  label: 'CONTROL POINT',
  ...extra,
});

/** The Ring faction of the finale (fictional: the enforcer's lockmen; content `FACTIONS.underbridgeLockmen`). */
export const FINALE_FACTION_ID = 'underbridgeLockmen';

/**
 * The territorial enforcer's fight on the boss recipe (decisions BX1-BX8 + FN5-FN7): the phase objective is the
 * `controlPoints` verb (blasts only); exposed, he walks to the point broken LAST to re-lock it and is committed there.
 */
export const OJUELEGBA_BOSS: MissionDef = {
  id: 'ojuelegba',
  arenaId: 'rumbleOjuelegba',
  objective: 'controlPoints',
  factionId: FINALE_FACTION_ID,
  timeLimitSec: 480,
  parSec: 300,
  sectorId: BOSS_SECTOR.id,
  start: [36, 30],
  recipe: bossRecipe({
    anchor: 'lastBroken',
    walkGraceSec: 14,
    callRoles: ['escort', 'runner', 'meleeGuard'],
  }),
  reinforceMax: 3,
  // working title (provisional, FN8); drawn in the existing Boss variant look, no bespoke art
  boss: { name: 'The Landlord', characterId: 'streetBaller', post: [38, 27], radius: 3, look: 'boss' },
  crew: [
    { role: 'escort', name: 'Landlord Escort', variant: 'ringSecurity', post: [37, 27], radius: 2 },
    { role: 'meleeGuard', name: 'Yard Enforcer', variant: 'agbero', post: [35, 28], radius: 3 },
    { role: 'runner', name: 'Locker', variant: 'areaBoy', post: [33, 19] },
    { role: 'runner', name: 'Locker', variant: 'areaBoy', post: [40, 7] },
    { role: 'blocker', name: 'Gate Heavy', variant: 'heavyEnforcer', post: [33, 14] },
    { role: 'rangedAttacker', name: 'Roof Spotter', variant: 'bottleThrower', post: [40, 21] },
  ],
  phases: [
    {
      nodes: [n('c1', 33, 25, { opens: [[34, 26]] }), n('c2', 32, 14), n('c3', 39, 10)],
      goal: 2,
      hp: 1,
      pulseTicks: ticks(9),
      warnTicks: ticks(3),
      strikeSpan: 4,
      callout: 'Blast two of the three control points. Every point you shut down reopens a route.',
    },
    {
      nodes: [n('c1', 35, 22, { opens: [[37, 22]] }), n('c2', 43, 23), n('c3', 34, 8), n('c4', 39, 13)],
      goal: 3,
      hp: 1,
      crewTicks: ticks(6),
      pulseTicks: ticks(7),
      warnTicks: 165,
      strikeSpan: 5,
      callout: 'Lockers re-lock a shut point. Blast three and put the lockers down.',
    },
    {
      nodes: [n('c1', 33, 30), n('c2', 43, 28, { opens: [[38, 25]] }), n('c3', 36, 3), n('c4', 39, 19)],
      goal: 3,
      hp: 2,
      crewTicks: ticks(5),
      pulseTicks: ticks(6),
      warnTicks: ticks(2.5),
      strikeSpan: 6,
      callout: 'Tougher points take two blasts each. Shut down three before the lockers undo you.',
    },
  ],
};
