/**
 * V2 button B (tap): one deterministic resolver, so a press never fires two unrelated abilities.
 *
 *   1. an opponent on an adjacent tile (faced tile first)  -> the character's melee (push / daze / shove);
 *      with an opponent adjacent B is a melee press only (a cooling-down melee does nothing, never a vehicle)
 *   2. otherwise, a Vehicle Voucher                         -> one-press signature vehicle (auto route)
 *   3. otherwise                                            -> nothing
 *
 * Holding B is the Remote Detonator (`Intent.detonate`), resolved separately in generators.ts.
 */
import type { GameState, Player, SimEvent } from '../types';
import { isActing } from './queries';
import { meleeTarget, strike } from './skills';
import { autoLaunch } from './vehicles';

export type SpecialAction = 'melee' | 'vehicle' | null;

/** What a B tap would do right now (HUD label, tutorial, bots). Read-only. */
export function previewSpecial(state: GameState, p: Player): SpecialAction {
  if (!isActing(state, p) || p.entryUntil !== null) return null;
  if (meleeTarget(state, p)) return 'melee';
  if (p.hasVoucher && !state.vehicles.some((v) => v.ownerId === p.id)) return 'vehicle';
  return null;
}

export function resolveSpecial(state: GameState, p: Player, events: SimEvent[]): SpecialAction {
  if (!isActing(state, p) || p.entryUntil !== null) return null;
  const melee = meleeTarget(state, p);
  if (melee) {
    // an adjacent opponent makes B a melee press, even while it cools down: never a surprise vehicle
    if (state.tick < p.skillReadyTick) return null;
    p.facing = melee.dir;
    if (!strike(state, p, melee.target, events)) return null;
    events.push({ type: 'specialUsed', playerId: p.id, action: 'melee' });
    return 'melee';
  }
  if (p.hasVoucher && autoLaunch(state, p, events)) {
    events.push({ type: 'specialUsed', playerId: p.id, action: 'vehicle' });
    return 'vehicle';
  }
  return null;
}
