/**
 * Campaign enemy VARIANTS (docs/CAMPAIGN_SECTOR_AI.md, decision SA2): the recognisable roster of the single-player
 * campaign, built on the six existing simulation families (`EnemyKind`, src/sim/data/enemies.ts). A variant names a
 * look and a behaviour personality; every rule still reads its BASE kind unless a field below says otherwise, so a seat
 * without a variant behaves exactly as before.
 *
 * Every organisation here is fictional (docs/STORY_BIBLE.md section 1): the "Ring" route marshals and security crews
 * wear invented uniforms, never a real agency's colours, insignia or name; ordinary workers are never the enemy.
 */
import type { EnemyKind } from '../campaign/types';
import type { TrapSenseTier } from '../config';

export const ENEMY_VARIANT_IDS = [
  'agbero',
  'areaBoy',
  'bottleThrower',
  'marketEnforcer',
  'heavyEnforcer',
  'routeMarshal',
  'ringSecurity',
  'lieutenant',
  'boss',
] as const;
export type EnemyVariantId = (typeof ENEMY_VARIANT_IDS)[number];

/**
 * A variant's behaviour personality (decisions SA5-SA6, docs/CAMPAIGN_SECTOR_AI.md). Read only in matches that carry the
 * campaign tactics layer (`config.campaignTactics`): the territorial state machine (systems/territory.ts), the enemy
 * bot's perception and trap sense (ai/enemyBot.ts, ai/trapSight.ts) and the enemy's recovery (enemyActions.ts). Every
 * value is a small change against the level's defaults, never a separate behaviour tree: one state machine for all.
 */
export interface EnemyPersonality {
  /** How well it reasons about the generators it knows (`CampaignTacticsConfig.trapSense`). */
  trapSense: TrapSenseTier;
  /** Tiles added to (or taken from) the level's pursuit range around its territory. */
  pursuitBonus: number;
  /** Scales the level's notice time of the human (0.5 = spots you twice as fast). */
  noticeScale: number;
  /** Tiles added to its generator vision radius (negative: a narrower field of attention). */
  visionDelta: number;
  /** Alerts allies within this many tiles when it spots the human (scaled by the level; 0 = never). */
  alertAllies: number;
  /** After its attack it repositions to a tile out of the human's sight (aisles, stalls, cover). */
  usesCover: boolean;
  /** Ranged: the distance (tiles) it keeps when it lines up a throw (0 = closes in like a brawler). */
  preferredRange: number;
  /** Ticks added to its recovery after its own punch or throw (an overcommitting brawler). */
  recoveryBonusTicks: number;
}

export interface EnemyVariantDef {
  id: EnemyVariantId;
  /** The simulation family whose health, attacks and tables apply (unless overridden below). */
  base: EnemyKind;
  /** Player-facing name (fictional street roles). */
  name: string;
  /** One line for the briefing / codex: how it fights and how a generator beats it. */
  summary: string;
  /** Behaviour personality under the campaign tactics layer. */
  personality: EnemyPersonality;
}

const plain: EnemyPersonality = {
  trapSense: 'basic',
  pursuitBonus: 0,
  noticeScale: 1,
  visionDelta: 0,
  alertAllies: 0,
  usesCover: false,
  preferredRange: 0,
  recoveryBonusTicks: 0,
};

export const ENEMY_VARIANTS: Readonly<Record<EnemyVariantId, EnemyVariantDef>> = {
  agbero: {
    id: 'agbero',
    base: 'agbero',
    name: 'Agbero',
    summary: 'Park enforcer: guards one loading lane, rushes in and swings. Lay a generator on his lane.',
    personality: plain,
  },
  areaBoy: {
    id: 'areaBoy',
    base: 'agbero',
    name: 'Area Boy',
    summary: 'Fast and reckless: chases far and overcommits. Bait him through a corner onto a generator.',
    // fast pursuit, chases far, narrow attention, overcommits (a longer recovery after every swing)
    personality: {
      ...plain,
      trapSense: 'none',
      pursuitBonus: 4,
      noticeScale: 0.5,
      visionDelta: -1,
      recoveryBonusTicks: 12,
    },
  },
  bottleThrower: {
    id: 'bottleThrower',
    base: 'thrower',
    name: 'Bottle Thrower',
    summary: 'Keeps his distance and winds up before each throw. Break his line of sight, corner him.',
    personality: { ...plain, preferredRange: 4, recoveryBonusTicks: 6 },
  },
  marketEnforcer: {
    id: 'marketEnforcer',
    base: 'guard',
    name: 'Market Enforcer',
    summary: 'Works the aisles between stalls: shoves and throws. Chain a blast down his aisle.',
    personality: { ...plain, usesCover: true },
  },
  heavyEnforcer: {
    id: 'heavyEnforcer',
    base: 'heavy',
    name: 'Heavy',
    summary: 'Big, slow, shrugs off punches. Only a blast puts him down: lure him into a lane.',
    // slow and steadfast: a short chase, blast-only finish (the kind is armoured under the tactics layer)
    personality: { ...plain, pursuitBonus: -2 },
  },
  routeMarshal: {
    id: 'routeMarshal',
    base: 'guard',
    name: 'Ring Route Marshal',
    summary: 'A Ring checkpoint crew (fictional uniform): holds junctions and calls his crew in.',
    // holds its junction (a shorter chase) and calls the crew in
    personality: { ...plain, pursuitBonus: -1, alertAllies: 8 },
  },
  ringSecurity: {
    id: 'ringSecurity',
    base: 'guard',
    name: 'Ring Security',
    summary: 'Private Ring guard (fictional): defends in pairs and watches for traps.',
    // defends in pairs (calls its partner, a shorter chase) and reads traps well
    personality: { ...plain, trapSense: 'keen', pursuitBonus: -2, alertAllies: 5 },
  },
  lieutenant: {
    id: 'lieutenant',
    base: 'lieutenant',
    name: 'Lieutenant',
    summary: 'Runs a squad and reads traps well. A long fight: generators finish it.',
    personality: {
      ...plain,
      trapSense: 'expert',
      pursuitBonus: 2,
      noticeScale: 0.75,
      alertAllies: 10,
      preferredRange: 3,
    },
  },
  boss: {
    id: 'boss',
    base: 'boss',
    name: 'Boss',
    summary: 'The district keeper. Generator objectives open the fight; blasts finish it.',
    personality: { ...plain, trapSense: 'expert', pursuitBonus: 2, noticeScale: 0.75, alertAllies: 10 },
  },
};

export const isEnemyVariantId = (v: unknown): v is EnemyVariantId =>
  typeof v === 'string' && (ENEMY_VARIANT_IDS as readonly string[]).includes(v);

/** The default variant of a family (a seat that names only its kind). */
export const DEFAULT_VARIANT_OF_KIND: Readonly<Record<EnemyKind, EnemyVariantId>> = {
  agbero: 'agbero',
  guard: 'marketEnforcer',
  thrower: 'bottleThrower',
  heavy: 'heavyEnforcer',
  lieutenant: 'lieutenant',
  boss: 'boss',
};

/** The variant a seat plays (its own, else its kind's default). */
export const variantOf = (p: {
  enemyKind?: EnemyKind;
  enemyVariant?: EnemyVariantId;
}): EnemyVariantDef | null =>
  p.enemyVariant
    ? ENEMY_VARIANTS[p.enemyVariant]
    : p.enemyKind
      ? ENEMY_VARIANTS[DEFAULT_VARIANT_OF_KIND[p.enemyKind]]
      : null;
