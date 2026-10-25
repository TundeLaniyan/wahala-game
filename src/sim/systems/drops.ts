/** Limited loot dropped by eliminated players onto nearby empty tiles. */
import { DIRS, DIR_VEC, inBounds, tileAt } from '../grid';
import { shuffle } from '../rng';
import { Tile } from '../types';
import type { GameState, PickupKind, Player, SimEvent } from '../types';
import { flameAt, groundedGeneratorAt, pickupAt } from './queries';

function inventoryKinds(state: GameState, p: Player): PickupKind[] {
  const g = state.config.generator;
  const out: PickupKind[] = [];
  if (p.range >= g.dieselRange) out.push('diesel');
  else if (p.range > g.baseRange) out.push('petrol');
  if (p.capacity > g.baseCapacity) out.push('socket');
  if (p.speedLevel > 0) out.push('skates');
  if (p.contact === 'kick') out.push('boots');
  if (p.contact === 'punch') out.push('gloves');
  if (p.contact === 'disarm' && p.killSwitchCharges > 0) out.push('killswitch');
  if (p.contact === 'pass') out.push('bombpass');
  if (p.remote) out.push('remote');
  if (p.hasVoucher) out.push('voucher');
  if (p.sneakers) out.push('sneakers');
  if (p.armour > 0) out.push('armour');
  if (p.squareTier > 0) out.push('square');
  return out;
}

function findDropTile(state: GameState, fromX: number, fromY: number): { x: number; y: number } | null {
  const seen = new Set<number>([fromY * state.width + fromX]);
  const queue = [{ x: fromX, y: fromY }];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    if (
      tileAt(state, cur.x, cur.y) === Tile.Empty &&
      !groundedGeneratorAt(state, cur.x, cur.y) &&
      !pickupAt(state, cur.x, cur.y) &&
      !flameAt(state, cur.x, cur.y)
    ) {
      return cur;
    }
    for (const d of DIRS) {
      const nx = cur.x + DIR_VEC[d].dx;
      const ny = cur.y + DIR_VEC[d].dy;
      const key = ny * state.width + nx;
      if (!inBounds(state, nx, ny) || seen.has(key) || tileAt(state, nx, ny) === Tile.Hard) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

export function dropLoot(state: GameState, eliminatedIds: number[], events: SimEvent[]): void {
  for (const id of eliminatedIds) {
    const p = state.players[id]!;
    const kinds = shuffle(state, inventoryKinds(state, p)).slice(0, state.config.drops.maxDeathDrops);
    for (const kind of kinds) {
      const tile = findDropTile(state, p.x, p.y);
      if (!tile) break;
      const pickup = { id: state.nextId++, x: tile.x, y: tile.y, kind, safeEventId: null };
      state.pickups.push(pickup);
      events.push({ type: 'pickupDropped', pickupId: pickup.id, x: tile.x, y: tile.y, kind });
    }
  }
}
