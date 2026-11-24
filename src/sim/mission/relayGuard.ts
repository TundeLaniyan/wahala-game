/**
 * RELAY GUARDS (decision PI8, docs/BOSS_JAMMER_PROTECTION.md): while the boss is shielded and the dispatch relays are the
 * objective, the first `BossBalance.relayGuards[level]` of his backup fighters defend the LIVE relays instead of standing
 * at their posts: each one stands within `relayGuardRadius` tiles of one live relay (the first at the relay nearest the
 * player, the second at the next nearest, ...) and, being a `guard`, hunts him when he comes inside. They return to their
 * own role the moment the boss is exposed. Pure: a function of the mission state, so it replays.
 *
 * Absent (`MissionTuning.boss.relayGuards` unset: Easy and every boss without a balance) it returns undefined and the
 * seat's own role decides exactly as before.
 */
import type { GameState } from '../types';
import type { MissionSeat, NpcDirective, NpcRole } from './types';

/** The order backup fighters are drafted in: the marshal, the lane blocker, then the escort (a fallen one is replaced). */
export const RELAY_GUARD_ORDER: readonly NpcRole[] = ['meleeGuard', 'blocker', 'escort'];

/** The directive of seat `seat` when it is a relay guard right now, else undefined. */
export function relayGuardDirective(state: GameState, seat: MissionSeat): NpcDirective | undefined {
  const m = state.mission;
  const b = m?.tuning.boss;
  if (
    !m ||
    !b?.relayGuards ||
    m.objective !== 'dispatchRelays' ||
    !m.boss.shielded ||
    m.phaseState !== 'active'
  )
    return undefined;
  const human = state.players[0]!;
  if (!human.alive) return undefined;
  const order = (role: MissionSeat['role']): number => RELAY_GUARD_ORDER.indexOf(role as NpcRole);
  const drafted = m.seats
    .filter((s) => order(s.role) >= 0 && state.players[s.playerId]?.alive)
    .sort((a, c) => order(a.role) - order(c.role) || a.playerId - c.playerId)
    .slice(0, b.relayGuards);
  const rank = drafted.findIndex((s) => s.playerId === seat.playerId);
  if (rank < 0) return undefined;
  const live = m.nodes
    .map((n, index) => ({ n, index }))
    .filter((q) => !q.n.done)
    .sort(
      (a, c) =>
        Math.abs(a.n.x - human.x) +
          Math.abs(a.n.y - human.y) -
          (Math.abs(c.n.x - human.x) + Math.abs(c.n.y - human.y)) || a.index - c.index,
    );
  if (live.length === 0) return undefined;
  const node = live[rank % live.length]!.n;
  return { kind: 'guard', x: node.x, y: node.y, radius: b.relayGuardRadius ?? 2 };
}
