/**
 * The campaign tactics layer's telegraph event (`enemyCue`; docs/CAMPAIGN_SECTOR_AI.md, "Telegraph contract"). Emitted
 * only when the match carries `config.campaignTactics`, so every other match's event stream is unchanged.
 */
import type { Dir, EnemyCueKind, GameState, Player, SimEvent } from '../types';
import { variantOf } from '../data/enemyVariants';

export function pushEnemyCue(
  state: Pick<GameState, 'config' | 'tick'>,
  events: SimEvent[],
  cue: {
    playerId: number;
    cue: EnemyCueKind;
    untilTick: number;
    x: number;
    y: number;
    fromTick?: number;
    dir?: Dir | null;
    byId?: number | null;
  },
): void {
  if (!state.config.campaignTactics) return;
  events.push({
    type: 'enemyCue',
    playerId: cue.playerId,
    cue: cue.cue,
    fromTick: cue.fromTick ?? state.tick,
    untilTick: cue.untilTick,
    dir: cue.dir ?? null,
    x: cue.x,
    y: cue.y,
    byId: cue.byId ?? null,
  });
}

/** Campaign tactics: an overcommitting variant stays planted longer after its own attack (decision SA10); 0 elsewhere. */
export function recoveryBonus(state: Pick<GameState, 'config'>, p: Readonly<Player>): number {
  if (!state.config.campaignTactics || p.enemyKind === undefined) return 0;
  return variantOf(p)?.personality.recoveryBonusTicks ?? 0;
}
