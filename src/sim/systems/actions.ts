/**
 * V2 button B (tap): one deterministic resolver, so a press never fires two unrelated abilities. The order is part
 * of the rules (docs/FIGHTERS_AND_ATTACKS.md section 4, decision FC4); the FIRST step that applies is the only one
 * that happens:
 *
 *   0. a fighter who cannot act (dazed, down, eliminated, choosing a vehicle entrance)       -> nothing
 *   1. an opponent on an ADJACENT tile (faced tile first, then up, right, down, left):
 *        - the PRIMARY attack when it is ready; else the SECONDARY when the loadout has one and it is ready;
 *        - neither ready: B is spent on nothing (never a vehicle or a reward: no surprise)  -> melee / nothing
 *   2. nobody adjacent, a ready REACH-2 attack (primary first, then secondary) and a rival exactly two tiles
 *      away in the faced line with open ground between                                        -> that attack
 *   3. a VEHICLE GENERATOR                                                                   -> launched
 *   4. a GLOBAL KNOCKDOWN                                                                    -> thrown
 *   5. a LOCAL CHAMPION                                                                      -> the crowd starts
 *   6. a Vehicle Voucher                                                                     -> one-press signature vehicle
 *   7. otherwise                                                                             -> nothing
 *
 * Holding B is the Remote Detonator (`Intent.detonate`), resolved separately in generators.ts.
 */
import type { GameState, Player, SimEvent } from '../types';
import { isActing } from './queries';
import { useKnockdown } from './knockdown';
import { useLocalChampion } from './localChampion';
import { beginAttack, chooseAttack } from './skills';
import { autoLaunch, useVehicleGenerator } from './vehicles';

export type SpecialAction =
  'melee' | 'vehicle' | 'vehicleGenerator' | 'globalKnockdown' | 'localChampion' | null;

/** What a B tap would do right now (HUD label, tutorial, bots). Read-only. */
export function previewSpecial(state: GameState, p: Player): SpecialAction {
  if (!isActing(state, p) || p.entryUntil !== null) return null;
  if (chooseAttack(state, p)) return 'melee';
  if (p.streakRewards.vehicleGenerator !== null && !state.vehicles.some((v) => v.ownerId === p.id))
    return 'vehicleGenerator';
  if (p.streakRewards.knockdown) return 'globalKnockdown';
  if (p.streakRewards.localChampion && p.localChampion === null) return 'localChampion';
  if (p.hasVoucher && !state.vehicles.some((v) => v.ownerId === p.id)) return 'vehicle';
  return null;
}

export function resolveSpecial(state: GameState, p: Player, events: SimEvent[]): SpecialAction {
  if (!isActing(state, p) || p.entryUntil !== null) return null;
  const melee = chooseAttack(state, p);
  if (melee) {
    // an adjacent attackable opponent makes B a melee press, even while it recovers: never a surprise vehicle
    if (!melee.ready || !beginAttack(state, p, melee.target, melee.dir, events, melee.kind)) return null;
    events.push({ type: 'specialUsed', playerId: p.id, action: 'melee' });
    return 'melee';
  }
  // the kill-streak rewards, in the order they were earned: VEHICLE GENERATOR, GLOBAL KNOCKDOWN, LOCAL CHAMPION
  if (p.streakRewards.vehicleGenerator !== null && useVehicleGenerator(state, p, events)) {
    events.push({ type: 'specialUsed', playerId: p.id, action: 'vehicleGenerator' });
    return 'vehicleGenerator';
  }
  if (p.streakRewards.knockdown && useKnockdown(state, p, events)) {
    events.push({ type: 'specialUsed', playerId: p.id, action: 'globalKnockdown' });
    return 'globalKnockdown';
  }
  if (p.streakRewards.localChampion && useLocalChampion(state, p, events)) {
    events.push({ type: 'specialUsed', playerId: p.id, action: 'localChampion' });
    return 'localChampion';
  }
  if (p.hasVoucher && autoLaunch(state, p, events)) {
    events.push({ type: 'specialUsed', playerId: p.id, action: 'vehicle' });
    return 'vehicle';
  }
  return null;
}
