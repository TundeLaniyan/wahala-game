/**
 * V2 elimination credit (decision WC4). Deterministic and bounded. For each lethal cause:
 *
 *  - flame:   the owner of the generator whose flame hit the victim, when that is an opponent. When it was
 *             the victim's OWN generator (or a teammate's), whoever set that chain off: the player who
 *             kicked / punched the chain's first generator or rammed it with a vehicle (`touchedBy`), else
 *             the owner of the chain's first generator (`BlastEvent.instigatorId` / `seedOwnerId`);
 *  - vehicle: the vehicle's owner (unless it was the victim's own vehicle or a teammate's);
 *  - spectator throws: never credited, not even to a recent attacker (the sideline cannot score);
 *  - crush, stage hazards, crowd: nobody directly.
 *
 * When no cause names an opponent, the newest opponent who melee'd the victim within
 * `credit.assistWindowTicks` gets it (shoved into the fire / traffic / closing city, or into the victim's
 * own blast). No such attacker = nobody: an unrelated accident is never anyone's free kill.
 *
 * Several lethal causes in the same tick (two blasts, a blast and a bus): the FIRST credited cause in hit
 * order (vehicles, crush, crowd, stage, then flames by explosion order) gets the elimination; every other
 * credited opponent and every recent melee attacker gets an assist. A victim is eliminated (and credited)
 * at most once per death, so a reward can never be paid twice for the same victim.
 */
import type { EliminationCause, GameState, Player } from '../types';
import { teammates } from './queries';

export interface Credit {
  creditId: number | null;
  assistIds: number[];
  /** The cause the credit came from (the first cause when nobody is credited). */
  cause: EliminationCause;
}

const opponentOf =
  (state: GameState, victim: Player) =>
  (id: number | null | undefined): id is number => {
    if (id === null || id === undefined || id === victim.id) return false;
    const q = state.players[id];
    return q !== undefined && !teammates(q, victim);
  };

/** The opponent one cause alone credits (null = none). */
export function causeCredit(state: GameState, victim: Player, cause: EliminationCause): number | null {
  const valid = opponentOf(state, victim);
  switch (cause.kind) {
    case 'flame': {
      if (valid(cause.ownerId)) return cause.ownerId;
      const blast = state.blasts.find((b) => b.id === cause.eventId);
      if (!blast) return null;
      if (valid(blast.instigatorId)) return blast.instigatorId;
      return valid(blast.seedOwnerId) ? blast.seedOwnerId : null;
    }
    case 'vehicle':
      return valid(cause.ownerId) ? cause.ownerId : null;
    default:
      return null;
  }
}

/** Recent melee attackers that are opponents, newest first (ties: lower id first). */
function recentAttackers(state: GameState, victim: Player): number[] {
  const window = state.config.credit.assistWindowTicks;
  const valid = opponentOf(state, victim);
  return victim.recentHits
    .filter((h) => state.tick - h.tick <= window && valid(h.byId))
    .sort((a, b) => b.tick - a.tick || a.byId - b.byId)
    .map((h) => h.byId);
}

export function creditFor(
  state: GameState,
  victim: Player,
  causes: EliminationCause | readonly EliminationCause[],
): Credit {
  const list: readonly EliminationCause[] = Array.isArray(causes) ? causes : [causes as EliminationCause];
  const recent = recentAttackers(state, victim);
  let creditId: number | null = null;
  let cause = list[0]!;
  const others: number[] = [];
  for (const c of list) {
    const id = causeCredit(state, victim, c);
    if (id === null) continue;
    if (creditId === null) {
      creditId = id;
      cause = c;
    } else others.push(id);
  }
  if (creditId === null && list.some((c) => c.kind !== 'spectator')) {
    creditId = recent[0] ?? null;
    if (creditId !== null) cause = list.find((c) => c.kind !== 'spectator')!;
  }
  const assistIds = [...new Set([...others, ...recent])].filter((id) => id !== creditId).sort((a, b) => a - b);
  return { creditId, assistIds, cause };
}
