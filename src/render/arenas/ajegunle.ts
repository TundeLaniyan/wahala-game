/**
 * Ajegunle Backstreets: tight residential lanes under an overcast afternoon sky.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (AJEGUNLE_LOOK), its surroundings (AJEGUNLE_SET) and its playfield floor (AJEGUNLE_FLOOR).
 * Every set follows the rules in `common.ts`: nothing on the board, the camera (south) side stays low.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { T, makeCanvas, noiseFill, seams } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { shophouseRows, streetDressing } from './shared';

export const AJEGUNLE_LOOK: ArenaLook = {
  sky: 0x8a8c8a,
  fog: { color: 0x7e807c, near: 11, far: 44 },
  sun: { color: 0xe2e4e6, intensity: 2.3, position: [-5, 17, 6] },
  hemi: { sky: 0xc4c6c6, ground: 0x4e4a44, intensity: 1.15 },
  envIntensity: 0.4,
  exposure: 1.06,
  floorTint: 0xb0aaa0,
  pillarTint: 0xbcb4a8,
  softTint: 0xc0b2a0,
  slab: 0x625c54,
  street: 0x2a2622,
  grit: { tone: 0x6c665c, dirt: 0x4c463e, dust: 0x8a8478 },
  lamps: [
      [-9.2, 3.0, -0.8, 0xffa04a],
      [9.2, 3.0, 1.2, 0xffa04a],
    ],
};

function build(ctx: SetContext): void {
  streetDressing(ctx);
  shophouseRows(ctx, { north: true, east: true, west: true, close: -0.6 });
}

export const AJEGUNLE_SET: ArenaSet = {
  build,
  crowd: 0.6,
  crowdEdges: { north: true, east: true, west: true, south: true },
};

/** Placeholder floor: worn concrete with faint tile seams. */
export const AJEGUNLE_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  noiseFill(g, w, h, [176, 170, 160], 18, 7);
  noiseFill(rg, w, h, [210, 210, 210], 20, 9);
  seams(g, cols, rows, 'rgba(20,18,16,0.4)', 3);
  void makeCanvas;
};
