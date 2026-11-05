/**
 * Campaign enemy attack sets (decisions EA1-EA5, docs/CAMPAIGN_ATTACKS.md). Pure data, no rules: which enemy kind
 * punches, which objects it throws (in a FIXED rotation: nothing here uses the RNG) and whether it can call for help.
 * Every number (cue time, speed, damage, daze, knockback, cooldown, caps) is in `config.enemyAttacks`.
 *
 * Enemies never use the generator economy: `Intent.place` is ignored for an enemy seat (generators.ts) and the enemy
 * bot (ai/enemyBot.ts) never sends it. They act only through the one B press (`actions.ts`): an adjacent rival is
 * punched, else a thrower with a rival in a clear cardinal line throws.
 */
import type { EnemyKind, ThrownKind } from '../campaign/types';

export const THROWN_KINDS: readonly ThrownKind[] = ['bottle', 'stone', 'brick', 'tool'];

export interface EnemyAttackSet {
  kind: EnemyKind;
  /** What the HUD / docs call the attack style. */
  style: string;
  /** Thrown objects in rotation (empty = this kind never throws). */
  thrown: readonly ThrownKind[];
  /** Whether this kind announces a reinforcement call (`reinforcementCalled`); the runtime answers it. */
  calls: boolean;
  /** Keeps its distance and lines up for a throw (the `standoff` tactic) instead of closing in. */
  keepsDistance: boolean;
}

export const ENEMY_ATTACK_SETS: Readonly<Record<EnemyKind, EnemyAttackSet>> = {
  agbero: { kind: 'agbero', style: 'slow punch', thrown: [], calls: false, keepsDistance: false },
  guard: { kind: 'guard', style: 'punch', thrown: [], calls: false, keepsDistance: false },
  thrower: {
    kind: 'thrower',
    style: 'bottles and stones from a distance, a shove when cornered',
    thrown: ['bottle', 'stone', 'bottle', 'stone'],
    calls: false,
    keepsDistance: true,
  },
  heavy: {
    kind: 'heavy',
    style: 'punch with knockback and a slow thrown tool',
    thrown: ['tool'],
    calls: false,
    keepsDistance: false,
  },
  lieutenant: {
    kind: 'lieutenant',
    style: 'punch, bricks and bottles, calls reinforcements',
    thrown: ['brick', 'bottle'],
    calls: true,
    keepsDistance: true,
  },
  boss: {
    kind: 'boss',
    style: 'heavy punch, bricks and tools, calls reinforcements',
    thrown: ['brick', 'tool'],
    calls: true,
    keepsDistance: false,
  },
};

/** The object an enemy throws on its `count`-th throw (0-based): a fixed rotation, deterministic. */
export function thrownKindFor(kind: EnemyKind, count: number): ThrownKind | null {
  const set = ENEMY_ATTACK_SETS[kind].thrown;
  return set.length === 0 ? null : set[count % set.length]!;
}
