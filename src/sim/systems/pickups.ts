/** Pickup reveal, collection, burning and effects. Effects are data-light switch cases on PickupKind. */
import { pick } from '../rng';
import type { CurseKind, GameState, PickupKind, Player, SimEvent } from '../types';

const CURSES: readonly CurseKind[] = ['slow', 'inverted', 'weakFire'];

export function revealPickupAt(
  state: GameState,
  idx: number,
  safeEventId: number | null,
  events: SimEvent[],
): void {
  const kind = state.hidden[idx];
  if (kind === undefined) return;
  delete state.hidden[idx];
  const x = idx % state.width;
  const y = Math.floor(idx / state.width);
  const pickup = { id: state.nextId++, x, y, kind, safeEventId };
  state.pickups.push(pickup);
  events.push({ type: 'pickupRevealed', pickupId: pickup.id, x, y, kind });
}

export function collectPickups(state: GameState, events: SimEvent[]): void {
  for (const p of state.players) {
    if (!p.alive || state.match.phase !== 'playing') continue;
    for (const pickup of state.pickups.filter((u) => u.x === p.x && u.y === p.y)) {
      const wasted = !applyPickup(state, p, pickup.kind, events);
      state.pickups.splice(state.pickups.indexOf(pickup), 1);
      events.push({
        type: 'pickupCollected',
        pickupId: pickup.id,
        playerId: p.id,
        kind: pickup.kind,
        wasted,
      });
    }
  }
}

/** Flames destroy pickups lying on the floor (except the one the same blast just uncovered). */
export function burnPickups(state: GameState, events: SimEvent[]): void {
  for (const pickup of [...state.pickups]) {
    const burning = state.flames.some(
      (f) => f.x === pickup.x && f.y === pickup.y && f.eventId !== pickup.safeEventId,
    );
    if (!burning) continue;
    state.pickups.splice(state.pickups.indexOf(pickup), 1);
    events.push({ type: 'pickupBurned', pickupId: pickup.id, x: pickup.x, y: pickup.y });
  }
}

/** Returns false if the pickup had no effect (already owned / already mounted) - it is still consumed. */
export function applyPickup(state: GameState, p: Player, kind: PickupKind, events: SimEvent[]): boolean {
  const g = state.config.generator;
  const c = state.config.pickups;
  switch (kind) {
    case 'petrol':
      if (p.range >= g.maxRange) return false;
      p.range = Math.min(g.maxRange, p.range + 1);
      return true;
    case 'diesel':
      if (p.range >= g.dieselRange) return false;
      p.range = g.dieselRange;
      return true;
    case 'socket':
      if (p.capacity >= g.maxCapacity) return false;
      p.capacity++;
      return true;
    case 'skates':
      if (p.speedLevel >= c.maxSpeedLevel) return false;
      p.speedLevel++;
      return true;
    case 'boots':
      return grant(p, 'kick');
    case 'gloves':
      return grant(p, 'punch');
    case 'grip':
      return grant(p, 'grip');
    case 'remote':
      return grant(p, 'remote');
    case 'sneakers':
      return grant(p, 'sneakers');
    case 'hotfuel':
      return grant(p, 'hotFuel');
    case 'killswitch':
      if (p.killSwitchCharges >= c.maxKillSwitchCharges) return false;
      p.killSwitchCharges = Math.min(c.maxKillSwitchCharges, p.killSwitchCharges + c.killSwitchCharges);
      return true;
    case 'okada':
      if (p.mounted) return false; // never stack extra lives
      p.mounted = true;
      events.push({ type: 'okadaMounted', playerId: p.id });
      return true;
    case 'voucher':
      if (p.hasVoucher) return false;
      p.hasVoucher = true;
      return true;
    case 'curse': {
      const curse = pick(state, CURSES);
      p.curse = { kind: curse, until: state.tick + c.curseTicks };
      events.push({ type: 'cursed', playerId: p.id, curse });
      return true;
    }
  }
}

function grant(p: Player, flag: 'kick' | 'punch' | 'grip' | 'remote' | 'sneakers' | 'hotFuel'): boolean {
  if (p[flag]) return false;
  p[flag] = true;
  return true;
}
