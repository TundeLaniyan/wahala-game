/**
 * Builds a mission match: the arena, the seats (0 = the human, 1 = the boss, 2... = the protection crew) and the
 * config layer a mission adds. `createGame` calls `missionConfigLayer` while it builds the state and
 * `createMissionState` (state.ts) once the board exists; the campaign calls `buildMissionGame`.
 */
import { ticks } from '../config';
import type { DeepPartial, GameConfig } from '../config';
import { DIFFICULTIES } from '../types';
import type { CharacterId, Difficulty, GameOptions, LoadoutBonus, PlayerSetup } from '../types';
import type { EnemyKind } from '../campaign/types';
import { CAMPAIGN_CONFIG } from '../config';
import { normaliseLoadoutBonus } from '../systems/loadout';
import { campaignTacticsLayer, levelConfigLayer, levelMaxHp } from '../campaign/levels';
import type { CampaignLevel } from '../campaign/levels';
import type { EnemyVariantId } from '../data/enemyVariants';
import { MISSION_DEFS, MISSION_SOFT_DENSITY } from './defs';
import { fieldMissionOf } from './fieldDefs';
import { fieldArenaId } from './arena';
import { fieldEnemiesOf, pilotConfigLayer, pilotLevelLayer } from './combatPilot';
import { mergeLayers } from '../config';
import { ENEMY_VARIANTS } from '../data/enemyVariants';
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

/**
 * The config a mission layers over the arena and the ruleset: the clock, a lighter crate field and the campaign tactics
 * layer at the Normal level (decision SA3; `buildMissionGame` adds the Easy / Hard layer over it). A boss mission's
 * layer also names the perception kind of each generator-bot seat (the boss and its crew have no `enemyKind`). The
 * archived combat pilot replay (`spec.archivedPilot`) carries the pilot instead, never both.
 */
export function missionConfigLayer(spec: MissionSpec): DeepPartial<GameConfig> {
  if (spec.fieldId) {
    const field = fieldMissionOf(spec);
    return {
      match: { durationTicks: ticks(spec.timeLimitSec ?? field.timeLimitSec) },
      arena: { softDensity: MISSION_SOFT_DENSITY },
      ...(spec.archivedPilot ? pilotConfigLayer(spec) : campaignTacticsLayer('normal')),
    };
  }
  const def = MISSION_DEFS[spec.id];
  const tactics = campaignTacticsLayer('normal');
  const seatPerception: Record<number, EnemyKind> = { 1: 'boss' };
  // the crew's variant personalities (decision BX8): perception row from the variant's base kind, trap sense from it
  const seatVariant: Record<number, EnemyVariantId> = { 1: 'boss' };
  crewOf(def, spec).forEach((c, i) => {
    seatPerception[2 + i] = c.variant ? ENEMY_VARIANTS[c.variant].base : ENEMY_KIND_FOR_ROLE[c.role];
    if (c.variant) seatVariant[2 + i] = c.variant;
  });
  return {
    match: { durationTicks: resolveTuning(def, spec).timeLimitTicks },
    arena: { softDensity: MISSION_SOFT_DENSITY },
    ...tactics,
    campaignTactics: { ...tactics.campaignTactics, seatPerception, seatVariant },
  };
}

/** The level's layers of a campaign mission: health / damage (`levelConfigLayer`) and the Easy / Hard tactics. */
function missionLevelLayer(level: CampaignLevel | undefined): DeepPartial<GameConfig> | undefined {
  const tactics = level && level !== 'normal' ? campaignTacticsLayer(level) : undefined;
  return mergeLayers<GameConfig>(levelConfigLayer(level), tactics);
}

/** The kind and variant of a field seat: the variant's base kind when it names one, else the role's kind. */
export function fieldSeatKind(e: { role: NpcRole; variant?: EnemyVariantId }): {
  enemyKind: EnemyKind;
  enemyVariant?: EnemyVariantId;
} {
  return e.variant
    ? { enemyKind: ENEMY_VARIANTS[e.variant].base, enemyVariant: e.variant }
    : { enemyKind: ENEMY_KIND_FOR_ROLE[e.role] };
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
 * The `GameOptions` of a mission: 6 to 9 competitors on the district's City Rumble arena (a field mission: on its campaign
 * area's own board when it has one, decision WX1). Seat 0 is the human
 * (team 0), every other seat is a bot of team 1 (the boss and its crew never hurt each other).
 */
export function buildMissionGame(o: {
  spec: MissionSpec;
  humanCharacter: CharacterId;
  seed: number;
  /** Campaign difficulty (Easy / Normal / Hard); absent = Normal, which adds nothing to the options. */
  level?: CampaignLevel;
  /** The human's permanent campaign upgrades (decisions PR1-PR8); absent or all zero = none, options unchanged. */
  loadoutBonus?: LoadoutBonus;
}): GameOptions {
  const bonus = normaliseLoadoutBonus(o.loadoutBonus);
  const human = bonus ? { loadoutBonus: bonus } : {};
  const { spec } = o;
  const humanHp = levelMaxHp(CAMPAIGN_CONFIG.playerMaxHp, o.level);
  const crewLevel = spec.difficulty ?? 'rookie';
  if (spec.fieldId) {
    const field = fieldMissionOf(spec);
    // the level's layers: health / damage and the Easy / Hard tactics (the archived pilot replay: its own adjustment)
    const levelConfig = spec.archivedPilot
      ? pilotLevelLayer(spec, o.level, levelConfigLayer(o.level))
      : missionLevelLayer(o.level);
    const players: PlayerSetup[] = [
      // campaign health: the human has segments (visible meter), field enemies have hit points by role
      {
        name: 'You',
        characterId: o.humanCharacter,
        isBot: false,
        team: 0,
        maxHp: humanHp,
        ...human,
      },
      ...fieldEnemiesOf(field, spec).map((e, i): PlayerSetup => ({
        ...(spec.archivedPilot ? { enemyKind: ENEMY_KIND_FOR_ROLE[e.role] } : fieldSeatKind(e)),
        name: e.name,
        characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[(i + 1) % 3]!,
        isBot: true,
        difficulty: crewLevel,
        team: 1,
      })),
    ];
    return {
      seed: o.seed,
      arenaId: fieldArenaId(field),
      players,
      settings: { game: 'mission' },
      mission: spec,
      ...(levelConfig ? { config: levelConfig } : {}),
    };
  }
  const def = MISSION_DEFS[spec.id];
  const levelConfig = missionLevelLayer(o.level);
  const players: PlayerSetup[] = [
    // campaign health for the human (the boss and crew keep the one-hit generator fight)
    { name: 'You', characterId: o.humanCharacter, isBot: false, team: 0, maxHp: humanHp, ...human },
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
  return {
    seed: o.seed,
    arenaId: def.arenaId,
    players,
    settings: { game: 'mission' },
    mission: spec,
    ...(levelConfig ? { config: levelConfig } : {}),
  };
}
