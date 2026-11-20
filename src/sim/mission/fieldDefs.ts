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
import { FINALE_FIELD_DEFS } from './finaleDefs';
import { ARCHIVED_FIELD_DEFS } from './archivedFieldDefs';
import { ORITA_ARENA_ID } from '../arenas/campaign/oshodiOrita';
import { RAILSIDE_ARENA_ID } from '../arenas/campaign/oshodiRailside';
import { PARTS_ROW_ARENA_ID } from '../arenas/campaign/mushinPartsRow';
import { MARKET_HALL_ARENA_ID } from '../arenas/campaign/mushinMarketHall';
import { TOLL_CORRIDOR_ARENA_ID } from '../arenas/campaign/fadeyiTollCorridor';
import { SIDE_ROUTES_ARENA_ID } from '../arenas/campaign/fadeyiSideRoutes';

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
   * district map closed by barricades, or a campaign area's play area and gates. Absent = the whole district map.
   */
  sectorId?: string;
  /**
   * The campaign-only arena the mission is played on: its campaign area's own board (`src/sim/mission/areas.ts`,
   * `CAMPAIGN_ARENAS`; decision WX1). Absent = the district's City Rumble arena (`MISSION_DEFS[districtId].arenaId`).
   */
  arenaId?: string;
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
    // Campaign area `oshodi.orita` (decisions WX5-WX7): the same legs on the area's own board. The kiosk warden still teaches
    // the first trap by the start; a fare tout in the forecourt, the market warden and the lane tout make each sub-area an
    // encounter; the depot's steel gate opens once the checkpoints are walked.
    id: 'oshodi.approach',
    arenaId: ORITA_ARENA_ID,
    sectorId: 'oshodi.orita',
    districtId: 'oshodi',
    name: 'Terminal Approach',
    start: [3, 21],
    returnMarker: m(4, 18, 'ORITA GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 3 checkpoints. No need to stop.',
        markers: [m(12, 6, 'CHECKPOINT A'), m(28, 7, 'CHECKPOINT B'), m(29, 21, 'CHECKPOINT C')],
      },
      { kind: 'door', text: 'Stand on the depot door for 1 second to raid it.', doorId: 'depot' },
    ],
    doors: [
      {
        id: 'depot',
        x: 36,
        y: 13,
        label: 'DISPATCH DEPOT',
        raidId: 'warehouseDispatchDepot',
        returnTile: [36, 14],
        required: true,
      },
    ],
    enemies: [
      // the ticket kiosk by the gate: a loop round it, turning its back at the far corners (the first trap is taught here)
      guard('Park Warden', 3, 13, 'wardens', patrol('agbero', [3, 13], [9, 13], [9, 16], [3, 16])),
      // a fare tout under the forecourt canopy, between checkpoints A and B: throws at whoever crosses the queue lines
      chaser('Fare Tout', 20, 4, 'wardens', post('bottleThrower', 2)),
      // the market lanes: a warden loops the middle stall block
      guard('Park Warden', 17, 14, 'wardens', patrol('agbero', [17, 14], [22, 14], [22, 18], [17, 18])),
      // a lookout at the market's east end by the depot fence: throws down the lanes
      chaser('Ticket Tout', 30, 14, 'wardens', post('bottleThrower', 2)),
      // the depot lane: walks across the depot door (only a blast finishes it)
      blocker('Lane Blocker', 37, 15, 'wardens', patrol('heavyEnforcer', [33, 15], [41, 15])),
    ],
    timeLimitSec: 360,
    parSec: 120,
  },
  {
    // Campaign area `oshodi.railside` (decisions WX5, WX8): the same legs, groups and story on the area's own board. The
    // hawkers loop the market blocks, the relay boxes stand by the buffer stop, the mast shed and the service yard, the
    // trailer crews come back for the siding plaza, and the station's barrier gate lifts for the escape to the footbridge.
    id: 'oshodi.railEdge',
    arenaId: RAILSIDE_ARENA_ID,
    sectorId: 'oshodi.railside',
    districtId: 'oshodi',
    name: 'Rail Edge',
    start: [3, 24],
    returnMarker: m(44, 24, 'PARK GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 2 hawkers in the market lane.', group: 'hawkers' },
      {
        kind: 'destroyTargets',
        text: 'Destroy the 3 relay boxes along the siding.',
        crew: 'relayCrew',
        targets: [
          { id: 'relayDepot', kind: 'relayBox', x: 29, y: 17, label: 'RELAY BOX', hp: 3 },
          { id: 'relayMast', kind: 'relayBox', x: 30, y: 7, label: 'RELAY BOX', hp: 3 },
          { id: 'relayPlaza', kind: 'relayBox', x: 15, y: 5, label: 'RELAY BOX', hp: 3 },
        ],
      },
      {
        kind: 'holdArea',
        text: 'Keep the rail plaza clear for 25 seconds.',
        area: { x: 8, y: 8, radius: 2, label: 'RAIL PLAZA' },
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
        exit: m(42, 6, 'FOOTBRIDGE'),
      },
    ],
    doors: [],
    enemies: [
      // the market lanes: two hawkers loop the stall blocks
      guard('Lane Hawker', 7, 12, 'hawkers', patrol('marketEnforcer', [7, 12], [16, 12], [16, 15], [7, 15])),
      guard('Lane Hawker', 10, 19, 'hawkers', patrol('marketEnforcer', [3, 19], [14, 19], [14, 16], [3, 16])),
      // the relay crew: a heavy stands by the nearest box still working, a warden walks round the mast shed
      blocker('Relay Minder', 29, 10, 'relayCrew', post('heavyEnforcer', 1)),
      guard('Plaza Warden', 23, 5, 'lookouts', patrol('agbero', [23, 5], [29, 5], [29, 9], [23, 9])),
      // the trailer crew: they walk the siding and watch the plaza, then come to take it back
      guard('Trailer Crew', 12, 4, 'trailerCrew', patrol('agbero', [3, 4], [16, 4])),
      chaser('Trailer Crew', 16, 10, 'trailerCrew', post('bottleThrower', 2)),
      guard('Trailer Crew', 4, 11, 'lateCrew', patrol('areaBoy', [3, 11], [17, 11])),
      // the trailer hand waits at the market's corner below the plaza and sets off after you when the plaza is held (8 tiles
      // from it, and 4 tiles further from the footbridge than you: a fair start)
      chaser('Trailer Hand', 2, 10, 'pursuers', { variant: 'bottleThrower' }),
    ],
    timeLimitSec: 600,
    parSec: 270,
  },
  // ---------------------------------------------------------------- Mushin
  {
    // Campaign area `mushin.partsRow` (decisions WM2-WM3): the same legs, groups and story on the area's own board, the
    // Ladipo side streets and the supplier yard. A hawker loops the stall grid, a stall guard the engine back aisle; the
    // yard's steel gate opens once the checkpoints are walked; the cages stand on the loading apron and by the storeroom.
    id: 'mushin.approach',
    arenaId: PARTS_ROW_ARENA_ID,
    sectorId: 'mushin.partsRow',
    districtId: 'mushin',
    name: 'Spare-Parts Row',
    start: [3, 22],
    returnMarker: m(4, 20, 'ROW GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 checkpoints along the stalls.',
        markers: [m(23, 6, 'STALL ROW'), m(30, 20, 'BACK AISLE')],
      },
      {
        kind: 'destroyTargets',
        text: 'Destroy the 3 parts cages in the supplier yard.',
        crew: 'cageCrew',
        targets: [
          { id: 'cageNorth', kind: 'partsCage', x: 36, y: 10, label: 'PARTS CAGE', hp: 3 },
          { id: 'cageEast', kind: 'partsCage', x: 44, y: 12, label: 'PARTS CAGE', hp: 3 },
          { id: 'cageSouth', kind: 'partsCage', x: 42, y: 22, label: 'PARTS CAGE', hp: 3 },
        ],
      },
      { kind: 'door', text: 'Stand on the storeroom door for 1 second to raid it.', doorId: 'storeroom' },
    ],
    doors: [
      {
        id: 'storeroom',
        x: 39,
        y: 17,
        label: 'PARTS STOREROOM',
        raidId: 'partsStoreroom',
        returnTile: [39, 18],
        required: true,
      },
    ],
    enemies: [
      // the stall row: a hawker loops the middle stall blocks (the checkpoint's aisle is on its route)
      guard('Parts Hawker', 20, 9, 'hawkers', patrol('marketEnforcer', [20, 6], [26, 6], [26, 9], [20, 9])),
      // the engine back aisle: a stall guard loops the workshops and lock-ups by the yard gate
      guard(
        'Stall Guard',
        22,
        17,
        'hawkers',
        patrol('marketEnforcer', [16, 17], [28, 17], [28, 20], [16, 20]),
      ),
      // the supplier yard: a runner rounds the loading apron, a heavy minds the cages, a thrower watches the storeroom
      guard('Bay Runner', 41, 7, 'runners', patrol('areaBoy', [33, 7], [45, 7], [45, 12], [33, 12])),
      blocker('Cage Minder', 39, 12, 'cageCrew', post('heavyEnforcer', 1)),
      chaser('Bay Lookout', 44, 18, 'lookouts', post('bottleThrower', 2)),
    ],
    timeLimitSec: 480,
    parSec: 175,
  },
  {
    // Campaign area `mushin.marketHall` (decisions WM4-WM5): the same legs, groups and story on the area's own board, the
    // inside of the market. The runners work the covered hall and the provisions aisles; the hall's steel gate opens once
    // they are down; the far stall stands in the warehouse interiors, the top street is the service lane, and the lorry bay
    // at its east end is held while the loaders come out of the warehouses and the loaders' yard.
    id: 'mushin.market',
    arenaId: MARKET_HALL_ARENA_ID,
    sectorId: 'mushin.marketHall',
    districtId: 'mushin',
    name: 'Aisle Sweep',
    start: [3, 22],
    returnMarker: m(3, 3, 'MARKET GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 3 market runners in the market aisles.', group: 'runners' },
      {
        kind: 'reachMarkers',
        text: 'Walk through the 2 checkpoints to the top street.',
        markers: [m(37, 10, 'FAR STALL'), m(38, 4, 'TOP STREET')],
      },
      {
        kind: 'holdArea',
        text: 'Keep the lorry bay clear for 40 seconds.',
        area: { x: 44, y: 5, radius: 1, label: 'LORRY BAY' },
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
        x: 10,
        y: 10,
        label: 'BACK STALL',
        raidId: 'partsStoreroom',
        returnTile: [9, 10],
        required: false,
      },
    ],
    enemies: [
      // the runners: an area boy loops the hall's stall blocks, another the provisions aisles, a thrower walks the south aisle
      guard('Market Runner', 9, 12, 'runners', patrol('areaBoy', [5, 6], [14, 6], [14, 12], [5, 12])),
      guard('Market Runner', 24, 13, 'runners', patrol('areaBoy', [21, 6], [26, 6], [26, 13], [21, 13])),
      chaser('Market Runner', 24, 17, 'runners', patrol('bottleThrower', [17, 17], [30, 17])),
      // the lorry loaders: one rounds the warehouse goods bay, one walks the service lane; then they come for the bay
      guard('Loader', 44, 10, 'loaders', patrol('marketEnforcer', [42, 10], [47, 10], [47, 14], [42, 14])),
      guard('Loader', 36, 4, 'loaders', patrol('marketEnforcer', [32, 4], [41, 4])),
      // the late loaders: a thrower at the loaders' yard, an area boy round the tyre heap
      chaser('Late Loader', 46, 19, 'lateLoaders', post('bottleThrower', 2)),
      guard('Late Loader', 40, 20, 'lateLoaders', patrol('areaBoy', [39, 17], [44, 17], [44, 20], [39, 20])),
      // the last loader works the provisions aisles north and comes through the hall gate last
      guard(
        'Last Loader',
        26,
        9,
        'lastLoaders',
        patrol('marketEnforcer', [22, 5], [30, 5], [30, 9], [22, 9]),
      ),
    ],
    timeLimitSec: 600,
    parSec: 255,
  },
  // ---------------------------------------------------------------- Fadeyi / Somolu
  {
    // Campaign area `fadeyiSomolu.tollCorridor` (decisions WF1-WF3): the same legs, groups and story on the area's own board.
    // A marshal loops the slip's shop block, two more loop the blocks either side of the checkpoint street's barrier lines; the
    // toll boxes stand by the kiosk gap and north and south of the plaza's booth islands; the yard's toll bar lifts once they
    // are smashed, and a lookout covers the tool-shed door.
    id: 'fadeyiSomolu.approach',
    arenaId: TOLL_CORRIDOR_ARENA_ID,
    sectorId: 'fadeyiSomolu.tollCorridor',
    districtId: 'fadeyiSomolu',
    name: 'Toll Approach',
    start: [3, 21],
    returnMarker: m(3, 2, 'TOLL GATE'),
    legs: [
      {
        kind: 'clearGroup',
        text: 'Defeat the 3 marshals on the slip and the checkpoint street.',
        group: 'marshals',
      },
      {
        kind: 'destroyTargets',
        text: 'Destroy the 3 toll boxes along the checkpoint corridor.',
        crew: 'tollCrew',
        targets: [
          { id: 'tollRoad', kind: 'tollBox', x: 23, y: 8, label: 'TOLL BOX', hp: 3 },
          { id: 'tollPlaza', kind: 'tollBox', x: 30, y: 7, label: 'TOLL BOX', hp: 3 },
          { id: 'tollKerb', kind: 'tollBox', x: 30, y: 14, label: 'TOLL BOX', hp: 3 },
        ],
      },
      { kind: 'door', text: 'Stand on the tool-shed door for 1 second to raid it.', doorId: 'shed' },
    ],
    doors: [
      {
        id: 'shed',
        x: 41,
        y: 18,
        label: 'TOOL SHED',
        raidId: 'junctionToolShed',
        returnTile: [41, 19],
        required: true,
      },
    ],
    enemies: [
      // route marshals: one loops the slip's shop block, two loop the blocks either side of the checkpoint street
      guard('Kobo Marshal', 5, 4, 'marshals', patrol('routeMarshal', [5, 4], [10, 4], [10, 8], [5, 8])),
      guard('Kobo Marshal', 17, 5, 'marshals', patrol('routeMarshal', [17, 5], [22, 5], [22, 8], [17, 8])),
      guard(
        'Kobo Marshal',
        22,
        17,
        'marshals',
        patrol('routeMarshal', [22, 17], [17, 17], [17, 13], [22, 13]),
      ),
      // the toll crew: a heavy minds the nearest box still standing
      blocker('Toll Heavy', 32, 14, 'tollCrew', post('heavyEnforcer', 1)),
      // the yard lookout behind the toll bar: throws across the apron at the tool-shed door
      chaser('Toll Lookout', 44, 14, 'lookouts', post('bottleThrower', 2)),
    ],
    timeLimitSec: 420,
    parSec: 150,
  },
  {
    // Campaign area `fadeyiSomolu.sideRoutes` (decisions WF1, WF4): the same legs, groups and story on the area's own board.
    // The junction posts stand at the lane junctions west to east, the crossing crews walk the back lanes and come out of the
    // vehicle pound for the kept-clear centre junction, and the route checkpoint lifts for the escape up the slip road.
    id: 'fadeyiSomolu.junctions',
    arenaId: SIDE_ROUTES_ARENA_ID,
    sectorId: 'fadeyiSomolu.sideRoutes',
    districtId: 'fadeyiSomolu',
    name: 'Junction Run',
    start: [4, 12],
    returnMarker: m(5, 7, 'ROUTE OFFICE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk through the 3 junction posts, west to east.',
        markers: [m(12, 9, 'JUNCTION 1'), m(24, 5, 'JUNCTION 2'), m(32, 10, 'JUNCTION 3')],
      },
      {
        kind: 'holdArea',
        text: 'Keep the centre junction clear for 40 seconds.',
        area: { x: 24, y: 13, radius: 1, label: 'CENTRE JUNCTION' },
        holdSec: 40,
        waves: [
          { group: 'crossing', atSec: 3 },
          { group: 'lateCrossing', atSec: 14 },
          { group: 'lastCrossing', atSec: 26 },
        ],
      },
      {
        kind: 'escapeRoute',
        text: 'Escape to the slip road before the marshal catches you.',
        group: 'pursuers',
        exit: m(45, 2, 'SLIP ROAD'),
      },
    ],
    doors: [],
    enemies: [
      // junction 1: a marshal loops the house block at the west lane mouth
      guard('Kobo Marshal', 12, 6, 'posts', patrol('routeMarshal', [12, 6], [16, 6], [16, 10], [12, 10])),
      // the crossing crew: they walk the back lanes, then come to take the junction back
      guard('Kobo Marshal', 23, 6, 'crossing', patrol('routeMarshal', [23, 6], [28, 6], [28, 9], [23, 9])),
      guard('Kobo Marshal', 18, 2, 'crossing', patrol('routeMarshal', [14, 2], [31, 2])),
      // the late crews loop the pound's sheds; a lookout throws from the garage corner
      guard(
        'Kobo Marshal',
        14,
        16,
        'lateCrossing',
        patrol('routeMarshal', [14, 16], [20, 16], [20, 20], [14, 20]),
      ),
      chaser('Kobo Lookout', 30, 17, 'lateCrossing', post('bottleThrower', 2)),
      guard('Kobo Marshal', 20, 22, 'lastCrossing', patrol('areaBoy', [13, 22], [32, 22])),
      // the slip-road heavy: stands where the escape runs past (only a blast finishes him)
      blocker('Slip Heavy', 44, 8, 'slip', post('heavyEnforcer', 1)),
      // the marshal who waits in the pound and sets off after you when the junction is held (10 tiles from it, and further
      // from the slip road than you: a fair start)
      chaser('Kobo Marshal', 21, 20, 'pursuers', { variant: 'bottleThrower' }),
    ],
    timeLimitSec: 600,
    parSec: 255,
  },
  // ---------------------------------------------------------------- Ebute-Metta
  // Yard Approach (docs/CAMPAIGN_SECTOR_AI.md "Districts: Ebute Metta, Lagos Island, Lekki Phase 1", decisions
  // DB1-DB3): the house streets south of the yard are worked by two street patrols; the switch cabinets that route the
  // Ring's night freight stand in the lanes, minded by the switchmen; the yard lieutenant walks the lock-up yard by the
  // fence. Wrecking the cabinets opens the sidings gate: the freight guards hold the wagon lanes; the relief crew, then
  // whoever is left of the street patrols, come up from the streets while you keep the signal cabin. Then the
  // signal-shed raid, and back out to the yard gate.
  {
    id: 'ebuteMetta.approach',
    sectorId: 'ebuteMetta.yardApproach',
    districtId: 'ebuteMetta',
    name: 'Yard Approach',
    start: [ebuteX(3), 32],
    returnMarker: m(ebuteX(6), 36, 'YARD GATE'),
    legs: [
      {
        kind: 'destroyTargets',
        text: 'Destroy the 4 switch cabinets on the yard streets.',
        targets: [
          { id: 'cabinetWest', kind: 'switchCabinet', x: ebuteX(1), y: 29, label: 'SWITCH CABINET' },
          { id: 'cabinetMid', kind: 'switchCabinet', x: ebuteX(12), y: 29, label: 'SWITCH CABINET' },
          { id: 'cabinetYard', kind: 'switchCabinet', x: ebuteX(27), y: 35, label: 'SWITCH CABINET', hp: 2 },
          { id: 'cabinetFence', kind: 'switchCabinet', x: ebuteX(36), y: 31, label: 'SWITCH CABINET', hp: 2 },
        ],
        crew: 'switchmen',
      },
      { kind: 'clearGroup', text: 'Defeat the 2 freight guards on the sidings.', group: 'freight' },
      {
        kind: 'holdArea',
        text: 'Keep the signal cabin clear for 25 seconds.',
        area: { x: ebuteX(25), y: 22, radius: 1, label: 'SIGNAL CABIN' },
        holdSec: 25,
        waves: [
          { group: 'relief', atSec: 4 },
          { group: 'streets', atSec: 12 },
        ],
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
      // the street patrols: the middle street (between the houses and the lock-ups) and the north street
      guard('Yard Enforcer', ebuteX(12), 32, 'streets', patrol('agbero', [ebuteX(4), 31], [ebuteX(20), 31])),
      guard('Yard Runner', ebuteX(14), 27, 'streets', patrol('areaBoy', [ebuteX(2), 27], [ebuteX(22), 27])),
      // the switchmen mind the cabinets (they stand by the nearest one while the cabinets stand)
      guard('Switchman', ebuteX(13), 30, 'switchmen', post('agbero')),
      chaser('Bottle Switchman', ebuteX(28), 34, 'switchmen', post('bottleThrower', 3)),
      // behind the sidings gate: the freight guards on the wagon lanes
      blocker('Freight Guard', ebuteX(33), 23, 'freight', post('heavyEnforcer', 2)),
      chaser('Freight Thrower', ebuteX(34), 20, 'freight', post('bottleThrower', 2)),
      // the relief enforcer loiters in the south yard until the cabin is taken
      guard(
        'Relief Enforcer',
        ebuteX(20),
        35,
        'relief',
        patrol('agbero', [ebuteX(18), 35], [ebuteX(24), 35]),
      ),
      // the yard lieutenant walks the lock-up yard by the fence (he reads traps: a long fight, never required)
      guard(
        'Yard Lieutenant',
        ebuteX(32),
        35,
        'yard',
        patrol('lieutenant', [ebuteX(29), 36], [ebuteX(37), 36], [ebuteX(37), 33], [ebuteX(34), 34]),
      ),
    ],
    timeLimitSec: 540,
    parSec: 300,
  },
  // Ebute-Metta section 2 is a standalone raid (railYardGoods): no field mission.
  // ---------------------------------------------------------------- Lagos Island
  // Ledger Row (decision DB4): Ring security walks loops round the office blocks of the west row; when they are down the
  // traders' counter hall must be kept while the hall watch and a thrower come to take it back; a heavy minds the
  // records annexe door. Then the annexe raid, and out by the row gate.
  {
    id: 'lagosIsland.approach',
    sectorId: 'lagosIsland.ledgerRow',
    districtId: 'lagosIsland',
    name: 'Ledger Row',
    start: [4, 23],
    returnMarker: m(3, 29, 'ROW GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 3 auditors in the row alleys.', group: 'auditors' },
      {
        kind: 'holdArea',
        text: 'Keep the counter hall clear for 25 seconds.',
        area: { x: 9, y: 23, radius: 2, label: 'COUNTER HALL' },
        holdSec: 25,
        waves: [
          { group: 'hallWatch', atSec: 3 },
          { group: 'hallLate', atSec: 10 },
          { group: 'hallLast', atSec: 17 },
        ],
      },
      {
        kind: 'destroyTargets',
        text: 'Destroy the 3 stamp machines on the row.',
        targets: [
          { id: 'stampHall', kind: 'controlPoint', x: 15, y: 22, label: 'STAMP MACHINE', hp: 2 },
          { id: 'stampWest', kind: 'controlPoint', x: 9, y: 29, label: 'STAMP MACHINE', hp: 2 },
          { id: 'stampEast', kind: 'controlPoint', x: 19, y: 29, label: 'STAMP MACHINE', hp: 2 },
        ],
        crew: 'annexe',
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
      // two loops round the office blocks: north of the hall and south of it (watch a corner, lay on the loop)
      guard(
        'Ledger Auditor',
        8,
        18,
        'auditors',
        patrol('ringSecurity', [2, 18], [11, 18], [11, 21], [2, 21]),
      ),
      guard(
        'Ledger Auditor',
        16,
        28,
        'auditors',
        patrol('ringSecurity', [10, 25], [19, 25], [19, 28], [10, 28]),
      ),
      // the row's heavy holds the side street (a blast puts him down: lure him into an alley)
      blocker('Row Heavy', 22, 24, 'auditors', post('heavyEnforcer', 2)),
      // the hall watch (east end of the hall), a thrower on the side street and a runner from the south row come in
      // once the hall is taken
      guard(
        'Hall Guard',
        18,
        22,
        'hallWatch',
        patrol('ringSecurity', [19, 22], [23, 22], [23, 28], [19, 28]),
      ),
      chaser('Ledger Thrower', 22, 19, 'hallLate', post('bottleThrower', 2)),
      guard('Row Runner', 6, 29, 'hallLast', patrol('areaBoy', [7, 22], [10, 22], [10, 30], [7, 30])),
      // a heavy minds the annexe door and its stamp machines: lure him off them or blast him
      blocker('Annexe Heavy', 16, 29, 'annexe', post('heavyEnforcer', 1)),
    ],
    timeLimitSec: 420,
    parSec: 210,
  },
  // Press Run (decision DB5): the Ring's receipt presses (machines that print the forged licences) stand in the press
  // grid; Ring security walks the middle street and the pressmen mind the machines. Then the press lane, the only way
  // out, must be opened: a guard walks it and a heavy stands across its narrow end. When they are down the bureau sends
  // its auditor after you: down the press lane, then back to the press gate.
  {
    id: 'lagosIsland.press',
    sectorId: 'lagosIsland.pressGrid',
    districtId: 'lagosIsland',
    name: 'Press Run',
    start: [4, 4],
    returnMarker: m(4, 10, 'PRESS GATE'),
    legs: [
      {
        kind: 'destroyTargets',
        text: 'Destroy the 5 receipt presses in the press grid.',
        targets: [
          { id: 'pressNorth', kind: 'controlPoint', x: 11, y: 6, label: 'RECEIPT PRESS' },
          { id: 'pressMid', kind: 'controlPoint', x: 10, y: 12, label: 'RECEIPT PRESS', hp: 2 },
          { id: 'pressSouth', kind: 'controlPoint', x: 17, y: 14, label: 'RECEIPT PRESS', hp: 2 },
          { id: 'pressCorner', kind: 'controlPoint', x: 3, y: 14, label: 'RECEIPT PRESS', hp: 2 },
          { id: 'pressLane', kind: 'controlPoint', x: 20, y: 8, label: 'RECEIPT PRESS', hp: 2 },
        ],
        crew: 'pressmen',
      },
      { kind: 'clearGroup', text: 'Defeat the 2 guards blocking the press lane.', group: 'laneGuards' },
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
      // the press lane is blocked: Ring security walks it, a heavy stands across its narrow end (lure him, blast him)
      guard('Lane Guard', 23, 17, 'laneGuards', patrol('ringSecurity', [23, 14], [23, 20])),
      blocker('Lane Heavy', 22, 18, 'laneGuards', post('heavyEnforcer', 1)),
      // Ring security walks the middle street end to end; a thrower watches the wide south street
      guard('Lane Security', 6, 10, 'lanes', patrol('ringSecurity', [2, 10], [19, 10])),
      chaser('Lane Thrower', 20, 14, 'lanes', post('bottleThrower', 2)),
      // the pressmen stand by the nearest press while the presses stand
      guard('Pressman', 13, 7, 'pressmen', post('marketEnforcer')),
      guard('Pressman', 8, 13, 'pressmen', post('marketEnforcer')),
    ],
    timeLimitSec: 480,
    parSec: 240,
  },
  // ---------------------------------------------------------------- Lekki
  // Gate Approach (decision DB6): Ring private security holds the closed stretch of the estate road between its
  // gatehouses. Take the road and keep it while the guards from the east block come for it; then wreck the standby
  // feeders that carry the estates' private power, and raid the plant. Two guards walk the garden wall and the pool edge;
  // a heavy stands in the garden.
  {
    id: 'lekki.approach',
    sectorId: 'lekki.gateApproach',
    districtId: 'lekki',
    name: 'Gate Approach',
    start: [3, 26],
    returnMarker: m(4, 22, 'SIDE GATE'),
    legs: [
      {
        kind: 'holdArea',
        text: 'Keep the gatehouse road clear for 25 seconds.',
        area: { x: 19, y: 25, radius: 2, label: 'GATEHOUSE ROAD' },
        holdSec: 25,
        waves: [
          { group: 'gatehouse', atSec: 4 },
          { group: 'gatehouseLate', atSec: 11 },
        ],
      },
      {
        kind: 'destroyTargets',
        text: 'Destroy the 4 standby feeders by the estate road.',
        targets: [
          { id: 'feederNorth', kind: 'controlPoint', x: 29, y: 22, label: 'STANDBY FEEDER', hp: 2 },
          { id: 'feederSouth', kind: 'controlPoint', x: 32, y: 28, label: 'STANDBY FEEDER', hp: 2 },
          { id: 'feederGarden', kind: 'controlPoint', x: 7, y: 29, label: 'STANDBY FEEDER', hp: 2 },
          { id: 'feederRoad', kind: 'controlPoint', x: 25, y: 22, label: 'STANDBY FEEDER' },
        ],
        crew: 'feederCrew',
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
      // the garden wall and the pool edge: two patrols the whole width of the garden
      guard('Gate Guard', 11, 23, 'garden', patrol('ringSecurity', [4, 23], [17, 23])),
      guard('Pool Guard', 11, 27, 'garden', patrol('ringSecurity', [17, 27], [4, 27])),
      blocker('Gate Blocker', 12, 26, 'garden', post('heavyEnforcer', 1)),
      // the gatehouse guards wait in the east block, then come for the road
      guard(
        'Gatehouse Guard',
        27,
        25,
        'gatehouse',
        patrol('ringSecurity', [27, 25], [33, 25], [33, 29], [27, 29]),
      ),
      chaser('Gatehouse Thrower', 30, 29, 'gatehouseLate', post('bottleThrower', 2)),
      // the feeder crew
      guard('Feeder Tech', 31, 25, 'feederCrew', post('ringSecurity')),
    ],
    timeLimitSec: 480,
    parSec: 240,
  },
  // Estate Sweep (decision DB7): two Ring guards walk the north drive, a heavy holds the drive gate and a thrower the
  // lawn terrace. When they are
  // down the inner estate gate opens on the east lawn, where the control points that switch the standby grid stand with
  // their crew. Wreck them and the hounds are loosed from their kennel: back west to the service lane, then on to the
  // estate gate.
  {
    id: 'lekki.estate',
    sectorId: 'lekki.northEstate',
    districtId: 'lekki',
    name: 'Estate Sweep',
    start: [3, 3],
    returnMarker: m(4, 8, 'ESTATE GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Defeat the 4 guards on the north drive.', group: 'patrol' },
      {
        kind: 'destroyTargets',
        text: 'Destroy the 5 control points on the east lawn.',
        targets: [
          { id: 'controlNorth', kind: 'controlPoint', x: 43, y: 7, label: 'CONTROL POINT', hp: 2 },
          { id: 'controlMid', kind: 'controlPoint', x: 45, y: 11, label: 'CONTROL POINT', hp: 2 },
          { id: 'controlEast', kind: 'controlPoint', x: 47, y: 8, label: 'CONTROL POINT', hp: 2 },
          { id: 'controlSouth', kind: 'controlPoint', x: 42, y: 12, label: 'CONTROL POINT' },
          { id: 'controlGate', kind: 'controlPoint', x: 41, y: 9, label: 'CONTROL POINT', hp: 2 },
        ],
        crew: 'lawnCrew',
      },
      {
        kind: 'escapeRoute',
        text: 'Escape to the service lane before a hound catches you.',
        group: 'pursuers',
        exit: m(24, 13, 'SERVICE LANE'),
      },
    ],
    doors: [],
    enemies: [
      // the north drive: two guards walk it end to end between the pillars, out of step
      guard('Estate Guard', 10, 3, 'patrol', patrol('ringSecurity', [4, 3], [20, 3])),
      guard('Estate Guard', 28, 3, 'patrol', patrol('ringSecurity', [35, 3], [20, 3])),
      // the drive gate heavy, and a thrower on the central lawn terrace
      blocker('Drive Heavy', 12, 8, 'patrol', post('heavyEnforcer', 1)),
      chaser('Terrace Thrower', 30, 8, 'patrol', post('bottleThrower', 2)),
      // behind the inner gate: the control point crew
      guard('Grid Tech', 45, 9, 'lawnCrew', post('ringSecurity')),
      guard('Grid Tech', 50, 11, 'lawnCrew', post('ringSecurity')),
      // the hound kennels in the lawn's east corners: loosed when the grid goes down, they run you back west
      chaser('Estate Hound', 54, 13, 'pursuers', { variant: 'bottleThrower' }),
      chaser('Estate Hound', 54, 6, 'pursuers', { variant: 'areaBoy' }),
    ],
    timeLimitSec: 420,
    parSec: 180,
  },
];

// the Ojuelegba finale's two field missions (19, 20) follow the districts' (decision FN2; data in finaleDefs.ts)
const all: readonly FieldMissionDef[] = [...defs, ...FINALE_FIELD_DEFS];

export const FIELD_MISSION_DEFS: Readonly<Record<string, FieldMissionDef>> = Object.fromEntries(
  all.map((d) => [d.id, d]),
);

export const FIELD_MISSION_IDS: readonly string[] = all.map((d) => d.id);

export function getFieldMission(id: string): FieldMissionDef {
  const def = FIELD_MISSION_DEFS[id];
  if (!def) throw new Error(`unknown field mission ${id}`);
  return def;
}

/**
 * The field mission a spec plays: its own data, or (the archived combat pilot's replay only, decision WX8) the frozen data
 * the pilot was tuned on.
 */
export function fieldMissionOf(spec: { fieldId?: string; archivedPilot?: boolean }): FieldMissionDef {
  const archived = spec.archivedPilot && spec.fieldId ? ARCHIVED_FIELD_DEFS[spec.fieldId] : undefined;
  return archived ?? getFieldMission(spec.fieldId!);
}

/** Does this spec replay frozen mission data (the archived combat pilot, decision WX8)? */
export function archivedReplay(spec: { fieldId?: string; archivedPilot?: boolean }): boolean {
  return !!(spec.archivedPilot && spec.fieldId && ARCHIVED_FIELD_DEFS[spec.fieldId]);
}

/** The field mission a running match plays (its runtime remembers whether it is the archived replay). */
export function fieldMissionOfRuntime(f: { fieldId: string; archivedPilot?: true }): FieldMissionDef {
  return fieldMissionOf({ fieldId: f.fieldId, archivedPilot: f.archivedPilot === true });
}

/** The legs of a mission including the implicit last one. */
export function fieldLegCount(def: FieldMissionDef): number {
  return def.legs.length + 1;
}
