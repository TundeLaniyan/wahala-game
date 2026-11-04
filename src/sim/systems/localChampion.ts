/**
 * LOCAL CHAMPION (decision FC6): a streak reward SEPARATE from the GLOBAL KNOCKDOWN. Press B and the neighbours and
 * the people on the building side back the owner for a limited window (`config.streaks.localChampion.windowTicks`):
 * every `volleyTicks` they pick the nearest rivals within `radiusTiles` of the OWNER and throw an object at the tile
 * each stands on. The two rewards have different counterplay:
 *
 *                 GLOBAL KNOCKDOWN                   LOCAL CHAMPION
 *   who           every rival, anywhere              rivals near the owner (radius), nearest first, 2 per volley
 *   warning       36 ticks, tracks the rival's head  48 ticks, the object lands on a FIXED tile
 *   dodge         impossible                         step off the tile before it lands
 *   effect        2 s flat on the ground             0.6 s daze, no knockdown, never lethal
 *   repeat        4 s immunity after getting up      one hit per rival per use, 5 s immunity after any hit
 *   duration      one volley                         an 8 s window the owner keeps acting in
 *
 * Nobody dies of it. The owner may move, place generators and attack throughout. A death ends the window (it is a
 * temporary offensive effect, decision AS1); an UNUSED reward survives a death like every earned reward (AS7). The
 * reward is not on the default kill ladder: it is granted by `grantStreakReward(state, id, 'localChampion')` (campaign
 * missions) or replaces the 7-kill GLOBAL KNOCKDOWN when `config.streaks.localChampion.ladder` is on.
 * Deterministic: ticks only, no RNG (nearest first, ties by player id).
 */
import { isOpponent } from './queries';
import { buildingSide } from './knockdown';
import type { GameState, Player, SimEvent } from '../types';

const manhattan = (a: Pick<Player, 'x' | 'y'>, b: Pick<Player, 'x' | 'y'>): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Is a LOCAL CHAMPION object already in the air at this rival? */
const targeted = (state: GameState, id: number): boolean =>
  state.knockdowns.some((k) => k.landX !== undefined && k.targetId === id);

/** Rivals the crowd would pick now: near the owner, not immune, not already hit by this use or being aimed at. */
export function localChampionTargets(state: GameState, owner: Readonly<Player>): Player[] {
  const cfg = state.config.streaks.localChampion;
  const hit = owner.localChampion?.hit ?? [];
  return state.players
    .filter(
      (o) =>
        o.alive &&
        isOpponent(state, owner.id, o) &&
        manhattan(owner, o) <= cfg.radiusTiles &&
        state.tick >= o.localChampionImmuneUntil &&
        !hit.includes(o.id) &&
        !targeted(state, o.id),
    )
    .sort((a, b) => manhattan(owner, a) - manhattan(owner, b) || a.id - b.id);
}

/**
 * B with a LOCAL CHAMPION: the window starts and the first volley is thrown at once. Returns false (reward kept) when
 * the fighter cannot act or already has one running.
 */
export function useLocalChampion(state: GameState, p: Player, events: SimEvent[]): boolean {
  if (!p.streakRewards.localChampion || !p.alive || state.match.phase !== 'playing') return false;
  if (state.tick < p.dazedUntil || p.localChampion !== null) return false;
  const cfg = state.config.streaks.localChampion;
  p.streakRewards.localChampion = false; // one use
  p.localChampion = {
    startTick: state.tick,
    endTick: state.tick + cfg.windowTicks,
    nextVolleyTick: state.tick + cfg.volleyTicks,
    hit: [],
  };
  events.push({ type: 'streakRewardUsed', playerId: p.id, reward: 'localChampion' });
  events.push({ type: 'localChampionStarted', ownerId: p.id, endTick: p.localChampion.endTick });
  volley(state, p, events);
  return true;
}

/** The crowd throws at up to `maxThrowsPerVolley` of the nearest eligible rivals. */
function volley(state: GameState, owner: Player, events: SimEvent[]): void {
  const cfg = state.config.streaks.localChampion;
  for (const t of localChampionTargets(state, owner).slice(0, cfg.maxThrowsPerVolley)) {
    const from = buildingSide(state, t);
    const landTick = state.tick + cfg.throwTicks;
    state.knockdowns.push({
      id: state.nextId++,
      ownerId: owner.id,
      targetId: t.id,
      fromX: from.x,
      fromY: from.y,
      landTick,
      landX: t.x, // the tile they stand on NOW: stepping off it dodges the throw
      landY: t.y,
      throwTicks: cfg.throwTicks,
    });
    events.push({
      type: 'localChampionThrow',
      ownerId: owner.id,
      targetId: t.id,
      fromX: from.x,
      fromY: from.y,
      landX: t.x,
      landY: t.y,
      landTick,
    });
  }
}

/** Runs every tick: ends windows, throws the next volley and lands the objects whose flight is over. */
export function updateLocalChampion(state: GameState, events: SimEvent[]): void {
  const cfg = state.config.streaks.localChampion;
  for (const owner of state.players) {
    const run = owner.localChampion;
    if (!run) continue;
    if (!owner.alive) {
      owner.localChampion = null;
      events.push({ type: 'localChampionEnded', ownerId: owner.id, reason: 'died' });
    } else if (state.tick >= run.endTick) {
      owner.localChampion = null;
      events.push({ type: 'localChampionEnded', ownerId: owner.id, reason: 'time' });
    } else if (state.tick >= run.nextVolleyTick) {
      run.nextVolleyTick += cfg.volleyTicks;
      volley(state, owner, events);
    }
  }
  for (const k of [...state.knockdowns]) {
    if (k.landX === undefined || state.tick < k.landTick) continue;
    state.knockdowns.splice(state.knockdowns.indexOf(k), 1);
    const t = state.players[k.targetId]!;
    const owner = state.players[k.ownerId]!;
    const onTile = t.alive && t.x === k.landX && t.y === k.landY;
    if (!onTile || !isOpponent(state, owner.id, t) || state.tick < t.localChampionImmuneUntil) {
      events.push({
        type: 'localChampionMissed',
        ownerId: owner.id,
        playerId: t.id,
        x: k.landX,
        y: k.landY!,
      });
      continue;
    }
    // a short daze: they cannot act for `dazeTicks`; no knockdown, no push, never lethal
    t.dazedUntil = Math.max(t.dazedUntil, state.tick + cfg.dazeTicks);
    t.localChampionImmuneUntil = t.dazedUntil + cfg.immunityTicks;
    t.entryUntil = null;
    if (t.attack) {
      t.attack = null;
      events.push({ type: 'attackInterrupted', playerId: t.id, byId: owner.id });
    }
    owner.localChampion?.hit.push(t.id);
    events.push({ type: 'playerDazed', playerId: t.id, byId: owner.id });
    events.push({
      type: 'localChampionHit',
      ownerId: owner.id,
      playerId: t.id,
      x: t.x,
      y: t.y,
      until: t.dazedUntil,
    });
  }
}
