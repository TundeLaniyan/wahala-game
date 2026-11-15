/**
 * A seat's own generator loadout: the config's base range / capacity plus the seat's permanent campaign upgrades
 * (`Player.loadoutBonus`, decisions PR1-PR8). Without a bonus every function returns exactly the config value, so
 * matches without campaign upgrades behave as before. Temporary pickups (Petrol, Diesel, Extra Socket) build on top
 * of this base and are reset to it on death.
 */
import type { GameConfig } from '../config';
import type { LoadoutBonus, Player } from '../types';

type Gen = GameConfig['generator'];
type Seat = Pick<Player, 'loadoutBonus'>;

const step = (n: number | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;

/** The seat's starting / respawn range: base + its range upgrade, never above the blast radius cap. */
export function seatBaseRange(p: Seat, g: Gen): number {
  return Math.min(g.maxRange, g.baseRange + step(p.loadoutBonus?.range));
}

/** The seat's starting / respawn capacity: base + its capacity upgrade. */
export function seatBaseCapacity(p: Seat, g: Gen): number {
  return g.baseCapacity + step(p.loadoutBonus?.capacity);
}

/** The most generators this seat may carry: the cap rises with its upgrade, so an Extra Socket still adds one. */
export function seatMaxCapacity(p: Seat, g: Gen): number {
  return g.maxCapacity + step(p.loadoutBonus?.capacity);
}

/** A cleaned bonus (non-negative whole steps), or undefined when it adds nothing. */
export function normaliseLoadoutBonus(b: LoadoutBonus | undefined): LoadoutBonus | undefined {
  if (!b) return undefined;
  const capacity = step(b.capacity);
  const range = step(b.range);
  return capacity === 0 && range === 0 ? undefined : { capacity, range };
}
