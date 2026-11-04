/**
 * Kill-streak rewards (decisions SK1-SK3). The fixed initial loadout is, for the nth credited elimination of the
 * current life:
 *
 *   3  QUICK HANDS        a timed buff: more generator capacity, hold-to-lay, no placement press is ever lost
 *   5  VEHICLE GENERATOR  one use: a public vehicle carries a live generator at a rival (systems/vehicleGenerator.ts)
 *   7  GLOBAL KNOCKDOWN   one use: every rival is knocked flat by a thrown object (systems/knockdown.ts)
 *
 * Each threshold pays once per streak and each reward is consumed once. EVERY earned reward survives an actual death until
 * it is used or the match ends (decision AS7): the one-use rewards (VEHICLE GENERATOR, GLOBAL KNOCKDOWN) as they are, and
 * QUICK HANDS as its unspent time - it starts the moment it is earned (SK2), a death pauses the running buff and stores
 * what was left (`quickHandsBank`), the respawn resumes exactly that, never a fresh 18 s. A reward already held (running,
 * stored or unused) is never paid a second time. The match score (kills, deaths,
 * assists) is never touched. Pure and deterministic: the only randomness is the match RNG choosing a vehicle for the
 * VEHICLE GENERATOR.
 */
import { freshStreakRewards } from '../data/streaks';
import { nextInt } from '../rng';
import type { GameState, Player, SimEvent, StreakRewardKind, VehicleKind } from '../types';
import { tryPlaceGenerator } from './generators';
import { missionRewardEligible } from '../mission/rules';

/** Is QUICK HANDS running for this fighter? */
export const quickHandsActive = (state: Pick<GameState, 'tick'>, p: Pick<Player, 'streakRewards'>): boolean =>
  p.streakRewards.quickHandsUntil > state.tick;

/** The public vehicles this match allows (never empty). */
export function allowedVehicles(state: Pick<GameState, 'config'>): VehicleKind[] {
  const list = state.config.vehicles.allowed;
  return list.length > 0 ? list : ['danfo'];
}

/** Draws a vehicle for a voucher or a VEHICLE GENERATOR from the match RNG; the character plays no part. */
export function drawVehicle(state: GameState): VehicleKind {
  const list = allowedVehicles(state);
  return list[nextInt(state, list.length)]!;
}

/** Pays the thresholds the credited eliminations of this tick crossed (to living eliminators only). */
export function grantStreakRewards(state: GameState, events: SimEvent[]): void {
  const cfg = state.config.streaks;
  if (!cfg.enabled) return;
  const credited = new Map<number, number>();
  for (const e of events) {
    if (e.type === 'playerEliminated' && e.creditId !== null && missionRewardEligible(state, e.creditId))
      credited.set(e.creditId, (credited.get(e.creditId) ?? 0) + 1);
  }
  for (const [id, count] of [...credited.entries()].sort((a, b) => a[0] - b[0])) {
    const p = state.players[id];
    if (!p || !p.alive) continue; // fell in the same tick: nothing to hand over
    const after = p.stats.streak;
    const before = after - count;
    for (const step of [...cfg.loadout].sort((a, b) => a.kills - b.kills)) {
      if (step.kills <= before || step.kills > after || p.streakRewards.earned.includes(step.kills)) continue;
      p.streakRewards.earned.push(step.kills);
      earn(state, p, step.reward, step.kills, events);
    }
  }
}

function earn(
  state: GameState,
  p: Player,
  reward: StreakRewardKind,
  kills: number,
  events: SimEvent[],
): void {
  const r = p.streakRewards;
  switch (reward) {
    case 'quickHands': {
      if (r.quickHandsUntil > 0 || r.quickHandsBank > 0) return; // already held (running or stored): never paid twice
      const q = state.config.streaks.quickHands;
      r.quickHandsStart = state.tick;
      r.quickHandsUntil = state.tick + q.durationTicks;
      r.quickHandsExtra = q.extraCapacity;
      p.capacity += q.extraCapacity;
      events.push({ type: 'streakRewardEarned', playerId: p.id, reward, kills });
      return;
    }
    case 'vehicleGenerator': {
      if (r.vehicleGenerator !== null) return; // one unused copy at most: never duplicated (decision AS5)
      const vehicle = drawVehicle(state);
      r.vehicleGenerator = vehicle;
      events.push({ type: 'streakRewardEarned', playerId: p.id, reward, kills, vehicle });
      return;
    }
    case 'globalKnockdown':
      if (r.knockdown) return; // one unused copy at most
      r.knockdown = true;
      events.push({ type: 'streakRewardEarned', playerId: p.id, reward, kills });
      return;
  }
}

/** Ends QUICK HANDS when its time is up (taking its extra capacity away again). */
export function updateStreaks(state: GameState, events: SimEvent[]): void {
  for (const p of state.players) {
    const r = p.streakRewards;
    // a respawned fighter gets back the QUICK HANDS time a death had paused - the unspent remainder, not a new reward
    if (p.alive && r.quickHandsBank > 0 && r.quickHandsUntil === 0) resumeQuickHands(state, p, events);
    if (r.quickHandsUntil > 0 && state.tick >= r.quickHandsUntil) {
      endQuickHands(p);
      if (p.alive) events.push({ type: 'streakRewardEnded', playerId: p.id, reward: 'quickHands' });
    }
  }
}

/** Resumes the stored QUICK HANDS time from now (the buff was paused by a death). */
function resumeQuickHands(state: GameState, p: Player, events: SimEvent[]): void {
  const r = p.streakRewards;
  const q = state.config.streaks.quickHands;
  const left = r.quickHandsBank;
  r.quickHandsBank = 0;
  r.quickHandsStart = state.tick + left - q.durationTicks; // the HUD ring shows the share of the full duration left
  r.quickHandsUntil = state.tick + left;
  r.quickHandsExtra = q.extraCapacity;
  p.capacity += q.extraCapacity;
  events.push({ type: 'streakRewardResumed', playerId: p.id, reward: 'quickHands', ticksLeft: left });
}

function endQuickHands(p: Player): void {
  const r = p.streakRewards;
  p.capacity = Math.max(1, p.capacity - r.quickHandsExtra);
  r.quickHandsUntil = 0;
  r.quickHandsExtra = 0;
  r.placeQueuedUntil = 0;
}

/**
 * A death (or a respawn) ends the streak - the kill count starts over and the thresholds can be earned again - but loses
 * no reward (decision AS7). A running QUICK HANDS is PAUSED: its capacity goes away with the death and the unspent time
 * is stored in `quickHandsBank` (the respawn resumes it; see `updateStreaks`). The one-use rewards stay as they are.
 */
export function clearStreakRewards(state: Pick<GameState, 'tick'>, p: Player): void {
  const r = p.streakRewards;
  let bank = r.quickHandsBank;
  if (r.quickHandsUntil > 0) {
    bank = Math.max(bank, r.quickHandsUntil - state.tick);
    endQuickHands(p);
  }
  p.streakRewards = {
    ...freshStreakRewards(),
    quickHandsBank: Math.max(0, bank),
    vehicleGenerator: r.vehicleGenerator,
    knockdown: r.knockdown,
  };
}

/**
 * QUICK HANDS placement (applied after the fighter's other intents each tick):
 *  - a held A lays a generator on every tile the fighter steps onto (`Intent.placeHeld`);
 *  - a placement press that could not be done (dazed, the tile taken, at capacity) is kept for `placeBufferTicks`
 *    and done the moment it can be, so it is never silently ignored.
 */
export function quickHandsPlacement(
  state: GameState,
  p: Player,
  intent: { place?: boolean; placeHeld?: boolean },
  events: SimEvent[],
): void {
  if (!quickHandsActive(state, p)) return;
  const r = p.streakRewards;
  const wants = intent.place === true || intent.placeHeld === true || r.placeQueuedUntil > state.tick;
  if (!wants) return;
  if (tryPlaceGenerator(state, p, events)) {
    r.placeQueuedUntil = 0;
    return;
  }
  // a tap that failed is remembered (a held A already retries every tick)
  if (intent.place === true)
    r.placeQueuedUntil = state.tick + state.config.streaks.quickHands.placeBufferTicks;
}
