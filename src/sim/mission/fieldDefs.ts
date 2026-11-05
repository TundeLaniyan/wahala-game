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
import type { RaidId } from '../campaign/types';
import type { Tile2 } from './defs';

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
}

export type FieldLegDef =
  | { kind: 'reachMarkers'; text: string; markers: FieldMarkerDef[] }
  | { kind: 'clearGroup'; text: string; group: string }
  | { kind: 'escapeRoute'; text: string; group: string; exit: FieldMarkerDef }
  | { kind: 'door'; text: string; doorId: string };

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
}

const m = (x: number, y: number, label: string): FieldMarkerDef => ({ x, y, label });
const guard = (name: string, x: number, y: number, group: string, radius = 3): FieldEnemyDef => ({
  role: 'meleeGuard',
  name,
  post: [x, y],
  group,
  radius,
});
const blocker = (name: string, x: number, y: number, group: string): FieldEnemyDef => ({
  role: 'blocker',
  name,
  post: [x, y],
  group,
});
const chaser = (name: string, x: number, y: number, group: string): FieldEnemyDef => ({
  role: 'rangedAttacker',
  name,
  post: [x, y],
  group,
});

/** Hold time on a door before it raises the raid request (1 s), and how long a pursuer must stay next to you to catch you. */
export const DOOR_HOLD_TICKS = 60;
export const CATCH_TICKS = 40;
/** Spawn protection granted when a lost life or a raid puts the human back on the map. */
export const FIELD_MERCY_TICKS = 120;

const defs: FieldMissionDef[] = [
  // ---------------------------------------------------------------- Oshodi (the vertical slice)
  {
    id: 'oshodi.approach',
    districtId: 'oshodi',
    name: 'Terminal Approach',
    start: [3, 42],
    returnMarker: m(4, 38, 'ORITA GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk the bay checkpoints to the depot yard.',
        markers: [m(9, 39, 'CHECKPOINT A'), m(19, 39, 'CHECKPOINT B'), m(26, 40, 'YARD GATE')],
      },
      { kind: 'door', text: 'Step on the depot door and hold: the warehouse raid.', doorId: 'depot' },
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
      guard('Park Warden', 14, 39, 'wardens'),
      guard('Park Warden', 27, 41, 'wardens'),
      blocker('Lane Blocker', 20, 42, 'wardens'),
    ],
    timeLimitSec: 360,
    parSec: 180,
  },
  {
    id: 'oshodi.railEdge',
    districtId: 'oshodi',
    name: 'Rail Edge',
    start: [44, 42],
    returnMarker: m(58, 43, 'PARK GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Put down the hawkers holding the market lane.', group: 'hawkers' },
      {
        kind: 'escapeRoute',
        text: 'The trailer crew is after you: reach the footbridge first.',
        group: 'pursuers',
        exit: m(59, 28, 'FOOTBRIDGE'),
      },
    ],
    doors: [],
    enemies: [
      guard('Lane Hawker', 50, 39, 'hawkers'),
      guard('Lane Hawker', 55, 39, 'hawkers'),
      chaser('Trailer Hand', 36, 30, 'pursuers'),
    ],
    timeLimitSec: 420,
    parSec: 210,
  },
  // ---------------------------------------------------------------- Mushin
  {
    id: 'mushin.approach',
    districtId: 'mushin',
    name: 'Spare-Parts Row',
    start: [3, 30],
    returnMarker: m(4, 36, 'ROW GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Follow the row of stalls to the storeroom lane.',
        markers: [m(7, 34, 'STALL ROW'), m(18, 36, 'BACK AISLE'), m(33, 33, 'LOADING BAY')],
      },
      { kind: 'door', text: 'Hold on the storeroom door: the parts raid.', doorId: 'storeroom' },
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
      guard('Parts Hawker', 12, 34, 'hawkers'),
      guard('Stall Guard', 24, 36, 'hawkers'),
      blocker('Aisle Blocker', 31, 36, 'hawkers'),
    ],
    timeLimitSec: 360,
    parSec: 180,
  },
  {
    id: 'mushin.market',
    districtId: 'mushin',
    name: 'Aisle Sweep',
    start: [3, 13],
    returnMarker: m(4, 4, 'MARKET GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Clear the runners working the north aisles.', group: 'runners' },
      {
        kind: 'reachMarkers',
        text: 'Check the two far stalls on the top street.',
        markers: [m(34, 7, 'FAR STALL'), m(49, 5, 'TOP STREET')],
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
      guard('Market Runner', 20, 10, 'runners'),
      guard('Market Runner', 28, 13, 'runners'),
      chaser('Market Runner', 40, 12, 'runners'),
    ],
    timeLimitSec: 420,
    parSec: 220,
  },
  // ---------------------------------------------------------------- Fadeyi / Somolu
  {
    id: 'fadeyiSomolu.approach',
    districtId: 'fadeyiSomolu',
    name: 'Toll Approach',
    start: [5, 27],
    returnMarker: m(3, 26, 'TOLL GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Move the marshals off the approach road.', group: 'marshals' },
      {
        kind: 'reachMarkers',
        text: 'Walk the two toll posts to the shed.',
        markers: [m(9, 27, 'TOLL POST A'), m(22, 27, 'TOLL POST B')],
      },
      { kind: 'door', text: 'Hold on the tool-shed door: the shed raid.', doorId: 'shed' },
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
    enemies: [guard('Kobo Marshal', 12, 26, 'marshals'), guard('Kobo Marshal', 20, 29, 'marshals')],
    timeLimitSec: 360,
    parSec: 190,
  },
  {
    id: 'fadeyiSomolu.junctions',
    districtId: 'fadeyiSomolu',
    name: 'Junction Run',
    start: [4, 10],
    returnMarker: m(4, 4, 'ROUTE OFFICE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Walk the junction posts, west to east.',
        markers: [m(12, 5, 'JUNCTION 1'), m(28, 4, 'JUNCTION 2'), m(36, 10, 'JUNCTION 3')],
      },
      {
        kind: 'escapeRoute',
        text: 'The marshals are on you: reach the north slip road.',
        group: 'pursuers',
        exit: m(37, 3, 'SLIP ROAD'),
      },
    ],
    doors: [],
    enemies: [guard('Kobo Marshal', 20, 6, 'posts'), chaser('Kobo Marshal', 10, 10, 'pursuers')],
    timeLimitSec: 420,
    parSec: 220,
  },
  // ---------------------------------------------------------------- Ebute-Metta
  {
    id: 'ebuteMetta.approach',
    districtId: 'ebuteMetta',
    name: 'Yard Approach',
    start: [3, 32],
    returnMarker: m(6, 36, 'YARD GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Follow the yard fence to the signal box.',
        markers: [m(10, 36, 'FENCE'), m(20, 32, 'SIDING'), m(30, 27, 'SIGNAL BOX')],
      },
      { kind: 'door', text: 'Hold on the shed door: the tool-shed raid.', doorId: 'shed' },
    ],
    doors: [
      {
        id: 'shed',
        x: 33,
        y: 29,
        label: 'SIGNAL SHED',
        raidId: 'junctionToolShed',
        returnTile: [33, 28],
        required: true,
      },
    ],
    enemies: [guard('Switchman', 12, 34, 'switchmen'), guard('Switchman', 26, 34, 'switchmen')],
    timeLimitSec: 360,
    parSec: 180,
  },
  // Ebute-Metta section 2 is a standalone raid (railYardGoods): no field mission.
  // ---------------------------------------------------------------- Lagos Island
  {
    id: 'lagosIsland.approach',
    districtId: 'lagosIsland',
    name: 'Ledger Row',
    start: [4, 23],
    returnMarker: m(3, 29, 'ROW GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Move the auditors off the west row.', group: 'auditors' },
      {
        kind: 'reachMarkers',
        text: 'Walk the two ledger counters.',
        markers: [m(8, 28, 'COUNTER 1'), m(18, 28, 'COUNTER 2')],
      },
      { kind: 'door', text: 'Hold on the annexe door: the records raid.', doorId: 'annexe' },
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
    enemies: [guard('Ledger Auditor', 10, 21, 'auditors'), guard('Ledger Auditor', 14, 25, 'auditors')],
    timeLimitSec: 360,
    parSec: 190,
  },
  {
    id: 'lagosIsland.press',
    districtId: 'lagosIsland',
    name: 'Press Run',
    start: [4, 4],
    returnMarker: m(4, 10, 'PRESS GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Collect the audit slips at both desks.',
        markers: [m(10, 7, 'DESK 1'), m(16, 10, 'DESK 2')],
      },
      {
        kind: 'escapeRoute',
        text: 'The bureau knows: reach the press lane before the auditors.',
        group: 'pursuers',
        exit: m(22, 21, 'PRESS LANE'),
      },
    ],
    doors: [],
    enemies: [chaser('Bureau Auditor', 2, 8, 'pursuers'), guard('Ledger Auditor', 7, 12, 'desks')],
    timeLimitSec: 420,
    parSec: 220,
  },
  // ---------------------------------------------------------------- Lekki
  {
    id: 'lekki.approach',
    districtId: 'lekki',
    name: 'Gate Approach',
    start: [3, 26],
    returnMarker: m(4, 22, 'SIDE GATE'),
    legs: [
      {
        kind: 'reachMarkers',
        text: 'Slip along the garden wall past the gatehouse.',
        markers: [m(8, 26, 'GARDEN WALL'), m(16, 26, 'POOL EDGE')],
      },
      { kind: 'door', text: 'Hold on the plant door: the standby-plant raid.', doorId: 'plant' },
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
      guard('Gate Guard', 11, 24, 'gatehouse'),
      guard('Gate Guard', 16, 25, 'gatehouse'),
      blocker('Gate Blocker', 12, 26, 'gatehouse'),
    ],
    timeLimitSec: 360,
    parSec: 190,
  },
  {
    id: 'lekki.estate',
    districtId: 'lekki',
    name: 'Estate Sweep',
    start: [3, 3],
    returnMarker: m(4, 8, 'ESTATE GATE'),
    legs: [
      { kind: 'clearGroup', text: 'Clear the patrol on the north drive.', group: 'patrol' },
      {
        kind: 'reachMarkers',
        text: 'Check the two security posts on the east lawn.',
        markers: [m(33, 3, 'POST 1'), m(44, 8, 'POST 2')],
      },
      {
        kind: 'escapeRoute',
        text: 'The hounds are loose: get to the service road.',
        group: 'pursuers',
        exit: m(53, 13, 'SERVICE ROAD'),
      },
    ],
    doors: [],
    enemies: [
      guard('Estate Guard', 14, 8, 'patrol'),
      guard('Estate Guard', 26, 9, 'patrol'),
      chaser('Estate Hound', 26, 13, 'pursuers'),
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
