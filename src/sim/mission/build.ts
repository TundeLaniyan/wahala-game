/**
 * Builds a mission match: the arena, the seats (0 = the human, 1 = the boss, 2... = the protection crew) and the
 * config layer a mission adds. `createGame` calls `missionConfigLayer` while it builds the state and
 * `createMissionState` (state.ts) once the board exists; the campaign calls `buildMissionGame`.
 */
import { ticks } from '../config';
import type { DeepPartial, GameConfig } from '../config';
import { DIFFICULTIES } from '../types';
import type { CharacterId, Difficulty, GameOptions, PlayerSetup } from '../types';
import type { EnemyKind } from '../campaign/types';
import { CAMPAIGN_CONFIG } from '../config';
import { MISSION_DEFS, MISSION_SOFT_DENSITY } from './defs';
import { getFieldMission } from './fieldDefs';
import type { CrewDef, MissionDef } from './defs';
import { activeModifiers, resolveTuning } from './tuning';
import type { MissionSpec, NpcRole } from './types';

/** The crew of a mission in seat order (seat 2 first), including what the replay modifiers add. */
export function crewOf(def: MissionDef, spec: MissionSpec): CrewDef[] {
  const extra = activeModifiers(spec).includes('marketDay') && def.modifierCrew ? [def.modifierCrew] : [];
  return [...def.crew, ...extra];
}

/** The boss is never easier than Standard (decision MS4). */
export function bossDifficulty(spec: MissionSpec): Difficulty {
  const level = DIFFICULTIES.indexOf(spec.difficulty ?? 'rookie');
  return DIFFICULTIES[Math.max(level, DIFFICULTIES.indexOf('standard'))]!;
}

/** The config a mission layers over the arena and the ruleset: the clock and a lighter crate field. */
export function missionConfigLayer(spec: MissionSpec): DeepPartial<GameConfig> {
  if (spec.fieldId) {
    const field = getFieldMission(spec.fieldId);
    return {
      match: { durationTicks: ticks(spec.timeLimitSec ?? field.timeLimitSec) },
      arena: { softDensity: MISSION_SOFT_DENSITY },
    };
  }
  const def = MISSION_DEFS[spec.id];
  return {
    match: { durationTicks: resolveTuning(def, spec).timeLimitTicks },
    arena: { softDensity: MISSION_SOFT_DENSITY },
  };
}

/**
 * Campaign enemy durability by NPC role (docs/CAMPAIGN_COMBAT.md): field-section enemies are punch / throw enemies with
 * hit points, not generator bots. The six boss missions keep their crews as they are for now (docs/CAMPAIGN_EXPANSION_STATUS.md).
 */
export const ENEMY_KIND_FOR_ROLE: Readonly<Record<NpcRole, EnemyKind>> = {
  meleeGuard: 'guard',
  rangedAttacker: 'thrower',
  blocker: 'heavy',
  runner: 'agbero',
  escort: 'guard',
  objectiveDefender: 'guard',
  supportUnit: 'thrower',
  bossAssistant: 'heavy',
};

/**
 * The `GameOptions` of a mission: 6 to 9 competitors on the district's City Rumble arena. Seat 0 is the human
 * (team 0), every other seat is a bot of team 1 (the boss and its crew never hurt each other).
 */
export function buildMissionGame(o: {
  spec: MissionSpec;
  humanCharacter: CharacterId;
  seed: number;
}): GameOptions {
  const { spec } = o;
  const crewLevel = spec.difficulty ?? 'rookie';
  if (spec.fieldId) {
    const field = getFieldMission(spec.fieldId);
    const players: PlayerSetup[] = [
      // campaign health: the human has segments (visible meter), field enemies have hit points by role
      {
        name: 'You',
        characterId: o.humanCharacter,
        isBot: false,
        team: 0,
        maxHp: CAMPAIGN_CONFIG.playerMaxHp,
      },
      ...field.enemies.map((e, i): PlayerSetup => ({
        enemyKind: ENEMY_KIND_FOR_ROLE[e.role],
        name: e.name,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[(i + 1) % 3]!,
        isBot: true,
        difficulty: crewLevel,
        team: 1,
      })),
    ];
    return {
      seed: o.seed,
      arenaId: MISSION_DEFS[field.districtId].arenaId,
      players,
      settings: { game: 'mission' },
      mission: spec,
    };
  }
  const def = MISSION_DEFS[spec.id];
  const players: PlayerSetup[] = [
    // campaign health for the human (the boss and crew keep the one-hit generator fight)
    { name: 'You', characterId: o.humanCharacter, isBot: false, team: 0, maxHp: CAMPAIGN_CONFIG.playerMaxHp },
    {
      name: def.boss.name,
      characterId: def.boss.characterId,
      isBot: true,
      difficulty: bossDifficulty(spec),
      team: 1,
    },
    ...crewOf(def, spec).map((c, i): PlayerSetup => ({
      name: c.name,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[(i + 1) % 3]!,
      isBot: true,
      difficulty: crewLevel,
      team: 1,
    })),
  ];
  return { seed: o.seed, arenaId: def.arenaId, players, settings: { game: 'mission' }, mission: spec };
}
