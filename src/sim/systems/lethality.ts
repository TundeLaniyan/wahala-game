/**
 * Lethal hits. Every hit produced in a tick is collected first, then resolved together so that
 * simultaneous eliminations are genuinely simultaneous (and can therefore produce draws).
 */
import type { EliminationCause, GameState, Player, SimEvent } from '../types';
import { creditFor } from './attribution';
import { canHarm } from './queries';

export interface LethalHit {
  playerId: number;
  eventId: number;
  cause: EliminationCause;
  /** Tick until which a rider whose Okada absorbed this hit ignores the same continuing hazard. */
  graceUntil: number;
}

export function isImmune(state: GameState, p: Player, eventId: number): boolean {
  return p.immune.some((e) => e.eventId === eventId && e.until > state.tick);
}

/** Collects flame hits for every player currently standing in fire. */
export function collectFlameHits(state: GameState): LethalHit[] {
  const hits: LethalHit[] = [];
  for (const p of state.players) {
    if (!p.alive) continue;
    for (const f of state.flames) {
      if (f.x === p.x && f.y === p.y && state.tick >= f.startTick && state.tick < f.endTick) {
        if (!canHarm(state, f.ownerId, p)) continue; // teammate's fire, friendly fire off
        hits.push({
          playerId: p.id,
          eventId: f.eventId,
          cause: f.fromSpectator
            ? { kind: 'spectator', ownerId: f.ownerId, eventId: f.eventId }
            : { kind: 'flame', ownerId: f.ownerId, eventId: f.eventId },
          graceUntil: Math.max(f.endTick, state.tick + state.config.okada.graceTicks),
        });
      }
    }
  }
  return hits;
}

/** Applies all hits simultaneously. Returns the ids eliminated this tick. */
export function applyLethalHits(state: GameState, hits: LethalHit[], events: SimEvent[]): number[] {
  const eliminated: number[] = [];
  const byPlayer = new Map<number, LethalHit[]>();
  for (const h of hits) {
    const list = byPlayer.get(h.playerId) ?? [];
    list.push(h);
    byPlayer.set(h.playerId, list);
  }

  for (const p of state.players) {
    p.immune = p.immune.filter((e) => e.until > state.tick);
    const mine = byPlayer.get(p.id);
    if (!p.alive || !mine) continue;
    const live = mine.filter((h) => !isImmune(state, p, h.eventId));
    if (live.length === 0) continue;
    // spawn protection (respawn modes): ignore everything but the closing walls
    if (state.tick < p.protectedUntil && live.every((h) => h.cause.kind !== 'crush')) continue;

    // Protection layers: ONE layer absorbs every lethal event of this tick (so one explosion frame can
    // never eat the Okada, the Armour and the life at once); the Okada goes first, then Armour.
    const layer = p.mounted ? 'okada' : p.armour > 0 ? 'armour' : null;
    if (layer) {
      if (layer === 'okada') p.mounted = false;
      else p.armour--;
      for (const h of live) p.immune.push({ eventId: h.eventId, until: h.graceUntil });
      if (layer === 'okada') events.push({ type: 'okadaBroken', playerId: p.id, x: p.x, y: p.y });
      events.push({ type: 'protectionBroken', playerId: p.id, layer, x: p.x, y: p.y });
      continue;
    }
    eliminate(state, p, live[0]!.cause, events);
    eliminated.push(p.id);
  }
  return eliminated;
}

export function eliminate(state: GameState, p: Player, cause: EliminationCause, events: SimEvent[]): void {
  const credit = creditFor(state, p, cause);
  p.alive = false;
  p.eliminatedTick = state.tick;
  p.elimination = cause;
  p.eliminatedBy = credit.creditId;
  p.stats.deaths++;
  p.recentHits = [];
  if (credit.creditId !== null) {
    const killer = state.players[credit.creditId]!;
    killer.stats.kills++;
    killer.stats.lastKillTick = state.tick;
  }
  for (const id of credit.assistIds) state.players[id]!.stats.assists++;
  p.entryUntil = null;
  p.stepRemaining = 0;
  if (p.carrying !== null) {
    const gen = state.generators.find((g) => g.id === p.carrying);
    if (gen) {
      gen.carriedBy = null;
      gen.stepFromX = gen.x;
      gen.stepFromY = gen.y;
    }
    p.carrying = null;
  }
  events.push({
    type: 'playerEliminated',
    playerId: p.id,
    cause,
    x: p.x,
    y: p.y,
    creditId: credit.creditId,
    assistIds: credit.assistIds,
  });
}
