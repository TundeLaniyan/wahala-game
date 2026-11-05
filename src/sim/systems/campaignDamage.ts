/**
 * STUB (combat-attacks worker): the minimal `applyCampaignHit` so projectiles and enemy punches compile and can be
 * tested on their own. The `combat-core` worker owns the real file with the same name and signature; the integrator
 * keeps ITS version on merge. Semantics (docs/CAMPAIGN_EXPANSION_PLAN.md section 2): invulnerability frames, then
 * Okada, then Armour, then health; damage 0 = daze / knockback only. Every outcome emits `campaignHit`.
 */
import type { CampaignHit, CampaignHitResult } from '../campaign/types';
import type { GameState, SimEvent } from '../types';

export function applyCampaignHit(state: GameState, hit: CampaignHit, events: SimEvent[]): CampaignHitResult {
  const v = state.players[hit.victimId];
  if (!v || !v.alive) return 'invulnerable';
  const emit = (result: CampaignHitResult, damage: number): CampaignHitResult => {
    events.push({
      type: 'campaignHit',
      victimId: v.id,
      byId: hit.byId,
      source: hit.source,
      result,
      damage,
      hpAfter: v.vitals?.hp ?? 0,
      maxHp: v.vitals?.maxHp ?? 0,
      dazeTicks: hit.dazeTicks,
      x: v.x,
      y: v.y,
    });
    return result;
  };
  if (v.vitals && state.tick < v.vitals.invulnUntil && !hit.strong) return emit('invulnerable', 0);
  if (hit.damage > 0) {
    if (v.mounted) {
      v.mounted = false;
      return emit('blockedOkada', 0);
    }
    if (v.armour > 0) {
      v.armour--;
      return emit('blockedArmour', 0);
    }
  }
  if (hit.dazeTicks > 0) {
    v.dazedUntil = Math.max(v.dazedUntil, state.tick + hit.dazeTicks);
    v.entryUntil = null;
  }
  if (hit.damage > 0 && v.vitals) {
    v.vitals.hp = Math.max(0, v.vitals.hp - hit.damage);
    v.vitals.lastHitTick = state.tick;
    v.vitals.lastHitBy = hit.byId;
    v.vitals.lastHitSource = hit.source;
    v.vitals.invulnUntil = state.tick + 30;
    if (v.vitals.hp === 0) {
      v.alive = false;
      return emit('defeated', hit.damage);
    }
    return emit('damaged', hit.damage);
  }
  return emit('dazed', 0);
}
