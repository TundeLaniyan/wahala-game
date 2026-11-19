/**
 * How fast a campaign enemy walks (decisions RC1-RC2, docs/CAMPAIGN_COMBAT_RELIABILITY.md). Under the campaign tactics
 * layer an ordinary enemy never matches the human: its step time is `config.campaignTactics.enemyStepTicks[kind]` (less the
 * variant's `stepBonusTicks`, never below `enemyMinStepTicks`), and a CALM walk (patrolling its route, holding its post,
 * walking back to it) adds `territory.patrolStepExtraTicks` on top, so routes are readable and a patroller can be timed.
 * Chasing, alerted, investigating and dodging enemies run at the full pace. Pure; shared by the sim
 * (`queries.playerStepTicks`) and the bot planner (`ai/world.ts stepTicksOf`), so the planner plans the pace it walks.
 */
import type { EnemyKind, EnemyMind } from '../campaign/types';
import type { CampaignTacticsConfig } from '../config';
import { variantOf } from '../data/enemyVariants';
import type { EnemyVariantId } from '../data/enemyVariants';

/** Is this mind walking calmly (patrol, watch, or walking back after its watch ends) at `tick`? */
export function isCalmMind(m: Pick<EnemyMind, 'state' | 'watchUntil'>, tick: number): boolean {
  return m.state === 'patrol' || m.state === 'watch' || (m.state === 'return' && tick >= m.watchUntil);
}

/** The step time of an ordinary enemy under the layer, without the calm walk (the chase pace). */
export function tacticsEnemyStepTicks(
  t: Pick<CampaignTacticsConfig, 'enemyStepTicks' | 'enemyMinStepTicks'>,
  p: { enemyKind?: EnemyKind; enemyVariant?: EnemyVariantId },
): number {
  const kind = p.enemyKind;
  if (!kind) return 0;
  const bonus = variantOf(p)?.personality.stepBonusTicks ?? 0;
  const floor = kind === 'boss' ? 0 : t.enemyMinStepTicks;
  return Math.max(floor, t.enemyStepTicks[kind] - bonus);
}
