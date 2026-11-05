/**
 * Classic raid runtime public API (docs/CLASSIC_RAIDS.md). `raidView` is the read-only picture for the HUD and the
 * renderer; `buildRaidGame` makes the `GameOptions` of a raid; the data is `RAID_DEFS`; `abandonRaid` ends a raid on
 * purpose. The types are in `./types` (the contract) and `./def` (the authored data).
 */
export * from './types';
export type {
  BonusKind,
  ConveyorDef,
  DoorCondition,
  DoorDef,
  EnemyPlacement,
  RaidDef,
  RaidLegend,
  RoomDef,
  ShipmentSpec,
  WaveDef,
  WaveTrigger,
} from './def';
export { RAID_MAX_HEIGHT, RAID_MAX_WIDTH } from './def';
export { RAID_DEFS, RAID_IDS } from './defs';
export { buildRaidGame, raidArenaId } from './build';
export { raidView } from './view';
export { abandonRaid } from './runtime';
export { enemySeats, parseRaidLayout, raidProblems } from './layout';
export type { ParsedRaid, SeatPlan } from './layout';
export { RAID_TUNING } from './tuning';
export { raidDirectiveFor } from './directives';
