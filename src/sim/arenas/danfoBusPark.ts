import type { ArenaDef } from './types';
import { mirroredTraps } from './traps';

/**
 * Danfo Bus Park: 15 x 11 playable tiles. Concrete pillars sit on every odd/odd tile so each
 * even row and even column is a clear lane (the lanes vehicles can use). Soft blocks are filled
 * in with 4-fold mirror symmetry so every spawn faces the same layout.
 */
const COLS = 15;
const ROWS = 11;
const layout = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => (x % 2 === 1 && y % 2 === 1 ? '#' : '.')).join(''),
);

export const DANFO_BUS_PARK: ArenaDef = {
  id: 'danfoBusPark',
  name: 'Danfo Bus Park',
  layout,
  // Slot order: human bottom-left, then the opposite corner so 2-player games are diagonal.
  spawns: [
    { x: 0, y: ROWS - 1 },
    { x: COLS - 1, y: 0 },
    { x: 0, y: 0 },
    { x: COLS - 1, y: ROWS - 1 },
  ],
  spawnClearance: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: 2 },
    // corner-turn tiles: guarantee every spawn a safe way out of its own first blast
    { x: 2, y: 1 },
    { x: 1, y: 2 },
  ],
  mirrorSoftBlocks: true,
  // Engine-oil stains in the bays and broken tarmac by the shelters.
  hazardLayout: mirroredTraps([
    [5, 2, '~'],
    [2, 4, 'o'],
  ]),
  endgameTraps: [
    // 0:30 - spilled diesel spreads across the bays, the worn tarmac gives way
    mirroredTraps([
      [4, 0, '~'],
      [6, 4, '~'],
      [2, 3, 'o'],
      [7, 2, 'o'],
    ]),
    // 0:15 - the whole lot is slick
    mirroredTraps([
      [4, 4, '~'],
      [0, 4, 'o'],
      [6, 1, '~'],
    ]),
  ],
};
