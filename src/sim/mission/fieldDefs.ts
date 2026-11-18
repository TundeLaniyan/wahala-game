/**
 * Section FIELD mission data (docs/CAMPAIGN_SECTIONS.md, decisions FS1-FS12): the large scrolling district missions
 * that sit inside the campaign's sections. A field mission is a ROUTE of legs on one district's City Rumble arena:
 * walk to marked tiles, defeat a group, escape a pursuer, step on a door (a classic raid), then walk the return route.
 * It is not a boss fight: nobody is shielded and the mission ends when the return marker is reached.
 *
 * Every tile here is authored open floor ('.' or '_') of the district's arena and is BFS-checked from the start tile
 * by `tests/field-nodes.test.ts`. Numbers (clock, par) live here; the mechanics are in `field.ts`.
 */
import type { MissionId, NpcRole } from './types';
import type { RaidId, TerritoryDef } from '../campaign/types';
import type { EnemyVariantId } from '../data/enemyVariants';
import type { Tile2 } from './defs';
import { ebuteX } from '../arenas/ebuteWest';

export interface FieldMarkerDef {
  x: number;
  y: number;
  label: string;
}

export interface FieldEnemyDef {
  role: NpcRole;
  name: string;
  /** Start tile (snapped to the nearest free floor tile if it is not one). */
  post: Tile2;
  /** The enemy group a `clearGroup` / `escapeRoute` leg names. */
  group: string;
  radius?: number;
  /**
   * The recognisable variant (data/enemyVariants.ts): its base kind replaces the role's default kind, its personality
   * drives the campaign tactics layer (decision SA2 / SA10). Absent = the role's kind and that kind's default variant.
   */
  variant?: EnemyVariantId;
  /** Campaign tactics territory (patrol route, guard area, pursuit, alerts; decision SA6). Absent = level defaults. */
  territory?: TerritoryDef;
}

/** What a piece of Ring equipment is (for its look and its HUD name). */
export type FieldEquipmentKind = 'relayBox' | 'tollBox' | 'switchCabinet' | 'partsCage' | 'controlPoint';

/**
 * A piece of Ring equipment a `destroyTargets` leg asks to wreck (docs/CAMPAIGN_SECTOR_AI.md, decision DS7). It stands
 * on its tile from the start of the mission like a crate (it blocks walking and stops a flame arm), but only the
 * human's blasts damage it: one hit point per separate blast; melee, vehicles, the closing city and stage hazards
 * cannot, and an enemy's blast only scorches it.
 */
export interface FieldTargetDef {
  id: string;
  kind: FieldEquipmentKind;
  x: number;
  y: number;
  label: string;
  /** Separate blasts needed (default 1). */
  hp?: number;
}

/** A hold zone: the square of tiles within `radius` (Chebyshev) of (x, y). */
export interface FieldAreaDef {
  x: number;
  y: number;
  radius: number;
  label: string;
}

export type FieldLegDef =
  | { kind: 'reachMarkers'; text: string; markers: FieldMarkerDef[] }
  | { kind: 'clearGroup'; text: string; group: string }
  | { kind: 'escapeRoute'; text: string; group: string; exit: FieldMarkerDef }
  | { kind: 'door'; text: string; doorId: string }
  /**
   * Wreck every target with blasts. `crew` (an enemy group) guards the nearest standing target while the leg runs.
   */
  | { kind: 'destroyTargets'; text: string; targets: FieldTargetDef[]; crew?: string }
  /**
   * Keep the area under control for `holdSec` seconds: time accrues while the human is inside it and no enemy is.
   * Each wave sends an enemy group into the area `atSec` seconds after the leg starts (before that it holds its post).
   */
  | {
      kind: 'holdArea';
      text: string;
      area: FieldAreaDef;
      holdSec: number;
      waves?: { group: string; atSec: number }[];
    };

export interface FieldDoorDef {
  id: string;
  x: number;
  y: number;
  label: string;
  raidId: RaidId;
  /** The tile in front of the door where the human stands again when the raid ends. */
  returnTile: Tile2;
  /** Required doors are a leg of the route; optional ones are open from the start and only pay a bonus. */
  required: boolean;
}

export interface FieldMissionDef {
  id: string;
  districtId: MissionId;
  name: string;
  /** The human's start tile and the marker that completes the mission once the route is done. */
  start: Tile2;
  returnMarker: FieldMarkerDef;
  /** The legs in order; the return route is implicit and always last. */
  legs: FieldLegDef[];
  doors: FieldDoorDef[];
  enemies: FieldEnemyDef[];
  timeLimitSec: number;
  /** Three stars when cleared within this many seconds without losing more than one life. */
  parSec: number;
  /**
   * The district sector the mission is played in (`MISSION_SECTORS`, src/sim/mission/sectors.ts): the part of the
   * district map closed by barricades. Absent = the whole district map.
   */
  sectorId?: string;
}

const m = (x: number, y: number, label: string): FieldMarkerDef => ({ x, y, label });
/** A seat's campaign tactics data: its variant and territory (decision SA10; the sector re-authoring replaces these). */
type Tactics = Pick<FieldEnemyDef, 'variant' | 'territory'>;
const guard = (
  name: string,
  x: number,
  y: number,
  group: string,
  tactics: Tactics = {},
  radius = 3,
): FieldEnemyDef => ({
  role: 'meleeGuard',
  name,
  post: [x, y],
  group,
  radius,
  ...tactics,
});
const blocker = (
  name: string,
  x: number,
  y: number,
  group: string,
  tactics: Tactics = {},
): FieldEnemyDef => ({
  role: 'blocker',
  name,
  post: [x, y],
  group,
  ...tactics,
});
const chaser = (name: string, x: number, y: number, group: string, tactics: Tactics = {}): FieldEnemyDef => ({
  role: 'rangedAttacker',
  name,
  post: [x, y],
  group,
  ...tactics,
});
/** A patrol loop between `tiles` (walked back and forth for two tiles). */
const patrol = (variant: Tactics['variant'], ...tiles: [number, number][]): Tactics => ({
  variant,
  territory: { patrol: tiles },
});
/** Holds its post (radius `radius`) and watches. */
const post = (variant: Tactics['variant'], radius = 2): Tactics => ({ variant, territory: { radius } });

/**
 * The HUD line of the implicit last leg (the return route). Plain words: where to go, nothing else
 * (docs/CHECKPOINT_CLARITY.md).
 */
export function returnLegText(label: string): string {
  return `Return to ${label} to finish.`;
}

/** Hold time on a door before it raises the raid request (1 s), and how long a pursuer must stay next to you to catch you. */
export const DOOR_HOLD_TICKS = 60;
export const CATCH_TICKS = 40;
/** Spawn protection granted when a lost life or a raid puts the human back on the map. */
export const FIELD_MERCY_TICKS = 120;

const defs: FieldMissionDef[] = [
  // ---------------------------------------------------------------- Oshodi (the vertical slice)
  // Districts pass A (docs/CAMPAIGN_SECTOR_AI.md "Districts: Oshodi, Mushin, Fadeyi/Somolu", decisions DA1-DA9): the
  // legs of the campaign's first mission stay (checkpoint clarity reference); its wardens now walk readable routes.
  {
    id: 'oshodi.approach',
    sectorId: 'oshodi.terminalApproach',
    districtId: 'oshodi',
    name: 'Terminal Approach',
    start: [3, 42],
    returnMarker: m(4, 38, 'ORITA GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 3 checkpoints. No need to stop.',
        markers: [m(9, 39, 'CHECKPOINT A'), m(19, 39, 'CHECKPOINT B'), m(26, 40, 'CHECKPOINT C')],
      },
      { kind: 'door', text: 'Stand on the depot door for 1 second to raid it.', doorId: 'depot' },
    ],
    doors: [
      {
        id: 'depot',
        x: 25,
        y: 44,
        label: 'DISPATCH DEPOT',
        raidId: 'warehouseDispatchDepot',
        returnTile: [25, 43],
        required: true,
      },
    ],
    enemies: [
      // a loop round the ticket kiosk between checkpoints A and B (it turns its back at the far corners)
      guard('Park Warden', 14, 37, 'wardens', patrol('agbero', [10, 37], [18, 37], [18, 39], [10, 39])),
      // the stall lane between the two streets: it crosses the start street and the checkpoint street
      guard('Park Warden', 13, 41, 'wardens', patrol('agbero', [13, 38], [13, 42])),
      // a lookout on the east forecourt beside checkpoint C: throws down the stall lanes
      chaser('Ticket Tout', 31, 41, 'wardens', post('bottleThrower', 2)),
      // the depot lane: walks across the depot door (only a blast finishes it)
      blocker('Lane Blocker', 23, 42, 'wardens', patrol('heavyEnforcer', [20, 42], [27, 42])),
    ],
    timeLimitSec: 360,
    parSec: 90,
  },
  {
    id: 'oshodi.railEdge',
    sectorId: 'oshodi.railEdge',
    districtId: 'oshodi',
    name: 'Rail Edge',
    start: [44, 42],
    returnMarker: m(58, 43, 'PARK GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 2 hawkers in the market lane.', group: 'hawkers' },
      {
        kind: 'destroyTargets',
        text: 'Destroy the 3 relay boxes by the rail plaza.',
        crew: 'relayCrew',
        targets: [
          { id: 'relayDepot', kind: 'relayBox', x: 36, y: 34, label: 'RELAY BOX', hp: 3 },
          { id: 'relayMast', kind: 'relayBox', x: 55, y: 30, label: 'RELAY BOX', hp: 3 },
          { id: 'relayPlaza', kind: 'relayBox', x: 44, y: 26, label: 'RELAY BOX', hp: 3 },
        ],
      },
      {
        kind: 'holdArea',
        text: 'Keep the rail plaza clear for 25 seconds.',
        area: { x: 37, y: 28, radius: 2, label: 'RAIL PLAZA' },
        holdSec: 25,
        waves: [
          { group: 'trailerCrew', atSec: 3 },
          { group: 'lateCrew', atSec: 12 },
        ],
      },
      {
        kind: 'escapeRoute',
        text: 'Escape to the footbridge before the trailer hand catches you.',
        group: 'pursuers',
        exit: m(59, 28, 'FOOTBRIDGE'),
      },
    ],
    doors: [],
    enemies: [
      // the market lanes: two hawkers walk the cross streets past the stall blocks
      guard('Lane Hawker', 45, 39, 'hawkers', patrol('marketEnforcer', [38, 39], [48, 39])),
      guard('Lane Hawker', 54, 37, 'hawkers', patrol('marketEnforcer', [50, 37], [58, 37])),
      // the relay crew: a heavy stands by the nearest box still working, a warden walks round the mast block
      blocker('Relay Minder', 47, 34, 'relayCrew', post('heavyEnforcer', 1)),
      guard('Plaza Warden', 50, 31, 'lookouts', patrol('agbero', [47, 31], [47, 34], [56, 34], [56, 31])),
      // the trailer crew: they watch the rail buffer, then come to take the plaza back
      guard('Trailer Crew', 34, 32, 'trailerCrew', patrol('agbero', [31, 31], [38, 31])),
      chaser('Trailer Crew', 41, 33, 'trailerCrew', post('bottleThrower', 2)),
      guard('Trailer Crew', 32, 26, 'lateCrew', post('areaBoy', 2)),
      // the trailer hand who sets off after you when the plaza is held
      chaser('Trailer Hand', 31, 32, 'pursuers', { variant: 'bottleThrower' }),
    ],
    timeLimitSec: 600,
    parSec: 270,
  },
  // ---------------------------------------------------------------- Mushin
  {
    id: 'mushin.approach',
    sectorId: 'mushin.sparePartsRow',
    districtId: 'mushin',
    name: 'Spare-Parts Row',
    start: [3, 30],
    returnMarker: m(4, 36, 'ROW GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 checkpoints along the stalls.',
        markers: [m(7, 34, 'STALL ROW'), m(18, 36, 'BACK AISLE')],
      },
      {
        kind: 'destroyTargets',
        text: 'Destroy the 3 parts cages in the loading bay.',
        crew: 'cageCrew',
        targets: [
          { id: 'cageNorth', kind: 'partsCage', x: 34, y: 28, label: 'PARTS CAGE', hp: 3 },
          { id: 'cageEast', kind: 'partsCage', x: 49, y: 32, label: 'PARTS CAGE', hp: 3 },
          { id: 'cageSouth', kind: 'partsCage', x: 35, y: 33, label: 'PARTS CAGE', hp: 3 },
        ],
      },
      { kind: 'door', text: 'Stand on the storeroom door for 1 second to raid it.', doorId: 'storeroom' },
    ],
    doors: [
      {
        id: 'storeroom',
        x: 42,
        y: 35,
        label: 'PARTS STOREROOM',
        raidId: 'partsStoreroom',
        returnTile: [42, 36],
        required: true,
      },
    ],
    enemies: [
      // the stall row and the back aisle: two enforcers walk the aisles the checkpoints sit on
      guard('Parts Hawker', 12, 35, 'hawkers', patrol('marketEnforcer', [8, 35], [16, 35])),
      guard('Stall Guard', 25, 36, 'hawkers', patrol('marketEnforcer', [20, 36], [31, 36])),
      // the loading bay: a runner sweeps the top aisle, a heavy minds the cages, a thrower watches the storeroom
      guard('Bay Runner', 41, 29, 'runners', patrol('areaBoy', [33, 29], [49, 29])),
      blocker('Cage Minder', 40, 32, 'cageCrew', post('heavyEnforcer', 1)),
      chaser('Bay Lookout', 48, 35, 'lookouts', post('bottleThrower', 2)),
    ],
    timeLimitSec: 480,
    parSec: 175,
  },
  {
    id: 'mushin.market',
    sectorId: 'mushin.northAisles',
    districtId: 'mushin',
    name: 'Aisle Sweep',
    start: [3, 13],
    returnMarker: m(4, 4, 'MARKET GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 3 market runners in the north aisles.', group: 'runners' },
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 checkpoints on the top street.',
        markers: [m(34, 7, 'FAR STALL'), m(49, 5, 'TOP STREET')],
      },
      {
        kind: 'holdArea',
        text: 'Keep the lorry bay clear for 40 seconds.',
        area: { x: 48, y: 10, radius: 1, label: 'LORRY BAY' },
        holdSec: 40,
        waves: [
          { group: 'loaders', atSec: 4 },
          { group: 'lateLoaders', atSec: 15 },
          { group: 'lastLoaders', atSec: 26 },
        ],
      },
    ],
    doors: [
      {
        id: 'backStall',
        x: 14,
        y: 10,
        label: 'BACK STALL',
        raidId: 'partsStoreroom',
        returnTile: [13, 10],
        required: false,
      },
    ],
    enemies: [
      // the runners work the aisles: two area boys on the cross streets, a thrower on the south street
      guard('Market Runner', 20, 10, 'runners', patrol('areaBoy', [15, 10], [27, 10])),
      guard('Market Runner', 28, 13, 'runners', patrol('areaBoy', [22, 13], [34, 13])),
      chaser('Market Runner', 40, 12, 'runners', patrol('bottleThrower', [36, 12], [42, 12])),
      // the lorry loaders: they watch the top street, then come for the bay
      guard('Loader', 48, 3, 'loaders', post('marketEnforcer', 2)),
      guard('Loader', 41, 6, 'loaders', patrol('marketEnforcer', [35, 6], [42, 6])),
      chaser('Late Loader', 49, 13, 'lateLoaders', post('bottleThrower', 2)),
      guard('Late Loader', 40, 13, 'lateLoaders', patrol('areaBoy', [36, 13], [44, 13])),
      guard('Last Loader', 30, 7, 'lastLoaders', patrol('marketEnforcer', [26, 7], [33, 7])),
    ],
    timeLimitSec: 600,
    parSec: 255,
  },
  // ---------------------------------------------------------------- Fadeyi / Somolu
  {
    id: 'fadeyiSomolu.approach',
    sectorId: 'fadeyiSomolu.tollRoad',
    districtId: 'fadeyiSomolu',
    name: 'Toll Approach',
    start: [5, 27],
    returnMarker: m(3, 26, 'TOLL GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 2 marshals on the approach road.', group: 'marshals' },
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 toll posts.',
        markers: [m(9, 27, 'TOLL POST A'), m(22, 27, 'TOLL POST B')],
      },
      { kind: 'door', text: 'Stand on the tool-shed door for 1 second to raid it.', doorId: 'shed' },
    ],
    doors: [
      {
        id: 'shed',
        x: 30,
        y: 27,
        label: 'TOOL SHED',
        raidId: 'junctionToolShed',
        returnTile: [29, 27],
        required: true,
      },
    ],
    enemies: [
      guard('Kobo Marshal', 12, 26, 'marshals', post('routeMarshal')),
      guard('Kobo Marshal', 20, 29, 'marshals', patrol('routeMarshal', [20, 26], [20, 30])),
    ],
    timeLimitSec: 360,
    parSec: 190,
  },
  {
    id: 'fadeyiSomolu.junctions',
    sectorId: 'fadeyiSomolu.northJunctions',
    districtId: 'fadeyiSomolu',
    name: 'Junction Run',
    start: [4, 10],
    returnMarker: m(4, 4, 'ROUTE OFFICE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 3 junction posts, west to east.',
        markers: [m(12, 5, 'JUNCTION 1'), m(28, 4, 'JUNCTION 2'), m(36, 10, 'JUNCTION 3')],
      },
      {
        kind: 'escapeRoute',
        text: 'Escape to the slip road before the marshal catches you.',
        group: 'pursuers',
        exit: m(37, 3, 'SLIP ROAD'),
      },
    ],
    doors: [],
    enemies: [
      guard('Kobo Marshal', 20, 6, 'posts', patrol('routeMarshal', [15, 6], [27, 6])),
      chaser('Kobo Marshal', 10, 10, 'pursuers', { variant: 'bottleThrower' }),
    ],
    timeLimitSec: 420,
    parSec: 220,
  },
  // ---------------------------------------------------------------- Ebute-Metta
  {
    id: 'ebuteMetta.approach',
    sectorId: 'ebuteMetta.yardApproach',
    districtId: 'ebuteMetta',
    name: 'Yard Approach',
    start: [ebuteX(3), 32],
    returnMarker: m(ebuteX(6), 36, 'YARD GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 3 checkpoints to the signal box.',
        markers: [m(ebuteX(10), 36, 'FENCE'), m(ebuteX(20), 32, 'SIDING'), m(ebuteX(30), 27, 'SIGNAL BOX')],
      },
      { kind: 'door', text: 'Stand on the signal-shed door for 1 second to raid it.', doorId: 'shed' },
    ],
    doors: [
      {
        id: 'shed',
        x: ebuteX(33),
        y: 29,
        label: 'SIGNAL SHED',
        raidId: 'junctionToolShed',
        returnTile: [ebuteX(33), 28],
        required: true,
      },
    ],
    enemies: [
      guard(
        'Switchman',
        ebuteX(12),
        34,
        'switchmen',
        patrol('ringSecurity', [ebuteX(12), 32], [ebuteX(12), 36]),
      ),
      guard(
        'Switchman',
        ebuteX(26),
        34,
        'switchmen',
        patrol('ringSecurity', [ebuteX(22), 34], [ebuteX(30), 34]),
      ),
    ],
    timeLimitSec: 360,
    parSec: 180,
  },
  // Ebute-Metta section 2 is a standalone raid (railYardGoods): no field mission.
  // ---------------------------------------------------------------- Lagos Island
  {
    id: 'lagosIsland.approach',
    sectorId: 'lagosIsland.ledgerRow',
    districtId: 'lagosIsland',
    name: 'Ledger Row',
    start: [4, 23],
    returnMarker: m(3, 29, 'ROW GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 2 auditors on the west row.', group: 'auditors' },
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 ledger counters.',
        markers: [m(8, 28, 'COUNTER 1'), m(18, 28, 'COUNTER 2')],
      },
      { kind: 'door', text: 'Stand on the annexe door for 1 second to raid it.', doorId: 'annexe' },
    ],
    doors: [
      {
        id: 'annexe',
        x: 14,
        y: 30,
        label: 'RECORDS ANNEXE',
        raidId: 'recordsVault',
        returnTile: [14, 29],
        required: true,
      },
    ],
    enemies: [
      guard('Ledger Auditor', 10, 21, 'auditors', patrol('ringSecurity', [5, 21], [15, 21])),
      guard('Ledger Auditor', 14, 25, 'auditors', patrol('ringSecurity', [9, 25], [16, 25])),
    ],
    timeLimitSec: 360,
    parSec: 190,
  },
  {
    id: 'lagosIsland.press',
    sectorId: 'lagosIsland.pressGrid',
    districtId: 'lagosIsland',
    name: 'Press Run',
    start: [4, 4],
    returnMarker: m(4, 10, 'PRESS GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 desks to collect the audit slips.',
        markers: [m(10, 7, 'DESK 1'), m(16, 10, 'DESK 2')],
      },
      {
        kind: 'escapeRoute',
        text: 'Escape to the press lane before the auditor catches you.',
        group: 'pursuers',
        exit: m(22, 21, 'PRESS LANE'),
      },
    ],
    doors: [],
    enemies: [
      chaser('Bureau Auditor', 2, 8, 'pursuers', { variant: 'bottleThrower' }),
      guard('Ledger Auditor', 7, 12, 'desks', patrol('marketEnforcer', [7, 10], [7, 14])),
    ],
    timeLimitSec: 420,
    parSec: 220,
  },
  // ---------------------------------------------------------------- Lekki
  {
    id: 'lekki.approach',
    sectorId: 'lekki.gateApproach',
    districtId: 'lekki',
    name: 'Gate Approach',
    start: [3, 26],
    returnMarker: m(4, 22, 'SIDE GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 checkpoints along the garden wall.',
        markers: [m(8, 26, 'GARDEN WALL'), m(16, 26, 'POOL EDGE')],
      },
      { kind: 'door', text: 'Stand on the plant door for 1 second to raid it.', doorId: 'plant' },
    ],
    doors: [
      {
        id: 'plant',
        x: 14,
        y: 29,
        label: 'STANDBY PLANT',
        raidId: 'standbyPlant',
        returnTile: [14, 28],
        required: true,
      },
    ],
    enemies: [
      guard('Gate Guard', 11, 24, 'gatehouse', patrol('ringSecurity', [5, 23], [11, 23])),
      guard('Gate Guard', 16, 25, 'gatehouse', patrol('ringSecurity', [16, 23], [22, 23])),
      blocker('Gate Blocker', 12, 26, 'gatehouse', post('heavyEnforcer', 1)),
    ],
    timeLimitSec: 360,
    parSec: 190,
  },
  {
    id: 'lekki.estate',
    sectorId: 'lekki.northEstate',
    districtId: 'lekki',
    name: 'Estate Sweep',
    start: [3, 3],
    returnMarker: m(4, 8, 'ESTATE GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 2 guards on the north drive.', group: 'patrol' },
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 security posts on the east lawn.',
        markers: [m(33, 3, 'POST 1'), m(44, 8, 'POST 2')],
      },
      {
        kind: 'escapeRoute',
        text: 'Escape to the service road before the hound catches you.',
        group: 'pursuers',
        exit: m(53, 13, 'SERVICE ROAD'),
      },
    ],
    doors: [],
    enemies: [
      guard('Estate Guard', 14, 8, 'patrol', patrol('ringSecurity', [10, 8], [20, 8])),
      guard('Estate Guard', 26, 9, 'patrol', patrol('ringSecurity', [20, 9], [32, 9])),
      chaser('Estate Hound', 26, 13, 'pursuers', { variant: 'bottleThrower' }),
    ],
    timeLimitSec: 480,
    parSec: 260,
  },
];

export const FIELD_MISSION_DEFS: Readonly<Record<string, FieldMissionDef>> = Object.fromEntries(
  defs.map((d) => [d.id, d]),
);

export const FIELD_MISSION_IDS: readonly string[] = defs.map((d) => d.id);

export function getFieldMission(id: string): FieldMissionDef {
  const def = FIELD_MISSION_DEFS[id];
  if (!def) throw new Error(`unknown field mission ${id}`);
  return def;
}

/** The legs of a mission including the implicit last one. */
export function fieldLegCount(def: FieldMissionDef): number {
  return def.legs.length + 1;
}
