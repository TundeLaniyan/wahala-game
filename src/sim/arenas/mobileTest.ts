import type { TilePos } from '../types';
import type { ArenaDef } from './types';
import { CORNER_CLEARANCE, inAndOut, makeLayout, mirror4, trapRows } from './build';

/**
 * EXPERIMENTAL Mobile Test Arena (decision WB10): a smaller board so phone players get bigger tiles, built
 * from Danfo Bus Park (same look, same Danfo-bay stage idea) without touching the nine official stages.
 * Primary 13 x 9, plus a 15 x 9 variant (same width as the standard arenas, two rows shorter). Concrete on
 * every odd/odd tile, 4-fold mirror symmetry, corner spawns with the standard L-shaped clearance, mandatory
 * endgame trap waves and Wahala Crush as everywhere else (the crush schedule is paced from the real tile
 * count, so a smaller board closes to its final tile at exactly 0:00 too).
 *
 * Stage: one simple hazard - a Danfo noses three tiles into the middle row from the west or east street
 * and reverses out (telegraphed 2 s); the bay tiles are road (never crates).
 */
function mobileArena(id: string, cols: number, rows: number): ArenaDef {
  const mid = (rows - 1) / 2;
  const bays = [inAndOut([0, mid], [2, mid]), inAndOut([cols - 1, mid], [cols - 3, mid])];
  const spawns: TilePos[] = [
    { x: 0, y: rows - 1 },
    { x: cols - 1, y: 0 },
    { x: 0, y: 0 },
    { x: cols - 1, y: rows - 1 },
  ];
  const traps = (marks: readonly (readonly [number, number, 'o' | '~'])[]): string[] => trapRows(marks, cols, rows);
  return {
    id,
    name: `Mobile Test Arena ${cols} x ${rows}`,
    kind: 'standard',
    experimental: true,
    layout: makeLayout({
      cols,
      rows,
      roads: mirror4(
        [
          [0, mid],
          [1, mid],
          [2, mid],
        ],
        cols,
        rows,
      ),
    }),
    spawns,
    spawnClearance: CORNER_CLEARANCE,
    mirrorSoftBlocks: true,
    maxPlayers: 4,
    floorTraps: traps([[4, 2, '~']]),
    endgameTraps: [
      // 0:30 - diesel across the inner lanes, a pothole opens by each corner run
      traps([
        [2, 2, 'o'],
        [4, 0, '~'],
      ]),
      // 0:15 - the middle goes slick
      traps([
        [4, mid, '~'],
        [0, 2, 'o'],
      ]),
    ],
    stageHazards: [
      { kind: 'sweep', style: 'danfo', routes: bays, stepTicks: 9, firstAtSec: 14, everySec: [14, 20], warnSec: 2 },
    ],
    info: {
      tagline: `EXPERIMENTAL - a compact ${cols} x ${rows} Bus Park for phones: bigger tiles, shorter runs.`,
      lighting: 'Warm late afternoon',
      hazards: ['A Danfo noses into the middle row from either side street and reverses out - lane flashes 2 s before.'],
    },
  };
}

export const MOBILE_TEST_13X9 = mobileArena('mobileTest13x9', 13, 9);
export const MOBILE_TEST_15X9 = mobileArena('mobileTest15x9', 15, 9);
