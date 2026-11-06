/**
 * Campaign enemy kinds (decision CC3, docs/CAMPAIGN_COMBAT.md): durability and the attack set by role. Pure data, no
 * rules: `createPlayer` reads `hp`, `playerStepTicks` reads `stepPenaltyTicks`, `enemyHealthView` reads `bossBar`, the
 * combat-attacks worker (`src/sim/systems/projectiles.ts`, `src/ai/enemy*.ts`) reads `attacks` and `difficulty`.
 *
 * Health is in segments (one `applyCampaignHit` point each): a player punch takes 1, a bottle 2, a blast 2
 * (`config.campaign.playerDamage` / `.damage`). Enemies do not use the generator economy.
 *
 * | kind       | hp | step penalty | attacks                      | bar                | steadfast (EF4) |
 * | ---------- | -- | ------------ | ---------------------------- | ------------------ | --------------- |
 * | agbero     | 1  | 0            | punch                        | when targeted ...  | no              |
 * | guard      | 2  | 0            | punch, bottle                | when targeted ...  | no              |
 * | thrower    | 2  | 3 (slower)   | bottle, brick, stone, tool   | when targeted ...  | no              |
 * | heavy      | 3  | 2 (slower)   | punch, brick                 | when targeted ...  | yes             |
 * | lieutenant | 8  | 1            | punch, bottle, tool          | always (boss bar)  | no              |
 * | boss       | 14 | 0            | punch, bottle, brick, tool   | always (boss bar)  | yes             |
 *
 * What it takes to drop each kind at the Normal baseline (decision EF3; a blast takes 2, a Punch 1): an agbero one
 * blast or one punch, a guard one blast or two punches, a thrower one blast, a heavy two blasts or a trap, a
 * lieutenant and a boss the whole fight.
 */
import type { EnemyAttackKind, EnemyKind } from '../campaign/types';
import type { Difficulty } from '../types';

export interface EnemyKindDef {
  kind: EnemyKind;
  /** Player-facing name (fictional street roles, no real person or brand). */
  name: string;
  /** Health segments. */
  hp: number;
  /** Extra ticks per tile (playerStepTicks): a slow thrower and a heavy are easier to outrun. */
  stepPenaltyTicks: number;
  /** The attacks this kind may use; `combat-attacks` implements them (rate limits are theirs). */
  attacks: readonly EnemyAttackKind[];
  /** The bot level that drives its movement and decisions. */
  difficulty: Difficulty;
  /** A visible boss bar for the whole fight (lieutenants and bosses); regular enemies show a bar only when targeted, hurt or near. */
  bossBar: boolean;
  /**
   * Decision EF4: the player's punches still take this kind's segments but neither daze it nor cut its wind-up short
   * (a heavy, the boss): trading blows up close costs the player; step out of the swing and punish the recovery, or
   * use a generator.
   */
  steadfast: boolean;
  /** One line for the briefing / codex. */
  summary: string;
}

export const ENEMY_KIND_IDS: readonly EnemyKind[] = [
  'agbero',
  'guard',
  'thrower',
  'heavy',
  'lieutenant',
  'boss',
];

export const ENEMY_KINDS: Readonly<Record<EnemyKind, EnemyKindDef>> = {
  agbero: {
    kind: 'agbero',
    name: 'Agbero',
    hp: 1,
    stepPenaltyTicks: 0,
    attacks: ['punch'],
    difficulty: 'rookie',
    bossBar: false,
    steadfast: false,
    summary: 'A street tout: one punch drops him.',
  },
  guard: {
    kind: 'guard',
    name: 'Guard',
    hp: 2,
    stepPenaltyTicks: 0,
    attacks: ['punch', 'bottle'],
    difficulty: 'casual',
    bossBar: false,
    steadfast: false,
    summary: 'Takes two hits; swings a bottle at close range.',
  },
  thrower: {
    kind: 'thrower',
    name: 'Thrower',
    hp: 2,
    stepPenaltyTicks: 3,
    attacks: ['bottle', 'brick', 'stone', 'tool'],
    difficulty: 'standard',
    bossBar: false,
    steadfast: false,
    summary: 'Slow on his feet, dangerous from range: watch the warning on the ground.',
  },
  heavy: {
    kind: 'heavy',
    name: 'Heavy',
    hp: 3,
    stepPenaltyTicks: 2,
    attacks: ['punch', 'brick'],
    difficulty: 'standard',
    bossBar: false,
    steadfast: true,
    summary: 'Big and slow: three hits, and he blocks narrow streets.',
  },
  lieutenant: {
    kind: 'lieutenant',
    name: 'Lieutenant',
    hp: 8,
    stepPenaltyTicks: 1,
    attacks: ['punch', 'bottle', 'tool'],
    difficulty: 'skilled',
    bossBar: true,
    steadfast: false,
    summary: 'Runs a crew: a long fight with a health bar.',
  },
  boss: {
    kind: 'boss',
    name: 'Boss',
    hp: 14,
    stepPenaltyTicks: 0,
    attacks: ['punch', 'bottle', 'brick', 'tool'],
    difficulty: 'expert',
    bossBar: true,
    steadfast: true,
    summary: 'The head of the operation: a long fight with a health bar.',
  },
};

export const enemyDef = (kind: EnemyKind): EnemyKindDef => ENEMY_KINDS[kind];
