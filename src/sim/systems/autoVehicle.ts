/**
 * V2 one-press vehicle attack: picks the signature vehicle's route automatically and deterministically.
 *
 * Every legal border entry (and, for the Keke, every legal 90-degree turn) is scored by how well it
 * threatens opponents: an opponent standing on the route counts most, one beside it less, and earlier
 * contact (less time to react) a little more. Routes through the owner's own tile or a teammate's are
 * avoided. Ties break on the stable border order, so the same board always gives the same route.
 * Pure: reads only public board state (bots may call it through an Observation).
 */
import { CHARACTERS } from '../data/characters';
import type { GameState, TilePos, VehicleEntry, VehicleTurn } from '../types';
import { allBorderEntries, buildRoute, listKekeTurns, straightLeg } from './entries';
import type { EntryView } from './entries';

export interface AutoVehicleView extends EntryView {
  readonly players: readonly Readonly<GameState['players'][number]>[];
}

export interface AutoVehicleChoice {
  entry: VehicleEntry;
  turn?: VehicleTurn;
  route: TilePos[];
  score: number;
}

/** Score of one route for `ownerId`: > 0 means it threatens at least one opponent. */
export function scoreRoute(view: AutoVehicleView, ownerId: number, route: readonly TilePos[]): number {
  const me = view.players[ownerId];
  if (!me) return -Infinity;
  let score = 0;
  for (const p of view.players) {
    if (!p.alive || p.id === ownerId) continue;
    const ally = me.team >= 0 && p.team === me.team;
    route.forEach((t, i) => {
      const d = Math.abs(t.x - p.x) + Math.abs(t.y - p.y);
      if (ally) {
        if (d === 0) score -= 50;
        return;
      }
      if (d === 0) score += 10 + Math.max(0, 6 - i * 0.25);
      else if (d === 1) score += 2;
    });
  }
  if (route.some((t) => t.x === me.x && t.y === me.y)) score -= 100;
  return score;
}

export function chooseAutoVehicle(view: AutoVehicleView, ownerId: number): AutoVehicleChoice | null {
  const me = view.players[ownerId];
  if (!me) return null;
  const kind = CHARACTERS[me.characterId].vehicle;
  const turns = view.config.vehicles.specs[kind].turns;
  let best: AutoVehicleChoice | null = null;
  for (const entry of allBorderEntries(view)) {
    const options: (VehicleTurn | undefined)[] = turns ? listKekeTurns(view, entry) : [undefined];
    if (!turns && straightLeg(view, entry).length < view.config.vehicles.minRouteTiles) continue;
    for (const turn of options) {
      const route = buildRoute(view, kind, entry, turn);
      if (!route) continue;
      const score = scoreRoute(view, ownerId, route);
      if (!best || score > best.score) best = { entry, turn, route, score };
    }
  }
  return best && best.score > -50 ? best : null;
}
