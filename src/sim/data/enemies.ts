/**
 * STUB (raid-sim worker): the enemy durability table. `combat-core` owns this file and its real version replaces
 * this one on merge; the raid code reads only `ENEMY_DEFS[kind].hp` (through `src/sim/raid/enemies.ts`, the one place
 * to adapt). Numbers follow docs/CAMPAIGN_EXPANSION_PLAN.md section 2: agbero 1; guard 2; thrower 2; heavy 3;
 * lieutenant 4 and boss 6 (both show a boss bar).
 */
import type { EnemyKind } from '../campaign/types';

export interface EnemyDef {
  /** Health segments. */
  hp: number;
}

export const ENEMY_DEFS: Readonly<Record<EnemyKind, EnemyDef>> = {
  agbero: { hp: 1 },
  guard: { hp: 2 },
  thrower: { hp: 2 },
  heavy: { hp: 3 },
  lieutenant: { hp: 4 },
  boss: { hp: 6 },
};
