/**
 * FROZEN field mission data, replayed only by the ARCHIVED Oshodi combat pilot (docs/OSHODI_COMBAT_PILOT.md, decisions
 * CP1-CP12, superseded by SA3; decision WX8). Mission 1 now plays on its own campaign area (`areasOshodi.ts`); the pilot's
 * reference tests and `npm run combat-pilot` keep measuring the pilot on the board it was tuned on: Terminal Approach as it
 * was on 0b89d09, in its old sector of the City Rumble map. The campaign never reads this (only `MissionSpec.archivedPilot`).
 */
import type { FieldMissionDef } from './fieldDefs';

/** Terminal Approach before the campaign areas (decision WX8): the district sector `oshodi.terminalApproach`. */
const TERMINAL_APPROACH_2026_11: FieldMissionDef = {
  id: 'oshodi.approach',
  sectorId: 'oshodi.terminalApproach',
  districtId: 'oshodi',
  name: 'Terminal Approach',
  start: [3, 42],
  returnMarker: { x: 4, y: 38, label: 'ORITA GATE' },
  legs: [
    {
      kind: 'reachMarkers',
      text: 'Walk through the 3 checkpoints. No need to stop.',
      markers: [
        { x: 9, y: 39, label: 'CHECKPOINT A' },
        { x: 19, y: 39, label: 'CHECKPOINT B' },
        { x: 26, y: 40, label: 'CHECKPOINT C' },
      ],
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
    {
      role: 'meleeGuard',
      name: 'Park Warden',
      post: [14, 37],
      group: 'wardens',
      radius: 3,
      variant: 'agbero',
      territory: {
        patrol: [
          [10, 37],
          [18, 37],
          [18, 39],
          [10, 39],
        ],
      },
    },
    {
      role: 'meleeGuard',
      name: 'Park Warden',
      post: [13, 41],
      group: 'wardens',
      radius: 3,
      variant: 'agbero',
      territory: {
        patrol: [
          [12, 42],
          [21, 42],
          [21, 44],
          [12, 44],
        ],
      },
    },
    {
      role: 'rangedAttacker',
      name: 'Ticket Tout',
      post: [31, 41],
      group: 'wardens',
      variant: 'bottleThrower',
      territory: { radius: 2 },
    },
    {
      role: 'blocker',
      name: 'Lane Blocker',
      post: [23, 42],
      group: 'wardens',
      variant: 'heavyEnforcer',
      territory: {
        patrol: [
          [20, 42],
          [27, 42],
        ],
      },
    },
  ],
  timeLimitSec: 360,
  parSec: 90,
};

/** Archived replays by field mission id (only with `MissionSpec.archivedPilot`). */
export const ARCHIVED_FIELD_DEFS: Readonly<Record<string, FieldMissionDef>> = {
  'oshodi.approach': TERMINAL_APPROACH_2026_11,
};
