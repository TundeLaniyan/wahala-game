/**
 * The one place the raid code reads enemy durability from (`src/sim/data/enemies.ts`, owned by combat-core).
 */
import type { EnemyKind } from '../campaign/types';
import { enemyDef } from '../data/enemies';

/** Health segments of an enemy kind. */
export function enemyMaxHp(kind: EnemyKind): number {
  return enemyDef(kind).hp;
}
