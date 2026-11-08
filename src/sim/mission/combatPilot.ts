/**
 * Which field missions run the COMBAT PILOT (docs/OSHODI_COMBAT_PILOT.md, decisions CP1-CP12) and what it adds to
 * them. This map is the ONLY switch: a field mission listed here gets `config.combatPilot` (the pilot rules), the
 * pilot's enemy-attack tuning, its campaign-level adjustments and its extra enemies; every other match never sees any
 * of it. Removing the experiment = removing the entry (the rules code is inert without `config.combatPilot`).
 */
import { OSHODI_COMBAT_PILOT, OSHODI_PILOT_ENEMY_ATTACKS, OSHODI_PILOT_LEVELS, mergeLayers } from '../config';
import type { CombatPilotConfig, DeepPartial, GameConfig, PilotEnemyAttacks, PilotLayer } from '../config';
import type { FieldEnemyDef, FieldMissionDef } from './fieldDefs';

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

export const fieldCombatPilot = (fieldId: string | undefined): FieldCombatPilot | null =>
  (fieldId !== undefined && FIELD_COMBAT_PILOTS[fieldId]) || null;

/** The config layer of the pilot for this field mission (a fresh copy every call: never a shared constant). */
export function pilotConfigLayer(fieldId: string | undefined): DeepPartial<GameConfig> {
  const pilot = fieldCombatPilot(fieldId);
  if (!pilot) return {};
  return structuredClone({
    combatPilot: pilot.config,
    enemyAttacks: pilot.enemyAttacks,
  }) as DeepPartial<GameConfig>;
}

/** The pilot's adjustment for a campaign level (Easy / Hard), merged over the level's own layer; Normal adds nothing. */
export function pilotLevelLayer(
  fieldId: string | undefined,
  level: string | undefined,
  base: DeepPartial<GameConfig> | undefined,
): DeepPartial<GameConfig> | undefined {
  const extra = level ? fieldCombatPilot(fieldId)?.levels[level] : undefined;
  // (a pilot layer is a partial GameConfig; `DeepPartial` just cannot spell the nullable melee specs)
  return extra ? mergeLayers<GameConfig>(base, structuredClone(extra) as DeepPartial<GameConfig>) : base;
}

/** Every enemy a field mission seats: its own roster, then the pilot's additions. */
export function fieldEnemiesOf(def: FieldMissionDef): readonly FieldEnemyDef[] {
  const pilot = fieldCombatPilot(def.id);
  return pilot ? [...def.enemies, ...pilot.extraEnemies] : def.enemies;
}
