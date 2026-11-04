/**
 * Mission runtime public API (docs/MISSION_SIM.md). `missionView` is the read-only picture for the HUD and the app;
 * `buildMissionGame` makes the `GameOptions` of a mission; the data is `MISSION_DEFS`.
 */
export * from './types';
export { MISSION_DEFS, FACTION_IDS, getMissionArenaId } from './defs';
export type { CrewDef, MissionDef, NodeDef, PhaseDef } from './defs';
export { buildMissionGame, crewOf } from './build';
export { missionView } from './view';
export { directiveFor } from './directives';
export { MODIFIER_NUMBERS, resolveTuning, tuningFor } from './tuning';
