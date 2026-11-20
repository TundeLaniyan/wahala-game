/**
 * The OJUELEGBA FINALE (missions 19-21 of the campaign, docs/CAMPAIGN_SECTOR_AI.md "Part: Ojuelegba finale", decisions
 * FN1-FN10): two field missions and the boss mission "Break the Ring". The Ojuelegba Underbridge City Rumble arena
 * (`rumbleOjuelegba`, 45 x 33, the reference arena) stays UNCHANGED. The two field missions play on their own campaign areas
 * (docs/CAMPAIGN_WORLD.md "The Ojuelegba finale", decisions WL6-WL9: `areasOjuelegba.ts`), streets round the junction that the
 * Rumble map does not have, drawn with its own pieces; the boss stays a SECTOR stamped over the reference arena.
 *
 *   19 `ojuelegba.return`    Return to Ojuelegba   the south streets: trap the Ring patrols in the motor park and the shop
 *                                                  street, blast the barrier locks (the lane barrier opens), blast the gate
 *                                                  locks (the Ring's gate across the ramp corner opens), walk to the corner;
 *                                                  no door raid (no existing raid layout fits)
 *   20 `ojuelegba.junction`  Hold the Junction     the underbridge interchange: keep the bus stop under the deck against
 *                                                  waves, then wreck the Ring control boxes a lieutenant guards
 *   21 `ojuelegba` (boss)    Break the Ring        the danfo pocket and the repair court: shut the enforcer's control points
 *                                                  down with blasts (the `controlPoints` verb on the boss recipe), blast him
 *                                                  when he comes to re-lock the one broken last
 *
 * The enforcer's name is a WORKING TITLE ("The Landlord", provisional: founder decision pending, docs/STORY_BIBLE.md
 * 12.3); nothing here gives him a biography. Every tile is authored open floor of its board ('.' or '_'), inside its
 * sector, checked by tests/campaign-finale-data.test.ts and tests/campaign-world.test.ts. Pure data.
 */
import { ticks } from '../config';
import { bossRecipe } from './boss';
import type { MissionDef, NodeDef } from './defs';
import type { FieldEnemyDef, FieldMarkerDef, FieldMissionDef } from './fieldDefs';
import { SOUTH_STREETS_ARENA_ID } from '../arenas/campaign/ojuelegbaSouthStreets';
import { BUS_INTERCHANGE_ARENA_ID } from '../arenas/campaign/ojuelegbaBusInterchange';
import type { BarricadeKind, MissionSectorDef, SectorBarricadeDef } from './sectors';

type T = readonly [number, number];
const row = (y: number, x0: number, x1: number): T[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y] as const);
const col = (x: number, y0: number, y1: number): T[] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i] as const);
const b = (id: string, kind: BarricadeKind, tiles: T[]): SectorBarricadeDef => ({ id, kind, tiles });
const m = (x: number, y: number, label: string): FieldMarkerDef => ({ x, y, label });

// ------------------------------------------------------------------ sectors
// Missions 19 and 20 play on their own campaign areas (decisions WL6-WL9): their play areas and the Ring's gates are the
// areas' sectors (`areasOjuelegba.ts`, registered through `CAMPAIGN_AREA_DEFS`). The old sectors of the reference arena
// (`ojuelegba.shopfrontReturn`, `ojuelegba.pierJunction`) are retired.

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

/** The finale's field sectors on the reference arena: none now (missions 19 and 20 are campaign areas, WL6). */
export const FINALE_SECTORS: readonly MissionSectorDef[] = [];
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
 * 19: home through the south streets (campaign area `ojuelegba.southStreets`, decisions WL6-WL8): trap the Ring patrols in
 * the motor park and the shop street, blast the locks of the barrier across the lane at the street's west end (it opens),
 * blast the gate locks in the vulcanisers' yard (the gate across the ramp corner opens), walk through to the junction corner.
 */
export const RETURN_MISSION: FieldMissionDef = {
  id: 'ojuelegba.return',
  arenaId: SOUTH_STREETS_ARENA_ID,
  sectorId: 'ojuelegba.southStreets',
  districtId: 'ojuelegba',
  name: 'Return to Ojuelegba',
  start: [44, 24],
  returnMarker: m(7, 3, 'JUNCTION CORNER'),
  legs: [
    { kind: 'clearGroup', text: 'Defeat the 2 Ring patrols on the shop street.', group: 'patrol' },
    {
      kind: 'destroyTargets',
      text: 'Destroy the 2 barrier locks at the lane barrier.',
      crew: 'barrierGuard',
      targets: [
        { id: 'barrierNorth', kind: 'controlPoint', x: 14, y: 18, label: 'BARRIER LOCK' },
        { id: 'barrierSouth', kind: 'controlPoint', x: 14, y: 23, label: 'BARRIER LOCK' },
      ],
    },
    {
      kind: 'destroyTargets',
      text: 'Destroy the 2 gate locks at the corner gate.',
      crew: 'lockGuards',
      targets: [
        { id: 'lockWest', kind: 'controlPoint', x: 2, y: 13, label: 'GATE LOCK' },
        { id: 'lockEast', kind: 'controlPoint', x: 7, y: 13, label: 'GATE LOCK' },
      ],
    },
  ],
  doors: [],
  enemies: [
    // the motor park: a Ring patrol loops the danfo row by the start
    enemy('meleeGuard', 'Ring Patrol', 35, 14, 'patrol', 'agbero', {
      patrol: [
        [35, 14],
        [40, 14],
        [40, 16],
        [35, 16],
      ],
    }),
    // the shop street: a Ring route marshal loops the middle shop block
    enemy('meleeGuard', 'Ring Patrol', 21, 13, 'patrol', 'routeMarshal', {
      patrol: [
        [21, 13],
        [27, 13],
        [27, 17],
        [21, 17],
      ],
    }),
    // the barrier heavy minds the barrier locks at the street's west end
    enemy('blocker', 'Barrier Heavy', 16, 21, 'barrierGuard', 'heavyEnforcer', {
      radius: 1,
      pursuitTiles: 3,
    }),
    // the vulcanisers' yard: the lock guard loops the tyre racks by the gate locks, the lane runner the workshop
    enemy('meleeGuard', 'Lock Guard', 3, 14, 'lockGuards', 'marketEnforcer', {
      patrol: [
        [3, 14],
        [6, 14],
        [6, 17],
        [3, 17],
      ],
      pursuitTiles: 5,
    }),
    enemy('meleeGuard', 'Lane Runner', 8, 14, 'lockGuards', 'areaBoy', {
      patrol: [
        [8, 14],
        [12, 14],
        [12, 17],
        [8, 17],
      ],
    }),
  ],
  timeLimitSec: 420,
  parSec: 150,
};

/**
 * 20: keep the bus stop under the deck against the Ring's waves, then wreck the control boxes the lieutenant guards
 * (campaign area `ojuelegba.busInterchange`, decisions WL6, WL9). The waves now come once the hold is under way: the yard
 * crew at 18 s, the roof thrower at 26 s (a wave holds its post until it is sent, so the waves are the yard's thrower and
 * one area boy, and the junction's street muscle - the Ring agbero under the north girder, the market enforcer - walk their
 * rounds from the start, where the player can watch and time them, and come for the bus stop when they see you on it).
 */
export const JUNCTION_MISSION: FieldMissionDef = {
  id: 'ojuelegba.junction',
  arenaId: BUS_INTERCHANGE_ARENA_ID,
  sectorId: 'ojuelegba.busInterchange',
  districtId: 'ojuelegba',
  name: 'Hold the Junction',
  start: [4, 19],
  returnMarker: m(5, 14, 'WEST PAVEMENT'),
  legs: [
    {
      kind: 'holdArea',
      text: 'Keep the bus stop for 25 seconds.',
      area: { x: 22, y: 8, radius: 2, label: 'BUS STOP' },
      holdSec: 25,
      waves: [
        { group: 'waveEast', atSec: 18 },
        { group: 'waveNorth', atSec: 26 },
      ],
    },
    {
      kind: 'destroyTargets',
      text: 'Destroy the 3 Ring control boxes under the bridge.',
      crew: 'ringCrew',
      targets: [
        { id: 'boxNorth', kind: 'switchCabinet', x: 25, y: 4, label: 'CONTROL BOX' },
        { id: 'boxPier', kind: 'switchCabinet', x: 15, y: 15, label: 'CONTROL BOX' },
        { id: 'boxEast', kind: 'switchCabinet', x: 37, y: 7, label: 'CONTROL BOX' },
      ],
    },
  ],
  doors: [],
  enemies: [
    // the east wave from the Ring yard: an area boy walks round the workshops, a thrower watches from the yard's lamp
    enemy('meleeGuard', 'Area Boy', 37, 2, 'waveEast', 'areaBoy', {
      patrol: [
        [37, 2],
        [44, 2],
        [44, 6],
        [37, 6],
      ],
      pursuitTiles: 4,
    }),
    enemy('rangedAttacker', 'Yard Thrower', 42, 7, 'waveEast', 'bottleThrower', { radius: 2 }),
    // the north wave: a thrower on the kiosk roofs under the north girder
    enemy('rangedAttacker', 'Roof Thrower', 30, 2, 'waveNorth', 'bottleThrower', { radius: 2 }),
    // the junction's street muscle: a Ring agbero loops the west kiosks, a market enforcer the market's stall block
    enemy('meleeGuard', 'Ring Agbero', 12, 5, 'street', 'agbero', {
      patrol: [
        [12, 5],
        [15, 5],
        [15, 8],
        [12, 8],
      ],
      pursuitTiles: 4,
    }),
    enemy('meleeGuard', 'Market Enforcer', 21, 19, 'street', 'marketEnforcer', {
      patrol: [
        [21, 19],
        [25, 19],
        [25, 22],
        [21, 22],
      ],
      pursuitTiles: 4,
    }),
    // the Ring crew: the lieutenant beside the control box by the south-west pier, a Ring guard loops the container shop
    enemy('meleeGuard', 'Ring Lieutenant', 14, 16, 'ringCrew', 'lieutenant', { radius: 2, pursuitTiles: 3 }),
    enemy('meleeGuard', 'Ring Security', 30, 18, 'ringCrew', 'ringSecurity', {
      patrol: [
        [30, 18],
        [34, 18],
        [34, 21],
        [30, 21],
      ],
      pursuitTiles: 3,
    }),
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
