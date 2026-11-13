/**
 * The "blocked" bump (decision TN3): when the local fighter asks to move into a wall, pillar, crate or another fighter in a
 * classic raid, the drawn body is shoved a little that way and settles (the same quick shove `joltOffset` gives a hit,
 * much smaller). Pure and visual only: the simulation never moves the fighter, nothing is drawn over the board.
 */
import type { Dir } from '../../sim';

/** Peak shove in tiles: clearly visible on a phone-size board, far less than a step (1 tile). */
export const BUMP_AMOUNT = 0.11;

/** World direction (x, z) of the blocked move: right = +x, down = +z (the grid's y runs along z). */
export function bumpVector(dir: Dir): { dx: number; dz: number } {
  switch (dir) {
    case 'left':
      return { dx: -1, dz: 0 };
    case 'right':
      return { dx: 1, dz: 0 };
    case 'up':
      return { dx: 0, dz: -1 };
    case 'down':
      return { dx: 0, dz: 1 };
  }
}
