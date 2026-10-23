/**
 * Surulere Power Yard: a generator and transformer compound under hard, clear midday sun.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (POWER_YARD_LOOK), its surroundings (POWER_YARD_SET) and its playfield floor (POWER_YARD_FLOOR).
 * Every set follows the rules in `common.ts`: nothing on the board, the camera (south) side stays low.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { T, makeCanvas, noiseFill, seams } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { shophouseRows, streetDressing } from './shared';

export const POWER_YARD_LOOK: ArenaLook = {
  sky: 0x9cbcd6,
  fog: { color: 0xa8bacb, near: 18, far: 70 },
  sun: { color: 0xfffaf0, intensity: 4.4, position: [4, 20, 5] },
  hemi: { sky: 0xdce6ee, ground: 0x5a5248, intensity: 1.05 },
  envIntensity: 0.5,
  exposure: 1.12,
  floorTint: 0xc8c2b6,
  pillarTint: 0xd6d0c4,
  softTint: 0xccc0ae,
  slab: 0x7a746a,
  street: 0x302c28,
  grit: { tone: 0x7e7466, dirt: 0x5a5044, dust: 0x9c9284 },
  lamps: [
      [-9.2, 3.0, -0.8, 0xffa04a],
      [9.2, 3.0, 1.2, 0xffa04a],
    ],
};

function build(ctx: SetContext): void {
  streetDressing(ctx);
  shophouseRows(ctx, { north: true, east: true, west: true });
}

export const POWER_YARD_SET: ArenaSet = {
  build,
  crowd: 0.6,
  crowdEdges: { north: true, east: true, west: true, south: true },
};

/** Placeholder floor: worn concrete with faint tile seams. */
export const POWER_YARD_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  noiseFill(g, w, h, [200, 194, 182], 18, 7);
  noiseFill(rg, w, h, [210, 210, 210], 20, 9);
  seams(g, cols, rows, 'rgba(20,18,16,0.4)', 3);
  void makeCanvas;
};
