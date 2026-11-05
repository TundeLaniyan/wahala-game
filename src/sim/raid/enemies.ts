/**
 * The one place the raid code reads enemy durability from (`src/sim/data/enemies.ts`, owned by combat-core). Adapt
 * this file if the real table names its fields differently.
 */
import type { EnemyKind } from '../campaign/types';
import { ENEMY_DEFS } from '../data/enemies';

/** Health segments of an enemy kind. */
export function enemyMaxHp(kind: EnemyKind): number {
  return ENEMY_DEFS[kind].hp;
}
