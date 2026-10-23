/**
 * Oshodi Interchange: a junction under the flyovers in bright late-morning traffic haze.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (OSHODI_LOOK), its surroundings (OSHODI_SET) and its playfield floor (OSHODI_FLOOR).
 * Every set follows the rules in `common.ts`: nothing on the board, the camera (south) side stays low.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { T, makeCanvas, noiseFill, seams } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { shophouseRows, streetDressing } from './shared';

export const OSHODI_LOOK: ArenaLook = {
  sky: 0xb4ad9c,
  fog: { color: 0xa69e8a, near: 14, far: 56 },
  sun: { color: 0xfff0d6, intensity: 3.9, position: [6, 18, 7] },
  hemi: { sky: 0xd8d0bc, ground: 0x6a5e4c, intensity: 1.0 },
  envIntensity: 0.5,
  exposure: 1.1,
  floorTint: 0xc4bcae,
  pillarTint: 0xd2cabc,
  softTint: 0xcabcaa,
  slab: 0x726a5e,
  street: 0x2c2824,
  grit: { tone: 0x7c6c58, dirt: 0x5c5040, dust: 0x9a8a74 },
  lamps: [
      [-9.2, 3.0, -0.8, 0xffa04a],
      [9.2, 3.0, 1.2, 0xffa04a],
    ],
};

function build(ctx: SetContext): void {
  streetDressing(ctx);
  shophouseRows(ctx, { north: true, east: true, west: true });
}

export const OSHODI_SET: ArenaSet = {
  build,
  crowd: 0.6,
  crowdEdges: { north: true, east: true, west: true, south: true },
};

/** Placeholder floor: worn concrete with faint tile seams. */
export const OSHODI_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  noiseFill(g, w, h, [196, 188, 174], 18, 7);
  noiseFill(rg, w, h, [210, 210, 210], 20, 9);
  seams(g, cols, rows, 'rgba(20,18,16,0.4)', 3);
  void makeCanvas;
};
