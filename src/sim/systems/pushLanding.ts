/** Where a pushed fighter lands: shared by the close attacks (skills.ts) and campaign knockback (campaignDamage.ts). */
import type { GameState, Player } from '../types';
import { canPlayerEnter } from './stepping';

/** How far (up to `max` tiles) `target` can be pushed along `v`: the last free tile and how many tiles that is. */
export function pushLanding(
  state: GameState,
  target: Player,
  v: { dx: number; dy: number },
  max: number,
): { x: number; y: number; tiles: number } | null {
  let out: { x: number; y: number; tiles: number } | null = null;
  for (let k = 1; k <= max; k++) {
    const x = target.x + v.dx * k;
    const y = target.y + v.dy * k;
    if (!canPlayerEnter(state, x, y)) break;
    out = { x, y, tiles: k };
  }
  return out;
}
