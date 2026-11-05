/**
 * Mission runtime public API (docs/MISSION_SIM.md). `missionView` is the read-only picture for the HUD and the app;
 * `buildMissionGame` makes the `GameOptions` of a mission; the data is `MISSION_DEFS`.
 */
export * from './types';
export { MISSION_DEFS, FACTION_IDS, getMissionArenaId } from './defs';
export type { CrewDef, MissionDef, NodeDef, PhaseDef } from './defs';
export { buildMissionGame, crewOf } from './build';
export { missionView } from './view';
export { resolveRaid } from './field';
export {
  CATCH_TICKS,
  DOOR_HOLD_TICKS,
  FIELD_MISSION_DEFS,
  FIELD_MISSION_IDS,
  fieldLegCount,
  getFieldMission,
} from './fieldDefs';
export type { FieldDoorDef, FieldEnemyDef, FieldLegDef, FieldMarkerDef, FieldMissionDef } from './fieldDefs';
export { directiveFor } from './directives';
export { MODIFIER_NUMBERS, resolveTuning, tuningFor } from './tuning';
