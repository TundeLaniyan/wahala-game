/**
 * Spectator target selection (presentation only): once the local player is out of a City Rumble
 * match, the camera follows one surviving competitor. Pure functions of the game state, so the
 * choice is testable and never feeds back into the simulation.
 */
import type { GameState, Player } from '../sim';

const alive = (state: GameState): Player[] => state.players.filter((p) => p.alive);

/**
 * Who gets the credit for `p`'s last elimination (the simulation's `eliminatedBy`: flame owner, chain
 * starter, vehicle owner or a recent melee attacker; null for the city, traffic, its own generator, a
 * teammate's friendly fire ...).
 */
export function eliminatorOf(state: GameState, p: Player): Player | null {
  return p.eliminatedBy !== null ? (state.players[p.eliminatedBy] ?? null) : null;
}

/** Credited eliminations of each player (index = player id), straight from the simulation's stats. */
export function killCounts(state: GameState): number[] {
  return state.players.map((p) => p.stats.kills);
}

/**
 * The player to watch. Keeps `current` while it is alive; otherwise follows the one who knocked
 * `current` (or the local player) out, then the survivor nearest to where the action was, ties broken
 * by most eliminations and then by id. Null when nobody is left standing.
 */
export function pickSpectateTarget(state: GameState, localId: number, current: number | null): number | null {
  const survivors = alive(state);
  if (survivors.length === 0) return null;
  const cur = current !== null ? state.players[current] : undefined;
  if (cur?.alive && cur.id !== localId) return cur.id;
  const from = cur ?? state.players[localId];
  if (from) {
    const killer = eliminatorOf(state, from);
    if (killer?.alive) return killer.id;
  }
  const ox = from?.x ?? state.width / 2;
  const oy = from?.y ?? state.height / 2;
  const kills = killCounts(state);
  let best = survivors[0]!;
  let bestKey = Infinity;
  for (const p of survivors) {
    if (p.id === localId && survivors.length > 1) continue;
    const key = (Math.abs(p.x - ox) + Math.abs(p.y - oy)) * 100 - kills[p.id]! * 10 + p.id * 0.01;
    if (key < bestKey) {
      bestKey = key;
      best = p;
    }
  }
  return best.id;
}

/** The next (dir 1) or previous (dir -1) survivor after `current`, in player order, wrapping around. */
export function cycleSpectateTarget(state: GameState, current: number | null, dir: 1 | -1): number | null {
  const ids = alive(state).map((p) => p.id);
  if (ids.length === 0) return null;
  if (current === null) return ids[0]!;
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const id = (((current + dir * step) % n) + n) % n;
    if (state.players[id]!.alive) return id;
  }
  return ids[0]!;
}
