/**
 * Which board a mission is played on (decision WX1): the one place that answers it, for `createGame`, `buildMissionGame`,
 * the scripted tools and the tests. A field mission with a campaign area plays on the area's campaign-only arena; every
 * other mission on its district's City Rumble arena (`MISSION_DEFS[...].arenaId`), exactly as before.
 */
import { MISSION_DEFS } from './defs';
import { fieldMissionOf } from './fieldDefs';
import type { FieldMissionDef } from './fieldDefs';
import type { MissionSpec } from './types';

/** The arena of a field mission: its campaign area's board, else its district's City Rumble arena. */
export function fieldArenaId(def: Pick<FieldMissionDef, 'arenaId' | 'districtId'>): string {
  return def.arenaId ?? MISSION_DEFS[def.districtId].arenaId;
}

/** The arena of a mission spec (a field mission, the archived pilot's replay, or a boss mission). */
export function missionArenaId(spec: Pick<MissionSpec, 'id' | 'fieldId' | 'archivedPilot'>): string {
  return spec.fieldId ? fieldArenaId(fieldMissionOf(spec)) : MISSION_DEFS[spec.id].arenaId;
}
