/**
 * City Rumble: a whole Lagos district under hazy afternoon light.
 *
 * Presentation only (the grid, roads and hazards are `src/sim/arenas`). This module owns the arena's
 * light (RUMBLE_LOOK), its surroundings (RUMBLE_SET) and its playfield floor (RUMBLE_FLOOR).
 * Every set follows the rules in `common.ts`: nothing on the board, the camera (south) side stays low.
 */
import type { ArenaLook } from '../arenaLook';
import type { ArenaSet, SetContext } from './common';
import { T, makeCanvas, noiseFill, seams } from './floorKit';
import type { FloorDrawer } from './floorKit';
import { shophouseRows, streetDressing } from './shared';

export const RUMBLE_LOOK: ArenaLook = {
  sky: 0x8a7660,
  fog: { color: 0x7e6c58, near: 22, far: 80 },
  sun: { color: 0xffc088, intensity: 3.6, position: [-12, 22, 14] },
  hemi: { sky: 0xd0b898, ground: 0x584634, intensity: 0.95 },
  envIntensity: 0.45,
  exposure: 1.06,
  floorTint: 0xb8ae9e,
  pillarTint: 0xc6bcac,
  softTint: 0xc2b4a4,
  slab: 0x6c6458,
  street: 0x26221e,
  grit: { tone: 0x78624c, dirt: 0x5a4c3c, dust: 0x8c7a64 },
  lamps: [
      [-9.2, 3.0, -0.8, 0xffa04a],
      [9.2, 3.0, 1.2, 0xffa04a],
    ],
};

function build(ctx: SetContext): void {
  streetDressing(ctx);
  shophouseRows(ctx, { north: true, east: true, west: true });
}

export const RUMBLE_SET: ArenaSet = {
  build,
  crowd: 0.6,
  crowdEdges: { north: true, east: true, west: true, south: true },
};

/** Placeholder floor: worn concrete with faint tile seams. */
export const RUMBLE_FLOOR: FloorDrawer = (g, rg, cols, rows) => {
  const w = cols * T;
  const h = rows * T;
  noiseFill(g, w, h, [184, 174, 158], 18, 7);
  noiseFill(rg, w, h, [210, 210, 210], 20, 9);
  seams(g, cols, rows, 'rgba(20,18,16,0.4)', 3);
  void makeCanvas;
};
