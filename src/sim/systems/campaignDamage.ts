/**
 * STUB (raid-sim worker): the campaign damage entry point. `combat-core` owns this file and its real version replaces
 * this one on merge; the raid runtime only calls `applyCampaignHit(state, hit, events)` (conveyor shipments, source
 * 'hazard') and reads the `CampaignHitResult`. Semantics follow docs/CAMPAIGN_EXPANSION_PLAN.md section 2:
 * invulnerability frames, then Okada, then Armour, then health; zero health = defeated; every outcome is an event.
 */
import type { CampaignHit, CampaignHitResult } from '../campaign/types';
import type { GameState, SimEvent } from '../types';
import { eliminate } from './lethality';

/** Ticks of invulnerability after a damaging hit. */
const INVULN_TICKS = 45;

export function applyCampaignHit(state: GameState, hit: CampaignHit, events: SimEvent[]): CampaignHitResult {
  const victim = state.players[hit.victimId];
  if (!victim || !victim.alive) return 'invulnerable';
  const vitals = victim.vitals;
  let result: CampaignHitResult;
  if (state.tick < victim.protectedUntil || (vitals && state.tick < vitals.invulnUntil && !hit.strong)) {
    result = 'invulnerable';
  } else if (hit.damage <= 0) {
    result = 'dazed';
  } else if (victim.mounted) {
    victim.mounted = false;
    result = 'blockedOkada';
  } else if (victim.armour > 0) {
    victim.armour--;
    result = 'blockedArmour';
  } else if (vitals) {
    vitals.hp = Math.max(0, vitals.hp - hit.damage);
    vitals.lastHitTick = state.tick;
    vitals.lastHitBy = hit.byId;
    vitals.lastHitSource = hit.source;
    vitals.invulnUntil = state.tick + INVULN_TICKS;
    result = vitals.hp <= 0 ? 'defeated' : 'damaged';
  } else {
    result = 'defeated'; // no vitals: the multiplayer one-hit rules
  }
  if (hit.dazeTicks > 0 && result !== 'invulnerable')
    victim.dazedUntil = Math.max(victim.dazedUntil, state.tick + hit.dazeTicks);
  events.push({
    type: 'campaignHit',
    victimId: victim.id,
    byId: hit.byId,
    source: hit.source,
    result,
    damage: result === 'damaged' || result === 'defeated' ? hit.damage : 0,
    hpAfter: vitals?.hp ?? 0,
    maxHp: vitals?.maxHp ?? 0,
    dazeTicks: hit.dazeTicks,
    x: victim.x,
    y: victim.y,
  });
  if (result === 'defeated') {
    eliminate(state, victim, { kind: 'hazard', style: 'cargo', eventId: state.nextEventId++ }, events);
    events.push({
      type: 'campaignDefeated',
      victimId: victim.id,
      byId: hit.byId,
      source: hit.source,
      enemyKind: victim.enemyKind ?? null,
      x: victim.x,
      y: victim.y,
    });
  }
  return result;
}
