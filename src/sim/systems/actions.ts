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
 * A campaign ENEMY seat (`Player.enemyKind`) has its own short order (enemyActions.ts, decision EA2): an adjacent
 * rival is punched, else a thrower with a rival in a clear cardinal line throws, else nothing. No rewards, no vehicles.
 *
 * Holding B is the Remote Detonator (`Intent.detonate`), resolved separately in generators.ts.
 */
import type { GameState, Player, SimEvent } from '../types';
import { isActing } from './queries';
import { enemyMeleeTarget, resolveEnemySpecial } from './enemyActions';
import { useKnockdown } from './knockdown';
import { useLocalChampion } from './localChampion';
import { beginAirSwing, beginAttack, chooseAttack } from './skills';
import { labStats } from './combatLab';
import { autoLaunch, useVehicleGenerator } from './vehicles';
import { isPilotHuman, pilotPunchTarget } from './pilotCombat';

export type SpecialAction =
  'melee' | 'vehicle' | 'vehicleGenerator' | 'globalKnockdown' | 'localChampion' | null;

/** What a B tap would do right now (HUD label, tutorial, bots). Read-only. */
export function previewSpecial(state: GameState, p: Player): SpecialAction {
  if (!isActing(state, p) || p.entryUntil !== null) return null;
  if (p.enemyKind !== undefined) return enemyMeleeTarget(state, p) ? 'melee' : null;
  // the combat pilot's human: an enemy in the pilot punch's reach, else the ordinary order (an air swing is no action)
  if (isPilotHuman(state, p) ? pilotPunchTarget(state, p) : chooseAttack(state, p)) return 'melee';
  if (p.streakRewards.vehicleGenerator !== null && !state.vehicles.some((v) => v.ownerId === p.id))
    return 'vehicleGenerator';
  if (p.streakRewards.knockdown) return 'globalKnockdown';
  if (p.streakRewards.localChampion && p.localChampion === null) return 'localChampion';
  if (p.hasVoucher && !state.vehicles.some((v) => v.ownerId === p.id)) return 'vehicle';
  return null;
}

export function resolveSpecial(state: GameState, p: Player, events: SimEvent[]): SpecialAction {
  if (state.config.combatLab && p.enemyKind === undefined) return labSpecial(state, p, events, true);
  if (!isActing(state, p) || p.entryUntil !== null) return null;
  if (p.enemyKind !== undefined) {
    const done = resolveEnemySpecial(state, p, events);
    if (done) events.push({ type: 'specialUsed', playerId: p.id, action: done });
    return done;
  }
  const melee = chooseAttack(state, p);
  if (melee) {
    // an adjacent attackable opponent makes B a melee press, even while it recovers: never a surprise vehicle
    if (!melee.ready || !beginAttack(state, p, melee.target, melee.dir, events, melee.kind)) return null;
    events.push({ type: 'specialUsed', playerId: p.id, action: 'melee' });
    return 'melee';
  }
  return resolveRewardSpecial(state, p, events);
}

/**
 * Steps 3-6 of B's order (the kill-streak rewards, then the voucher's vehicle) on their own: what B does when no rival
 * is in reach. The combat pilot's human comes here directly (pilotCombat.ts decides the melee step itself).
 */
export function resolveRewardSpecial(state: GameState, p: Player, events: SimEvent[]): SpecialAction {
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

/**
 * B in the City Rumble combat test lab (systems/combatLab.ts): the same order as `resolveSpecial` (a rival in reach,
 * then the rewards and the voucher), but a press that cannot start yet is KEPT for the level's `bufferTicks`, and a
 * press with nobody in reach and nothing else to do swings at the air. `fresh` = a new press (false: a kept one).
 */
function labSpecial(state: GameState, p: Player, events: SimEvent[], fresh: boolean): SpecialAction {
  const lab = state.config.combatLab!;
  const runtime = state.combatLab;
  const st = labStats(state, p.id);
  if (fresh && st) st.presses++;
  const keep = (): null => {
    if (fresh && runtime) runtime.buffered[p.id] = state.tick + lab.bufferTicks;
    return null;
  };
  const done = (action: SpecialAction): SpecialAction => {
    if (runtime && runtime.buffered[p.id] !== undefined) {
      delete runtime.buffered[p.id];
      if (!fresh && st) st.kept++;
    }
    if (action) events.push({ type: 'specialUsed', playerId: p.id, action });
    return action;
  };
  if (!p.alive || state.match.phase !== 'playing' || p.entryUntil !== null) return null;
  if (!isActing(state, p)) return keep(); // a short daze: the press waits for it
  const melee = chooseAttack(state, p);
  if (melee) {
    if (!melee.ready) return keep(); // recovering: the next punch goes as soon as it can
    return beginAttack(state, p, melee.target, melee.dir, events, melee.kind) ? done('melee') : keep();
  }
  const other = resolveRewardSpecial(state, p, events);
  if (other) {
    if (runtime) delete runtime.buffered[p.id];
    return other;
  }
  if (!lab.airSwing) return null;
  return beginAirSwing(state, p, events) ? done('melee') : keep();
}

/** The lab's kept B press, retried every tick until it is done or runs out (counted as dropped). */
export function retryKeptSpecial(state: GameState, p: Player, events: SimEvent[]): void {
  const runtime = state.combatLab;
  const until = runtime?.buffered[p.id];
  if (!runtime || until === undefined || !state.config.combatLab) return;
  if (state.tick > until) {
    delete runtime.buffered[p.id];
    const st = labStats(state, p.id);
    if (st) st.dropped++;
    return;
  }
  labSpecial(state, p, events, false);
}
