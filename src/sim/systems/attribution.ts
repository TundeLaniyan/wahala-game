/**
 * V2 elimination credit. Deterministic and bounded:
 *
 *  - flame:   the owner of the generator whose flame hit the victim; if that is the victim's own generator,
 *             the owner of the generator that STARTED the chain (they set it off); otherwise see "recent";
 *  - vehicle: the vehicle's owner (unless it was the victim's own vehicle);
 *  - spectator throws: never credited (the sideline cannot score);
 *  - everything else (own blast, crush, stage hazards, crowd) and teammates: "recent" - the newest
 *    opponent who melee'd the victim within `credit.assistWindowTicks` (knocked into the fire / traffic).
 *    No such attacker = nobody gets credit: unrelated accidents are never anyone's free kill.
 *
 * Assists: the other opponents who melee'd the victim inside the window. A victim is credited once per
 * elimination, so a reward can never be paid twice for the same death.
 */
import type { EliminationCause, GameState, Player } from '../types';
import { teammates } from './queries';

export interface Credit {
  creditId: number | null;
  assistIds: number[];
}

export function creditFor(state: GameState, victim: Player, cause: EliminationCause): Credit {
  const window = state.config.credit.assistWindowTicks;
  const recent = victim.recentHits
    .filter((h) => state.tick - h.tick <= window && h.byId !== victim.id)
    .sort((a, b) => b.tick - a.tick || a.byId - b.byId)
    .map((h) => h.byId)
    .filter((id) => {
      const q = state.players[id];
      return q !== undefined && !teammates(q, victim);
    });
  const valid = (id: number | null | undefined): id is number => {
    if (id === null || id === undefined || id === victim.id) return false;
    const q = state.players[id];
    return q !== undefined && !teammates(q, victim);
  };

  let creditId: number | null = null;
  if (cause.kind === 'flame') {
    if (valid(cause.ownerId)) creditId = cause.ownerId;
    else {
      const seed = state.blasts.find((b) => b.id === cause.eventId)?.seedOwnerId;
      if (valid(seed)) creditId = seed;
    }
  } else if (cause.kind === 'vehicle') {
    if (valid(cause.ownerId)) creditId = cause.ownerId;
  }
  if (creditId === null && cause.kind !== 'spectator') creditId = recent[0] ?? null;
  // a teammate's (friendly-fire) blast is no one's credit unless an opponent shoved the victim into it
  return { creditId, assistIds: [...new Set(recent.filter((id) => id !== creditId))] };
}
