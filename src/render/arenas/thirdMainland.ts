/**
 * Third Mainland Checkpoint: an elevated bridge corridor at golden hour.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (THIRD_MAINLAND_LOOK), its surroundings (THIRD_MAINLAND_SET) and its playfield floor (THIRD_MAINLAND_FLOOR).
 * Every set follows the rules in `common.ts`: nothing on the board, the camera (south) side stays low.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { T, makeCanvas, noiseFill, seams } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { shophouseRows, streetDressing } from './shared';

export const THIRD_MAINLAND_LOOK: ArenaLook = {
  sky: 0xd2884e,
  fog: { color: 0xc07a4a, near: 13, far: 58 },
  sun: { color: 0xffa04c, intensity: 3.7, position: [-13, 7, 3] },
  hemi: { sky: 0xf0b888, ground: 0x4e3424, intensity: 0.9 },
  envIntensity: 0.5,
  exposure: 1.06,
  floorTint: 0xb4a08c,
  pillarTint: 0xc6b29c,
  softTint: 0xc4ac90,
  slab: 0x6a5a4a,
  street: 0x2a221c,
  grit: { tone: 0x7a624a, dirt: 0x56442e, dust: 0x987c60 },
  lamps: [
      [-9.2, 3.0, -0.8, 0xffa04a],
      [9.2, 3.0, 1.2, 0xffa04a],
    ],
};

function build(ctx: SetContext): void {
  streetDressing(ctx);
  shophouseRows(ctx, {});
}

export const THIRD_MAINLAND_SET: ArenaSet = {
  build,
  crowd: 0.6,
  crowdEdges: { north: true, east: true, west: true, south: true },
};

/** Placeholder floor: worn concrete with faint tile seams. */
export const THIRD_MAINLAND_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  noiseFill(g, w, h, [180, 160, 140], 18, 7);
  noiseFill(rg, w, h, [210, 210, 210], 20, 9);
  seams(g, cols, rows, 'rgba(20,18,16,0.4)', 3);
  void makeCanvas;
};
