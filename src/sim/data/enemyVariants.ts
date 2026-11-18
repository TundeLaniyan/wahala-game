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

export interface EnemyVariantDef {
  id: EnemyVariantId;
  /** The simulation family whose health, attacks and tables apply (unless overridden below). */
  base: EnemyKind;
  /** Player-facing name (fictional street roles). */
  name: string;
  /** One line for the briefing / codex: how it fights and how a generator beats it. */
  summary: string;
}

export const ENEMY_VARIANTS: Readonly<Record<EnemyVariantId, EnemyVariantDef>> = {
  agbero: {
    id: 'agbero',
    base: 'agbero',
    name: 'Agbero',
    summary: 'Park enforcer: guards one loading lane, rushes in and swings. Lay a generator on his lane.',
  },
  areaBoy: {
    id: 'areaBoy',
    base: 'agbero',
    name: 'Area Boy',
    summary: 'Fast and reckless: chases far and overcommits. Bait him through a corner onto a generator.',
  },
  bottleThrower: {
    id: 'bottleThrower',
    base: 'thrower',
    name: 'Bottle Thrower',
    summary: 'Keeps his distance and winds up before each throw. Break his line of sight, corner him.',
  },
  marketEnforcer: {
    id: 'marketEnforcer',
    base: 'guard',
    name: 'Market Enforcer',
    summary: 'Works the aisles between stalls: shoves and throws. Chain a blast down his aisle.',
  },
  heavyEnforcer: {
    id: 'heavyEnforcer',
    base: 'heavy',
    name: 'Heavy',
    summary: 'Big, slow, shrugs off punches. Only a blast puts him down: lure him into a lane.',
  },
  routeMarshal: {
    id: 'routeMarshal',
    base: 'guard',
    name: 'Ring Route Marshal',
    summary: 'A Ring checkpoint crew (fictional uniform): holds junctions and calls his crew in.',
  },
  ringSecurity: {
    id: 'ringSecurity',
    base: 'guard',
    name: 'Ring Security',
    summary: 'Private Ring guard (fictional): defends in pairs and watches for traps.',
  },
  lieutenant: {
    id: 'lieutenant',
    base: 'lieutenant',
    name: 'Lieutenant',
    summary: 'Runs a squad and reads traps well. A long fight: generators finish it.',
  },
  boss: {
    id: 'boss',
    base: 'boss',
    name: 'Boss',
    summary: 'The district keeper. Generator objectives open the fight; blasts finish it.',
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
