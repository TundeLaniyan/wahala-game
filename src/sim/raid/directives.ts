/**
 * Raid enemy directives: what an enemy seat asks of its bot, carried by `Observation.directive` (the same channel the
 * field missions use). Since decision RA1 every raid enemy plays its territory (`systems/territory.ts`, its route from
 * `routes.ts`); the old rule below (hold the spot, chase the player once he is close) remains only for a raid built
 * without the tactics layer (a test that strips `config.campaignTactics`).
 */
import type { NpcDirective } from '../mission/types';
import type { GameState } from '../types';
import { manhattan } from '../grid';
import { territoryDirective } from '../systems/territory';

/** How close the player has to be before each kind leaves its spot (Manhattan tiles). */
const AGGRO_RANGE = { agbero: 6, guard: 5, thrower: 7, heavy: 8, lieutenant: 7, boss: 9 } as const;

export function raidDirectiveFor(state: GameState, id: number): NpcDirective | undefined {
  const r = state.raid;
  const seat = r?.seats.find((s) => s.playerId === id);
  const p = state.players[id];
  if (!r || !seat || !p || !p.alive || r.outcome) return undefined;
  // decision RA1: an enemy with a territory (the raid tactics layer) plays it: patrol, notice, pursue, search, return
  if (state.territory?.minds[id]) return territoryDirective(state, id);
  const human = state.players[0]!;
  const range = AGGRO_RANGE[seat.kind];
  if (human.alive && manhattan(p, human) <= range) return { kind: 'chase', x: human.x, y: human.y };
  return { kind: 'guard', x: seat.spot.x, y: seat.spot.y, radius: 2 };
}
