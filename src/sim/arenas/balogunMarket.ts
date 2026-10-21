import type { ArenaDef } from './types';
import { mirroredHazards } from './hazards';

/**
 * Balogun Market: 15 x 11 playable tiles laid out like an open-air market rather than a pillar grid.
 * Two-tile stall counters line the near and far aisles (rows 1 and 9), single stall posts stand in
 * rows 3 and 7, short side counters run down the outer aisles, and a market square opens in the
 * middle with two posts. Full-length lanes: rows 0, 2, 8, 10 and columns 0, 7, 14, so every vehicle
 * still has border-to-border routes, but the spaces between them are irregular, unlike the bus park.
 *
 *   ...............
 *   .##.##...##.##.
 *   ...............
 *   .#..#.#.#.#..#.
 *   .#...........#.
 *   ...#.......#...
 *   .#...........#.
 *   .#..#.#.#.#..#.
 *   ...............
 *   .##.##...##.##.
 *   ...............
 */
const COLS = 15;
const ROWS = 11;
const QUADRANT = [
  // x = 0..7 for rows 0..5; mirrored into the full 15 x 11 board
  '........',
  '.##.##..',
  '........',
  '.#..#.#.',
  '.#......',
  '...#....',
];
const rows = QUADRANT.map(
  (q) =>
    q +
    q
      .slice(0, COLS - q.length)
      .split('')
      .reverse()
      .join(''),
);
const layout = [...rows, ...rows.slice(0, ROWS - rows.length).reverse()];

export const BALOGUN_MARKET: ArenaDef = {
  id: 'balogunMarket',
  name: 'Balogun Market',
  layout,
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
    { x: 3, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: 2 },
    // the stall counter at (1..2, 1) blocks the corner, so keep the aisle turn below it clear
    { x: 1, y: 2 },
  ],
  // The designated trap arena (Bible: stage hazards only in specially designed arenas). With the
  // "floor traps" option on: spilled palm oil in the aisles (slide) and broken paving in the square (stumble).
  hazardLayout: mirroredHazards(COLS, ROWS, [
    [5, 2, '~'],
    [2, 4, 'o'],
    [5, 5, 'o'],
  ]),
  mirrorSoftBlocks: true,
};
