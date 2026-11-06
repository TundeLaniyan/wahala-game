/**
 * Campaign difficulty levels (Easy / Normal / Hard; decisions CL1-CL7, docs/CAMPAIGN_DIFFICULTY.md). A level is only a
 * small override of the EXISTING campaign tuning (`CampaignConfig`): the human's health segments, the recovery frames,
 * what a lethal event takes and (in raids) what a heal room gives. Content, rules, lives, respawn and retry are the
 * same on every level (the one-player death / respawn rules never differ), and the multiplayer and Rumble rulesets
 * never read any of it. Normal returns NO override, so a Normal match is byte-for-byte the campaign balance of before.
 *
 * Not to be confused with the crew level (`Difficulty`, the seven bot levels), which stays a separate loadout choice.
 */
import { CAMPAIGN_CONFIG, ticks } from '../config';
import type { CampaignConfig, DeepPartial, GameConfig } from '../config';
import type { Difficulty } from '../types';

export const CAMPAIGN_LEVELS = ['easy', 'normal', 'hard'] as const;
export type CampaignLevel = (typeof CAMPAIGN_LEVELS)[number];
export const DEFAULT_CAMPAIGN_LEVEL: CampaignLevel = 'normal';

export interface CampaignLevelDef {
  id: CampaignLevel;
  label: string;
  /** One line for the selector. */
  summary: string;
  /** Added to the base health segments (field and boss missions: 4; a raid brings its own). */
  maxHpDelta: number;
  /** The campaign tuning this level changes (absent for Normal). */
  config: DeepPartial<CampaignConfig> | null;
  /**
   * The bot level of the campaign's active enemies (field-mission and raid seats with an `enemyKind`; decision CI1).
   * Normal is Casual, the level the enemy combat fairness work measured as the baseline (EF8); Easy and Hard are one
   * bot level either side of it. Boss missions keep the crew level and the Standard boss floor (MS4).
   */
  enemyLevel: Difficulty;
}

export const CAMPAIGN_LEVEL_DEFS: Readonly<Record<CampaignLevel, CampaignLevelDef>> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    summary:
      'One extra health segment, longer recovery after a hit, blasts and vehicles hurt less, heal rooms give more, street and raid enemies are slower.',
    maxHpDelta: 1,
    config: {
      invulnTicks: ticks(1.5),
      damage: { blast: 1, vehicle: 1, hazard: 1, trap: 1 },
      playerDamage: { bottle: 1 },
      healBonus: 2,
    },
    enemyLevel: 'beginner',
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    summary: 'The intended campaign: four health segments, one second of recovery after a hit.',
    maxHpDelta: 0,
    config: null,
    enemyLevel: 'casual',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    summary:
      'One health segment fewer, a shorter recovery after a hit, street hazards hit harder and street and raid enemies are sharper.',
    maxHpDelta: -1,
    config: {
      invulnTicks: ticks(0.75),
      damage: { blast: 2, vehicle: 2, hazard: 2, trap: 1 },
    },
    enemyLevel: 'standard',
  },
};

export const isCampaignLevel = (v: unknown): v is CampaignLevel =>
  typeof v === 'string' && (CAMPAIGN_LEVELS as readonly string[]).includes(v);

/** The health segments the human starts with at this level, from the mission's own base (never below 2). */
export function levelMaxHp(base: number, level: CampaignLevel | undefined): number {
  return Math.max(2, base + CAMPAIGN_LEVEL_DEFS[level ?? DEFAULT_CAMPAIGN_LEVEL].maxHpDelta);
}

/** The bot level of the campaign's active enemies (field missions and raids) at this campaign level (decision CI1). */
export function campaignEnemyLevel(level: CampaignLevel | undefined): Difficulty {
  return CAMPAIGN_LEVEL_DEFS[level ?? DEFAULT_CAMPAIGN_LEVEL].enemyLevel;
}

/**
 * The `GameOptions.config` layer for a level (merged over the campaign tuning by `createGame`), or `undefined` for
 * Normal so the options, and therefore the state, are exactly those of an ordinary campaign match.
 */
export function levelConfigLayer(level: CampaignLevel | undefined): DeepPartial<GameConfig> | undefined {
  const config = CAMPAIGN_LEVEL_DEFS[level ?? DEFAULT_CAMPAIGN_LEVEL].config;
  if (!config) return undefined;
  // the whole campaign tuning (base + this level's changes), so the layer is a complete `CampaignConfig`
  const campaign: CampaignConfig = {
    ...CAMPAIGN_CONFIG,
    ...config,
    damage: { ...CAMPAIGN_CONFIG.damage, ...config.damage },
    playerDamage: { ...CAMPAIGN_CONFIG.playerDamage, ...config.playerDamage },
    bar: { ...CAMPAIGN_CONFIG.bar, ...config.bar },
    vsEnemy: { ...CAMPAIGN_CONFIG.vsEnemy, ...config.vsEnemy },
  };
  return { campaign };
}
