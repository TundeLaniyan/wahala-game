/**
 * Raid enemy directives: what an enemy seat asks of its bot, carried by `Observation.directive` (the same channel the
 * field missions use). `combat-attacks` replaces these with its group tactics (surround / block / reinforce) where it
 * has them; until then enemies hold their spot and chase the player once he is close, heavies and lieutenants earlier.
 */
import type { NpcDirective } from '../mission/types';
import type { GameState } from '../types';
import { manhattan } from '../grid';

/** How close the player has to be before each kind leaves its spot (Manhattan tiles). */
const AGGRO_RANGE = { agbero: 6, guard: 5, thrower: 7, heavy: 8, lieutenant: 7, boss: 9 } as const;

export function raidDirectiveFor(state: GameState, id: number): NpcDirective | undefined {
  const r = state.raid;
  const seat = r?.seats.find((s) => s.playerId === id);
  const p = state.players[id];
  if (!r || !seat || !p || !p.alive || r.outcome) return undefined;
  const human = state.players[0]!;
  const range = AGGRO_RANGE[seat.kind];
  if (human.alive && manhattan(p, human) <= range) return { kind: 'chase', x: human.x, y: human.y };
  return { kind: 'guard', x: seat.spot.x, y: seat.spot.y, radius: 2 };
}
