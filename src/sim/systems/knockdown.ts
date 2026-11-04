/**
 * GLOBAL KNOCKDOWN (decision GK1; the separate LOCAL CHAMPION reward is in `localChampion.ts`): the 7-kill streak reward. One press and people on the building
 * side throw an object at EVERY rival: each rival sees it coming (a visible projectile and a sound), takes it on the
 * head and falls flat. Nobody dies of it. While down (`config.streaks.globalKnockdown.knockdownTicks`, about two
 * seconds) a rival cannot move, place generators or attack - the owner can do all three - then they get up and can
 * run. A rival who has just got up is immune to another knockdown for `immunityTicks`, so it cannot stack or repeat,
 * and the reward is one use. Deterministic: ticks only, no RNG.
 */
import { isOpponent } from './queries';
import type { GameState, Player, SimEvent } from '../types';

/** Where the object is thrown from: just outside the board edge nearest to the target (ties: top, left, bottom, right). */
export function buildingSide(state: GameState, t: Pick<Player, 'x' | 'y'>): { x: number; y: number } {
  const options: [number, { x: number; y: number }][] = [
    [t.y + 1, { x: t.x, y: -1 }],
    [t.x + 1, { x: -1, y: t.y }],
    [state.height - t.y, { x: t.x, y: state.height }],
    [state.width - t.x, { x: state.width, y: t.y }],
  ];
  return options.reduce((best, o) => (o[0] < best[0] ? o : best))[1];
}

/** Who a knockdown would hit right now: living rivals (never the owner or a teammate) who are not immune or already down. */
export function knockdownTargets(state: GameState, owner: Readonly<Player>): Player[] {
  return state.players.filter(
    (o) =>
      o.alive &&
      isOpponent(state, owner.id, o) &&
      state.tick >= o.knockdownImmuneUntil &&
      state.tick >= o.knockedUntil &&
      !state.knockdowns.some((k) => k.targetId === o.id && k.landX === undefined),
  );
}

/**
 * B with a GLOBAL KNOCKDOWN: throws an object at each valid rival. Returns false (reward kept) when there is nobody to
 * hit or the fighter cannot act.
 */
export function useKnockdown(state: GameState, p: Player, events: SimEvent[]): boolean {
  if (!p.streakRewards.knockdown || !p.alive || state.match.phase !== 'playing' || state.tick < p.dazedUntil)
    return false;
  const targets = knockdownTargets(state, p);
  if (targets.length === 0) return false;
  p.streakRewards.knockdown = false; // one use
  const flight = state.config.streaks.globalKnockdown.throwTicks;
  for (const t of targets) {
    const from = buildingSide(state, t);
    state.knockdowns.push({
      id: state.nextId++,
      ownerId: p.id,
      targetId: t.id,
      fromX: from.x,
      fromY: from.y,
      landTick: state.tick + flight,
    });
    events.push({
      type: 'knockdownThrown',
      ownerId: p.id,
      targetId: t.id,
      fromX: from.x,
      fromY: from.y,
      landTick: state.tick + flight,
    });
  }
  events.push({ type: 'streakRewardUsed', playerId: p.id, reward: 'globalKnockdown' });
  return true;
}

/** Lands the objects whose flight is over and lets knocked-down fighters get up. Runs every tick. */
export function updateKnockdowns(state: GameState, events: SimEvent[]): void {
  const cfg = state.config.streaks.globalKnockdown;
  for (const k of [...state.knockdowns]) {
    if (k.landX !== undefined || state.tick < k.landTick) continue; // LOCAL CHAMPION objects land in localChampion.ts
    state.knockdowns.splice(state.knockdowns.indexOf(k), 1);
    const t = state.players[k.targetId]!;
    const owner = state.players[k.ownerId]!;
    if (!t.alive || !isOpponent(state, owner.id, t) || state.tick < t.knockedUntil) continue;
    // down: they cannot act (the same lock as a daze), their wind-up is cut short, and a slide stops
    t.knockedUntil = state.tick + cfg.knockdownTicks;
    t.dazedUntil = Math.max(t.dazedUntil, t.knockedUntil);
    t.knockdownImmuneUntil = t.knockedUntil + cfg.immunityTicks;
    t.entryUntil = null;
    t.slide = null;
    if (t.attack) {
      t.attack = null;
      events.push({ type: 'attackInterrupted', playerId: t.id, byId: owner.id });
    }
    events.push({
      type: 'knockdownHit',
      ownerId: owner.id,
      playerId: t.id,
      x: t.x,
      y: t.y,
      until: t.knockedUntil,
    });
  }
  for (const p of state.players) {
    if (p.knockedUntil > 0 && state.tick >= p.knockedUntil) {
      p.knockedUntil = 0;
      if (p.alive) events.push({ type: 'knockdownEnded', playerId: p.id });
    }
  }
}
