/**
 * The ARCHIVED Oshodi combat pilot (docs/OSHODI_COMBAT_PILOT.md, decisions CP1-CP12), SUPERSEDED by the campaign tactics
 * layer (decision SA3): no campaign mission runs it any more. A field mission listed here gets `config.combatPilot` (the
 * pilot rules), the pilot's enemy-attack tuning, its level adjustments and its extra enemies ONLY when its spec asks
 * for the archived replay (`MissionSpec.archivedPilot`: the pilot's reference tests and `npm run combat-pilot`; the
 * campaign never sets it). Every other match never sees any of it (the rules code is inert without `config.combatPilot`).
 */
import { OSHODI_COMBAT_PILOT, OSHODI_PILOT_ENEMY_ATTACKS, OSHODI_PILOT_LEVELS, mergeLayers } from '../config';
import type { CombatPilotConfig, DeepPartial, GameConfig, PilotEnemyAttacks, PilotLayer } from '../config';
import type { FieldEnemyDef, FieldMissionDef } from './fieldDefs';
import type { MissionSpec } from './types';

export interface FieldCombatPilot {
  config: CombatPilotConfig;
  enemyAttacks: PilotEnemyAttacks;
  levels: Readonly<Partial<Record<string, PilotLayer>>>;
  /**
   * Enemies the pilot adds to the mission's own roster (seated after them, so every original seat keeps its id): a
   * second warden by the first (two ordinary enemies at once) and a thrower at the yard gate (a mixed group).
   */
  extraEnemies: readonly FieldEnemyDef[];
}

export const FIELD_COMBAT_PILOTS: Readonly<Record<string, FieldCombatPilot>> = {
  'oshodi.approach': {
    config: OSHODI_COMBAT_PILOT,
    enemyAttacks: OSHODI_PILOT_ENEMY_ATTACKS,
    levels: OSHODI_PILOT_LEVELS,
    extraEnemies: [
      { role: 'meleeGuard', name: 'Park Warden', post: [14, 42], group: 'wardens', radius: 3 },
      { role: 'rangedAttacker', name: 'Bottle Boy', post: [31, 41], group: 'yard', radius: 3 },
    ],
  },
};

/** The archived pilot a mission spec asks for (null unless `archivedPilot` is set on a field mission listed above). */
export const fieldCombatPilot = (
  spec: Pick<MissionSpec, 'fieldId' | 'archivedPilot'>,
): FieldCombatPilot | null =>
  (spec.archivedPilot === true && spec.fieldId !== undefined && FIELD_COMBAT_PILOTS[spec.fieldId]) || null;

/** The config layer of the pilot for this field mission (a fresh copy every call: never a shared constant). */
export function pilotConfigLayer(
  spec: Pick<MissionSpec, 'fieldId' | 'archivedPilot'>,
): DeepPartial<GameConfig> {
  const pilot = fieldCombatPilot(spec);
  if (!pilot) return {};
  return structuredClone({
    combatPilot: pilot.config,
    enemyAttacks: pilot.enemyAttacks,
  }) as DeepPartial<GameConfig>;
}

/** The pilot's adjustment for a campaign level (Easy / Hard), merged over the level's own layer; Normal adds nothing. */
export function pilotLevelLayer(
  spec: Pick<MissionSpec, 'fieldId' | 'archivedPilot'>,
  level: string | undefined,
  base: DeepPartial<GameConfig> | undefined,
): DeepPartial<GameConfig> | undefined {
  const extra = level ? fieldCombatPilot(spec)?.levels[level] : undefined;
  // (a pilot layer is a partial GameConfig; `DeepPartial` just cannot spell the nullable melee specs)
  return extra ? mergeLayers<GameConfig>(base, structuredClone(extra) as DeepPartial<GameConfig>) : base;
}

/** Every enemy a field mission seats: its own roster, then (archived pilot replay only) the pilot's additions. */
export function fieldEnemiesOf(
  def: FieldMissionDef,
  spec: Pick<MissionSpec, 'archivedPilot'> = {},
): readonly FieldEnemyDef[] {
  const pilot = fieldCombatPilot({ fieldId: def.id, archivedPilot: spec.archivedPilot });
  return pilot ? [...def.enemies, ...pilot.extraEnemies] : def.enemies;
}
